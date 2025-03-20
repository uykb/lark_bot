const moment = require('moment');

// 生成卡片内容
function generateCardContent(data) {
  const { period, departmentStats, rankingData } = data;
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
    if (process.env.GROUP_BY_DEPARTMENT === 'true') {
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

// 生成早起排名元素
function generateEarlyRankingElements(rankingData) {
  const elements = [];
  const rankingLimit = parseInt(process.env.RANKING_LIMIT || '10');
  
  // 过滤出非迟到记录并按打卡时间排序
  const earlyRanking = rankingData
    .filter(r => !r.isLate)
    .sort((a, b) => {
      if (a.date !== b.date) {
        return moment(a.date).diff(moment(b.date));
      }
      return moment(a.checkInTime, 'HH:mm:ss').diff(moment(b.checkInTime, 'HH:mm:ss'));
    })
    .slice(0, rankingLimit);
  
  // 生成排名表格
  const tableRows = earlyRanking.map((record, index) => {
    return `| ${index + 1} | ${record.userName} | ${record.checkInTime} | ${record.date} |`;
  }).join('\n');
  
  elements.push({
    "tag": "div",
    "text": {
      "tag": "lark_md",
      "content": `| 排名 | 姓名 | 打卡时间 | 日期 |\n| --- | --- | --- | --- |\n${tableRows}`
    }
  });
  
  return elements;
}

module.exports = {
  generateCardContent
};