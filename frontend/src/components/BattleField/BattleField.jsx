import React, { useState, useEffect } from 'react';
import { API_BASE_URL } from '../../config/config';
import { getImageUrl } from '../../services/api';
import SoundManager from './SoundManager';
import BattleSystemUI from './BattleSystemUI';
import MovementPhaseUI from './MovementPhaseUI';
import { TriggerEffectProcessor } from './TriggerSystemUI';
import { AnimationManager, createPhaseChangeAnimation, createDamageAnimation } from './AnimationSystem';
import UnionArenaGameManager from '../../utils/unionArenaGameSystems';
import EffectProcessor from '../../utils/effectProcessor';
import LLMService from '../../utils/llmService';
import { 
  UNION_ARENA_PHASES, 
  PHASE_DISPLAY_NAMES,
  UnionArenaPhaseManager,
  UnionArenaEnergyManager,
  UnionArenaLifeManager,
  VictoryConditionChecker,
  GAME_CONSTANTS
} from '../../utils/unionArenaConstants';
import AIOpponent, { AI_DIFFICULTY, AI_STRATEGY } from '../../utils/aiOpponentSystem';
import './BattleField.css';

const BattleField = ({ selectedDeck, duelMode, onBackToMenu }) => {
  // 正式ルールに基づくゲーム管理システム
  const [gameManager] = useState(() => new UnionArenaGameManager());
  const [phaseManager] = useState(() => new UnionArenaPhaseManager());
  const [energyManager] = useState(() => new UnionArenaEnergyManager());
  const [effectProcessor, setEffectProcessor] = useState(null);
  const [playerLifeManager] = useState(() => new UnionArenaLifeManager(GAME_CONSTANTS.INITIAL_LIFE));
  const [opponentLifeManager] = useState(() => new UnionArenaLifeManager(GAME_CONSTANTS.INITIAL_LIFE));
  const [victoryChecker] = useState(() => new VictoryConditionChecker(playerLifeManager, opponentLifeManager));
  const [soundManager] = useState(() => new SoundManager());
  const [aiOpponent] = useState(() => new AIOpponent(
    duelMode === 'computer' ? AI_DIFFICULTY.NORMAL : AI_DIFFICULTY.EASY,
    AI_STRATEGY.BALANCED
  ));
  const [animationManager] = useState(() => new AnimationManager());
  const [triggerProcessor, setTriggerProcessor] = useState(null);
  
  const [gameState, setGameState] = useState({
    playerHand: [],
    playerDeck: [],
    playerFrontLine: [null, null, null, null], // 前列：最大4枚
    playerEnergyLine: [null, null, null, null], // エナジーライン：最大4枚
    opponentFrontLine: [null, null, null, null],
    opponentEnergyLine: [null, null, null, null],
    opponentHand: [],
    opponentDeck: [],
    currentTurn: 'player',
    turnNumber: 1,
    gamePhase: UNION_ARENA_PHASES.START,
    playerEnergy: { red: 0, blue: 0, green: 0, yellow: 0, purple: 0 },
    opponentEnergy: { red: 0, blue: 0, green: 0, yellow: 0, purple: 0 },
    playerGraveyard: [],
    opponentGraveyard: []
  });

  const [selectedCard, setSelectedCard] = useState(null);
  const [battleLog, setBattleLog] = useState([]);
  const [gameOver, setGameOver] = useState(null);
  const [cardDetails, setCardDetails] = useState({});
  const [hoveredCard, setHoveredCard] = useState(null);
  const [aiThinking, setAiThinking] = useState(false);
  const [gameInitialized, setGameInitialized] = useState(false);
  const [highlightedSlots, setHighlightedSlots] = useState([]);
  const [showCardPreview, setShowCardPreview] = useState(false);
  const [previewCard, setPreviewCard] = useState(null);
  const [showTutorial, setShowTutorial] = useState(false);
  const [tutorialStep, setTutorialStep] = useState(0);
  
  // ドラッグ&ドロップ状態
  const [draggedCard, setDraggedCard] = useState(null);
  const [draggedCardSource, setDraggedCardSource] = useState(null);
  const [dragOverSlot, setDragOverSlot] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  
  // 墓地表示状態
  const [showPlayerGraveyard, setShowPlayerGraveyard] = useState(false);
  const [showOpponentGraveyard, setShowOpponentGraveyard] = useState(false);
  
  // バトルシステム状態
  const [battleState, setBattleState] = useState({
    battleInProgress: false,
    attackingCharacter: null,
    blockingCharacter: null,
    attackingPlayer: null,
    defendingPlayer: null
  });

  // AP管理状態
  const [apState, setApState] = useState({
    current: GAME_CONSTANTS.INITIAL_AP,
    max: GAME_CONSTANTS.INITIAL_AP,
    usedThisTurn: 0
  });

  // バトル関連の関数
  const handleAttack = (attacker, attackerPosition) => {
    try {
      if (!gameManager.apSystem.canPerformAction(parseInt(attacker.ap) || 1)) {
        addBattleLog('APが不足しています');
        soundManager.playSFX('error');
        return;
      }

      const result = gameManager.battleSystem.declareAttack(attacker, 'opponent');
      
      setBattleState({
        battleInProgress: true,
        attackingCharacter: attacker,
        blockingCharacter: null,
        attackingPlayer: 'player',
        defendingPlayer: 'opponent'
      });

      // APを消費
      gameManager.apSystem.useAP(parseInt(attacker.ap) || 1);
      setApState(gameManager.apSystem.getAPStatus());

      // キャラクターをレスト状態にする
      const newFrontLine = [...gameState.playerFrontLine];
      newFrontLine[attackerPosition] = { ...attacker, isResting: true };
      
      setGameState(prev => ({
        ...prev,
        playerFrontLine: newFrontLine
      }));

      addBattleLog(result.message);
      soundManager.playSFX('attack');
    } catch (error) {
      addBattleLog(error.message);
      soundManager.playSFX('error');
    }
  };

  const handleBlock = (blocker, blockerPosition, attacker) => {
    try {
      const result = gameManager.battleSystem.declareBlock(blocker, attacker);
      
      setBattleState(prev => ({
        ...prev,
        blockingCharacter: blocker
      }));

      // キャラクターをレスト状態にする
      const newFrontLine = [...gameState.opponentFrontLine];
      newFrontLine[blockerPosition] = { ...blocker, isResting: true };
      
      setGameState(prev => ({
        ...prev,
        opponentFrontLine: newFrontLine
      }));

      addBattleLog(result.message);
      soundManager.playSFX('block');
    } catch (error) {
      addBattleLog(error.message);
      soundManager.playSFX('error');
    }
  };

  const handleResolveBattle = () => {
    try {
      const result = gameManager.battleSystem.resolveBattle();
      
      // バトル結果を適用
      if (result.attackerDestroyed) {
        // 攻撃キャラクター破壊
        const attackerPos = gameState.playerFrontLine.findIndex(
          char => char?.uniqueId === battleState.attackingCharacter.uniqueId
        );
        if (attackerPos !== -1) {
          const newFrontLine = [...gameState.playerFrontLine];
          newFrontLine[attackerPos] = null;
          setGameState(prev => ({ ...prev, playerFrontLine: newFrontLine }));
        }
      }

      if (result.blockerDestroyed) {
        // ブロックキャラクター破壊
        const blockerPos = gameState.opponentFrontLine.findIndex(
          char => char?.uniqueId === battleState.blockingCharacter.uniqueId
        );
        if (blockerPos !== -1) {
          const newFrontLine = [...gameState.opponentFrontLine];
          newFrontLine[blockerPos] = null;
          setGameState(prev => ({ ...prev, opponentFrontLine: newFrontLine }));
        }
      }

      if (result.damageToPlayer > 0) {
        // プレイヤーにダメージ
        const damageResult = gameManager.processDamage(
          opponentLifeManager, 
          result.damageToPlayer, 
          gameState.opponentDeck
        );
        addBattleLog(`対戦相手に${result.damageToPlayer}ダメージ`);
        
        if (damageResult.triggersActivated.length > 0) {
          addBattleLog(`${damageResult.triggersActivated.length}個のトリガーが発動！`);
        }
      }

      addBattleLog(result.message);
      soundManager.playSFX('battle_resolve');

      // バトル状態をリセット
      setBattleState({
        battleInProgress: false,
        attackingCharacter: null,
        blockingCharacter: null,
        attackingPlayer: null,
        defendingPlayer: null
      });
    } catch (error) {
      addBattleLog(error.message);
      soundManager.playSFX('error');
    }
  };

  const handleCancelBattle = () => {
    gameManager.battleSystem.resetBattle();
    
    setBattleState({
      battleInProgress: false,
      attackingCharacter: null,
      blockingCharacter: null,
      attackingPlayer: null,
      defendingPlayer: null
    });

    addBattleLog('バトルがキャンセルされました');
    soundManager.playSFX('cancel');
  };

  // Movement Phase関連の関数
  const handleMoveCharacter = (fromLine, fromPosition, toLine, toPosition) => {
    try {
      const fromLineArray = fromLine === 'front' ? gameState.playerFrontLine : gameState.playerEnergyLine;
      const toLineArray = toLine === 'front' ? gameState.playerFrontLine : gameState.playerEnergyLine;
      
      const character = fromLineArray[fromPosition];
      if (!character) {
        throw new Error('移動するキャラクターが見つかりません');
      }

      // Front LineからEnergy Lineへの移動は▼Step▼能力が必要
      if (fromLine === 'front' && toLine === 'energy') {
        const cardDetail = cardDetails[character.card_id]?.data;
        if (!cardDetail?.能力?.includes('▼Step▼')) {
          throw new Error('このキャラクターは▼Step▼能力を持たないため、エナジーラインに移動できません');
        }
      }

      if (toLineArray[toPosition] !== null) {
        throw new Error('移動先にはすでにキャラクターがいます');
      }

      // 移動実行
      const newFromLine = [...fromLineArray];
      const newToLine = [...toLineArray];
      
      newFromLine[fromPosition] = null;
      newToLine[toPosition] = character;

      if (fromLine === 'front' && toLine === 'energy') {
        setGameState(prev => ({
          ...prev,
          playerFrontLine: newFromLine,
          playerEnergyLine: newToLine
        }));
      } else if (fromLine === 'energy' && toLine === 'front') {
        setGameState(prev => ({
          ...prev,
          playerEnergyLine: newFromLine,
          playerFrontLine: newToLine
        }));
      } else if (fromLine === toLine) {
        // 同じライン内での移動
        if (fromLine === 'front') {
          setGameState(prev => ({ ...prev, playerFrontLine: newFromLine }));
        } else {
          setGameState(prev => ({ ...prev, playerEnergyLine: newFromLine }));
        }
      }

      addBattleLog(`${character.name}を移動しました`);
      soundManager.playSFX('move');
    } catch (error) {
      addBattleLog(error.message);
      soundManager.playSFX('error');
    }
  };

  // カード詳細情報を取得
  const fetchCardDetails = async (cardId) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/cards/${cardId}`);
      if (response.ok) {
        const cardData = await response.json();
        return cardData;
      }
    } catch (error) {
      console.error('Error fetching card details:', error);
    }
    return null;
  };

  // デッキ初期化
  useEffect(() => {
    if (selectedDeck && selectedDeck.cards) {
      console.log('BattleField: Initializing deck with:', selectedDeck);
      console.log('BattleField: Deck cards:', selectedDeck.cards);
      
      // デッキ検証
      if (!Array.isArray(selectedDeck.cards) || selectedDeck.cards.length === 0) {
        console.error('BattleField: Invalid deck - no cards found');
        addBattleLog('エラー: デッキにカードがありません');
        return;
      }
      
      if (selectedDeck.cards.length < 40) {
        addBattleLog('警告: デッキが40枚未満です');
      }
      
      // 実際のデータ構造に合わせて処理
      // cards配列の各アイテムは個別のカードインスタンス
      const expandedDeck = selectedDeck.cards.map((card, index) => ({
        ...card,
        uniqueId: `${card.card_id}_${index}`,
        isResting: false,
        isSummoningSick: false
      }));

      console.log('BattleField: Expanded deck:', expandedDeck);

      const shuffledDeck = [...expandedDeck].sort(() => Math.random() - 0.5);
      const initialHand = shuffledDeck.slice(0, 7);
      const remainingDeck = shuffledDeck.slice(7);
      
      // AI用デッキも実際のカードで構築
      const aiDeck = [...expandedDeck].sort(() => Math.random() - 0.5);
      const aiInitialHand = aiDeck.slice(0, 7).map((card, index) => ({
        ...card,
        uniqueId: `ai_${card.card_id}_${index}`,
        isResting: false,
        isSummoningSick: false
      }));
      const aiRemainingDeck = aiDeck.slice(7).map((card, index) => ({
        ...card,
        uniqueId: `ai_${card.card_id}_${index + 7}`,
        isResting: false,
        isSummoningSick: false
      }));
      
      console.log('BattleField: Initial hand:', initialHand);
      console.log('BattleField: Remaining deck length:', remainingDeck.length);
      console.log('BattleField: AI hand initialized:', aiInitialHand.length);
      console.log('BattleField: AI deck initialized:', aiRemainingDeck.length);
      
      setGameState(prev => ({
        ...prev,
        playerHand: initialHand,
        playerDeck: remainingDeck,
        opponentHand: aiInitialHand,
        opponentDeck: aiRemainingDeck
      }));

      // 初期化完了フラグを設定
      setGameInitialized(true);
      console.log('BattleField: Game initialization completed');

      // ゲームマネージャーのセットアップ
      gameManager.setGameState(gameState);
      gameManager.setCardDetailProvider((card) => cardDetails[card.card_id]);

      // カード詳細情報を取得
      const fetchAllCardDetails = async () => {
        const details = {};
        const uniqueCardIds = [...new Set(expandedDeck.map(card => card.card_id))];
        
        console.log('BattleField: Fetching details for unique cards:', uniqueCardIds);
        
        for (const cardId of uniqueCardIds) {
          const cardDetail = await fetchCardDetails(cardId);
          if (cardDetail) {
            details[cardId] = cardDetail;
          }
        }
        
        console.log('BattleField: Card details loaded:', details);
        setCardDetails(details);
      };
      
      fetchAllCardDetails();

      addBattleLog(`Union Arena ${getModeDisplayName(duelMode)}開始！`);
      addBattleLog(`デッキ「${selectedDeck.name}」で対戦します`);
      addBattleLog(`デッキ枚数: ${expandedDeck.length}枚`);
      addBattleLog(`ライフ: プレイヤー ${playerLifeManager.getCurrentLife()}, 対戦相手 ${opponentLifeManager.getCurrentLife()}`);
      soundManager.playSFX('success');
      soundManager.playBGM('battle');
    }

    return () => {
      soundManager.stopBGM();
      soundManager.cleanup();
      setGameInitialized(false); // 次回のゲーム開始に備えてリセット
    };
  }, [selectedDeck, duelMode]); // eslint-disable-line react-hooks/exhaustive-deps

  // エナジー計算の更新
  useEffect(() => {
    const playerEnergy = energyManager.calculateEnergyFromLine(
      gameState.playerEnergyLine.map(card => {
        if (!card) return null;
        const cardDetail = cardDetails[card.card_id]?.data;
        return { ...card, generatedEnergy: cardDetail?.発生エナジー || '' };
      }).filter(Boolean)
    );
    
    const opponentEnergy = energyManager.calculateEnergyFromLine(
      gameState.opponentEnergyLine.map(card => {
        if (!card) return null;
        const cardDetail = cardDetails[card.card_id]?.data;
        return { ...card, generatedEnergy: cardDetail?.発生エナジー || '' };
      }).filter(Boolean)
    );
    
    // エナジーが変更された場合の視覚的フィードバック
    const prevPlayerEnergy = gameState.playerEnergy;
    const energyChanged = JSON.stringify(prevPlayerEnergy) !== JSON.stringify(playerEnergy);
    
    setGameState(prev => ({
      ...prev,
      playerEnergy,
      opponentEnergy,
      energyUpdateTimestamp: energyChanged ? Date.now() : prev.energyUpdateTimestamp
    }));
    
    // エナジーが変更された場合のログ出力
    if (energyChanged) {
      console.log('エナジー更新:', { 前: prevPlayerEnergy, 後: playerEnergy });
      addBattleLog(`エナジー更新: ${Object.entries(playerEnergy).map(([color, amount]) => `${color}${amount}`).join(' ')}`);
    }
  }, [gameState.playerEnergyLine, gameState.opponentEnergyLine, cardDetails, energyManager]);

  // エナジー更新インジケーターの自動非表示
  useEffect(() => {
    if (gameState.energyUpdateTimestamp) {
      const timer = setTimeout(() => {
        setGameState(prev => ({
          ...prev,
          energyUpdateTimestamp: null
        }));
      }, 3000); // 3秒後に非表示

      return () => clearTimeout(timer);
    }
  }, [gameState.energyUpdateTimestamp]);

  // 勝利条件チェック
  useEffect(() => {
    // ゲームが初期化されていない場合はチェックしない
    if (!gameInitialized) {
      console.log('BattleField: Skipping victory check - game not initialized yet');
      return;
    }
    
    // ゲームが開始されていない場合はチェックしない
    if (gameState.turnNumber === 1 && gameState.playerDeck.length === 0) {
      console.log('BattleField: Skipping victory check - deck not ready yet');
      return;
    }
    
    const playerLife = playerLifeManager.getCurrentLife();
    const opponentLife = opponentLifeManager.getCurrentLife();
    const playerDeckLength = gameState.playerDeck.length;
    const opponentDeckLength = gameState.opponentDeck.length;
    
    console.log('BattleField: Victory check - Player deck:', playerDeckLength, 'Opponent deck:', opponentDeckLength);
    console.log('BattleField: Victory check - Player life:', playerLife, 'Opponent life:', opponentLife);
    
    const victoryResult = victoryChecker.checkVictoryConditions(gameState.playerDeck, gameState.opponentDeck);
    if (victoryResult) {
      console.log('BattleField: Victory condition met:', victoryResult);
      setGameOver(victoryResult);
      addBattleLog(victoryResult.message);
      
      if (victoryResult.winner === 'player') {
        soundManager.playSFX('victory');
        soundManager.playBGM('victory');
      } else {
        soundManager.playSFX('defeat');
        soundManager.playBGM('defeat');
      }
    }
  }, [gameInitialized, playerLifeManager, opponentLifeManager, gameState.playerDeck, gameState.opponentDeck, gameState.turnNumber, victoryChecker, soundManager]);

  // AI対戦相手のターン処理
  useEffect(() => {
    if (gameState.currentTurn === 'opponent' && !gameOver && (duelMode === 'computer' || duelMode === 'test') && gameInitialized) {
      // 少し遅延を入れてからAI処理を開始
      const aiTurnTimeout = setTimeout(() => {
        handleAITurn();
      }, 800);
      
      return () => clearTimeout(aiTurnTimeout);
    }
  }, [gameState.currentTurn, gameState.gamePhase, gameOver, duelMode, gameInitialized]); // eslint-disable-line react-hooks/exhaustive-deps

  // AI対戦相手のターン処理
  const handleAITurn = async () => {
    if (aiThinking) return;
    
    setAiThinking(true);
    addBattleLog('対戦相手が思考中...');
    
    try {
      const decision = await aiOpponent.makeDecision(gameState, gameState.gamePhase, cardDetails);
      
      // 決定が有効かチェック
      if (!decision || !decision.action) {
        console.warn('AI returned invalid decision:', decision);
        addBattleLog('対戦相手がパスしました');
        setTimeout(() => {
          nextPhase();
        }, 1000);
        return;
      }
      
      await executeAIDecision(decision);
      
    } catch (error) {
      console.error('AI decision error:', error);
      addBattleLog('対戦相手のターンでエラーが発生しました。パスします。');
      
      // エラー時は自動的にフェーズを進める
      setTimeout(() => {
        if (gameState.gamePhase === UNION_ARENA_PHASES.END) {
          endTurn();
        } else {
          nextPhase();
        }
      }, 1500);
    } finally {
      setAiThinking(false);
    }
  };

  // AI決定の実行
  const executeAIDecision = async (decision) => {
    switch (decision.action) {
      case 'draw':
        await simulateAIDraw();
        break;
      case 'play_card':
        await simulateAICardPlay(decision);
        break;
      case 'attack':
        await simulateAIAttack(decision);
        break;
      case 'move':
        await simulateAIMove(decision);
        break;
      case 'activate_effect':
        await simulateAIEffect(decision);
        break;
      case 'pass':
        // フェーズを進めるかターンを終了
        if (gameState.gamePhase === UNION_ARENA_PHASES.END) {
          setTimeout(() => {
            endTurn();
          }, 1000);
        } else {
          setTimeout(() => {
            nextPhase();
          }, 800);
        }
        break;
      default:
        addBattleLog('対戦相手がパスしました');
        setTimeout(() => {
          nextPhase();
        }, 500);
    }
  };

  // AIドローシミュレーション
  const simulateAIDraw = async () => {
    if (gameState.opponentDeck.length > 0) {
      // 実際のカードをドロー
      const drawnCard = gameState.opponentDeck[0];
      
      setGameState(prev => ({
        ...prev,
        opponentHand: [...prev.opponentHand, drawnCard],
        opponentDeck: prev.opponentDeck.slice(1)
      }));
      
      addBattleLog(`対戦相手が${drawnCard.name}をドローしました`);
      soundManager.playSFX('draw');
      
      // 少し待ってから次のフェーズへ
      setTimeout(() => {
        nextPhase();
      }, 1000);
    }
  };

  // AIカード配置シミュレーション
  const simulateAICardPlay = async (decision) => {
    const { card, line, position } = decision;
    
    // 手札から実際のカードを使用
    const cardToPlay = gameState.opponentHand.find(handCard => 
      handCard.card_id === card.card_id
    );
    
    if (!cardToPlay) {
      console.error('AI tried to play a card not in hand:', card);
      return;
    }
    
    // カードに適切な状態を設定
    const playedCard = {
      ...cardToPlay,
      isResting: false,
      isSummoningSick: line === 'front' // フロントラインに配置された場合のみサモニングシック
    };
    
    if (line === 'front') {
      const newFrontLine = [...gameState.opponentFrontLine];
      newFrontLine[position] = playedCard;
      setGameState(prev => ({
        ...prev,
        opponentFrontLine: newFrontLine,
        opponentHand: prev.opponentHand.filter(handCard => handCard.uniqueId !== cardToPlay.uniqueId)
      }));
    } else if (line === 'energy') {
      const newEnergyLine = [...gameState.opponentEnergyLine];
      newEnergyLine[position] = playedCard;
      setGameState(prev => ({
        ...prev,
        opponentEnergyLine: newEnergyLine,
        opponentHand: prev.opponentHand.filter(handCard => handCard.uniqueId !== cardToPlay.uniqueId)
      }));
    }
    
    addBattleLog(`対戦相手が${cardToPlay.name}を${line === 'front' ? 'フロントライン' : 'エナジーライン'}に配置しました`);
    soundManager.playSFX('card_play');
  };

  // AI攻撃シミュレーション
  const simulateAIAttack = async (decision) => {
    const { attacker, attackerPosition } = decision;
    
    addBattleLog(`対戦相手の${attacker.name}が攻撃を宣言しました`);
    soundManager.playSFX('attack');
    
    // 攻撃処理（簡略化）
    setTimeout(async () => {
      // ダイレクトアタックとして処理（トリガーチェック付き）
      try {
        // ライフにダメージ処理
        const cardsToLife = playerLifeManager.takeDamage(1, gameState.playerDeck);
        
        // デッキからライフエリアに移したカードを更新
        setGameState(prev => ({
          ...prev,
          playerDeck: prev.playerDeck.slice(1) // ダメージ分デッキから減らす
        }));
        
        addBattleLog('プレイヤーに1ダメージ');
        
        // トリガーチェック（ライフエリアに移ったカードをチェック）
        if (cardsToLife.length > 0) {
          const triggeredCards = [];
          cardsToLife.forEach(card => {
            const cardDetail = cardDetails[card.card_id]?.data;
            if (cardDetail?.能力?.includes('[Trigger]') || cardDetail?.能力?.includes('▼Final▼')) {
              triggeredCards.push(card);
            }
          });
          
          if (triggeredCards.length > 0) {
            addBattleLog(`${triggeredCards.length}個のトリガーが発動！`);
            // トリガー効果の処理（簡略化）
            triggeredCards.forEach(triggerCard => {
              addBattleLog(`${triggerCard.name}のトリガー効果発動`);
            });
          }
        }
        
        // ダメージアニメーション
        const playerLifeElement = document.querySelector('.player-life-fill');
        if (playerLifeElement) {
          animationManager.queueAnimation(createDamageAnimation(1, playerLifeElement, '#ff4757'));
        }
        
        // 攻撃キャラクターをレスト状態にする
        const newFrontLine = [...gameState.opponentFrontLine];
        newFrontLine[attackerPosition] = { ...attacker, isResting: true };
        setGameState(prev => ({ ...prev, opponentFrontLine: newFrontLine }));
        
      } catch (error) {
        console.error('AI攻撃処理エラー:', error);
        addBattleLog('プレイヤーに1ダメージ');
        
        // 攻撃キャラクターをレスト状態にする
        const newFrontLine = [...gameState.opponentFrontLine];
        newFrontLine[attackerPosition] = { ...attacker, isResting: true };
        setGameState(prev => ({ ...prev, opponentFrontLine: newFrontLine }));
      }
      
    }, 1500);
  };

  // AI移動シミュレーション
  const simulateAIMove = async (decision) => {
    const { from, to } = decision;
    
    const fromLineArray = from.line === 'front' ? gameState.opponentFrontLine : gameState.opponentEnergyLine;
    const toLineArray = to.line === 'front' ? gameState.opponentFrontLine : gameState.opponentEnergyLine;
    
    const character = fromLineArray[from.position];
    if (character) {
      const newFromLine = [...fromLineArray];
      const newToLine = [...toLineArray];
      
      newFromLine[from.position] = null;
      newToLine[to.position] = character;
      
      if (from.line === 'front' && to.line === 'energy') {
        setGameState(prev => ({
          ...prev,
          opponentFrontLine: newFromLine,
          opponentEnergyLine: newToLine
        }));
      } else if (from.line === 'energy' && to.line === 'front') {
        setGameState(prev => ({
          ...prev,
          opponentEnergyLine: newFromLine,
          opponentFrontLine: newToLine
        }));
      }
      
      addBattleLog(`対戦相手が${character.name}を移動しました`);
      soundManager.playSFX('move');
    }
  };

  // AI効果使用シミュレーション
  const simulateAIEffect = async (decision) => {
    const { card } = decision;
    
    addBattleLog(`対戦相手が${card.name}の効果を使用しました`);
    soundManager.playSFX('effect');
  };

  const getModeDisplayName = (mode) => {
    switch (mode) {
      case 'online': return 'オンライン対戦';
      case 'computer': return 'コンピュータ対戦';
      case 'test': return 'テストモード';
      default: return 'デュエル';
    }
  };

  const addBattleLog = (message) => {
    setBattleLog(prev => [...prev, { id: Date.now(), message, timestamp: new Date() }]);
  };

  const clearBattleLog = () => {
    setBattleLog([]);
    addBattleLog('バトルログをクリアしました');
  };

  // EffectProcessorの初期化
  useEffect(() => {
    if (!effectProcessor) {
      setEffectProcessor(new EffectProcessor(
        {
          getGameState: () => gameState,
          updateGameState: (updates) => setGameState(prev => ({ ...prev, ...updates }))
        },
        addBattleLog
      ));
    }
  }, [effectProcessor]);

  // 墓地関連の関数
  const addToGraveyard = (card, player) => {
    setGameState(prev => ({
      ...prev,
      [player === 'player' ? 'playerGraveyard' : 'opponentGraveyard']: [
        ...prev[player === 'player' ? 'playerGraveyard' : 'opponentGraveyard'],
        { ...card, graveyardTimestamp: Date.now() }
      ]
    }));
    
    addBattleLog(`${card.name}が墓地に送られました`);
  };

  // TriggerEffectProcessor の初期化
  useEffect(() => {
    if (!triggerProcessor) {
      setTriggerProcessor(new TriggerEffectProcessor(
        gameManager, gameState, setGameState, addBattleLog, soundManager
      ));
    }
  }, [gameManager, gameState, soundManager]); // eslint-disable-line react-hooks/exhaustive-deps

  // カードを手札からプレイ
  const playCardFromHand = (card, lineType, position) => {
    const cardDetail = cardDetails[card.card_id];
    const requiredEnergy = energyManager.parseGeneratedEnergy(cardDetail?.必要エナジー || '');
    
    if (!energyManager.canPayCost(requiredEnergy, gameState.playerEnergy)) {
      addBattleLog('エナジーが不足しています');
      soundManager.playSFX('error');
      return;
    }

    if (lineType === 'front') {
      if (gameState.playerFrontLine[position] !== null) {
        addBattleLog('そのスロットには既にカードが配置されています');
        soundManager.playSFX('error');
        return;
      }
      
      const newFrontLine = [...gameState.playerFrontLine];
      newFrontLine[position] = card;
      
      setGameState(prev => ({
        ...prev,
        playerFrontLine: newFrontLine,
        playerHand: prev.playerHand.filter(c => c.uniqueId !== card.uniqueId)
      }));
      
      addBattleLog(`${card.name}をフロントライン${position + 1}に配置しました`);
      
      // 登場時効果の処理
      setTimeout(() => {
        if (effectProcessor) {
          effectProcessor.processOnPlayEffects(card, cardDetails, lineType, position, 'player');
        }
      }, 100);
    } else if (lineType === 'energy') {
      if (gameState.playerEnergyLine[position] !== null) {
        addBattleLog('そのスロットには既にカードが配置されています');
        soundManager.playSFX('error');
        return;
      }
      
      const newEnergyLine = [...gameState.playerEnergyLine];
      newEnergyLine[position] = card;
      
      setGameState(prev => ({
        ...prev,
        playerEnergyLine: newEnergyLine,
        playerHand: prev.playerHand.filter(c => c.uniqueId !== card.uniqueId)
      }));
      
      addBattleLog(`${card.name}をエナジーライン${position + 1}に配置しました`);
      
      // 登場時効果の処理（エナジーラインでも効果が発動する場合）
      setTimeout(() => {
        if (effectProcessor) {
          effectProcessor.processOnPlayEffects(card, cardDetails, lineType, position, 'player');
        }
      }, 100);
    }
    
    soundManager.playSFX('success');
    setSelectedCard(null);
  };

  // カードドロー
  const drawCard = () => {
    if (!phaseManager.canPerformAction('draw')) {
      addBattleLog('スタートフェーズでのみカードをドローできます');
      soundManager.playSFX('warning');
      return;
    }

    if (gameState.playerDeck.length === 0) {
      addBattleLog('デッキが空です');
      soundManager.playSFX('error');
      return;
    }

    const drawnCard = gameState.playerDeck[0];
    const newDeck = gameState.playerDeck.slice(1);
    const newHand = [...gameState.playerHand, drawnCard];

    setGameState(prev => ({
      ...prev,
      playerHand: newHand,
      playerDeck: newDeck
    }));

    addBattleLog(`${drawnCard.name}をドローしました`);
    soundManager.playSFX('success');
  };

  // フェーズ進行
  const nextPhase = () => {
    const nextPhase = phaseManager.nextPhase();
    
    setGameState(prev => ({
      ...prev,
      gamePhase: nextPhase
    }));

    // フェーズ変更アニメーション
    const phaseColors = {
      [UNION_ARENA_PHASES.START]: '#4ecdc4',
      [UNION_ARENA_PHASES.MOVEMENT]: '#45b7d1', 
      [UNION_ARENA_PHASES.MAIN]: '#f39c12',
      [UNION_ARENA_PHASES.END]: '#e74c3c'
    };
    
    animationManager.queueAnimation(createPhaseChangeAnimation(
      PHASE_DISPLAY_NAMES[nextPhase],
      phaseColors[nextPhase]
    ));

    // フェーズ開始時の処理
    if (nextPhase === UNION_ARENA_PHASES.START) {
      gameManager.startTurn(gameState.currentTurn === 'player' ? 'プレイヤー' : '対戦相手');
      setApState(gameManager.apSystem.getAPStatus());
    } else if (nextPhase === UNION_ARENA_PHASES.MOVEMENT) {
      // 全キャラクターをアクティブ状態にする
      setGameState(prev => ({
        ...prev,
        playerFrontLine: prev.playerFrontLine.map(char => 
          char ? { ...char, isResting: false } : null
        ),
        playerEnergyLine: prev.playerEnergyLine.map(char => 
          char ? { ...char, isResting: false } : null
        ),
        opponentFrontLine: prev.opponentFrontLine.map(char => 
          char ? { ...char, isResting: false } : null
        ),
        opponentEnergyLine: prev.opponentEnergyLine.map(char => 
          char ? { ...char, isResting: false } : null
        )
      }));
    }

    addBattleLog(`フェーズが${PHASE_DISPLAY_NAMES[nextPhase]}に進みました`);
    soundManager.playSFX('success');
  };

  // ターン終了
  const endTurn = () => {
    if (gameState.gamePhase !== UNION_ARENA_PHASES.END) {
      addBattleLog('エンドフェーズまで進めてからターン終了してください');
      soundManager.playSFX('warning');
      return;
    }

    // 手札制限チェック（8枚まで）
    if (gameState.playerHand.length > 8) {
      addBattleLog('手札が8枚を超えています。8枚になるまで捨ててください');
      soundManager.playSFX('warning');
      return;
    }

    const newTurn = gameState.currentTurn === 'player' ? 'opponent' : 'player';
    const newTurnNumber = gameState.currentTurn === 'opponent' ? gameState.turnNumber + 1 : gameState.turnNumber;
    
    // ターン終了処理
    gameManager.endTurn(gameState.currentTurn === 'player' ? 'プレイヤー' : '対戦相手');
    
    // フェーズをリセット
    phaseManager.reset();
    
    // APを増加（2ターン目以降）
    if (newTurn === 'player' && newTurnNumber > 1) {
      gameManager.apSystem.increaseMaxAP(1);
    }
    
    setGameState(prev => ({
      ...prev,
      currentTurn: newTurn,
      turnNumber: newTurnNumber,
      gamePhase: UNION_ARENA_PHASES.START
    }));

    setApState(gameManager.apSystem.getAPStatus());

    addBattleLog(`ターン${newTurnNumber} - ${newTurn === 'player' ? 'あなた' : '相手'}のターン`);
    soundManager.playSFX('success');
  };

  const handleCardClick = (card) => {
    if (gameOver) return;
    
    if (gameState.currentTurn === 'player') {
      // ムーブメントフェーズでもカード選択を許可（詳細表示用）
      if (phaseManager.canPerformAction('playCard')) {
        setSelectedCard(card);
        setPreviewCard(card);
        setShowCardPreview(true);
        
        // 配置可能なスロットをハイライト
        const availableSlots = [];
        gameState.playerFrontLine.forEach((slot, index) => {
          if (slot === null) availableSlots.push({ type: 'front', index });
        });
        gameState.playerEnergyLine.forEach((slot, index) => {
          if (slot === null) availableSlots.push({ type: 'energy', index });
        });
        setHighlightedSlots(availableSlots);
        
        addBattleLog(`${card.name}を選択しました。配置先を選択してください。`);
        soundManager.playSFX('success');
      } else {
        // ムーブメントフェーズではカード詳細表示のみ
        setSelectedCard(card);
        setPreviewCard(card);
        setShowCardPreview(true);
        addBattleLog(`${card.name}の詳細を表示中`);
        soundManager.playSFX('success');
      }
    } else {
      addBattleLog(`${PHASE_DISPLAY_NAMES[gameState.gamePhase]}ではカードを配置できません`);
      soundManager.playSFX('warning');
    }
  };

  const handleLineSlotClick = (lineType, position) => {
    if (selectedCard && phaseManager.canPerformAction('playCard')) {
      playCardFromHand(selectedCard, lineType, position);
      // リセット処理
      setSelectedCard(null);
      setHighlightedSlots([]);
      setShowCardPreview(false);
      setPreviewCard(null);
    } else if (selectedCard && !phaseManager.canPerformAction('playCard')) {
      addBattleLog(`${PHASE_DISPLAY_NAMES[gameState.gamePhase]}ではカードを配置できません`);
      soundManager.playSFX('warning');
    }
  };

  // カード選択をキャンセル
  const handleCancelSelection = () => {
    setSelectedCard(null);
    setHighlightedSlots([]);
    setShowCardPreview(false);
    setPreviewCard(null);
    addBattleLog('カード選択をキャンセルしました');
  };

  // スロットがハイライト対象かチェック
  const isSlotHighlighted = (type, index) => {
    return highlightedSlots.some(slot => slot.type === type && slot.index === index);
  };

  // ドラッグ&ドロップイベントハンドラー
  const handleDragStart = (e, card, source) => {
    if (gameState.currentTurn !== 'player' || gameOver) {
      e.preventDefault();
      return;
    }

    setDraggedCard(card);
    setDraggedCardSource(source);
    setIsDragging(true);
    
    // ドラッグデータを設定
    e.dataTransfer.setData('text/plain', JSON.stringify({
      cardId: card.uniqueId,
      source: source
    }));
    e.dataTransfer.effectAllowed = 'move';

    // ドラッグ可能なスロットをハイライト
    const availableSlots = [];
    
    if (source.type === 'hand' && phaseManager.canPerformAction('playCard')) {
      // 手札からの配置
      gameState.playerFrontLine.forEach((slot, index) => {
        if (slot === null) availableSlots.push({ type: 'front', index });
      });
      gameState.playerEnergyLine.forEach((slot, index) => {
        if (slot === null) availableSlots.push({ type: 'energy', index });
      });
    } else if (source.type === 'field' && gameState.gamePhase === UNION_ARENA_PHASES.MOVEMENT) {
      // フィールドカードの移動
      if (source.line === 'front') {
        // フロントラインからエナジーラインへの移動（Step能力チェック）
        const cardDetail = cardDetails[card.card_id]?.data;
        if (cardDetail?.能力?.includes('▼Step▼')) {
          gameState.playerEnergyLine.forEach((slot, index) => {
            if (slot === null) availableSlots.push({ type: 'energy', index });
          });
        }
        // 同じライン内での移動
        gameState.playerFrontLine.forEach((slot, index) => {
          if (slot === null && index !== source.position) {
            availableSlots.push({ type: 'front', index });
          }
        });
      } else if (source.line === 'energy') {
        // エナジーラインからフロントラインへの移動
        gameState.playerFrontLine.forEach((slot, index) => {
          if (slot === null) availableSlots.push({ type: 'front', index });
        });
        // 同じライン内での移動
        gameState.playerEnergyLine.forEach((slot, index) => {
          if (slot === null && index !== source.position) {
            availableSlots.push({ type: 'energy', index });
          }
        });
      }
    }
    
    setHighlightedSlots(availableSlots);
    
    // ドラッグ画像をカスタマイズ
    setTimeout(() => {
      if (e.target) {
        e.target.classList.add('dragging');
      }
    }, 0);
  };

  const handleDragOver = (e, lineType, position) => {
    e.preventDefault();
    
    if (!isDragging || !draggedCard) return;
    
    // ドロップ可能かチェック
    const canDrop = isSlotHighlighted(lineType, position);
    
    e.dataTransfer.dropEffect = canDrop ? 'move' : 'none';
    
    // ドラッグオーバー状態を設定
    setDragOverSlot({ lineType, position, canDrop });
  };

  const handleDragLeave = (e) => {
    // 子要素への移動は無視
    if (e.currentTarget.contains(e.relatedTarget)) {
      return;
    }
    setDragOverSlot(null);
  };

  const handleDrop = (e, lineType, position) => {
    e.preventDefault();
    
    if (!draggedCard || !draggedCardSource) {
      return;
    }
    
    // ドロップ可能かチェック
    const canDrop = isSlotHighlighted(lineType, position);
    if (!canDrop) {
      addBattleLog('そこには配置できません');
      soundManager.playSFX('error');
      return;
    }

    try {
      if (draggedCardSource.type === 'hand') {
        // 手札からの配置
        playCardFromHand(draggedCard, lineType, position);
        addBattleLog(`${draggedCard.name}をドラッグ&ドロップで配置しました`);
      } else if (draggedCardSource.type === 'field') {
        // フィールドカードの移動
        handleMoveCharacter(
          draggedCardSource.line,
          draggedCardSource.position,
          lineType,
          position
        );
        addBattleLog(`${draggedCard.name}をドラッグ&ドロップで移動しました`);
      }
      
      soundManager.playSFX('success');
    } catch (error) {
      addBattleLog(error.message);
      soundManager.playSFX('error');
    }
  };

  const handleDragEnd = (e) => {
    // ドラッグ状態をリセット
    setDraggedCard(null);
    setDraggedCardSource(null);
    setDragOverSlot(null);
    setIsDragging(false);
    setHighlightedSlots([]);
    
    // ドラッグクラスを削除
    if (e.target) {
      e.target.classList.remove('dragging');
    }
  };

  // ドラッグ可能かチェック
  const isDragEnabled = (card, source) => {
    if (gameState.currentTurn !== 'player' || gameOver) return false;
    
    if (source.type === 'hand') {
      return phaseManager.canPerformAction('playCard');
    } else if (source.type === 'field') {
      return gameState.gamePhase === UNION_ARENA_PHASES.MOVEMENT;
    }
    
    return false;
  };

  // ドラッグオーバー時のスロットクラス名を取得
  const getDragOverClass = (lineType, position) => {
    if (!dragOverSlot || dragOverSlot.lineType !== lineType || dragOverSlot.position !== position) {
      return '';
    }
    
    return dragOverSlot.canDrop ? 'drag-valid' : 'drag-invalid';
  };

  // [Activate: Main]効果の使用
  const activateMainEffect = (card, lineType, position) => {
    if (gameState.currentTurn !== 'player' || !phaseManager.canPerformAction('activateMain')) {
      addBattleLog('メインフェーズでないと効果を使用できません');
      soundManager.playSFX('error');
      return;
    }

    const cardDetail = cardDetails[card.card_id]?.data;
    if (!cardDetail?.能力?.includes('[Activate: Main]')) {
      addBattleLog('このカードにはActivate効果がありません');
      soundManager.playSFX('error');
      return;
    }

    const success = effectProcessor ? effectProcessor.processActivateEffect(card, cardDetail, 'player') : false;
    if (success) {
      // カードをレスト状態にする（効果使用済み）
      if (lineType === 'front') {
        const newFrontLine = [...gameState.playerFrontLine];
        newFrontLine[position] = { ...card, isResting: true, effectUsed: true };
        setGameState(prev => ({ ...prev, playerFrontLine: newFrontLine }));
      } else if (lineType === 'energy') {
        const newEnergyLine = [...gameState.playerEnergyLine];
        newEnergyLine[position] = { ...card, isResting: true, effectUsed: true };
        setGameState(prev => ({ ...prev, playerEnergyLine: newEnergyLine }));
      }
      
      soundManager.playSFX('effectActivate');
    } else {
      soundManager.playSFX('error');
    }
  };


  // チュートリアルシステム
  const tutorialSteps = [
    {
      title: "Union Arenaへようこそ！",
      content: "このチュートリアルでは基本的な操作方法を説明します。",
      target: null,
      position: "center"
    },
    {
      title: "ゲーム情報",
      content: "ここではターン数、現在のフェーズ、APを確認できます。",
      target: ".enhanced-game-header",
      position: "bottom"
    },
    {
      title: "手札",
      content: "手札のカードをクリックして選択し、フィールドに配置できます。",
      target: ".hand-section",
      position: "top"
    },
    {
      title: "エナジーライン",
      content: "エナジーを生成するキャラクターを配置します。",
      target: ".player-energy-line",
      position: "top"
    },
    {
      title: "フロントライン",
      content: "戦闘を行うキャラクターを配置します。",
      target: ".player-front-line",
      position: "top"
    },
    {
      title: "フェーズ進行",
      content: "「次へ」ボタンでフェーズを進め、「終了」でターンを終えます。",
      target: ".quick-actions",
      position: "bottom"
    }
  ];

  const nextTutorialStep = () => {
    if (tutorialStep < tutorialSteps.length - 1) {
      setTutorialStep(tutorialStep + 1);
    } else {
      setShowTutorial(false);
      setTutorialStep(0);
    }
  };

  const skipTutorial = () => {
    setShowTutorial(false);
    setTutorialStep(0);
  };

  const getCardImageUrl = (cardId) => {
    return getImageUrl.cardImage(cardId);
  };

  const getEnergyImageUrl = (energyType) => {
    // 英語のエナジータイプを日本語に変換
    const energyTypeMap = {
      red: '赤',
      blue: '青',
      green: '緑',
      yellow: '黄',
      purple: '紫'
    };
    
    const japaneseType = energyTypeMap[energyType] || energyType;
    return `/assets/images/energy/${japaneseType}.png`;
  };

  // エナジーカラーの取得
  const getEnergyColor = (energyType) => {
    const colorMap = {
      red: '#e53e3e',
      blue: '#3182ce',
      green: '#38a169',
      yellow: '#d69e2e',
      purple: '#805ad5'
    };
    return colorMap[energyType] || '#ffffff';
  };

  if (!selectedDeck) {
    return (
      <div className="battle-field-container">
        <div className="no-deck-selected">
          <h2>デッキが選択されていません</h2>
          <button onClick={onBackToMenu} className="back-button">
            メニューに戻る
          </button>
        </div>
      </div>
    );
  }

  if (gameOver) {
    return (
      <div className="battle-field-container">
        <div className="game-over-screen">
          <div className="game-over-content">
            <h2 className={`game-over-title ${gameOver.winner}`}>
              {gameOver.winner === 'player' ? '勝利！' : '敗北...'}
            </h2>
            <p className="game-over-message">{gameOver.message}</p>
            <div className="game-over-stats">
              <p>最終ライフ: プレイヤー {playerLifeManager.getCurrentLife()}, 対戦相手 {opponentLifeManager.getCurrentLife()}</p>
              <p>ターン数: {gameState.turnNumber}</p>
            </div>
            <button onClick={onBackToMenu} className="back-button">
              メニューに戻る
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="battle-field-container">
      {/* 改善されたゲーム情報ヘッダー */}
      <div className="enhanced-game-header">
        <div className="header-left">
          <div className="turn-counter">
            <span className="turn-number">ターン {gameState.turnNumber}</span>
          </div>
          <div className={`player-indicator ${gameState.currentTurn}`}>
            <div className="indicator-icon">
              {gameState.currentTurn === 'player' ? '👤' : '🤖'}
            </div>
            <span>{gameState.currentTurn === 'player' ? 'あなたのターン' : '相手のターン'}</span>
          </div>
        </div>
        
        <div className="header-center">
          <div className="phase-display">
            <div className="phase-icon">
              {gameState.gamePhase === UNION_ARENA_PHASES.START && '🎯'}
              {gameState.gamePhase === UNION_ARENA_PHASES.MOVEMENT && '🔄'}
              {gameState.gamePhase === UNION_ARENA_PHASES.MAIN && '⚔️'}
              {gameState.gamePhase === UNION_ARENA_PHASES.END && '🏁'}
            </div>
            <span className="phase-name">{PHASE_DISPLAY_NAMES[gameState.gamePhase]}</span>
          </div>
          
          <div className="ap-tracker">
            <span className="ap-label">AP</span>
            <div className="ap-orbs">
              {[...Array(apState.max)].map((_, i) => (
                <div 
                  key={i} 
                  className={`ap-orb ${i < apState.current ? 'active' : 'used'}`}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="header-right">
          {aiThinking && (
            <div className="ai-thinking-indicator">
              <div className="thinking-spinner"></div>
              <span>AI思考中...</span>
            </div>
          )}
          <div className="quick-actions">
            <button 
              onClick={drawCard} 
              className="quick-action-btn draw-btn"
              disabled={!phaseManager.canPerformAction('draw') || gameState.playerDeck.length === 0 || gameState.currentTurn !== 'player'}
              title={`ドロー (残り${gameState.playerDeck.length}枚)`}
            >
              <span className="btn-icon">🃏</span>
              <span className="btn-text">ドロー</span>
            </button>
            <button 
              onClick={nextPhase} 
              className="quick-action-btn phase-btn"
              disabled={gameState.currentTurn !== 'player' || aiThinking}
              title="次のフェーズへ"
            >
              <span className="btn-icon">▶️</span>
              <span className="btn-text">次へ</span>
            </button>
            <button 
              onClick={endTurn} 
              className="quick-action-btn end-btn"
              disabled={gameState.gamePhase !== UNION_ARENA_PHASES.END || gameState.currentTurn !== 'player' || aiThinking}
              title="ターン終了"
            >
              <span className="btn-icon">⏹️</span>
              <span className="btn-text">終了</span>
            </button>
            {selectedCard && (
              <button 
                onClick={handleCancelSelection} 
                className="quick-action-btn cancel-btn"
                title="選択キャンセル"
              >
                <span className="btn-icon">❌</span>
                <span className="btn-text">キャンセル</span>
              </button>
            )}
            <button 
              onClick={() => setShowTutorial(true)} 
              className="quick-action-btn help-btn"
              title="ヘルプ・チュートリアル"
            >
              <span className="btn-icon">❓</span>
              <span className="btn-text">ヘルプ</span>
            </button>
            <button 
              onClick={onBackToMenu} 
              className="quick-action-btn menu-btn"
              title="メニューに戻る"
            >
              <span className="btn-icon">🏠</span>
              <span className="btn-text">メニュー</span>
            </button>
          </div>
        </div>
      </div>

      {/* ライフ・エナジー表示（4分割） */}
      <div className="life-energy-four-panel">
        {/* プレイヤーのライフ */}
        <div className="panel player-life-panel">
          <div className="life-section">
            <span className="life-label">プレイヤー</span>
            <div className="life-bar">
              <div 
                className="life-fill player-life-fill"
                style={{ width: `${playerLifeManager.getLifePercentage()}%` }}
              ></div>
              <span className="life-text">{playerLifeManager.getCurrentLife()}</span>
            </div>
          </div>
        </div>

        {/* あなたのエナジー */}
        <div className="panel player-energy-panel">
          <div className="energy-display player-energy-display">
            <h4>あなたのエナジー</h4>
            <div className="energy-row">
              {Object.entries(gameState.playerEnergy).map(([color, amount]) => (
                <div 
                  key={color} 
                  className={`energy-item ${gameState.energyUpdateTimestamp ? 'energy-updated' : ''}`}
                  style={{
                    animationDelay: `${Object.keys(gameState.playerEnergy).indexOf(color) * 0.1}s`
                  }}
                >
                  <img src={getEnergyImageUrl(color)} alt={`${color}エナジー`} />
                  <span className="energy-amount">{amount}</span>
                  {amount > 0 && (
                    <div className="energy-glow" style={{ '--energy-color': getEnergyColor(color) }}></div>
                  )}
                </div>
              ))}
            </div>
            {gameState.energyUpdateTimestamp && (
              <div className="energy-update-indicator">
                <span>✨ エナジー更新済み</span>
              </div>
            )}
          </div>
        </div>

        {/* 相手エナジー */}
        <div className="panel opponent-energy-panel">
          <div className="energy-display opponent-energy-display">
            <h4>相手エナジー</h4>
            <div className="energy-row">
              {Object.entries(gameState.opponentEnergy).map(([color, amount]) => (
                <div key={color} className="energy-item">
                  <img src={getEnergyImageUrl(color)} alt={`${color}エナジー`} />
                  <span>{amount}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* 対戦相手のライフ */}
        <div className="panel opponent-life-panel">
          <div className="life-section">
            <span className="life-label">対戦相手</span>
            <div className="life-bar">
              <div 
                className="life-fill opponent-life-fill"
                style={{ width: `${opponentLifeManager.getLifePercentage()}%` }}
              ></div>
              <span className="life-text">{opponentLifeManager.getCurrentLife()}</span>
            </div>
          </div>
        </div>
      </div>

      {/* 3分割レイアウト */}
      <div className="three-panel-layout">
        {/* 左側パネル - バトルログ */}
        <div className="left-panel">
          <div className="battle-log">
            <div className="battle-log-header">
              <h3>バトルログ</h3>
              <button 
                className="clear-log-button"
                onClick={clearBattleLog}
                title="バトルログをクリア"
              >
                🗑️
              </button>
            </div>
            <div className="log-messages">
              {battleLog.map(log => (
                <div key={log.id} className="log-message">
                  {log.message}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* 中央パネル - フィールド */}
        <div className="center-panel">
          {/* 相手エリア */}
          <div className="opponent-section">
            <div className="opponent-info">
              <span>手札: {gameState.opponentHand.length}枚</span>
              <span>デッキ: {gameState.opponentDeck.length}枚</span>
            </div>
            
            {/* 相手のエナジーライン */}
            <div className="field-line opponent-energy-line">
              <h4>相手 エナジーライン</h4>
              <div className="line-slots">
                {gameState.opponentEnergyLine.map((card, index) => (
                  <div key={index} className="line-slot opponent-slot">
                    {card ? (
                      <img 
                        src={getCardImageUrl(card.card_id)}
                        alt={card.name}
                        className="field-card opponent-card"
                      />
                    ) : (
                      <div className="empty-slot opponent-empty">
                        <span>空</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* 相手のフロントライン */}
            <div className="field-line opponent-front-line">
              <h4>相手 フロントライン</h4>
              <div className="line-slots">
                {gameState.opponentFrontLine.map((card, index) => (
                  <div key={index} className="line-slot opponent-slot">
                    {card ? (
                      <img 
                        src={getCardImageUrl(card.card_id)}
                        alt={card.name}
                        className="field-card opponent-card"
                      />
                    ) : (
                      <div className="empty-slot opponent-empty">
                        <span>空</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

          </div>

          {/* プレイヤーエリア */}
          <div className="player-section">

            {/* プレイヤーのフロントライン */}
            <div className="field-line player-front-line">
              <h4>あなたの フロントライン</h4>
              <div className="line-slots">
                {gameState.playerFrontLine.map((card, index) => {
                  const dragOverClass = getDragOverClass('front', index);
                  const fieldDragEnabled = card && isDragEnabled(card, { 
                    type: 'field', 
                    line: 'front', 
                    position: index 
                  });
                  
                  return (
                    <div 
                      key={index} 
                      className={`line-slot player-slot front-slot ${
                        selectedCard ? 'can-place' : ''
                      } ${
                        isSlotHighlighted('front', index) ? 'highlighted' : ''
                      } ${dragOverClass}`}
                      onClick={() => handleLineSlotClick('front', index)}
                      onDragOver={(e) => handleDragOver(e, 'front', index)}
                      onDragLeave={handleDragLeave}
                      onDrop={(e) => handleDrop(e, 'front', index)}
                      onMouseEnter={() => {
                        if (card) {
                          setHoveredCard(card);
                        }
                      }}
                      onMouseLeave={() => {
                        if (card) {
                          setHoveredCard(null);
                        }
                      }}
                    >
                      {card ? (
                        <div className="field-card-container">
                          <img 
                            src={getCardImageUrl(card.card_id)}
                            alt={card.name}
                            className={`field-card player-card ${fieldDragEnabled ? 'draggable' : ''}`}
                            draggable={fieldDragEnabled}
                            onDragStart={(e) => handleDragStart(e, card, { 
                              type: 'field', 
                              line: 'front', 
                              position: index 
                            })}
                            onDragEnd={handleDragEnd}
                          />
                          {/* Activate効果ボタン */}
                          {cardDetails[card.card_id]?.data?.能力?.includes('[Activate: Main]') && 
                           !card.effectUsed && 
                           gameState.currentTurn === 'player' && 
                           gameState.gamePhase === 'main' && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                activateMainEffect(card, 'front', index);
                              }}
                              className="activate-effect-btn"
                              title="Activate効果を使用"
                            >
                              ⚡
                            </button>
                          )}
                        </div>
                      ) : (
                        <div className="empty-slot player-empty">
                          {selectedCard && phaseManager.canPerformAction('playCard') ? <span>配置</span> : selectedCard ? <span>配置不可</span> : <span>空</span>}
                          {isDragging && isSlotHighlighted('front', index) && (
                            <div className="drag-guide-text">ドロップ可能</div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* プレイヤーのエナジーライン */}
            <div className="field-line player-energy-line">
              <h4>あなたの エナジーライン</h4>
              <div className="line-slots">
                {gameState.playerEnergyLine.map((card, index) => {
                  const dragOverClass = getDragOverClass('energy', index);
                  const fieldDragEnabled = card && isDragEnabled(card, { 
                    type: 'field', 
                    line: 'energy', 
                    position: index 
                  });
                  
                  // カードの発生エナジー情報を取得
                  const cardDetail = card ? cardDetails[card.card_id]?.data : null;
                  const generatedEnergy = cardDetail?.発生エナジー || '';
                  
                  return (
                    <div 
                      key={index} 
                      className={`line-slot player-slot energy-slot ${
                        selectedCard ? 'can-place' : ''
                      } ${
                        isSlotHighlighted('energy', index) ? 'highlighted' : ''
                      } ${dragOverClass}`}
                      onClick={() => handleLineSlotClick('energy', index)}
                      onDragOver={(e) => handleDragOver(e, 'energy', index)}
                      onDragLeave={handleDragLeave}
                      onDrop={(e) => handleDrop(e, 'energy', index)}
                      onMouseEnter={() => {
                        if (card) {
                          setHoveredCard(card);
                        }
                      }}
                      onMouseLeave={() => {
                        if (card) {
                          setHoveredCard(null);
                        }
                      }}
                    >
                    {card ? (
                      <div className="field-card-container energy-card-container">
                        <img 
                          src={getCardImageUrl(card.card_id)}
                          alt={card.name}
                          className={`field-card player-card energy-card ${fieldDragEnabled ? 'draggable' : ''}`}
                          draggable={fieldDragEnabled}
                          onDragStart={(e) => handleDragStart(e, card, { 
                            type: 'field', 
                            line: 'energy', 
                            position: index 
                          })}
                          onDragEnd={handleDragEnd}
                        />
                        
                        {/* 発生エナジー表示オーバーレイ */}
                        {generatedEnergy && (
                          <div className="energy-overlay">
                            <div className="energy-overlay-content">
                              <span className="energy-label">発生:</span>
                              <div className="energy-icons">
                                {generatedEnergy.split('*').map((part, idx) => {
                                  if (idx % 2 === 1) {
                                    // *で囲まれた部分（エナジーアイコン）
                                    const imageName = part.replace(/[:*?"<>|]/g, '');
                                    return (
                                      <img
                                        key={idx}
                                        src={getEnergyImageUrl(imageName)}
                                        alt={imageName}
                                        className="energy-icon"
                                        title={`${imageName}エナジー`}
                                      />
                                    );
                                  }
                                  return null;
                                })}
                              </div>
                            </div>
                          </div>
                        )}
                        
                        {/* Activate効果ボタン */}
                        {cardDetails[card.card_id]?.data?.能力?.includes('[Activate: Main]') && 
                         !card.effectUsed && 
                         gameState.currentTurn === 'player' && 
                         gameState.gamePhase === 'main' && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              activateMainEffect(card, 'energy', index);
                            }}
                            className="activate-effect-btn"
                            title="Activate効果を使用"
                          >
                            ⚡
                          </button>
                        )}
                      </div>
                    ) : (
                      <div className="empty-slot player-empty">
                        {selectedCard && phaseManager.canPerformAction('playCard') ? <span>配置</span> : selectedCard ? <span>配置不可</span> : <span>空</span>}
                        {isDragging && isSlotHighlighted('energy', index) && (
                          <div className="drag-guide-text">ドロップ可能</div>
                        )}
                      </div>
                    )}
                  </div>
                );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* 右側パネル - 手札 */}
        <div className="right-panel">
          <div className="player-hand">
            <h3>手札 ({gameState.playerHand.length}枚)</h3>
            <div className="hand-cards-grid">
              {gameState.playerHand.map((card, index) => {
                const isSelected = selectedCard?.uniqueId === card.uniqueId;
                const dragEnabled = isDragEnabled(card, { type: 'hand' });
                
                return (
                  <div 
                    key={card.uniqueId} 
                    className={`hand-card-small ${isSelected ? 'selected' : ''} ${dragEnabled ? 'draggable' : ''}`}
                    draggable={dragEnabled}
                    onDragStart={(e) => handleDragStart(e, card, { type: 'hand' })}
                    onDragEnd={handleDragEnd}
                    onClick={() => handleCardClick(card)}
                    onMouseEnter={() => setHoveredCard(card)}
                    onMouseLeave={() => setHoveredCard(null)}
                  >
                    <img 
                      src={getCardImageUrl(card.card_id)}
                      alt={card.name}
                      className="hand-card-image-small"
                    />
                    {dragEnabled && (
                      <div className="drag-guide-text-small">ドラッグ可能</div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* 改善されたカードプレビューシステム */}
      {(hoveredCard || showCardPreview) && (
        <div className="enhanced-card-preview">
          <div className="preview-container">
            <div className="preview-header">
              <h3 className="card-title">{(hoveredCard || previewCard)?.name}</h3>
              {showCardPreview && (
                <button 
                  className="close-preview-btn"
                  onClick={() => {
                    setShowCardPreview(false);
                    setPreviewCard(null);
                  }}
                >
                  ×
                </button>
              )}
            </div>
            
            <div className="preview-content">
              <div className="card-image-section">
                <img 
                  src={getCardImageUrl((hoveredCard || previewCard)?.card_id)}
                  alt={(hoveredCard || previewCard)?.name}
                  className="preview-card-image"
                />
              </div>
              
              <div className="card-stats-section">
                {(() => {
                  const cardDetail = cardDetails[(hoveredCard || previewCard)?.card_id]?.data;
                  if (!cardDetail) return null;
                  
                  return (
                    <div className="stats-grid">
                      {cardDetail.カード種類 && (
                        <div className="stat-item type">
                          <span className="stat-label">種類</span>
                          <span className="stat-value">{cardDetail.カード種類}</span>
                        </div>
                      )}
                      {cardDetail.BP && (
                        <div className="stat-item bp">
                          <span className="stat-label">BP</span>
                          <span className="stat-value bp-value">{cardDetail.BP}</span>
                        </div>
                      )}
                      {cardDetail.必要エナジー && (
                        <div className="stat-item energy-cost">
                          <span className="stat-label">コスト</span>
                          <span className="stat-value energy-value">{cardDetail.必要エナジー}</span>
                        </div>
                      )}
                      {cardDetail.発生エナジー && (
                        <div className="stat-item energy-gen">
                          <span className="stat-label">エナジー</span>
                          <span className="stat-value energy-value">{cardDetail.発生エナジー}</span>
                        </div>
                      )}
                    </div>
                  );
                })()}
                
                {(() => {
                  const cardDetail = cardDetails[(hoveredCard || previewCard)?.card_id]?.data;
                  return cardDetail?.効果 ? (
                    <div className="ability-section">
                      <h4 className="ability-title">効果</h4>
                      <div className="ability-text">{cardDetail.効果}</div>
                    </div>
                  ) : null;
                })()}
                
                {(() => {
                  const cardDetail = cardDetails[(hoveredCard || previewCard)?.card_id]?.data;
                  return cardDetail?.能力 ? (
                    <div className="ability-section">
                      <h4 className="ability-title">能力</h4>
                      <div className="ability-text">{cardDetail.能力}</div>
                    </div>
                  ) : null;
                })()}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 墓地表示モーダル */}
      {(showPlayerGraveyard || showOpponentGraveyard) && (
        <div className="graveyard-modal-overlay" style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          backgroundColor: 'rgba(0, 0, 0, 0.8)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 2000
        }}>
          <div className="graveyard-modal" style={{
            backgroundColor: '#1a1a2e',
            borderRadius: '16px',
            padding: '24px',
            width: '80%',
            maxWidth: '800px',
            maxHeight: '80%',
            border: `2px solid ${showPlayerGraveyard ? '#27ae60' : '#e74c3c'}`,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column'
          }}>
            <div className="graveyard-header" style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '20px',
              paddingBottom: '12px',
              borderBottom: '1px solid rgba(255, 255, 255, 0.1)'
            }}>
              <h3 style={{
                color: showPlayerGraveyard ? '#27ae60' : '#e74c3c',
                margin: 0,
                fontSize: '20px',
                fontWeight: 'bold'
              }}>
                {showPlayerGraveyard ? 'あなたの墓地' : '相手の墓地'} 
                ({(showPlayerGraveyard ? gameState.playerGraveyard : gameState.opponentGraveyard).length}枚)
              </h3>
              <button 
                onClick={() => {
                  setShowPlayerGraveyard(false);
                  setShowOpponentGraveyard(false);
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#e2e8f0',
                  fontSize: '24px',
                  cursor: 'pointer',
                  padding: '4px',
                  borderRadius: '4px',
                  transition: 'all 0.2s ease'
                }}
                onMouseEnter={(e) => {
                  e.target.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
                  e.target.style.color = '#fc8181';
                }}
                onMouseLeave={(e) => {
                  e.target.style.backgroundColor = 'transparent';
                  e.target.style.color = '#e2e8f0';
                }}
              >
                ×
              </button>
            </div>
            
            <div className="graveyard-cards" style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))',
              gap: '12px',
              overflowY: 'auto',
              flex: 1,
              padding: '8px'
            }}>
              {(showPlayerGraveyard ? gameState.playerGraveyard : gameState.opponentGraveyard)
                .slice().reverse().map((card, index) => (
                <div 
                  key={`graveyard-${card.uniqueId}-${index}`} 
                  className="graveyard-card"
                  onMouseEnter={() => setHoveredCard(card)}
                  onMouseLeave={() => setHoveredCard(null)}
                  style={{
                    width: '100px',
                    height: '140px',
                    borderRadius: '8px',
                    overflow: 'hidden',
                    border: '2px solid rgba(255, 255, 255, 0.2)',
                    cursor: 'pointer',
                    transition: 'all 0.3s ease',
                    transform: 'scale(1)',
                    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)'
                  }}
                  onMouseEnterCapture={(e) => {
                    e.target.style.transform = 'scale(1.05)';
                    e.target.style.border = '2px solid rgba(66, 153, 225, 0.8)';
                  }}
                  onMouseLeaveCapture={(e) => {
                    e.target.style.transform = 'scale(1)';
                    e.target.style.border = '2px solid rgba(255, 255, 255, 0.2)';
                  }}
                >
                  <img 
                    src={getCardImageUrl(card.card_id)}
                    alt={card.name}
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover'
                    }}
                  />
                </div>
              ))}
              
              {(showPlayerGraveyard ? gameState.playerGraveyard : gameState.opponentGraveyard).length === 0 && (
                <div style={{
                  gridColumn: '1 / -1',
                  textAlign: 'center',
                  color: '#a0aec0',
                  fontSize: '16px',
                  padding: '40px',
                  fontStyle: 'italic'
                }}>
                  墓地にカードはありません
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* インタラクティブチュートリアル */}
      {showTutorial && (
        <div className="tutorial-overlay">
          <div className="tutorial-backdrop" onClick={skipTutorial}></div>
          <div className="tutorial-content">
            <div className="tutorial-header">
              <h3 className="tutorial-title">{tutorialSteps[tutorialStep].title}</h3>
              <button className="tutorial-close" onClick={skipTutorial}>×</button>
            </div>
            <div className="tutorial-body">
              <p className="tutorial-text">{tutorialSteps[tutorialStep].content}</p>
              <div className="tutorial-progress">
                <div className="progress-bar">
                  <div 
                    className="progress-fill"
                    style={{ width: `${((tutorialStep + 1) / tutorialSteps.length) * 100}%` }}
                  ></div>
                </div>
                <span className="progress-text">
                  {tutorialStep + 1} / {tutorialSteps.length}
                </span>
              </div>
            </div>
            <div className="tutorial-footer">
              <button className="tutorial-btn skip-btn" onClick={skipTutorial}>
                スキップ
              </button>
              <button className="tutorial-btn next-btn" onClick={nextTutorialStep}>
                {tutorialStep === tutorialSteps.length - 1 ? '完了' : '次へ'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* バトルシステムUI */}
      {battleState.battleInProgress && (
        <BattleSystemUI
          gameState={gameState}
          onAttack={handleAttack}
          onBlock={handleBlock}
          onResolveBattle={handleResolveBattle}
          onCancelBattle={handleCancelBattle}
          battleState={battleState}
          isPlayerTurn={gameState.currentTurn === 'player'}
          currentPhase={gameState.gamePhase}
        />
      )}

      {/* Movement PhaseUI */}
      {gameState.gamePhase === UNION_ARENA_PHASES.MOVEMENT && gameState.currentTurn === 'player' && (
        <MovementPhaseUI
          gameState={gameState}
          onMoveCharacter={handleMoveCharacter}
          cardDetails={cardDetails}
          isPlayerTurn={gameState.currentTurn === 'player'}
          currentPhase={gameState.gamePhase}
          onNextPhase={nextPhase}
        />
      )}

    </div>
  );
};

export default BattleField;