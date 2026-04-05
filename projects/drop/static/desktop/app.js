(function () {
    var BASE = '/drop';
    var WS_URL = (location.protocol === 'https:' ? 'wss:' : 'ws:') + '//' + location.host + BASE + '/ws';

    var TOKEN_KEY = 'drop_token';
    var ROOM_KEY = 'drop_room';
    var LAST_SEEN_KEY = 'drop_last_seen';

    var ws = null;
    var token = localStorage.getItem(TOKEN_KEY);
    var roomId = localStorage.getItem(ROOM_KEY);
    var lastSeenId = parseInt(localStorage.getItem(LAST_SEEN_KEY) || '0', 10);
    var reconnectTimeout = null;
    var codeTimerInterval = null;

    function $(sel) { return document.querySelector(sel); }
    function show(el) { el.classList.remove('hidden'); }
    function hide(el) { el.classList.add('hidden'); }

    function setStatus(state, text) {
        var el = $('#status');
        el.className = 'status ' + state;
        el.textContent = text || state.charAt(0).toUpperCase() + state.slice(1);
    }

    function connect() {
        if (ws && ws.readyState <= 1) return;
        setStatus('connecting', 'Connecting...');

        ws = new WebSocket(WS_URL);

        ws.onopen = function () {
            if (token && roomId) {
                ws.send(JSON.stringify({
                    type: 'reconnect',
                    token: token,
                    last_seen_id: 0,
                }));
            } else {
                ws.send(JSON.stringify({ type: 'request_code' }));
            }
        };

        ws.onmessage = function (e) {
            handleMessage(JSON.parse(e.data));
        };

        ws.onclose = function () {
            setStatus('disconnected');
            scheduleReconnect();
        };

        ws.onerror = function () { ws.close(); };
    }

    function scheduleReconnect() {
        if (reconnectTimeout) return;
        reconnectTimeout = setTimeout(function () {
            reconnectTimeout = null;
            connect();
        }, 3000);
    }

    function handleMessage(data) {
        switch (data.type) {
            case 'code':
                showPairingScreen(data.code, data.expires_in);
                if (token) {
                    setStatus('connected', 'Pairing...');
                } else {
                    setStatus('connecting', 'Waiting for pair...');
                }
                break;

            case 'paired':
                token = data.token;
                roomId = data.room_id;
                localStorage.setItem(TOKEN_KEY, token);
                localStorage.setItem(ROOM_KEY, roomId);
                setStatus('connected');
                showFeedScreen();
                break;

            case 'reconnected':
                roomId = data.room_id;
                setStatus('connected');
                showFeedScreen();
                break;

            case 'items':
                clearFeed();
                data.items.forEach(function (item) { addItemToFeed(item); });
                break;

            case 'item':
                addItemToFeed(data);
                break;

            case 'deleted':
                removeItemFromFeed(data.item_id);
                break;

            case 'cleared':
                clearFeed();
                break;

            case 'error':
                console.error('Server error:', data.message);
                if (data.message === 'Invalid token') {
                    localStorage.removeItem(TOKEN_KEY);
                    localStorage.removeItem(ROOM_KEY);
                    token = null;
                    roomId = null;
                    ws.send(JSON.stringify({ type: 'request_code' }));
                }
                break;
        }
    }

    function showPairingScreen(code, expiresIn) {
        show($('#pairing-screen'));
        hide($('#feed-screen'));
        $('#pairing-code').textContent = code;

        var qrContainer = $('#qr-code');
        qrContainer.innerHTML = '';
        var pairUrl = location.origin + BASE + '/pwa/?pair=' + code;
        var qr = qrcode(0, 'M');
        qr.addData(pairUrl);
        qr.make();
        qrContainer.innerHTML = qr.createImgTag(5, 0);

        var remaining = expiresIn;
        if (codeTimerInterval) clearInterval(codeTimerInterval);
        codeTimerInterval = setInterval(function () {
            remaining--;
            if (remaining <= 0) {
                clearInterval(codeTimerInterval);
                if (ws && ws.readyState === 1) {
                    ws.send(JSON.stringify({ type: 'request_code' }));
                }
                return;
            }
            var m = Math.floor(remaining / 60);
            var s = remaining % 60;
            $('#code-timer').textContent = m + ':' + (s < 10 ? '0' : '') + s;
        }, 1000);
    }

    function showFeedScreen() {
        hide($('#pairing-screen'));
        show($('#feed-screen'));
        if (codeTimerInterval) clearInterval(codeTimerInterval);
    }

    function addItemToFeed(item) {
        hide($('#empty-state'));
        var feed = $('#feed');

        var div = document.createElement('div');
        var itemType = item.item_type || item.type;
        div.className = 'feed-item type-' + itemType;
        div.dataset.id = item.id;

        var meta = {};
        if (item.metadata) {
            meta = typeof item.metadata === 'string' ? JSON.parse(item.metadata) : item.metadata;
        }
        var timeStr = formatTime(item.created_at);

        var contentHtml = '';
        switch (itemType) {
            case 'link':
                contentHtml = '<a href="' + escapeHtml(item.content) + '" target="_blank" rel="noopener">' + escapeHtml(item.content) + '</a>';
                break;
            case 'text':
                contentHtml = '<span class="text-content" style="cursor:pointer" title="Click to copy">' + escapeHtml(item.content) + '</span>';
                break;
            case 'image':
                var imgUrl = BASE + '/api/file/' + roomId + '/' + item.id + '?token=' + encodeURIComponent(token);
                contentHtml = '<img src="' + imgUrl + '" alt="' + escapeHtml(meta.filename || 'image') + '" loading="lazy">';
                break;
            case 'file':
                var fileUrl = BASE + '/api/file/' + roomId + '/' + item.id + '?token=' + encodeURIComponent(token);
                var size = meta.size ? formatSize(meta.size) : '';
                contentHtml = escapeHtml(meta.filename || item.content) +
                    ' <span style="color:#666;font-size:11px">' + size + '</span>' +
                    ' <a href="' + fileUrl + '" download="' + escapeHtml(meta.filename || 'file') + '" class="btn-download">Download</a>';
                break;
        }

        div.innerHTML =
            '<div class="item-meta">' + capitalize(itemType) + ' &middot; ' + timeStr + '</div>' +
            '<div class="item-content">' + contentHtml + '</div>' +
            '<button class="item-delete" title="Delete">&times;</button>';

        if (itemType === 'text') {
            var textEl = div.querySelector('.text-content');
            if (textEl) {
                textEl.addEventListener('click', function () {
                    navigator.clipboard.writeText(item.content);
                    showToast('Copied to clipboard');
                });
            }
        }

        div.querySelector('.item-delete').addEventListener('click', function () {
            ws.send(JSON.stringify({ type: 'delete', token: token, item_id: item.id }));
            removeItemFromFeed(item.id);
        });

        var firstItem = feed.querySelector('.feed-item');
        if (firstItem) {
            feed.insertBefore(div, firstItem);
        } else {
            feed.appendChild(div);
        }

        if (item.id > lastSeenId) {
            lastSeenId = item.id;
            localStorage.setItem(LAST_SEEN_KEY, lastSeenId.toString());
        }
    }

    function removeItemFromFeed(itemId) {
        var el = document.querySelector('.feed-item[data-id="' + itemId + '"]');
        if (el) {
            el.style.opacity = '0';
            setTimeout(function () { el.remove(); }, 200);
        }
        setTimeout(function () {
            if (!document.querySelector('.feed-item')) {
                show($('#empty-state'));
            }
        }, 250);
    }

    function clearFeed() {
        var items = document.querySelectorAll('.feed-item');
        for (var i = 0; i < items.length; i++) items[i].remove();
        show($('#empty-state'));
    }

    $('#clear-btn').addEventListener('click', function () {
        if (confirm('Clear all shared items?')) {
            ws.send(JSON.stringify({ type: 'clear', token: token }));
            clearFeed();
        }
    });

    $('#pair-btn').addEventListener('click', function () {
        // Show pairing screen with a new code for the same room
        if (token && ws && ws.readyState === 1) {
            ws.send(JSON.stringify({ type: 'refresh_code', token: token }));
        } else if (ws && ws.readyState === 1) {
            ws.send(JSON.stringify({ type: 'request_code' }));
        }
    });

    $('#unpair-btn').addEventListener('click', function () {
        if (confirm('Unpair this device and clear all data?')) {
            if (token && ws && ws.readyState === 1) {
                ws.send(JSON.stringify({ type: 'clear', token: token }));
            }
            localStorage.removeItem(TOKEN_KEY);
            localStorage.removeItem(ROOM_KEY);
            localStorage.removeItem(LAST_SEEN_KEY);
            token = null;
            roomId = null;
            lastSeenId = 0;
            clearFeed();
            if (ws && ws.readyState === 1) {
                ws.send(JSON.stringify({ type: 'request_code' }));
            }
        }
    });

    function escapeHtml(str) {
        var div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

    function formatTime(iso) {
        if (!iso) return '';
        var d = new Date(iso);
        var now = new Date();
        var diff = (now - d) / 1000;
        if (diff < 60) return 'just now';
        if (diff < 3600) return Math.floor(diff / 60) + ' min ago';
        if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
        return d.toLocaleDateString();
    }

    function formatSize(bytes) {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    }

    function showToast(msg) {
        var toast = document.querySelector('.copied-toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.className = 'copied-toast';
            document.body.appendChild(toast);
        }
        toast.textContent = msg;
        toast.classList.add('show');
        setTimeout(function () { toast.classList.remove('show'); }, 1500);
    }

    connect();
})();
