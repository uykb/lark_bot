const axios = require('axios');
const { logger } = require('../utils/logger');

// 缓存访问令牌
let cachedToken = null;
let tokenExpireTime = 0;

// 获取访问令牌
async function getAccessToken() {
  try {
    // 如果令牌有效，直接返回缓存的令牌
    const now = Date.now();
    if (cachedToken && tokenExpireTime > now) {
      logger.debug('使用缓存的访问令牌');
      return cachedToken;
    }
    
    logger.info('获取新的访问令牌');
    
    const appId = process.env.APP_ID;
    const appSecret = process.env.APP_SECRET;
    
    if (!appId || !appSecret) {
      throw new Error('缺少APP_ID或APP_SECRET环境变量');
    }
    
    const response = await axios.post('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
      app_id: appId,
      app_secret: appSecret
    });
    
    if (response.data.code !== 0) {
      throw new Error(`获取访问令牌失败: ${response.data.msg}`);
    }
    
    // 缓存令牌，设置过期时间（提前5分钟过期）
    cachedToken = response.data.tenant_access_token;
    tokenExpireTime = now + (response.data.expire - 300) * 1000;
    
    return cachedToken;
  } catch (error) {
    logger.error('获取访问令牌出错:', error);
    throw error;
  }
}

module.exports = {
  getAccessToken
};