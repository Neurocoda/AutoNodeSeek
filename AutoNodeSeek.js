/*
NodeSeek Auto Check-in & Cookie Capture
Author: Neurocoda
Updated: 2026-02-03

[task_local]
0 9 * * * nodeseek_checkin.js, tag=NodeSeek Check-in, img-url=https://www.nodeseek.com/static/images/icon.png, enabled=true

[rewrite_local]
^https:\/\/www\.nodeseek\.com\/($|api\/account\/signIn) url script-request-header nodeseek_checkin.js

[mitm]
hostname = www.nodeseek.com
*/

const cookieKey = "nodeseek_cookie";
const uaKey = "nodeseek_ua";
const loginUrl = "https://www.nodeseek.com/signIn.html";

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
            
            } else if (body.message && (body.message.includes("今天已完成签到，请勿重复操作") || body.message.includes("already"))) {
                console.log("[NodeSeek] Check-in: Skipped (Already done)");
            
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
