# Đường Đến Niết-bàn — Bộ Đại I–V

Thư viện bản dịch Việt ngữ **Nibbānagāminipaṭipadā** của **Pa-Auk Tawya Sayadaw**.

Kho này bàn giao nội dung và website tĩnh độc lập để người phụ trách kỹ thuật xuất bản và gắn tên miền riêng. Không cần tài khoản ChatGPT để chạy website được xuất bản từ các tệp này.

## Các bản sách

| Tập | PDF Việt | HTML ngoại tuyến | EPUB | Unicode TXT | Unicode Markdown |
| --- | --- | --- | --- | --- | --- |
| I | [PDF](docs/downloads/tap-1.pdf) | [HTML](docs/downloads/html/tap-1.html) | [EPUB](docs/downloads/epub/tap-1.epub) | [TXT](docs/downloads/unicode/tap-1.txt) | [MD](docs/downloads/unicode/tap-1.md) |
| II | [PDF](docs/downloads/tap-2.pdf) | [HTML](docs/downloads/html/tap-2.html) | [EPUB](docs/downloads/epub/tap-2.epub) | [TXT](docs/downloads/unicode/tap-2.txt) | [MD](docs/downloads/unicode/tap-2.md) |
| III | [PDF](docs/downloads/tap-3.pdf) | [HTML](docs/downloads/html/tap-3.html) | [EPUB](docs/downloads/epub/tap-3.epub) | [TXT](docs/downloads/unicode/tap-3.txt) | [MD](docs/downloads/unicode/tap-3.md) |
| IV | [PDF](docs/downloads/tap-4.pdf) | [HTML](docs/downloads/html/tap-4.html) | [EPUB](docs/downloads/epub/tap-4.epub) | [TXT](docs/downloads/unicode/tap-4.txt) | [MD](docs/downloads/unicode/tap-4.md) |
| V | [PDF](docs/downloads/tap-5.pdf) | [HTML](docs/downloads/html/tap-5.html) | [EPUB](docs/downloads/epub/tap-5.epub) | [TXT](docs/downloads/unicode/tap-5.txt) | [MD](docs/downloads/unicode/tap-5.md) |

GitHub có thể chỉ hiển thị mã HTML thay vì trang sách. Muốn đọc ngoại tuyến, tải tệp HTML bằng nút Download raw file rồi mở trong trình duyệt; mỗi tệp tự chứa nội dung, kiểu chữ và mục lục bên trái. Ctrl+F / ⌘F tìm trong cả tập. Tải EPUB về ứng dụng đọc sách tương thích.

## Cấu trúc

- `docs/`: toàn bộ website sẵn sàng phục vụ qua HTTP/HTTPS; HTML, CSS, JavaScript thuần, không cần build hay cơ sở dữ liệu.
- `docs/books/1.json` … `5.json`: dữ liệu Unicode UTF-8 có cấu trúc, giữ nội dung HTML, mã đoạn, số trang nguồn, mục lục và chú thích. Đây là dữ liệu đầu vào chuẩn để tái tạo các định dạng.
- `docs/books/*-search.json`: chỉ mục tìm kiếm của website.
- `docs/downloads/`: năm PDF Việt đã lưu, cùng các thư mục `html`, `unicode`, `epub`.
- `docs/sources/`: năm PDF nguyên tác Miến để đối chiếu. Không phải bản Unicode Miến hay bản OCR mới.
- `scripts/export_books.py`: tái tạo TXT, Markdown, HTML ngoại tuyến và EPUB từ JSON.
- `scripts/validate_exports.py`: kiểm tra dữ liệu, mục lục, liên kết nội bộ, tệp EPUB và tính toàn vẹn PDF.
- `records/`: nguồn nhập, phiên bản, kiểm tra và danh sách SHA-256.

## Chạy thử trên máy

```sh
python3 -m http.server 8000 --directory docs
```

Mở `http://localhost:8000`. Website tổng tải JSON bằng `fetch`, vì vậy không mở trực tiếp `docs/index.html` qua `file://`. Các tệp riêng trong `docs/downloads/html/` mở trực tiếp được, không cần máy chủ hoặc Internet.

## Xuất bản — dành cho người phụ trách kỹ thuật

1. Clone kho về máy, giữ nguyên cấu trúc thư mục.
2. Đưa **nội dung thư mục `docs/`** lên nhà cung cấp website tĩnh; không cần build command. Nếu triển khai ở thư mục con, giữ nguyên các đường dẫn tương đối.
3. Nếu dùng GitHub Pages, vào **Settings → Pages**, chọn **Deploy from a branch**, nhánh **main**, thư mục **/docs**, rồi Save. Tệp `.nojekyll` đã có. Tùy quyền và giao diện GitHub, tên nút có thể thay đổi.
4. Kiểm tra mở đủ năm tập, mục lục, tìm kiếm, tải PDF/EPUB/HTML và đối chiếu PDF nguồn.
5. Khi có tên miền, cấu hình theo đúng hướng dẫn DNS của nhà cung cấp hosting, bật HTTPS và kiểm tra chứng chỉ. Kho chưa gắn tên miền và không chứa CNAME giả định.

