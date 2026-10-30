// NodeSeek Auto Check-in & Cookie Capture
// Author: Neurocoda
// Updated: 2026-10-30
//
// 注意: 此处使用行注释而非块注释，因为下面的 cron 表达式以 "*/" 或 "*" 开头，
//       若放在 /* */ 块注释中会提前闭合注释导致语法错误。
//
// [task_local]
// # 方案一 (推荐，全随机): 每分钟检测一次，到达当天抽取的随机分钟和秒数后触发，零点整秒无特征
// * 8-12 * * * https://raw.githubusercontent.com/Neurocoda/AutoNodeSeek/refs/heads/main/AutoNodeSeek.js#v=2.0, tag=AutoNodeSeek, enabled=true
//
// # 方案二 (兼容旧习惯): 每 5 分钟触发一次，命中后在 5~120 秒内随机抖动发出
// # */5 8-12 * * * https://raw.githubusercontent.com/Neurocoda/AutoNodeSeek/refs/heads/main/AutoNodeSeek.js#v=2.0, tag=AutoNodeSeek, enabled=true
//
// [rewrite_local]
// ^https:\/\/www\.nodeseek\.com\/($|api\/account\/signIn) url script-request-header https://raw.githubusercontent.com/Neurocoda/AutoNodeSeek/refs/heads/main/AutoNodeSeek.js#v=2.0
//
// [mitm]
// hostname = www.nodeseek.com

const cookieKey = "nodeseek_cookie";
const uaKey = "nodeseek_ua";
const loginUrl = "https://www.nodeseek.com/signIn.html";

// ---- 随机签到时刻规划 ----
// jitterKey 存储: "<日期>|<目标分钟>|<目标秒数>"、"<日期>|running|<timestamp>" 或 "<日期>|done"
const jitterKey = "nodeseek_checkin_state";
const windowStartMinute = 8 * 60; // 08:00
const windowEndMinute = 12 * 60;  // 12:00

function pad2(n) {
    return n < 10 ? "0" + n : "" + n;
}

function todayKey() {
    const d = new Date();
    return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
}

// 决策当前是否执行，并返回当前执行所需的延迟秒数
function getCheckInPlan() {
    const today = todayKey();
    const state = $prefs.valueForKey(jitterKey) || "";
    const parts = state.split("|");
    const savedDate = parts[0];
    const status = parts[1];

    const now = new Date();
    const nowMinute = now.getHours() * 60 + now.getMinutes();
    const nowSecond = now.getSeconds();

    if (savedDate === today) {
        if (status === "done") {
            return { shouldRun: false };
        }
        if (status === "running") {
            const runningTime = parseInt(parts[2] || "0", 10);
            // 防重入锁：若前一个任务在 3 分钟内处于延时/发送中，跳过本次触发
            if (Date.now() - runningTime < 3 * 60 * 1000) {
                return { shouldRun: false };
            }
            // 超过 3 分钟仍为 running，说明上次被系统后台强杀，允许本次恢复重试
        } else {
            const targetMinute = parseInt(status, 10);
            const targetSecond = parseInt(parts[2] || "20", 10);

            // 正好到达当天规划的目标分钟
            if (nowMinute === targetMinute) {
                const delaySec = Math.max(2, targetSecond - nowSecond);
                return { shouldRun: true, delaySec: delaySec };
            }
            // 若因锁屏/系统休眠错过了目标分钟（nowMinute > targetMinute），唤醒时自动补签
            // 补签附带 3 ~ 25 秒随机抖动，避免卡在唤醒的 00 秒整点
            if (nowMinute > targetMinute) {
                const catchUpDelay = Math.floor(Math.random() * 23) + 3;
                return { shouldRun: true, delaySec: catchUpDelay };
            }
            // 尚未到达目标时刻
            return { shouldRun: false };
        }
    }

    // 当天首次唤醒：生成当天的目标分钟（08:00 - 12:00 之间的任意一分钟）和目标秒数（4 ~ 55 秒）
    const targetMinute = windowStartMinute + Math.floor(Math.random() * (windowEndMinute - windowStartMinute + 1));
    const targetSecond = Math.floor(Math.random() * 52) + 4;
    $prefs.setValueForKey(`${today}|${targetMinute}|${targetSecond}`, jitterKey);
    console.log(`[NodeSeek] Today's random target: ${Math.floor(targetMinute / 60)}:${pad2(targetMinute % 60)}:${pad2(targetSecond)}`);

    if (nowMinute === targetMinute) {
        return { shouldRun: true, delaySec: Math.max(2, targetSecond - nowSecond) };
    }
    if (nowMinute > targetMinute) {
        const catchUpDelay = Math.floor(Math.random() * 23) + 3;
        return { shouldRun: true, delaySec: catchUpDelay };
    }
    return { shouldRun: false };
}

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
    const plan = getCheckInPlan();
    if (!plan.shouldRun) {
        $done();
        return;
    }

    const cookie = $prefs.valueForKey(cookieKey);
    const ua = $prefs.valueForKey(uaKey);

    if (!cookie) {
        console.log("[NodeSeek] No Cookie found.");
        $notify("NodeSeek", "Check-in Failed", "No Cookie found. Tap to login.", { "open-url": loginUrl });
        $done();
        return;
    }

    const today = todayKey();
    const delaySec = plan.delaySec || 5;

    // 记录 running 状态锁，带上当前时间戳
    $prefs.setValueForKey(`${today}|running|${Date.now()}`, jitterKey);
    console.log(`[NodeSeek] Target time reached. Delaying ${delaySec}s before sending check-in request...`);

    setTimeout(function() {
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
        console.log("[NodeSeek] Network ERR: " + reason.error);
        $notify("NodeSeek", "Network Error", reason.error);
        // 网络失败清空 running 锁，允许后续继续补试
        const now = new Date();
        const nowMinute = now.getHours() * 60 + now.getMinutes();
        $prefs.setValueForKey(`${todayKey()}|${nowMinute}|10`, jitterKey);
        $done();
    });
}
