const fs = require('fs');
const path = require('path');

const logFilePath = path.join(__dirname, 'poker-advisor.log');

function log(message) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}\n`;

  try {
    fs.appendFileSync(logFilePath, logMessage, 'utf8');
  } catch (error) {
    console.error('Не удалось записать в лог-файл:', error);
  }
}

module.exports = { log };