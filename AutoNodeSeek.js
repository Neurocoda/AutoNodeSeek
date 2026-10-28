// NodeSeek Auto Check-in & Cookie Capture
// Author: Neurocoda
// Updated: 2026-10-28
//
// 注意: 此处使用行注释而非块注释，因为下面的 cron 表达式以 "*/" 开头，
//       若放在 /* */ 块注释中会提前闭合注释导致语法错误。
//
// [task_local]
// */5 8-12 * * * https://raw.githubusercontent.com/Neurocoda/AutoNodeSeek/refs/heads/main/AutoNodeSeek.js, tag=AutoNodeSeek, enabled=true
//
// [rewrite_local]
// ^https:\/\/www\.nodeseek\.com\/($|api\/account\/signIn) url script-request-header https://raw.githubusercontent.com/Neurocoda/AutoNodeSeek/refs/heads/main/AutoNodeSeek.js
//
// [mitm]
// hostname = www.nodeseek.com
//
// 说明: QX 的 cron 不支持内置随机延时，因此改为每 5 分钟触发一次，
// 由脚本在 08:00 - 12:00 之间随机挑选当天的签到时刻，并在命中时加入 3 分钟内随机延迟。

const cookieKey = "nodeseek_cookie";
const uaKey = "nodeseek_ua";
const loginUrl = "https://www.nodeseek.com/signIn.html";

// ---- 签到时间随机化 ----
// cron 每 5 分钟触发一次（08:00 - 12:55），脚本在当天首次触发时于窗口内
// 随机挑选一个目标时间，命中后加入 3 分钟内随机延迟，彻底打散整点与整分特征。
const jitterKey = "nodeseek_checkin_state"; // 存储 "<日期>|<目标分钟数>"、"<日期>|running|<timestamp>" 或 "<日期>|done"
const windowStartMinute = 8 * 60;           // 08:00
const windowEndMinute = 12 * 60;            // 12:00，需落在 cron 的触发点上
const maxRandomDelaySec = 180;              // 命中签到时间后的最大随机延迟（秒，3 分钟）

function pad2(n) {
    return n < 10 ? "0" + n : "" + n;
}

function todayKey() {
    const d = new Date();
    return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
}

// 是否已到今天的随机签到时间；当天首次触发时生成随机目标
function shouldCheckInNow() {
    const today = todayKey();
    const parts = ($prefs.valueForKey(jitterKey) || "").split("|");
    const savedDate = parts[0];
    const savedTarget = parts[1];

    const now = new Date();
    const nowMinute = now.getHours() * 60 + now.getMinutes();

    if (savedDate === today && savedTarget) {
        if (savedTarget === "done") return false;
        if (savedTarget === "running") {
            const runningTime = parseInt(parts[2] || "0", 10);
            // 5 分钟防重入保护锁：若正在延迟或执行中且未超时，跳过本次触发避免重复；
            // 若超过 5 分钟仍未完成，视为上次执行被系统中断/杀后台，允许重新触发。
            if (Date.now() - runningTime < 5 * 60 * 1000) {
                return false;
            }
            return true;
        }
        return nowMinute >= parseInt(savedTarget, 10);
    }

    const target = windowStartMinute + Math.floor(Math.random() * (windowEndMinute - windowStartMinute + 1));
    $prefs.setValueForKey(today + "|" + target, jitterKey);
    console.log("[NodeSeek] Today's random check-in target: " + Math.floor(target / 60) + ":" + pad2(target % 60));
    return nowMinute >= target;
}

// 标记今天已处理完毕，后续触发直接跳过，避免重复请求与重复通知
function markCheckInDone() {
    $prefs.setValueForKey(todayKey() + "|done", jitterKey);
}

if (typeof $request !== "undefined") {
    getCookie();
} else {
    checkIn();
}

