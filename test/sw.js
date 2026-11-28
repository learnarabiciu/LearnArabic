/* Service worker بسيط: يجلب أحدث نسخة من الإنترنت دائمًا، ويستخدم النسخة المحفوظة فقط عند انقطاع الاتصال */
const CACHE = 'taallum-arabic-test-v1';
const SHELL = ['./', 'index.html', 'style.css', 'script.js', 'manifest.json',
  'assets/icons/icon-192.png', 'assets/icons/icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(SHELL).catch(() => {})).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;      // لا نتدخل في Supabase ولا الخطوط ولا المكتبات

  e.respondWith(
    fetch(req)
      .then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(req).then(r => r || caches.match('index.html')))
  );
});
