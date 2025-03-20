// 增强版日志工具
const moment = require('moment');

// 日志级别
const LOG_LEVELS = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3
};

// 获取当前日志级别
const getCurrentLogLevel = () => {
  const level = (process.env.LOG_LEVEL || 'info').toLowerCase();
  return LOG_LEVELS[level] !== undefined ? LOG_LEVELS[level] : LOG_LEVELS.info;
};

// 是否显示详细日志
const showDetailedLogs = () => {
  return process.env.SHOW_DETAILED_LOGS === 'true';
};

// 格式化日志消息
const formatLogMessage = (level, message, details) => {
  const timestamp = moment().format('YYYY-MM-DD HH:mm:ss.SSS');
  let formattedMessage = `[${timestamp}] [${level.toUpperCase()}] ${message}`;
  
  if (details && showDetailedLogs()) {
    if (typeof details === 'object') {
      try {
        // 限制对象深度和长度，避免日志过长
        const stringified = JSON.stringify(details, null, 2);
        formattedMessage += `\n${stringified}`;
      } catch (e) {
        formattedMessage += `\n[无法序列化的对象: ${e.message}]`;
      }
    } else {
      formattedMessage += `\n${details}`;
    }
  }
  
  return formattedMessage;
};

// 日志工具
const logger = {
  debug: (message, details) => {
    if (getCurrentLogLevel() <= LOG_LEVELS.debug) {
      console.log(formatLogMessage('debug', message, details));
    }
  },
  
  info: (message, details) => {
    if (getCurrentLogLevel() <= LOG_LEVELS.info) {
      console.log(formatLogMessage('info', message, details));
    }
  },
  
  warn: (message, details) => {
    if (getCurrentLogLevel() <= LOG_LEVELS.warn) {
      console.warn(formatLogMessage('warn', message, details));
    }
  },
  
  error: (message, error) => {
    if (getCurrentLogLevel() <= LOG_LEVELS.error) {
      let errorDetails = error;
      
      // 增强错误日志，提取更多信息
      if (error instanceof Error) {
        errorDetails = {
          message: error.message,
          stack: error.stack,
          name: error.name
        };
        
        // 提取响应信息
        if (error.response) {
          errorDetails.response = {
            status: error.response.status,
            statusText: error.response.statusText,
            data: error.response.data
          };
        }
      }
      
      console.error(formatLogMessage('error', message, errorDetails));
    }
  }
};

module.exports = {
  logger
};