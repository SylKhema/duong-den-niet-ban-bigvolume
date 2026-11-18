# Xuất bản Bộ Đại và Bộ Tóm Lược trên nibbanagamini.org

Bản này dùng trang chủ từ nhánh main của Bộ Đại, commit `3edb664`. Bộ Tóm Lược dùng trình đọc và dữ liệu từ lần bàn giao Web 158, giữ phần Anh bổ sung cho chỉ mục Cuốn 2, cùng trang tải và tư liệu nguồn từ bản Web 159. Các tệp tải đã đối chiếu với `docs/mini/downloads/manifest.json`.

## Hai kho nguồn và một bản triển khai

- Bộ Đại lấy từ `SylKhema/duong-den-niet-ban-bigvolume`. Thư mục xuất bản là `docs/`. Bộ Đại nằm tại `docs/big/`, Bộ Tóm Lược tại `docs/mini/`. Trang đọc Bộ Đại dùng `/big/` và liên kết `/bo-dai/` chuyển tiếp về địa chỉ mới. Mã tiếp nhận và duyệt góp ý dùng `functions/api/` ở gốc dự án.
- Bộ Tóm Lược lấy từ `SylKhema/duong-den-niet-ban-mini`, nhánh `main` tại mốc `57a04b4`. Thư mục `docs/mini/` trong gói này là bản xuất bản đã bổ sung ảnh, PDF nguyên tác và 135 tệp riêng. Sau khi dùng tài khoản có quyền ghi repo Mini, đưa bản đã bổ sung vào kho Mini riêng tư, rồi lấy bản từ đó cho các lần xuất bản sau.
- Khi chuẩn bị bản phát hành, sao chép thư mục xuất bản của Bộ Đại vào thư mục dựng bản phát hành. Sao chép bản của Bộ Tóm Lược từ kho Mini vào `docs/mini/` trong thư mục đó. Commit của từng bộ được theo dõi ở kho nguồn tương ứng. Tệp ZIP này đã lắp sẵn cây xuất bản để kiểm tra hoặc triển khai.

## Xuất bản trang tĩnh trên GitHub Pages (phục vụ được tại Myanmar)

Do Cloudflare bị chặn tại Myanmar, toàn bộ trang tĩnh trong `docs/` được xuất bản trực tiếp qua **GitHub Pages** và **không đi qua proxy Cloudflare**:

1. Trong phần cấu hình DNS của tên miền `nibbanagamini.org` (tắt đám mây cam / chế độ Proxy nếu vẫn dùng DNS của Cloudflare, hoặc chuyển sang nhà cung cấp DNS khác):
   - Trỏ `@` (`nibbanagamini.org`) bằng các bản ghi `A` của GitHub Pages: `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153` (và tùy chọn `AAAA` `2606:50c0:8000::153` .. `2606:50c0:8003::153`).
   - Trỏ `www` (`CNAME`) về `<tên-tài-khoản-github>.github.io`.
2. Trên GitHub, mở **Settings → Pages**:
   - **Source**: chọn **Deploy from a branch**, nhánh **`main`**, thư mục **`/docs`**, rồi **Save**.
   - **Custom domain**: xác nhận `nibbanagamini.org` (được đọc từ `docs/CNAME`) và bật **Enforce HTTPS**.
3. Kiểm tra `docs/.nojekyll`, `docs/bo-dai/index.html` và `docs/404.html` chuyển hướng đúng về `/big/`, kiểm tra hai nút đọc, ba chế độ Việt, English và Việt–Anh, mục lục, tải tệp và PDF nguyên tác.

## Triển khai hệ thống góp ý bằng Google Firebase (gói Spark miễn phí, `firebase/`)

Thay cho Cloudflare Functions/D1 (bị chặn tại Myanmar) và không cần thuê VPS, hệ thống góp ý sử dụng **Cloud Firestore + Firebase Authentication (gói Spark miễn phí)** trực tiếp từ trang tĩnh trên GitHub Pages:

1. Thực hiện theo hướng dẫn từng bước trong [firebase/README.md](firebase/README.md):
   - Tạo dự án Firebase gói **Spark (No-cost)** và bật **Cloud Firestore** (khuyến nghị vùng `asia-southeast1`).
   - Áp dụng `firebase/firestore.rules` và tạo chỉ mục `feedback_public (published ASC, status ASC, updated_at DESC)` từ `firebase/firestore.indexes.json`.
   - Bật **Authentication → Email/Password**, tắt quyền tự đăng ký công khai, tạo tài khoản người phụ trách và thêm document `admins/<UID>` trong Firestore.
   - Điền `projectId` và `apiKey` vào `docs/feedback-config.js`, sau đó đẩy lên nhánh `main` của GitHub.
   - Nếu có dữ liệu cũ trên Cloudflare D1, xuất SQL (`wrangler d1 export`) và nhập sang Firestore bằng `firebase/migrate-from-d1.mjs`.
2. Kiểm tra gửi góp ý từ Bộ Đại và Bộ Tóm Lược, tra cứu mã tiếp nhận tại `/gop-y.html`, đăng nhập `/review.html` bằng tài khoản Firebase quản trị, thử duyệt, kiểm tra nhật ký `/hieu-dinh.html`, và xác nhận người chưa đăng nhập không đọc được collection `feedback`.

## Duyệt và xuất bản hiệu đính

1. Mở góp ý tại `/review.html`, vào liên kết vị trí trong sách và đối chiếu nguyên tác. Nhập đoạn hiện tại và bản đề xuất, chọn **Đang đối chiếu**, rồi lưu.
2. Tải lại góp ý, kiểm tra hai đoạn và chọn **Đã duyệt bản sửa**. Nếu thay đổi bản đề xuất, lưu lại ở trạng thái **Đang đối chiếu** trước khi duyệt.
3. Sửa dữ liệu chuẩn trong đúng kho, cập nhật các bản tải liên quan rồi triển khai. Kiểm tra đoạn đã sửa trên tên miền thật. Sau đó ghi mã commit đầy đủ, chuyển sang **Đã sửa**, và chọn công bố lời giải thích nếu cần. Trang quản trị kiểm tra định dạng mã commit. Người phát hành xác minh nội dung của commit và bản triển khai.
