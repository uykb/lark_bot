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
      "tag": "div",
      "text": {
        "tag": "plain_text",
        "content": "暂无部门统计数据"
      }
    }];
  }
  
  const elements = [];
  
  Object.values(departmentStats).forEach(dept => {
    elements.push({
      "tag": "div",
      "fields": [
        {
          "is_short": true,
          "text": {
            "tag": "lark_md",
            "content": `**${dept.departmentName}**`
          }
        },
        {
          "is_short": true,
          "text": {
            "tag": "lark_md",
            "content": `准时: ${dept.totalOnTimeCount} 次 | 迟到: ${dept.totalLateCount} 次`
          }
        }
      ]
    });
    
    // 如果需要显示部门内的用户详情
    if (process.env.GROUP_BY_DEPARTMENT === 'true' && dept.users && dept.users.length > 0) {
      dept.users.forEach(user => {
        elements.push({
          "tag": "div",
          "fields": [
            {
              "is_short": true,
              "text": {
                "tag": "lark_md",
                "content": `${user.userName}`
              }
            },
            {
              "is_short": true,
              "text": {
                "tag": "lark_md",
                "content": `准时: ${user.onTimeCount} | 迟到: ${user.lateCount}`
              }
            }
          ]
        });
      });
    }
  });
  
  return elements;
}

// 生成早起排名元素的函数
function generateEarlyRankingElements(rankingData) {
  // 如果没有排名数据，返回提示信息
  if (!rankingData || rankingData.length === 0) {
    return [{
      "tag": "div",
      "text": {
        "tag": "plain_text",
        "content": "暂无早起排名数据"
      }
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
        lateCount: 0 // 添加迟到次数统计
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
    const topRows = topFive.map((user, index) => {
      // 修改打卡天数显示格式，只显示实际打卡天数
      return `| ${index + 1} | ${user.userName} | ${user.avgCheckInTime} | ${user.department} | ${user.checkInCount} |`;
    }).join('\n');
    
    elements.push({
      "tag": "div",
      "text": {
        "tag": "lark_md",
        "content": `**前${rankingLimit}名早起之星 (6:30-8:30)**\n| 排名 | 姓名 | 平均打卡时间 | 部门 | 打卡天数 |\n| --- | --- | --- | --- | --- |\n${topRows}`
      }
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
    const bottomRows = bottomFive.map((user, index) => {
      // 修改打卡天数显示格式，只显示实际打卡天数
      return `| ${userAverages.length - rankingLimit + index + 1} | ${user.userName} | ${user.avgCheckInTime} | ${user.department} | ${user.checkInCount} |`;
    }).join('\n');
    
    elements.push({
      "tag": "div",
      "text": {
        "tag": "lark_md",
        "content": `**最后${rankingLimit}名 (6:30-8:30)**\n| 排名 | 姓名 | 平均打卡时间 | 部门 | 打卡天数 |\n| --- | --- | --- | --- | --- |\n${bottomRows}`
      }
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
      "tag": "div",
      "text": {
        "tag": "lark_md",
        "content": "### ⏰ 迟到排名"
      }
    });
    
    const lateRows = topLateFive.map((user, index) => {
      return `| ${index + 1} | ${user.userName} | ${user.department} | ${user.lateCount} |`;
    }).join('\n');
    
    elements.push({
      "tag": "div",
      "text": {
        "tag": "lark_md",
        "content": `**迟到次数前${rankingLimit}名**\n| 排名 | 姓名 | 部门 | 迟到次数 |\n| --- | --- | --- | --- |\n${lateRows}`
      }
    });
  }
  
  return elements;
}

module.exports = {
  generateCardContent
};