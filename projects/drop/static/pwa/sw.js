var CACHE_NAME = 'drop-v3';
var SHELL_FILES = [
    '/drop/pwa/',
    '/drop/pwa/style.css',
    '/drop/pwa/app.js',
    '/drop/pwa/manifest.json',
];

self.addEventListener('install', function (e) {
    e.waitUntil(
        caches.open(CACHE_NAME).then(function (cache) { return cache.addAll(SHELL_FILES); })
    );
    self.skipWaiting();
});

self.addEventListener('activate', function (e) {
    e.waitUntil(
        caches.keys().then(function (keys) {
            return Promise.all(keys.filter(function (k) { return k !== CACHE_NAME; }).map(function (k) { return caches.delete(k); }));
        })
    );
    self.clients.claim();
});

self.addEventListener('fetch', function (e) {
    var url = new URL(e.request.url);

    // Intercept share target POST
    if (url.pathname === '/drop/pwa/share-target' && e.request.method === 'POST') {
        e.respondWith(handleShareTarget(e.request));
        return;
    }

    // Don't cache API calls or WebSocket
    if (url.pathname.indexOf('/drop/api/') === 0 || url.pathname.indexOf('/drop/ws') === 0) {
        return;
    }

    e.respondWith(
        fetch(e.request).catch(function () { return caches.match(e.request); })
    );
});

function handleShareTarget(request) {
    return request.formData().then(function (formData) {
        var title = formData.get('title') || '';
        var text = formData.get('text') || '';
        var url = formData.get('url') || '';
        var files = formData.getAll('files');

        var shareData = { title: title, text: text, url: url, files: [] };

        var filePromise;
        if (files.length > 0) {
            filePromise = caches.open('drop-share-temp').then(function (cache) {
                var promises = [];
                for (var i = 0; i < files.length; i++) {
                    (function (file, idx) {
                        var tempUrl = '/drop/share-temp/' + Date.now() + '-' + idx + '-' + file.name;
                        promises.push(
                            cache.put(tempUrl, new Response(file, {
                                headers: {
                                    'Content-Type': file.type,
                                    'X-Filename': file.name,
                                }
                            })).then(function () {
                                shareData.files.push(tempUrl);
                            })
                        );
                    })(files[i], i);
                }
                return Promise.all(promises);
            });
        } else {
            filePromise = Promise.resolve();
        }

        return filePromise.then(function () {
            var textContent = [title, text, url].filter(Boolean).join('\n');
            var params = new URLSearchParams();
            if (textContent) params.set('shared_text', textContent);
            if (shareData.files.length > 0) params.set('shared_files', shareData.files.join(','));

            return Response.redirect('/drop/pwa/?' + params.toString(), 303);
        });
    });
}
