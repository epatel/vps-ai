(function () {
    var BASE = '/drop';
    var WS_URL = (location.protocol === 'https:' ? 'wss:' : 'ws:') + '//' + location.host + BASE + '/ws';

    var TOKEN_KEY = 'drop_token';
    var ROOM_KEY = 'drop_room';

    var ws = null;
    var token = localStorage.getItem(TOKEN_KEY);
    var roomId = localStorage.getItem(ROOM_KEY);
    var reconnectTimeout = null;
    var pendingShareData = null;
    var pendingShareFiles = null;

    function $(sel) { return document.querySelector(sel); }
    function show(el) { el.classList.remove('hidden'); }
    function hide(el) { el.classList.add('hidden'); }

    function setStatus(state, text) {
        var el = $('#status');
        el.className = 'status ' + state;
        el.textContent = text || state.charAt(0).toUpperCase() + state.slice(1);
    }

    function checkShareTarget() {
        var params = new URLSearchParams(location.search);

        var sharedText = params.get('shared_text') || '';
        var sharedTitle = params.get('title') || '';
        var sharedTextOld = params.get('text') || '';
        var sharedUrl = params.get('url') || '';
        var textContent = sharedText || [sharedTitle, sharedTextOld, sharedUrl].filter(Boolean).join('\n');

        if (textContent) {
            pendingShareData = { type: 'text', content: textContent };
        }

        var sharedFiles = params.get('shared_files');
        if (sharedFiles) {
            pendingShareFiles = sharedFiles.split(',');
        }

        var pairCode = params.get('pair');
        if (pairCode && !token) {
            $('#pair-input').value = pairCode;
        }

        if (location.search) {
            history.replaceState(null, '', location.pathname);
        }
    }

    function connect() {
        if (ws && ws.readyState <= 1) return;
        setStatus('connecting', 'Connecting...');

        ws = new WebSocket(WS_URL);

        ws.onopen = function () {
            if (token && roomId) {
                ws.send(JSON.stringify({ type: 'reconnect', token: token, last_seen_id: 0 }));
            } else {
                setStatus('disconnected', 'Not paired');
            }
        };

        ws.onmessage = function (e) { handleMessage(JSON.parse(e.data)); };
        ws.onclose = function () { setStatus('disconnected'); scheduleReconnect(); };
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
            case 'paired':
                token = data.token;
                roomId = data.room_id;
                localStorage.setItem(TOKEN_KEY, token);
                localStorage.setItem(ROOM_KEY, roomId);
                setStatus('connected');
                showComposeScreen();
                processPendingShare();
                break;

            case 'reconnected':
                roomId = data.room_id;
                setStatus('connected');
                showComposeScreen();
                processPendingShare();
                break;

            case 'items':
                clearHistory();
                data.items.forEach(function (item) { addToHistory(item); });
                break;

            case 'error':
                console.error('Server error:', data.message);
                if (data.message === 'Invalid token') {
                    localStorage.removeItem(TOKEN_KEY);
                    localStorage.removeItem(ROOM_KEY);
                    token = null;
                    roomId = null;
                    showPairingScreen();
                }
                break;
        }
    }

    function showPairingScreen() {
        show($('#pairing-screen'));
        hide($('#compose-screen'));
    }

    function showComposeScreen() {
        hide($('#pairing-screen'));
        show($('#compose-screen'));
    }

    function processPendingShare() {
        if (pendingShareData && token) {
            var input = $('#compose-input');
            input.value = pendingShareData.content;
            pendingShareData = null;
            $('#send-btn').click();
        }

        if (pendingShareFiles && token) {
            var files = pendingShareFiles;
            pendingShareFiles = null;
            (async function () {
                var cache = await caches.open('drop-share-temp');
                for (var i = 0; i < files.length; i++) {
                    var resp = await cache.match(files[i]);
                    if (resp) {
                        var blob = await resp.blob();
                        var filename = resp.headers.get('X-Filename') || 'shared-file';
                        var file = new File([blob], filename, { type: blob.type });
                        await uploadFile(file);
                        await cache.delete(files[i]);
                    }
                }
            })();
        }
    }

    // Pairing
    $('#pair-btn').addEventListener('click', function () {
        var code = $('#pair-input').value.trim().toUpperCase();
        if (code.length !== 6) return;
        if (ws && ws.readyState === 1) {
            ws.send(JSON.stringify({ type: 'pair', code: code }));
        }
    });

    $('#pair-input').addEventListener('keydown', function (e) {
        if (e.key === 'Enter') $('#pair-btn').click();
    });

    // Send text/links
    $('#send-btn').addEventListener('click', function () {
        var input = $('#compose-input');
        var content = input.value.trim();
        if (!content || !ws || ws.readyState !== 1) return;

        var itemType = isUrl(content) ? 'link' : 'text';
        ws.send(JSON.stringify({
            type: 'item', token: token,
            item_type: itemType, content: content,
        }));

        addToHistory({ type: itemType, content: content, sender: 'phone', created_at: new Date().toISOString() });
        input.value = '';
        showToast('Sent!');
    });

    // Image upload
    $('#image-input').addEventListener('change', function (e) {
        var file = e.target.files[0];
        if (file) uploadFile(file);
        e.target.value = '';
    });

    // File upload
    $('#file-input').addEventListener('change', function (e) {
        var file = e.target.files[0];
        if (file) uploadFile(file);
        e.target.value = '';
    });

    function uploadFile(file) {
        if (!token) return Promise.resolve();
        if (file.size > 50 * 1024 * 1024) {
            showToast('File too large (max 50MB)');
            return Promise.resolve();
        }

        var formData = new FormData();
        formData.append('token', token);
        formData.append('file', file);

        showToast('Uploading...');

        return fetch(BASE + '/api/upload', {
            method: 'POST',
            body: formData,
        }).then(function (resp) {
            if (resp.ok) {
                var itemType = file.type.startsWith('image/') ? 'image' : 'file';
                addToHistory({
                    type: itemType,
                    content: file.name,
                    sender: 'phone',
                    created_at: new Date().toISOString(),
                    metadata: JSON.stringify({ filename: file.name, size: file.size }),
                });
                showToast('Sent!');
            } else {
                resp.json().then(function (err) { showToast(err.error || 'Upload failed'); });
            }
        }).catch(function () {
            showToast('Upload failed');
        });
    }

    function clearHistory() {
        var items = document.querySelectorAll('.history-item');
        for (var i = 0; i < items.length; i++) items[i].remove();
        show($('#empty-state'));
    }

    function addToHistory(item) {
        hide($('#empty-state'));
        var history = $('#history');

        var div = document.createElement('div');
        var itemType = item.item_type || item.type;
        div.className = 'history-item type-' + itemType;

        var meta = {};
        if (item.metadata) {
            meta = typeof item.metadata === 'string' ? JSON.parse(item.metadata) : item.metadata;
        }
        var contentText = item.content;
        if (itemType === 'image' || itemType === 'file') {
            contentText = meta.filename || item.content;
        }

        var contentHtml = '';
        if (itemType === 'link') {
            contentHtml = '<a href="' + escapeHtml(item.content) + '" target="_blank">' + escapeHtml(item.content) + '</a>';
        } else if (itemType === 'image' && item.id && token) {
            var imgUrl = BASE + '/api/file/' + roomId + '/' + item.id + '?token=' + encodeURIComponent(token);
            contentHtml = '<img src="' + imgUrl + '" alt="' + escapeHtml(meta.filename || 'image') + '" style="max-width:100%;max-height:120px;border-radius:4px;margin-bottom:4px;display:block;">' +
                '<span style="font-size:11px;color:#888;">' + escapeHtml(meta.filename || item.content) + '</span>';
        } else if (itemType === 'image') {
            contentHtml = escapeHtml(meta.filename || item.content) + ' (sent)';
        } else {
            contentHtml = escapeHtml(contentText);
        }

        div.innerHTML =
            '<div class="content">' + contentHtml + '</div>' +
            '<div class="meta">' + capitalize(itemType) + ' &middot; just now</div>';

        var firstItem = history.querySelector('.history-item');
        if (firstItem) {
            history.insertBefore(div, firstItem);
        } else {
            history.appendChild(div);
        }
    }

    function isUrl(str) {
        try {
            var url = new URL(str);
            return url.protocol === 'http:' || url.protocol === 'https:';
        } catch (e) {
            return false;
        }
    }

    function escapeHtml(str) {
        var div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

    function showToast(msg) {
        var toast = document.querySelector('.toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.className = 'toast';
            document.body.appendChild(toast);
        }
        toast.textContent = msg;
        toast.classList.add('show');
        setTimeout(function () { toast.classList.remove('show'); }, 1500);
    }

    // Init
    checkShareTarget();
    if (token && roomId) {
        showComposeScreen();
    } else {
        showPairingScreen();
    }
    connect();

    // Register service worker
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('sw.js').catch(function (err) {
            console.log('SW registration failed:', err);
        });
    }
})();
