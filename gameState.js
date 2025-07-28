class GameState {
  constructor(myPlayerName) {
    this.myPlayerName = myPlayerName;
    this.reset();
  }

  reset() {
    this.handId = null;
    this.players = []; // Массив объектов { id, name, stack, bet, position }
    this.myCards = [];
    this.communityCards = [];
    this.pot = 0;
    this.currentStreet = 'preflop';
    this.whosTurn = null;
    this.lastBet = 0;
    this.bigBlind = 0;
    this.lastHandResult = { profit: 0 };
  }

  startNewHand(handInfo) {
    const lastResult = this.getAndClearLastHandResult();
    const playersFromLastHand = this.players.map(p => ({ id: p.id, name: p.name, stack: p.stack }));
    this.reset();
    this.handId = handInfo.handId;
    this.players = playersFromLastHand; // Сохраняем игроков для новой раздачи
    this.lastHandResult = lastResult;
  }

  getAndClearLastHandResult() {
      // TODO: Реализовать реальный подсчет профита
      return { profit: 0 };
  }

  handleAction(action) {
    let stateChanged = false;
    // Обновляем информацию об игроках
    if (action.seatId !== undefined) {
        let player = this.players.find(p => p.id === action.seatId);
        if (!player) {
            player = { id: action.seatId };
            this.players.push(player);
        }
        if (action.name) player.name = action.name;
        if (action.stack) player.stack = action.stack;
        if (action.type === 'BET') player.bet = action.amount;
    }

    // Обновляем состояние стола
    if (action.type === 'DEAL_HERO') this.myCards = action.cards; // Предполагается, что парсер определит наши карты
    if (action.type === 'DEAL_FLOP') { this.currentStreet = 'flop'; this.communityCards = action.cards; stateChanged = true; }
    if (action.type === 'DEAL_TURN') { this.currentStreet = 'turn'; this.communityCards.push(...action.cards); stateChanged = true; }
    if (action.type === 'DEAL_RIVER') { this.currentStreet = 'river'; this.communityCards.push(...action.cards); stateChanged = true; }
    if (action.type === 'POT_UPDATE') this.pot = action.amount;

    return stateChanged;
  }
  
  isMyTurn() {
    // TODO: Реализовать логику определения нашего хода
    return true;
  }

  getCurrentState() {
    const myPlayer = this.players.find(p => p.name === this.myPlayerName) || {};
    const effectiveStack = Math.min(...this.players.filter(p => p.stack > 0).map(p => p.stack));
    const effectiveStackInBB = this.bigBlind > 0 ? effectiveStack / this.bigBlind : 0;

    return {
      myCards: this.myCards,
      communityCards: this.communityCards,
      pot: this.pot,
      currentStreet: this.currentStreet,
      opponents: this.players.filter(p => p.name !== this.myPlayerName),
      lastBet: this.lastBet,
      isInPosition: true, // ЗАГЛУШКА
      isBubble: false, // ЗАГЛУШКА
      table_size: this.players.length,
      position: myPlayer.position || 'Unknown',
      effectiveStackInBB: effectiveStackInBB
    };
  }
}

module.exports = GameState;