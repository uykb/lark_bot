# 飞书考勤统计机器人

一个基于 飞书应用开发包 (Lark App Engine)实现 部署的飞书考勤统计机器人，可以自动统计员工的考勤数据并通过飞书机器人推送到群聊。

## 功能特性

- 🔄 自动获取飞书考勤数据
- 📊 按周统计考勤情况
- 🤖 通过飞书机器人推送统计结果
- ⏰ 支持定时任务（每周一自动统计）
- ☁️ 基于 replit 部署，无需服务器
- 📈 支持部门统计和工作时长分析
- 🎨 美观的卡片消息展示
- 🔧 高度可配置的统计规则

## 部署步骤

### 1. 创建飞书应用

1. 登录[飞书开放平台](https://open.feishu.cn/)
2. 创建企业自建应用
3. 在应用功能中开启机器人功能
4. 获取应用凭证（App ID 和 App Secret）
5. 配置以下权限：
   - 考勤信息查看权限
   - 消息发送权限
   - 用户信息读取权限

### 2. 配置环境变量

在 replit  中配置以下环境变量：

- `APP_ID`: 飞书应用的 App ID
- `APP_SECRET`: 飞书应用的 App Secret
- `CHAT_ID`: 需要推送消息的群聊 ID
- `ATTENDANCE_GROUP_ID`: 考勤组 ID


### 3. 定时任务
项目默认配置为每周一上午 9:00（北京时间）自动运行，统计上周的考勤数据（工作日早上8:00上班打卡的考勤排名根据先后顺序排名，一般会在7:00-8:00区间，超过8:00的考勤计为迟到）。


## 技术栈
- 参考文档
- https://open.feishu.cn/document/home/course
- https://feishu.feishu.cn/docx/S1pMdbckEooVlhx53ZMcGGnMnKc
- 飞书应用开发包 (Lark App Engine)
- 飞书开放平台 API

接下来，以便用户了解所有可配置的环境变量：

# 飞书应用凭证（必填）
APP_ID=cli_xxxxxxxxxxxxxxxx
APP_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# 飞书群聊ID（必填）
CHAT_ID=oc_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# 考勤组ID（必填）
ATTENDANCE_GROUP_ID=xxxxxxxxxxxxxxxx

# 消息配置（可选）

# 节假日配置（可选，逗号分隔，周日不上班不用统计）

# 日志配置（可选）
LOG_LEVEL=info
LOG_PREFIX=LarkAttendance