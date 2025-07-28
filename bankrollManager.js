const Store = require('electron-store');

class BankrollManager {
  constructor(config) {
    this.config = config;
    this.store = new Store({
        name: 'bankroll-data',
        defaults: {
            current_bankroll: this.config.current_bankroll || 0,
            tournaments_played: 0,
            recent_results: [] // Массив последних 100 результатов
        }
    });
    this.rules = {
      conservative: { min_abi: 200 },
      standard: { min_abi: 100 },
      aggressive: { min_abi: 50 }
    };
  }

  getCurrentBankroll() {
    return this.store.get('current_bankroll');
  }

  updateBankroll(profitOrLoss) {
    const current = this.getCurrentBankroll();
    const played = this.store.get('tournaments_played');
    const results = this.store.get('recent_results');

    results.push(profitOrLoss);
    if (results.length > 100) {
        results.shift(); // Оставляем только последние 100
    }

    this.store.set('current_bankroll', current + profitOrLoss);
    this.store.set('tournaments_played', played + 1);
    this.store.set('recent_results', results);
  }

  getRecommendation() {
    const bankroll = this.getCurrentBankroll();
    let riskLevel = this.config.risk_level || 'standard';

    // Динамическая корректировка риска
    if (this._isDownswing()) {
        riskLevel = 'conservative';
    }

    const rule = this.rules[riskLevel];
    if (!rule) {
        return `ОШИБКА: Неверный уровень риска "${riskLevel}" в config.json.`;
    }

    const recommendedABI = (bankroll / rule.min_abi).toFixed(2);
    let message = `--- Управление Банкроллом ---\n` +
                  `Текущий банкролл: ${bankroll.toFixed(2)} ${this.config.currency}\n` +
                  `Уровень риска: ${riskLevel}\n` +
                  `Рекомендуемый средний бай-ин (ABI): до ${recommendedABI} ${this.config.currency}`;

    if (this._isDownswing()) {
        message += `\nВНИМАНИЕ: Обнаружен даунсвинг! Рекомендуется более консервативная стратегия.`;
    }

    return message;
  }

  _isDownswing() {
      const results = this.store.get('recent_results');
      const tournamentsPlayed = this.store.get('tournaments_played');
      if (tournamentsPlayed < 100) return false;

      // Считаем проигрыш в бай-инах за последние 100 турниров
      const averageBuyIn = Math.abs(results.reduce((a, b) => a + (b < 0 ? b : 0), 0) / results.filter(r => r < 0).length) || 10;
      const totalLoss = results.reduce((a, b) => a + b, 0);
      
      // Проигрыш 20 бай-инов за 100 турниров
      return totalLoss < -(20 * averageBuyIn);
  }
}

module.exports = BankrollManager;