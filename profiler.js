const Store = require('electron-store');

class Profiler {
  constructor() {
    this.store = new Store({ name: 'player-stats' });
    this.sessionStats = {};
  }

  onNewHand(players) {
    this.sessionStats = {};
    if (Array.isArray(players)) {
        players.forEach(p => {
          this.sessionStats[p.name] = { vpip: false, pfr: false };
        });
    }
  }

  processAction(action) {
    // ВАЖНО: Текущий парсер не предоставляет детальных данных.
    // Эта функция написана "на вырост" и будет работать, когда парсер будет улучшен.
    const player = action.player;
    if (!player) return;

    const stats = this.store.get(player, this._getDefaultStats());

    // Базовая статистика VPIP/PFR
    if (['CALL', 'RAISE', 'BET'].includes(action.type) && !this.sessionStats[player]?.vpip) {
      stats.vpip_hands++;
      this.sessionStats[player].vpip = true;
    }
    if (action.type === 'RAISE' && action.street === 'preflop' && !this.sessionStats[player]?.pfr) {
      stats.pfr_hands++;
      this.sessionStats[player].pfr = true;
    }

    // Продвинутая статистика (требует улучшенного парсера)
    if (action.type === '3-BET') stats.three_bet_hands++;
    if (action.type === 'FOLD_TO_CBET') stats.fold_to_cbet_hands++;
    if (action.type === 'CBET_OPPORTUNITY') stats.cbet_opportunities++;
    if (['BET', 'RAISE'].includes(action.type)) stats.aggressive_actions++;
    if (action.type === 'CALL') stats.passive_actions++;
    if (action.type === 'WENT_TO_SHOWDOWN') stats.wtsd_hands++;
    
    stats.total_hands++;
    this.store.set(player, stats);
  }

  getProfiles(opponents) {
    const profiles = {};
    if (Array.isArray(opponents)) {
        opponents.forEach(opp => {
          const stats = this.store.get(opp.name, this._getDefaultStats());
          const calculatedStats = this._calculateStats(stats);
          profiles[opp.name] = {
              ...calculatedStats,
              classification: this._classifyPlayer(calculatedStats)
          };
        });
    }
    return profiles;
  }

  _calculateStats(stats) {
    const { total_hands, vpip_hands, pfr_hands, aggressive_actions, passive_actions, fold_to_cbet_hands, cbet_opportunities, wtsd_hands, three_bet_hands } = stats;
    const vpip = total_hands > 0 ? (vpip_hands / total_hands) * 100 : 0;
    const pfr = total_hands > 0 ? (pfr_hands / total_hands) * 100 : 0;
    const af = passive_actions > 0 ? aggressive_actions / passive_actions : aggressive_actions;
    const foldToCbet = cbet_opportunities > 0 ? (fold_to_cbet_hands / cbet_opportunities) * 100 : 0;
    const wtsd = total_hands > 0 ? (wtsd_hands / total_hands) * 100 : 0;
    const threeBet = total_hands > 0 ? (three_bet_hands / total_hands) * 100 : 0;

    return { vpip, pfr, af, foldToCbet, wtsd, threeBet, total_hands };
  }

  _classifyPlayer(stats) {
    const { vpip, pfr, af } = stats;
    if (stats.total_hands < 50) return 'Unknown';

    // Классификация на основе вашей таблицы
    if (vpip > 35 && pfr < 10 && af < 1.5) return 'Loose-Passive (Fish)';
    if (vpip > 24 && pfr > 18) return 'Loose-Aggressive (LAG)';
    if (vpip < 15 && pfr < 10) return 'Tight-Passive (Nit)';
    if (vpip < 18 && pfr > 10 && af > 3) return 'Tight-Aggressive (TAG)';
    
    return 'Standard';
  }

  _getDefaultStats() {
    return {
      total_hands: 0,
      vpip_hands: 0,
      pfr_hands: 0,
      three_bet_hands: 0,
      cbet_opportunities: 0,
      fold_to_cbet_hands: 0,
      wtsd_hands: 0,
      aggressive_actions: 0,
      passive_actions: 0
    };
  }
}

module.exports = Profiler;