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
    // 检查是否使用测试数据
    if (process.env.USE_TEST_DATA === 'true') {
      logger.info('使用测试数据模式');
      
      // 检查是否需要模拟错误
      const errorType = process.env.TEST_ERROR_TYPE || 'none';
      logger.info(`错误模拟类型: ${errorType}`);
      
      switch (errorType) {
        case 'empty_data':
          logger.warn('模拟空数据情况');
          return {
            title: '打卡记录排行榜',
            period: {
              start: moment().subtract(30, 'days').format('YYYY-MM-DD'),
              end: moment().format('YYYY-MM-DD')
            },
            departmentStats: {},
            rankingData: [],
            message: '模拟的空数据情况'
          };
          
        case 'invalid_structure':
          logger.warn('模拟数据结构不完整情况');
          return {
            title: '打卡记录排行榜',
            // 缺少 period 字段
            departmentStats: {}, // 空对象
            // 缺少 rankingData 字段
            message: '模拟的数据结构不完整情况'
          };
          
        case 'api_error':
          logger.warn('模拟API调用失败情况');
          throw new Error('模拟的API调用失败');
          
        default:
          return generateTestData();
      }
    }
    
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
      logger.debug('API响应详情', response.data);
      
      // 检查返回的数据结构
      if (!response.data.data || !response.data.data.user_task_results || response.data.data.user_task_results.length === 0) {
        logger.warn('API返回的数据为空或结构不完整');
        // 不使用测试数据，而是返回空结构
        return {
          title: '打卡记录排行榜',
          period: {
            start: moment(startDate, 'YYYYMMDD').format('YYYY-MM-DD'),
            end: moment(endDate, 'YYYYMMDD').format('YYYY-MM-DD')
          },
          departmentStats: {},
          rankingData: [],
          message: 'API返回的数据为空或结构不完整'
        };
      }
      
      return processAttendanceRecords(response.data.data);
    } else {
      logger.error(`获取打卡记录数据失败: ${response.data.msg}, 错误码: ${response.data.code}`);
      // 不使用测试数据，而是返回错误信息
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
    
    // 不使用测试数据，而是返回错误信息
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

// 生成测试数据
function generateTestData() {
  logger.info('生成测试数据');
  
  const today = moment();
  const startDate = today.clone().subtract(30, 'days');
  const endDate = today.clone();
  
  // 部门列表
  const departments = ['技术部', '产品部', '市场部', '人事部', '财务部'];
  
  // 用户列表
  const users = [
    { id: 'user1', name: '张三', department: '技术部' },
    { id: 'user2', name: '李四', department: '技术部' },
    { id: 'user3', name: '王五', department: '产品部' },
    { id: 'user4', name: '赵六', department: '产品部' },
    { id: 'user5', name: '钱七', department: '市场部' },
    { id: 'user6', name: '孙八', department: '市场部' },
    { id: 'user7', name: '周九', department: '人事部' },
    { id: 'user8', name: '吴十', department: '人事部' },
    { id: 'user9', name: '郑十一', department: '财务部' },
    { id: 'user10', name: '王十二', department: '财务部' },
    { id: 'user11', name: '刘十三', department: '技术部' },
    { id: 'user12', name: '陈十四', department: '产品部' },
    { id: 'user13', name: '杨十五', department: '市场部' },
    { id: 'user14', name: '黄十六', department: '人事部' },
    { id: 'user15', name: '周十七', department: '财务部' }
  ];
  
  // 生成打卡记录
  let allRecords = [];
  let currentDate = startDate.clone();
  
  // 为每个用户生成每天的打卡记录
  while (currentDate.isSameOrBefore(endDate)) {
    const dateStr = currentDate.format('YYYY-MM-DD');
    
    users.forEach(user => {
      // 随机决定是否有打卡记录（90%概率有记录）
      if (Math.random() < 0.9) {
        // 生成随机打卡时间（早上7:30到9:30之间）
        const hour = Math.floor(Math.random() * 2) + 7;
        const minute = Math.floor(Math.random() * 60);
        const second = Math.floor(Math.random() * 60);
        const checkInTime = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}:${second.toString().padStart(2, '0')}`;
        
        // 判断是否迟到（9:00后算迟到）
        const isLate = hour >= 9 && minute > 0;
        
        allRecords.push({
          date: dateStr,
          checkInTime: checkInTime,
          timestamp: currentDate.clone().hour(hour).minute(minute).second(second).unix(),
          userName: user.name,
          userId: user.id,
          status: isLate ? 'Late' : 'Normal',
          location: '公司',
          isLate: isLate,
          department: user.department
        });
      }
    });
    
    currentDate.add(1, 'day');
  }
  
  // 按部门分组统计
  const departmentStats = {};
  departments.forEach(dept => {
    departmentStats[dept] = {
      departmentName: dept,
      totalOnTimeCount: 0,
      totalLateCount: 0,
      users: {}
    };
  });
  
  allRecords.forEach(record => {
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
  return {
    title: '打卡记录排行榜（测试数据）',
    period: {
      start: startDate.format('YYYY-MM-DD'),
      end: endDate.format('YYYY-MM-DD')
    },
    departmentStats: departmentStats,
    rankingData: allRecords,
    summary: {
      totalDays: endDate.diff(startDate, 'days') + 1,
      totalRecords: allRecords.length,
      totalOnTime: allRecords.filter(r => !r.isLate).length,
      totalLate: allRecords.filter(r => r.isLate).length
    }
  };
}

// 处理打卡记录数据并按时间排序
function processAttendanceRecords(recordsData) {
  try {
    // 提取用户打卡记录
    const userTasks = recordsData.user_task_results || [];
    
    // 如果没有打卡记录，返回测试数据
    if (userTasks.length === 0) {
      logger.warn('没有找到打卡记录，使用测试数据');
      return generateTestData();
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
    
    // 如果处理后没有记录，返回测试数据
    if (allRecords.length === 0) {
      logger.warn('处理后没有有效的打卡记录，使用测试数据');
      return generateTestData();
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
      title: '打卡记录排行榜',
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
  generateTestData,
  // 为了保持兼容性，将旧的导出指向新的函数
  getAttendanceData: getAttendanceRecords,
  processAttendanceData: processAttendanceRecords,
  getAttendanceStatsData: getAttendanceRecords,
  processAttendanceStatsData: processAttendanceRecords
};