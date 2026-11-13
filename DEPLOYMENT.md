# Xuất bản Bộ Đại và Bộ Tóm Lược trên nibbanagamini.org

Bản này dùng trang chủ từ nhánh main của Bộ Đại, commit `3edb664`. Bộ Tóm Lược dùng trình đọc và dữ liệu từ lần bàn giao Web 158, giữ phần Anh bổ sung cho chỉ mục Cuốn 2, cùng trang tải và tư liệu nguồn từ bản Web 159. Các tệp tải đã đối chiếu với `docs/mini/downloads/manifest.json`.

## Hai kho nguồn và một bản triển khai

- Bộ Đại lấy từ `SylKhema/duong-den-niet-ban-bigvolume`. Thư mục xuất bản là `docs/`. Mã tiếp nhận và duyệt góp ý dùng `functions/api/` ở gốc dự án.
- Bộ Tóm Lược lấy từ `SylKhema/duong-den-niet-ban-mini`, nhánh `main` tại mốc `57a04b4`. Thư mục `docs/mini/` trong gói này là bản xuất bản đã bổ sung ảnh, PDF nguyên tác và 135 tệp riêng. Sau khi dùng tài khoản có quyền ghi repo Mini, đưa bản đã bổ sung vào kho Mini riêng tư, rồi lấy bản từ đó cho các lần xuất bản sau.
- Khi chuẩn bị bản phát hành, sao chép thư mục xuất bản của Bộ Đại vào thư mục dựng bản phát hành. Sao chép bản của Bộ Tóm Lược từ kho Mini vào `docs/mini/` trong thư mục đó. Commit của từng bộ được theo dõi ở kho nguồn tương ứng. Tệp ZIP này đã lắp sẵn cây xuất bản để kiểm tra hoặc triển khai.

## Cập nhật dự án Cloudflare Pages đang phục vụ tên miền

1. Trong Cloudflare, mở dự án có custom domain `nibbanagamini.org`. Ghi lại lần triển khai hiện tại và tên cơ sở dữ liệu D1 đang liên kết dưới tên `DB`.
2. Kiểm tra cấu trúc bảng `feedback` bằng `PRAGMA table_info(feedback);`. Trên cơ sở dữ liệu thử có cùng cấu trúc, áp dụng `migrations/0002_shared_feedback.sql` và kiểm tra các hàng cũ. Sau khi kiểm thử, áp dụng tệp SQL một lần trên D1 sản xuất trước khi phát hành code. Các hàng cũ nhận bộ mặc định là Bộ Đại và ngôn ngữ mặc định là Việt.
3. Xác minh dự án có mật khẩu quản trị `ADMIN_PASSWORD` hoặc `ADMIN_KEY` được lưu dưới dạng secret. Đăng nhập tại `/review.html`. API dùng mật khẩu quản trị được cấu hình trong dự án.
4. Từ thư mục giải nén, chạy `npx wrangler pages deploy docs --project-name <tên-dự-án-hiện-tại> --branch <nhánh-preview>`. Giữ `functions/` bên cạnh `docs/` khi chạy lệnh. Dùng cơ sở dữ liệu và mật khẩu thử cho preview.
5. Kiểm tra ở preview hai nút đọc, ba chế độ Việt, English và Việt–Anh, mục lục, tải tệp, PDF nguyên tác và chức năng gửi góp ý. Gửi thử từ mỗi bộ, tra cứu hai mã, thử duyệt, kiểm tra nhật ký và xác nhận người chưa đăng nhập nhận 401 tại API quản trị. Sau đó triển khai cùng bản lên nhánh sản xuất của dự án. Kiểm tra lại trên tên miền thật.

## Duyệt và xuất bản hiệu đính

1. Mở góp ý tại `/review.html`, vào liên kết vị trí trong sách và đối chiếu nguyên tác. Nhập đoạn hiện tại và bản đề xuất, chọn **Đang đối chiếu**, rồi lưu.
2. Tải lại góp ý, kiểm tra hai đoạn và chọn **Đã duyệt bản sửa**. Nếu thay đổi bản đề xuất, lưu lại ở trạng thái **Đang đối chiếu** trước khi duyệt.
3. Sửa dữ liệu chuẩn trong đúng kho, cập nhật các bản tải liên quan rồi triển khai. Kiểm tra đoạn đã sửa trên tên miền thật. Sau đó ghi mã commit đầy đủ, chuyển sang **Đã sửa**, và chọn công bố lời giải thích nếu cần. Trang quản trị kiểm tra định dạng mã commit. Người phát hành xác minh nội dung của commit và bản triển khai.
