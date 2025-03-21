const moment = require('moment');

// 生成卡片内容
function generateCardContent(data) {
  // 确保数据结构完整
  const period = data.period || {
    start: moment().startOf('month').format('YYYY-MM-DD'),
    end: moment().format('YYYY-MM-DD')
  };
  
  const departmentStats = data.departmentStats || {};
  const rankingData = data.rankingData || [];
  
  const messageTitle = process.env.MESSAGE_TITLE || '📊 考勤统计报告';
  
  // 构建卡片
  return {
    "config": {
      "wide_screen_mode": true
    },
    "header": {
      "title": {
        "tag": "plain_text",
        "content": messageTitle
      },
      "template": "blue"
    },
    "elements": [
      // 统计周期
      {
        "tag": "div",
        "text": {
          "tag": "lark_md",
          "content": `**统计周期**: ${period.start} 至 ${period.end}`
        }
      },
      {
        "tag": "hr"
      },
      // 早起排名
      {
        "tag": "div",
        "text": {
          "tag": "lark_md",
          "content": "🌅 早起排名"
        }
      },
      ...generateEarlyRankingElements(rankingData),
      // 页脚
      {
        "tag": "note",
        "elements": [
          {
            "tag": "plain_text",
            "content": `统计时间: ${moment().format('YYYY-MM-DD HH:mm:ss')}`
          }
        ]
      }
    ]
  };
}

// 生成部门统计元素 - 已移除
function generateDepartmentElements(departmentStats) {
  return [];
}

