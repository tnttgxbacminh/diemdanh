const CACHE_NAME = 'attendance-cache-v10';
const urlsToCache = [
    '/demo/',
    '/demo/index.html',
    '/demo/styles.css',
    '/demo/main.js',
    '/demo/manifest.json',
    '/demo/html5-qrcode.min.js',
    '/demo/images/logo.jpg',
    '/demo/images/icon.png'
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
    // Chỉ xử lý các request GET
    if (event.request.method !== 'GET') {
        event.respondWith(fetch(event.request));
        return;
    }

    event.respondWith(
        caches.open(CACHE_NAME).then(cache => {
            // Tìm phản hồi đã lưu trong cache (nếu có)
            return cache.match(event.request).then(cachedResponse => {
                // Đồng thời bắt đầu request từ mạng
                const networkFetch = fetch(event.request)
                    .then(networkResponse => {
                        // Nếu fetch thành công và response là hợp lệ, cập nhật cache
                        if (networkResponse && networkResponse.status === 200) {
                            cache.put(event.request, networkResponse.clone());
                        }
                        return networkResponse;
                    })
                    .catch(error => {
                        console.error("Lỗi fetch từ network:", error);
                        // Nếu network fetch thất bại, fallback về cachedResponse nếu có
                        return cachedResponse;
                    });
                
                // Trả về cachedResponse nếu có, hoặc chờ networkFetch nếu không có cachedResponse
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
        self.registration.showNotification("Có bản Ghi Offline", {
            body: "Vào lại khi có mạng! Để đồng bộ dữ liệu.",
            icon: "/demo/images/icon.png",
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
                    if (client.url === 'https://pi982.github.io/demo/' && 'focus' in client) {
                        return client.focus();
                    }
                }
                // Nếu không có cửa sổ nào mở, mở một cửa sổ mới với URL của PWA
                if (clients.openWindow) {
                    return clients.openWindow('https://pi982.github.io/demo/');
                }
            })
    );
});
