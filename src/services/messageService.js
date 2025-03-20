const axios = require('axios');
const { getAccessToken } = require('./authService');
const { logger } = require('../utils/logger');
const { generateCardContent } = require('../utils/cardGenerator');

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

// 生成文本内容
function generateTextContent(data) {
  const { period, departmentStats, rankingData } = data;
  
  let text = `📊 考勤统计报告\n`;
  text += `统计周期: ${period.start} 至 ${period.end}\n\n`;
  
  // 部门统计
  text += `🏢 部门统计:\n`;
  Object.values(departmentStats).forEach(dept => {
    text += `${dept.departmentName}:\n`;
    text += `  准时: ${dept.totalOnTimeCount} 次\n`;
    text += `  迟到: ${dept.totalLateCount} 次\n\n`;
  });
  
  // 早起排名
  text += `🌅 早起排名:\n`;
  const earlyRanking = rankingData
    .filter(r => !r.isLate)
    .slice(0, 10);
  
  earlyRanking.forEach((record, index) => {
    text += `${index + 1}. ${record.userName} - ${record.checkInTime}\n`;
  });
  
  return text;
}

// 通过飞书API发送消息
async function sendMessageViaAPI(data) {
  try {
    const accessToken = await getAccessToken();
    const chatId = process.env.CHAT_ID;
    const useCard = process.env.USE_CARD !== 'false';
    
    if (!chatId) {
      throw new Error('缺少CHAT_ID环境变量');
    }
    
    logger.info(`准备发送消息到群聊: ${chatId}`);
    
    let messageContent;
    if (useCard) {
      // 使用卡片消息
      messageContent = {
        msg_type: 'interactive',
        card: generateCardContent(data)
      };
    } else {
      // 使用文本消息
      messageContent = {
        msg_type: 'text',
        content: {
          text: generateTextContent(data)
        }
      };
    }
    
    // 发送消息
    const response = await axios.post(
      `https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=chat_id`,
      {
        receive_id: chatId,
        ...messageContent
      },
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    if (response.data.code !== 0) {
      throw new Error(`发送消息失败: ${response.data.msg}`);
    }
    
    logger.info('消息发送成功');
    
    // 如果有额外的群聊ID，也发送到这些群聊
    const additionalChatIds = process.env.ADDITIONAL_CHAT_IDS;
    if (additionalChatIds) {
      const chatIds = additionalChatIds.split(',');
      for (const id of chatIds) {
        if (id.trim()) {
          await sendToChat(id.trim(), messageContent, accessToken);
        }
      }
    }
    
    return response.data;
  } catch (error) {
    logger.error('发送消息出错:', error);
    throw error;
  }
}

// 发送到特定群聊
async function sendToChat(chatId, messageContent, accessToken) {
  try {
    logger.info(`发送消息到额外群聊: ${chatId}`);
    
    const response = await axios.post(
      `https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=chat_id`,
      {
        receive_id: chatId,
        ...messageContent
      },
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    if (response.data.code !== 0) {
      logger.warn(`发送消息到群聊 ${chatId} 失败: ${response.data.msg}`);
    } else {
      logger.info(`消息成功发送到群聊 ${chatId}`);
    }
    
    return response.data;
  } catch (error) {
    logger.error(`发送消息到群聊 ${chatId} 出错:`, error);
    throw error;
  }
}

// 根据环境变量选择发送方式
async function sendMessage(data) {
  // 如果配置了Webhook URL，优先使用Webhook发送
  if (process.env.WEBHOOK_URL) {
    return sendMessageViaWebhook(data);
  } else {
    // 否则使用API发送
    return sendMessageViaAPI(data);
  }
}

module.exports = {
  sendMessage,
  sendMessageViaWebhook,
  sendMessageViaAPI,
  generateTextContent,
  sendToChat
};