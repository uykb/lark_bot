const moment = require('moment');

// 获取工作日列表（上周的工作日）
function getWorkDays() {
  const includeWeekends = process.env.INCLUDE_WEEKENDS === 'true';
  const lastWeekStart = moment().subtract(1, 'weeks').startOf('week');
  const lastWeekEnd = moment().subtract(1, 'weeks').endOf('week');
  const workDays = [];
  
  // 遍历上周的每一天
  for (let day = moment(lastWeekStart); day.isSameOrBefore(lastWeekEnd); day.add(1, 'days')) {
    const dateStr = day.format('YYYY-MM-DD');
    
    // 判断是否为工作日
    if (isWorkday(dateStr) || (includeWeekends && !isHoliday(dateStr))) {
      workDays.push(dateStr);
    }
  }
  
  return workDays;
}

// 判断是否为节假日
function isHoliday(dateStr) {
  const holidays = (process.env.HOLIDAYS || '').split(',').map(d => d.trim());
  return holidays.includes(dateStr);
}

// 判断是否为工作日
function isWorkday(dateStr) {
  // 获取配置的特殊工作日
  const workdays = (process.env.WORKDAYS || '').split(',').map(d => d.trim());
  
  // 如果在特殊工作日列表中，直接返回true
  if (workdays.includes(dateStr)) {
    return true;
  }
  
  // 判断是否为周末
  const dayOfWeek = moment(dateStr).day();
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
  
  // 如果是周末但不在特殊工作日列表中，返回false
  // 如果不是周末且不在节假日列表中，返回true
  return !isWeekend && !isHoliday(dateStr);
}

module.exports = {
  getWorkDays,
  isHoliday,
  isWorkday
};