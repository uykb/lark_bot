// 日志工具
const LOG_LEVELS = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3
};

// 获取当前日志级别
const currentLevel = LOG_LEVELS[process.env.LOG_LEVEL?.toLowerCase() || 'info'];
const logPrefix = process.env.LOG_PREFIX || 'LarkAttendance';

// 创建日志记录器
const logger = {
  debug: (...args) => {
    if (currentLevel <= LOG_LEVELS.debug) {
      console.debug(`[${logPrefix}][DEBUG]`, ...args);
    }
  },
  
  info: (...args) => {
    if (currentLevel <= LOG_LEVELS.info) {
      console.info(`[${logPrefix}][INFO]`, ...args);
    }
  },
  
  warn: (...args) => {
    if (currentLevel <= LOG_LEVELS.warn) {
      console.warn(`[${logPrefix}][WARN]`, ...args);
    }
  },
  
  error: (...args) => {
    if (currentLevel <= LOG_LEVELS.error) {
      console.error(`[${logPrefix}][ERROR]`, ...args);
    }
  }
};

module.exports = {
  logger
};