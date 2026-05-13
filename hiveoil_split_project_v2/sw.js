// HIVEOIL 식용유니버스 Service Worker
// v3.0 — Web Push 지원 추가 (캐시 없음 + push 이벤트 핸들러)

const SW_VERSION = '3.0-push';

// 설치 — 즉시 활성화
self.addEventListener('install', (event) => {
  console.log('[SW]', SW_VERSION, 'install');
  self.skipWaiting();
});

// 활성화 — 모든 캐시 비우고 즉시 모든 클라이언트 제어
self.addEventListener('activate', (event) => {
  console.log('[SW]', SW_VERSION, 'activate');
  event.waitUntil(
    Promise.all([
      caches.keys().then((keys) =>
        Promise.all(keys.map((k) => caches.delete(k)))
      ),
      self.clients.claim(),
    ])
  );
});

// fetch — 캐시 사용 안 함 (네트워크 우선, 브라우저 기본 동작)
// 핸들러를 등록하지 않으면 브라우저가 알아서 처리하므로 생략

// 🔔 Push 이벤트 — 서버에서 전송된 알림 표시
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = {
      title: '🫒 식용유니버스',
      body: event.data ? event.data.text() : '새 알림',
    };
  }

  const title = data.title || '🫒 식용유니버스';
  const options = {
    body: data.body || '',
    icon: data.icon || '/HIVEOIL/icon-192.png',
    badge: data.badge || '/HIVEOIL/icon-192.png',
    tag: data.tag || 'general',
    renotify: true, // 같은 tag도 다시 진동/소리
    data: { url: data.url || '/HIVEOIL/' },
    requireInteraction: false,
    vibrate: [200, 100, 200],
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// 🖱️ 알림 클릭 — 앱 열기 / 이미 열린 탭 포커스
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl =
    (event.notification.data && event.notification.data.url) || '/HIVEOIL/';

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        // 이미 열린 탭이 있으면 거기로 포커스
        for (const client of clientList) {
          if (client.url.includes('/HIVEOIL/') && 'focus' in client) {
            try {
              client.navigate(targetUrl);
            } catch (e) {}
            return client.focus();
          }
        }
        // 없으면 새 창으로 열기
        if (self.clients.openWindow) {
          return self.clients.openWindow(targetUrl);
        }
      })
  );
});

console.log('[SW] loaded', SW_VERSION);