// 生成早起排名元素的函数
function generateEarlyRankingElements(rankingData) {
  // 如果没有排名数据，返回提示信息
  if (!rankingData || rankingData.length === 0) {
    return [{
      "tag": "note",
      "elements": [
        {
          "tag": "standard_icon",
          "token": "day_outlined"
        },
        {
          "tag": "plain_text",
          "content": "暂无上午打卡排名数据（6:30-8:30）"
        }
      ]
    }];
  }
  
  const elements = [];
  const rankingLimit = 5; // 显示前5名和后5名
  
  // 计算上周的工作日总数（通常为5天，如果有节假日可能更少）
  const today = moment();
  const lastWeekMonday = today.clone().subtract(1, 'weeks').startOf('isoWeek');
  const lastWeekSunday = lastWeekMonday.clone().endOf('isoWeek');
  
  // 过滤出上周的数据（排除周日）
  const lastWeekData = rankingData.filter(record => {
    const recordDate = moment(record.date);
    // 排除周日的记录
    if (recordDate.day() === 0) return false;
    // 只保留上周一到周六的记录
    return recordDate.isBetween(lastWeekMonday, lastWeekSunday, 'day', '[]') && recordDate.day() !== 0;
  });
  
  // 按用户分组，计算每个用户的平均打卡时间和迟到次数
  const userCheckInMap = {};
  
  // 先按日期和用户ID分组，找出每个用户每天最早的打卡时间
  const dailyFirstCheckIn = {};
  lastWeekData.forEach(record => {
      const key = `${record.userId}_${record.date}`;
      const [hours, minutes] = record.checkInTime.split(':').map(Number);
      const checkInTimeInMinutes = hours * 60 + minutes;
      
      if (!dailyFirstCheckIn[key] || checkInTimeInMinutes < dailyFirstCheckIn[key]) {
          dailyFirstCheckIn[key] = checkInTimeInMinutes;
      }
  });
  
  lastWeekData.forEach(record => {
      // 解析打卡时间
      const [hours, minutes] = record.checkInTime.split(':').map(Number);
      const checkInTimeInMinutes = hours * 60 + minutes;
      
      // 只处理上午时间段的打卡记录（6:30-8:30）
      const morningStartTime = 6 * 60 + 30; // 6:30
      const morningEndTime = 8 * 60 + 30;   // 8:30
      const lateTime = 8 * 60;              // 8:00 迟到时间
      
      if (checkInTimeInMinutes < morningStartTime || checkInTimeInMinutes > morningEndTime) {
          return; // 跳过不在上午时间范围内的记录
      }
      
      const key = `${record.userId}_${record.date}`;
      const firstCheckInTime = dailyFirstCheckIn[key];
      
      // 判断是否迟到（当天第一次打卡在8:00后算迟到）
      const isLate = firstCheckInTime > lateTime;
      
      if (!userCheckInMap[record.userId]) {
          userCheckInMap[record.userId] = {
              userId: record.userId,
              userName: record.userName,
              department: record.department,
              checkInTimes: [],
              dates: [],
              lateDates: [],
              lateCount: 0
          };
      }
      
      // 只记录每天第一次打卡
      const dateExists = userCheckInMap[record.userId].dates.includes(record.date);
      if (!dateExists) {
          userCheckInMap[record.userId].checkInTimes.push(record.checkInTime);
          userCheckInMap[record.userId].dates.push(record.date);
          
          // 如果迟到，记录迟到信息
          if (isLate) {
              userCheckInMap[record.userId].lateDates.push(record.date);
              userCheckInMap[record.userId].lateCount++;
          }
      }
  });
  
  // 计算平均打卡时间和迟到统计
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
      department: user.department,
      avgCheckInTime: `${avgHours.toString().padStart(2, '0')}:${avgMins.toString().padStart(2, '0')}`,
      checkInCount: user.checkInTimes.length,
      lateCount: user.lateCount,
      lateDates: user.lateDates,
      totalMinutes: avgMinutes // 用于排序
    };
  }).filter(Boolean);
  
  // 按平均打卡时间排序
  userAverages.sort((a, b) => a.totalMinutes - b.totalMinutes);
  
  // 获取前5名
  const topFive = userAverages.slice(0, rankingLimit);
  
  // 生成前5名表格
  if (topFive.length > 0) {
    elements.push({
      "tag": "note",
      "elements": [
        {
          "tag": "standard_icon",
          "token": "day_outlined"
        },
        {
          "tag": "plain_text",
          "content": "早起之星排名"
        }
      ]
    });
    
    elements.push({
      "tag": "table",
      "columns": [
        {
          "data_type": "persons",
          "name": "customer_scale",
          "display_name": "姓名",
          "horizontal_align": "left",
          "vertical_align": "center",
          "width": "auto"
        },
        {
          "data_type": "text",
          "name": "customer_arr",
          "display_name": "平均打卡时间",
          "horizontal_align": "left",
          "width": "auto"
        },
        {
          "data_type": "text",
          "name": "col_fuqy9yghbmc",
          "display_name": "部门",
          "horizontal_align": "left",
          "width": "auto"
        },
        {
          "data_type": "number",
          "name": "col_dp25d8er3w4",
          "display_name": "打卡天数",
          "horizontal_align": "center",
          "width": "auto",
          "format": {
            "precision": 0
          }
        }
      ],
      "rows": userAverages.map(user => ({
        customer_scale: user.userId,
        customer_arr: user.avgCheckInTime,
        col_fuqy9yghbmc: user.department,
        col_dp25d8er3w4: user.checkInCount
      })),
      "row_height": "low",
      "header_style": {
        "background_style": "none",
        "bold": true,
        "lines": 1
      },
      "page_size": 10
    });
  }
  
  // 添加迟到次数排名
  // 按迟到次数排序（从多到少）
  const lateSorted = [...userAverages].sort((a, b) => b.lateCount - a.lateCount);
  
  if (lateSorted.length > 0 && lateSorted[0].lateCount > 0) {
    elements.push({
      "tag": "hr"
    });
    
    elements.push({
      "tag": "note",
      "elements": [
        {
          "tag": "standard_icon",
          "token": "time_outlined"
        },
        {
          "tag": "plain_text",
          "content": "迟到排名"
        }
      ]
    });
    
    elements.push({
      "tag": "table",
      "columns": [
        {
          "data_type": "number",
          "name": "customer_name",
          "display_name": "排名",
          "horizontal_align": "left",
          "vertical_align": "center",
          "width": "auto",
          "format": {
            "precision": 0
          }
        },
        {
          "data_type": "persons",
          "name": "customer_scale",
          "display_name": "姓名",
          "horizontal_align": "left",
          "vertical_align": "center",
          "width": "auto"
        },
        {
          "data_type": "text",
          "name": "col_fuqy9yghbmc",
          "display_name": "部门",
          "horizontal_align": "left",
          "width": "auto"
        },
        {
          "data_type": "number",
          "name": "col_dp25d8er3w4",
          "display_name": "迟到次数",
          "horizontal_align": "center",
          "width": "auto",
          "format": {
            "precision": 0
          }
        }
      ],
      "rows": lateSorted.map((user, index) => ({
        customer_name: index + 1,
        customer_scale: user.userId,
        col_fuqy9yghbmc: user.department,
        col_dp25d8er3w4: user.lateCount
      })),
      "row_height": "low",
      "header_style": {
        "background_style": "none",
        "bold": true,
        "lines": 1
      },
      "page_size": 5
    });
  }
  
  // 添加上周迟到人员名单
  const lateUsers = userAverages.filter(user => user.lateCount > 0);
  
  if (lateUsers.length > 0) {
    elements.push({
      "tag": "hr"
    });
    
    elements.push({
      "tag": "div",
      "text": {
        "tag": "lark_md",
        "content": "### 📋 上周迟到人员名单"
      }
    });
    
    // 按迟到次数从多到少排序
    lateUsers.sort((a, b) => b.lateCount - a.lateCount);
    
    const lateListRows = lateUsers.map((user, index) => {
      const formattedDates = user.lateDates
        ? user.lateDates.map(date => `${date}(${moment(date).format('dddd')})`).join('\n')
        : '未记录';
      return `| ${index + 1} | ${user.userName} | ${user.department} | ${user.lateCount} | ${formattedDates} |`;
    }).join('\n');
    
    elements.push({
      "tag": "div",
      "text": {
        "tag": "lark_md",
        "content": `**迟到人员列表 (按迟到次数排序)**\n| 序号 | 姓名 | 部门 | 迟到次数 | 迟到日期 |\n| --- | --- | --- | --- | --- |\n${lateListRows}`
      }
    });
  }
  
  return elements;
}

module.exports = {
  generateCardContent
};