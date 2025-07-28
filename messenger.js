const axios = require('axios');

class Messenger {
  constructor(telegramConfig, settings, eventBus = null) {
    this.bus = eventBus;
    this.settings = settings;
    this.lastRecommendation = null;

    if (!telegramConfig.bot_token || telegramConfig.bot_token === "YOUR_TELEGRAM_BOT_TOKEN_HERE") {
        console.error("Токен Telegram-бота не указан в config.json!");
        this.apiUrl = null;
    } else {
        this.apiUrl = `https://api.telegram.org/bot${telegramConfig.bot_token}`;
        if (this.bus) {
            this.startListening();
        }
    }
    this.chatId = telegramConfig.chat_id;
  }

  setLastRecommendation(rec) {
      this.lastRecommendation = rec;
  }

  getLastRecommendation() {
      return this.lastRecommendation;
  }

  startListening() {
    let offset = 0;
    setInterval(async () => {
        try {
            const response = await axios.post(`${this.apiUrl}/getUpdates`, { offset: offset, timeout: 10 });
            const updates = response.data.result;
            if (updates.length > 0) {
                offset = updates[updates.length - 1].update_id + 1;
                this.handleUpdates(updates);
            }
        } catch (error) {
            if (error.code !== 'ECONNABORTED') {
                console.error('Ошибка получения обновлений Telegram:', error.message);
            }
        }
    }, 1000);
  }

  handleUpdates(updates) {
    for (const update of updates) {
        if (update.message && update.message.text) {
            const text = update.message.text;
            if (text.startsWith('/') && this.bus) {
                const [command, ...args] = text.split(' ');
                this.bus.emit('user-command', { type: command, args: args.join(' ') });
            }
        }
    }
  }

  async sendMessage(rec) {
    if (!this.apiUrl || !this.chatId) {
        return;
    }

    let messageText = '';
    if (rec.action) {
        messageText = `РЕКОМЕНДАЦИЯ: ${rec.action}`;
        if (rec.amount) messageText += ` (${rec.amount})`;
        if (this.settings.training_mode && rec.reason) {
            messageText += `\nПричина: ${rec.reason}`;
        }
    } else {
        messageText = rec.text;
    }
    
    const minDelay = this.settings.min_delay_ms || 1000;
    const maxDelay = this.settings.max_delay_ms || 3000;
    const delay = Math.floor(Math.random() * (maxDelay - minDelay + 1)) + minDelay;

    return new Promise(resolve => {
        setTimeout(() => {
            axios.post(`${this.apiUrl}/sendMessage`, { chat_id: this.chatId, text: messageText })
              .catch(error => console.error('Ошибка отправки в Telegram:', error.response ? error.response.data : error.message))
              .finally(() => {
                  resolve();
              });
        }, delay);
    });
  }
}

module.exports = Messenger;