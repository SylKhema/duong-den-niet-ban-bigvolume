# Đường đến Niết-bàn — Bộ Mini 9 cuốn

Bản bàn giao từ Web 158, commit nguồn `4aaf875bcc07711d746b7dfd84f2d77f67c82ad5`.

- `index.html` là trang đọc ở thư mục gốc của kho Mini. Mục lục, văn bản Việt–Anh, bảng và dữ liệu tra cứu ở `data/`.
- `downloads/` chứa chín gói ZIP. Mỗi gói có 15 tệp gồm PDF, EPUB, HTML, TXT và Markdown cho ba bản Việt, Anh và Việt–Anh. `downloads/manifest.json` ghi SHA-256 của từng gói và từng tệp.
- Bản bàn giao bổ sung bản Anh cho sáu trang chỉ mục Cuốn 2, Miến 137–142, theo bản Việt đã xuất bản và đối chiếu thứ tự, số trang với bản Miến. Nghi vấn về nghĩa của một mục ở Miến 139 được giữ.
- Các liên kết ảnh, PDF nguyên tác và nơi gửi góp ý mở tại [website Mini hiện hành](https://nibbanagaminipatipada-mini.khema.chatgpt.site/).

Khi xuất bản dưới `/mini/` trên cùng tên miền với Bộ Đại, phục vụ thư mục gốc của kho này tại đường dẫn đó. Để xem thử tại máy, chạy `python3 -m http.server 8000` từ thư mục gốc rồi mở `http://localhost:8000/`. Các tệp HTML trong ZIP đọc được trực tiếp sau khi giải nén.
