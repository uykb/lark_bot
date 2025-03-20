const axios = require('axios');
const { logger } = require('../utils/logger');

// 获取飞书访问令牌
async function getAccessToken() {
  try {
    const response = await axios.post('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
      app_id: process.env.APP_ID,
      app_secret: process.env.APP_SECRET
    });
    
    if (response.data.code === 0) {
      logger.info('成功获取访问令牌');
      return response.data.tenant_access_token;
    } else {
      throw new Error(`获取访问令牌失败: ${response.data.msg}`);
    }
  } catch (error) {
    logger.error('获取访问令牌出错:', error);
    throw error;
  }
}

module.exports = {
  getAccessToken
};