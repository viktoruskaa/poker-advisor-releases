const axios = require('axios');

class Messenger {
  constructor(telegramConfig, settings, eventBus = null, configPath = '') {
    this.bus = eventBus;
    this.settings = settings;
    this.lastRecommendation = null;
    this.configPath = configPath;

    if (!telegramConfig.bot_token || telegramConfig.bot_token.includes("YOUR_TELEGRAM")) {
        console.error("Токен Telegram-бота не указан или является заглушкой!");
        this.apiUrl = null;
    } else {
        this.apiUrl = `https://api.telegram.org/bot${telegramConfig.bot_token}`;
        if (this.bus) this.startListening();
    }
    this.chatId = telegramConfig.chat_id.includes("YOUR_TELEGRAM") ? null : telegramConfig.chat_id;
  }

  setLastRecommendation(rec) { this.lastRecommendation = rec; }
  getLastRecommendation() { return this.lastRecommendation; }

  startListening() {
    let offset = 0;
    setInterval(async () => {
        if (!this.apiUrl) return;
        try {
            const response = await axios.post(`${this.apiUrl}/getUpdates`, { offset: offset, timeout: 10 });
            const updates = response.data.result;
            if (updates.length > 0) {
                offset = updates[updates.length - 1].update_id + 1;
                this.handleUpdates(updates);
            }
        } catch (error) {
            if (error.code !== 'ECONNABORTED') console.error('Ошибка получения обновлений Telegram:', error.message);
        }
    }, 1000);
  }

  handleUpdates(updates) {
    for (const update of updates) {
        if (update.message && update.message.text) {
            const text = update.message.text;
            const chatId = update.message.chat.id;
            const firstName = update.message.from.first_name;

            if (text.startsWith('/start')) {
                const welcomeMessage = this.getWelcomeMessage(chatId, firstName);
                this.sendDirectMessage(chatId, welcomeMessage);
            } else if (text.startsWith('/') && this.bus) {
                const [command, ...args] = text.split(' ');
                this.bus.emit('user-command', { type: command, args: args.join(' ') });
            }
        }
    }
  }

  getWelcomeMessage(chatId, firstName) {
    return `👋 Привет, ${firstName}! Добро пожаловать в Poker Advisor.

Приложение почти готово к работе!

**ШАГ 1: Найдите и откройте файл конфигурации**
Он был автоматически создан здесь:
\`${this.configPath}\`
(Скопируйте этот путь и вставьте в адресную строку вашего проводника)

**ШАГ 2: Отредактируйте файл**
Откройте \`config.json\` в Блокноте и настройте два параметра:

1.  Ваш \`chat_id\`: \`${chatId}\`
2.  Ваш никнейм в покере: \`Ваш_Ник_В_Игре\`

Пример после редактирования:
\`\`\`json
"chat_id": "${chatId}",
"my_player_name": "PokerShark123"
\`\`\`

**ШАГ 3: Сохраните файл и перезапустите приложение**
После сохранения просто закройте и снова запустите "Desktop Service Utility". Больше ничего устанавливать не нужно. Удачи!`;
  }

  async sendDirectMessage(chatId, text) {
      if (!this.apiUrl) return;
      try {
          await axios.post(`${this.apiUrl}/sendMessage`, { chat_id: chatId, text: text, parse_mode: 'Markdown' });
      } catch (error) {
          console.error('Ошибка прямой отправки в Telegram:', error.response ? error.response.data : error.message);
      }
  }

  async sendMessage(rec) {
    if (!this.apiUrl || !this.chatId) return;
    let messageText = rec.action ? `РЕКОМЕНДАЦИЯ: ${rec.action}${rec.amount ? ` (${rec.amount})` : ''}${this.settings.training_mode && rec.reason ? `\nПричина: ${rec.reason}` : ''}` : rec.text;
    const delay = Math.floor(Math.random() * (this.settings.max_delay_ms - this.settings.min_delay_ms + 1)) + this.settings.min_delay_ms;

    return new Promise(resolve => {
        setTimeout(() => {
            axios.post(`${this.apiUrl}/sendMessage`, { chat_id: this.chatId, text: messageText })
              .catch(error => console.error('Ошибка отправки в Telegram:', error.response ? error.response.data : error.message))
              .finally(resolve);
        }, delay);
    });
  }
}

module.exports = Messenger;