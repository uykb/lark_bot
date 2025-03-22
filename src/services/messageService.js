const lark = require('@larksuiteoapi/node-sdk');
const axios = require('axios');
const { logger } = require('../utils/logger');
const { generateCardContent } = require('../utils/cardGenerator');

// 初始化飞书SDK客户端
const client = new lark.Client({
  appId: process.env.APP_ID,
  appSecret: process.env.APP_SECRET,
  disableTokenCache: false // 启用SDK的Token自动管理
});


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
  
  let text = `📊 早上6:30-8:30打卡记录排行榜\n`;
  text += `统计周期: ${period.start} 至 ${period.end}\n\n`;
  
  // 部门统计
  text += `🏢 部门统计:\n`;
  if (Object.keys(departmentStats).length === 0) {
    text += `暂无部门统计数据\n\n`;
  } else {
    Object.values(departmentStats).forEach(dept => {
      text += `${dept.departmentName}:\n`;
      text += `  准时: ${dept.totalOnTimeCount} 次\n`;
      text += `  迟到: ${dept.totalLateCount} 次\n\n`;
    });
  }
  
  // 早起排名
  text += `🌅 早起排名 (6:30-8:30):\n`;
  
  // 按用户分组，计算每个用户的平均打卡时间
  const userCheckInMap = {};
  
  rankingData.forEach(record => {
    // 只处理早上6:30-8:30之间的打卡记录
    if (!record.isInMorningRange) return; // 跳过不在早上时间范围内的记录
    
    if (!userCheckInMap[record.userId]) {
      userCheckInMap[record.userId] = {
        userId: record.userId,
        userName: record.userName,
        checkInTimes: [],
        dates: []
      };
    }
    
    // 只记录每天第一次打卡
    const dateExists = userCheckInMap[record.userId].dates.includes(record.date);
    if (!dateExists) {
      userCheckInMap[record.userId].checkInTimes.push(record.checkInTime);
      userCheckInMap[record.userId].dates.push(record.date);
    }
  });
  
  // 计算平均打卡时间
  const userAverages = Object.values(userCheckInMap).map(user => {
    if (user.checkInTimes.length === 0) return null;
    
    // 计算平均时间（转换为分钟后计算）
    const totalMinutes = user.checkInTimes.reduce((sum, time) => {
      const [hours, minutes] = time.split(':').map(Number);
      return sum + (hours * 60 + minutes);
    }, 0);
    
    const avgMinutes = totalMinutes / user.checkInTimes.length;
    const avgHours = Math.floor(avgMinutes / 60);
    const avgMins = Math.floor(avgMinutes % 60);
    
    return {
      userId: user.userId,
      userName: user.userName,
      avgCheckInTime: `${avgHours.toString().padStart(2, '0')}:${avgMins.toString().padStart(2, '0')}`,
      checkInCount: user.checkInTimes.length,
      totalMinutes: avgMinutes // 用于排序
    };
  }).filter(Boolean);
  
  // 按平均打卡时间排序
  userAverages.sort((a, b) => a.totalMinutes - b.totalMinutes);
  
  const rankingLimit = 5;
  
  // 获取前5名和后5名
  const topFive = userAverages.slice(0, rankingLimit);
  const bottomFive = userAverages.length > rankingLimit ? 
    userAverages.slice(-rankingLimit) : [];
  
  if (topFive.length === 0) {
    text += `暂无早起排名数据\n\n`;
  } else {
    text += `前${rankingLimit}名早起之星:\n`;
    topFive.forEach((user, index) => {
      text += `${index + 1}. ${user.userName} - ${user.avgCheckInTime} (${user.checkInCount}天)\n`;
    });
    
    if (bottomFive.length > 0) {
      text += `\n最后${rankingLimit}名:\n`;
      bottomFive.forEach((user, index) => {
        text += `${userAverages.length - rankingLimit + index + 1}. ${user.userName} - ${user.avgCheckInTime} (${user.checkInCount}天)\n`;
      });
    }
  }
  
  return text;
}

