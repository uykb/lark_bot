const axios = require('axios');
const moment = require('moment');
const { getAccessToken } = require('./authService');
const { logger } = require('../utils/logger');
const { getWorkDays, isHoliday, isWorkday } = require('../utils/dateUtils');

// 获取考勤数据
async function getAttendanceData() {
  try {
    const accessToken = await getAccessToken();
    const attendanceGroupId = process.env.ATTENDANCE_GROUP_ID;
    
    // 计算上周的开始和结束日期
    const lastWeekStart = moment().subtract(1, 'weeks').startOf('week').format('YYYY-MM-DD');
    const lastWeekEnd = moment().subtract(1, 'weeks').endOf('week').format('YYYY-MM-DD');
    
    logger.info(`获取 ${lastWeekStart} 至 ${lastWeekEnd} 的考勤数据`);
    
    // 调用飞书API获取考勤数据
    const response = await axios.get('https://open.feishu.cn/open-apis/attendance/v1/user_tasks', {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      params: {
        attendance_group_id: attendanceGroupId,
        start_date: lastWeekStart,
        end_date: lastWeekEnd
      }
    });
    
    if (response.data.code !== 0) {
      throw new Error(`获取考勤数据失败: ${response.data.msg}`);
    }
    
    return response.data.data;
  } catch (error) {
    logger.error('获取考勤数据出错:', error);
    throw error;
  }
}

// 处理考勤数据
function processAttendanceData(data) {
  try {
    const workDays = getWorkDays();
    const attendanceStats = {};
    const rankingData = [];
    
    // 处理每个用户的考勤数据
    data.user_tasks.forEach(task => {
      // 跳过非工作日的考勤记录
      if (!workDays.includes(moment(task.date).format('YYYY-MM-DD'))) {
        return;
      }
      
      // 计算迟到、早退、工作时长等
      const checkInTime = moment(task.check_in_time, 'HH:mm:ss');
      const lateThreshold = moment(process.env.LATE_THRESHOLD || '08:00:00', 'HH:mm:ss');
      const isLate = checkInTime.isAfter(lateThreshold);
      
      // 添加到排名数据
      rankingData.push({
        userId: task.user_id,
        userName: task.user_name,
        checkInTime: task.check_in_time,
        isLate,
        date: task.date
      });
      
      // 更新用户统计数据
      if (!attendanceStats[task.user_id]) {
        attendanceStats[task.user_id] = {
          userId: task.user_id,
          userName: task.user_name,
          department: task.department_name,
          lateCount: 0,
          onTimeCount: 0,
          totalWorkDuration: 0
        };
      }
      
      if (isLate) {
        attendanceStats[task.user_id].lateCount++;
      } else {
        attendanceStats[task.user_id].onTimeCount++;
      }
      
      // 计算工作时长
      if (task.check_in_time && task.check_out_time) {
        const workDuration = moment.duration(
          moment(task.check_out_time, 'HH:mm:ss').diff(
            moment(task.check_in_time, 'HH:mm:ss')
          )
        ).asHours();
        
        attendanceStats[task.user_id].totalWorkDuration += workDuration;
      }
    });
    
    // 按部门分组
    const departmentStats = {};
    Object.values(attendanceStats).forEach(stat => {
      if (!departmentStats[stat.department]) {
        departmentStats[stat.department] = {
          departmentName: stat.department,
          users: [],
          totalLateCount: 0,
          totalOnTimeCount: 0
        };
      }
      
      departmentStats[stat.department].users.push(stat);
      departmentStats[stat.department].totalLateCount += stat.lateCount;
      departmentStats[stat.department].totalOnTimeCount += stat.onTimeCount;
    });
    
    // 排序打卡记录
    rankingData.sort((a, b) => {
      if (a.date !== b.date) {
        return moment(a.date).diff(moment(b.date));
      }
      return moment(a.checkInTime, 'HH:mm:ss').diff(moment(b.checkInTime, 'HH:mm:ss'));
    });
    
    return {
      attendanceStats,
      departmentStats,
      rankingData,
      period: {
        start: moment().subtract(1, 'weeks').startOf('week').format('YYYY-MM-DD'),
        end: moment().subtract(1, 'weeks').endOf('week').format('YYYY-MM-DD')
      }
    };
  } catch (error) {
    logger.error('处理考勤数据出错:', error);
    throw error;
  }
}

module.exports = {
  getAttendanceData,
  processAttendanceData
};