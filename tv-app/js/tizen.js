/* Tizen TV 平台辅助：遥控器按键、按键注册、退出应用。 */
var TV = (function () {
    "use strict";

    var KEYS = {
        BACK: 10009,
        EXIT: 10182,
        ENTER: 13,
        LEFT: 37,
        UP: 38,
        RIGHT: 39,
        DOWN: 40,
        INFO: 457,
        TOOLS: 459,
        GUIDE: 458,
        CHANNEL_UP: 427,
        CHANNEL_DOWN: 428,
        COLOR_RED: 403,
        COLOR_GREEN: 404,
        COLOR_YELLOW: 405,
        COLOR_BLUE: 406,
        MEDIA_PLAY: 415,
        MEDIA_PAUSE: 19,
        MEDIA_PLAY_PAUSE: 10252,
        MEDIA_STOP: 413,
        MEDIA_FF: 417,
        MEDIA_REW: 412
    };

    var REGISTER_KEYS = [
        "MediaPlay",
        "MediaPause",
        "MediaPlayPause",
        "MediaStop",
        "MediaFastForward",
        "MediaRewind",
        "Info",
        "Tools",
        "Guide",
        "ColorF0Red",
        "ColorF1Green",
        "ColorF2Yellow",
        "ColorF3Blue",
        "ChannelUp",
        "ChannelDown"
    ];

    var hasTizen = false;

    try {
        hasTizen = !!(window.tizen && window.tizen.tvinputdevice && window.tizen.application);
    } catch (e) {
        hasTizen = false;
    }

    function registerKeys() {
        if (!hasTizen) {
            return;
        }
        for (var i = 0; i < REGISTER_KEYS.length; i++) {
            try {
                window.tizen.tvinputdevice.registerKey(REGISTER_KEYS[i]);
            } catch (e) {
                /* 某些型号没有这些键。 */
            }
        }
    }

    function exitApp() {
        try {
            if (hasTizen && window.tizen.application.getCurrentApplication) {
                window.tizen.application.getCurrentApplication().exit();
                return;
            }
        } catch (e) {
            /* 继续尝试关闭窗口 */
        }
        try {
            window.close();
        } catch (e2) {
            /* ignore */
        }
    }

    function keyCode(event) {
        if (!event) {
            return 0;
        }
        return event.keyCode || event.which || 0;
    }

    return {
        KEYS: KEYS,
        hasTizen: hasTizen,
        registerKeys: registerKeys,
        exitApp: exitApp,
        keyCode: keyCode
    };
})();
