# AutoNodeSeek (Quantumult X)

NodeSeek 自动签到与 Cookie 抓取脚本，支持真随机时刻签到。

## 快速开始

在 Quantumult X 配置文件相应位置添加：

```conf
[task_local]
# 方案一 (推荐，全随机): 每分钟唤醒一次，到达当天抽取的随机分钟+秒数后触发，彻底消除整点与整秒特征
* 8-12 * * * https://raw.githubusercontent.com/Neurocoda/AutoNodeSeek/refs/heads/main/AutoNodeSeek.js#v=2.0, tag=AutoNodeSeek, enabled=true

# 方案二: 若仍使用 5 分钟频率，到达目标时间后自动附带 3~25s 随机秒数延迟
# */5 8-12 * * * https://raw.githubusercontent.com/Neurocoda/AutoNodeSeek/refs/heads/main/AutoNodeSeek.js#v=2.0, tag=AutoNodeSeek, enabled=true

[rewrite_local]
^https:\/\/www\.nodeseek\.com\/($|api\/account\/signIn) url script-request-header https://raw.githubusercontent.com/Neurocoda/AutoNodeSeek/refs/heads/main/AutoNodeSeek.js#v=2.0

[mitm]
hostname = www.nodeseek.com
```

> **注意 (圈 X 缓存机制)**：
> Quantumult X 会强缓存远程脚本。更新脚本后，必须在圈 X 的「构造请求 / 任务列表」中**右滑/点击更新脚本**，或者在 URL 结尾修改版本标识（如 `#v=2.0`），否则圈 X 会一直执行本地旧脚本。
