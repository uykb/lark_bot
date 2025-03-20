const axios = require('axios');
const moment = require('moment');
const { getAccessToken } = require('./authService');
const { logger } = require('../utils/logger');

// 硬编码的用户ID列表
const FIXED_USER_IDS = [
  "6f89cd8e", "1d883db7", "7b6f547g", "eg74b574", "b87fg83d", 
  "43a5cade", "72a34568", "142ffbfb", "473ef9d9", "92af688b", 
  "9ff6e6g9", "b99c86ge", "b7fda3fc", "5d5accf7", "92d8d942", 
  "5c546878", "549dea55", "a875defc", "35ec3fca", "ceo", 
  "5618c5ea", "a2gfcd83", "3b9884ae", "fdf39ge6", "43eafg37", 
  "4e5dd38b", "31f69e2c", "b949eb58", "798489da", "2dff31cd", 
  "9c1b56ag", "2d6ddg17", "b8cg86bc", "f6e1287e"
];

// 获取考勤统计数据
async function getAttendanceStatsData() {
  try {
    const token = await getAccessToken();
    
    // 使用固定的用户ID列表
    const userIds = FIXED_USER_IDS;
    
    logger.info(`使用固定用户ID列表，共 ${userIds.length} 个用户`);
    
    // 设置日期范围（示例：获取当前月的数据）
    const today = moment();
    const startDate = today.clone().startOf('month').format('YYYYMMDD');
    const endDate = today.clone().format('YYYYMMDD');
    
    logger.info(`获取 ${startDate} 至 ${endDate} 的考勤统计数据，用户数: ${userIds.length}`);
    
    // 构建请求体
    const requestBody = {
      locale: "zh",
      stats_type: "month",
      start_date: parseInt(startDate),
      end_date: parseInt(endDate),
      user_ids: userIds,
      need_history: true,
      current_group_only: true
    };
    
    // 发送请求
    const response = await axios({
      method: 'post',
      url: 'https://open.feishu.cn/open-apis/attendance/v1/user_stats_data/query',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      data: requestBody,
      params: {
        employee_type: 'employee_id'
      }
    });
    
    if (response.data.code === 0) {
      logger.info('成功获取考勤统计数据');
      return response.data.data;
    } else {
      throw new Error(`获取考勤统计数据失败: ${response.data.msg}`);
    }
  } catch (error) {
    logger.error('获取考勤统计数据出错:', error);
    throw error;
  }
}

// 处理考勤统计数据
function processAttendanceStatsData(statsData) {
  try {
    // 提取用户数据
    const userDatas = statsData.user_datas || [];
    
    // 如果没有用户数据，返回空结果
    if (userDatas.length === 0) {
      return {
        title: '考勤统计报告',
        period: moment().format('YYYY年MM月'),
        message: '没有找到考勤数据'
      };
    }
    
    // 处理每个用户的数据
    const processedUsers = userDatas.map(userData => {
      const user = {
        name: userData.name,
        userId: userData.user_id,
        department: '',
        attendanceDays: '',
        workHours: '',
        lateCount: '',
        earlyLeaveCount: '',
        attendanceDetails: []
      };
      
      // 处理用户的详细数据
      userData.datas.forEach(item => {
        switch(item.code) {
          case '50102': // 部门
            user.department = item.value;
            break;
          case '52101': // 应出勤天数
            user.attendanceDays = item.value;
            break;
          case '52105': // 实际出勤时长
            user.workHours = item.value;
            break;
          case '52201': // 迟到次数
            user.lateCount = item.value;
            break;
          case '52203': // 早退次数
            user.earlyLeaveCount = item.value;
            break;
          default:
            // 处理日期数据（形如 "2025-03-11"）
            if (item.code.match(/^\d{4}-\d{2}-\d{2}$/)) {
              user.attendanceDetails.push({
                date: item.code,
                title: item.title,
                value: item.value,
                isAbnormal: item.features.some(f => f.key === 'Abnormal' && f.value === 'true')
              });
            }
        }
      });
      
      return user;
    });
    
    // 构建最终结果
    const result = {
      title: '考勤统计报告',
      period: moment().format('YYYY年MM月'),
      users: processedUsers,
      summary: {
        totalUsers: processedUsers.length,
        lateUsers: processedUsers.filter(u => parseInt(u.lateCount) > 0).length,
        earlyLeaveUsers: processedUsers.filter(u => parseInt(u.earlyLeaveCount) > 0).length
      }
    };
    
    return result;
  } catch (error) {
    logger.error('处理考勤统计数据出错:', error);
    throw error;
  }
}

module.exports = {
  getAttendanceStatsData,
  processAttendanceStatsData,
  // 保留原有的导出
  getAttendanceData: getAttendanceStatsData,
  processAttendanceData: processAttendanceStatsData
};