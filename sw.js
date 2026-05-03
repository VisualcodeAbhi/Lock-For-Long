const CACHE_NAME = 'lock-for-long-v1';

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll([
                './',
                './index.html',
                './login.html',
                './upload.html',
                './vault.html',
                './style.css',
                './app.js',
                './manifest.json'
            ]);
        })
    );
});

self.addEventListener('fetch', (event) => {
    // Only cache local app files, don't mess with Google Auth or Supabase
    if (event.request.url.startsWith(self.location.origin)) {
        event.respondWith(
            caches.match(event.request).then((response) => {
                return response || fetch(event.request);
            })
        );
    }
});
