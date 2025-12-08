# Backend API (ASM version)

Backend được tái cấu trúc theo đúng yêu cầu ASM: quản lý user, danh mục, sản phẩm và giỏ hàng/thanh toán.

## Cài đặt

```bash
cd backend
npm install
```

## Biến môi trường

Tạo file `.env` với các biến:

```
PORT=4000
MONGODB_URI=mongodb://localhost:27017/asm
DEFAULT_RESET_PASSWORD=123456

# SMTP phục vụ gửi email đăng ký (Gmail hoặc dịch vụ khác)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=phamthanhhoan2401@gmail.com
SMTP_PASS=app_password
SMTP_FROM="Cooking ASM <phamthanhhoan2401@gmail.com>"
```

> Nếu chưa cấu hình SMTP, API đăng ký vẫn hoạt động nhưng response sẽ báo “gửi email thất bại” và log cảnh báo.

## Chạy server

```bash
npm run dev   # dùng nodemon
# hoặc
npm start
```

Server mặc định chạy tại `http://localhost:4000`. Mọi endpoint được mount dưới `/api`.

## 1. User Management

| Method | Path | Mô tả |
| ------ | ---- | ----- |
| `POST` | `/api/asm/reg-mail` | Đăng ký tài khoản, lưu avatar (tùy chọn) và gửi email xác nhận |
| `POST` | `/api/asm/login` | Đăng nhập, trả về access token (1h) + refresh token (1 ngày) ký với `PHAMTHANHHOAN` |
| `PUT`  | `/api/asm/update-password/:id` | Đổi mật khẩu |
| `GET`  | `/api/asm/get-all-user` | Lấy danh sách user |

## 2. Category Management

| Method | Path | Mô tả |
| ------ | ---- | ----- |
| `POST` | `/api/asm/add-danhmuc` | Thêm danh mục mới |
| `GET`  | `/api/asm/get-all-danhmuc` | Danh sách danh mục |
| `DELETE` | `/api/asm/delete-danhmuc/:id` | Xóa danh mục (báo lỗi nếu còn sản phẩm sử dụng) |

## 3. Product Management

| Method | Path | Mô tả |
| ------ | ---- | ----- |
| `POST` | `/api/asm/add-sanpham` | Thêm sản phẩm (kiểm tra `categoryid`) |
| `GET`  | `/api/asm/get-sanpham-danhmuc/:categoryid` | Lấy sản phẩm theo danh mục |
| `GET`  | `/api/asm/sanpham/:id` | Chi tiết sản phẩm |
| `GET`  | `/api/asm/sanpham/search?keyword=` | Tìm kiếm theo tên |
| `PUT`  | `/api/asm/update-sanpham/:id` | Cập nhật thông tin sản phẩm |
| `PUT`  | `/api/asm/update-sanpham-image/:id` | Chỉ cập nhật ảnh |

## 4. Cart & Checkout

| Method | Path | Mô tả |
| ------ | ---- | ----- |
| `POST` | `/api/asm/cart/add-sanpham` | Thêm sản phẩm vào giỏ (tự tạo `HoaDon` trạng thái pending nếu chưa có) |
| `GET`  | `/api/asm/check-gio/:accountid` | Xem giỏ hàng hiện tại (bill + items) |
| `DELETE` | `/api/asm/cart/remove/:billdetailid` | Xóa 1 item trong giỏ |
| `PUT`  | `/api/asm/cart/thanhtoan` | Thanh toán danh sách item (`detailIds`), cập nhật trạng thái “Đã thanh toán” và tính tổng tiền |

## 5. User Submitted Recipes

| Method | Path | Mô tả |
| ------ | ---- | ----- |
| `GET` | `/api/asm/user-recipes` | Danh sách công thức người dùng gửi (filter theo `status`, `authorEmail`, có phân trang `page`, `limit`) |
| `GET` | `/api/asm/user-recipes/:id` | Chi tiết một công thức người dùng gửi |

## Cấu trúc dữ liệu chính

- `Account`: `email`, `password`, `name`, `avatar`, `available`, `role`.
- `DanhMuc`: tên danh mục, unique.
- `SanPham`: thông tin sản phẩm + `categoryid`.
- `HoaDon`: `accountid`, `status` (`pending/completed/cancelled`).
- `HoaDonChiTiet`: thuộc `HoaDon`, chứa `productid`, `quantity`, `status`.

## Upload & thư mục

- Avatar được lưu ở `backend/uploads/` (đã ignore Git). Nếu cần public file, thêm `app.use('/uploads', express.static(...))` trong `src/index.js`.

## Gửi email đăng ký

- Dùng `nodemailer`. Đảm bảo bật “App Password” cho Gmail hoặc cung cấp SMTP tương thích.
- Nếu không muốn gửi mail khi dev, bỏ qua biến SMTP và xem cảnh báo log.

## Postman

`backend/postman_collection.json` đang là placeholder cũ. Import và tự cập nhật request cho nhóm `/api/asm/...` khi cần test.

