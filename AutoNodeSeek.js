// NodeSeek Auto Check-in & Cookie Capture
// Author: Neurocoda
// Updated: 2026-09-30
//
// [task_local]
// */10 8-12 * * * https://raw.githubusercontent.com/Neurocoda/AutoNodeSeek/refs/heads/main/AutoNodeSeek.js, tag=AutoNodeSeek, enabled=true
//
// [rewrite_local]
// ^https:\/\/www\.nodeseek\.com\/($|api\/account\/signIn) url script-request-header https://raw.githubusercontent.com/Neurocoda/AutoNodeSeek/refs/heads/main/AutoNodeSeek.js
//
// [mitm]
// hostname = www.nodeseek.com
const cookieKey = "nodeseek_cookie";
const uaKey = "nodeseek_ua";
const loginUrl = "https://www.nodeseek.com/signIn.html";
// cron 每 10 分钟运行一次；每天首次运行时抽取 08:00–12:00 内的目标分钟。
const jitterKey = "nodeseek_checkin_state"; // 存储 "<日期>|<目标分钟数>" 或 "<日期>|done"
const windowStartMinute = 8 * 60;
const windowEndMinute = 12 * 60; // 12:00 正好有 cron 触发
function pad2(n) {
    return n < 10 ? "0" + n : "" + n;
}
function todayKey() {
    const d = new Date();
    return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
}
function shouldCheckInNow() {
    const today = todayKey();
    const parts = ($prefs.valueForKey(jitterKey) || "").split("|");
    const savedDate = parts[0];
    const savedTarget = parts[1];
    const now = new Date();
    const nowMinute = now.getHours() * 60 + now.getMinutes();
    if (savedDate === today && savedTarget) {
        if (savedTarget === "done") return false;
        return nowMinute >= parseInt(savedTarget, 10);
    }
    const target = windowStartMinute + Math.floor(Math.random() * (windowEndMinute - windowStartMinute + 1));
    $prefs.setValueForKey(today + "|" + target, jitterKey);
    console.log("[NodeSeek] Today's random check-in target: " + Math.floor(target / 60) + ":" + pad2(target % 60));
    return nowMinute >= target;
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
        $done();
    });
}
