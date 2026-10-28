# Quick Start

在配置文件相应位置添加：
```
[task_local]
# 每 5 分钟触发一次；脚本在 08:00 - 12:00 窗口内随机挑选当天签到时刻，并在命中时附带 3 分钟内随机延迟
*/5 8-12 * * * https://raw.githubusercontent.com/Neurocoda/AutoNodeSeek/refs/heads/main/AutoNodeSeek.js, tag=AutoNodeSeek, enabled=true

[rewrite_local]
^https:\/\/www\.nodeseek\.com\/($|api\/account\/signIn) url script-request-header https://raw.githubusercontent.com/Neurocoda/AutoNodeSeek/refs/heads/main/AutoNodeSeek.js

[mitm]
hostname = www.nodeseek.com
```
