# Quick Start

在配置文件相应位置添加：
```
[task_local]
0 9 * * * https://raw.githubusercontent.com/Neurocoda/AutoNodeSeek/refs/heads/main/AutoNodeSeek.js, tag=AutoNodeSeek, enabled=true

[rewrite_local]
^https:\/\/www\.nodeseek\.com\/($|api\/account\/signIn) url script-request-header https://raw.githubusercontent.com/Neurocoda/AutoNodeSeek/refs/heads/main/AutoNodeSeek.js

[mitm]
hostname = www.nodeseek.com
```
