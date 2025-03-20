require('dotenv').config();
const { scheduleJob } = require('node-schedule');
const { getAttendanceData, processAttendanceData } = require('./src/services/attendanceService');
const { sendMessageViaWebhook } = require('./src/services/messageService');
const { logger } = require('./src/utils/logger');
const { getCronSchedule } = require('./src/config/cronConfig');

// 主函数 - 获取考勤数据并发送消息
async function main() {
  try {
    logger.info('开始获取考勤数据...');
    const attendanceData = await getAttendanceData();
    
    // 添加详细日志
    logger.debug('获取到的原始考勤数据', attendanceData);
    
    logger.info('处理考勤数据...');
    const processedData = processAttendanceData(attendanceData);
    
    // 添加详细日志
    logger.debug('处理后的考勤数据', processedData);
    
    // 确保数据结构完整
    if (!processedData.departmentStats) {
      logger.warn('处理后的数据缺少 departmentStats 字段，将添加空对象');
      processedData.departmentStats = {};
    }
    
    if (!processedData.rankingData) {
      logger.warn('处理后的数据缺少 rankingData 字段，将添加空数组');
      processedData.rankingData = [];
    }
    
    logger.info('通过Webhook发送考勤统计消息...');
    const response = await sendMessageViaWebhook(processedData);
    
    // 添加详细日志
    logger.debug('消息发送响应', response);
    
    logger.info('考勤统计任务完成');
  } catch (error) {
    logger.error('考勤统计任务失败:', error);
  }
}

// 如果直接运行脚本，立即执行一次
if (require.main === module) {
  logger.info('直接运行脚本，立即执行考勤统计');
  main();
}

// 设置定时任务
const cronSchedule = getCronSchedule();
logger.info(`设置定时任务: ${cronSchedule}`);
scheduleJob(cronSchedule, () => {
  logger.info('定时任务触发，开始执行考勤统计');
  main();
});

logger.info('飞书考勤统计机器人已启动');

// 添加自我 ping 逻辑以保持 Replit 项目运行
const axios = require('axios');
const REPLIT_URL = process.env.REPLIT_URL; // 在 Secrets 中设置你的 Replit URL

if (REPLIT_URL) {
  setInterval(() => {
    axios.get(REPLIT_URL)
      .then(() => console.log('Self-ping successful'))
      .catch(err => console.error('Self-ping failed:', err.message));
  }, 5 * 60 * 1000); // 每5分钟 ping 一次
}