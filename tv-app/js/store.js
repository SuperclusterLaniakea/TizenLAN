/* 本地设置存储。只保存连接参数，永远不保存密码。 */
var Store = (function () {
    "use strict";

    var KEY = "tizenlan.settings.v1";
    var ENCODINGS = ["utf8", "gbk", "gb18030", "big5"];

    function defaults() {
        return {
            bridgeUrl: "",
            sources: [],
            lastSourceId: ""
        };
    }

    function cleanSource(raw) {
        if (!raw || typeof raw !== "object") {
            return null;
        }
        var protocol = String(raw.protocol || "").toLowerCase();
        if (protocol !== "smb" && protocol !== "ftp") {
            protocol = "smb";
        }
        var host = String(raw.host || "").trim();
        if (!host) {
            return null;
        }
        var encoding = String(raw.encoding || "utf8").toLowerCase();
        if (ENCODINGS.indexOf(encoding) < 0) {
            encoding = "utf8";
        }
        var username = String(raw.username || "").slice(0, 256);
        var domain = String(raw.domain || "").slice(0, 256);
        // Microsoft accounts authenticate over NTLM with this pseudo-domain.
        if (protocol === "smb" && !domain && username.indexOf("@") > 0) {
            domain = "MicrosoftAccount";
        }
        return {
            id: String(raw.id || ""),
            name: String(raw.name || "").slice(0, 32),
            protocol: protocol,
            host: host.slice(0, 253),
            port: parseInt(raw.port, 10) || 0,
            share: String(raw.share || "").slice(0, 128),
            username: username,
            domain: domain,
            encoding: encoding,
            secure: !!raw.secure
        };
    }

    function sanitize(raw) {
        var data = defaults();
        if (!raw || typeof raw !== "object") {
            return data;
        }
        data.bridgeUrl = typeof raw.bridgeUrl === "string" ? raw.bridgeUrl : "";
        if (Object.prototype.toString.call(raw.sources) === "[object Array]") {
            for (var i = 0; i < raw.sources.length; i++) {
                var source = cleanSource(raw.sources[i]);
                if (source && source.id) {
                    data.sources.push(source);
                }
            }
        }
        data.lastSourceId = String(raw.lastSourceId || "");
        return data;
    }

    var data = null;

    function load() {
        if (data) {
            return data;
        }
        var raw = null;
        try {
            raw = JSON.parse(window.localStorage.getItem(KEY) || "null");
        } catch (e) {
            raw = null;
        }
        data = sanitize(raw);
        return data;
    }

    function save() {
        try {
            window.localStorage.setItem(KEY, JSON.stringify(data));
            return true;
        } catch (e) {
            return false;
        }
    }

    function normalizeBridge(value) {
        var v = String(value || "").trim().replace(/\/+$/, "");
        if (!v) {
            return "";
        }
        if (!/^https?:\/\//i.test(v)) {
            v = "http://" + v;
        }
        var match = /^(https?:\/\/)([^\/]+)(?:\/.*)?$/i.exec(v);
        if (!match) {
            return "";
        }
        var authority = match[2];
        if (authority.indexOf(":") < 0) {
            authority += ":8099";
        }
        return match[1] + authority;
    }

    function getBridgeUrl() {
        return load().bridgeUrl;
    }

    function setBridgeUrl(value) {
        data.bridgeUrl = normalizeBridge(value);
        save();
        return data.bridgeUrl;
    }

    function sources() {
        return load().sources;
    }

    function findSource(id) {
        var list = load().sources;
        for (var i = 0; i < list.length; i++) {
            if (list[i].id === id) {
                return list[i];
            }
        }
        return null;
    }

    function newId() {
        return "s" + Date.now().toString(36) + Math.floor(Math.random() * 1000).toString(36);
    }

    function upsertSource(source) {
        var clean = cleanSource(source);
        if (!clean) {
            return null;
        }
        if (!clean.id) {
            clean.id = newId();
        }
        var list = load().sources;
        var replaced = false;
        for (var i = 0; i < list.length; i++) {
            if (list[i].id === clean.id) {
                list[i] = clean;
                replaced = true;
                break;
            }
        }
        if (!replaced) {
            list.push(clean);
        }
        data.lastSourceId = clean.id;
        save();
        return clean;
    }

    function removeSource(id) {
        var list = load().sources;
        for (var i = 0; i < list.length; i++) {
            if (list[i].id === id) {
                list.splice(i, 1);
                break;
            }
        }
        if (data.lastSourceId === id) {
            data.lastSourceId = "";
        }
        save();
    }

    function touchSource(id) {
        data.lastSourceId = id;
        save();
    }

    function encodingLabel(value) {
        var map = {
            utf8: "UTF-8",
            gbk: "GBK",
            gb18030: "GB18030",
            big5: "BIG5"
        };
        return map[value] || "UTF-8";
    }

    return {
        ENCODINGS: ENCODINGS,
        load: load,
        save: save,
        normalizeBridge: normalizeBridge,
        getBridgeUrl: getBridgeUrl,
        setBridgeUrl: setBridgeUrl,
        sources: sources,
        findSource: findSource,
        upsertSource: upsertSource,
        removeSource: removeSource,
        touchSource: touchSource,
        encodingLabel: encodingLabel
    };
})();
