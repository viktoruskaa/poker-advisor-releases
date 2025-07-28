const tesseract = require('node-tesseract-ocr');
const sharp = require('sharp');
const logger = require('./logger.js');

class Parser {
  constructor(config, eventBus) {
    this.bus = eventBus;
    let tesseractPath = config.tesseract_path;
    if (!tesseractPath.startsWith('"') && !tesseractPath.endsWith('"')) {
      tesseractPath = `"${tesseractPath}"`;
    }

    this.cardConfig = { lang: 'eng', oem: 1, psm: 7, binary: tesseractPath, 'tessedit_char_whitelist': '23456789TJQKAcdhs' };
    this.textConfig = { lang: 'eng', oem: 1, psm: 7, binary: tesseractPath };
    this.numberConfig = { lang: 'eng', oem: 1, psm: 7, binary: tesseractPath, 'tessedit_char_whitelist': '0123456789.,$' };

    this.lastRecognizedData = {};
  }

  async processArea(imageBuffer, areaName) {
    try {
      const processedBuffer = await sharp(imageBuffer).grayscale().normalize().sharpen().toBuffer();
      
      let config;
      if (areaName.includes('cards')) config = this.cardConfig;
      else if (areaName.includes('stack') || areaName.includes('bet') || areaName.includes('pot')) config = this.numberConfig;
      else config = this.textConfig;

      const text = (await tesseract.recognize(processedBuffer, config)).trim();

      if (this.lastRecognizedData[areaName] === text) return;
      this.lastRecognizedData[areaName] = text;
      logger.log(`[${areaName}]: Распознано -> "${text}"`);

      this.parseAndEmit(text, areaName);

    } catch (error) {
      logger.log(`Ошибка Tesseract в области [${areaName}]: ${error.message}`);
    }
  }

  parseAndEmit(text, areaName) {
    if (!text) return;

    if (areaName === 'community_cards') {
      const cards = this._extractCards(text);
      if (cards && cards.length >= 3) {
        if (cards.length === 3) this.bus.emit('action', { type: 'DEAL_FLOP', cards });
        if (cards.length === 4) this.bus.emit('action', { type: 'DEAL_TURN', cards: cards.slice(3) });
        if (cards.length === 5) this.bus.emit('action', { type: 'DEAL_RIVER', cards: cards.slice(4) });
      }
      return;
    }
    if (areaName === 'pot_size') {
      const pot = this._extractNumber(text);
      if (pot !== null) this.bus.emit('action', { type: 'POT_UPDATE', amount: pot });
      return;
    }

    const seatMatch = areaName.match(/seat_(\d+)_(name|stack|bet)/);
    if (seatMatch) {
      const seatId = parseInt(seatMatch[1], 10);
      const dataType = seatMatch[2];

      if (dataType === 'name') {
        this.bus.emit('player_info', { seatId, name: text });
      } else if (dataType === 'stack') {
        const stack = this._extractNumber(text);
        if (stack !== null) this.bus.emit('player_info', { seatId, stack });
      } else if (dataType === 'bet') {
        const bet = this._extractNumber(text);
        if (bet !== null) this.bus.emit('player_action', { seatId, type: 'BET', amount: bet });
      }
    }
  }

  _extractCards(text) {
    const cleanedText = text.replace(/\s/g, '').replace(/i/gi, 'J').replace(/O/gi, 'Q').replace(/1/g, 'T');
    const potentialCards = cleanedText.match(/[2-9TJQKAcdhs]{2}/g) || [];
    const validCards = [];
    for (const cardStr of potentialCards) {
      if (/^[2-9TJQKA]$/i.test(cardStr[0]) && /^[cdhs]$/i.test(cardStr[1])) {
        validCards.push(cardStr);
      }
    }
    return validCards.length > 0 ? validCards : null;
  }

  _extractNumber(text) {
    const cleaned = text.replace(/[^0-9.]/g, '');
    const number = parseFloat(cleaned);
    return isNaN(number) ? null : number;
  }
}

module.exports = Parser;