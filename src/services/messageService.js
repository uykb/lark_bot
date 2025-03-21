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