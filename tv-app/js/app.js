/* 应用主逻辑：共享管理、浏览、播放、图片查看。 */
(function () {
    "use strict";

    var KEYS = TV.KEYS;

    var state = {
        screen: "home",
        editing: null,
        editPassword: "",
        session: null,
        secrets: {},
        player: null,
        images: null,
        modal: "",
        passwordRequest: null,
        bridgeAfterSave: null,
        confirmAction: null,
        connecting: false,
        bridgeOk: null
    };

    /* ---------------- 小工具 ---------------- */

    function $(name) {
        return UI.id(name);
    }

    function value(name) {
        var el = $(name);
        return el ? String(el.value || "").trim() : "";
    }

    function setValue(name, text) {
        var el = $(name);
        if (el) {
            el.value = text === undefined || text === null ? "" : String(text);
        }
    }

    function displayPath(path) {
        return "/" + String(path || "");
    }

    function sourceLabel(source) {
        return source.name || source.host;
    }

    function sourceDetail(source) {
        if (source.protocol === "smb") {
            return source.host + (source.port && source.port !== 445 ? ":" + source.port : "") +
                " \\ " + (source.share || "");
        }
        return source.host + (source.port && source.port !== 21 ? ":" + source.port : "") +
            (source.secure ? " · FTPS" : "");
    }

    function isNavKey(code) {
        return code === KEYS.UP || code === KEYS.DOWN || code === KEYS.LEFT || code === KEYS.RIGHT;
    }

    function friendlyError(err) {
        if (!err) {
            return "操作失败。";
        }
        return err.message || "操作失败（" + (err.code || "未知错误") + "）。";
    }

    /* ---------------- 屏幕切换 ---------------- */

    function showScreen(name) {
        state.screen = name;
        var screens = document.querySelectorAll(".screen");
        for (var i = 0; i < screens.length; i++) {
            var isTarget = screens[i].getAttribute("data-screen") === name;
            if (isTarget) {
                screens[i].classList.add("active");
            } else {
                screens[i].classList.remove("active");
            }
        }
        UI.setScope(document.querySelector('.screen[data-screen="' + name + '"]'), null);
    }

    function openModal(name, preferred) {
        state.modal = name;
        UI.show(name, true);
        UI.pushScope($(name), preferred ? $(preferred) : null);
    }

    function closeModal(name) {
        if (state.modal !== name) {
            return;
        }
        UI.show(name, false);
        state.modal = "";
        UI.popScope();
    }

    /* ---------------- 弹窗 ---------------- */

    function openConfirm(text, onYes) {
        state.confirmAction = onYes;
        UI.setText("confirm-text", text);
        openModal("modal-confirm", "confirm-no");
    }

    function closeConfirm() {
        state.confirmAction = null;
        closeModal("modal-confirm");
    }

    function openPasswordModal(profile, options) {
        var opts = options || {};
        state.passwordRequest = {
            profile: profile,
            path: opts.path === undefined ? null : opts.path,
            onCancel: opts.onCancel || null
        };
        UI.setText("password-title", opts.title || ("连接 " + sourceLabel(profile)));
        UI.setText("password-desc", opts.desc || "输入共享密码（留空表示匿名登录）。");
        var input = $("password-input");
        input.value = "";
        var status = $("password-status");
        status.textContent = "";
        status.className = "modal-status";
        openModal("modal-password", "password-input");
        try {
            input.focus();
        } catch (e) {
            /* ignore */
        }
    }

    function closePasswordModal() {
        var request = state.passwordRequest;
        state.passwordRequest = null;
        closeModal("modal-password");
        return request;
    }

    function openBridgeModal(afterSave) {
        state.bridgeAfterSave = typeof afterSave === "function" ? afterSave : null;
        setValue("bridge-url", Store.getBridgeUrl());
        var status = $("bridge-status");
        status.textContent = "";
        status.className = "modal-status";
        openModal("modal-bridge", "bridge-url");
    }

    /* ---------------- 首页 ---------------- */

    function updateBridgeChip() {
        var url = Store.getBridgeUrl();
        var label = $("bridge-label");
        var dot = $("bridge-dot");
        if (!url) {
            label.textContent = "中转服务未设置";
            dot.className = "chip-dot";
        } else {
            label.textContent = "中转服务 " + url.replace(/^https?:\/\//i, "");
            dot.className = "chip-dot" + (state.bridgeOk === true ? " ok" : (state.bridgeOk === false ? " bad" : ""));
        }
        var hint = $("home-hint");
        if (hint) {
            hint.textContent = url ? "" : "先按上方设置中转服务地址";
        }
    }

    function buildSourceItem(source) {
        var li = document.createElement("li");
        li.className = "source-item focusable";
        li.setAttribute("tabindex", "0");

        var badge = document.createElement("div");
        badge.className = "source-badge" + (source.protocol === "ftp" ? " ftp" : "");
        badge.textContent = source.protocol === "ftp" ? "FTP" : "SMB";

        var main = document.createElement("div");
        main.className = "source-main";
        var name = document.createElement("div");
        name.className = "source-name";
        name.textContent = sourceLabel(source);
        var meta = document.createElement("div");
        meta.className = "source-meta";
        meta.textContent = sourceDetail(source);
        main.appendChild(name);
        main.appendChild(meta);

        var tail = document.createElement("div");
        tail.className = "source-tail";
        tail.textContent = "按 OK 连接";

        li.appendChild(badge);
        li.appendChild(main);
        li.appendChild(tail);
        li.__source = source;
        li.onclick = function () {
            connectSource(source);
        };
        return li;
    }

    function buildAudioItem() {
        var li = document.createElement("li");
        li.className = "source-item focusable";
        li.setAttribute("tabindex", "0");

        var badge = document.createElement("div");
        badge.className = "source-badge live";
        badge.textContent = "PC";

        var main = document.createElement("div");
        main.className = "source-main";
        var name = document.createElement("div");
        name.className = "source-name";
        name.textContent = "电脑声音";
        var meta = document.createElement("div");
        meta.className = "source-meta";
        meta.textContent = "实时收听中转电脑正在播放的声音";
        main.appendChild(name);
        main.appendChild(meta);

        var tail = document.createElement("div");
        tail.className = "source-tail";
        tail.textContent = "按 OK 收听";

        li.appendChild(badge);
        li.appendChild(main);
        li.appendChild(tail);
        li.__audio = true;
        li.onclick = function () {
            connectAudio();
        };
        return li;
    }

    function buildAddItem() {
        var li = document.createElement("li");
        li.className = "source-item add focusable";
        li.setAttribute("tabindex", "0");

        var badge = document.createElement("div");
        badge.className = "source-badge";
        badge.textContent = "+";

        var main = document.createElement("div");
        main.className = "source-main";
        var name = document.createElement("div");
        name.className = "source-name";
        name.textContent = "添加共享";
        var meta = document.createElement("div");
        meta.className = "source-meta";
        meta.textContent = "SMB 共享文件夹或 FTP 服务器";
        main.appendChild(name);
        main.appendChild(meta);

        li.appendChild(badge);
        li.appendChild(main);
        li.__add = true;
        li.onclick = function () {
            openEditor(null);
        };
        return li;
    }

    function showHome(focusId) {
        var list = $("source-list");
        UI.clear(list);
        var sources = Store.sources();
        list.appendChild(buildAudioItem());
        for (var i = 0; i < sources.length; i++) {
            list.appendChild(buildSourceItem(sources[i]));
        }
        list.appendChild(buildAddItem());
        UI.show("home-empty", sources.length === 0);
        updateBridgeChip();
        showScreen("home");

        var target = null;
        var wanted = focusId || Store.load().lastSourceId;
        var items = list.childNodes;
        for (var j = 0; j < items.length; j++) {
            if (items[j].__source && items[j].__source.id === wanted) {
                target = items[j];
                break;
            }
        }
        if (!target && sources.length) {
            for (var k = 0; k < items.length; k++) {
                if (items[k].__source) {
                    target = items[k];
                    break;
                }
            }
        }
        if (!target) {
            target = list.firstChild;
        }
        if (target) {
            UI.focus(target);
        }
    }

    function connectSource(source) {
        if (!Store.getBridgeUrl()) {
            openBridgeModal(function () {
                connectSource(source);
            });
            return;
        }
        Store.touchSource(source.id);
        if (state.secrets[source.id] !== undefined) {
            startSession(source, state.secrets[source.id], null);
            return;
        }
        openPasswordModal(source, {
            title: "连接 " + sourceLabel(source),
            desc: "输入共享密码（留空表示匿名登录）。密码只保存在电视内存中。"
        });
    }

    /* ---------------- 编辑共享 ---------------- */

    function updateProtocolUi(profile) {
        var smb = profile.protocol === "smb";
        var smbBtn = $("f-proto-smb");
        var ftpBtn = $("f-proto-ftp");
        smbBtn.className = "segment focusable" + (smb ? " on" : "");
        ftpBtn.className = "segment focusable" + (smb ? "" : " on");
        UI.show("row-share", smb);
        UI.show("row-domain", smb);
        UI.show("row-encoding", !smb);
        UI.show("row-secure", !smb);
        $("f-port").setAttribute("placeholder", smb ? "445" : "21");
        $("f-encoding").textContent = Store.encodingLabel(profile.encoding);
        $("f-secure").textContent = profile.secure ? "开启（FTPS）" : "关闭";
    }

    function openEditor(source) {
        var profile;
        if (source) {
            profile = {
                id: source.id,
                name: source.name,
                protocol: source.protocol,
                host: source.host,
                port: source.port,
                share: source.share,
                username: source.username,
                domain: source.domain,
                encoding: source.encoding || "utf8",
                secure: !!source.secure
            };
            UI.setText("editor-title", "编辑共享");
        } else {
            profile = {
                id: "",
                name: "",
                protocol: "smb",
                host: "",
                port: 0,
                share: "",
                username: "",
                domain: "",
                encoding: "utf8",
                secure: false
            };
            UI.setText("editor-title", "添加共享");
        }
        state.editing = profile;
        state.editPassword = "";
        setValue("f-name", profile.name);
        setValue("f-host", profile.host);
        setValue("f-port", profile.port && profile.port !== 445 && profile.port !== 21 ? profile.port : "");
        setValue("f-share", profile.share);
        setValue("f-user", profile.username);
        setValue("f-domain", profile.domain);
        setValue("f-pass", "");
        updateProtocolUi(profile);
        showScreen("editor");
        UI.focus($("f-name"));
    }

    function toggleProtocol(proto) {
        if (!state.editing) {
            return;
        }
        state.editing.protocol = proto;
        updateProtocolUi(state.editing);
    }

    function cycleEncoding() {
        if (!state.editing) {
            return;
        }
        var list = Store.ENCODINGS;
        var idx = list.indexOf(state.editing.encoding);
        state.editing.encoding = list[(idx + 1) % list.length];
        updateProtocolUi(state.editing);
    }

    function toggleSecure() {
        if (!state.editing) {
            return;
        }
        state.editing.secure = !state.editing.secure;
        updateProtocolUi(state.editing);
    }

    function saveEditor() {
        if (!state.editing) {
            return;
        }
        var profile = state.editing;
        var host = value("f-host");
        if (!host) {
            UI.showToast("请填写服务器地址。");
            UI.focus($("f-host"));
            return;
        }
        var port = parseInt(value("f-port"), 10) || 0;
        if (port && (port < 1 || port > 65535)) {
            UI.showToast("端口必须在 1 到 65535 之间。");
            UI.focus($("f-port"));
            return;
        }
        var share = value("f-share");
        if (profile.protocol === "smb" && !share) {
            UI.showToast("请填写 SMB 共享名称。");
            UI.focus($("f-share"));
            return;
        }
        var name = value("f-name");
        if (!name) {
            name = host + (profile.protocol === "smb" && share ? " \\ " + share : "");
        }
        var password = value("f-pass");
        var saved = Store.upsertSource({
            id: profile.id,
            name: name,
            protocol: profile.protocol,
            host: host,
            port: port,
            share: profile.protocol === "smb" ? share : "",
            username: value("f-user"),
            domain: profile.protocol === "smb" ? value("f-domain") : "",
            encoding: profile.encoding,
            secure: profile.secure
        });
        if (!saved) {
            UI.showToast("保存失败，请检查填写内容。");
            return;
        }
        state.editing = null;
        setValue("f-pass", "");
        state.secrets[saved.id] = password;
        UI.showToast("已保存，正在连接…", 4000);
        if (!Store.getBridgeUrl()) {
            openBridgeModal(function () {
                startSession(saved, password, null);
            });
            return;
        }
        startSession(saved, password, null);
    }

    /* ---------------- 会话与浏览 ---------------- */

    function startSession(profile, password, targetPath) {
        if (state.connecting) {
            return;
        }
        state.connecting = true;
        var status = state.passwordRequest ? $("password-status") : null;
        if (status) {
            status.className = "modal-status";
            status.textContent = "正在连接…";
        }
        Api.createSession(profile, password, function (err, result) {
            state.connecting = false;
            if (err) {
                state.bridgeOk = err.code === "network_error" ? false : state.bridgeOk;
                updateBridgeChip();
                var message = friendlyError(err);
                if (status) {
                    status.className = "modal-status error";
                    status.textContent = message;
                } else if (state.screen === "browser" && !state.session) {
                    openPasswordModal(profile, {
                        path: targetPath,
                        title: "重新连接",
                        desc: message,
                        onCancel: function () {
                            showHome(profile.id);
                        }
                    });
                } else {
                    UI.showToast(message, 5000);
                }
                return;
            }
            if (profile.id) {
                state.secrets[profile.id] = password;
                Store.touchSource(profile.id);
            }
            var previous = state.passwordRequest;
            if (previous) {
                closePasswordModal();
            }
            UI.hideToast();
            state.session = {
                sid: result.sid,
                profile: profile,
                password: password,
                title: profile.name || profile.host,
                path: result.path,
                parent: result.parent,
                entries: result.entries || []
            };
            state.bridgeOk = true;
            updateBridgeChip();
            renderBrowser(null);
            if (targetPath !== null && targetPath !== undefined && targetPath !== result.path) {
                loadPath(targetPath, null);
            }
        });
    }

    function profileForSession() {
        return state.session ? state.session.profile : null;
    }

    function updateBrowserHint() {
        var list = $("entry-list");
        if (!list) {
            return;
        }
        var total = 0;
        var index = -1;
        var focus = UI.currentFocus();
        for (var i = 0; i < list.childNodes.length; i++) {
            var item = list.childNodes[i];
            if (!item.__entry) {
                continue;
            }
            if (item === focus) {
                index = total;
            }
            total += 1;
        }
        if (!total) {
            UI.setText("browser-hint", "");
            return;
        }
        var itemHeight = focus && focus.offsetHeight ? focus.offsetHeight : 0;
        var perPage = 1;
        if (itemHeight > 0 && list.clientHeight > 0) {
            perPage = Math.max(1, Math.floor(list.clientHeight / itemHeight));
        }
        var pages = Math.max(1, Math.ceil(total / perPage));
        var page = index >= 0 ? Math.min(pages, Math.floor(index / perPage) + 1) : 1;
        UI.setText("browser-hint", "第 " + page + " / " + pages + " 页 · 共 " + total + " 项");
    }

    function renderBrowser(focusPath) {
        var session = state.session;
        if (!session) {
            showHome();
            return;
        }
        UI.setText("browser-title", session.title);
        UI.setText("browser-path", displayPath(session.path));
        var list = $("entry-list");
        UI.clear(list);
        var entries = session.entries || [];
        for (var i = 0; i < entries.length; i++) {
            list.appendChild(buildEntryItem(entries[i]));
        }
        if (!entries.length) {
            var empty = document.createElement("li");
            empty.className = "entry-item";
            var emptyName = document.createElement("div");
            emptyName.className = "entry-main";
            var text = document.createElement("div");
            text.className = "entry-name";
            text.textContent = "这个文件夹是空的";
            emptyName.appendChild(text);
            empty.appendChild(emptyName);
            list.appendChild(empty);
        }
        UI.show("browser-loading", false);
        showScreen("browser");
        list.scrollTop = 0;
        if (focusPath) {
            focusEntry(focusPath);
        } else if (entries.length) {
            UI.focus(list.firstChild);
        } else {
            UI.focus($("browser-back"));
        }
        updateBrowserHint();
    }

    function buildEntryItem(entry) {
        var li = document.createElement("li");
        li.className = "entry-item focusable" + (entry.dir ? " folder" : "");
        li.setAttribute("tabindex", "0");

        var icon = document.createElement("div");
        icon.className = "entry-icon " + (entry.dir ? "folder" : entry.kind);
        icon.innerHTML = UI.iconSvg(entry.dir ? "folder" : entry.kind);

        var main = document.createElement("div");
        main.className = "entry-main";
        var name = document.createElement("div");
        name.className = "entry-name";
        name.textContent = entry.name;
        var meta = document.createElement("div");
        meta.className = "entry-meta";
        meta.textContent = entry.dir ? "文件夹" : (entry.kind === "subtitle" ? "字幕文件" : UI.formatSize(entry.size));
        main.appendChild(name);
        main.appendChild(meta);

        var tail = document.createElement("div");
        tail.className = "entry-tail";
        tail.textContent = entry.dir ? "打开 ›" : (entry.kind === "video" || entry.kind === "audio" || entry.kind === "image" ? "播放 ›" : "");

        li.appendChild(icon);
        li.appendChild(main);
        li.appendChild(tail);
        li.__entry = entry;
        li.onclick = function () {
            openEntry(entry);
        };
        return li;
    }

    function focusEntry(path) {
        var list = $("entry-list");
        var items = list.childNodes;
        for (var i = 0; i < items.length; i++) {
            if (items[i].__entry && items[i].__entry.path === path) {
                UI.focus(items[i]);
                return;
            }
        }
    }

    function openEntry(entry) {
        if (entry.dir) {
            loadPath(entry.path, null);
            return;
        }
        if (entry.kind === "video" || entry.kind === "audio") {
            playEntry(entry);
            return;
        }
        if (entry.kind === "image") {
            openImage(entry.path);
            return;
        }
        UI.showToast("这个文件不能播放或预览。");
    }

    function loadPath(path, focusPath) {
        var session = state.session;
        if (!session) {
            showHome();
            return;
        }
        UI.show("browser-loading", true);
        Api.list(session.sid, path, function (err, result) {
            UI.show("browser-loading", false);
            if (!err) {
                session.path = result.path;
                session.parent = result.parent;
                session.entries = result.entries || [];
                renderBrowser(focusPath || null);
                return;
            }
            if (err.code === "session_not_found" || err.code === "session_expired" || err.code === "session_limit") {
                var profile = profileForSession();
                if (!profile) {
                    showHome();
                    return;
                }
                state.session = null;
                if (state.secrets[profile.id] !== undefined) {
                    startSession(profile, state.secrets[profile.id], path);
                } else {
                    openPasswordModal(profile, {
                        path: path,
                        title: "会话已过期",
                        desc: "中转会话已过期，请重新输入密码。",
                        onCancel: function () {
                            showHome(profile.id);
                        }
                    });
                }
                return;
            }
            UI.showToast(friendlyError(err), 5000);
        });
    }

    function goBackBrowser() {
        var session = state.session;
        if (!session) {
            showHome();
            return;
        }
        if (!session.path) {
            doDisconnect();
            return;
        }
        loadPath(session.parent === null ? "" : session.parent, null);
    }

    function doDisconnect() {
        var session = state.session;
        state.session = null;
        if (session) {
            Api.closeSession(session.sid, function () {});
        }
        showHome(session && session.profile ? session.profile.id : null);
    }

    /* ---------------- 播放 ---------------- */

    function setPlayerStateText(text) {
        UI.setText("player-state", text);
    }

    function updatePlayerProgress() {
        if (state.player && state.player.live) {
            var liveFill = $("player-bar-fill");
            if (liveFill) {
                liveFill.style.width = "0%";
            }
            UI.setText("player-time", "直播");
            return;
        }
        var pos = Player.getPosition();
        var dur = Player.getDuration();
        var percent = dur > 0 ? Math.min(100, (pos / dur) * 100) : 0;
        var fill = $("player-bar-fill");
        if (fill) {
            fill.style.width = percent.toFixed(2) + "%";
        }
        UI.setText("player-time", UI.formatTime(pos / 1000) + " / " + UI.formatTime(dur / 1000));
    }

    function setPlayerLive(live) {
        var screen = document.querySelector('[data-screen="player"]');
        if (screen) {
            if (live) {
                screen.classList.add("live");
            } else {
                screen.classList.remove("live");
            }
        }
        var keys = $("player-keys");
        if (keys) {
            keys.textContent = live
                ? "OK 静音 · 返回 停止"
                : "OK 暂停 · ←/→ 10 秒 · ↑/↓ 60 秒 · 返回 停止";
        }
    }

    function connectAudio() {
        if (!Store.getBridgeUrl()) {
            openBridgeModal(function () {
                playLiveAudio();
            });
            return;
        }
        playLiveAudio();
    }

    function playLiveAudio() {
        var bridge = Store.getBridgeUrl();
        if (!bridge) {
            openBridgeModal(function () {
                playLiveAudio();
            });
            return;
        }
        state.player = { entry: null, kind: "audio", live: true };
        UI.setText("player-title", "电脑声音");
        UI.setText("player-subtitle", "实时直播 · " + bridge.replace(/^https?:\/\//i, ""));
        setPlayerStateText("正在连接…");
        UI.setText("player-time", "直播");
        setPlayerLive(true);
        UI.show("player-visual", true);
        $("player-visual-icon").innerHTML = UI.iconSvg("audio");
        UI.setText("player-visual-name", "电脑声音");
        showScreen("player");
        Player.open(bridge + "/audio/stream.mp3", "audio", function (err) {
            if (err) {
                UI.showToast(friendlyError(err), 6000);
                closePlayer(false);
                return;
            }
            setPlayerStateText("直播中");
        });
    }

    function bindPlayerEvents() {
        Player.on("time", function () {
            updatePlayerProgress();
        });
        Player.on("state", function (name) {
            var live = state.player && state.player.live;
            if (name === "playing") {
                setPlayerStateText(live ? "直播中" : "播放中");
            } else if (name === "paused") {
                setPlayerStateText(live ? "直播已暂停" : "已暂停");
            }
        });
        Player.on("buffering", function (buffering) {
            var live = state.player && state.player.live;
            setPlayerStateText(buffering ? "缓冲中…" : (Player.isPlaying() ? (live ? "直播中" : "播放中") : "已暂停"));
        });
        Player.on("ended", function () {
            closePlayer(true);
        });
        Player.on("error", function (err) {
            setPlayerStateText("无法播放");
            UI.showToast(friendlyError(err), 6000);
            setTimeout(function () {
                if (state.screen === "player") {
                    closePlayer(false);
                }
            }, 2600);
        });
    }

    function playEntry(entry) {
        var session = state.session;
        if (!session) {
            return;
        }
        state.player = { entry: entry, kind: entry.kind };
        UI.setText("player-title", entry.name);
        UI.setText("player-subtitle", session.title + " · " + displayPath(entry.path));
        setPlayerStateText("正在打开…");
        UI.setText("player-time", "00:00 / 00:00");
        var fill = $("player-bar-fill");
        if (fill) {
            fill.style.width = "0%";
        }
        if (entry.kind === "audio") {
            UI.show("player-visual", true);
            $("player-visual-icon").innerHTML = UI.iconSvg("audio");
            UI.setText("player-visual-name", entry.name);
        } else {
            UI.show("player-visual", false);
            UI.setText("player-visual-name", "");
        }
        setPlayerLive(false);
        showScreen("player");
        var url = Api.streamUrl(session.sid, entry.path);
        Player.open(url, entry.kind, function (err) {
            if (err) {
                UI.showToast(friendlyError(err), 6000);
                closePlayer(false);
                return;
            }
            setPlayerStateText("播放中");
            updatePlayerProgress();
        });
    }

    function closePlayer(ended) {
        var playedPath = state.player && state.player.entry ? state.player.entry.path : null;
        Player.stop();
        state.player = null;
        setPlayerLive(false);
        if (state.session) {
            renderBrowser(playedPath);
        } else {
            showHome();
        }
        if (ended) {
            UI.showToast("播放结束。");
        }
    }

    /* ---------------- 图片 ---------------- */

    function openImage(path) {
        var session = state.session;
        if (!session) {
            return;
        }
        var images = [];
        for (var i = 0; i < session.entries.length; i++) {
            if (session.entries[i].kind === "image") {
                images.push(session.entries[i]);
            }
        }
        var index = -1;
        for (var j = 0; j < images.length; j++) {
            if (images[j].path === path) {
                index = j;
                break;
            }
        }
        if (index < 0) {
            images = [{ path: path, name: path.split("/").pop() }];
            index = 0;
        }
        state.images = { list: images, index: index, currentPath: path };
        showScreen("image");
        renderImage();
    }

    function renderImage() {
        var images = state.images;
        if (!images || !state.session) {
            return;
        }
        var entry = images.list[images.index];
        images.currentPath = entry.path;
        var img = $("image-view");
        img.src = Api.streamUrl(state.session.sid, entry.path);
        UI.setText("image-caption", entry.name + "  (" + (images.index + 1) + " / " + images.list.length + ")");
    }

    function stepImage(delta) {
        var images = state.images;
        if (!images) {
            return;
        }
        var next = images.index + delta;
        if (next < 0) {
            next = images.list.length - 1;
        }
        if (next >= images.list.length) {
            next = 0;
        }
        images.index = next;
        renderImage();
    }

    function closeImage() {
        var images = state.images;
        state.images = null;
        var img = $("image-view");
        if (img) {
            img.removeAttribute("src");
        }
        if (state.session) {
            renderBrowser(images ? images.currentPath : null);
        } else {
            showHome();
        }
    }

    /* ---------------- 按键 ---------------- */

    function isInputFocused() {
        var el = document.activeElement;
        return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT");
    }

    function activateModalButton() {
        UI.activate();
    }

    function handleModalKey(code) {
        if (code === KEYS.BACK || code === KEYS.EXIT) {
            if (state.modal === "modal-bridge") {
                closeModal("modal-bridge");
                state.bridgeAfterSave = null;
            } else if (state.modal === "modal-password") {
                cancelPassword();
            } else if (state.modal === "modal-confirm") {
                closeConfirm();
            }
            return;
        }
        if (code === KEYS.UP || code === KEYS.DOWN) {
            if (isInputFocused()) {
                document.activeElement.blur();
                var primary = state.modal === "modal-password" ? $("modal-connect")
                    : (state.modal === "modal-bridge" ? $("bridge-save") : null);
                if (primary) {
                    UI.focus(primary);
                    return;
                }
            }
            UI.move(code === KEYS.UP ? -1 : 1);
            return;
        }
        if (code === KEYS.ENTER) {
            if (isInputFocused()) {
                document.activeElement.blur();
                var primary = state.modal === "modal-password" ? $("modal-connect")
                    : (state.modal === "modal-bridge" ? $("bridge-save") : null);
                if (primary) {
                    UI.focus(primary);
                    UI.activate();
                }
                return;
            }
            activateModalButton();
        }
    }

    function cancelPassword() {
        var request = closePasswordModal();
        if (request && typeof request.onCancel === "function") {
            request.onCancel();
        } else if (!state.session && state.screen === "browser") {
            showHome();
        }
    }

    function handlePlayerKey(code) {
        if (!state.player) {
            return;
        }
        if (code === KEYS.BACK || code === KEYS.MEDIA_STOP) {
            closePlayer(false);
            return;
        }
        if (state.player.live) {
            if (code === KEYS.ENTER || code === KEYS.MEDIA_PLAY || code === KEYS.MEDIA_PAUSE || code === KEYS.MEDIA_PLAY_PAUSE) {
                setPlayerStateText(Player.toggleMute() ? "已静音" : "直播中");
            }
            return;
        }
        if (code === KEYS.ENTER || code === KEYS.MEDIA_PLAY_PAUSE) {
            Player.toggle();
            setPlayerStateText(Player.isPlaying() ? "播放中" : "已暂停");
            return;
        }
        if (code === KEYS.MEDIA_PLAY) {
            Player.play();
            setPlayerStateText("播放中");
            return;
        }
        if (code === KEYS.MEDIA_PAUSE) {
            Player.pause();
            setPlayerStateText("已暂停");
            return;
        }
        if (code === KEYS.LEFT || code === KEYS.MEDIA_REW) {
            Player.seekBy(-10);
            setPlayerStateText("快退 10 秒");
            return;
        }
        if (code === KEYS.RIGHT || code === KEYS.MEDIA_FF) {
            Player.seekBy(10);
            setPlayerStateText("快进 10 秒");
            return;
        }
        if (code === KEYS.UP) {
            Player.seekBy(60);
            setPlayerStateText("快进 60 秒");
            return;
        }
        if (code === KEYS.DOWN) {
            Player.seekBy(-60);
            setPlayerStateText("快退 60 秒");
        }
    }

    function handleImageKey(code) {
        if (code === KEYS.BACK || code === KEYS.EXIT) {
            closeImage();
            return;
        }
        if (code === KEYS.LEFT) {
            stepImage(-1);
            return;
        }
        if (code === KEYS.RIGHT) {
            stepImage(1);
        }
    }

    function focusedSource() {
        var el = UI.currentFocus();
        if (el && el.__source) {
            return el.__source;
        }
        return null;
    }

    function deleteFocusedSource() {
        var source = focusedSource();
        if (!source) {
            UI.showToast("请先选中一个共享。");
            return;
        }
        openConfirm("确定删除共享“" + sourceLabel(source) + "”吗？", function () {
            Store.removeSource(source.id);
            delete state.secrets[source.id];
            UI.showToast("已删除。");
            showHome();
        });
    }

    function handleHomeKey(code) {
        if (code === KEYS.EXIT) {
            TV.exitApp();
            return;
        }
        if (isNavKey(code)) {
            if (code === KEYS.UP) {
                UI.move(-1);
            } else if (code === KEYS.DOWN) {
                UI.move(1);
            } else {
                UI.move(code === KEYS.LEFT ? -1 : 1);
            }
            return;
        }
        if (code === KEYS.ENTER) {
            UI.activate();
            return;
        }
        if (code === KEYS.COLOR_RED) {
            deleteFocusedSource();
            return;
        }
        if (code === KEYS.COLOR_GREEN) {
            var source = focusedSource();
            if (source) {
                openEditor(source);
            }
        }
    }

    function handleEditorKey(code) {
        if (code === KEYS.BACK) {
            state.editing = null;
            setValue("f-pass", "");
            showHome();
            return;
        }
        if (code === KEYS.ENTER) {
            if (isInputFocused()) {
                return;
            }
            UI.activate();
            return;
        }
        if (code === KEYS.UP || code === KEYS.DOWN || code === KEYS.LEFT || code === KEYS.RIGHT) {
            if (isInputFocused()) {
                if (code === KEYS.UP || code === KEYS.DOWN) {
                    document.activeElement.blur();
                    UI.move(code === KEYS.UP ? -1 : 1);
                }
                return;
            }
            UI.move(code === KEYS.UP || code === KEYS.LEFT ? -1 : 1);
        }
    }

    function handleBrowserKey(code) {
        if (code === KEYS.BACK) {
            goBackBrowser();
            return;
        }
        if (code === KEYS.ENTER) {
            if (isInputFocused()) {
                return;
            }
            UI.activate();
            return;
        }
        if (code === KEYS.UP || code === KEYS.DOWN || code === KEYS.LEFT || code === KEYS.RIGHT) {
            UI.move(code === KEYS.UP || code === KEYS.LEFT ? -1 : 1);
            updateBrowserHint();
            return;
        }
        if (code === KEYS.CHANNEL_UP || code === KEYS.CHANNEL_DOWN) {
            UI.movePage(code === KEYS.CHANNEL_UP ? -1 : 1);
            updateBrowserHint();
            return;
        }
        if (code === KEYS.COLOR_RED) {
            openConfirm("确定断开当前共享吗？", function () {
                doDisconnect();
            });
        }
    }

    function onKeyDown(event) {
        var code = TV.keyCode(event);
        if (state.modal) {
            if (isNavKey(code) || code === KEYS.ENTER || code === KEYS.BACK || code === KEYS.EXIT) {
                event.preventDefault();
            }
            handleModalKey(code);
            return;
        }
        if (state.screen === "player") {
            if (isNavKey(code) || code === KEYS.ENTER || code === KEYS.BACK ||
                code === KEYS.MEDIA_PLAY || code === KEYS.MEDIA_PAUSE ||
                code === KEYS.MEDIA_PLAY_PAUSE || code === KEYS.MEDIA_STOP ||
                code === KEYS.MEDIA_FF || code === KEYS.MEDIA_REW) {
                event.preventDefault();
            }
            handlePlayerKey(code);
            return;
        }
        if (state.screen === "image") {
            if (isNavKey(code) || code === KEYS.BACK || code === KEYS.EXIT) {
                event.preventDefault();
            }
            handleImageKey(code);
            return;
        }
        if (isInputFocused()) {
            if (code === KEYS.UP || code === KEYS.DOWN) {
                event.preventDefault();
                document.activeElement.blur();
                UI.move(code === KEYS.UP ? -1 : 1);
                return;
            }
            if (code === KEYS.ENTER || code === KEYS.LEFT || code === KEYS.RIGHT) {
                return;
            }
        }
        if (isNavKey(code) || ((code === KEYS.CHANNEL_UP || code === KEYS.CHANNEL_DOWN) && state.screen === "browser")) {
            event.preventDefault();
        }
        if (state.screen === "home") {
            handleHomeKey(code);
        } else if (state.screen === "editor") {
            handleEditorKey(code);
        } else if (state.screen === "browser") {
            handleBrowserKey(code);
        }
    }

    /* ---------------- 事件绑定 ---------------- */

    function bindClicks() {
        $("btn-bridge").onclick = function () {
            openBridgeModal(null);
        };
        $("editor-back").onclick = function () {
            state.editing = null;
            setValue("f-pass", "");
            showHome();
        };
        $("editor-save").onclick = saveEditor;
        $("f-proto-smb").onclick = function () {
            toggleProtocol("smb");
        };
        $("f-proto-ftp").onclick = function () {
            toggleProtocol("ftp");
        };
        $("f-encoding").onclick = cycleEncoding;
        $("f-secure").onclick = toggleSecure;
        $("browser-back").onclick = goBackBrowser;
        $("btn-refresh").onclick = function () {
            var focus = UI.currentFocus();
            loadPath(state.session ? state.session.path : "",
                focus && focus.__entry ? focus.__entry.path : null);
        };
        $("btn-disconnect").onclick = function () {
            openConfirm("确定断开当前共享吗？", function () {
                doDisconnect();
            });
        };
        $("bridge-test").onclick = function () {
            var url = Store.normalizeBridge(value("bridge-url"));
            var status = $("bridge-status");
            if (!url) {
                status.className = "modal-status error";
                status.textContent = "请填写中转服务地址。";
                return;
            }
            status.className = "modal-status";
            status.textContent = "正在测试…";
            Api.health(url, function (err, result) {
                if (err) {
                    status.className = "modal-status error";
                    status.textContent = friendlyError(err);
                    return;
                }
                status.className = "modal-status";
                status.textContent = "连接成功（" + (result && result.name ? result.name : "bridge") +
                    (result && result.version ? " " + result.version : "") + "）。";
            });
        };
        $("bridge-save").onclick = function () {
            var url = Store.normalizeBridge(value("bridge-url"));
            var status = $("bridge-status");
            if (!url) {
                status.className = "modal-status error";
                status.textContent = "请填写中转服务地址。";
                return;
            }
            Store.setBridgeUrl(url);
            updateBridgeChip();
            var after = state.bridgeAfterSave;
            state.bridgeAfterSave = null;
            closeModal("modal-bridge");
            UI.showToast("中转服务地址已保存。");
            checkBridge();
            if (typeof after === "function") {
                after();
            }
        };
        $("bridge-cancel").onclick = function () {
            state.bridgeAfterSave = null;
            closeModal("modal-bridge");
        };
        $("modal-connect").onclick = function () {
            if (!state.passwordRequest || state.connecting) {
                return;
            }
            var password = value("password-input");
            startSession(state.passwordRequest.profile, password, state.passwordRequest.path);
        };
        $("modal-cancel").onclick = cancelPassword;
        $("confirm-yes").onclick = function () {
            var action = state.confirmAction;
            closeConfirm();
            if (typeof action === "function") {
                action();
            }
        };
        $("confirm-no").onclick = closeConfirm;
    }

    /* ---------------- 启动 ---------------- */

    function checkBridge() {
        if (!Store.getBridgeUrl()) {
            state.bridgeOk = null;
            updateBridgeChip();
            return;
        }
        Api.health(null, function (err, result) {
            state.bridgeOk = !err && !!(result && result.ok);
            updateBridgeChip();
        });
    }

    function boot() {
        TV.registerKeys();
        bindClicks();
        bindPlayerEvents();
        document.addEventListener("keydown", onKeyDown, false);
        showHome();
        checkBridge();
        setTimeout(function () {
            var bootEl = $("boot");
            if (bootEl) {
                bootEl.classList.add("hide");
                setTimeout(function () {
                    if (bootEl.parentNode) {
                        bootEl.parentNode.removeChild(bootEl);
                    }
                }, 500);
            }
        }, 350);
        if (!Store.getBridgeUrl()) {
            openBridgeModal(null);
        }
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", boot, false);
    } else {
        boot();
    }
})();