// 通过飞书API发送消息
async function sendMessageViaAPI(data, options = {}) {
  try {
    const {
      chatId = process.env.CHAT_ID,
      userId = process.env.DEFAULT_USER_ID,
      useCard = process.env.USE_CARD !== 'false'
    } = options;
    
    // 检查接收者ID
    if (!chatId && !userId) {
      throw new Error('需要提供chatId或userId');
    }
    
    // 记录发送目标信息
    if (userId) {
      logger.info(`准备发送消息到用户: ${userId}`);
    } else {
      logger.info(`准备发送消息到群聊: ${chatId}`);
    }
    
    let messageContent;
    if (useCard) {
      // 使用卡片消息
      messageContent = {
        msg_type: 'interactive',
        content: JSON.stringify(generateCardContent(data))
      };
    } else {
      // 使用文本消息
      messageContent = {
        msg_type: 'text',
        content: JSON.stringify({
          text: generateTextContent(data)
        })
      };
    }
    
    // 使用SDK发送消息
    // 验证用户ID格式
    if (userId && !/^[0-9a-zA-Z_-]+$/.test(userId)) {
      throw new Error(`无效的用户ID格式: ${userId}`);
    }

    try {
      const response = await client.im.message.create({
        params: {
          receive_id_type: userId ? 'user_id' : 'chat_id'
        },
        data: {
          receive_id: userId || chatId,
          content: messageContent.content,
          msg_type: messageContent.msg_type,
          uuid: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
        }
      });

      if (!response.data) {
        throw new Error('消息发送失败：未收到有效响应');
      }

      return response;
    } catch (error) {
      logger.error(`消息发送失败: ${error.message}`);
      throw new Error(`消息发送失败: ${error.message}`);
    }
    
    // 记录消息ID和其他重要信息
    logger.info(`消息发送成功 - 消息ID: ${response.data.message_id}, 群组ID: ${response.data.chat_id}`);
    
    // 如果有额外的群聊ID，也发送到这些群聊
    const additionalChatIds = process.env.ADDITIONAL_CHAT_IDS;
    if (additionalChatIds) {
      const chatIds = additionalChatIds.split(',');
      for (const id of chatIds) {
        if (id.trim()) {
          await sendToChat(id.trim(), messageContent);
        }
      }
    }
    
    return response;
  } catch (error) {
    logger.error('发送消息出错:', error);
    throw error;
  }
}

// 发送到特定群聊
async function sendToChat(chatId, messageContent, retryCount = 3) {
  let lastError = null;
  for (let i = 0; i < retryCount; i++) {
    try {
      const response = await client.im.message.create({
        params: {
          receive_id_type: 'chat_id'
        },
        data: {
          receive_id: chatId,
          content: messageContent.content,
          msg_type: messageContent.msg_type,
          uuid: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
        }
      });
      logger.info(`消息已发送到群组: ${chatId}`);
      return response;
    } catch (error) {
      lastError = error;
      if (i < retryCount - 1) {
        const delay = Math.pow(2, i) * 1000;
        logger.warn(`发送消息到群组${chatId}失败，${i + 1}次重试，等待${delay}ms: ${error.message}`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  logger.error(`发送消息到群组${chatId}失败，重试次数已用完:`, lastError);
  throw lastError;
}

// 根据环境变量和参数选择发送方式
async function sendMessage(data, options = {}) {
  const {
    useWebhook = process.env.WEBHOOK_URL ? true : false,
    chatId,
    userId,
    useCard
  } = options;

  // 如果指定了使用Webhook或配置了Webhook URL且未指定其他发送方式
  if (useWebhook && !userId) {
    return sendMessageViaWebhook(data);
  } else {
    // 使用API发送，支持指定用户ID或群组ID
    return sendMessageViaAPI(data, { chatId, userId, useCard });
  }
}

module.exports = {
  sendMessage,
  sendMessageViaWebhook,
  sendMessageViaAPI,
  generateTextContent,
  sendToChat
};