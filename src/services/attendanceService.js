const axios = require('axios');
const moment = require('moment');
const { getAccessToken } = require('./authService');
const { logger } = require('../utils/logger');
const { validateUserIds } = require('../validators/attendanceValidator');

class AttendanceService {
  constructor() {
    this.axiosInstance = axios.create({
      baseURL: 'https://open.feishu.cn/open-apis/attendance/v1',
      timeout: 10000,
      validateStatus: status => status < 500
    });
  }

  async getUserIds() {
    const userIdsStr = process.env.USER_IDS;
    return validateUserIds(userIdsStr);
  }

  async getAttendanceStats() {
    try {
      logger.info('使用考勤统计API查询数据');
      const token = await getAccessToken();
      
      if (token) {
        const maskedToken = token.substring(0, 5) + '...' + token.substring(token.length - 5);
        logger.info(`成功获取访问令牌: ${maskedToken}`);
      } else {
        logger.error('获取访问令牌失败，令牌为空');
        return this.createErrorResponse('获取访问令牌失败，请检查授权配置');
      }
      
      const userIds = await this.getUserIds();
      
      if (userIds.length === 0) {
        return this.createErrorResponse('未配置用户ID列表，请在环境变量中设置USER_IDS');
      }
      
      logger.info(`获取考勤统计，共 ${userIds.length} 个用户`);
      
      const { startDate, endDate } = this.getLastWeekDateRange();
      logger.info(`获取上周 ${startDate} 至 ${endDate} 的考勤统计数据`);
      
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
      
      logger.info(`发送考勤统计API请求: ${JSON.stringify(requestBody)}`);
      const response = await this.axiosInstance({
        method: 'post',
        url: '/user_stats_datas/query',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        params: {
          employee_type: 'employee_id'
        },
        data: requestBody
      });
      
      logger.debug(`API响应状态码: ${response.status}`);
      logger.debug(`API响应头信息: ${JSON.stringify(response.headers)}`);
      
      if (!response.data) {
        logger.error('API响应中没有data字段');
        return this.createErrorResponse('API响应中没有data字段');
      }
      
      logger.debug(`API响应数据结构: ${JSON.stringify(Object.keys(response.data))}`);
      
      if (response.data.code === 0) {
        logger.info('成功获取考勤统计数据');
        
        if (process.env.LOG_LEVEL === 'debug') {
          const simplifiedResponse = {
            code: response.data.code,
            msg: response.data.msg,
            user_count: response.data.data?.user_datas?.length || 0
          };
          logger.debug('API响应数据摘要', simplifiedResponse);
          
          if (process.env.LOG_FULL_RESPONSE === 'true') {
            logger.debug('完整API响应数据', response.data);
          }
        }
        
        if (!response.data.data) {
          logger.warn('API返回的数据缺少data字段');
          return this.createErrorResponse('API返回的数据缺少data字段');
        }
        
        return response.data.data;
      } else {
        const errorCode = response.data.code || '未知';
        const errorMsg = response.data.msg || '未知错误';
        logger.error(`获取考勤统计数据失败: ${errorMsg}, 错误码: ${errorCode}`);
        logger.debug(`完整错误响应: ${JSON.stringify(response.data)}`);
        return this.createErrorResponse(`获取考勤统计数据失败: ${errorMsg}, 错误码: ${errorCode}`);
      }
    } catch (error) {
      logger.error('获取考勤统计数据出错:', error);
      
      if (error.response) {
        logger.error(`状态码: ${error.response.status}`);
        logger.error(`响应数据: ${JSON.stringify(error.response.data)}`);
        
        if (error.response.data && error.response.data.code === 99991663) {
          logger.error('API调用频率超限，将在稍后重试');
        }
      } else if (error.request) {
        logger.error('未收到API响应，可能是网络问题');
      } else {
        logger.error('请求配置错误:', error.message);
      }
      
      return this.createErrorResponse(`获取数据失败: ${error.message}`);
    }
  }

