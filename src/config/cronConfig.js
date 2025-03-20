// 获取定时任务配置
function getCronSchedule() {
  // 默认为每周一上午9点（北京时间，对应UTC+8，即UTC时间1:00）
  return process.env.CRON_SCHEDULE || '0 1 * * 1';
}

module.exports = {
  getCronSchedule
};