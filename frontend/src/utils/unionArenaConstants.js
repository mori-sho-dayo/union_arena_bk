// Union Arena定数とクラス定義
// src/utils/unionArenaConstants.js

// Union Arena正式ルールに基づくフェーズ定義
export const UNION_ARENA_PHASES = {
    START: 'start',
    MOVEMENT: 'movement', 
    MAIN: 'main',
    END: 'end'
  };
  
  export const PHASE_DISPLAY_NAMES = {
    [UNION_ARENA_PHASES.START]: 'スタートフェーズ',
    [UNION_ARENA_PHASES.MOVEMENT]: '移動フェーズ',
    [UNION_ARENA_PHASES.MAIN]: 'メインフェーズ',
    [UNION_ARENA_PHASES.END]: 'エンドフェーズ'
  };
  
  // Union Arena正式ルールに基づくフェーズマネージャー
  export class UnionArenaPhaseManager {
    constructor() {
      this.currentPhase = UNION_ARENA_PHASES.START;
    }
  
    getCurrentPhase() {
      return this.currentPhase;
    }
  
    nextPhase() {
      const phaseOrder = [
        UNION_ARENA_PHASES.START,
        UNION_ARENA_PHASES.MOVEMENT,
        UNION_ARENA_PHASES.MAIN,
        UNION_ARENA_PHASES.END
      ];
      
      const currentIndex = phaseOrder.indexOf(this.currentPhase);
      const nextIndex = (currentIndex + 1) % phaseOrder.length;
      this.currentPhase = phaseOrder[nextIndex];
      return this.currentPhase;
    }
  
    reset() {
      this.currentPhase = UNION_ARENA_PHASES.START;
    }
  
    canPerformAction(action) {
      switch (action) {
        case 'draw':
          return this.currentPhase === UNION_ARENA_PHASES.START;
        case 'move':
          return this.currentPhase === UNION_ARENA_PHASES.MOVEMENT;
        case 'playCard':
        case 'activateMain':
        case 'attack':
          return this.currentPhase === UNION_ARENA_PHASES.MAIN;
        default:
          return false;
      }
    }
  }
  
  // Union Arena正式ルールに基づくエナジー管理
  export class UnionArenaEnergyManager {
    constructor() {
      this.energyColors = ['red', 'blue', 'green', 'yellow', 'purple'];
    }
  
    // エナジーラインのキャラクターからエナジーを計算
    calculateEnergyFromLine(energyLine) {
      const energy = {
        red: 0,
        blue: 0,
        green: 0,
        yellow: 0,
        purple: 0
      };
  
      energyLine.forEach(card => {
        if (card && card.generatedEnergy) {
          // カードの発生エナジーを解析
          const generated = this.parseGeneratedEnergy(card.generatedEnergy);
          Object.keys(generated).forEach(color => {
            energy[color] += generated[color];
          });
        }
      });
  
      return energy;
    }
  
    parseGeneratedEnergy(energyString) {
      // エナジー文字列を解析（例：「赤1青1」→ {red: 1, blue: 1}）
      const energy = { red: 0, blue: 0, green: 0, yellow: 0, purple: 0 };
      
      if (!energyString) return energy;
  
      const colorMap = {
        '赤': 'red',
        '青': 'blue', 
        '緑': 'green',
        '黄': 'yellow',
        '紫': 'purple'
      };
  
      // 日本語のエナジー記述を解析
      Object.keys(colorMap).forEach(jpColor => {
        const regex = new RegExp(jpColor + '(\\d+)', 'g');
        const match = regex.exec(energyString);
        if (match) {
          const englishColor = colorMap[jpColor];
          energy[englishColor] = parseInt(match[1], 10);
        }
      });
  
      return energy;
    }
  
    parseRequiredEnergy(costString) {
      // 必要エナジーを解析（例：「赤2青1」→ {red: 2, blue: 1}）
      return this.parseGeneratedEnergy(costString);
    }
  
    canPayCost(requiredEnergy, availableEnergy) {
      return Object.keys(requiredEnergy).every(color => 
        (availableEnergy[color] || 0) >= (requiredEnergy[color] || 0)
      );
    }
  
    getMissingEnergy(requiredEnergy, availableEnergy) {
      const missing = {};
      Object.keys(requiredEnergy).forEach(color => {
        const required = requiredEnergy[color] || 0;
        const available = availableEnergy[color] || 0;
        if (required > available) {
          missing[color] = required - available;
        }
      });
      return missing;
    }
  
    formatEnergyCost(energyCost) {
      const colorMap = {
        red: '赤',
        blue: '青',
        green: '緑',
        yellow: '黄',
        purple: '紫'
      };
  
      return Object.entries(energyCost)
        .filter(([color, amount]) => amount > 0)
        .map(([color, amount]) => `${colorMap[color]}${amount}`)
        .join('');
    }
  }
  
  // Union Arena正式ルールに基づくライフ管理
  export class UnionArenaLifeManager {
    constructor(initialLife = 7) {
      this.lifeArea = [];
      // Union Arenaではライフはカード枚数で管理
      for (let i = 0; i < initialLife; i++) {
        this.lifeArea.push({ id: `life_${i}`, type: 'life' });
      }
      this.maxLife = initialLife;
    }
  
    getCurrentLife() {
      return this.lifeArea.length;
    }
  
    takeDamage(amount, deck) {
      const cardsToLife = [];
      for (let i = 0; i < amount && deck.length > 0; i++) {
        const card = deck.shift();
        if (card) {
          cardsToLife.push(card);
        }
      }
      
      this.lifeArea.push(...cardsToLife);
      return cardsToLife; // トリガーチェック用
    }
  
    removeLife(amount) {
      const removedCards = [];
      for (let i = 0; i < amount && this.lifeArea.length > 0; i++) {
        const card = this.lifeArea.shift();
        if (card) {
          removedCards.push(card);
        }
      }
      return removedCards;
    }
  
    isDefeated() {
      return this.lifeArea.length === 0;
    }
  
    getLifePercentage() {
      return Math.max(0, (this.getCurrentLife() / this.maxLife) * 100);
    }
  
    getLifeArea() {
      return [...this.lifeArea];
    }
  }
  
  // 勝利条件チェッカー
  export class VictoryConditionChecker {
    constructor(playerLifeManager, opponentLifeManager) {
      this.playerLifeManager = playerLifeManager;
      this.opponentLifeManager = opponentLifeManager;
    }
  
    checkVictoryConditions(playerDeck, opponentDeck) {
      // ライフ0による敗北
      if (this.playerLifeManager.isDefeated()) {
        return {
          winner: 'opponent',
          message: 'プレイヤーのライフが0になりました。敗北です。',
          reason: 'life_zero'
        };
      }
      
      if (this.opponentLifeManager.isDefeated()) {
        return {
          winner: 'player',
          message: '対戦相手のライフが0になりました。勝利です！',
          reason: 'life_zero'
        };
      }
  
      // デッキアウトによる敗北
      if (playerDeck.length === 0) {
        return {
          winner: 'opponent',
          message: 'デッキが空でカードを引けません。敗北です。',
          reason: 'deck_out'
        };
      }
  
      if (opponentDeck.length === 0) {
        return {
          winner: 'player',
          message: '対戦相手のデッキが空になりました。勝利です！',
          reason: 'deck_out'
        };
      }
      
      return null;
    }
  }
  
  // カード種類定数
  export const CARD_TYPES = {
    CHARACTER: 'キャラクター',
    EVENT: 'イベント',
    BLOCKER: 'ブロッカー'
  };
  
  // カラー定数
  export const COLORS = {
    RED: 'red',
    BLUE: 'blue',
    GREEN: 'green',
    YELLOW: 'yellow',
    PURPLE: 'purple'
  };
  
  export const COLOR_NAMES_JP = {
    [COLORS.RED]: '赤',
    [COLORS.BLUE]: '青',
    [COLORS.GREEN]: '緑',
    [COLORS.YELLOW]: '黄',
    [COLORS.PURPLE]: '紫'
  };
  
  export const COLOR_NAMES_EN = {
    '赤': COLORS.RED,
    '青': COLORS.BLUE,
    '緑': COLORS.GREEN,
    '黄': COLORS.YELLOW,
    '紫': COLORS.PURPLE
  };
  
  // ゲーム定数
  export const GAME_CONSTANTS = {
    MAX_HAND_SIZE: 8,
    INITIAL_HAND_SIZE: 5,
    INITIAL_LIFE: 7,
    MAX_FRONT_LINE: 4,
    MAX_ENERGY_LINE: 4,
    INITIAL_AP: 1,
    MAX_AP_PER_TURN: 12
  };
  
  // 効果タイプ定数
  export const EFFECT_TYPES = {
    ACTIVATE_MAIN: '[Activate: Main]',
    AUTO: '[Auto]',
    TRIGGER: '[Trigger]',
    FINAL: '▼Final▼',
    STEP: '▼Step▼'
  };
  
  // バトル結果定数
  export const BATTLE_RESULTS = {
    ATTACKER_WINS: 'attacker_wins',
    BLOCKER_WINS: 'blocker_wins',
    DRAW: 'draw',
    NO_BLOCK: 'no_block'
  };
  
  // ログタイプ定数
  export const LOG_TYPES = {
    GAME_START: 'game_start',
    PHASE_CHANGE: 'phase_change',
    CARD_PLAY: 'card_play',
    ATTACK: 'attack',
    BLOCK: 'block',
    BATTLE_RESULT: 'battle_result',
    DAMAGE: 'damage',
    TRIGGER: 'trigger',
    MOVE: 'move',
    DRAW: 'draw',
    ERROR: 'error',
    WARNING: 'warning'
  };
  
  export default {
    UNION_ARENA_PHASES,
    PHASE_DISPLAY_NAMES,
    UnionArenaPhaseManager,
    UnionArenaEnergyManager,
    UnionArenaLifeManager,
    VictoryConditionChecker,
    CARD_TYPES,
    COLORS,
    COLOR_NAMES_JP,
    COLOR_NAMES_EN,
    GAME_CONSTANTS,
    EFFECT_TYPES,
    BATTLE_RESULTS,
    LOG_TYPES
  };