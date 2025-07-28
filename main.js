const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
const EventEmitter = require('events');
const screenshot = require('screenshot-desktop');
const sharp = require('sharp');
const { autoUpdater } = require('electron-updater');

// Импорт модулей
const Parser = require('./parser.js');
const GameState = require('./gameState.js');
const Profiler = require('./profiler.js');
const Brain = require('./brain.js');
const Messenger = require('./messenger.js');
const BankrollManager = require('./bankrollManager.js');
const KnowledgeBase = require('./knowledgeBase.js');
const logger = require('./logger.js');

const bus = new EventEmitter();

// Состояние для проактивных уведомлений, чтобы не спамить
let notifiedBubble = false;
let notifiedShortStack = false;

// --- Логика авто-обновления ---
autoUpdater.on('update-available', () => {
  logger.log('Доступно обновление.');
});
autoUpdater.on('update-not-available', () => {
  logger.log('Обновлений нет.');
});
autoUpdater.on('update-downloaded', () => {
  logger.log('Обновление скачано. Оно будет установлено при следующем запуске.');
});
autoUpdater.on('error', (err) => {
  logger.log('Ошибка при обновлении: ' + err);
});

function runMainBot() {
  logger.log('--- Приложение запущено ---');

  const configPath = path.join(__dirname, 'config.json');
  if (!fs.existsSync(configPath)) {
    logger.log('КРИТИЧЕСКАЯ ОШИБКА: Файл config.json не найден!');
    app.quit();
    return;
  }
  const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

  const parser = new Parser(config.ocr_settings, bus);
  const gameState = new GameState(config.poker_client.my_player_name);
  const profiler = new Profiler();
  const brain = new Brain();
  const messenger = new Messenger(config.telegram, config.settings, bus);
  const bankrollManager = new BankrollManager(config.bankroll_management);
  const knowledgeBase = new KnowledgeBase();

  const initialRecommendation = bankrollManager.getRecommendation();
  messenger.sendMessage({ text: initialRecommendation });
  logger.log(`Отправлена рекомендация по банкроллу: ${initialRecommendation.replace(/\n/g, ' ')}`);

  bus.on('new-hand-started', (handInfo) => {
    notifiedBubble = false;
    notifiedShortStack = false;
    const lastHandResult = gameState.getAndClearLastHandResult();
    if (lastHandResult.profit !== 0) {
        bankrollManager.updateBankroll(lastHandResult.profit);
    }
    gameState.startNewHand(handInfo);
    logger.log(`Началась новая рука: ID ${handInfo.handId}`);
  });

  bus.on('game-action', (action) => {
    const stateChanged = gameState.handleAction(action);
    if (stateChanged) {
        const currentState = gameState.getCurrentState();
        if (currentState.isBubble && !notifiedBubble) {
            messenger.sendMessage({ text: "ВНИМАНИЕ: Вы на баббле! Играйте более осторожно." });
            logger.log("Отправлено уведомление о баббле.");
            notifiedBubble = true;
        }
        if (currentState.effectiveStackInBB > 0 && currentState.effectiveStackInBB < 15 && !notifiedShortStack) {
            messenger.sendMessage({ text: `ВНИМАНИЕ: Ваш стек стал коротким (${currentState.effectiveStackInBB.toFixed(1)}bb). Переходите на стратегию Push/Fold.` });
            logger.log(`Отправлено уведомление о коротком стеке: ${currentState.effectiveStackInBB.toFixed(1)}bb.`);
            notifiedShortStack = true;
        }

        if (gameState.isMyTurn()) {
            bus.emit('my-turn-to-act');
        }
    }
  });

  bus.on('my-turn-to-act', () => {
    const currentState = gameState.getCurrentState();
    if (currentState.myCards.length > 0) {
      const recommendation = brain.getRecommendation(currentState, {});
      if (recommendation) {
        logger.log(`Мозг принял решение: ${recommendation.action} (${recommendation.amount || ''}). Причина: ${recommendation.reason}`);
        messenger.setLastRecommendation(recommendation);
        bus.emit('send-recommendation', recommendation);
      }
    }
  });

  bus.on('send-recommendation', (recommendation) => messenger.sendMessage(recommendation));

  bus.on('user-command', (command) => {
    logger.log(`Получена команда от пользователя: ${command.type} ${command.args}`);
    if (command.type === '/why') {
        const explanation = messenger.getLastRecommendation();
        messenger.sendMessage(explanation || { text: "Нет последней рекомендации для объяснения." });
    }
    if (command.type === '/learn') {
        const explanation = knowledgeBase.getTopic(command.args);
        messenger.sendMessage({ text: explanation });
    }
  });

  setInterval(async () => {
    try {
      const fullScreenBuffer = await screenshot();
      for (const areaName in config.scan_areas) {
        const area = config.scan_areas[areaName];
        const areaBuffer = await sharp(fullScreenBuffer)
          .extract({ left: area.x, top: area.y, width: area.width, height: area.height })
          .toBuffer();
        await parser.processArea(areaBuffer, areaName);
      }
    } catch (error) {
      logger.log(`КРИТИЧЕСКАЯ ОШИБКА в главном цикле OCR: ${error.message}`);
    }
  }, config.ocr_settings.scan_interval_ms);
}

app.on('ready', () => {
  runMainBot();
  autoUpdater.checkForUpdatesAndNotify();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});