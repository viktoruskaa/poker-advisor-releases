const { createWorker } = require('tesseract.js');
const sharp = require('sharp');

// ВАЖНОЕ ЗАМЕЧАНИЕ:
// Эта реализация является переходом на чистый JavaScript.
// Динамический поиск элементов (как планировалось с OpenCV) - очень сложная задача в JS.
// Поэтому, как временное решение, мы возвращаемся к фиксированным областям сканирования,
// но теперь вся обработка происходит внутри приложения без внешних зависимостей.
// Эти области нужно будет настроить под ваш стол.
const SCAN_AREAS = {
    my_cards: { x: 850, y: 750, width: 180, height: 90 },
    community_cards: { x: 680, y: 450, width: 400, height: 90 },
    pot_size: { x: 880, y: 380, width: 150, height: 50 },
    // TODO: Добавить области для имен, стеков и ставок игроков
};

class Parser {
    constructor() {
        this.worker = null;
        this.isInitialized = false;
    }

    async initialize() {
        if (this.isInitialized) return;
        this.worker = await createWorker('eng');
        this.isInitialized = true;
    }

    async terminate() {
        if (!this.isInitialized) return;
        await this.worker.terminate();
        this.isInitialized = false;
    }

    async _recognizeArea(imageBuffer, areaName) {
        if (!this.isInitialized) {
            throw new Error('Tesseract-worker не инициализирован.');
        }
        const area = SCAN_AREAS[areaName];
        if (!area) return null;

        try {
            const regionBuffer = await sharp(imageBuffer)
                .extract(area)
                .grayscale()
                .normalize()
                .toBuffer();

            const { data: { text } } = await this.worker.recognize(regionBuffer);
            return text.trim();
        } catch (error) {
            console.error(`Ошибка при распознавании области "${areaName}":`, error);
            return '';
        }
    }
    
    _extractCards(text) {
        if (!text) return [];
        const cleanedText = text.replace(/\s/g, '').replace(/i/gi, 'J').replace(/O/gi, 'Q').replace(/1/g, 'T');
        const potentialCards = cleanedText.match(/[2-9TJQKAcdhs]{2}/g) || [];
        const validCards = [];
        for (const cardStr of potentialCards) {
            if (/^[2-9TJQKA]$/i.test(cardStr[0]) && /^[cdhs]$/i.test(cardStr[1])) {
                validCards.push(cardStr);
            }
        }
        return validCards;
    }

    _extractNumber(text) {
        if (!text) return 0;
        const cleaned = text.replace(/[^0-9.]/g, '');
        const number = parseFloat(cleaned);
        return isNaN(number) ? 0 : number;
    }

    async parse(imageBuffer) {
        await this.initialize();

        const potText = await this._recognizeArea(imageBuffer, 'pot_size');
        const communityCardsText = await this._recognizeArea(imageBuffer, 'community_cards');
        const myCardsText = await this._recognizeArea(imageBuffer, 'my_cards');

        const snapshot = {
            players: [], // ЗАГЛУШКА: требует добавления областей сканирования
            hero: {
                cards: this._extractCards(myCardsText)
            },
            board: this._extractCards(communityCardsText),
            pot: this._extractNumber(potText),
            blinds: {}, // ЗАГЛУШКА
            antes: 0 // ЗАГЛУШКА
        };
        
        // await this.terminate(); // Можно раскомментировать для экономии памяти, но замедлит следующий вызов
        return snapshot;
    }
}

module.exports = Parser;