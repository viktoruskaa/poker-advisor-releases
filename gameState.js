const isEqual = require('lodash.isequal'); // Потребуется новая зависимость: npm install lodash.isequal

class GameState {
  constructor(myPlayerName) {
    this.myPlayerName = myPlayerName;
    this.bus = null; // Шина событий для new-hand
    this.reset();
  }

  setBus(eventBus) {
    this.bus = eventBus;
  }

  reset() {
    this.handId = null;
    this.players = []; // Массив объектов { name, stack, bet, position, status, isHero }
    this.myCards = [];
    this.communityCards = [];
    this.pot = 0;
    this.currentStreet = 'preflop';
    this.whosTurn = null; // TODO: Определять из парсера
    this.bigBlind = 0;
    this.lastHandResult = { profit: 0 };
    this.lastSnapshot = null;
  }

  getAndClearLastHandResult() {
      // TODO: Реализовать реальный подсчет профита на основе данных из парсера
      return { profit: 0 };
  }

  updateFromSnapshot(snapshot) {
    // Определяем, является ли это новой раздачей.
    // Критерий: карты борда сбросились или изменились карты героя.
    const isNewHand = !this.lastSnapshot || 
                      snapshot.board.length < this.lastSnapshot.board.length ||
                      !isEqual(snapshot.hero.cards, this.lastSnapshot.hero.cards);

    if (isNewHand) {
        const newHandId = Date.now(); // Генерируем ID, т.к. парсер его не дает
        if (this.bus) this.bus.emit('new-hand-started', newHandId);
        this.reset();
        this.handId = newHandId;
    }

    // Обновляем состояние
    this.pot = snapshot.pot || 0;
    this.communityCards = snapshot.board || [];
    this.myCards = snapshot.hero.cards || [];
    this.players = snapshot.players || [];
    this.bigBlind = snapshot.blinds ? snapshot.blinds.big : 0;

    if (this.communityCards.length === 5) this.currentStreet = 'river';
    else if (this.communityCards.length === 4) this.currentStreet = 'turn';
    else if (this.communityCards.length === 3) this.currentStreet = 'flop';
    else this.currentStreet = 'preflop';

    const stateChanged = !isEqual(snapshot, this.lastSnapshot);
    this.lastSnapshot = snapshot;
    return stateChanged;
  }
  
  isMyTurn() {
    // TODO: Реализовать логику определения нашего хода на основе данных из парсера
    // Например, парсер может добавлять флаг "isMyTurn: true" к объекту героя.
    return true; // ЗАГЛУШКА
  }

  getCurrentState() {
    const myPlayer = this.players.find(p => p.name === this.myPlayerName) || 
                     this.players.find(p => p.isHero) || {};
    
    const activePlayers = this.players.filter(p => p.status === 'active' && p.stack > 0);
    const effectiveStack = activePlayers.length > 0 ? Math.min(...activePlayers.map(p => p.stack)) : 0;
    const effectiveStackInBB = this.bigBlind > 0 ? effectiveStack / this.bigBlind : 0;

    return {
      myCards: this.myCards,
      communityCards: this.communityCards,
      pot: this.pot,
      currentStreet: this.currentStreet,
      opponents: this.players.filter(p => p.name !== this.myPlayerName && !p.isHero),
      lastBet: 0, // ЗАГЛУШКА: нужно получать из парсера
      isInPosition: true, // ЗАГЛУШКА: нужно определять по позициям
      isBubble: false, // ЗАГЛУШКА: нужна логика турнира
      table_size: this.players.length,
      position: myPlayer.position || 'Unknown',
      effectiveStackInBB: effectiveStackInBB
    };
  }
}

module.exports = GameState;