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

// 获取打卡记录并按时间排序
async function getAttendanceRecords() {
  try {
    const token = await getAccessToken();
    
    // 使用固定的用户ID列表
    const userIds = FIXED_USER_IDS;
    
    logger.info(`获取打卡记录，共 ${userIds.length} 个用户`);
    
    // 设置日期范围（获取当前月的数据）
    const today = moment();
    const startDate = today.clone().startOf('month').format('YYYYMMDD');
    const endDate = today.clone().format('YYYYMMDD');
    
    logger.info(`获取 ${startDate} 至 ${endDate} 的打卡记录`);
    
    // 构建请求体
    const requestBody = {
      check_date_from: parseInt(startDate),
      check_date_to: parseInt(endDate),
      need_overtime_result: true,
      user_ids: userIds
    };
    
    // 发送请求
    const response = await axios({
      method: 'post',
      url: 'https://open.feishu.cn/open-apis/attendance/v1/user_tasks/query',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      params: {
        employee_type: 'employee_id',
        ignore_invalid_users: true,
        include_terminated_user: true
      },
      data: requestBody
    });
    
    if (response.data.code === 0) {
      logger.info('成功获取打卡记录数据');
      return processAttendanceRecords(response.data.data);
    } else {
      throw new Error(`获取打卡记录数据失败: ${response.data.msg}`);
    }
  } catch (error) {
    logger.error('获取打卡记录数据出错:', error);
    
    // 添加更详细的错误日志
    if (error.response) {
      logger.error(`状态码: ${error.response.status}`);
      logger.error(`响应数据: ${JSON.stringify(error.response.data)}`);
    }
    
    throw error;
  }
}

// 处理打卡记录数据并按时间排序
function processAttendanceRecords(recordsData) {
  try {
    // 提取用户打卡记录
    const userTasks = recordsData.user_task_results || [];
    
    // 如果没有打卡记录，返回空结果
    if (userTasks.length === 0) {
      return {
        title: '打卡记录排行榜',
        period: {
          start: moment().startOf('month').format('YYYY-MM-DD'),
          end: moment().format('YYYY-MM-DD')
        },
        departmentStats: {},
        rankingData: [],
        message: '没有找到打卡记录'
      };
    }
    
    // 处理每个用户的打卡记录
    let allRecords = [];
    
    userTasks.forEach(task => {
      // 只处理有记录的数据
      if (task.records && task.records.length > 0) {
        task.records.forEach(record => {
          // 只处理有上班打卡的记录
          if (record.check_in_record) {
            const checkInTime = parseInt(record.check_in_record.check_time);
            const checkInDate = moment.unix(checkInTime).format('YYYY-MM-DD');
            const checkInTimeFormatted = moment.unix(checkInTime).format('HH:mm:ss');
            
            // 判断是否迟到
            const isLate = record.check_in_result === 'Late';
            
            allRecords.push({
              date: checkInDate,
              checkInTime: checkInTimeFormatted,
              timestamp: checkInTime,
              userName: task.employee_name || '未知',
              userId: task.user_id,
              status: record.check_in_result || '未知',
              location: record.check_in_record.location_name || '未知',
              isLate: isLate,
              department: task.group_name || '未知部门'
            });
          }
        });
      }
    });
    
    // 按部门分组统计
    const departmentStats = {};
    allRecords.forEach(record => {
      if (!departmentStats[record.department]) {
        departmentStats[record.department] = {
          departmentName: record.department,
          totalOnTimeCount: 0,
          totalLateCount: 0,
          users: {}
        };
      }
      
      // 更新部门统计
      if (record.isLate) {
        departmentStats[record.department].totalLateCount++;
      } else {
        departmentStats[record.department].totalOnTimeCount++;
      }
      
      // 更新用户统计
      if (!departmentStats[record.department].users[record.userId]) {
        departmentStats[record.department].users[record.userId] = {
          userId: record.userId,
          userName: record.userName,
          onTimeCount: 0,
          lateCount: 0
        };
      }
      
      if (record.isLate) {
        departmentStats[record.department].users[record.userId].lateCount++;
      } else {
        departmentStats[record.department].users[record.userId].onTimeCount++;
      }
    });
    
    // 转换用户对象为数组
    Object.keys(departmentStats).forEach(deptKey => {
      departmentStats[deptKey].users = Object.values(departmentStats[deptKey].users);
    });
    
    // 构建最终结果
    const result = {
      title: '打卡记录排行榜',
      period: {
        start: moment().startOf('month').format('YYYY-MM-DD'),
        end: moment().format('YYYY-MM-DD')
      },
      departmentStats: departmentStats,
      rankingData: allRecords,
      summary: {
        totalDays: [...new Set(allRecords.map(r => r.date))].length,
        totalRecords: allRecords.length,
        totalOnTime: allRecords.filter(r => !r.isLate).length,
        totalLate: allRecords.filter(r => r.isLate).length
      }
    };
    
    return result;
  } catch (error) {
    logger.error('处理打卡记录数据出错:', error);
    throw error;
  }
}

module.exports = {
  getAttendanceRecords,
  processAttendanceRecords,
  // 为了保持兼容性，将旧的导出指向新的函数
  getAttendanceData: getAttendanceRecords,
  processAttendanceData: processAttendanceRecords,
  getAttendanceStatsData: getAttendanceRecords,
  processAttendanceStatsData: processAttendanceRecords
};