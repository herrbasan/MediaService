const config = require('../config/config');

const levels = { error: 0, warn: 1, info: 2, debug: 3 };
const currentLevel = levels[config.logLevel] ?? levels.info;

function formatMessage(level, message, meta = {}) {
  const timestamp = new Date().toISOString();
  const metaStr = Object.keys(meta).length > 0 ? ' ' + JSON.stringify(meta) : '';
  return `[${timestamp}] [${level.toUpperCase()}] ${message}${metaStr}`;
}

const logger = {
  error: (message, meta) => {
    if (currentLevel >= levels.error) console.error(formatMessage('error', message, meta));
  },
  warn: (message, meta) => {
    if (currentLevel >= levels.warn) console.warn(formatMessage('warn', message, meta));
  },
  info: (message, meta) => {
    if (currentLevel >= levels.info) console.log(formatMessage('info', message, meta));
  },
  debug: (message, meta) => {
    if (currentLevel >= levels.debug) console.log(formatMessage('debug', message, meta));
  },
};

module.exports = logger;
