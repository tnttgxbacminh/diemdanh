document.addEventListener("DOMContentLoaded", function () {
    if (localStorage.getItem("loginTimestamp")) {
        // Người dùng đã đăng nhập, ẩn form đăng nhập và hiển thị giao diện chính
        document.getElementById("login-container").style.display = "none";
        document.querySelector(".mode-toggle").style.display = "flex";
        document.getElementById("function-container").style.display = "flex";
        document.body.classList.add('app-active');
        setTimeout(() => {
            btnReport.click();
            document.getElementById("info-btn").click();

        }, 1);

    } else {
        // Người dùng chưa đăng nhập, hiển thị form đăng nhập
        document.getElementById("login-container").style.display = "block";
        document.body.classList.remove('app-active');
    }

    // Khai báo hàng đợi thông báo và biến kiểm tra trạng thái modal
    const notificationQueue = [];
    let isModalActive = false;

    // Mở rộng hàm showModal để nhận thêm tham số persistent (mặc định là false)
    window.showModal = function (message, type, persistent = false) {
        notificationQueue.push({ message, type, persistent });
        if (!isModalActive) {
            processQueue();
        }
    };

    function processQueue() {
        if (!notificationQueue.length) {
            isModalActive = false;
            return;
        }
        isModalActive = true;
        // Lấy thông báo đầu tiên
        const { message, type, persistent } = notificationQueue.shift();

        const modal = document.getElementById("modal");
        const modalMessage = document.getElementById("modal-message");
        const modalContent = modal.querySelector(".modal-content");

        // Cập nhật nội dung và kiểu thông báo
        modalMessage.innerHTML = message;
        // Xóa các class cũ
        modalContent.classList.remove("success", "error", "normal", "status");
        // Thêm kiểu mới
        modalContent.classList.add(type);
        // Hiển thị modal
        modal.classList.add("show");

        // Nếu thông báo không là persistent, thiết lập thời gian tự động ẩn
        if (!persistent) {
            let displayDuration;
            if (type === "status") {
                displayDuration = 3000;
            } else if (type === "error") {
                displayDuration = 2000;
            } else {
                displayDuration = 1500;
            }

            setTimeout(() => {
                modal.classList.remove("show");
                // Chờ chút trước khi hiển thị thông báo tiếp theo
                setTimeout(() => {
                    processQueue();
                }, 100);
            }, displayDuration);
        }
        // Nếu persistent === true, thì modal sẽ ở lại cho đến khi bạn tự ẩn nó (bằng cách gọi hàm)
    }

    function hidePersistentModal() {
        const modal = document.getElementById("modal");
        if (modal.classList.contains("show")) {
            modal.classList.remove("show");
            // Bạn có thể gọi processQueue() nếu hệ thống hàng đợi cần tiếp tục xử lý các thông báo còn lại
            setTimeout(() => {
                processQueue();
            }, 100);
        }
    }

    // ---------------------
    // Login Handling
    // ---------------------
    document.getElementById("login-form").addEventListener("submit", function (e) {
        e.preventDefault();
        document.activeElement.blur();

        const account = document.getElementById("login-account").value.trim();
        const password = document.getElementById("login-password").value.trim();

        if (account === "" || password === "") {
            alert("Vui lòng nhập đầy đủ tài khoản và mật khẩu.");
            return;
        }

        // Lấy phần tử chứa text và spinner bên trong nút đăng nhập
        const loginButtonText = document.querySelector("#login-submit .btn-text");
        const spinnerInButton = document.querySelector("#login-submit .spinner-login");

        // Khi bắt đầu xử lý, ẩn text và hiển thị spinner
        loginButtonText.style.display = "none";
        spinnerInButton.style.display = "inline-block";

        // Vô hiệu hóa nút đăng nhập
        document.getElementById("login-submit").disabled = true;

        fetch(webAppUrl, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: "action=login&account=" + encodeURIComponent(account) + "&password=" + encodeURIComponent(password)
        })
            .then(response => response.json())
            .then(data => {
                if (data.status === "success") {
                    localStorage.setItem("loginTimestamp", new Date().getTime());
                    document.getElementById("login-container").style.display = "none";
                    document.querySelector(".mode-toggle").style.display = "flex";
                    document.getElementById("function-container").style.display = "flex";
                    document.body.classList.add('app-active');
                    btnReport.click();
                    document.getElementById("info-btn").click();
                } else {
                    showModal(data.message || "Sai tài khoản hoặc mật khẩu.", "error");
                    document.body.classList.remove('app-active');
                }
            })
            .catch(err => {
                console.error("Lỗi kết nối đến server", err);
                showModal("Lỗi kết nối server!", "error");
            })
            .finally(() => {
                // Sau khi hoàn tất xử lý, hiển thị lại text và ẩn spinner, đồng thời kích hoạt lại nút đăng nhập
                spinnerInButton.style.display = "none";
                loginButtonText.style.display = "inline-block";
                document.getElementById("login-submit").disabled = false;
            });
    });

    // Các biến và khởi tạo
    const webAppUrl =
        "https://script.google.com/macros/s/AKfycbytsnKRuH3Ae4FmzayupEwmNYMilsZDLLqq0VUMN8XYcOMWaXNM6FgbOy3p-sOytT7a/exec";
    let currentAttendanceType = "di-le"; // Mặc định
    let currentMode = "info"; // Có thể là "qr", "search", "report"
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
                //console.log("Đã lưu điểm danh Offline:", record);
                // Chỉ hiển thị modal nếu chưa được hiển thị trong phiên này
                if (!hasNotifiedOffline) {
                    //showModal("Đã lưu điểm danh!", "error");
                    //sendOfflineNotification();
                    hasNotifiedOffline = true;
                }
            };
            req.onerror = (err) => {
                console.error("Lỗi lưu điểm danh offline:", err);
                showModal("Lỗi lưu điểm danh Offline.", "error");
            };
        }).catch(err => console.error(err));
    }

    function retryFetch(url, options, attempts = 3, delay = 2000) {
        return new Promise((resolve, reject) => {
            const attemptFetch = (currentAttempt) => {
                fetch(url, options)
                    .then(response => {
                        // Với mode no-cors, response.status luôn là 0, nên ta coi thành công nếu promise resolve
                        if (options.mode === 'no-cors' || response.ok) {
                            resolve(response);
                        } else {
                            if (currentAttempt <= 1) {
                                reject(new Error("HTTP error: " + response.status));
                            } else {
                                console.warn(`Fetch thất bại, còn ${currentAttempt - 1} lần thử lại...`);
                                setTimeout(() => attemptFetch(currentAttempt - 1), delay);
                            }
                        }
                    })
                    .catch(error => {
                        if (currentAttempt <= 1) {
                            reject(error);
                        } else {
                            console.warn(`Fetch lỗi, còn ${currentAttempt - 1} lần thử lại...`, error);
                            setTimeout(() => attemptFetch(currentAttempt - 1), delay);
                        }
                    });
            };
            attemptFetch(attempts);
        });
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

                // Hiển thị thông báo “Đang gửi dữ liệu...” có spinner
                showModal('<span class="spinner"></span>\nĐang gửi dữ liệu điểm danh...', "status", true);

                // Gửi payload chung dạng JSON đến server
                retryFetch(webAppUrl, {
                    method: "POST",
                    mode: "no-cors",  // vẫn dùng no-cors
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ records: combinedRecords })
                }, 3, 2000)
                    .then(() => {
                        // Với no-cors, nếu promise được resolve, ta coi request đã được gửi thành công
                        console.log("Gửi xong tất cả bản điểm danh Offline");
                        hidePersistentModal();
                        showModal("Đã gửi xong.", "success");
                        clearOfflineAttendanceStore();
                    })
                    .catch(err => {
                        console.error("Lỗi khi đồng bộ các bản ghi offline:", err);
                        hidePersistentModal();
                        showModal("Lỗi gửi các bản ghi Offline.", "error");
                    });
            };

            req.onerror = () => {
                console.error("Lỗi truy xuất bản ghi offline từ IndexedDB");
                showModal("Lỗi truy xuất dữ liệu Offline.", "error");
            };
        }).catch(err => console.error(err));
    }

    function hasOfflineRecords() {
        return openAttendanceDB().then(db => {
            return new Promise((resolve, reject) => {
                const transaction = db.transaction("offlineAttendance", "readonly");
                const store = transaction.objectStore("offlineAttendance");
                const req = store.count();

                req.onsuccess = () => {
                    resolve(req.result > 0);
                };

                req.onerror = () => {
                    reject("Lỗi khi kiểm tra dữ liệu offline.");
                };
            });
        });
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

    let offlineTimer;

    if (navigator.onLine) {
        runOnlineTasks();
    } else {
        offlineTimer = setTimeout(() => {
            showModal("Đang Offline!", "error");
        }, 2000);
    }

    window.addEventListener("online", () => {
        // Nếu có timer hiện thông báo offline, xóa nó
        if (offlineTimer) {
            clearTimeout(offlineTimer);
            offlineTimer = null;
        }
        showModal("Đã kết nối mạng!", "success");
        syncCombinedAttendanceRecords();
    });

    window.addEventListener("offline", () => {
        // Khi mất mạng, hiển thị sau một khoảng delay
        offlineTimer = setTimeout(() => {
            showModal("Đang Offline!", "error");
        }, 2000);
    });

    function normalizeText(text) {
        if (!text) return "";
        return text.toString()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/\s+/g, "")  // loại bỏ tất cả khoảng trắng
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

    function updatePageTitle(newTitle) {
        const pageTitle = document.getElementById("page-title");
        if (pageTitle) {
            pageTitle.textContent = newTitle;
        }
    }
    // ---------------------
    // XỬ LÝ DROPDOWN TRẠNG THÁI
    // ---------------------
    function updateDropdownHeader(newHeaderText) {
        const headerTitle = document.querySelector('.dropdown-title');
        if (headerTitle) {
            headerTitle.textContent = newHeaderText;
        }
    }
    // Sự kiện đóng dropdown khi nhấn X
    document.getElementById("dropdown-close").addEventListener("click", function () {
        const dropdown = document.getElementById("status-dropdown");
        // Thêm lớp hidden để ẩn dropdown (với hiệu ứng chuyển động)
        dropdown.classList.add("hidden");
        // Nếu bạn muốn sau hiệu ứng xong ẩn hoàn toàn, bạn có thể sử dụng setTimeout để thay đổi display
        dropdown.style.display = "none";
    });

    document.getElementById("report-close").addEventListener("click", function () {
        const reportDropdown = document.getElementById("report-dropdown");
        reportDropdown.classList.add("hidden");
        // Sau một khoảng thời gian cho hiệu ứng chuyển động, ẩn hoàn toàn dropdown
        reportDropdown.style.display = "none";
    });

    function showStatusDropdown() {
        const dropdown = document.getElementById("status-dropdown");
        // Đảm bảo dropdown hiển thị theo kiểu flex
        dropdown.style.display = "flex";
        dropdown.classList.remove("hidden");
        // Nếu cần, thêm hiệu ứng show (ví dụ: thêm class "show")
        dropdown.classList.add("show");
    }

    function hideStatusDropdown() {
        const dropdown = document.getElementById("status-dropdown");
        dropdown.classList.remove("show");
        dropdown.style.display = "none";
    }

    const attendanceTypeName = {
        "di-le": "thánh lễ",
        "di-hoc": "giáo lý",
        "khac": "thống hối"
    };

    function onStatusSelected(type) {
        currentAttendanceType = type;
        document
            .querySelectorAll("#status-dropdown .status-box")
            .forEach((el) => el.classList.remove("active"));
        document.getElementById("status-" + type).classList.add("active");
        hideStatusDropdown();

        // Xác định tiêu đề dựa vào mode hiện hành
        let headerText = "";
        if (currentMode === "qr") {
            headerText = `Quét QR ${attendanceTypeName[type] || ""}`;
        } else if (currentMode === "search") {
            // Kiểm tra nếu toggle off active, thay đổi tiền tố thành "Nghỉ phép"
            const prefix = btnOff.classList.contains("active") ? "Nghỉ phép" : "Điểm danh";
            headerText = `${prefix} ${attendanceTypeName[type] || ""}`;
        }

        updatePageTitle(headerText);

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
    async function startCamera(loadingElem) {
        const videoConstraints = { facingMode: "environment" };
        const qrConfig = {
            fps: 15,
            videoConstraints: {
                facingMode: "environment",
                width: { ideal: 1280 },
                height: { ideal: 720 }
            }
        };

        try {
            await html5QrCode.start(videoConstraints, qrConfig, onScanSuccess, onScanFailure);
            isScanning = true;
            if (loadingElem) loadingElem.style.display = "none";
            // Sau khi camera được khởi động thành công, chuyển màu tiêu đề thành trắng
            const pageTitle = document.getElementById("page-title");
            if (pageTitle) {
                pageTitle.style.color = "#ffffff";
            }
            setTimeout(() => {
                document.getElementById("complete-btn").style.display = "block";
            }, 500);
            document.querySelector(".mode-toggle").style.display = "none";
            console.log("Camera bắt đầu quét mã QR với facingMode: 'environment'.");
        } catch (err) {
            showModal("Không truy cập được camera!", "error");
            console.error("Lỗi khi khởi động camera với facingMode: 'environment':", err);
        }
    }

    function showQRInterface() {
        searchContainer.style.display = "none";
        reportContainer.style.display = "none";
        qrContainer.style.display = "block";
        qrContainer.classList.add("fullscreen");
        const loadingElem = document.querySelector("#qr-scanner .loading");

        // Đặt màu tiêu đề là trắng
        const pageTitle = document.getElementById("page-title");
        if (pageTitle) {
            pageTitle.style.color = "";
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
            attendanceDescription = " thánh lễ ";
        } else if (currentAttendanceType === "di-hoc") {
            attendanceDescription = " giáo lý ";
        } else if (currentAttendanceType === "khac") {
            attendanceDescription = " thống hối ";
        }

        if (studentName.trim() !== "") {
            successMsg = studentName + attendanceDescription;
        }

        // Lưu bản ghi vào IndexedDB mà không kiểm tra trạng thái mạng
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

        /*

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

        retryFetch(webAppUrl, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: body
        }, 3, 2000)
            .then(response => {
                if (!response.ok) throw new Error("HTTP error: " + response.status);
                return response.text();
            })
            .catch(error => {
                console.error("Lỗi gửi trực tuyến:", error);
                showModal("Có lỗi khi gửi dữ liệu!", "error");
            });
        // Hiển thị thông báo thành công ngay lập tức sau khi gọi fetch
        showModal(successMsg, "success");
        */

    }
    // ---------------------
    // EVENT LISTENERS CHUYỂN ĐỔI GIAO DIỆN
    // ---------------------

    const toggleButtons = document.querySelectorAll(".toggle-button");
    const indicator = document.querySelector(".indicator");

    // Giả sử có 4 nút, mỗi nút chiếm 25% chiều rộng
    toggleButtons.forEach((button, index) => {
        button.addEventListener("click", function () {
            // Xóa active khỏi tất cả nút
            toggleButtons.forEach(btn => btn.classList.remove("active"));
            // Thêm active vào nút được nhấn
            this.classList.add("active");

            // Cập nhật vị trí indicator
            indicator.style.left = (index * 25) + "%";
        });
    });

    const btnQR = document.getElementById("toggle-qr");
    const btnSearch = document.getElementById("toggle-search");
    const btnReport = document.getElementById("toggle-report");
    const btnOff = document.getElementById("toggle-off");

    const qrContainer = document.getElementById("qr-container");
    const searchContainer = document.getElementById("search-container");
    const reportContainer = document.getElementById("report-container");
    const infoContainer = document.getElementById("info-container");

    const searchInput = document.getElementById("search-query");
    const reportInput = document.getElementById("report-query");
    const searchBtn = document.getElementById("search-button");
    const reportBtn = document.getElementById("report-button");
    const infoInput = document.getElementById("info-query");
    const infoBtn = document.getElementById("info-button");

    if (searchInput && searchBtn) {
        searchInput.addEventListener("keydown", function (e) {
            if (e.key === "Enter") {
                e.preventDefault();
                this.blur();
                searchBtn.click();
            }
        });
    }

    if (reportInput && reportBtn) {
        reportInput.addEventListener("keydown", function (e) {
            if (e.key === "Enter") {
                e.preventDefault();
                this.blur();
                reportBtn.click();
            }
        });
    }

    if (infoInput && infoBtn) {
        infoInput.addEventListener("keydown", function (e) {
            if (e.key === "Enter") {
                e.preventDefault();
                this.blur();
                infoBtn.click();
            }
        });
    }

    btnQR.addEventListener("click", () => {
        currentMode = "qr";
        btnQR.classList.add("active");
        btnSearch.classList.remove("active");
        btnReport.classList.remove("active");
        btnOff.classList.remove("active");
        document.getElementById("search-query").value = "";
        document.getElementById("search-results").innerHTML = "";
        document.getElementById("report-query").value = "";
        document.getElementById("report-results").innerHTML = "";

        document.getElementById("info-query").value = "";
        document.getElementById("info-results").innerHTML = "";

        document
            .querySelectorAll("#status-dropdown .status-box")
            .forEach((el) => el.classList.remove("active"));
        showStatusDropdown(btnQR);
        updateDropdownHeader("Quét QR");
        updatePageTitle("Quét QR");

        // Reset màu tiêu đề về mặc định (ví dụ màu đen hoặc màu cũ ban đầu)
        const pageTitle = document.getElementById("page-title");
        if (pageTitle) {
            pageTitle.style.color = ""; // hoặc màu cũ bạn mong muốn
        }

        qrContainer.style.display = "none";
        searchContainer.style.display = "none";
        reportContainer.style.display = "none";
        infoContainer.style.display = "none";
    });

    document.getElementById("complete-btn").addEventListener("click", function () {
        if (isScanning) {
            html5QrCode.stop().then(() => {
                isScanning = false;
                // Ẩn nút Hoàn thành khi dừng camera
                document.getElementById("complete-btn").style.display = "none";
                document.querySelector(".mode-toggle").style.display = "flex";

                // Cập nhật giao diện
                btnReport.click();
                document.getElementById("info-btn").click();

                if (navigator.onLine) {
                    syncCombinedAttendanceRecords();
                } else {
                    // Kiểm tra tồn tại bản ghi offline trước khi thông báo lỗi
                    hasOfflineRecords().then(hasRecords => {
                        if (hasRecords) {
                            alert("Đừng quên trở lại app khi có mạng để gửi điểm danh.");
                            //showModal("Không có mạng! - Vào lại App khi có mạng\nĐể gửi điểm danh.", "status");
                            sendOfflineNotification();
                        }
                    }).catch(err => {
                        console.error(err);
                        // Trong trường hợp lỗi khi truy xuất dữ liệu, bạn có thể thông báo hoặc log lỗi
                    });
                }
            }).catch((err) => {
                console.error("Lỗi khi tắt camera:", err);
                showModal("Lỗi khi tắt camera!", "error");
            });
        } else {
            if (navigator.onLine) {
                syncCombinedAttendanceRecords();
            } else {
                hasOfflineRecords().then(hasRecords => {
                    if (hasRecords) {
                        alert("Đừng quên trở lại app khi có mạng để gửi điểm danh.");
                        //showModal("Không có mạng! - Vào lại App khi có mạng\nĐể gửi điểm danh.", "status");
                        sendOfflineNotification();
                    }
                }).catch(err => {
                    console.error(err);
                });
            }
        }
    });

    btnSearch.addEventListener("click", () => {
        currentMode = "search";
        btnSearch.classList.add("active");
        btnQR.classList.remove("active");
        btnReport.classList.remove("active");
        btnOff.classList.remove("active");
        document.getElementById("report-query").value = "";
        document.getElementById("report-results").innerHTML = "";
        document.getElementById("search-query").value = "";
        document.getElementById("search-results").innerHTML = "";
        document.getElementById("info-query").value = "";
        document.getElementById("info-results").innerHTML = "";
        document
            .querySelectorAll("#status-dropdown .status-box")
            .forEach((el) => el.classList.remove("active"));
        showStatusDropdown(btnSearch);
        updateDropdownHeader("Điểm danh");
        updatePageTitle("Điểm danh");

        const pageTitle = document.getElementById("page-title");
        if (pageTitle) {
            pageTitle.style.color = ""; // hoặc màu cũ bạn mong muốn
        }

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
        infoContainer.style.display = "none";
        fadeIn(searchContainer);
    });

    btnOff.addEventListener("click", () => {
        currentMode = "search"; // Hoặc bạn nếu cần xử lý riêng riêng thì có thể đặt mode mới
        btnOff.classList.add("active");
        btnQR.classList.remove("active");
        btnReport.classList.remove("active");
        btnSearch.classList.remove("active");
        // Reset các giao diện nếu cần
        document.getElementById("report-query").value = "";
        document.getElementById("report-results").innerHTML = "";
        document.getElementById("search-query").value = "";
        document.getElementById("search-results").innerHTML = "";
        document.getElementById("info-query").value = "";
        document.getElementById("info-results").innerHTML = "";
        document
            .querySelectorAll("#status-dropdown .status-box")
            .forEach((el) => el.classList.remove("active"));
        // Có thể gọi thêm hàm showStatusDropdown nếu bạn muốn dropdown xuất hiện với nút toggle-off
        showStatusDropdown(btnOff);
        updateDropdownHeader("Nghỉ phép");
        updatePageTitle("Nghỉ phép");

        const pageTitle = document.getElementById("page-title");
        if (pageTitle) {
            pageTitle.style.color = ""; // hoặc màu cũ bạn mong muốn
        }

        // Nếu đang quét QR thì dừng
        if (isScanning) {
            html5QrCode.stop()
                .then(() => {
                    isScanning = false;
                    console.log("Camera đã được tắt khi chuyển sang tìm kiếm (toggle-off).");
                })
                .catch((error) => {
                    console.error("Lỗi khi dừng camera:", error);
                });
        }
        // Ẩn container QR và báo cáo
        qrContainer.style.display = "none";
        searchContainer.style.display = "none";
        reportContainer.style.display = "none";
        infoContainer.style.display = "none";
        // Hiển thị giao diện tìm kiếm
        fadeIn(searchContainer);
    });

    btnReport.addEventListener("click", () => {
        btnReport.classList.add("active");
        btnQR.classList.remove("active");
        btnSearch.classList.remove("active");
        btnOff.classList.remove("active");
        hideStatusDropdown();
        document.getElementById("search-query").value = "";
        document.getElementById("search-results").innerHTML = "";
        document.getElementById("info-query").value = "";
        document.getElementById("info-results").innerHTML = "";
        document.getElementById("report-query").value = "";
        document.getElementById("report-results").innerHTML = "";

        qrContainer.style.display = "none";
        searchContainer.style.display = "none";
        reportContainer.style.display = "none";
        infoContainer.style.display = "none";

        updatePageTitle("Tìm kiếm");

        const pageTitle = document.getElementById("page-title");
        if (pageTitle) {
            pageTitle.style.color = ""; // hoặc màu cũ bạn mong muốn
        }

        // Hiển thị dropdown báo cáo (có id "report-dropdown")
        const reportDropdown = document.getElementById("report-dropdown");
        reportDropdown.style.display = "flex";
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

    // Lựa chọn Report – giao diện báo cáo cũ
    document.getElementById("report-btn").addEventListener("click", () => {
        currentMode = "report";
        document.getElementById("report-dropdown").style.display = "none";
        infoContainer.style.display = "none";
        document.getElementById("search-query").value = "";
        document.getElementById("search-results").innerHTML = "";
        document.getElementById("report-query").value = "";
        document.getElementById("report-results").innerHTML = "";
        document.getElementById("info-query").value = "";
        document.getElementById("info-results").innerHTML = "";
        reportContainer.style.display = "block";
        fadeIn(reportContainer);
        updatePageTitle("Kết quả điểm danh");

    });

    // Lựa chọn Info – dùng giao diện search với chức năng tìm kiếm từ sheet "base"
    document.getElementById("info-btn").addEventListener("click", () => {
        currentMode = "info";
        document.getElementById("report-dropdown").style.display = "none";
        document.getElementById("search-query").value = "";
        document.getElementById("search-results").innerHTML = "";
        document.getElementById("report-query").value = "";
        document.getElementById("report-results").innerHTML = "";
        document.getElementById("info-query").value = "";
        document.getElementById("info-results").innerHTML = "";
        infoContainer.style.display = "Block";
        fadeIn(infoContainer);
        updatePageTitle("thông tin thiếu nhi");

    });

    // Lựa chọn Point – hiển thị thông báo hoặc xử lý riêng (ví dụ: tạm thông báo chưa cập nhật)
    /*
    document.getElementById("point-btn").addEventListener("click", () => {
        currentMode = "point";
        document.getElementById("report-dropdown").style.display = "none";
        showModal("Chức năng Point chưa được cập nhật", "normal");
    });
    */

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
            headerHeight = 320;      // giảm chiều cao header cho điện thoại (ví dụ: 300px)
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
        // Chỉ sử dụng offline search để tìm kiếm
        offlineSearch(query)
            .then((data) => {
                processResults(data);
            })
            .catch((err) => {
                console.error("Lỗi khi tìm kiếm offline:", err);
                resultsDiv.innerHTML = `<p style="color: var(--error-color);">Có lỗi khi tìm kiếm dữ liệu!</p>`;
            });
    });

    // ---------------------
    // EVENT LISTENER TÌM KIẾM (INFO)
    // ---------------------
    document.getElementById("info-button").addEventListener("click", function () {
        // Xoá cache tìm kiếm trước đó (nếu cần)
        document.getElementById("info-results").innerHTML = "";
        searchCache.clear();
        const query = document.getElementById("info-query").value.trim();
        if (!query) {
            alert("Vui lòng nhập từ khóa cần tìm!");
            return;
        }
        const resultsDiv = document.getElementById("info-results");

        // Hiển thị giao diện loading
        resultsDiv.innerHTML = `
      <div style="text-align:center;">
        <div class="spinner"></div>
        <p style="margin-top: 10px;font-size: 0.9rem;">Đang tìm kiếm...</p>
      </div>`;

        // Hàm xử lý kết quả (chung cho online và offline)
        const processResults = (data) => {
            if (!Array.isArray(data) || data.length === 0) {
                resultsDiv.innerHTML = `<p class="student-mesage">Không tìm thấy, vui lòng kiểm tra lại!</p>`;
                return;
            }
            searchCache.set(query, data);
            renderInfoPage(data);
        };

        // Nếu online thì ưu tiên gọi online search, còn nếu có lỗi hay không có kết quả thì fallback vào offline search.
        // Chỉ sử dụng offline search để tìm kiếm
        offlineSearch(query)
            .then((data) => {
                processResults(data);
            })
            .catch((err) => {
                console.error("Lỗi khi tìm kiếm offline:", err);
                resultsDiv.innerHTML = `<p style="color: var(--error-color);">Có lỗi khi tìm kiếm dữ liệu!</p>`;
            });
    });

    function renderInfoPage(data) {
        let html = `
    <div class="info-responsive" style="max-height: calc(100vh - 200px); overflow-y: auto;">
  `;

        data.forEach((record, index) => {
            html += `
      <div class="info-card">
        <!-- Hàng 1: Tên Thánh và Họ và Tên -->
        <div class="info-row info-row-1">
          ${index + 1}. ${record.holyName || ""} ${record.fullName || ""}
        </div>
        <!-- Hàng 3: Lớp và Ngày sinh -->
        <div class="info-row">
          <div class="col">Lớp: ${record.birthDate || ""}</div>
          <div class="col">DOB: ${record.dob || ""}</div>
        </div>
        <!-- Hàng 2: SĐT -->
        <div class="info-row info-row-2">SĐT: ${record.sdt || ""}</div>
        <!-- Hàng 4: Tên cha và Tên mẹ -->
        <div class="info-row info-row-4">Bố: ${record.tenCha || ""}</div>
        <div class="info-row info-row-0">Mẹ: ${record.tenMe || ""}</div>
        <!-- Hàng 5: Tình trạng -->
        <div class="info-row info-row-5">Tình trạng: ${record.trangThai || ""}</div>
        <!-- Hàng 6: Giáo họ và Mã số -->
        <div class="info-row">
          <div class="col">Giáo họ: ${record.giaoho || ""}</div>
          <div class="col">Mã số: ${record.maso || ""}</div>
        </div>
        <!-- Hàng 7: Rửa tội và Rước lễ -->
        <div class="info-row">
          <div class="col">Rửa tội: ${record.ruatoi || ""}</div>
          <div class="col">Rước lễ: ${record.xungtoi || ""}</div>
        </div>
        <!-- Hàng 8: Thêm sức và Ghi chú -->
        <div class="info-row">
          <div class="col">Thêm sức: ${record.themsuc || ""}</div>
          <div class="col">Ghi chú: ${record.note || ""}</div>
        </div>
      </div>
    `;
        });

        html += `</div>`;

        // Gán kết quả vào vùng hiển thị
        document.getElementById("info-results").innerHTML = html;
    }

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
                    attendanceDescription = " thánh lễ ";
                } else if (currentAttendanceType === "di-hoc") {
                    attendanceDescription = " giáo lý ";
                } else if (currentAttendanceType === "khac") {
                    attendanceDescription = " thống hối ";
                }

                // Nếu nút toggle-off (xin vắng) đang active thì thêm mô tả
                if (btnOff.classList.contains("active")) {
                    attendanceDescription = " nghỉ phép " + attendanceDescription;
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

                if (!confirm("Xác nhận" + attendanceDescription + selectedIds.length + " thiếu nhi đã chọn?")) {
                    interactiveElements.forEach(el => el.disabled = false);
                    confirmBtn.innerHTML = originalText;
                    return;
                }

                // Tạo mảng các bản ghi điểm danh
                const records = selectedIds.map(studentId => {
                    const stu = selectedStudents[studentId];
                    // Khởi tạo record với các trường cơ bản
                    let record = {
                        id: studentId,
                        type: currentAttendanceType,  // ví dụ "di-le", "di-hoc", "khac"
                        holy: stu.holyName || "",
                        name: stu.fullName || ""
                    };
                    // Nếu nút toggle-off đang active, thêm trường extra để thông báo "xin-vang"
                    if (btnOff.classList.contains("active")) {
                        record.extra = "xin-vang";
                    }
                    return record;
                });

                // Nếu có kết nối mạng: gửi batch dữ liệu online, nếu không, lưu offline từng record.
                try {
                    if (navigator.onLine) {
                        // Gửi dữ liệu qua fetch với mode no-cors để tránh preflight
                        await retryFetch(webAppUrl, {
                            method: "POST",
                            mode: "no-cors",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ records: records })
                        }, 3, 2000);
                        showModal("Gửi xong" + attendanceDescription + selectedIds.length + " thiếu nhi.", "success");
                    } else {
                        const batchRecord = {
                            timestamp: Date.now(), // Thêm thuộc tính bắt buộc theo keyPath
                            recordType: "batch",   // Đánh dấu đây là bản ghi dạng batch
                            records: records       // Đây là mảng các bản ghi đã tạo
                        };
                        saveAttendanceRecord(batchRecord);
                        //showModal("Offline! Lưu lại" + attendanceDescription + selectedIds.length + " thiếu nhi. Đừng quên trở lại app để gửi điểm danh.", "status");
                        alert("Đừng quên trở lại app khi có mạng để gửi điểm danh.");
                        sendOfflineNotification();
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
    function handleReportData(data) {
        if (data.error) {
            document.getElementById("report-results").innerHTML = `<p style="color: var(--error-color);">${data.error}</p>`;
            return;
        }
        if (!Array.isArray(data) || data.length === 0) {
            document.getElementById("report-results").innerHTML = `<p class="student-mesage">Không tìm thấy, vui lòng kiểm tra lại.</p>`;
            return;
        }
        reportData = data;
        currentReportPage = 1;
        renderReportTable();
    }

    window.handleReportData = handleReportData;


    function fetchReportDataJSONP(query) {
        const script = document.createElement("script");
        const url = webAppUrl +
            "?action=search&q=" + encodeURIComponent(query) +
            "&mode=report&callback=handleReportData&t=" + new Date().getTime();
        script.src = url;
        document.body.appendChild(script);
    }

    document.getElementById("report-button").addEventListener("click", function () {
        const query = document.getElementById("report-query").value.trim();
        if (!query) {
            alert("Vui lòng nhập từ khóa để tìm kiếm!");
            return;
        }
        if (!navigator.onLine) {
            alert("Không có kết nối mạng. Vui lòng kết nối để tìm kiếm!");
            return;
        }
        document.getElementById("report-results").innerHTML = `
      <div style="text-align:center;">
          <div class="spinner"></div>
          <p style="margin-top: 10px; font-size: 0.9rem;">Đang tìm kiếm kết quả...</p>
      </div>`;
        fetchReportDataJSONP(query);
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
            <th class="col-12">Lễ</th>
            <th class="col-12">Học</th>
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
        // Thiết lập thông tin header chung
        const uniqueClasses = Array.from(new Set(data.map(item => item.birthDate)));
        const hasMultipleClasses = uniqueClasses.length > 1;
        const headerClassText = (!hasMultipleClasses && data.length > 0) ? data[0].birthDate : "";
        const today = new Date();
        const formattedDate = today.toLocaleDateString("vi-VN");

        // Biến đếm hiển thị số thứ tự STT cho toàn bộ báo cáo
        let globalRowCount = 0;

        // Mở cửa sổ in mới
        const printWindow = window.open("", "In Báo cáo", "width=800,height=600");

        // Xây dựng nội dung HTML cho in báo cáo
        let html = `
        <html>
          <head>
            <meta name="viewport" content="width=device-width, initial-scale=1.0" />
            <title>Báo cáo điểm danh${!hasMultipleClasses ? " - " + headerClassText : ""}</title>
            <style>
              body {
                font-family: Arial, sans-serif;
                padding: 0;
                margin: 0 10px;
              }
              table {
                width: 100%;
                border-collapse: collapse;
                table-layout: fixed;
                font-size: 13px;
                margin-top: 20px;
              }
              th, td {
                padding: 5px 5px;
                box-sizing: border-box;
                border: 0.5px solid black;
                word-wrap: break-word;
                white-space: normal;
                text-align: center;
                line-height: 1.2;
                vertical-align: middle;
              }
              th {
                font-weight: bold;
              }
              td:last-child, th:last-child {
                text-align: center;
              }
              .header {
                border: none;
                text-align: center;
              }

              .header h1 {
                margin: 0;
                font-size: 30px;
                text-transform: uppercase;
              }
              .header p {
                margin: 10px 0 20px 0;
                font-size: 20px;
                font-weight: normal;
              }
              /* Khi in, lặp lại header của bảng trên mỗi trang */
              @media print {
                @page {
                  size: A4 landscape;
                  margin-top: 10mm;
                  margin-bottom: 10mm;
                  margin-left: 15mm;
                  margin-right: 10mm;  
                }
                thead {
                  display: table-header-group;
                }
                tr {
                  page-break-inside: avoid;
                  -webkit-page-break-inside: avoid;
                }
              }
              @media (max-width: 767px) {
                .header h1 {
                margin: 0;
                font-size: 28px;
                }
                .header p {
                margin: 8px 0 8px 0;
                font-size: 18px;
                }
                table {
                  margin: 6px;
                  table-layout: fixed;
                  width: 100%;
                  font-size: 12.2px;
                  
                }
                th, td {
                  padding: 4.5px 5px;
                }
              }
            </style>
          </head>
          <body>
      `;
        let currentIndex = 0;
        let page = 1;
        while (currentIndex < data.length) {
            let rowsThisPage = (page === 1) ? 21 : 25;
            let pageData = data.slice(currentIndex, currentIndex + rowsThisPage);
            currentIndex += rowsThisPage;

            // Đối với trang thứ 2 trở đi, thêm trang mới bằng thẻ div tạo page-break
            if (page > 1) {
                html += `<div style="page-break-before: always;"></div>`;
            }

            // Tạo bảng cho trang hiện tại với header nằm trong <thead>
            html += `
      <table>
        <colgroup>
          <col style="width: 5%;">
          <col style="width: 10%;">
          <col style="width: 10%;">
          <col style="width: 22%;">
          <col style="width: 6%;">
          <col style="width: 6%;">
          <col style="width: 6%;">
          <col style="width: 6%;">
          <col style="width: 6%;">
          <col style="width: 6%;">
          <col style="width: 6%;">
          <col style="width: 6%;">
          <col style="width: 6%;">
        </colgroup>
        <thead>
    `;

            // Trang đầu tiên có header báo cáo (tiêu đề + ngày)
            if (page === 1) {
                html += `
            <tr>
              <th colspan="13" class="header">
                <h1>Điểm danh${!hasMultipleClasses ? " - " + headerClassText : ""}</h1>
                <p>Ngày: ${formattedDate}</p>
              </th>
            </tr>
      `;
            }

            // Hàng đầu tiên của header bảng (luôn hiển thị ở mọi trang)
            html += `
            <tr>
              <th>STT</th>
              <th>ID</th>
              <th>Tên Thánh</th>
              <th>Họ và Tên</th>
              <th>Đi lễ</th>
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
          <tbody>
    `;

            // Thêm các dòng dữ liệu của trang hiện tại
            pageData.forEach(item => {
                globalRowCount++;
                html += `
              <tr>
                <td>${globalRowCount}</td>
                <td>${item.id}</td>
                <td>${item.holyName}</td>
                <td style="text-align:left;">${item.fullName}</td>
                <td>${(item.colF !== null && item.colF !== undefined) ? item.colF : ""}</td>
                <td>${(item.colG !== null && item.colG !== undefined) ? item.colG : ""}</td>
                <td>${(item.colH !== null && item.colH !== undefined) ? item.colH : ""}</td>
                <td>${(item.colI !== null && item.colI !== undefined) ? item.colI : ""}</td>
                <td>${(item.colJ !== null && item.colJ !== undefined) ? item.colJ : ""}</td>
                <td>${(item.colK !== null && item.colK !== undefined) ? item.colK : ""}</td>
                <td>${item.percentDiLe || ""}</td>
                <td>${item.percentDiHoc || ""}</td>
                <td>${item.percentKhac || ""}</td>
              </tr>
      `;
            });

            html += `
          </tbody>
        </table>
    `;
            page++;
        }

        html += `
      </body>
    </html>
  `;

        printWindow.document.write(html);
        printWindow.document.close();
        printWindow.focus();
        // Nếu trình duyệt hỗ trợ, tự động đóng cửa sổ in sau khi in xong
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
        if (navigator.serviceWorker) {
            navigator.serviceWorker.ready.then(registration => {
                // registration.active đảm bảo rằng service worker đã đang kiểm soát trang
                if (registration.active) {
                    registration.active.postMessage({ action: 'offlineNotification' });
                }
            }).catch(err => console.error("Service worker chưa sẵn sàng:", err));
        }
    }
});
