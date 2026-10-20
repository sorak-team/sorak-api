# Sorak API — Backend REST Service

[![Node.js Version](https://img.shields.io/badge/Node.js-22%20LTS-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![Express.js](https://img.shields.io/badge/Framework-Express%204-000000?logo=express&logoColor=white)](https://expressjs.com/)
[![Prisma ORM](https://img.shields.io/badge/ORM-Prisma%206-2D3748?logo=prisma&logoColor=white)](https://www.prisma.io/)
[![PostgreSQL](https://img.shields.io/badge/Database-PostgreSQL%2016-4169E1?logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

> **Hệ thống Quản lý Phát triển & Theo dõi Sức khỏe Trẻ Mầm non (Trường Mầm non Hòn Tre)**  
> **Capstone Project SEP490 — FPT University (Fall 2026)**

---

## 📖 Tổng Quan Dự Án (Project Overview)

**Sorak API** là dịch vụ Backend RESTful API phục vụ toàn bộ nghiệp vụ quản lý giáo dục mầm non, sức khỏe thể chất và kết nối phụ huynh theo chuẩn chương trình Giáo dục Mầm non của Bộ Giáo dục & Đào tạo (MOET). 

Hệ thống được thiết kế theo kiến trúc phân tầng chuẩn (**Clean Layered Architecture**), phân quyền chặt chẽ theo vai trò (**RBAC**), bảo mật phiên làm việc với JWT và cookie HTTP-only, cùng khả năng xử lý giao dịch dữ liệu toàn vẹn qua Prisma ORM và PostgreSQL 16.

---

## 👥 Vai Trò Người Dùng (User Roles & Permissions)

Hệ thống phân quyền chi tiết 4 vai trò độc lập theo mô hình **Role-Based Access Control (RBAC)**:

| Vai Trò (Role) | Mã Hệ Thống | Mô Tả Quyền Hạn |
| :--- | :--- | :--- |
| **Quản trị viên hệ thống** | `ADMIN` | Quản trị tài khoản, phân quyền bảo mật, cấu hình hệ thống và sao lưu dữ liệu. |
| **Ban Giám Hiệu** | `PRINCIPAL_BGH` | Quản lý năm học, chỉ tiêu phân lớp, duyệt chuyển lớp, phê duyệt kế hoạch giáo dục, báo cáo toàn trường. |
| **Giáo viên chủ nhiệm / Bộ môn** | `TEACHER_GV` | Quản lý hồ sơ lớp, điểm danh, đo chỉ số sức khỏe, lập kế hoạch bài dạy, đánh giá trẻ, khen thưởng Bé Ngoan. |
| **Phụ huynh học sinh** | `PARENT_PH` | Xem dòng thời gian sinh hoạt, thực đơn, gửi đơn xin nghỉ, ủy quyền đón trẻ, theo dõi biểu đồ tăng trưởng WHO. |

---

## 🧩 Các Phân Hệ Nghiệp Vụ (Core Modules)

Hệ thống bao gồm 24 phân hệ nghiệp vụ hoàn chỉnh trải dài qua 4 Iteration:

### 1. Quản trị & Xác thực (Identity & Administration)
- **Authentication & Security:** Đăng nhập an toàn bằng JWT Bearer Token và Refresh Token Rotation trong cookie HTTP-only; khôi phục mật khẩu qua mã OTP 6 chữ số gửi qua email (Nodemailer SMTP).
- **Accounts & RBAC Management:** Quản lý tài khoản người dùng, kích hoạt/vô hiệu hóa, cấp mật khẩu tạm thời, phân quyền theo vai trò.
- **Teacher Directory & Workload:** Hồ sơ giáo viên, văn bằng chứng chỉ, thâm niên, phân công giáo viên chủ nhiệm / trợ giảng và cân đối khối lượng giảng dạy.

### 2. Năm học & Quản lý Lớp học (Academic Operations & Rosters)
- **Academic Calendar & Semesters:** Quản lý năm học, mốc thời gian Học kỳ I / II, đồng bộ danh sách ngày nghỉ lễ quốc gia theo quy định nhà nước.
- **Classroom Management:** Quản lý phòng học theo khối lớp lứa tuổi: **Nhà trẻ** (24-36 tháng), **Mầm** (3-4 tuổi), **Chồi** (4-5 tuổi), **Lá** (5-6 tuổi); kiểm soát định mức sĩ số tối đa.
- **Student Admissions & Intake:** Hồ sơ nhập học, mã định danh học sinh, hồ sơ người giám hộ và bể chờ phân lớp (Waiting Pool).
- **Class Transfer Workflow:** Quy trình nộp đơn, thẩm định chỉ tiêu lớp đến, phê duyệt hoặc từ chối chuyển lớp học sinh.
- **Roster Exporting:** Xuất danh sách lớp, sổ điểm danh và thẻ học sinh ra định dạng Excel và PDF chuẩn văn bản.

### 3. Kế hoạch Giáo dục & Thời khóa biểu (Curriculum & Planning)
- **5 Lĩnh vực Phát triển MOET:** Khung mục tiêu giáo dục mầm non gồm: *Thể chất*, *Nhận thức*, *Ngôn ngữ*, *Tình cảm & Kỹ năng xã hội*, *Thẩm mỹ*.
- **Theme & Goal Hierarchy:** Quản lý chủ đề giáo dục theo tuần/tháng, phân rã mục tiêu bài học và kho học liệu (truyện, thơ, trò chơi, bài hát).
- **AI Activity Assistant:** Tích hợp gợi ý hoạt động giáo dục phù hợp độ tuổi theo chuẩn chương trình MOET.
- **Weekly Routine Matrix:** Thời khóa biểu tuần chuẩn sinh hoạt mầm non: Đón trẻ, Ăn sáng, Hoạt động học/chơi, Ăn trưa, Ngủ trưa, Ăn xế, Hoạt động chiều, Trả trẻ.

### 4. Chăm sóc, Sức khỏe & Đánh giá (Care, Health & Assessment)
- **Daily Attendance & Bus Transit:** Điểm danh có mặt, vắng phép/không phép, ghi nhận giờ đến, theo dõi trạng thái xe buýt đưa đón.
- **Pickup & Dismissal Authorizations:** Xác thực người đưa đón hợp lệ, danh sách ủy quyền khẩn cấp, quét mã xác nhận giờ trả trẻ an toàn.
- **Health Records & WHO Standards:** Ghi nhận chiều cao, cân nặng, tính toán BMI tự động và phân loại theo bảng chuẩn độ lệch Z-score của Tổ chức Y tế Thế giới (WHO); sổ theo dõi dị ứng và chỉ định dùng thuốc.
- **Daily & Weekly Assessment:** Đánh giá nhanh cuối ngày theo thang 3 mức (*Đạt*, *Chưa đạt*, *Cần cố gắng*), nhật ký quan sát hành vi của giáo viên.
- **Monthly Milestones & Semester Reports:** Tổng hợp đánh giá tháng, phiếu theo dõi sự phát triển của trẻ cuối học kỳ kèm biểu đồ radar 5 lĩnh vực.
- **Bé Ngoan Rewards:** Bình cờ, phiếu Bé Ngoan, ghi nhận hoa điểm 10 và cấp giấy khen tuần/tháng.

### 5. Cổng Dịch vụ Phụ huynh (Parent Portal Services)
- Dòng thời gian sinh hoạt trực tiếp trong ngày (bữa ăn, giấc ngủ, tâm trạng).
- Gửi đơn xin nghỉ học trực tuyến kèm lý do và khoảng thời gian.
- Ủy quyền người thân đón trẻ có ảnh đại diện và số CCCD xác minh.
- Phản hồi nhận xét của giáo viên và theo dõi sổ theo dõi sức khỏe điện tử.

---

## 🏗 Kiến Trúc Hệ Thống (System Architecture)

```
                       HTTP Requests (JSON / Cookies)
                                     │
                                     ▼
                     ┌───────────────────────────────┐
                     │     Express.js App Factory     │
                     │  (Helmet, CORS, Pino Logger)  │
                     └───────────────┬───────────────┘
                                     │
                                     ▼
                     ┌───────────────────────────────┐
                     │    Middlewares & Validation   │
                     │  • JWT Auth & RBAC Guard      │
                     │  • Joi Schema Validators      │
                     └───────────────┬───────────────┘
                                     │
                                     ▼
                     ┌───────────────────────────────┐
                     │      Thin HTTP Controllers    │
                     │  (HTTP Envelope & Response)   │
                     └───────────────┬───────────────┘
                                     │
                                     ▼
                     ┌───────────────────────────────┐
                     │       Business Services       │
                     │  (Domain Logic, Calculations) │
                     └───────────────┬───────────────┘
                                     │
                                     ▼
                     ┌───────────────────────────────┐
                     │      Prisma ORM Client        │
                     │  (Type-safe Queries & Trans.) │
                     └───────────────┬───────────────┘
                                     │
                                     ▼
                     ┌───────────────────────────────┐
                     │    PostgreSQL 16 Database     │
                     └───────────────────────────────┘
```

---

## 🛠 Tech Stack

- **Runtime Environment:** Node.js 22 LTS (Native ECMAScript Modules - ESM)
- **Web Framework:** Express.js 4
- **Database & ORM:** PostgreSQL 16 + Prisma ORM 6
- **Data Validation:** Joi v17
- **Authentication & Security:** JSON Web Token (`jsonwebtoken`), `bcryptjs`, Cookie-Parser, Helmet, CORS
- **Email Service:** Nodemailer (SMTP OTP Delivery)
- **Logging & Diagnostics:** Pino & Pino-HTTP
- **API Documentation:** Swagger UI (`/docs`)

---

## 📁 Cấu Trúc Thư Mục (Directory Structure)

```
sorak-api/
├── prisma/
│   ├── schema.prisma            # Khai báo cấu trúc bảng & quan hệ cơ sở dữ liệu
│   └── seed.js                  # Kịch bản nạp dữ liệu mẫu ban đầu (năm học, lớp, tài khoản)
├── src/
│   ├── config/                  # Cấu hình môi trường (env.js), Prisma singleton, SMTP
│   ├── controllers/             # Bộ điều khiển nhận request HTTP và định dạng response
│   ├── middlewares/             # Xác thực JWT, phân quyền RBAC, validate dữ liệu, bắt lỗi
│   ├── routes/                  # Định tuyến các endpoint theo từng module nghiệp vụ
│   │   ├── auth.routes.js
│   │   ├── account.routes.js
│   │   ├── teacher.routes.js
│   │   ├── school-year.routes.js
│   │   ├── class.routes.js
│   │   ├── student.routes.js
│   │   ├── curriculum.routes.js
│   │   ├── planning.routes.js
│   │   ├── attendance.routes.js
│   │   ├── health.routes.js
│   │   ├── assessment.routes.js
│   │   ├── good-behavior.routes.js
│   │   ├── parent.routes.js
│   │   └── index.js             # Bộ gom tuyến trung tâm (central apiRouter)
│   ├── services/                # Tầng nghiệp vụ xử lý dữ liệu và logic tính toán
│   ├── utils/                   # Hàm tiện ích dùng chung (logger, http-error, pagination)
│   ├── validators/              # Lược đồ kiểm tra tính hợp lệ dữ liệu (Joi schemas)
│   ├── app.js                   # Cấu hình Express app và middleware pipeline
│   └── server.js                # Khởi động HTTP server
├── .env.example                 # Mẫu khai báo biến môi trường
├── package.json                 # Khai báo dependencies và scripts
└── README.md
```

---

## 🔑 Tài Khoản Trải Nghiệm Mẫu (Demo Seed Accounts)

Sau khi chạy lệnh `npm run prisma:seed`, hệ thống tự động khởi tạo các tài khoản demo sau:

| Vai Trò | Tên Đăng Nhập (Username) | Mật Khẩu | Họ Tên Đại Diện | Chức Danh / Lớp |
| :--- | :--- | :--- | :--- | :--- |
| **BGH / Hiệu Trưởng** | `ADMIN01` | `123456` | Nguyễn Thu Trang | Hiệu trưởng |
| **Phó Hiệu Trưởng** | `CB24001` | `123456` | Trần Thị Mai | Phó Hiệu trưởng (Chủ nhiệm Mầm 1) |
| **Giáo Viên** | `CB25001` | `123456` | Nguyễn Đình Vinh | Giáo viên bộ môn |
| **Phụ Huynh** | `HS26001` | `123456` | Phụ huynh em Lê Tuấn Kiệt | Lớp Mầm 1 |
| **Phụ Huynh** | `HS26016` | `123456` | Phụ huynh em Nguyễn Anh Thư | Lớp Nhà trẻ A1 |

---

## 🚀 Hướng Dẫn Cài Đặt & Khởi Chạy (Getting Started)

### Yêu cầu tiên quyết (Prerequisites)
- **Node.js**: Phiên bản 22.x LTS trở lên
- **PostgreSQL**: Phiên bản 16.x trở lên
- **Trình quản lý gói**: npm 10+ hoặc pnpm

### Các bước thực hiện

1. **Clone repository:**
   ```bash
   git clone https://github.com/sorak-team/sorak-api.git
   cd sorak-api
   ```

2. **Cấu hình biến môi trường:**
   Sao chép tệp mẫu `.env.example` thành `.env` và điều chỉnh chuỗi kết nối cơ sở dữ liệu:
   ```bash
   cp .env.example .env
   ```
   *Ví dụ cấu hình kết nối PostgreSQL:*
   ```env
   PORT=3000
   DATABASE_URL="postgresql://postgres:password@localhost:5432/sorak_db?schema=public"
   JWT_SECRET="sorak_jwt_secret_key_sep490_production"
   JWT_REFRESH_SECRET="sorak_jwt_refresh_secret_key_sep490"
   CORS_ORIGIN="http://localhost:5173"
   ```

3. **Cài đặt thư viện dependencies:**
   ```bash
   npm install
   ```

4. **Khởi tạo Database & Seed dữ liệu mẫu:**
   ```bash
   npm run prisma:generate
   npm run prisma:migrate
   npm run prisma:seed
   ```

5. **Chạy máy chủ ở môi trường Development:**
   ```bash
   npm run dev
   ```

Máy chủ sẽ khởi chạy tại: `http://localhost:3000`.  
Kiểm tra tình trạng hoạt động tại: `http://localhost:3000/health`.

---

## 📜 Các Scripts Có Sẵn (Available Scripts)

- `npm run dev`: Chạy server ở chế độ phát triển kèm tính năng tự động khởi động lại (`--watch`).
- `npm start`: Chạy server ở môi trường Production.
- `npm run prisma:generate`: Sinh Prisma Client từ schema.
- `npm run prisma:migrate`: Áp dụng các migration vào database PostgreSQL.
- `npm run prisma:seed`: Nạp dữ liệu mẫu ban đầu (năm học, lớp học, giáo viên, học sinh).
- `npm run prisma:studio`: Mở giao diện trực quan Prisma Studio quản lý dữ liệu bảng.
- `npm run lint`: Kiểm tra chất lượng mã nguồn bằng ESLint.
- `npm run format`: Tự động định dạng mã nguồn theo chuẩn Prettier.

---

## 👨‍💻 Đội Ngũ Thực Hiện (Sorak Team — SEP490 Fall 2026)

| STT | Thành Viên | Vai Trò Trong Dự Án | GitHub Handle |
| :---: | :--- | :--- | :--- |
| 1 | **La Thiên Toàn** | Leader / Full-stack Developer | [@toanthienla](https://github.com/toanthienla) |
| 2 | **Phan Văn Hữu Thuận** | Full-stack Developer | [@ThunFan127](https://github.com/ThunFan127) |
| 3 | **Nguyễn Ngọc Hân** | Frontend / Full-stack Developer | [@hancontam](https://github.com/hancontam) |
| 4 | **Huỳnh Phúc Thọ** | Full-stack Developer | [@HuynhPhucTho-Web](https://github.com/HuynhPhucTho-Web) |
| 5 | **Quang Nhật Phi Yến** | Full-stack Developer | [@quangnhatphiyen](https://github.com/quangnhatphiyen) |

---
*Bản quyền © 2026 Sorak Team — Đại học FPT. Dự án phục vụ Đồ án Tốt nghiệp Kỹ sư Kỹ thuật Phần mềm (SEP490).*
