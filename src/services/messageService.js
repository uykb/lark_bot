const axios = require('axios');
const { logger } = require('../utils/logger');
const { generateCardContent } = require('../utils/cardGenerator');
const { getAccessToken } = require('./authService');

// 通过Webhook发送消息
async function sendMessageViaWebhook(data) {
  try {
    const webhookUrl = process.env.WEBHOOK_URL;
    
    if (!webhookUrl) {
      throw new Error('未配置WEBHOOK_URL环境变量');
    }
    
    logger.info('准备通过Webhook发送消息');
    
    // 生成卡片内容
    const cardContent = generateCardContent(data);
    
    // 构建请求体
    const requestBody = {
      msg_type: "interactive",
      card: cardContent
    };
    
    // 发送请求
    const response = await axios.post(webhookUrl, requestBody);
    
    if (response.data.code === 0) {
      logger.info('消息发送成功');
      return response.data;
    } else {
      throw new Error(`消息发送失败: ${response.data.msg}`);
    }
  } catch (error) {
    logger.error('发送消息出错:', error);
    throw error;
  }
}

// 通过飞书API发送消息
async function sendMessageViaAPI(data) {
  try {
    logger.info('准备通过API发送消息');
    
    // 获取访问令牌
    const token = await getAccessToken();
    if (!token) {
      throw new Error('获取访问令牌失败');
    }
    
    // 生成卡片内容
    const cardContent = generateCardContent(data);
    
    // 构建请求体
    const requestBody = {
      receive_id: process.env.CHAT_ID,
      msg_type: "interactive",
      content: JSON.stringify({
        card: cardContent
      })
    };
    
    // 发送请求
    const response = await axios.post(
      'https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=chat_id',
      requestBody,
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      }
    );
    
    if (response.data.code === 0) {
      logger.info('消息发送成功');
      return response.data;
    } else {
      throw new Error(`消息发送失败: ${response.data.msg}`);
    }
  } catch (error) {
    logger.error('发送消息出错:', error);
    throw error;
  }
}

module.exports = {
  sendMessageViaWebhook,
  sendMessageViaAPI
};