function getCookie() {
    if ($request.headers) {
        const cookie = $request.headers['Cookie'] || $request.headers['cookie'];
        const ua = $request.headers['User-Agent'] || $request.headers['user-agent'];
        if (cookie && cookie.includes("session=")) {
            const oldCookie = $prefs.valueForKey(cookieKey);
            
            if (oldCookie === cookie) {
                // console.log("[NodeSeek] Cookie is unchanged. Skip."); 
                $done({});
                return;
            }
            const cookieSaved = $prefs.setValueForKey(cookie, cookieKey);
            const uaSaved = $prefs.setValueForKey(ua, uaKey);
            if (cookieSaved && uaSaved) {
                console.log("[NodeSeek] Cookie updated successfully");
                $notify("NodeSeek", "Auth Updated", "New credentials saved successfully.");
            }
        }
    }
    $done({});
}

function checkIn() {
    // 未到当天随机到的签到时刻则静默退出（不产生任何请求）
    if (!shouldCheckInNow()) {
        $done();
        return;
    }

    const cookie = $prefs.valueForKey(cookieKey);
    const ua = $prefs.valueForKey(uaKey);

    if (!cookie) {
        $notify("NodeSeek", "Check-in Failed", "No Cookie found. Tap to login.", { "open-url": loginUrl });
        $done();
        return;
    }

    // 随机延迟 0 ~ maxRandomDelaySec 秒（默认 3 分钟内），彻底打破整点、整分、整 00 秒触发特征
    const delaySec = Math.floor(Math.random() * (maxRandomDelaySec + 1));
    const today = todayKey();
    // 写入 running 锁及时间戳，防止下一个 cron 周期重入触发
    $prefs.setValueForKey(today + "|running|" + Date.now(), jitterKey);
    console.log("[NodeSeek] Target time reached. Delaying " + delaySec + "s before sending check-in request...");

    setTimeout(() => {
        executeCheckIn(cookie, ua);
    }, delaySec * 1000);
}

function executeCheckIn(cookie, ua) {
    const url = "https://www.nodeseek.com/api/attendance?random=false";
    const req = {
        url: url,
        method: "POST",
        headers: {
            "Cookie": cookie,
            "User-Agent": ua || "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1",
            "Origin": "https://www.nodeseek.com",
            "Referer": "https://www.nodeseek.com/board",
            "Accept": "application/json, text/javascript, */*; q=0.01",
            "Sec-Fetch-Dest": "empty",
            "Sec-Fetch-Site": "same-origin"
        }
    };

    $task.fetch(req).then(response => {
        try {
            const body = JSON.parse(response.body);
            
            if (body.success === true) {
                console.log("[NodeSeek] Check-in: Success - " + body.message);
                $notify("NodeSeek", "Check-in Success", body.message);
                markCheckInDone();
            
            } else if (body.message && (body.message.includes("今天已完成签到，请勿重复操作") || body.message.includes("already"))) {
                console.log("[NodeSeek] Check-in: Skipped (Already done)");
                markCheckInDone();
            
            } else if (body.message === "USER NOT FOUND") {
                console.log("[NodeSeek] Cookie Invalid: " + body.message);
                $notify("NodeSeek", "Session Expired", "Cookie expired. Tap to re-login.", { "open-url": loginUrl });
            
            } else {
                console.log("[NodeSeek] Check-in: ERR - " + JSON.stringify(body));
                $notify("NodeSeek", "Check-in Error", body.message, { "open-url": loginUrl });
            }
        } catch (e) {
            console.log("[NodeSeek] Parse ERR: " + response.body);
            if (response.statusCode === 401 || response.statusCode === 403) {
                 $notify("NodeSeek", "Session Expired", "Please re-login to update Cookie.", { "open-url": loginUrl });
            } else {
                 $notify("NodeSeek", "Script ERR", "Check logs for details.");
            }
        }
        $done();
    }, reason => {
        // 网络异常不标记完成，清除 running 锁，窗口内后续触发会自动重试
        console.log("[NodeSeek] Network ERR: " + reason.error);
        $notify("NodeSeek", "Network Error", reason.error);
        const now = new Date();
        const nowMinute = now.getHours() * 60 + now.getMinutes();
        $prefs.setValueForKey(todayKey() + "|" + nowMinute, jitterKey);
        $done();
    });
}