Kho GitHub này lưu dữ liệu; việc đưa lên kho **không đồng nghĩa website đã được xuất bản**. Chủ dự án giao người phụ trách kỹ thuật thực hiện xuất bản và tên miền.

## Sửa nội dung và tái tạo định dạng

Unicode là cách mã hóa chữ, không phải một đuôi tệp duy nhất: JSON, TXT, Markdown và HTML ở đây đều UTF-8. PDF/EPUB là các bản phát hành để đọc; không sửa trực tiếp rồi bỏ quên dữ liệu đầu vào.

Khi hiệu đính, cập nhật đúng dữ liệu tập trong `docs/books/`, cập nhật chỉ mục tìm kiếm tương ứng, ghi nhật ký thay đổi rồi tái tạo bản phát hành. Script xuất sách không tự biên dịch lại chỉ mục tìm kiếm hoặc PDF.

```sh
python3 -m pip install lxml
python3 scripts/export_books.py
python3 scripts/validate_exports.py
```

Kiểm tra PDF dùng PyMuPDF (`python3 -m pip install pymupdf`). Chạy `python3 scripts/validate_exports.py --pdf` để kiểm cả số trang, bookmarks và SHA-256 của năm PDF Việt. Cần thử EPUB trong ứng dụng đọc sách trước đợt phát hành dành cho độc giả; kiểm tra cấu trúc không thay thế việc hiệu đính hoặc đọc thử trên mọi thiết bị.

## Nguyên tắc giữ gìn bản dịch

Giữ dấu Pāli, thứ tự nội dung, chỗ lặp, chú thích tác giả/người dịch, nghi vấn và mốc trang Miến/PDF nguồn. Mã đoạn được giữ trong dữ liệu để quản lý nhưng ẩn khi đọc. Không coi việc chuyển định dạng là một lần thẩm định học thuật độc lập.

Năm PDF Việt được sao chép nguyên trạng từ bộ đã lưu. Chúng không được dàn trang lại trong lần bàn giao này. Các bản Unicode, HTML ngoại tuyến và EPUB được tạo từ JSON của website tổng, nên có thể có cách ngắt trang khác PDF.

Kho chỉ gồm Bộ Đại I–V. Bộ Mini và các dự án khác không nằm trong lần bàn giao này. Tài khoản, mật khẩu, token, cấu hình truy cập ChatGPT và lịch sử Git nội bộ không được đưa vào kho.

Nội dung Việt ngữ và phần biên tập của dự án, trong phạm vi quyền được cấp, dùng CC BY-NC 4.0: chia sẻ và sửa đổi phi thương mại, ghi nguồn, chỉ rõ thay đổi, không hàm ý đã được dự án duyệt. Xem [LICENSE](LICENSE). Nguyên tác, tư liệu bên thứ ba, phông chữ và phần mềm có phạm vi quyền riêng như LICENSE nêu.


## Góp ý và hiệu đính

Trên website đang vận hành, bấm/chạm vào đoạn để hiện **Góp ý đoạn vừa chọn**, hoặc dùng **Góp ý chung**. Gửi ẩn danh được; tên/email tùy chọn. Chỉ sau khi ghi cơ sở dữ liệu thành công, hệ thống mới trả mã tiếp nhận. [Hướng dẫn và quyền riêng tư](docs/gop-y.html), [nhật ký công khai](docs/hieu-dinh.html), [quản lý riêng](docs/review.html).

**Phần góp ý cần máy chủ và cơ sở dữ liệu D1; GitHub Pages chỉ phục vụ tệp tĩnh nên không tự xử lý biểu mẫu.** Không coi việc tải HTML lên hosting tĩnh là đã triển khai hệ thống góp ý. Mã máy chủ nằm trong [gói nguồn backend](server/feedback-server-source.zip), kèm [hướng dẫn](server/README.md). Trang quản lý hiện dùng danh tính ChatGPT do Sites xác thực và biến runtime `REVIEWER_EMAIL`; không công khai giá trị biến này. Nếu chuyển sang máy chủ độc lập ngoài Sites, phải thay lớp xác thực bằng cơ chế quản trị tin cậy trước khi mở API quản lý. Không tin các header danh tính do người dùng gửi trực tiếp.

Các góp ý, tên và email nằm riêng trong D1, không được đưa vào GitHub, ZIP công khai hoặc nhật ký hiệu đính. Trạng thái quản lý không tự sửa sách/PDF/EPUB: chủ dự án vẫn đối chiếu, duyệt, sửa dữ liệu chuẩn rồi phát hành lại.
