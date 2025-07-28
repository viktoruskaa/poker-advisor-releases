const PokerEvaluator = require('poker-evaluator');
const GTO_CHARTS = require('./gto-charts.js');

class Brain {
  getRecommendation(gameState, opponentProfiles) {
    if (!gameState.myCards || gameState.myCards.length < 2) {
        return null;
    }

    if (gameState.isBubble && gameState.stackProfile === 'medium') {
        const handStrength = PokerEvaluator.evalHand(gameState.myCards, gameState.communityCards);
        if (handStrength.handRank < 5) {
            return {
                action: 'Check/Fold',
                reason: `ICM давление на баббле. Избегаем риска со средней рукой (${handStrength.handName}), чтобы пересидеть короткие стеки.`
            };
        }
    }

    switch (gameState.currentStreet) {
      case 'preflop':
        return this._getPreflopAction(gameState, opponentProfiles);
      case 'flop':
      case 'turn':
      case 'river':
        return this._getPostflopAction(gameState, opponentProfiles);
      default:
        return { action: 'Fold', reason: 'Логика для этой улицы не реализована.' };
    }
  }

  _getPreflopAction(gameState, opponentProfiles) {
    const { position, effectiveStackInBB, myCards, table_size } = gameState;
    const hand = this._formatHand(myCards);
    const tableKey = `${table_size}-max`;

    let stackRangeKey;
    if (effectiveStackInBB <= 15) stackRangeKey = '10-15bb';
    else if (effectiveStackInBB <= 25) stackRangeKey = '15-25bb';
    else if (effectiveStackInBB <= 40) stackRangeKey = '25-40bb';
    else stackRangeKey = '40bb+';

    const chart = GTO_CHARTS[tableKey]?.[stackRangeKey]?.[position];
    if (!chart) {
      return { action: 'Fold', reason: `Нет GTO-чарта для ${tableKey}, позиции ${position} со стеком ${effectiveStackInBB}bb.` };
    }

    const actionType = effectiveStackInBB <= 15 ? 'push' : 'open_raise';
    let actionRange = [...(chart[actionType] || [])];

    const opponentOnBB = opponentProfiles['PlayerOnBB']; 
    if (position === 'BTN' && opponentOnBB && opponentOnBB.foldToSteal > 80) {
        actionRange.push('97s', '86s', '75s', 'A2o', 'K5o');
    }

    if (actionRange.includes(hand)) {
        const actionText = actionType === 'push' ? 'Push All-in' : 'Raise';
        return {
            action: actionText,
            amount: '2.5bb',
            reason: `Рука (${hand}) входит в стандартный диапазон ${actionType} для ${position} со стеком ${effectiveStackInBB}bb.`
        };
    }

    return {
        action: 'Fold',
        reason: `Рука (${hand}) не входит в диапазон ${actionType} для ${position} со стеком ${effectiveStackInBB}bb.`
    };
  }

  _getPostflopAction(gameState, opponentProfiles) {
    const handStrength = PokerEvaluator.evalHand(gameState.myCards, gameState.communityCards);
    const boardTexture = this._analyzeBoardTexture(gameState.communityCards);
    const { handRank, handName, isDraw } = handStrength;
    const opponent = opponentProfiles['ActiveOpponent'];

    if (isDraw) {
        const potOdds = gameState.lastBet > 0 ? (gameState.lastBet / (gameState.pot + gameState.lastBet)) * 100 : 0;
        const { equity, outs } = this._calculateDrawEquity(gameState.myCards, gameState.communityCards);
        const reason = `У вас дро-рука (${handName}, ${outs} аутов, ~${equity.toFixed(1)}% эквити). Шансы банка: ${potOdds.toFixed(1)}%.`;
        
        if (equity > potOdds) {
            return { action: 'Call', reason: `${reason} Колл является прибыльным.` };
        } else {
            return { action: 'Fold', reason: `${reason} Колл не является прибыльным.` };
        }
    }

    if (gameState.currentStreet === 'flop') {
        if (opponent && opponent.foldToCbet > 60 && boardTexture === 'DRY') {
            return { action: 'Bet', amount: '33% пота', reason: `Эксплойт: C-bet против игрока, который часто фолдит (${opponent.foldToCbet}%).` };
        }
        if (boardTexture === 'DRY' && gameState.isInPosition) {
            return { action: 'Bet', amount: '33% пота', reason: `C-bet на сухой доске в позиции.` };
        }
    }

    if (handRank >= 5) {
        return { action: 'Bet', amount: '66% пота', reason: `Вэлью-бет с сильной рукой (${handName}).` };
    }

    return { action: 'Check/Fold', reason: `Нет достаточных оснований для ставки с рукой ${handName} на доске типа ${boardTexture}.` };
  }

  _calculateDrawEquity(myCards, communityCards) {
      const hand = [...myCards, ...communityCards];
      const handStrength = PokerEvaluator.evalHand(myCards, communityCards);
      let outs = 0;

      if (handStrength.handName.includes('Flush Draw')) {
          const suits = hand.map(c => c[1]);
          const flushSuitEntry = Object.entries(suits.reduce((acc, suit) => { acc[suit] = (acc[suit] || 0) + 1; return acc; }, {})).find(([suit, count]) => count >= 4);
          if (flushSuitEntry) {
            const flushSuit = flushSuitEntry[0];
            outs += (13 - hand.filter(c => c[1] === flushSuit).length);
          }
      }
      
      const equity = communityCards.length === 4 ? outs * 2.1 : outs * 4.2;
      return { equity, outs };
  }

  _analyzeBoardTexture(communityCards) {
    if (!communityCards || communityCards.length < 3) return 'UNKNOWN';
    const ranks = communityCards.map(c => c[0]);
    const suits = communityCards.map(c => c[1]);
    const rankValues = { '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, 'T': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14 };
    if (new Set(suits).size === 1) return 'WET_MONOTONE';
    if (new Set(ranks).size < ranks.length) return 'PAIRED';
    const numericRanks = ranks.map(r => rankValues[r]).sort((a, b) => a - b);
    const isConnected = (numericRanks[2] - numericRanks[0] <= 4) || (numericRanks.length > 3 && numericRanks[3] - numericRanks[1] <= 4);
    const isTwoTone = new Set(suits).size === 2;
    if (isConnected || isTwoTone) return 'WET_DRAWY';
    return 'DRY';
  }

  _formatHand(cards) {
    const c1 = { rank: cards[0][0], suit: cards[0][1] };
    const c2 = { rank: cards[1][0], suit: cards[1][1] };
    if (c1.rank === c2.rank) return `${c1.rank}${c2.rank}`;
    const ranksOrder = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'];
    const highCard = ranksOrder.indexOf(c1.rank) < ranksOrder.indexOf(c2.rank) ? c1 : c2;
    const lowCard = highCard === c1 ? c2 : c1;
    return c1.suit === c2.suit ? `${highCard.rank}${lowCard.rank}s` : `${highCard.rank}${lowCard.rank}o`;
  }
}

module.exports = Brain;