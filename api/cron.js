// Vercel Cron Job 入口点
require('dotenv').config();
const { getAttendanceData, processAttendanceData } = require('../src/services/attendanceService');
const { sendMessageViaWebhook, sendMessageViaAPI } = require('../src/services/messageService');
const { logger } = require('../src/utils/logger');

// 主函数 - 获取考勤数据并发送消息
async function main() {
  try {
    logger.info('开始获取考勤数据...');
    logger.info('使用真实数据模式，直接查询API');
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
    
    // 根据配置选择发送方式
    if (process.env.WEBHOOK_URL) {
      logger.info('通过Webhook发送考勤统计消息...');
      const response = await sendMessageViaWebhook(processedData);
      logger.debug('消息发送响应', response);
    } else {
      logger.info('通过API发送考勤统计消息...');
      const response = await sendMessageViaAPI(processedData);
      logger.debug('消息发送响应', response);
    }
    
    logger.info('考勤统计任务完成');
    return { success: true };
  } catch (error) {
    logger.error('考勤统计任务失败:', error);
    return { success: false, error: error.message };
  }
}

// 导出为Vercel Serverless函数
module.exports = async (req, res) => {
  try {
    logger.info('Vercel Cron Job 触发，开始执行考勤统计');
    const result = await main();
    res.status(200).json(result);
  } catch (error) {
    logger.error('Vercel Cron Job 执行失败:', error);
    res.status(500).json({ error: error.message });
  }
};