  async processAttendanceStats(statsData) {
    try {
      logger.debug('处理考勤统计数据', statsData);
      
      const userData = statsData.user_datas || [];
      
      if (userData.length === 0) {
        logger.warn('没有找到用户数据');
        return this.createEmptyResponse('没有找到用户数据');
      }
      
      const allRecords = [];
      
      logger.info(`开始处理 ${userData.length} 个用户的考勤统计`);
      
      if (userData.length > 0) {
        logger.debug('用户数据结构示例', userData[0]);
      }
      
      for (const user of userData) {
        const userName = user.name || '未知';
        const userId = user.user_id;
        let department = '未知部门';
        
        const deptData = user.datas.find(item => item.code === '50102');
        if (deptData) {
          department = deptData.value || '未知部门';
        }
        
        logger.debug(`处理用户 ${userName}(${userId}) 的考勤统计`);
        
        const dateRecords = user.datas.filter(item => {
          if (!item.code.match(/^\d{4}-\d{2}-\d{2}$/) || !item.title.includes('星期')) {
            return false;
          }
          
          const recordDate = moment(item.code);
          const { startDate, endDate } = this.getLastWeekDateRange();
          return recordDate.isBetween(startDate, endDate, null, '[]');
        });
        
        if (dateRecords.length === 0) {
          logger.debug(`用户 ${userName} 没有日期记录`);
          continue;
        }
        
        logger.debug(`用户 ${userName} 有 ${dateRecords.length} 条日期记录`);
        
        for (const record of dateRecords) {
          try {
            const date = record.code;
            const value = record.value;
            
            const checkInTimeMatch = value.split(',')[0].match(/\((\d{2}:\d{2})\)/);
            if (!checkInTimeMatch) {
              logger.debug(`用户 ${userName} 在 ${date} 没有有效的早上打卡记录`);
              continue;
            }
            
            const firstCheckInTime = checkInTimeMatch[1] + ':00';
            const [hours, minutes] = firstCheckInTime.split(':').map(Number);
            const totalMinutes = hours * 60 + minutes;
            const isInMorningRange = totalMinutes >= 390 && totalMinutes <= 510;
            const isAbnormal = record.features.some(f => 
              f.key === 'Abnormal' && f.value === 'true'
            );
            
            allRecords.push({
              date,
              checkInTime: firstCheckInTime,
              userName,
              userId,
              status: isAbnormal ? 'Abnormal' : 'Normal',
              isLate: isAbnormal,
              department,
              isInMorningRange,
              totalMinutes
            });
            
            logger.debug(`添加考勤记录: ${date} ${firstCheckInTime} - ${userName} - 在早上6:30-8:30范围内: ${isInMorningRange}`);
          } catch (recordError) {
            logger.warn(`处理单条考勤记录时出错: ${recordError.message}`, recordError);
          }
        }
      }
      
      logger.info(`共处理了 ${allRecords.length} 条考勤记录`);
      
      const morningRangeRecords = allRecords.filter(r => r.isInMorningRange);
      logger.info(`其中早上6:30-8:30范围内的记录有 ${morningRangeRecords.length} 条`);
      
      const userMorningRecords = {};
      for (const record of morningRangeRecords) {
        if (!userMorningRecords[record.userName]) {
          userMorningRecords[record.userName] = 0;
        }
        userMorningRecords[record.userName]++;
      }
      
      for (const [userName, count] of Object.entries(userMorningRecords)) {
        logger.info(`用户 ${userName} 在早上6:30-8:30范围内有 ${count} 条记录`);
      }
      
      if (allRecords.length === 0) {
        logger.warn('处理后没有有效的考勤记录');
        return this.createEmptyResponse('处理后没有有效的考勤记录');
      }
      
      const departmentStats = this.calculateDepartmentStats(allRecords);
      const { startDate, endDate } = this.getDateRangeFromRecords(allRecords);
      
      return {
        title: '上周早上6:30-8:30打卡记录排行榜',
        period: {
          start: moment().subtract(1, 'weeks').startOf('isoWeek').format('YYYY-MM-DD'),
          end: moment().subtract(1, 'weeks').endOf('isoWeek').format('YYYY-MM-DD')
        },
        departmentStats,
        rankingData: allRecords,
        summary: {
          totalDays: 5,
          totalRecords: allRecords.length,
          totalOnTime: allRecords.filter(r => !r.isLate).length,
          totalLate: allRecords.filter(r => r.isLate).length,
          totalInMorningRange: allRecords.filter(r => r.isInMorningRange).length
        }
      };
    } catch (error) {
      logger.error('处理打卡记录数据出错:', error);
      return this.createErrorResponse(`处理数据出错: ${error.message}`);
    }
  }

  getLastWeekDateRange() {
    const today = moment();
    const lastWeekMonday = today.clone().subtract(1, 'weeks').startOf('isoWeek');
    const lastWeekSunday = lastWeekMonday.clone().endOf('isoWeek');
    return {
      startDate: lastWeekMonday,
      endDate: lastWeekSunday
    };
  }

  getDateRangeFromRecords(records) {
    const dates = records.map(r => r.date);
    return {
      startDate: dates.length > 0 ? moment.min(dates.map(d => moment(d))) : moment().startOf('month'),
      endDate: dates.length > 0 ? moment.max(dates.map(d => moment(d))) : moment()
    };
  }

  calculateDepartmentStats(records) {
    const departmentStats = {};
    
    for (const record of records) {
      if (!departmentStats[record.department]) {
        departmentStats[record.department] = {
          departmentName: record.department,
          totalOnTimeCount: 0,
          totalLateCount: 0,
          users: {}
        };
      }
      
      if (record.isLate) {
        departmentStats[record.department].totalLateCount++;
      } else {
        departmentStats[record.department].totalOnTimeCount++;
      }
      
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
    }
    
    for (const deptKey of Object.keys(departmentStats)) {
      departmentStats[deptKey].users = Object.values(departmentStats[deptKey].users);
    }
    
    return departmentStats;
  }

  createErrorResponse(message) {
    return {
      title: '考勤统计获取失败',
      period: {
        start: moment().subtract(30, 'days').format('YYYY-MM-DD'),
        end: moment().format('YYYY-MM-DD')
      },
      departmentStats: {},
      rankingData: [],
      message
    };
  }

  createEmptyResponse(message) {
    return {
      title: '考勤统计排行榜',
      period: {
        start: moment().startOf('month').format('YYYY-MM-DD'),
        end: moment().format('YYYY-MM-DD')
      },
      departmentStats: {},
      rankingData: [],
      message
    };
  }
}

module.exports = new AttendanceService();
