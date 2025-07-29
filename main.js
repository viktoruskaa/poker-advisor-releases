const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const EventEmitter = require('events');
const screenshot = require('screenshot-desktop');
const { autoUpdater } = require('electron-updater');
const axios = require('axios');
const log = require('electron-log/main');

// --- Настройка логирования ---
// Логи будут сохраняться в C:\Users\<User>\AppData\Roaming\desktop-utility-service\logs\main.log
log.transports.file.resolvePath = () => path.join(app.getPath('userData'), 'logs', 'main.log');
log.transports.file.level = 'debug';
log.transports.file.format = '[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}] {text}';

// Очистка старого лог-файла при каждом запуске
try {
  const logFilePath = log.transports.file.getFile().path;
  if (fs.existsSync(logFilePath)) {
    fs.unlinkSync(logFilePath);
  }
} catch (e) {
  console.error('Не удалось очистить старый лог-файл:', e);
}
// ----------------------------

// Импорт модулей
const GameState = require('./gameState.js');
const Profiler = require('./profiler.js');
const Brain = require('./brain.js');
const Messenger = require('./messenger.js');
const BankrollManager = require('./bankrollManager.js');
const KnowledgeBase = require('./knowledgeBase.js');

const bus = new EventEmitter();
let isParsing = false;

let notifiedBubble = false;
let notifiedShortStack = false;

// --- Детальное логирование autoUpdater ---
autoUpdater.on('checking-for-update', () => log.info('[Updater] Проверка наличия обновлений...'));
autoUpdater.on('update-available', (info) => log.info(`[Updater] Доступно обновление: ${info.version}`));
autoUpdater.on('update-not-available', (info) => log.info(`[Updater] Обновлений нет. Текущая версия: ${info.version}`));
autoUpdater.on('error', (err) => log.error(`[Updater] Ошибка при обновлении: ${err.toString()}`));
autoUpdater.on('download-progress', (progressObj) => {
  let log_message = `[Updater] Скорость загрузки: ${progressObj.bytesPerSecond} B/s`;
  log_message += ` - Скачано ${progressObj.percent.toFixed(2)}%`;
  log_message += ` (${progressObj.transferred}/${progressObj.total})`;
  log.info(log_message);
});
autoUpdater.on('update-downloaded', (info) => log.info(`[Updater] Обновление скачано (${info.version}). Оно будет установлено при следующем запуске.`));
// -----------------------------------------

async function checkGitHubApi() {
  const url = 'https://api.github.com/repos/viktoruskaa/poker-advisor-releases/releases';
  log.info(`[Updater] Диагностика: Проверка доступности GitHub API по адресу: ${url}`);
  try {
    await axios.get(url);
    log.info('[Updater] Диагностика: GitHub API доступен. Сетевое соединение в порядке.');
  } catch (error) {
    log.error(`[Updater] Диагностика: Ошибка при доступе к GitHub API: ${error.message}`);
  }
}

function initializeConfig() {
  const userDataPath = app.getPath('userData');
  const configPath = path.join(userDataPath, 'config.json');

  if (!fs.existsSync(configPath)) {
    log.warn(`Файл конфигурации не найден. Создание нового по пути: ${configPath}`);
    const defaultConfig = {
      "telegram": {
        "bot_token": "8208834544:AAElbxXzLn6RpiQFI6uIb2X6yoYY_e-ygt4",
        "chat_id": "YOUR_TELEGRAM_CHAT_ID_HERE"
      },
      "poker_client": { "my_player_name": "YourPlayerName" },
      "parser_settings": {
        "scan_interval_ms": 3000,
        "tesseract_path": "C:\\Program Files\\Tesseract-OCR\\tesseract.exe"
      },
      "bankroll_management": { "current_bankroll": 1000, "risk_level": "standard", "currency": "USD" },
      "settings": { "min_delay_ms": 1500, "max_delay_ms": 3500, "training_mode": true }
    };
    fs.writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2), 'utf-8');
  }
  return configPath;
}

function runMainBot() {
  log.info('--- Приложение запущено ---');

  checkGitHubApi();

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
      log.warn(message);
      console.warn(message);
  }

  const initialRecommendation = bankrollManager.getRecommendation();
  messenger.sendMessage({ text: initialRecommendation });
  log.info(`Отправлена рекомендация по банкроллу: ${initialRecommendation.replace(/\n/g, ' ')}`);

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
    log.info(`Началась новая рука: ID ${handId}`);
  });

  bus.on('my-turn-to-act', () => {
    const currentState = gameState.getCurrentState();
    if (currentState.myCards.length > 0) {
      const opponentProfiles = profiler.getProfiles(currentState.opponents);
      const recommendation = brain.getRecommendation(currentState, opponentProfiles);
      if (recommendation) {
        log.info(`Мозг принял решение: ${recommendation.action} (${recommendation.amount || ''}). Причина: ${recommendation.reason}`);
        messenger.setLastRecommendation(recommendation);
        bus.emit('send-recommendation', recommendation);
      }
    }
  });

  bus.on('send-recommendation', (recommendation) => messenger.sendMessage(recommendation));
  bus.on('user-command', (command) => {
    log.info(`Получена команда от пользователя: ${command.type} ${command.args}`);
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
        if (parserError) log.error(`Ошибка Python-парсера: ${parserError}`);
        try {
          const snapshot = JSON.parse(parserOutput);
          if (snapshot.error) log.error(`Ошибка от парсера: ${snapshot.error}`);
          else bus.emit('snapshot-received', snapshot);
        } catch (e) {
          log.error(`Не удалось распарсить JSON от Python: ${e.message}. Получено: ${parserOutput}`);
        } finally {
          fs.unlink(screenshotPath, () => {});
          isParsing = false;
        }
      });

    } catch (error) {
      log.error(`КРИТИЧЕСКАЯ ОШИБКА в главном цикле: ${error.message}`);
      isParsing = false;
    }
  }, config.parser_settings.scan_interval_ms);
}

app.on('ready', () => {
  runMainBot();
  log.info('[Updater] Запуск проверки обновлений...');
  autoUpdater.checkForUpdatesAndNotify();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});