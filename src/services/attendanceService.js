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
    logger.info('使用真实数据模式，开始API查询');
    const token = await getAccessToken();
    
    // 使用固定的用户ID列表
    const userIds = FIXED_USER_IDS;
    
    logger.info(`获取打卡记录，共 ${userIds.length} 个用户`);
    
    // 设置日期范围（获取当前月的数据）
    const today = moment();
    // 修改为获取更长时间范围的数据，比如最近30天
    const startDate = today.clone().subtract(30, 'days').format('YYYYMMDD');
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
    logger.info(`发送考勤API请求: ${JSON.stringify(requestBody)}`);
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
      logger.info(`成功获取打卡记录数据`);
      
      // 添加调试日志，查看完整的API响应
      logger.debug('API响应数据', response.data);
      
      // 检查返回的数据结构
      if (!response.data.data) {
        logger.warn('API返回的数据缺少data字段');
        return {
          title: '打卡记录排行榜',
          period: {
            start: moment(startDate, 'YYYYMMDD').format('YYYY-MM-DD'),
            end: moment(endDate, 'YYYYMMDD').format('YYYY-MM-DD')
          },
          departmentStats: {},
          rankingData: [],
          message: 'API返回的数据缺少data字段'
        };
      }
      
      // 直接返回原始数据，让processAttendanceRecords处理
      return response.data.data;
    } else {
      // 删除多余的else语句，修复语法错误
      logger.error(`获取打卡记录数据失败: ${response.data.msg}, 错误码: ${response.data.code}`);
      // 返回错误信息
      return {
        title: '打卡记录获取失败',
        period: {
          start: moment(startDate, 'YYYYMMDD').format('YYYY-MM-DD'),
          end: moment(endDate, 'YYYYMMDD').format('YYYY-MM-DD')
        },
        departmentStats: {},
        rankingData: [],
        message: `获取打卡记录数据失败: ${response.data.msg}, 错误码: ${response.data.code}`
      };
    }
  } catch (error) {
    logger.error('获取打卡记录数据出错:', error);
    
    // 添加更详细的错误日志
    if (error.response) {
      logger.error(`状态码: ${error.response.status}`);
      logger.error(`响应数据: ${JSON.stringify(error.response.data)}`);
    }
    
    // 返回错误信息
    return {
      title: '打卡记录查询出错',
      period: {
        start: moment().subtract(30, 'days').format('YYYY-MM-DD'),
        end: moment().format('YYYY-MM-DD')
      },
      departmentStats: {},
      rankingData: [],
      message: `获取数据失败: ${error.message}`
    };
  }
}

