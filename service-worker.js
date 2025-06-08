const CACHE_NAME = 'attendance-cache-v23';
const urlsToCache = [
    '/diemdanh/',
    '/diemdanh/index.html',
    '/diemdanh/styles.css',
    '/diemdanh/main.js',
    '/diemdanh/manifest.json',
    '/diemdanh/html5-qrcode.min.js',
    '/diemdanh/images/logo.jpg',
    '/diemdanh/images/icon.png'
];

self.addEventListener('install', event => {
    console.log('Service Worker đang được cài đặt...');
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('Mở cache:', CACHE_NAME);
                return cache.addAll(urlsToCache);
            })
    );
    self.skipWaiting(); // Bỏ qua trạng thái chờ và kích hoạt ngay lập tức
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') {
      event.respondWith(fetch(event.request));
      return;
  }

    const requestURL = new URL(event.request.url);
    if (requestURL.searchParams.get('mode') === 'report') {
        // Tránh fallback, trả về kết quả fetch trực tiếp
        event.respondWith(fetch(event.request));
        return;
    }

  event.respondWith(
      caches.open(CACHE_NAME).then(cache => {
          return cache.match(event.request).then(cachedResponse => {
              const networkFetch = fetch(event.request).then(networkResponse => {
                  if (networkResponse && networkResponse.status === 200) {
                      cache.put(event.request, networkResponse.clone());
                  }
                  return networkResponse;
              }).catch(error => {
                  console.error("Lỗi fetch từ network:", error);
                  return cachedResponse;
              });
              return cachedResponse || networkFetch;
          });
      })
  );
});

self.addEventListener('activate', event => {
    const cacheWhitelist = [CACHE_NAME];
    event.waitUntil(
        caches.keys().then(keys =>
            Promise.all(
                keys.map(key => {
                    if (!cacheWhitelist.includes(key)) {
                        console.log('Xoá cache cũ:', key);
                        return caches.delete(key);
                    }
                })
            )
        )
    );
});

self.addEventListener('message', event => {
    if (event.data && event.data.action === 'offlineNotification') {
        self.registration.showNotification("Điểm danh Offline", {
            body: "Đừng quên trở lại ứng dụng khi có kết nối! Để gửi dữ liệu điểm danh.",
            icon: "/diemdanh/images/icon.png",
            tag: "offline-notification"
        });
    } else {  // Nếu điều kiện không thỏa mãn
        console.log("Thông báo offline đã được hiển thị rồi.");
    }
});

self.addEventListener('notificationclick', function (event) {
    event.notification.close();
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true })
            .then(function (clientList) {
                // Kiểm tra nếu đã có cửa sổ của PWA đang mở
                for (var i = 0; i < clientList.length; i++) {
                    var client = clientList[i];
                    // Nếu cửa sổ đã mở và URL trùng, focus nó (điều này sẽ mở lại ứng dụng PWA)
                    if (client.url === 'https://tnttgxbacminh.github.io/diemdanh/' && 'focus' in client) {
                        return client.focus();
                    }
                }
                // Nếu không có cửa sổ nào mở, mở một cửa sổ mới với URL của PWA
                if (clients.openWindow) {
                    return clients.openWindow('https://tnttgxbacminh.github.io/diemdanh/');
                }
            })
    );
});
