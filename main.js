document.addEventListener("DOMContentLoaded", function () {
    if (localStorage.getItem("loginTimestamp")) {
        // Người dùng đã đăng nhập, ẩn form đăng nhập và hiển thị giao diện chính
        document.getElementById("login-container").style.display = "none";
        document.querySelector(".mode-toggle").style.display = "flex";
        document.getElementById("function-container").style.display = "flex";
        document.body.classList.add('app-active');
    } else {
        // Người dùng chưa đăng nhập, hiển thị form đăng nhập
        document.getElementById("login-container").style.display = "block";
        document.body.classList.remove('app-active');
    }

    // Khai báo hàng đợi thông báo và biến kiểm tra trạng thái modal
    const notificationQueue = [];
    let isModalActive = false;

    // Hàm toàn cục showModal chỉ thêm thông báo vào hàng đợi
    window.showModal = function (message, type) {
        notificationQueue.push({ message, type });
        // Nếu không có modal nào đang hiển thị thì kích hoạt hiển thị thông báo tiếp theo
        if (!isModalActive) {
            processQueue();
        }
    };

    function processQueue() {
        // Nếu hàng đợi rỗng, kết thúc
        if (!notificationQueue.length) {
            isModalActive = false;
            return;
        }

        isModalActive = true;
        // Lấy thông báo đầu tiên từ hàng đợi
        const { message, type } = notificationQueue.shift();

        // Các phần tử modal trong HTML
        const modal = document.getElementById("modal");
        const modalMessage = document.getElementById("modal-message");
        const modalContent = modal.querySelector(".modal-content");

        // Cập nhật nội dung thông báo
        modalMessage.textContent = message;

        // Xóa mọi class kiểu cũ
        modalContent.classList.remove("success", "error", "normal", "status");

        // Thêm class dựa theo loại thông báo
        modalContent.classList.add(type);

        // Hiển thị modal
        modal.classList.add("show");

        // Định nghĩa thời gian hiển thị dựa vào loại thông báo
        let displayDuration;
        if (type === "status") {
            displayDuration = 3000;
        } else if (type === "error") {
            displayDuration = 2000;
        } else {
            displayDuration = 1500;
        }

        // Sau khi thông báo được hiển thị, ẩn và xử lý thông báo kế tiếp
        setTimeout(() => {
            modal.classList.remove("show");

            // Đợi một chút (ví dụ 500ms) trước khi hiển thị thông báo tiếp theo để tránh hiện tượng quá chồng
            setTimeout(() => {
                processQueue();
            }, 200);
        }, displayDuration);
    }

    // ---------------------
    // Login Handling
    // ---------------------
    document.getElementById("login-form").addEventListener("submit", function (e) {
        e.preventDefault();
        const account = document.getElementById("login-account").value.trim();
        const password = document.getElementById("login-password").value.trim();

        if (account === "" || password === "") {
            alert("Vui lòng nhập đầy đủ tài khoản và mật khẩu.");
            return;
        }

        // Lấy các thành phần spinner và nút đăng nhập
        const loginButton = document.getElementById("login-submit");
        const spinner = document.getElementById("login-spinner");

        // Khi bắt đầu đăng nhập, disable nút và hiển thị spinner
        loginButton.disabled = true;
        spinner.style.display = "inline-block";

        // Gửi thông tin đăng nhập tới server qua POST
        fetch(webAppUrl, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: "action=login&account=" + encodeURIComponent(account) + "&password=" + encodeURIComponent(password)
        })
            .then(response => response.json())
            .then(data => {
                if (data.status === "success") {
                    // Nếu đăng nhập thành công, hiển thị thông báo và chuyển giao diện
                    localStorage.setItem("loginTimestamp", new Date().getTime());
                    document.getElementById("login-container").style.display = "none";
                    document.querySelector(".mode-toggle").style.display = "flex";
                    document.getElementById("function-container").style.display = "flex";
                    document.body.classList.add('app-active');
                } else {
                    // Nếu đăng nhập thất bại, hiển thị lỗi
                    showModal(data.message || "Sai tài khoản hoặc mật khẩu", "error");
                    document.body.classList.remove('app-active');
                }
            })
            .catch(err => {
                console.error("Lỗi kết nối đến server", err);
                showModal("Lỗi kết nối server!", "error");
            })
            .finally(() => {
                // Ẩn spinner và bật lại nút đăng nhập
                spinner.style.display = "none";
                loginButton.disabled = false;
            });
    });

    // Các biến và khởi tạo
    const webAppUrl =
        "https://script.google.com/macros/s/AKfycbxyZkkL3uRTcLVUbcxytOKiKfWOAow_hKuwHCW6FcHVSAXTv38ZnYfnW4sCXscdJ2oN/exec";
    let currentAttendanceType = "di-le"; // Mặc định
    let currentMode = "qr"; // Có thể là "qr", "search", "report"
    const searchCache = new Map();
    let searchData = [];
    let currentPage = 1;
    let reportData = [];
    let currentReportPage = 1;
    let selectedStudents = {};



    // ========== Offline Helper Functions ==========
    function openAttendanceDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open("attendanceDB", 1);
            request.onerror = (event) =>
                reject("Lỗi mở IndexedDB: " + event.target.errorCode);
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains("offlineAttendance")) {
                    db.createObjectStore("offlineAttendance", { keyPath: "timestamp" });
                }
                if (!db.objectStoreNames.contains("students")) {
                    let store = db.createObjectStore("students", { keyPath: "id" });
                    // Tạo index cho trường rowOrder để dùng khi sắp xếp trực tiếp qua IndexedDB nếu cần
                    store.createIndex("orderIndex", "rowOrder", { unique: false });
                }
            };
            request.onsuccess = () => resolve(request.result);
        });
    }
    // Biến cờ cục bộ để kiểm tra xem đã gửi thông báo offline hay chưa (cho phiên này)
    let hasNotifiedOffline = false;

    function saveAttendanceRecord(record) {
        openAttendanceDB().then(db => {
            const transaction = db.transaction("offlineAttendance", "readwrite");
            const store = transaction.objectStore("offlineAttendance");
            const req = store.add(record);
            req.onsuccess = () => {
                console.log("Đã lưu điểm danh Offline:", record);
                // Chỉ hiển thị modal nếu chưa được hiển thị trong phiên này
                if (!hasNotifiedOffline) {
                    showModal("Có bản Ghi Offline - Vào lại khi có mạng!\nĐể đồng bộ dữ liệu", "status");
                    sendOfflineNotification();
                    hasNotifiedOffline = true;
                }
            };
            req.onerror = (err) => {
                console.error("Lỗi lưu điểm danh offline:", err);
                showModal("Lỗi lưu điểm danh Offline", "error");
            };
        }).catch(err => console.error(err));
    }

    function syncCombinedAttendanceRecords() {
        openAttendanceDB().then(db => {
            const transaction = db.transaction("offlineAttendance", "readonly");
            const store = transaction.objectStore("offlineAttendance");
            const req = store.getAll();

            req.onsuccess = () => {
                const records = req.result;
                if (records.length === 0) {
                    console.log("Không có bản ghi offline cần đồng bộ");
                    return;
                }
                // Gộp các bản ghi single và batch thành 1 mảng chung
                let combinedRecords = [];
                records.forEach(record => {
                    if (record.recordType === "single") {
                        combinedRecords.push({
                            id: record.id,
                            type: record.type,
                            holy: record.holy,
                            name: record.name
                        });
                    } else if (record.recordType === "batch") {
                        combinedRecords = combinedRecords.concat(record.records);
                    }
                });
                if (combinedRecords.length === 0) {
                    console.log("Không có bản ghi nào để gửi.");
                    return;
                }

                // Gửi payload chung dạng JSON đến server
                fetch(webAppUrl, {
                    method: "POST",
                    mode: "no-cors",  // vẫn dùng no-cors
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ records: combinedRecords })
                })
                    .then(() => {
                        // Với no-cors, nếu promise được resolve, ta coi request đã được gửi thành công
                        console.log("Gửi thành công tất cả bản ghi offline");
                        showModal("Gửi thành công tất cả bản ghi Offline", "status");
                        clearOfflineAttendanceStore();
                    })
                    .catch(err => {
                        console.error("Lỗi khi đồng bộ các bản ghi offline:", err);
                        showModal("Lỗi khi đồng bộ các bản ghi offline", "error");
                    });
            };

            req.onerror = () => {
                console.error("Lỗi truy xuất bản ghi offline từ IndexedDB");
                showModal("Lỗi truy xuất bản ghi Offline từ IndexedDB", "error");
            };
        }).catch(err => console.error(err));
    }

    function clearOfflineAttendanceStore() {
        openAttendanceDB().then(db => {
            const transaction = db.transaction("offlineAttendance", "readwrite");
            const store = transaction.objectStore("offlineAttendance");
            const req = store.clear();
            req.onsuccess = () =>
                console.log("Đã xoá toàn bộ bản ghi offline từ IndexedDB.");
                //showModal("Đã xoá toàn bộ bản ghi Offline", "normal");
            req.onerror = (err) =>
                console.error("Lỗi xoá bản ghi offline:", err);
        });
    }

    function loadDataSheetToIndexedDB() {
        const fetchUrl = webAppUrl + "?action=fetchDataSheet";
        fetch(fetchUrl)
            .then(response => response.json())
            .then(data => {
                if (data.error) {
                    console.error("Lỗi từ server:", data.error);
                    return;
                }
                // Giả sử data là mảng các đối tượng học sinh có trường rowOrder được thêm từ server
                openAttendanceDB().then(db => {
                    const transaction = db.transaction("students", "readwrite");
                    const store = transaction.objectStore("students");

                    // Xoá tất cả dữ liệu cũ trong store
                    const clearRequest = store.clear();
                    clearRequest.onsuccess = function () {
                        console.log("Đã xoá dữ liệu cũ trong IndexedDB.");
                        // Sau khi xoá dữ liệu cũ, chèn dữ liệu mới vào IndexedDB
                        data.forEach(student => {
                            store.put(student);
                        });
                        console.log("Đã tải dữ liệu data sheet mới vào IndexedDB.");
                        // Bạn có thể gọi showModal nếu cần để thông báo tải xong dữ liệu
                        // showModal("Đã tải xong dữ liệu", "success");
                    };
                    clearRequest.onerror = function (event) {
                        console.error("Lỗi khi xoá dữ liệu cũ:", event.target.errorCode);
                    };
                }).catch(err => console.error("Lỗi mở DB:", err));
            })
            .catch(error => console.error("Lỗi fetch data sheet:", error));
    }


    async function runOnlineTasks() {
        try {
            await loadDataSheetToIndexedDB();
            await syncCombinedAttendanceRecords();
            console.log("Cả hai hàm đã chạy tuần tự khi có mạng.");
        } catch (error) {
            console.error("Có lỗi khi chạy các hàm online:", error);
        }
    }

    // Kiểm tra trạng thái mạng ngay khi trang load
    if (navigator.onLine) {
        runOnlineTasks();
    } else {
        // Nếu không có mạng ngay từ đầu, hiển thị thông báo offline.
        showModal("Bạn đang Offline", "status");
    }

    window.addEventListener("online", () => {
        showModal("Đã kết nối mạng!", "success");
        syncCombinedAttendanceRecords();
    })

    // Lắng nghe sự kiện 'offline': thông báo khi mất kết nối
    window.addEventListener("offline", () => {
        showModal("Bạn đang Offline", "status");
        // (Tùy chọn) Gọi hàm gửi notification
    });



    function normalizeText(text) {
        if (!text) return "";
        return text.toString()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .trim()
            .toLowerCase();
    }

    function offlineSearch(query) {
        return new Promise((resolve, reject) => {
            openAttendanceDB().then(db => {
                const transaction = db.transaction("students", "readonly");
                const store = transaction.objectStore("students");
                // Lấy tất cả dữ liệu từ object store
                const req = store.getAll();
                req.onsuccess = () => {
                    console.log("offlineSearch: Đã lấy dữ liệu từ IndexedDB.");
                    const students = req.result;

                    const normalizedQuery = normalizeText(query);
                    // Lọc các học sinh phù hợp với truy vấn
                    let results = students.filter(student => {
                        return normalizeText(student.id).includes(normalizedQuery) ||
                            normalizeText(student.fullName).includes(normalizedQuery) ||
                            normalizeText(student.holyName).includes(normalizedQuery) ||
                            normalizeText(student.birthDate).includes(normalizedQuery);
                    });

                    // Sắp xếp các kết quả theo thứ tự của trường rowOrder
                    results.sort((a, b) => a.rowOrder - b.rowOrder);

                    resolve(results);
                };

                req.onerror = () => {
                    reject("Lỗi truy xuất dữ liệu offline từ IndexedDB.");
                };
            }).catch(err => reject(err));
        });
    }

    // ---------------------
    // XỬ LÝ DROPDOWN TRẠNG THÁI
    // ---------------------
    function showStatusDropdown(anchorElement) {
        const dropdown = document.getElementById("status-dropdown");
        dropdown.style.display = "block";
        const rect = anchorElement.getBoundingClientRect();
        dropdown.style.top = rect.bottom + window.scrollY + "px";
        dropdown.style.left = rect.left + window.scrollX + "px";
        setTimeout(() => {
            dropdown.classList.add("show");
        }, 10);
    }
    function hideStatusDropdown() {
        const dropdown = document.getElementById("status-dropdown");
        dropdown.classList.remove("show");
        setTimeout(() => {
            dropdown.style.display = "none";
        }, 300);
    }
    function onStatusSelected(type) {
        currentAttendanceType = type;
        document
            .querySelectorAll("#status-dropdown .status-box")
            .forEach((el) => el.classList.remove("active"));
        document.getElementById("status-" + type).classList.add("active");
        hideStatusDropdown();
        if (currentMode === "qr") {
            showQRInterface();
        } else if (currentMode === "search") {
            showSearchInterface();
        }
    }
    document
        .getElementById("status-di-le")
        .addEventListener("click", () => onStatusSelected("di-le"));
    document
        .getElementById("status-di-hoc")
        .addEventListener("click", () => onStatusSelected("di-hoc"));
    document
        .getElementById("status-khac")
        .addEventListener("click", () => onStatusSelected("khac"));


    // ---------------------
    // XỬ LÝ QR SCANNER
    // ---------------------
    let cameraId = null;
    let isScanning = false;
    const html5QrCode = new Html5Qrcode("qr-scanner");
    const qrConfig = {
        fps: 10,
    };
    const scannedCodes = new Set();
    function onScanSuccess(decodedText) {
        if (!scannedCodes.has(decodedText)) {
            scannedCodes.add(decodedText);
            // Giả sử dữ liệu có định dạng "ID fullName", tách ID và fullName:
            const parts = decodedText.split(" ");
            const studentId = parts[0];
            // Nối lại phần còn lại để nhận về fullName (trường hợp tên có nhiều từ)
            const studentName = parts.slice(1).join(" ");

            // Gọi hàm submitAttendance với studentId và studentName (studentHoly có thể giữ nguyên chuỗi rỗng nếu không dùng)
            submitAttendance(studentId, "", studentName);

            setTimeout(() => scannedCodes.delete(decodedText), 2000);
        }
    }
    function onScanFailure(error) {
        //console.warn("Lỗi quét QR:", error);
    }
    function fadeIn(element) {
        element.style.opacity = 0;
        element.style.transition = "opacity 0.5s ease";
        setTimeout(() => {
            element.style.opacity = 1;
        }, 10);
    }
    function fadeOut(element, callback) {
        element.style.transition = "opacity 0.5s ease";
        element.style.opacity = 0;
        setTimeout(() => {
            element.style.display = "none";
            if (callback) callback();
        }, 500);
    }
    function startCamera(loadingElem) {
        Html5Qrcode.getCameras()
            .then((cameras) => {
                cameras.forEach((camera) => console.log(camera.label));
                if (cameras && cameras.length) {
                    let rearCamera = cameras.find((camera) => {
                        const label = camera.label.toLowerCase();
                        return label.includes("back") ||
                            label.includes("rear") ||
                            label.includes("environment") ||
                            label.includes("sau") ||
                            label.includes("camera sau") ||
                            label.includes("camera chính");
                    });
                    cameraId = rearCamera ? rearCamera.id : cameras[0].id;

                    html5QrCode
                        .start(cameraId, qrConfig, onScanSuccess, onScanFailure)
                        .then(() => {
                            isScanning = true;
                            if (loadingElem) loadingElem.style.display = "none";
                            console.log("Camera bắt đầu quét mã QR.");
                        })
                        .catch((err) => {
                            console.error("Lỗi khi khởi động camera:", err);
                            showModal("Không truy cập được camera!", "error");
                        });
                } else {
                    if (loadingElem) {
                        loadingElem.style.display = "flex";
                        loadingElem.textContent = "Không tìm thấy camera!";
                    }
                    showModal("Không tìm thấy camera!", "error");
                }
            })
            .catch((err) => {
                console.error("Lỗi lấy camera:", err);
                showModal("Không truy cập được camera!", "error");
            });
    }
    function showQRInterface() {
        searchContainer.style.display = "none";
        reportContainer.style.display = "none";
        qrContainer.style.display = "block";
        qrContainer.classList.add("fullscreen");
        const loadingElem = document.querySelector("#qr-scanner .loading");
        if (loadingElem) {
            loadingElem.style.display = "flex";
            loadingElem.textContent = "Không truy cập được, vui lòng kiểm tra camera!";
        }
        if (isScanning) {
            html5QrCode
                .stop()
                .then(() => {
                    isScanning = false;
                    setTimeout(() => {
                        startCamera(loadingElem);
                    }, 500);
                })
                .catch((error) => {
                    console.error("Lỗi khi dừng camera:", error);
                });
        } else {
            setTimeout(() => {
                startCamera(loadingElem);
            }, 500);
        }
    }
    function showSearchInterface() {
        qrContainer.style.display = "none";
        reportContainer.style.display = "none";
        searchContainer.style.display = "block";
        fadeIn(searchContainer);
        if (isScanning) {
            html5QrCode
                .stop()
                .then(() => {
                    isScanning = false;
                    console.log("Camera đã được tắt.");
                })
                .catch((error) => {
                    console.error("Lỗi khi tắt camera:", error);
                });
        }
    }

    // ---------------------
    // HÀM GỬI ĐIỂM DANH QRCODE (legacy)
    // ---------------------
    function submitAttendance(studentId, studentHoly = "", studentName = "") {
        let attendanceDescription = "";
        if (currentAttendanceType === "di-le") {
            attendanceDescription = " đi lễ ";
        } else if (currentAttendanceType === "di-hoc") {
            attendanceDescription = " đi học ";
        } else if (currentAttendanceType === "khac") {
            attendanceDescription = " khác ";
        }

        if (studentName.trim() !== "") {
            successMsg = studentName + attendanceDescription;
        }

        if (!navigator.onLine) {
            // Nếu offline: lưu bản ghi vào IndexedDB
            const record = {
                id: studentId,
                type: currentAttendanceType,
                holy: studentHoly,
                name: studentName,
                recordType: "single",
                timestamp: Date.now()
            };
            showModal(studentName + " " + attendanceDescription, "normal");
            saveAttendanceRecord(record);
            return;
        }

        // Nếu online: gửi trực tiếp đến server (giống như code cũ)
        let body =
            "id=" + encodeURIComponent(studentId) +
            "&type=" + encodeURIComponent(currentAttendanceType) +
            "&holy=" + encodeURIComponent(studentHoly) +
            "&name=" + encodeURIComponent(studentName);

        fetch(webAppUrl, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: body
        })
            .then(response => {
                if (!response.ok) throw new Error("HTTP error: " + response.status);
                return response.text();
            })
            .catch(error => {
                console.error("Lỗi gửi trực tuyến:", error);
                // Nếu gửi lỗi, lưu bản ghi offline
                const record = {
                    id: studentId,
                    type: currentAttendanceType,
                    holy: studentHoly,
                    name: studentName,
                    recordType: "single",
                    timestamp: Date.now()
                };
                saveAttendanceRecord(record);
                showModal("Có lỗi khi gửi dữ liệu! Đã lưu Offline.", "error");
            });
        // Hiển thị thông báo thành công ngay lập tức sau khi gọi fetch
        showModal(successMsg, "success");
    }
    // ---------------------
    // EVENT LISTENERS CHUYỂN ĐỔI GIAO DIỆN
    // ---------------------
    const btnQR = document.getElementById("toggle-qr");
    const btnSearch = document.getElementById("toggle-search");
    const btnReport = document.getElementById("toggle-report");
    const qrContainer = document.getElementById("qr-container");
    const searchContainer = document.getElementById("search-container");
    const reportContainer = document.getElementById("report-container");

    btnQR.addEventListener("click", () => {
        currentMode = "qr";
        btnQR.classList.add("active");
        btnSearch.classList.remove("active");
        btnReport.classList.remove("active");
        document.getElementById("search-query").value = "";
        document.getElementById("search-results").innerHTML = "";
        document.getElementById("report-query").value = "";
        document.getElementById("report-results").innerHTML = "";
        document
            .querySelectorAll("#status-dropdown .status-box")
            .forEach((el) => el.classList.remove("active"));
        showStatusDropdown(btnQR);
        qrContainer.style.display = "none";
        searchContainer.style.display = "none";
        reportContainer.style.display = "none";
    });
    btnSearch.addEventListener("click", () => {
        currentMode = "search";
        btnSearch.classList.add("active");
        btnQR.classList.remove("active");
        btnReport.classList.remove("active");
        document.getElementById("report-query").value = "";
        document.getElementById("report-results").innerHTML = "";
        document.getElementById("search-query").value = "";
        document.getElementById("search-results").innerHTML = "";
        document
            .querySelectorAll("#status-dropdown .status-box")
            .forEach((el) => el.classList.remove("active"));
        showStatusDropdown(btnSearch);
        if (isScanning) {
            html5QrCode
                .stop()
                .then(() => {
                    isScanning = false;
                    console.log("Camera đã được tắt khi chuyển sang chế độ Tìm kiếm.");
                })
                .catch((error) => {
                    console.error("Lỗi khi dừng camera:", error);
                    showModal("Lỗi khi tắt camera!", "error");
                });
        }
        qrContainer.style.display = "none";
        searchContainer.style.display = "none";
        reportContainer.style.display = "none";
        fadeIn(searchContainer);
    });
    btnReport.addEventListener("click", () => {
        currentMode = "report";
        btnReport.classList.add("active");
        btnQR.classList.remove("active");
        btnSearch.classList.remove("active");
        hideStatusDropdown();
        document.getElementById("search-query").value = "";
        document.getElementById("search-results").innerHTML = "";
        qrContainer.style.display = "none";
        searchContainer.style.display = "none";
        reportContainer.style.display = "block";
        fadeIn(reportContainer);
        if (isScanning) {
            html5QrCode
                .stop()
                .then(() => {
                    isScanning = false;
                    console.log("Camera đã được tắt.");
                })
                .catch((error) => {
                    console.error("Lỗi khi tắt camera:", error);
                });
        }
    });

    const fixedRowsPerPage = calculateRowsPerPage();
    function calculateRowsPerPage() {
        // Đặt một breakpoint để phân biệt màn hình lớn và nhỏ,
        // ví dụ: nếu window.innerWidth >= 768px thì xem như màn hình to, còn nhỏ hơn xem như màn hình nhỏ.
        let headerHeight, footerHeight, additionalSpacing, rowHeight;

        if (window.innerWidth >= 768) {
            // Cài đặt cho màn hình lớn
            headerHeight = 400;      // ví dụ: 400px cho header
            footerHeight = 40;       // ví dụ: 40px cho vùng điều khiển dưới cùng
            additionalSpacing = 10;  // khoảng đệm thêm
            rowHeight = 35;          // chiều cao mỗi hàng là 35px
        } else {
            // Cài đặt cho màn hình nhỏ
            headerHeight = 380;      // giảm chiều cao header cho điện thoại (ví dụ: 300px)
            footerHeight = 30;       // giảm chiều cao footer (ví dụ: 30px)
            additionalSpacing = 10;   // giảm khoảng đệm
            rowHeight = 30;          // giảm chiều cao mỗi hàng (ví dụ: 30px)
        }

        // Tính không gian sẵn có cho bảng dựa vào chiều cao cửa sổ sau khi loại trừ header, footer và khoảng đệm
        const availableHeight = window.innerHeight - headerHeight - footerHeight - additionalSpacing;

        // Tính số hàng tối đa có thể hiển thị

        return Math.floor(availableHeight / rowHeight);
    }

    window.addEventListener("resize", () => {
        // Cập nhật lại bảng tìm kiếm và báo cáo khi kích thước thay đổi
        renderTablePage();
        // Nếu bạn có hàm render cho báo cáo, cũng gọi renderReportTable();
    });

    // ---------------------
    // EVENT LISTENER TÌM KIẾM (SEARCH)
    // ---------------------
    document.getElementById("search-button").addEventListener("click", function () {
        searchCache.clear();
        const query = document.getElementById("search-query").value.trim();
        if (!query) {
            alert("Vui lòng nhập tên, ID hoặc lớp!");
            return;
        }
        const resultsDiv = document.getElementById("search-results");

        // Hiển thị loading
        resultsDiv.innerHTML = `
      <div style="text-align:center;">
        <div class="spinner"></div>
        <p style="margin-top: 10px;font-size: 0.9rem;">Đang tìm kiếm thiếu nhi...</p>
      </div>`;

        // Hàm xử lý kết quả (chung cho online và offline)
        const processResults = (data) => {
            if (!Array.isArray(data) || data.length === 0) {
                resultsDiv.innerHTML = `<p class="student-mesage">Không tìm thấy, vui lòng kiểm tra lại!</p>`;
                return;
            }
            searchCache.set(query, data);
            searchData = data;
            currentPage = 1;
            selectedStudents = {};
            renderTablePage();
        };

        // Nếu online thì ưu tiên gọi online search, còn nếu có lỗi hay không có kết quả thì fallback vào offline search.
        if (navigator.onLine) {
            fetch(webAppUrl + "?action=search&q=" + encodeURIComponent(query))
                .then((response) => {
                    // Xử lý phản hồi có thể là JSON (có cả trường hợp response.text() rồi parse lại)
                    const contentType = response.headers.get("content-type");
                    if (contentType && contentType.indexOf("application/json") !== -1) {
                        return response.json();
                    } else {
                        return response.text().then((text) => {
                            try {
                                return JSON.parse(text);
                            } catch (e) {
                                throw new Error("Không đúng định dạng JSON: " + text);
                            }
                        });
                    }
                })
                .then((data) => {
                    if (data.error) {
                        // Nếu có lỗi từ server, chuyển sang offline
                        return offlineSearch(query);
                    }
                    // Nếu không có dữ liệu online (ví dụ mảng rỗng), cũng dùng offline làm dự phòng
                    if (!Array.isArray(data) || data.length === 0) {
                        return offlineSearch(query);
                    }
                    return data;
                })
                .then((data) => {
                    processResults(data);
                })
                .catch((error) => {
                    console.error("Lỗi khi tìm kiếm online:", error);
                    // Nếu có lỗi, fallback sang offline search
                    offlineSearch(query)
                        .then((data) => {
                            processResults(data);
                        })
                        .catch((err) => {
                            console.error("Lỗi khi tìm kiếm offline:", err);
                            resultsDiv.innerHTML = `<p style="color: var(--error-color);">Có lỗi khi tìm kiếm dữ liệu!</p>`;
                        });
                });
        } else {
            // Nếu không có mạng, sử dụng offline search
            offlineSearch(query)
                .then((data) => {
                    processResults(data);
                })
                .catch((err) => {
                    console.error("Lỗi khi tìm kiếm offline:", err);
                    resultsDiv.innerHTML = `<p style="color: var(--error-color);">Có lỗi khi tìm kiếm dữ liệu!</p>`;
                });
        }
    });

    // ---------------------
    // HIỂN THỊ TABLE VÀ GỬI DỮ LIỆU BATCH
    // ---------------------
    function renderTablePage() {
        const resultsDiv = document.getElementById("search-results");

        // Nếu không có dữ liệu, ẩn bảng (chỉ reset nội dung của div)
        if (!searchData || searchData.length === 0) {
            resultsDiv.innerHTML = "";
            return;
        }

        const dynamicPageSize = fixedRowsPerPage; 
        const start = (currentPage - 1) * dynamicPageSize;
        const end = start + dynamicPageSize;
        const pageData = searchData.slice(start, end);
        let tableHtml = `
      <table>
        <colgroup>
            <col>
            <col>
            <col>
            <col>
            <col>
        </colgroup>
        <thead>
          <tr>
            <th>ID</th>
            <th class="col-21">Tên Thánh</th>
            <th class="col-45">Họ và Tên</th>
            <th class="col-27">Lớp</th>
            <th class="col-14">Chọn</th>
          </tr>
        </thead>
        <tbody>`;
        pageData.forEach((item) => {
            tableHtml += `
        <tr>
          <td>${item.id}</td>
          <td>${item.holyName}</td>
          <td style="text-align: left;">${item.fullName}</td>
          <td>${item.birthDate}</td>
          <td>
            <input type="checkbox" class="attendance-checkbox" data-id="${item.id}" data-holy="${item.holyName}" data-name="${item.fullName}" ${selectedStudents[item.id] ? "checked" : ""}>
          </td>
        </tr>`;
        });
        tableHtml += `</tbody></table>`;
        const totalPages = Math.ceil(searchData.length / dynamicPageSize);
        tableHtml += `<div id="pagination" style="text-align:right; margin-top:20px;">`;
        if (currentPage > 1) {
            tableHtml += `<button class="pagination-btn" data-page="${currentPage - 1}">Prev</button>`;
        }
        tableHtml += `<span class="pagination-info"> Page ${currentPage} / ${totalPages} </span>`;
        if (currentPage < totalPages) {
            tableHtml += `<button class="pagination-btn" data-page="${currentPage + 1}">Next</button>`;
        }
        tableHtml += `</div>`;
        tableHtml += `<div style="margin-top:-40px; text-align:center;">
                    <button id="confirm-attendance" class="confirm-attendance-btn">Xác nhận</button>
                  </div>`;
        resultsDiv.innerHTML = tableHtml;
        document.querySelectorAll(".attendance-checkbox").forEach((checkbox) => {
            checkbox.addEventListener("change", function () {
                const studentId = this.getAttribute("data-id");
                if (this.checked) {
                    selectedStudents[studentId] = {
                        id: studentId,
                        holyName: this.getAttribute("data-holy"),
                        fullName: this.getAttribute("data-name"),
                    };
                } else {
                    delete selectedStudents[studentId];
                }
            });
        });
        document.querySelectorAll(".pagination-btn").forEach((btn) => {
            btn.addEventListener("click", function () {
                currentPage = parseInt(this.getAttribute("data-page"));
                renderTablePage();
            });
        });
        // ---------------------
        // SỰ KIỆN GỬI DỮ LIỆU BATCH
        // ---------------------
        const confirmAttendanceBtn = document.getElementById("confirm-attendance");
        if (confirmAttendanceBtn) {
            confirmAttendanceBtn.addEventListener("click", async function () {
                let attendanceDescription = "";
                if (currentAttendanceType === "di-le") {
                    attendanceDescription = " đi lễ ";
                } else if (currentAttendanceType === "di-hoc") {
                    attendanceDescription = " đi học ";
                } else if (currentAttendanceType === "khac") {
                    attendanceDescription = " khác ";
                }

                const interactiveElements = document.querySelectorAll("button, input");
                interactiveElements.forEach(el => el.disabled = true);
                const confirmBtn = this;
                const originalText = confirmBtn.innerHTML;
                confirmBtn.innerHTML = `<span class="spinner spinner-small" style="margin-right: 6px;"></span>Đang gửi...`;

                const selectedIds = Object.keys(selectedStudents);
                if (selectedIds.length === 0) {
                    alert("Chưa chọn thiếu nhi nào để điểm danh.");
                    interactiveElements.forEach(el => el.disabled = false);
                    confirmBtn.innerHTML = originalText;
                    return;
                }

                if (!confirm("Xác nhận điểm danh" + attendanceDescription + selectedIds.length + " thiếu nhi đã chọn?")) {
                    interactiveElements.forEach(el => el.disabled = false);
                    confirmBtn.innerHTML = originalText;
                    return;
                }

                // Tạo mảng các bản ghi điểm danh
                const records = selectedIds.map(studentId => {
                    const stu = selectedStudents[studentId];
                    return {
                        id: studentId,
                        type: currentAttendanceType,  // ví dụ "di-le", "di-hoc", "khac"
                        holy: stu.holyName || "",
                        name: stu.fullName || ""
                    };
                });

                // Nếu có kết nối mạng: gửi batch dữ liệu online, nếu không, lưu offline từng record.
                try {
                    if (navigator.onLine) {
                        // Nếu online: gửi dữ liệu qua fetch (với mode no-cors để tránh preflight)
                        await fetch(webAppUrl, {
                            method: "POST",
                            mode: "no-cors",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ records: records })
                        });
                        showModal("Điểm danh" + attendanceDescription + selectedIds.length + " thiếu nhi thành công", "success");
                    } else {
                        const batchRecord = {
                            timestamp: Date.now(), // Thêm thuộc tính bắt buộc theo keyPath
                            recordType: "batch",   // Đánh dấu đây là bản ghi dạng batch
                            records: records       // Đây là mảng các bản ghi đã tạo
                        };
                        showModal("Đã lưu điểm danh" + attendanceDescription + selectedIds.length + " thiếu nhi Offline", "normal");
                        saveAttendanceRecord(batchRecord);

                    }

                    // Reset giao diện
                    document.getElementById("search-query").value = "";
                    document.getElementById("search-results").innerHTML = "";
                    selectedStudents = {};
                    searchData = [];
                    searchCache.clear();
                } catch (error) {
                    console.error("Lỗi khi xử lý dữ liệu điểm danh:", error);
                    showModal("Có lỗi khi gửi dữ liệu!", "error");
                } finally {
                    interactiveElements.forEach(el => el.disabled = false);
                    confirmBtn.innerHTML = originalText;
                }
            });

        }
    }
    // ---------------------
    // EVENT LISTENER CHO PHẦN REPORT
    // ---------------------
    document.getElementById("report-button").addEventListener("click", async function () {
        const query = document.getElementById("report-query").value.trim();
        if (!query) {
            alert("Vui lòng nhập từ khóa để tìm kiếm!");
            return;
        }
        const resultsDiv = document.getElementById("report-results");
        resultsDiv.innerHTML = `
        <div style="text-align:center;">
          <div class="spinner"></div>
          <p style="margin-top: 10px; font-size: 0.9rem;">Đang tìm kiếm kết quả...</p>
        </div>`;

        try {
            let data = null;

            // Nếu có mạng, thử gọi API tìm kiếm báo cáo online
            if (navigator.onLine) {
                data = await fetch(
                    webAppUrl +
                    "?action=search&q=" +
                    encodeURIComponent(query) +
                    "&mode=report&t=" +
                    new Date().getTime(),
                    {
                        cache: "no-store",
                    }
                ).then(response => {
                    if (!response.ok) {
                        throw new Error("Network response was not ok");
                    }
                    return response.json();
                });
            }

            // Nếu không có mạng hoặc fetch trả về lỗi (data null), chuyển sang offline search
            if (!navigator.onLine || !data) {
                console.log("Đang chuyển sang tìm kiếm offline do fetch thất bại hoặc không có mạng...");
                data = await offlineSearch(query);
            }

            if (data.error) {
                resultsDiv.innerHTML = `<p style="color: var(--error-color);">${data.error}</p>`;
                return;
            }
            if (!Array.isArray(data) || data.length === 0) {
                resultsDiv.innerHTML = `<p class="student-mesage">Không tìm thấy, vui lòng kiểm tra lại.</p>`;
                return;
            }

            // Nếu có dữ liệu trả về, hiển thị bảng kết quả báo cáo
            reportData = data;
            currentReportPage = 1;
            renderReportTable();
        } catch (error) {
            console.error("Lỗi tìm kiếm:", error);

            // Trong trường hợp fetch bị lỗi, chuyển sang tìm kiếm offline
            offlineSearch(query).then((data) => {
                if (!data.length) {
                    resultsDiv.innerHTML = `<p class="student-mesage">Không tìm thấy, vui lòng kiểm tra lại.</p>`;
                } else {
                    reportData = data;
                    currentReportPage = 1;
                    renderReportTable();
                }
            }).catch((err) => {
                console.error("Lỗi khi tìm kiếm offline:", err);
                resultsDiv.innerHTML = `<p style="color: var(--error-color);">Có lỗi khi tìm kiếm dữ liệu offline.</p>`;
            });
        }
    });

    function renderReportTable() {
        const resultsDiv = document.getElementById("report-results");
        const dynamicPageSize = fixedRowsPerPage; 
        const start = (currentReportPage - 1) * dynamicPageSize;
        const end = start + dynamicPageSize;
        const pageData = reportData.slice(start, end);
        let tableHtml = `
      <table>
        <colgroup>
            <col>
            <col>
            <col>
            <col>
            <col>
            <col>
            <col>
        </colgroup>
        <thead>
        <tr>
            <th>ID</th>
            <th class="col-20">Tên Thánh</th>
            <th class="col-44">Họ và Tên</th>
            <th>Lớp</th>
            <th class="col-12">Đi lễ</th>
            <th class="col-12">Đi học</th>
            <th class="col-12">Khác</th>
        </tr>
        </thead>
        <tbody>`;
        pageData.forEach((item) => {
            tableHtml += `
        <tr>
          <td>${item.id}</td>
          <td>${item.holyName}</td>
          <td style="text-align: left;">${item.fullName}</td>
          <td>${item.birthDate}</td>
          <td>${item.percentDiLe || ""}</td>
          <td>${item.percentDiHoc || ""}</td>
          <td>${item.percentKhac || ""}</td>
        </tr>`;
        });
        tableHtml += `</tbody></table>`;
        const totalPages = Math.ceil(reportData.length / dynamicPageSize);
        tableHtml += `<div id="report-pagination" style="text-align:right; margin-top:20px;">`;
        if (currentReportPage > 1) {
            tableHtml += `<button class="pagination-btn" data-page="${currentReportPage - 1}">Prev</button>`;
        }
        tableHtml += `<span class="pagination-info"> Page ${currentReportPage} / ${totalPages} </span>`;
        if (currentReportPage < totalPages) {
            tableHtml += `<button class="pagination-btn" data-page="${currentReportPage + 1}">Next</button>`;
        }
        tableHtml += `</div>`;
        tableHtml += `<div style="margin-top:-40px; text-align:center;">
                    <button id="print-report" class=" confirm-attendance-btn" style="padding: 5px 10px;"> In </button>
                  </div>`;
        resultsDiv.innerHTML = tableHtml;
        document.querySelectorAll("#report-pagination .pagination-btn").forEach((btn) => {
            btn.addEventListener("click", function () {
                currentReportPage = parseInt(this.getAttribute("data-page"));
                renderReportTable();
            });
        });
        document.getElementById("print-report").addEventListener("click", function () {
            printReport(reportData);
            setTimeout(() => {
                document.getElementById("report-query").value = "";
                document.getElementById("report-results").innerHTML = "";
                selectedStudents = {};
                searchData = [];
                searchCache.clear();
                console.log("Dữ liệu báo cáo đã được làm mới sau khi in");
            }, 1000);
        });
    }

    function printReport(data) {
        const uniqueClasses = Array.from(new Set(data.map((item) => item.birthDate)));
        const hasMultipleClasses = uniqueClasses.length > 1;
        const headerClassText =
            !hasMultipleClasses && data.length > 0 ? data[0].birthDate : "";
        const today = new Date();
        const formattedDate = today.toLocaleDateString("vi-VN");
        const printWindow = window.open("", "In Báo cáo", "width=800,height=600");
        let html = `
      <html>
        <head>
          <title>Báo cáo điểm danh${!hasMultipleClasses ? " - " + headerClassText : ""}</title>
          <style>
            body {
              font-family: Arial, sans-serif;
              margin: 20px;
              padding: 0;
            }
            .header {
              text-align: center;
              margin-bottom: 20px;
            }
            .header h1 {
              margin: 0;
              font-size: 28px;
            }
            .header p {
              margin: 5px 0 0;
              font-size: 24px;
            }

            table {
              width: 100%;
              border-collapse: collapse;
              margin-top: 20px;
              table-layout: fixed;
            }
            table, th, td {
              font-size: 13px; /* Điều chỉnh giá trị này theo ý bạn */
              border: 1px solid black;
              word-wrap: break-word;       /* Hoặc overflow-wrap: break-word; */
              white-space: normal;

            }
            th, td {
              padding: 6px;
              line-height: 1.2;
              text-align: center;
            }

            @page {
              size: auto;
              margin: 10mm; /* Bạn có thể tùy chỉnh margin theo nhu cầu */
            }

            @media print {
              body{
                margin-left: 10px;
              }
              thead { display: table-header-group; }
              tr { page-break-inside: avoid; }
            }
          </style>
        </head>
        <body>

            <div class="header">
                <h1>Báo cáo điểm danh${!hasMultipleClasses ? " - " + headerClassText : ""}</h1>
                <p>Ngày: ${formattedDate}</p>
            </div>  
            
          <div class="content">
            <table>
              <colgroup>
                <!-- Giả sử các cột đầu tiên A - E không cần thay đổi -->
                <col style="width: 5%;">
                <col style="width: 11%;">
                <col style="width: 12%;">
                <col style="width: 24%;">
                
                <!-- Các cột F đến M (tùy chỉnh số lượng và tỷ lệ phần trăm sao cho phù hợp) -->
                <col style="width: 5%;">
                <col style="width: 5%;">
                <col style="width: 5%;">
                <col style="width: 5%;">
                <col style="width: 5%;">
                <col style="width: 5%;">
                <col style="width: 6%;">
                <col style="width: 6%;">
                <col style="width: 6%;">
              </colgroup>
              <thead>
                <tr>
                  <th>STT</th>
                  <th>ID</th>
                  <th>Tên Thánh</th>
                  <th>Họ và Tên</th>`;
        /*if (hasMultipleClasses) {
          html += `<th>Lớp</th>`;
        }*/
        html += `   <th>Đi lễ</th>
                  <th>Vắng</th>
                  <th>Đi học</th>
                  <th>Vắng</th>
                  <th>Đi</th>
                  <th>Vắng</th>  
                  <th>Đi lễ</th>
                  <th>Đi học</th>
                  <th>Khác</th>
                </tr>
              </thead>
              <tbody>`;
        data.forEach((item, index) => {
            html += `<tr>
                <td>${index + 1}</td>
                <td>${item.id}</td>
                <td>${item.holyName}</td>
                <td style="text-align: left;">${item.fullName}</td>`;
            /*if (hasMultipleClasses) {
              html += `<td>${item.birthDate}</td>`;
            }*/
            html += `<td>${(item.colF !== null && item.colF !== undefined) ? item.colF : ""}</td>
              <td>${(item.colG !== null && item.colG !== undefined) ? item.colG : ""}</td>
              <td>${(item.colH !== null && item.colH !== undefined) ? item.colH : ""}</td>
              <td>${(item.colI !== null && item.colI !== undefined) ? item.colI : ""}</td>
              <td>${(item.colJ !== null && item.colJ !== undefined) ? item.colJ : ""}</td>
              <td>${(item.colK !== null && item.colK !== undefined) ? item.colK : ""}</td>
              <td>${item.percentDiLe || ""}</td>
              <td>${item.percentDiHoc || ""}</td>
              <td>${item.percentKhac || ""}</td>
              </tr>`;
        });
        html += `
              </tbody>
            </table>
          </div>
        </body>
      </html>`;
        printWindow.document.write(html);
        printWindow.document.close();
        printWindow.focus();
        // Gán sự kiện onafterprint để tự động đóng cửa sổ sau khi in
        printWindow.onafterprint = function () {
            printWindow.close();
        };
        setTimeout(() => {
            printWindow.print();
        }, 1000);
    }

    // Kiểm tra nếu trình duyệt hỗ trợ Notification và trạng thái hiện tại là "default"
    if ("Notification" in window && Notification.permission === "default") {
        // Định nghĩa hàm xử lý khi người dùng click vào bất kỳ điểm nào trên trang
        const handleUserClick = function () {
            // Gọi requestPermission() khi có hành động click (đảm bảo user gesture hợp lệ)
            Notification.requestPermission().then(function (permission) {
                console.log("Quyền thông báo:", permission);
            });
            // Sau khi đã gọi, xóa sự kiện này để không bị gọi lại nhiều lần
            document.removeEventListener("click", handleUserClick);
        };

        // Gán sự kiện click cho toàn bộ tài liệu
        document.addEventListener("click", handleUserClick);
    }

    // Hàm gửi thông điệp đến Service Worker để hiển thị thông báo offline
    function sendOfflineNotification() {
        if (navigator.serviceWorker && navigator.serviceWorker.controller) {
            navigator.serviceWorker.controller.postMessage({ action: 'offlineNotification' });
        }
    }
});

