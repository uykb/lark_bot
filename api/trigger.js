require('dotenv').config();
const { getAttendanceData, processAttendanceData } = require('../src/services/attendanceService');
const { sendMessageViaWebhook, sendMessageViaAPI } = require('../src/services/messageService');
const { logger } = require('../src/utils/logger');

module.exports = async (req, res) => {
  // 验证请求方法
  if (req.method !== 'POST') {
    return res.status(405).json({ error: '仅支持POST请求' });
  }

  // 验证触发密钥
  const triggerKey = req.headers['x-trigger-key'] || req.query.key;
  if (!triggerKey || triggerKey !== process.env.TRIGGER_KEY) {
    logger.warn('触发密钥验证失败');
    return res.status(401).json({ error: '触发密钥无效' });
  }

  try {
    logger.info('手动触发考勤统计...');
    
    // 获取考勤数据
    const attendanceData = await getAttendanceData();
    logger.debug('获取到的原始考勤数据', attendanceData);
    
    // 处理考勤数据
    const processedData = processAttendanceData(attendanceData);
    logger.debug('处理后的考勤数据', processedData);
    
    // 发送消息
    if (process.env.WEBHOOK_URL) {
      await sendMessageViaWebhook(processedData);
    } else {
      await sendMessageViaAPI(processedData);
    }
    
    logger.info('手动触发执行完成');
    return res.status(200).json({ message: '考勤统计已完成' });
  } catch (error) {
    logger.error('手动触发执行失败:', error);
    return res.status(500).json({ error: '执行失败，请查看日志' });
  }
};