/* 播放器：视频用 AVPlay（电视硬件解码），音频和浏览器预览用 HTML5。 */
var Player = (function () {
    "use strict";

    var avplay = null;
    try {
        if (window.webapis && window.webapis.avplay) {
            avplay = window.webapis.avplay;
        }
    } catch (e) {
        avplay = null;
    }

    var mode = "html5";
    var opened = false;
    var prepared = false;
    var playing = false;
    var durationMs = 0;
    var positionMs = 0;
    var pollTimer = null;
    var mediaEl = null;
    var events = {};
    var hasError = false;
    var muted = false;

    function on(name, fn) {
        events[name] = fn;
    }

    function emit(name, arg) {
        if (typeof events[name] === "function") {
            events[name](arg);
        }
    }

    function surfaceRect() {
        var el = UI.id("player-surface");
        if (!el) {
            return { x: 0, y: 0, w: window.innerWidth, h: window.innerHeight };
        }
        var rect = el.getBoundingClientRect();
        var w = Math.round(rect.width);
        var h = Math.round(rect.height);
        if (w <= 0 || h <= 0) {
            return { x: 0, y: 0, w: window.innerWidth, h: window.innerHeight };
        }
        return {
            x: Math.round(rect.left),
            y: Math.round(rect.top),
            w: w,
            h: h
        };
    }

    /* AVPlay 的硬件视频层位于网页层之后，页面背景必须透明才能看到画面。 */
    function setNativePlane(on) {
        try {
            var root = document.documentElement;
            if (on) {
                root.classList.add("avplay-on");
            } else {
                root.classList.remove("avplay-on");
            }
        } catch (e) {
            /* ignore */
        }
    }

    function applyRect() {
        if (mode !== "avplay" || !opened) {
            return;
        }
        var rect = surfaceRect();
        try {
            avplay.setDisplayRect(rect.x, rect.y, rect.w, rect.h);
        } catch (e) {
            /* 某些固件在 prepare 前不允许设置，会再试一次。 */
        }
    }

    window.addEventListener("resize", applyRect, false);

    function clearPoll() {
        if (pollTimer) {
            clearInterval(pollTimer);
            pollTimer = null;
        }
    }

    function startPoll() {
        clearPoll();
        pollTimer = setInterval(function () {
            updatePosition();
        }, 500);
    }

    function updatePosition() {
        if (mode === "avplay" && opened) {
            try {
                positionMs = Math.max(0, Math.round(avplay.getCurrentTime() || 0));
                var d = Math.round(avplay.getDuration() || 0);
                if (d > 0) {
                    durationMs = d;
                }
            } catch (e) {
                /* ignore */
            }
            emit("time", { position: positionMs, duration: durationMs });
            return;
        }
        if (mediaEl) {
            positionMs = Math.max(0, Math.round((mediaEl.currentTime || 0) * 1000));
            if (mediaEl.duration && isFinite(mediaEl.duration)) {
                durationMs = Math.round(mediaEl.duration * 1000);
            }
            emit("time", { position: positionMs, duration: durationMs });
        }
    }

    function fail(code, message) {
        if (hasError) {
            return;
        }
        hasError = true;
        emit("error", { code: code, message: message });
    }

    function avplayErrorText(type) {
        var map = {
            PLAYER_ERROR_NETWORK: "网络中断，无法继续读取视频。",
            PLAYER_ERROR_CONNECTION_FAILED: "连接视频源失败，请检查中转服务和网络。",
            PLAYER_ERROR_INVALID_URI: "视频地址无效。",
            PLAYER_ERROR_NOT_SUPPORTED_FILE: "电视不支持这个视频格式或编码。",
            PLAYER_ERROR_NOT_SUPPORTED_FORMAT: "电视不支持这个视频格式或编码。",
            PLAYER_ERROR_NOT_AVAILABLE: "视频暂时无法播放。",
            PLAYER_ERROR_SKIP_FRAMES: "视频播放出错。"
        };
        return map[type] || ("播放失败（" + type + "）。");
    }

    function html5ErrorText() {
        if (!mediaEl || !mediaEl.error) {
            return "无法播放此文件。";
        }
        var code = mediaEl.error.code;
        if (code === 3) {
            return "电视无法解码此文件的音视频编码。";
        }
        if (code === 4) {
            return "电视不支持此文件格式。";
        }
        return "读取媒体失败，请检查网络连接。";
    }

    function openHtml5(url, kind, cb) {
        var el = kind === "audio" ? new Audio() : document.createElement("video");
        mediaEl = el;
        mode = "html5";
        playing = false;
        durationMs = 0;
        positionMs = 0;
        hasError = false;

        if (kind !== "audio") {
            el.setAttribute("playsinline", "");
            el.setAttribute("webkit-playsinline", "");
            el.controls = false;
            el.autoplay = true;
            var surface = UI.id("player-surface");
            if (surface) {
                surface.appendChild(el);
            }
        } else {
            el.autoplay = true;
            el.preload = "auto";
        }

        el.addEventListener("loadedmetadata", function () {
            if (el.duration && isFinite(el.duration)) {
                durationMs = Math.round(el.duration * 1000);
            }
            emit("time", { position: positionMs, duration: durationMs });
        });
        el.addEventListener("timeupdate", function () {
            positionMs = Math.max(0, Math.round((el.currentTime || 0) * 1000));
            if (el.duration && isFinite(el.duration)) {
                durationMs = Math.round(el.duration * 1000);
            }
            emit("time", { position: positionMs, duration: durationMs });
        });
        el.addEventListener("ended", function () {
            playing = false;
            emit("time", { position: durationMs, duration: durationMs });
            emit("ended");
        });
        el.addEventListener("error", function () {
            fail("html5_error", html5ErrorText());
        });
        el.addEventListener("playing", function () {
            playing = true;
            emit("state", "playing");
        });
        el.addEventListener("pause", function () {
            playing = false;
            emit("state", "paused");
        });

        el.src = url;
        try {
            var promise = el.play();
            if (promise && typeof promise.catch === "function") {
                promise.catch(function () {
                    /* 自动播放被拒绝时由用户按 OK 开始。 */
                });
            }
            playing = true;
        } catch (e) {
            playing = false;
        }
        startPoll();
        cb(null);
    }

    function checkVideoTrack() {
        var tracks;
        try {
            tracks = avplay.getTotalTrackInfo();
        } catch (e) {
            return;
        }
        if (!tracks || !tracks.length) {
            return;
        }
        var hasVideo = false;
        var hasKnownType = false;
        for (var i = 0; i < tracks.length; i++) {
            var type = String((tracks[i] && tracks[i].type) || "").toUpperCase();
            if (type === "VIDEO" || type === "AUDIO" || type === "TEXT" || type === "SUBTITLE") {
                hasKnownType = true;
            }
            if (type === "VIDEO") {
                hasVideo = true;
            }
        }
        if (hasKnownType && !hasVideo) {
            emit("error", {
                code: "no_video_track",
                message: "这个文件没有可播放的视频轨（编码可能不受电视支持），只能听到声音。"
            });
        }
    }

    function open(url, kind, cb) {
        stop();
        hasError = false;

        if (avplay && kind === "video") {
            mode = "avplay";
            try {
                avplay.open(url);
                opened = true;
                setNativePlane(true);
                try {
                    avplay.setDisplayMethod("PLAYER_DISPLAY_MODE_LETTER_BOX");
                } catch (displayMethodError) {
                    /* 旧固件可能没有这个方法。 */
                }
                applyRect();
                avplay.setListener({
                    onbufferingstart: function () {
                        emit("buffering", true);
                    },
                    onbufferingprogress: function () {
                        emit("buffering", true);
                    },
                    onbufferingcomplete: function () {
                        emit("buffering", false);
                    },
                    oncurrentplaytime: function (time) {
                        positionMs = Math.max(0, Math.round(time || 0));
                        emit("time", { position: positionMs, duration: durationMs });
                    },
                    onstreamcompleted: function () {
                        playing = false;
                        emit("time", { position: durationMs, duration: durationMs });
                        emit("ended");
                    },
                    onerror: function (type) {
                        fail("avplay_error", avplayErrorText(String(type || "")));
                    }
                });
                avplay.prepareAsync(function () {
                    prepared = true;
                    applyRect();
                    try {
                        durationMs = Math.round(avplay.getDuration() || 0);
                    } catch (e) {
                        durationMs = 0;
                    }
                    try {
                        avplay.play();
                        playing = true;
                    } catch (e2) {
                        playing = false;
                    }
                    applyRect();
                    checkVideoTrack();
                    startPoll();
                    emit("state", "playing");
                    emit("time", { position: 0, duration: durationMs });
                    cb(null);
                }, function (err) {
                    fail("prepare_failed", "视频准备失败：" + (err && err.message ? err.message : String(err)) + "。");
                    cb({ code: "prepare_failed", message: "视频准备失败，可能是编码不受支持或网络中断。" });
                });
            } catch (e3) {
                fail("open_failed", "无法打开视频：" + (e3 && e3.message ? e3.message : e3));
                cb({ code: "open_failed", message: "无法打开视频。" });
            }
            return;
        }

        openHtml5(url, kind, cb);
    }

    function play() {
        if (mode === "avplay" && opened) {
            try {
                avplay.play();
                playing = true;
                emit("state", "playing");
            } catch (e) {
                /* ignore */
            }
            return;
        }
        if (mediaEl) {
            try {
                mediaEl.play();
                playing = true;
                emit("state", "playing");
            } catch (e2) {
                /* ignore */
            }
        }
    }

    function pause() {
        if (mode === "avplay" && opened) {
            try {
                avplay.pause();
                playing = false;
                emit("state", "paused");
            } catch (e) {
                /* ignore */
            }
            return;
        }
        if (mediaEl) {
            try {
                mediaEl.pause();
                playing = false;
                emit("state", "paused");
            } catch (e2) {
                /* ignore */
            }
        }
    }

    function toggle() {
        if (playing) {
            pause();
        } else {
            play();
        }
        return playing;
    }

    function seekTo(ms) {
        var target = Math.max(0, Math.min(ms, durationMs > 0 ? durationMs : ms));
        positionMs = target;
        emit("time", { position: positionMs, duration: durationMs });
        if (mode === "avplay" && opened) {
            try {
                avplay.seekTo(Math.round(target), function () {
                    /* seek accepted */
                }, function () {
                    /* seek rejected */
                });
            } catch (e) {
                /* ignore */
            }
            return;
        }
        if (mediaEl) {
            try {
                mediaEl.currentTime = target / 1000;
            } catch (e2) {
                /* ignore */
            }
        }
    }

    function seekBy(seconds) {
        seekTo(positionMs + seconds * 1000);
    }

    function stop() {
        clearPoll();
        setNativePlane(false);
        if (mode === "avplay") {
            if (opened) {
                try {
                    avplay.stop();
                } catch (e) {
                    /* ignore */
                }
                try {
                    avplay.close();
                } catch (e2) {
                    /* ignore */
                }
            }
            opened = false;
            prepared = false;
        }
        if (mediaEl) {
            try {
                mediaEl.pause();
            } catch (e3) {
                /* ignore */
            }
            try {
                mediaEl.removeAttribute("src");
                mediaEl.load();
            } catch (e4) {
                /* ignore */
            }
            if (mediaEl.parentNode) {
                mediaEl.parentNode.removeChild(mediaEl);
            }
            mediaEl = null;
        }
        playing = false;
        prepared = false;
        durationMs = 0;
        positionMs = 0;
        hasError = false;
        muted = false;
    }

    function toggleMute() {
        muted = !muted;
        if (mode === "avplay" && prepared) {
            try {
                avplay.setMute(muted);
            } catch (e) {
                /* ignore */
            }
        } else if (mediaEl) {
            mediaEl.muted = muted;
        }
        return muted;
    }

    function isMuted() {
        return muted;
    }

    function isPlaying() {
        return playing;
    }

    function getDuration() {
        return durationMs;
    }

    function getPosition() {
        return positionMs;
    }

    function getMode() {
        return mode;
    }

    return {
        on: on,
        open: open,
        play: play,
        pause: pause,
        toggle: toggle,
        seekTo: seekTo,
        seekBy: seekBy,
        stop: stop,
        toggleMute: toggleMute,
        isMuted: isMuted,
        isPlaying: isPlaying,
        getDuration: getDuration,
        getPosition: getPosition,
        getMode: getMode,
        hasAvplay: !!avplay
    };
})();
