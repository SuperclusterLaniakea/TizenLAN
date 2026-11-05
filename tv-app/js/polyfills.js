/* 最小兼容层：Tizen 2.3 的 WebKit 已支持 ES5，这里只补少量缺口。 */
(function () {
    "use strict";

    if (!window.console) {
        window.console = {};
        window.console.log = function () {};
        window.console.warn = function () {};
        window.console.error = function () {};
    }

    if (!Array.prototype.forEach) {
        Array.prototype.forEach = function (fn, scope) {
            for (var i = 0; i < this.length; i++) {
                fn.call(scope, this[i], i, this);
            }
        };
    }

    if (!Array.prototype.filter) {
        Array.prototype.filter = function (fn, scope) {
            var out = [];
            for (var i = 0; i < this.length; i++) {
                if (fn.call(scope, this[i], i, this)) {
                    out.push(this[i]);
                }
            }
            return out;
        };
    }

    if (!Array.prototype.map) {
        Array.prototype.map = function (fn, scope) {
            var out = [];
            for (var i = 0; i < this.length; i++) {
                out.push(fn.call(scope, this[i], i, this));
            }
            return out;
        };
    }

    if (!Object.keys) {
        Object.keys = function (obj) {
            var keys = [];
            for (var key in obj) {
                if (Object.prototype.hasOwnProperty.call(obj, key)) {
                    keys.push(key);
                }
            }
            return keys;
        };
    }

    if (!String.prototype.trim) {
        String.prototype.trim = function () {
            return this.replace(/^\s+|\s+$/g, "");
        };
    }

    if (!Date.now) {
        Date.now = function () {
            return new Date().getTime();
        };
    }
})();
