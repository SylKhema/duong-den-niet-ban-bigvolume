# Máy chủ góp ý và hiệu đính

Giải nén feedback-server-source.zip vào thư mục riêng. Đây là mã nguồn Vinext/Cloudflare Worker đang dùng trên Sites, không có dữ liệu góp ý, mật khẩu hay biến môi trường bí mật. Các tệp sách lớn được giữ trong ../../docs/big của kho, không nhân bản trong ZIP này.

1. Sao chép nội dung docs/ ở gốc kho vào public/ của thư mục mã nguồn, giữ các tệp giao diện góp ý có trong gói.
2. Dùng Node >=22.13, npm ci, thêm danh tính dự án vào .openai/hosting.json theo nhà cung cấp. Ví dụ trong ZIP chỉ khai báo D1 DB, không nhận danh tính Sites của dự án đang chạy.
3. Tạo/bind D1 DB, áp dụng migration drizzle/0000_moaning_may_parker.sql và đặt REVIEWER_EMAIL ở cấu hình runtime, không ghi giá trị vào mã hay GitHub.
4. Build qua npm run build hoặc workflow Sites tương ứng. Có thể chạy npm run db:generate nếu chủ ý thay schema bằng migration mới; không thay SQL đã áp dụng.
5. Xác thực /api/review dựa trên header do Sites dispatch cung cấp. Nếu tự host ngoài Sites, bắt buộc triển khai xác thực quản trị khác và không tin header bên ngoài giả mạo. Không triển khai API quản lý mở.
6. Kiểm tra gửi, nhận mã, tra cứu, từ chối khách xem dữ liệu riêng, và chỉ công bố public_note sau khi người phụ trách duyệt. Nhật ký công khai không chứa message/name/email.

Gói là bản bàn giao của lần bổ sung góp ý; đối chiếu mã nguồn Sites mới nhất trước khi tiếp tục phát triển. Các bản PDF/EPUB/HTML offline đã tải về không tự trở thành biểu mẫu trực tuyến.
