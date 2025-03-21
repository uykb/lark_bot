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
      // 部门统计
      {
        "tag": "div",
        "text": {
          "tag": "lark_md",
          "content": "### 🏢 部门统计"
        }
      },
      ...generateDepartmentElements(departmentStats),
      {
        "tag": "hr"
      },
      // 早起排名
      {
        "tag": "div",
        "text": {
          "tag": "lark_md",
          "content": "### 🌅 早起排名"
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

// 生成部门统计元素
function generateDepartmentElements(departmentStats) {
  // 如果没有部门数据，返回提示信息
  if (!departmentStats || Object.keys(departmentStats).length === 0) {
    return [{
      "tag": "note",
      "elements": [
        {
          "tag": "standard_icon",
          "token": "nearby-group_outlined"
        },
        {
          "tag": "plain_text",
          "content": "暂无部门统计数据"
        }
      ]
    }];
  }
  
  const elements = [];
  
  // 添加部门统计标题
  elements.push({
    "tag": "note",
    "elements": [
      {
        "tag": "standard_icon",
        "token": "nearby-group_outlined"
      },
      {
        "tag": "plain_text",
        "content": "部门统计"
      }
    ]
  });
  
  // 计算每个部门的平均打卡时间并排序
  const departmentRanking = Object.values(departmentStats)
    .map(dept => {
      // 计算部门所有用户的平均打卡时间
      let totalMinutes = 0;
      let totalRecords = 0;
      Object.values(dept.users).forEach(user => {
        user.checkInTimes && user.checkInTimes.forEach(time => {
          const [hours, minutes] = time.split(':').map(Number);
          totalMinutes += hours * 60 + minutes;
          totalRecords++;
        });
      });
      
      const avgMinutes = totalRecords > 0 ? totalMinutes / totalRecords : 0;
      const avgHours = Math.floor(avgMinutes / 60);
      const avgMins = Math.floor(avgMinutes % 60);
      
      return {
        departmentName: dept.departmentName,
        avgCheckInTime: `${avgHours.toString().padStart(2, '0')}:${avgMins.toString().padStart(2, '0')}`
      };
    })
    .sort((a, b) => {
      const [aHours, aMinutes] = a.avgCheckInTime.split(':').map(Number);
      const [bHours, bMinutes] = b.avgCheckInTime.split(':').map(Number);
      return (aHours * 60 + aMinutes) - (bHours * 60 + bMinutes);
    })
    .slice(0, 5); // 只取前5名

  // 生成部门排名表格
  elements.push({
    "tag": "table",
    "columns": [
      {
        "data_type": "number",
        "name": "customer_name",
        "display_name": "排名",
        "horizontal_align": "right",
        "width": "auto",
        "format": {
          "precision": 0
        }
      },
      {
        "data_type": "text",
        "name": "customer_scale",
        "display_name": "部门",
        "horizontal_align": "left",
        "width": "auto"
      },
      {
        "data_type": "text",
        "name": "col_x8gm00quem",
        "display_name": "平均打卡时间",
        "horizontal_align": "left",
        "width": "auto"
      }
    ],
    "rows": departmentRanking.map((dept, index) => ({
      customer_name: index + 1,
      customer_scale: dept.departmentName,
      col_x8gm00quem: dept.avgCheckInTime
    })),
    "row_height": "low",
    "header_style": {
      "background_style": "none",
      "bold": true,
      "lines": 1
    },
    "page_size": 5
  });
  
  return elements;
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
          "content": "暂无早起排名数据"
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
  
  // 按用户分组，计算每个用户的平均打卡时间
  const userCheckInMap = {};
  
  rankingData.forEach(record => {
    // 只处理早上6:30-8:30之间的打卡记录
    if (!record.isInMorningRange) return; // 跳过不在早上时间范围内的记录
    
    if (!userCheckInMap[record.userId]) {
      userCheckInMap[record.userId] = {
        userId: record.userId,
        userName: record.userName,
        department: record.department,
        checkInTimes: [],
        dates: [],
        lateCount: 0, // 添加迟到次数统计
        lateDates: [] // 添加迟到日期记录
      };
    }
    
    // 只记录每天第一次打卡
    const dateExists = userCheckInMap[record.userId].dates.includes(record.date);
    if (!dateExists) {
      userCheckInMap[record.userId].checkInTimes.push(record.checkInTime);
      userCheckInMap[record.userId].dates.push(record.date);
      
      // 统计迟到次数 (修改为8:00后算迟到，只统计上班卡)
      if (record.checkInType === 'OnDuty' || !record.checkInType) { // 上班卡或未指定类型
        const [hours, minutes] = record.checkInTime.split(':').map(Number);
        if (hours > 8 || (hours === 8 && minutes > 0)) {
          userCheckInMap[record.userId].lateCount++;
          userCheckInMap[record.userId].lateDates.push(record.date); // 记录迟到日期
        }
      }
    }
  });
  
  // 计算平均打卡时间
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
      lateCount: user.lateCount, // 添加迟到次数
      totalMinutes: avgMinutes // 用于排序
    };
  }).filter(Boolean);
  
  // 按平均打卡时间排序
  userAverages.sort((a, b) => a.totalMinutes - b.totalMinutes);
  
  // 获取前5名和后5名
  const topFive = userAverages.slice(0, rankingLimit);
  const bottomFive = userAverages.length > rankingLimit ? 
    userAverages.slice(-rankingLimit) : [];
  
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
          "content": "前5名早起之星"
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
      "rows": topFive.map((user, index) => ({
        customer_name: index + 1,
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
      "page_size": 5
    });
  }
  
  // 添加分隔线
  if (topFive.length > 0 && bottomFive.length > 0) {
    elements.push({
      "tag": "hr"
    });
  }
  
  // 生成后5名表格
  if (bottomFive.length > 0) {
    elements.push({
      "tag": "note",
      "elements": [
        {
          "tag": "standard_icon",
          "token": "expand-down_outlined"
        },
        {
          "tag": "plain_text",
          "content": "最后5名"
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
      "rows": bottomFive.map((user, index) => ({
        customer_name: userAverages.length - rankingLimit + index + 1,
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
      "page_size": 5
    });
  }
  
  // 添加迟到次数排名
  // 按迟到次数排序（从多到少）
  const lateSorted = [...userAverages].sort((a, b) => b.lateCount - a.lateCount);
  const topLateFive = lateSorted.slice(0, rankingLimit);
  
  if (topLateFive.length > 0 && topLateFive[0].lateCount > 0) {
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
      "rows": topLateFive.map((user, index) => ({
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
      return `| ${index + 1} | ${user.userName} | ${user.department} | ${user.lateCount} | ${user.lateDates ? user.lateDates.join(', ') : '未记录'} |`;
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