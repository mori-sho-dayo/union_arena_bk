// Movement Phase実装
// src/components/BattleField/MovementPhaseUI.jsx

import React, { useState, useEffect } from 'react';
import { getImageUrl } from '../../services/api';
import './MovementPhaseUI.css';

const MovementPhaseUI = ({ 
  gameState, 
  onMoveCharacter, 
  cardDetails,
  isPlayerTurn,
  currentPhase,
  onNextPhase,
  onCardHover
}) => {
  const [selectedCharacter, setSelectedCharacter] = useState(null);
  const [availableDestinations, setAvailableDestinations] = useState([]);
  const [draggedCharacter, setDraggedCharacter] = useState(null);
  const [dragOverSlot, setDragOverSlot] = useState(null);
  const [isMinimized, setIsMinimized] = useState(false);
  const [windowPosition, setWindowPosition] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = React.useRef({ startX: 0, startY: 0 });

  useEffect(() => {
    if (selectedCharacter) {
      calculateAvailableDestinations();
    } else {
      setAvailableDestinations([]);
    }
  }, [selectedCharacter, gameState]);

  // 移動可能な場所を計算
  const calculateAvailableDestinations = () => {
    if (!selectedCharacter) return;

    const destinations = [];
    const { character, line: fromLine, position: fromPos } = selectedCharacter;
    
    // Front LineからEnergy Lineへの移動は▼Step▼能力が必要
    if (fromLine === 'front') {
      const cardDetail = cardDetails[character.card_id]?.data;
      const hasStepAbility = cardDetail?.効果?.includes('*ステップ*');
      
      if (hasStepAbility) {
        // Energy Lineの空きスロットをチェック
        gameState.playerEnergyLine.forEach((slot, index) => {
          if (slot === null) {
            destinations.push({ line: 'energy', position: index });
          }
        });
      }
    }
    
    // Energy LineからFront Lineへの移動は常に可能
    if (fromLine === 'energy') {
      gameState.playerFrontLine.forEach((slot, index) => {
        if (slot === null) {
          destinations.push({ line: 'front', position: index });
        }
      });
    }
    
    // 同じライン内での位置変更
    const currentLine = fromLine === 'front' ? gameState.playerFrontLine : gameState.playerEnergyLine;
    currentLine.forEach((slot, index) => {
      if (slot === null && index !== fromPos) {
        destinations.push({ line: fromLine, position: index });
      }
    });

    setAvailableDestinations(destinations);
  };

  // キャラクター移動可能チェック
  const canMoveCharacter = (character, fromLine) => {
    return character && 
           isPlayerTurn && 
           currentPhase === 'movement' &&
           !character.isResting; // レスト状態のキャラクターは移動不可
  };

  // キャラクター選択（トグル）
  const handleCharacterClick = (character, line, position) => {
    if (!canMoveCharacter(character, line)) return;

    // 既に選択されているキャラクターをクリックした場合は選択解除
    if (selectedCharacter?.line === line && selectedCharacter?.position === position) {
      setSelectedCharacter(null);
      return;
    }

    setSelectedCharacter({ character, line, position });
  };

  // 移動先クリック
  const handleDestinationClick = (toLine, toPosition) => {
    if (!selectedCharacter) return;
    
    const isValidDestination = availableDestinations.some(
      dest => dest.line === toLine && dest.position === toPosition
    );
    
    if (!isValidDestination) return;

    const { character, line: fromLine, position: fromPosition } = selectedCharacter;
    
    onMoveCharacter(fromLine, fromPosition, toLine, toPosition);
    setSelectedCharacter(null);
  };

  // ドラッグ開始
  const handleDragStart = (e, character, line, position) => {
    if (!canMoveCharacter(character, line)) {
      e.preventDefault();
      return;
    }

    setDraggedCharacter({ character, line, position });
    e.dataTransfer.setData('text/plain', ''); // Firefox対応
  };

  // ドラッグオーバー
  const handleDragOver = (e, toLine, toPosition) => {
    e.preventDefault();
    
    if (!draggedCharacter) return;

    // 移動可能かチェック
    const { character, line: fromLine, position: fromPosition } = draggedCharacter;
    
    if (fromLine === fromLine && fromPosition === toPosition) {
      // 同じ位置
      setDragOverSlot(null);
      return;
    }

    // Front LineからEnergy Lineへの移動チェック
    if (fromLine === 'front' && toLine === 'energy') {
      const cardDetail = cardDetails[character.card_id]?.data;
      const hasStepAbility = cardDetail?.効果?.includes('*ステップ*');
      
      if (!hasStepAbility) {
        setDragOverSlot(null);
        return;
      }
    }

    // 移動先が空いているかチェック
    const toLineArray = toLine === 'front' ? gameState.playerFrontLine : gameState.playerEnergyLine;
    if (toLineArray[toPosition] !== null) {
      setDragOverSlot(null);
      return;
    }

    setDragOverSlot({ line: toLine, position: toPosition });
  };

  // ドラッグリーブ
  const handleDragLeave = () => {
    setDragOverSlot(null);
  };

  // ドロップ
  const handleDrop = (e, toLine, toPosition) => {
    e.preventDefault();
    
    if (!draggedCharacter || !dragOverSlot) return;

    const { line: fromLine, position: fromPosition } = draggedCharacter;
    onMoveCharacter(fromLine, fromPosition, toLine, toPosition);
    
    setDraggedCharacter(null);
    setDragOverSlot(null);
  };

  // ドラッグ終了
  const handleDragEnd = () => {
    setDraggedCharacter(null);
    setDragOverSlot(null);
  };

  // 移動キャンセル
  const cancelMovement = () => {
    setSelectedCharacter(null);
    setAvailableDestinations([]);
  };

  // ▼Step▼能力チェック
  const hasStepAbility = (character) => {
    const cardDetail = cardDetails[character.card_id]?.data;
    return cardDetail?.効果?.includes('*ステップ*');
  };

  // カード画像URL取得
  const getCardImageUrl = (cardId) => {
    return getImageUrl.cardImage(cardId);
  };

  // ウィンドウドラッグ開始
  const handleWindowDragStart = (e) => {
    if (e.target.className.includes('movement-minimize-btn')) return;
    setIsDragging(true);
    const currentPos = windowPosition || { x: 0, y: 0 };
    dragRef.current = {
      startX: e.clientX - currentPos.x,
      startY: e.clientY - currentPos.y
    };
  };

  // ウィンドウドラッグ中
  const handleWindowDrag = (e) => {
    if (!isDragging) return;
    setWindowPosition({
      x: e.clientX - dragRef.current.startX,
      y: e.clientY - dragRef.current.startY
    });
  };

  // ウィンドウドラッグ終了
  const handleWindowDragEnd = () => {
    setIsDragging(false);
  };

  // ドラッグイベントリスナー
  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleWindowDrag);
      document.addEventListener('mouseup', handleWindowDragEnd);
      return () => {
        document.removeEventListener('mousemove', handleWindowDrag);
        document.removeEventListener('mouseup', handleWindowDragEnd);
      };
    }
  }, [isDragging]);

  if (currentPhase !== 'movement' || !isPlayerTurn) {
    return null;
  }

  return (
    <div className="movement-phase-ui">
      {/* ウィンドウコンテナ */}
      <div 
        className="movement-window"
        style={{
          left: windowPosition ? `${windowPosition.x}px` : '50%',
          top: windowPosition ? `${windowPosition.y}px` : '50%',
          transform: windowPosition ? 'none' : 'translate(-50%, -50%)'
        }}
      >
        {/* ウィンドウヘッダー */}
        <div 
          className="movement-window-header"
          onMouseDown={handleWindowDragStart}
        >
          <div className="movement-window-title">
            <span>🔄 移動フェーズ</span>
          </div>
          <button 
            className="movement-minimize-btn"
            onClick={() => setIsMinimized(!isMinimized)}
            title={isMinimized ? "展開" : "最小化"}
          >
            {isMinimized ? '📌' : '📄'}
          </button>
        </div>

        {/* ウィンドウコンテンツ */}
        {!isMinimized && (
          <div className="movement-window-content">
            {/* Movement Phase説明 */}
            <div className="movement-instructions">
              <div className="movement-header">
                <h3>移動フェーズ</h3>
                <p>キャラクターを移動できます</p>
              </div>
              <div className="movement-rules">
                <ul>
                  <li>エナジーライン ⇄ フロントライン: 自由に移動可能</li>
                  <li>フロントライン → エナジーライン: ▼Step▼能力が必要</li>
                  <li>レスト状態のキャラクターは移動不可</li>
                  <li>移動先は空いているスロットのみ</li>
                </ul>
              </div>
            </div>


            {/* フィールドオーバーレイ */}
            <div className="movement-field-overlay">
              {/* プレイヤーフロントライン */}
              <div className="movement-front-line">
                <h4>フロントライン</h4>
                <div className="movement-line-slots">
                  {gameState.playerFrontLine.map((character, index) => (
                    <div 
                      key={index}
                      className={`movement-slot front-slot ${
                        character ? 'occupied' : 'empty'
                      } ${
                        selectedCharacter?.line === 'front' && selectedCharacter?.position === index ? 'selected-source' : ''
                      } ${
                        availableDestinations.some(dest => dest.line === 'front' && dest.position === index) ? 'available-destination' : ''
                      } ${
                        dragOverSlot?.line === 'front' && dragOverSlot?.position === index ? 'drag-over' : ''
                      } ${
                        draggedCharacter?.line === 'front' && draggedCharacter?.position === index ? 'being-dragged' : ''
                      }`}
                      onClick={() => character ? 
                        handleCharacterClick(character, 'front', index) : 
                        handleDestinationClick('front', index)
                      }
                      onDragOver={(e) => handleDragOver(e, 'front', index)}
                      onDragLeave={handleDragLeave}
                      onDrop={(e) => handleDrop(e, 'front', index)}
                    >
                      {character ? (
                        <div 
                          className={`movement-character ${
                            canMoveCharacter(character, 'front') ? 'moveable' : 'immovable'
                          }`}
                          draggable={canMoveCharacter(character, 'front')}
                          onDragStart={(e) => handleDragStart(e, character, 'front', index)}
                          onDragEnd={handleDragEnd}
                          onMouseEnter={() => onCardHover && onCardHover(character)}
                          onMouseLeave={() => onCardHover && onCardHover(null)}
                        >
                          <img 
                            src={getCardImageUrl(character.card_id)}
                            alt={character.name}
                            className="movement-card-image"
                          />
                          {character.isResting && (
                            <div className="rest-overlay">💤</div>
                          )}
                          {canMoveCharacter(character, 'front') && (
                            <div className="move-indicator">📱</div>
                          )}
                          {hasStepAbility(character) && (
                            <div className="step-indicator">▼Step▼</div>
                          )}
                        </div>
                      ) : (
                        <div className="empty-slot-content">
                          {availableDestinations.some(dest => dest.line === 'front' && dest.position === index) && (
                            <div className="destination-indicator">
                              <span>移動先</span>
                              <div className="destination-arrow">↓</div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* プレイヤーエナジーライン */}
              <div className="movement-energy-line">
                <h4>エナジーライン</h4>
                <div className="movement-line-slots">
                  {gameState.playerEnergyLine.map((character, index) => (
                    <div 
                      key={index}
                      className={`movement-slot energy-slot ${
                        character ? 'occupied' : 'empty'
                      } ${
                        selectedCharacter?.line === 'energy' && selectedCharacter?.position === index ? 'selected-source' : ''
                      } ${
                        availableDestinations.some(dest => dest.line === 'energy' && dest.position === index) ? 'available-destination' : ''
                      } ${
                        dragOverSlot?.line === 'energy' && dragOverSlot?.position === index ? 'drag-over' : ''
                      } ${
                        draggedCharacter?.line === 'energy' && draggedCharacter?.position === index ? 'being-dragged' : ''
                      }`}
                      onClick={() => character ? 
                        handleCharacterClick(character, 'energy', index) : 
                        handleDestinationClick('energy', index)
                      }
                      onDragOver={(e) => handleDragOver(e, 'energy', index)}
                      onDragLeave={handleDragLeave}
                      onDrop={(e) => handleDrop(e, 'energy', index)}
                    >
                      {character ? (
                        <div 
                          className={`movement-character ${
                            canMoveCharacter(character, 'energy') ? 'moveable' : 'immovable'
                          }`}
                          draggable={canMoveCharacter(character, 'energy')}
                          onDragStart={(e) => handleDragStart(e, character, 'energy', index)}
                          onDragEnd={handleDragEnd}
                          onMouseEnter={() => onCardHover && onCardHover(character)}
                          onMouseLeave={() => onCardHover && onCardHover(null)}
                        >
                          <img 
                            src={getCardImageUrl(character.card_id)}
                            alt={character.name}
                            className="movement-card-image"
                          />
                          {character.isResting && (
                            <div className="rest-overlay">💤</div>
                          )}
                          {canMoveCharacter(character, 'energy') && (
                            <div className="move-indicator">📱</div>
                          )}
                          <div className="energy-indicator">⚡</div>
                        </div>
                      ) : (
                        <div className="empty-slot-content">
                          {availableDestinations.some(dest => dest.line === 'energy' && dest.position === index) && (
                            <div className="destination-indicator">
                              <span>移動先</span>
                              <div className="destination-arrow">↓</div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* 次のフェーズへボタン（ウィンドウ下部） */}
            <div className="movement-window-footer">
              <button 
                className="movement-next-phase-btn"
                onClick={onNextPhase}
              >
                次のフェーズへ
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 移動中の説明 */}
      {draggedCharacter && !isMinimized && (
        <div className="drag-instructions">
          <div className="drag-info">
            <h4>キャラクター移動中</h4>
            <p>{draggedCharacter.character.name}を移動先にドロップしてください</p>
            {draggedCharacter.line === 'front' && !hasStepAbility(draggedCharacter.character) && (
              <p className="step-warning">
                ⚠️ このキャラクターは▼Step▼能力がないため、エナジーラインに移動できません
              </p>
            )}
          </div>
        </div>
      )}

    </div>
  );
};

export default MovementPhaseUI;