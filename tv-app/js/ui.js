/* DOM、焦点、弹层与格式化辅助。 */
var UI = (function () {
    "use strict";

    var scopeEl = null;
    var focusEl = null;
    var scopeStack = [];
    var toastTimer = null;

    function id(name) {
        return document.getElementById(name);
    }

    function visible(node) {
        return !!node && (node.offsetWidth > 0 || node.offsetHeight > 0 || node.getClientRects().length > 0);
    }

    function focusables() {
        if (!scopeEl) {
            return [];
        }
        var nodes = scopeEl.querySelectorAll(".focusable");
        var out = [];
        for (var i = 0; i < nodes.length; i++) {
            if (visible(nodes[i]) && nodes[i].getAttribute("aria-hidden") !== "true") {
                out.push(nodes[i]);
            }
        }
        return out;
    }

    function scrollNearest(node) {
        var parent = node.parentNode;
        while (parent && parent !== document.body && parent !== document.documentElement) {
            var style = window.getComputedStyle(parent);
            var overflow = style ? style.overflowY : "";
            if ((overflow === "auto" || overflow === "scroll") && parent.scrollHeight > parent.clientHeight + 1) {
                var nodeRect = node.getBoundingClientRect();
                var parentRect = parent.getBoundingClientRect();
                if (nodeRect.top < parentRect.top + 8) {
                    parent.scrollTop -= (parentRect.top - nodeRect.top) + 12;
                } else if (nodeRect.bottom > parentRect.bottom - 8) {
                    parent.scrollTop += (nodeRect.bottom - parentRect.bottom) + 12;
                }
                return;
            }
            parent = parent.parentNode;
        }
    }

    function scrollContainerOf(node) {
        var parent = node ? node.parentNode : null;
        while (parent && parent !== document.body && parent !== document.documentElement) {
            var style = window.getComputedStyle(parent);
            var overflow = style ? style.overflowY : "";
            if ((overflow === "auto" || overflow === "scroll") && parent.clientHeight > 0) {
                return parent;
            }
            parent = parent.parentNode;
        }
        return null;
    }

    function pageStep() {
        var container = scrollContainerOf(focusEl);
        var itemHeight = focusEl ? focusEl.offsetHeight : 0;
        if (!container || !itemHeight) {
            return 5;
        }
        return Math.max(1, Math.floor(container.clientHeight / itemHeight) - 1);
    }

    function movePage(dir) {
        var nodes = focusables();
        if (!nodes.length) {
            return;
        }
        var current = indexOfFocus();
        if (current < 0) {
            focus(nodes[0]);
            return;
        }
        var next = current + (dir < 0 ? -pageStep() : pageStep());
        if (next < 0) {
            next = 0;
        }
        if (next >= nodes.length) {
            next = nodes.length - 1;
        }
        focus(nodes[next]);
    }

    function focus(node) {
        if (!node) {
            return;
        }
        if (focusEl && focusEl !== node) {
            focusEl.classList.remove("focus");
        }
        focusEl = node;
        node.classList.add("focus");
        scrollNearest(node);
    }

    function setScope(el, preferred) {
        scopeEl = el;
        focusEl = null;
        var nodes = focusables();
        if (!nodes.length) {
            return;
        }
        var target = preferred;
        if (!target) {
            target = nodes[0];
        }
        focus(target);
    }

    function pushScope(el, preferred) {
        scopeStack.push({ scope: scopeEl, focus: focusEl });
        setScope(el, preferred);
    }

    function popScope() {
        var prev = scopeStack.pop();
        if (!prev) {
            return;
        }
        scopeEl = prev.scope;
        focusEl = null;
        if (prev.focus && visible(prev.focus)) {
            focus(prev.focus);
        } else {
            var nodes = focusables();
            if (nodes.length) {
                focus(nodes[0]);
            }
        }
    }

    function currentScope() {
        return scopeEl;
    }

    function currentFocus() {
        return focusEl;
    }

    function indexOfFocus() {
        var nodes = focusables();
        for (var i = 0; i < nodes.length; i++) {
            if (nodes[i] === focusEl) {
                return i;
            }
        }
        return -1;
    }

    function move(delta) {
        var nodes = focusables();
        if (!nodes.length) {
            return;
        }
        var current = indexOfFocus();
        if (current < 0) {
            focus(nodes[0]);
            return;
        }
        var next = current + delta;
        if (next < 0) {
            next = 0;
        }
        if (next >= nodes.length) {
            next = nodes.length - 1;
        }
        focus(nodes[next]);
    }

    function focusFirst() {
        var nodes = focusables();
        if (nodes.length) {
            focus(nodes[0]);
        }
    }

    function activate() {
        if (!focusEl) {
            return;
        }
        if (focusEl.tagName === "INPUT" || focusEl.tagName === "SELECT" || focusEl.tagName === "TEXTAREA") {
            try {
                focusEl.focus();
            } catch (e) {
                /* ignore */
            }
            return;
        }
        try {
            focusEl.click();
        } catch (e2) {
            /* ignore */
        }
    }

    function showToast(text, ms) {
        var el = id("toast");
        if (!el) {
            return;
        }
        el.textContent = String(text || "");
        el.classList.remove("hidden");
        if (toastTimer) {
            clearTimeout(toastTimer);
        }
        toastTimer = setTimeout(function () {
            el.classList.add("hidden");
        }, ms || 3200);
    }

    function hideToast() {
        var el = id("toast");
        if (el) {
            el.classList.add("hidden");
        }
        if (toastTimer) {
            clearTimeout(toastTimer);
            toastTimer = null;
        }
    }

    function setText(name, text) {
        var el = id(name);
        if (el) {
            el.textContent = String(text === undefined || text === null ? "" : text);
        }
    }

    function show(name, on) {
        var el = id(name);
        if (!el) {
            return;
        }
        if (on) {
            el.classList.remove("hidden");
        } else {
            el.classList.add("hidden");
        }
    }

    function formatSize(bytes) {
        var n = Number(bytes) || 0;
        if (n < 1024) {
            return n + " B";
        }
        if (n < 1024 * 1024) {
            return (n / 1024).toFixed(n < 10 * 1024 ? 1 : 0) + " KB";
        }
        if (n < 1024 * 1024 * 1024) {
            return (n / (1024 * 1024)).toFixed(1) + " MB";
        }
        return (n / (1024 * 1024 * 1024)).toFixed(2) + " GB";
    }

    function pad2(n) {
        return n < 10 ? "0" + n : String(n);
    }

    function formatTime(seconds) {
        var total = Math.max(0, Math.floor(Number(seconds) || 0));
        var h = Math.floor(total / 3600);
        var m = Math.floor((total % 3600) / 60);
        var s = total % 60;
        if (h > 0) {
            return h + ":" + pad2(m) + ":" + pad2(s);
        }
        return pad2(m) + ":" + pad2(s);
    }

    function iconSvg(kind) {
        if (kind === "folder" || kind === "dir") {
            return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" ' +
                'stroke-linecap="round" stroke-linejoin="round"><path d="M3 6.5A1.5 1.5 0 0 1 4.5 5h4l2 2.5h9A1.5 1.5 0 0 1 21 9v9.5a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.5z"/></svg>';
        }
        if (kind === "video") {
            return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" ' +
                'stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2.5"/>' +
                '<path d="M10 9.5l5 2.5-5 2.5z" fill="currentColor" stroke="none"/></svg>';
        }
        if (kind === "audio") {
            return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" ' +
                'stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V6l10-2v12"/>' +
                '<circle cx="6.5" cy="18" r="2.5"/><circle cx="16.5" cy="16" r="2.5"/></svg>';
        }
        if (kind === "image") {
            return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" ' +
                'stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4.5" width="18" height="15" rx="2.5"/>' +
                '<circle cx="8.5" cy="10" r="1.8"/><path d="M4 18l5.5-5 4 3.5L17 13l3 3.5"/></svg>';
        }
        return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" ' +
            'stroke-linecap="round" stroke-linejoin="round"><path d="M7 3.5h7l4 4V20a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 6 20V5A1.5 1.5 0 0 1 7 3.5z"/>' +
            '<path d="M14 3.5V8h4.5"/></svg>';
    }

    function clear(node) {
        while (node && node.firstChild) {
            node.removeChild(node.firstChild);
        }
    }

    return {
        id: id,
        visible: visible,
        setScope: setScope,
        pushScope: pushScope,
        popScope: popScope,
        currentScope: currentScope,
        currentFocus: currentFocus,
        move: move,
        movePage: movePage,
        focusFirst: focusFirst,
        focus: focus,
        activate: activate,
        showToast: showToast,
        hideToast: hideToast,
        setText: setText,
        show: show,
        formatSize: formatSize,
        formatTime: formatTime,
        iconSvg: iconSvg,
        clear: clear
    };
})();
