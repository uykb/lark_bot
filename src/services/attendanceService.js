const axios = require('axios');
const moment = require('moment');
const { getAccessToken } = require('./authService');
const { logger } = require('../utils/logger');

// 从配置文件中导入用户ID列表
const { USER_IDS } = require('../config/userConfig');

// 获取考勤统计数据
async function getAttendanceStats() {
  try {
    logger.info('使用考勤统计API查询数据');
    const token = await getAccessToken();
    
    // 记录获取到的token（隐藏部分内容以保护安全）
    if (token) {
      const maskedToken = token.substring(0, 5) + '...' + token.substring(token.length - 5);
      logger.info(`成功获取访问令牌: ${maskedToken}`);
    } else {
      logger.error('获取访问令牌失败，令牌为空');
      return {
        title: '考勤统计获取失败',
        period: {
          start: moment().subtract(30, 'days').format('YYYY-MM-DD'),
          end: moment().format('YYYY-MM-DD')
        },
        departmentStats: {},
        rankingData: [],
        message: '获取访问令牌失败，请检查授权配置'
      };
    }
    
    // 使用固定的用户ID列表
    const userIds = FIXED_USER_IDS;
    
    logger.info(`获取考勤统计，共 ${userIds.length} 个用户`);
    
    // 修改日期范围为上周一到上周日
    const today = moment();
    const lastWeekMonday = today.clone().subtract(1, 'weeks').startOf('isoWeek');
    const lastWeekSunday = lastWeekMonday.clone().endOf('isoWeek');
    
    const startDate = lastWeekMonday.format('YYYYMMDD');
    const endDate = lastWeekSunday.format('YYYYMMDD');
    
    logger.info(`获取上周 ${startDate} 至 ${endDate} 的考勤统计数据`);
    
    // 构建请求体
    const requestBody = {
      current_group_only: true,
      end_date: parseInt(endDate),
      locale: "zh",
      need_history: true,
      start_date: parseInt(startDate),
      stats_type: "month",
      user_id: "72a34568",
      user_ids: userIds
    };
    
    // 发送请求
    logger.info(`发送考勤统计API请求: ${JSON.stringify(requestBody)}`);
    const response = await axios({
      method: 'post',
      // 修正API URL，将data改为datas
      url: 'https://open.feishu.cn/open-apis/attendance/v1/user_stats_datas/query',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      params: {
        employee_type: 'employee_id'
      },
      data: requestBody,
      // 添加超时设置，避免长时间等待
      timeout: 10000,
      // 添加重试配置
      validateStatus: status => status < 500 // 只有服务器错误才会被视为失败
    });
    
    // 增强错误处理和日志记录
    logger.debug(`API响应状态码: ${response.status}`);
    logger.debug(`API响应头信息: ${JSON.stringify(response.headers)}`);
    
    // 检查响应是否包含预期的数据结构
    if (!response.data) {
      logger.error('API响应中没有data字段');
      return {
        title: '考勤统计获取失败',
        period: {
          start: moment(startDate, 'YYYYMMDD').format('YYYY-MM-DD'),
          end: moment(endDate, 'YYYYMMDD').format('YYYY-MM-DD')
        },
        departmentStats: {},
        rankingData: [],
        message: 'API响应中没有data字段'
      };
    }
    
    // 记录完整的响应数据结构（不包含敏感数据）
    logger.debug(`API响应数据结构: ${JSON.stringify(Object.keys(response.data))}`);
    
    if (response.data.code === 0) {
      logger.info(`成功获取考勤统计数据`);
      
      // 添加调试日志，查看完整的API响应
      if (process.env.LOG_LEVEL === 'debug') {
        // 只记录关键信息，避免日志过大
        const simplifiedResponse = {
          code: response.data.code,
          msg: response.data.msg,
          user_count: response.data.data?.user_datas?.length || 0
        };
        logger.debug('API响应数据摘要', simplifiedResponse);
        
        // 如果需要完整日志，可以写入文件而不是控制台
        if (process.env.LOG_FULL_RESPONSE === 'true') {
          logger.debug('完整API响应数据', response.data);
        }
      }
      
      // 检查返回的数据结构
      if (!response.data.data) {
        logger.warn('API返回的数据缺少data字段');
        return {
          title: '考勤统计排行榜',
          period: {
            start: moment(startDate, 'YYYYMMDD').format('YYYY-MM-DD'),
            end: moment(endDate, 'YYYYMMDD').format('YYYY-MM-DD')
          },
          departmentStats: {},
          rankingData: [],
          message: 'API返回的数据缺少data字段'
        };
      }
      
      // 直接返回原始数据，让processAttendanceStats处理
      return response.data.data;
    } else {
      // 增强错误日志，确保记录所有可能的错误信息
      const errorCode = response.data.code || '未知';
      const errorMsg = response.data.msg || '未知错误';
      logger.error(`获取考勤统计数据失败: ${errorMsg}, 错误码: ${errorCode}`);
      
      // 记录更多响应细节以便调试
      logger.debug(`完整错误响应: ${JSON.stringify(response.data)}`);
      
      // 返回错误信息
      return {
        title: '考勤统计获取失败',
        period: {
          start: moment(startDate, 'YYYYMMDD').format('YYYY-MM-DD'),
          end: moment(endDate, 'YYYYMMDD').format('YYYY-MM-DD')
        },
        departmentStats: {},
        rankingData: [],
        message: `获取考勤统计数据失败: ${errorMsg}, 错误码: ${errorCode}`
      };
    }
  } catch (error) {
    logger.error('获取考勤统计数据出错:', error);
    
    // 添加更详细的错误日志
    if (error.response) {
      logger.error(`状态码: ${error.response.status}`);
      logger.error(`响应数据: ${JSON.stringify(error.response.data)}`);
      
      // 处理特定错误码
      if (error.response.data && error.response.data.code === 99991663) {
        logger.error('API调用频率超限，将在稍后重试');
        // 可以在这里添加重试逻辑
      }
    } else if (error.request) {
      // 请求已发出但没有收到响应
      logger.error('未收到API响应，可能是网络问题');
    } else {
      // 请求配置出错
      logger.error('请求配置错误:', error.message);
    }
    
    // 返回错误信息
    return {
      title: '考勤统计查询出错',
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

// 处理考勤统计数据
function processAttendanceStats(statsData) {
  try {
    // 检查API返回的数据结构
    logger.debug('处理考勤统计数据', statsData);
    
    // 提取用户数据
    const userData = statsData.user_datas || [];
    
    // 如果没有用户数据，返回空结构
    if (userData.length === 0) {
      logger.warn('没有找到用户数据');
      return {
        title: '考勤统计排行榜',
        period: {
          start: moment().startOf('month').format('YYYY-MM-DD'),
          end: moment().format('YYYY-MM-DD')
        },
        departmentStats: {},
        rankingData: [],
        message: '没有找到用户数据'
      };
    }
    
    // 处理每个用户的考勤统计
    let allRecords = [];
    
    logger.info(`开始处理 ${userData.length} 个用户的考勤统计`);
    
    // 添加调试日志，查看原始数据结构
    if (userData.length > 0) {
      logger.debug('用户数据结构示例', userData[0]);
    }
    
    userData.forEach(user => {
      // 记录用户信息
      const userName = user.name || '未知';
      const userId = user.user_id;
      let department = '未知部门';
      
      // 从数据中提取部门信息
      const deptData = user.datas.find(item => item.code === '50102');
      if (deptData) {
        department = deptData.value || '未知部门';
      }
      
      logger.debug(`处理用户 ${userName}(${userId}) 的考勤统计`);
      
      // 获取日期记录（日期记录的code通常是日期格式，如"2025-03-10"）
      // 只过滤上周的日期记录
      const dateRecords = user.datas.filter(item => {
        if (!item.code.match(/^\d{4}-\d{2}-\d{2}$/) || !item.title.includes('星期')) {
          return false;
        }
        
        // 检查日期是否在上周范围内
        const recordDate = moment(item.code);
        const today = moment();
        const lastWeekMonday = today.clone().subtract(1, 'weeks').startOf('isoWeek');
        const lastWeekSunday = lastWeekMonday.clone().endOf('isoWeek');
        
        return recordDate.isBetween(lastWeekMonday, lastWeekSunday, null, '[]');
      });
      
      if (dateRecords.length === 0) {
        logger.debug(`用户 ${userName} 没有日期记录`);
        return; // 跳过这个用户
      }
      
      logger.debug(`用户 ${userName} 有 ${dateRecords.length} 条日期记录`);
      
      // 处理每一天的考勤记录
      dateRecords.forEach(record => {
        try {
          const date = record.code; // 日期格式为 "2025-03-10"
          const value = record.value; // 例如 "正常(07:50),正常(17:35)"
          
          // 改进打卡时间解析逻辑，专门提取第一次打卡时间（早上）
          const checkInTimeMatch = value.split(',')[0].match(/\((\d{2}:\d{2})\)/);
          if (!checkInTimeMatch) {
            logger.debug(`用户 ${userName} 在 ${date} 没有有效的早上打卡记录`);
            return; // 跳过这条记录
          }
          
          const firstCheckInTime = checkInTimeMatch[1] + ':00'; // 添加秒
          
          // 解析时间
          const [hours, minutes] = firstCheckInTime.split(':').map(Number);
          const totalMinutes = hours * 60 + minutes;
          
          // 判断是否在早上6:30-8:30之间 (6:30 = 390分钟, 8:30 = 510分钟)
          const isInMorningRange = totalMinutes >= 390 && totalMinutes <= 510;
          
          // 判断是否异常（包括迟到）
          const isAbnormal = record.features.some(f => 
            f.key === 'Abnormal' && f.value === 'true'
          );
          
          // 添加记录
          allRecords.push({
            date: date,
            checkInTime: firstCheckInTime,
            userName: userName,
            userId: userId,
            status: isAbnormal ? 'Abnormal' : 'Normal',
            isLate: isAbnormal, // 简化处理，将异常视为迟到
            department: department,
            isInMorningRange: isInMorningRange,
            totalMinutes: totalMinutes
          });
          
          logger.debug(`添加考勤记录: ${date} ${firstCheckInTime} - ${userName} - 在早上6:30-8:30范围内: ${isInMorningRange}`);
        } catch (recordError) {
          logger.warn(`处理单条考勤记录时出错: ${recordError.message}`, recordError);
          // 继续处理下一条记录
        }
      });
    });
    
    logger.info(`共处理了 ${allRecords.length} 条考勤记录`);
    
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
      logger.warn('处理后没有有效的考勤记录');
      return {
        title: '考勤统计排行榜',
        period: {
          start: moment().startOf('month').format('YYYY-MM-DD'),
          end: moment().format('YYYY-MM-DD')
        },
        departmentStats: {},
        rankingData: [],
        message: '处理后没有有效的考勤记录'
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
      title: '上周早上6:30-8:30打卡记录排行榜',
      period: {
        start: moment().subtract(1, 'weeks').startOf('isoWeek').format('YYYY-MM-DD'),
        end: moment().subtract(1, 'weeks').endOf('isoWeek').format('YYYY-MM-DD')
      },
      departmentStats: departmentStats,
      rankingData: allRecords,
      summary: {
        totalDays: 5, // 上周工作日数量，通常为5天
        totalRecords: allRecords.length,
        totalOnTime: allRecords.filter(r => !r.isLate).length,
        totalLate: allRecords.filter(r => r.isLate).length,
        totalInMorningRange: allRecords.filter(r => r.isInMorningRange).length
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

// 更新模块导出
module.exports = {
  getAttendanceRecords: getAttendanceStats,
  processAttendanceRecords: processAttendanceStats,
  getAttendanceData: getAttendanceStats,
  processAttendanceData: processAttendanceStats,
  getAttendanceStatsData: getAttendanceStats,
  processAttendanceStatsData: processAttendanceStats
};
