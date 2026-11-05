/* 与局域网中转服务通信（Tizen 2.3 只有 XHR，没有 fetch）。 */
var Api = (function () {
    "use strict";

    function makeError(code, message, status) {
        return {
            code: code || "network_error",
            message: message || "网络请求失败。",
            status: status || 0
        };
    }

    function request(method, base, path, body, timeoutMs, cb) {
        var xhr = new XMLHttpRequest();
        var url = base + path;
        var finished = false;

        function done(err, result) {
            if (finished) {
                return;
            }
            finished = true;
            cb(err, result);
        }

        try {
            xhr.open(method, url, true);
            xhr.timeout = timeoutMs || 15000;
            if (body !== null && body !== undefined) {
                xhr.setRequestHeader("Content-Type", "text/plain;charset=UTF-8");
            }
            xhr.onreadystatechange = function () {
                if (xhr.readyState !== 4) {
                    return;
                }
                var result = null;
                try {
                    result = JSON.parse(xhr.responseText || "null");
                } catch (e) {
                    result = null;
                }
                if (xhr.status >= 200 && xhr.status < 300) {
                    done(null, result);
                    return;
                }
                if (xhr.status === 0) {
                    done(makeError("network_error", "无法连接中转服务，请检查地址和电脑上的服务是否已启动。", 0));
                    return;
                }
                var code = result && result.error ? result.error : "http_" + xhr.status;
                var message = result && result.message ? result.message : "请求失败（HTTP " + xhr.status + "）。";
                done(makeError(code, message, xhr.status));
            };
            xhr.onerror = function () {
                done(makeError("network_error", "网络错误，请确认电视和运行中转服务的电脑在同一局域网。", 0));
            };
            xhr.ontimeout = function () {
                done(makeError("timeout", "连接超时，服务器没有响应。", 0));
            };
            xhr.send(body === null || body === undefined ? null : JSON.stringify(body));
        } catch (e) {
            done(makeError("network_error", "无法发送请求：" + (e && e.message ? e.message : e), 0));
        }
    }

    function bridgeBase() {
        return Store.getBridgeUrl();
    }

    function health(base, cb) {
        var target = base || bridgeBase();
        if (!target) {
            cb(makeError("no_bridge", "还没有设置中转服务地址。", 0), null);
            return;
        }
        request("GET", target, "/api/health", null, 6000, cb);
    }

    function createSession(profile, password, cb) {
        var base = bridgeBase();
        if (!base) {
            cb(makeError("no_bridge", "还没有设置中转服务地址。", 0), null);
            return;
        }
        var body = {
            protocol: profile.protocol,
            host: profile.host,
            port: profile.port || 0,
            share: profile.protocol === "smb" ? profile.share : "",
            username: profile.username || "",
            password: password || "",
            domain: profile.domain || "",
            secure: profile.protocol === "ftp" ? !!profile.secure : false,
            encoding: profile.protocol === "ftp" ? (profile.encoding || "utf8") : "utf8",
            name: profile.name || ""
        };
        request("POST", base, "/api/session", body, 30000, cb);
    }

    function list(sid, path, cb) {
        var base = bridgeBase();
        if (!base) {
            cb(makeError("no_bridge", "还没有设置中转服务地址。", 0), null);
            return;
        }
        var query = "/api/list?sid=" + encodeURIComponent(sid) + "&path=" + encodeURIComponent(path || "");
        request("GET", base, query, null, 20000, cb);
    }

    function closeSession(sid, cb) {
        var base = bridgeBase();
        if (!base || !sid) {
            if (cb) {
                cb(null, null);
            }
            return;
        }
        var query = "/api/session?sid=" + encodeURIComponent(sid);
        request("DELETE", base, query, null, 8000, function (err) {
            if (cb) {
                cb(err || null, null);
            }
        });
    }

    function encodePath(path) {
        var parts = String(path || "").split("/");
        var out = [];
        for (var i = 0; i < parts.length; i++) {
            if (parts[i]) {
                out.push(encodeURIComponent(parts[i]));
            }
        }
        return out.join("/");
    }

    function streamUrl(sid, path) {
        return bridgeBase() + "/s/" + sid + "/" + encodePath(path);
    }

    return {
        health: health,
        createSession: createSession,
        list: list,
        closeSession: closeSession,
        streamUrl: streamUrl,
        encodePath: encodePath
    };
})();
