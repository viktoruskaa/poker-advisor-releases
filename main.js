const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const EventEmitter = require('events');
const screenshot = require('screenshot-desktop');
const { autoUpdater } = require('electron-updater');

// Импорт модулей
const GameState = require('./gameState.js');
const Profiler = require('./profiler.js');
const Brain = require('./brain.js');
const Messenger = require('./messenger.js');
const BankrollManager = require('./bankrollManager.js');
const KnowledgeBase = require('./knowledgeBase.js');
const logger = require('./logger.js');

const bus = new EventEmitter();
let isParsing = false;

let notifiedBubble = false;
let notifiedShortStack = false;

autoUpdater.on('update-available', () => logger.log('Доступно обновление.'));
autoUpdater.on('update-not-available', () => logger.log('Обновлений нет.'));
autoUpdater.on('update-downloaded', () => logger.log('Обновление скачано. Оно будет установлено при следующем запуске.'));
autoUpdater.on('error', (err) => logger.log('Ошибка при обновлении: ' + err));

function initializeConfig() {
  const userDataPath = app.getPath('userData');
  const configPath = path.join(userDataPath, 'config.json');

  if (!fs.existsSync(configPath)) {
    logger.log(`Файл конфигурации не найден. Создание нового по пути: ${configPath}`);
    const defaultConfig = {
      "telegram": {
        "bot_token": "8208834544:AAElbxXzLn6RpiQFI6uIb2X6yoYY_e-ygt4",
        "chat_id": "YOUR_TELEGRAM_CHAT_ID_HERE"
      },
      "poker_client": {
        "my_player_name": "YourPlayerName"
      },
      "parser_settings": {
        "scan_interval_ms": 3000,
        "tesseract_path": "C:\\Program Files\\Tesseract-OCR\\tesseract.exe"
      },
      "bankroll_management": {
        "current_bankroll": 1000,
        "risk_level": "standard",
        "currency": "USD"
      },
      "settings": {
        "min_delay_ms": 1500,
        "max_delay_ms": 3500,
        "training_mode": true
      }
    };
    fs.writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2), 'utf-8');
  }
  return configPath;
}

function runMainBot() {
  logger.log('--- Приложение запущено ---');

  const configPath = initializeConfig();
  const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

  const gameState = new GameState(config.poker_client.my_player_name);
  const profiler = new Profiler();
  const brain = new Brain();
  const messenger = new Messenger(config.telegram, config.settings, bus, configPath);
  const bankrollManager = new BankrollManager(config.bankroll_management);
  const knowledgeBase = new KnowledgeBase();

  if (config.telegram.chat_id === 'YOUR_TELEGRAM_CHAT_ID_HERE') {
      const botName = "имя_вашего_бота";
      const message = `!!! ПЕРВЫЙ ЗАПУСК !!!\nПожалуйста, найдите бота в Telegram (@${botName}) и отправьте ему команду /start для получения инструкций.`;
      logger.log(message);
      console.log(message);
  }

  const initialRecommendation = bankrollManager.getRecommendation();
  messenger.sendMessage({ text: initialRecommendation });
  logger.log(`Отправлена рекомендация по банкроллу: ${initialRecommendation.replace(/\n/g, ' ')}`);

  bus.on('snapshot-received', (snapshot) => {
    const stateChanged = gameState.updateFromSnapshot(snapshot);
    if (stateChanged) {
        const currentState = gameState.getCurrentState();
        if (currentState.isBubble && !notifiedBubble) {
            messenger.sendMessage({ text: "ВНИМАНИЕ: Вы на баббле! Играйте более осторожно." });
            notifiedBubble = true;
        }
        if (currentState.effectiveStackInBB > 0 && currentState.effectiveStackInBB < 15 && !notifiedShortStack) {
            messenger.sendMessage({ text: `ВНИМАНИЕ: Ваш стек стал коротким (${currentState.effectiveStackInBB.toFixed(1)}bb). Переходите на стратегию Push/Fold.` });
            notifiedShortStack = true;
        }
        if (gameState.isMyTurn()) bus.emit('my-turn-to-act');
    }
  });

  bus.on('new-hand-started', (handId) => {
    notifiedBubble = false;
    notifiedShortStack = false;
    const lastHandResult = gameState.getAndClearLastHandResult();
    if (lastHandResult.profit !== 0) bankrollManager.updateBankroll(lastHandResult.profit);
    logger.log(`Началась новая рука: ID ${handId}`);
  });

  bus.on('my-turn-to-act', () => {
    const currentState = gameState.getCurrentState();
    if (currentState.myCards.length > 0) {
      const opponentProfiles = profiler.getProfiles(currentState.opponents);
      const recommendation = brain.getRecommendation(currentState, opponentProfiles);
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
    if (command.type === '/why') messenger.sendMessage(messenger.getLastRecommendation() || { text: "Нет последней рекомендации для объяснения." });
    if (command.type === '/learn') messenger.sendMessage({ text: knowledgeBase.getTopic(command.args) });
  });

  setInterval(async () => {
    if (isParsing) return;
    isParsing = true;
    
    try {
      const isDev = !app.isPackaged;
      const resourcesPath = isDev ? path.join(__dirname, 'resources') : process.resourcesPath;
      const parserExePath = path.join(resourcesPath, 'parser.exe');
      
      if (!fs.existsSync(parserExePath)) {
          throw new Error(`Парсер не найден по пути: ${parserExePath}`);
      }

      const screenshotPath = path.join(app.getPath('temp'), 'poker_advisor_screenshot.png');
      await screenshot({ filename: screenshotPath });
      
      const parserProc = spawn(parserExePath, [
        screenshotPath,
        config.parser_settings.tesseract_path
      ]);

      let parserOutput = '';
      parserProc.stdout.on('data', (data) => { parserOutput += data.toString(); });
      let parserError = '';
      parserProc.stderr.on('data', (data) => { parserError += data.toString(); });

      parserProc.on('close', (code) => {
        if (parserError) logger.log(`Ошибка Python-парсера: ${parserError}`);
        try {
          const snapshot = JSON.parse(parserOutput);
          if (snapshot.error) logger.log(`Ошибка от парсера: ${snapshot.error}`);
          else bus.emit('snapshot-received', snapshot);
        } catch (e) {
          logger.log(`Не удалось распарсить JSON от Python: ${e.message}. Получено: ${parserOutput}`);
        } finally {
          fs.unlink(screenshotPath, () => {});
          isParsing = false;
        }
      });

    } catch (error) {
      logger.log(`КРИТИЧЕСКАЯ ОШИБКА в главном цикле: ${error.message}`);
      isParsing = false;
    }
  }, config.parser_settings.scan_interval_ms);
}

app.on('ready', () => {
  runMainBot();
  autoUpdater.checkForUpdatesAndNotify();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});