# Hệ thống góp ý bằng Google Firebase (gói Spark miễn phí)

Hệ thống góp ý (`/gop-y.html`, nút góp ý trong `/big/` và `/mini/`), nhật ký hiệu đính (`/hieu-dinh.html`) và trang quản lý (`/review.html`) chạy trực tiếp từ website tĩnh trên GitHub Pages kết nối tới **Cloud Firestore** và **Firebase Authentication** — **dùng hoàn toàn gói Spark miễn phí** (không cần Cloud Functions, không cần thẻ tín dụng hay gói Blaze, và không đi qua proxy Cloudflare).

## Kiến trúc bảo mật dữ liệu

Để giữ bí mật tên, email và nội dung góp ý chưa công bố ngay cả trên trình duyệt không qua máy chủ trung gian, dữ liệu được tách thành hai collection và bảo vệ bằng `firebase/firestore.rules`:

- `feedback/{id}`: Lưu toàn bộ góp ý, tên/email tùy chọn và ghi chú biên tập nội bộ. **Khách chỉ được `create`** (kèm kiểm tra định dạng chặt chẽ và dấu thời gian máy chủ `request.time`); **chỉ quản trị viên mới được đọc, liệt kê hoặc cập nhật**.
- `feedback_public/{id}`: Chỉ lưu trạng thái công khai (`id`, `status`, `created_at`, `updated_at`, `published`, vị trí sách và `public_note` do quản trị viên viết). Khách có thể tra cứu theo đúng mã `GY-…` (`get`) hoặc đọc danh sách các mục đã được duyệt công bố (`published == true && status in ['resolved', 'unchanged']`) trên `/hieu-dinh.html`. Không chứa tên, email, nội dung góp ý gốc hay ghi chú nội bộ.
- `admins/{uid}`: Danh sách UID của người phụ trách được phép đăng nhập `/review.html`. Quy tắc không cho phép ghi từ client (`allow write: if false`).

## Hướng dẫn thiết lập (10–15 phút, hoàn toàn miễn phí)

### Bước 1: Tạo dự án Firebase (gói Spark)
1. Truy cập [Firebase Console](https://console.firebase.google.com/) và chọn **Create a project** (hoặc **Add project**).
2. Giữ gói **Spark (No-cost)** mặc định; có thể tắt Google Analytics nếu không cần.
3. Trong **Project overview → Add app → Web (`</>`)**, đăng ký một Web app (tên bất kỳ, không cần bật Firebase Hosting).
4. Sao chép `apiKey` và `projectId` trong phần `firebaseConfig`.

### Bước 2: Bật Cloud Firestore và áp dụng quy tắc bảo mật
1. Trong menu trái: **Build → Firestore Database → Create database**.
2. Chọn **Standard edition**, chọn vùng gần Việt Nam / Myanmar (khuyến nghị `asia-southeast1` — Singapore), chọn **Start in production mode**.
3. Triển khai `firebase/firestore.rules` và `firebase/firestore.indexes.json` theo **một trong hai cách**:
   - **Cách A (trực tiếp trên web Firebase Console, không cần cài CLI):**
     1. Vào tab **Rules**, dán toàn bộ nội dung tệp [`firebase/firestore.rules`](firestore.rules) và bấm **Publish**.
     2. Vào tab **Indexes → Composite → Add index**:
        - Collection ID: `feedback_public`
        - Fields: `published` (`Ascending`), `status` (`Ascending`), `updated_at` (`Descending`)
        - Query scope: `Collection` → **Create**.
   - **Cách B (dùng Firebase CLI trên máy):**
     ```sh
     npm install -g firebase-tools
     firebase login
     cd firebase
     firebase use <projectId>
     firebase deploy --only firestore
     ```

### Bước 3: Bật Firebase Authentication và cấp quyền quản trị
1. Trong menu trái: **Build → Authentication → Get started → Sign-in method**.
2. Bật **Email/Password** (chỉ bật mục đầu tiên; không cần Email link).
3. Vào **Authentication → Settings → User actions** và **tắt (uncheck) Enable create (sign-up)** để người lạ không tự đăng ký tài khoản mới.
4. Vào tab **Users → Add user**, tạo tài khoản email + mật khẩu cho người phụ trách hiệu đính, sau đó **sao chép User UID**.
5. Quay lại **Firestore Database → Data → Start collection**:
   - Collection ID: `admins`
   - Document ID: dán **User UID** vừa sao chép (có thể thêm một field `role: "editor"` hoặc để trống) → **Save**.

### Bước 4: Điền cấu hình vào `docs/feedback-config.js`
Mở [`docs/feedback-config.js`](../docs/feedback-config.js) và điền `projectId` và `apiKey`:

```js
projectId: 'ten-project-cua-ban',
apiKey: 'AIzaSy...',
```

Commit và đẩy lên GitHub để GitHub Pages cập nhật.

> **Lưu ý về API Key công khai:** `apiKey` và `projectId` của Firebase Web là định danh ứng dụng công khai (luôn hiển thị trong mã nguồn trình duyệt); quyền đọc/ghi dữ liệu được bảo vệ bởi `firestore.rules`. Tuy nhiên, nên vào Google Cloud Console → APIs & Services → Credentials → chọn Browser key → mục **Website restrictions**, giới hạn thêm cho `https://nibbanagamini.org/*` và `https://www.nibbanagamini.org/*`.

## Chuyển dữ liệu cũ từ Cloudflare D1 (nếu có)

Nếu trước đây đã có góp ý trong Cloudflare D1:

```sh
# 1. Xuất từ Cloudflare D1
npx wrangler d1 export <tên-db-d1> --remote --output=d1-backup.sql

# 2. Nhập vào Firestore bằng tài khoản quản trị vừa tạo
FIREBASE_PROJECT_ID=<projectId> \
FIREBASE_API_KEY=<apiKey> \
FIREBASE_ADMIN_EMAIL=<email-quan-tri> \
FIREBASE_ADMIN_PASSWORD=<mat-khau-quan-tri> \
node firebase/migrate-from-d1.mjs d1-backup.sql
```

## Chạy kiểm thử tự động

```sh
node --test firebase/feedback.test.mjs
```