// 处理打卡记录数据并按时间排序
function processAttendanceRecords(recordsData) {
  try {
    // 提取用户打卡记录
    const userTasks = recordsData.user_task_results || [];
    
    // 如果没有打卡记录，返回空结构
    if (userTasks.length === 0) {
      logger.warn('没有找到打卡记录');
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
    
    logger.info(`开始处理 ${userTasks.length} 个用户的打卡记录`);
    
    // 添加调试日志，查看原始数据结构
    logger.debug('用户任务数据结构示例', userTasks[0]);
    
    userTasks.forEach(task => {
      // 记录用户信息
      const userName = task.employee_name || '未知';
      const userId = task.user_id;
      const department = task.group_name || '未知部门';
      
      logger.debug(`处理用户 ${userName}(${userId}) 的打卡记录`);
      
      // 检查records字段是否存在
      if (!task.records) {
        logger.debug(`用户 ${userName} 的records字段不存在`);
        return; // 跳过这个用户
      }
      
      // 只处理有记录的数据
      if (task.records.length > 0) {
        logger.debug(`用户 ${userName} 有 ${task.records.length} 条记录`);
        
        // 添加调试日志，查看记录结构
        if (task.records.length > 0) {
          logger.debug('记录数据结构示例', task.records[0]);
        }
        
        task.records.forEach(record => {
          try {
            // 检查check_in_record字段是否存在
            if (!record.check_in_record) {
              logger.debug(`用户 ${userName} 的记录缺少check_in_record字段`);
              return; // 跳过这条记录
            }
            
            // 检查check_time字段是否存在
            if (!record.check_in_record.check_time) {
              logger.debug(`用户 ${userName} 的记录缺少check_time字段`);
              return; // 跳过这条记录
            }
            
            // 安全地解析时间戳
            let checkInTime;
            try {
              checkInTime = parseInt(record.check_in_record.check_time);
              if (isNaN(checkInTime)) {
                logger.warn(`无效的打卡时间戳: ${record.check_in_record.check_time}`);
                return; // 跳过这条记录
              }
              
              // 添加调试信息，输出原始时间戳和转换后的时间
              logger.debug(`原始时间戳: ${checkInTime}, 转换后时间: ${moment.unix(checkInTime).format('YYYY-MM-DD HH:mm:ss')}`);
              
              // 检查时间戳是否为毫秒级（如果是毫秒级，转换为秒级）
              if (checkInTime > 10000000000) { // 大于10位数可能是毫秒级时间戳
                logger.debug(`检测到毫秒级时间戳，转换为秒级`);
                checkInTime = Math.floor(checkInTime / 1000);
              }
              
              // 再次输出转换后的时间进行确认
              logger.debug(`处理后时间戳: ${checkInTime}, 转换后时间: ${moment.unix(checkInTime).format('YYYY-MM-DD HH:mm:ss')}`);
            } catch (e) {
              logger.warn(`解析打卡时间戳出错: ${e.message}`);
              return; // 跳过这条记录
            }
            
            // 格式化日期和时间
            const checkInMoment = moment.unix(checkInTime);
            if (!checkInMoment.isValid()) {
              logger.warn(`无效的时间戳转换: ${checkInTime}`);
              return; // 跳过这条记录
            }
            
            const checkInDate = checkInMoment.format('YYYY-MM-DD');
            const checkInTimeFormatted = checkInMoment.format('HH:mm:ss');
            
            // 获取小时和分钟，用于判断是否在6:30-8:30之间
            const hours = checkInMoment.hours();
            const minutes = checkInMoment.minutes();
            const totalMinutes = hours * 60 + minutes;
            
            // 判断是否在早上6:30-8:30之间 (6:30 = 390分钟, 8:30 = 510分钟)
            const isInMorningRange = totalMinutes >= 390 && totalMinutes <= 510;
            
            // 添加更多调试信息
            logger.debug(`用户 ${userName} 打卡时间: ${checkInTimeFormatted}, 小时: ${hours}, 分钟: ${minutes}, 总分钟: ${totalMinutes}, 是否在范围内: ${isInMorningRange}`);
            
            // 判断是否迟到
            const isLate = record.check_in_result === 'Late';
            
            // 添加记录
            allRecords.push({
              date: checkInDate,
              checkInTime: checkInTimeFormatted,
              timestamp: checkInTime,
              userName: userName,
              userId: userId,
              status: record.check_in_result || '未知',
              location: record.check_in_record.location_name || '未知',
              isLate: isLate,
              department: department,
              isInMorningRange: isInMorningRange,
              totalMinutes: totalMinutes
            });
            
            logger.debug(`添加打卡记录: ${checkInDate} ${checkInTimeFormatted} - ${userName} - 在早上6:30-8:30范围内: ${isInMorningRange}`);
          } catch (recordError) {
            logger.warn(`处理单条打卡记录时出错: ${recordError.message}`, recordError);
            // 继续处理下一条记录
          }
        });
      } else {
        logger.debug(`用户 ${userName} 没有打卡记录`);
      }
    });
    
    logger.info(`共处理了 ${allRecords.length} 条打卡记录`);

    // 统计在早上6:30-8:30范围内的记录数
    const morningRangeRecords = allRecords.filter(r => r.isInMorningRange);
    logger.info(`其中早上6:30-8:30范围内的记录有 ${morningRangeRecords.length} 条`);

    // 统计每个用户在早上6:30-8:30范围内的记录数
    const userMorningRecords = {};
    morningRangeRecords.forEach(record => {
      if (!userMorningRecords[record.userName]) {
        userMorningRecords[record.userName] = 0;
      }
      userMorningRecords[record.userName]++;
    });
    
    // 输出每个用户的早上记录数
    Object.entries(userMorningRecords).forEach(([userName, count]) => {
      logger.info(`用户 ${userName} 在早上6:30-8:30范围内有 ${count} 条记录`);
    });
    
    // 如果处理后没有记录，返回空结构
    if (allRecords.length === 0) {
      logger.warn('处理后没有有效的打卡记录');
      return {
        title: '打卡记录排行榜',
        period: {
          start: moment().startOf('month').format('YYYY-MM-DD'),
          end: moment().format('YYYY-MM-DD')
        },
        departmentStats: {},
        rankingData: [],
        message: '处理后没有有效的打卡记录'
      };
    }
    
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
    
    // 获取日期范围
    const dates = allRecords.map(r => r.date);
    const startDate = dates.length > 0 ? moment.min(dates.map(d => moment(d))).format('YYYY-MM-DD') : moment().startOf('month').format('YYYY-MM-DD');
    const endDate = dates.length > 0 ? moment.max(dates.map(d => moment(d))).format('YYYY-MM-DD') : moment().format('YYYY-MM-DD');
    
    // 构建最终结果
    const result = {
      title: '早上6:30-8:30打卡记录排行榜', // 修改标题
      period: {
        start: startDate,
        end: endDate
      },
      departmentStats: departmentStats,
      rankingData: allRecords,
      summary: {
        totalDays: [...new Set(allRecords.map(r => r.date))].length,
        totalRecords: allRecords.length,
        totalOnTime: allRecords.filter(r => !r.isLate).length,
        totalLate: allRecords.filter(r => r.isLate).length,
        totalInMorningRange: allRecords.filter(r => r.isInMorningRange).length // 添加早上时间范围内的记录数
      }
    };
    
    return result;
  } catch (error) {
    logger.error('处理打卡记录数据出错:', error);
    // 返回一个有效的结构，而不是抛出错误
    return {
      title: '打卡记录处理出错',
      period: {
        start: moment().startOf('month').format('YYYY-MM-DD'),
        end: moment().format('YYYY-MM-DD')
      },
      departmentStats: {},
      rankingData: [],
      message: `处理数据出错: ${error.message}`
    };
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