// Вспомогательные функции для компактного описания диапазонов
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];

function expandPairs(hand) { // '66+' -> ['66', '77', ..., 'AA']
    const rank = hand.slice(0, -1);
    const startIndex = RANKS.indexOf(rank);
    return RANKS.slice(startIndex).map(r => `${r}${r}`);
}

function expandSuited(hand) { // 'AJs+' -> ['AJs', 'AQs', 'AKs']
    const rank = hand[0];
    const kicker = hand[1];
    const startIndex = RANKS.indexOf(kicker);
    const rankIndex = RANKS.indexOf(rank);
    return RANKS.slice(startIndex, rankIndex).map(k => `${rank}${k}s`);
}

function expandOffsuit(hand) { // 'AKo+' is complex, for now we list them
    if (hand === 'AKo+') return ['AKo'];
    if (hand === 'AQo+') return ['AQo', 'AKo'];
    return [hand];
}

// Чарты, основанные на вашем исследовательском отчете
const GTO_CHARTS = {
    "9-max": {
        "10-15bb": {
            "UTG": { "push": [...expandPairs('22+'), ...expandOffsuit('AQo+'), ...expandSuited('AQs+')] },
            "BTN": { "push": [...expandPairs('99+'), ...expandOffsuit('AQo+'), ...expandSuited('AJs+'), 'KQs', 'KJs', 'QTs'] }
        },
        "40bb+": {
            "BTN": { "open_raise": [...expandPairs('66+'), ...expandOffsuit('AQo+'), ...expandSuited('AJs+'), 'KQs', 'KJs', 'QTs', 'JTs', 'T9s', '98s'] }
        }
    },
    "6-max": {
        "10-15bb": {
            "UTG": { "open_raise": [...expandPairs('TT+'), ...expandOffsuit('AKo+'), ...expandSuited('AJs+'), 'KQs'] }
        }
    }
};

module.exports = GTO_CHARTS;