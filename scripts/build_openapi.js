import fs from 'fs';
import path from 'path';
import YAML from 'yaml';

const routesJsonPath = path.resolve('../scratch/all_routes.json');
const routes = JSON.parse(fs.readFileSync(routesJsonPath, 'utf8'));

// Tags dictionary
const tagMeta = {
  System: 'Kiểm tra trạng thái máy chủ (Health Check & Uptime)',
  Auth: 'Xác thực, đăng nhập, 2FA, OTP và quản lý phiên (Sessions)',
  Accounts: 'Quản trị danh sách tài khoản người dùng và phân quyền BGH',
  Students: 'Hồ sơ học sinh, tuyển sinh, chuyển lớp và liên kết phụ huynh',
  Classes: 'Quản lý lớp học, phân bổ học sinh, giáo viên phụ trách và báo cáo ngày',
  Attendance: 'Điểm danh buổi sáng, đón trẻ, đơn xin nghỉ và ủy quyền đưa đón',
  Health: 'Hồ sơ sức khỏe định kỳ, khám chuyên khoa và chỉ số BMI/WHO',
  Planning: 'Kế hoạch giáo dục, thời khóa biểu tuần, phân bổ mục tiêu và trợ lý AI',
  Curriculum: 'Khung chương trình GDMN, chủ đề giáo dục và ngân hàng mục tiêu',
  Teachers: 'Hồ sơ giáo viên, trình độ chuyên môn và phân công giảng dạy',
  'School Years': 'Quản lý năm học, học kỳ, ngày nghỉ lễ và chuyển niên khóa',
  Assessment: 'Đánh giá sự phát triển của trẻ (ngày, tháng, học kỳ theo TT28/51)',
  'Good Behavior': 'Sổ bé ngoan, tiêu chí rèn luyện và bình bầu cờ bé ngoan',
  Parent: 'Cổng thông tin phụ huynh, lịch học, đơn đưa đón và phản hồi',
  Upload: 'Tải lên hình ảnh avatar, ảnh ủy quyền đưa đón lên lưu trữ MinIO',
};

const fileToTag = {
  'account.routes.js': 'Accounts',
  'assessment.routes.js': 'Assessment',
  'attendance.routes.js': 'Attendance',
  'auth.routes.js': 'Auth',
  'class.routes.js': 'Classes',
  'curriculum.routes.js': 'Curriculum',
  'good-behavior.routes.js': 'Good Behavior',
  'health.routes.js': 'Health',
  'parent.routes.js': 'Parent',
  'planning.routes.js': 'Planning',
  'school-year.routes.js': 'School Years',
  'student.routes.js': 'Students',
  'teacher.routes.js': 'Teachers',
  'upload.routes.js': 'Upload',
};

// Friendly summary generator based on path and method
function generateSummary(route) {
  const { method, fullPath } = route;
  const p = fullPath;

  // Auth
  if (p === '/auth/login') return 'Đăng nhập vào hệ thống';
  if (p === '/auth/logout') return 'Đăng xuất khỏi hệ thống';
  if (p === '/auth/refresh') return 'Làm mới Access Token';
  if (p === '/auth/me') return 'Lấy thông tin tài khoản hiện tại';
  if (p === '/auth/mobile-challenge') return 'Trang HTML xác thực Cloudflare Turnstile cho Mobile WebView';
  if (p === '/auth/verify-2fa') return 'Xác thực mã 2FA (TOTP)';
  if (p === '/auth/forgot-password') return 'Yêu cầu đặt lại mật khẩu qua Email';
  if (p === '/auth/verify-otp') return 'Xác thực mã OTP khôi phục mật khẩu';
  if (p === '/auth/reset-password') return 'Đặt mật khẩu mới sau khi xác thực OTP';
  if (p === '/auth/change-password') return 'Đổi mật khẩu người dùng';
  if (p === '/auth/2fa/request-enable') return 'Yêu cầu kích hoạt bảo mật 2FA (QR Code)';
  if (p === '/auth/2fa/confirm-enable') return 'Xác nhận kích hoạt 2FA';
  if (p === '/auth/2fa/disable') return 'Tắt xác thực 2FA';
  if (p === '/auth/sessions' && method === 'GET') return 'Danh sách các phiên làm việc đang hoạt động';
  if (p === '/auth/sessions/others' && method === 'DELETE') return 'Đăng xuất khỏi tất cả các thiết bị khác';
  if (p === '/auth/sessions/:sessionId' && method === 'DELETE') return 'Thu hồi một phiên làm việc cụ thể';
  if (p === '/auth/sessions' && method === 'DELETE') return 'Đăng xuất khỏi tất cả các thiết bị';

  // Accounts
  if (p === '/accounts' && method === 'GET') return 'Danh sách tài khoản người dùng';
  if (p === '/accounts' && method === 'POST') return 'Tạo tài khoản người dùng mới';
  if (p === '/accounts/:id' && method === 'GET') return 'Chi tiết tài khoản';
  if (p === '/accounts/:id' && method === 'PATCH') return 'Cập nhật thông tin tài khoản';
  if (p === '/accounts/:id/status' && method === 'PATCH') return 'Khóa hoặc mở khóa tài khoản';
  if (p === '/accounts/:id/reset-password' && method === 'POST') return 'BGH đặt lại mật khẩu cho tài khoản';
  if (p === '/accounts/:id' && method === 'DELETE') return 'Xóa tài khoản người dùng';

  // Students
  if (p === '/students' && method === 'GET') return 'Danh sách học sinh toàn trường';
  if (p === '/students' && method === 'POST') return 'Tiếp nhận hồ sơ học sinh mới';
  if (p === '/students/:id' && method === 'GET') return 'Chi tiết hồ sơ học sinh';
  if (p === '/students/:id' && method === 'PATCH') return 'Cập nhật hồ sơ học sinh';
  if (p === '/students/:id' && method === 'DELETE') return 'Xóa hồ sơ học sinh';
  if (p === '/students/:id/enroll' && method === 'POST') return 'Xếp lớp cho học sinh';
  if (p === '/students/:id/transfer' && method === 'POST') return 'Chuyển lớp học sinh';
  if (p === '/students/:id/parents' && method === 'POST') return 'Thêm phụ huynh / người giám hộ cho học sinh';
  if (p === '/students/:id/parents/:parentId' && method === 'PATCH') return 'Cập nhật thông tin phụ huynh';
  if (p === '/students/:id/parents/:parentId' && method === 'DELETE') return 'Xóa liên kết phụ huynh của học sinh';

  // Classes
  if (p === '/classes' && method === 'GET') return 'Danh sách lớp học';
  if (p === '/classes' && method === 'POST') return 'Mở lớp học mới';
  if (p === '/classes/:id' && method === 'GET') return 'Chi tiết lớp học';
  if (p === '/classes/:id' && method === 'PATCH') return 'Cập nhật thông tin lớp học';
  if (p === '/classes/:id' && method === 'DELETE') return 'Xóa lớp học';
  if (p === '/classes/:id/teachers' && method === 'GET') return 'Danh sách giáo viên phân công phụ trách lớp';
  if (p === '/classes/:id/teachers' && method === 'POST') return 'Phân công giáo viên vào lớp';
  if (p === '/classes/:id/teachers/:teacherId/role' && method === 'PATCH') return 'Cập nhật vai trò giáo viên (Chủ nhiệm/Phó chủ nhiệm)';
  if (p === '/classes/:id/teachers/:teacherId' && method === 'DELETE') return 'Rút phân công giáo viên khỏi lớp';
  if (p === '/classes/:id/students' && method === 'GET') return 'Danh sách học sinh hiện tại của lớp';
  if (p === '/classes/:id/students' && method === 'POST') return 'Phân bổ học sinh vào lớp';
  if (p === '/classes/:id/students' && method === 'DELETE') return 'Gỡ bỏ nhiều học sinh khỏi lớp';
  if (p === '/classes/:id/students/:studentId' && method === 'DELETE') return 'Rút một học sinh khỏi lớp';
  if (p === '/classes/:id/students/:studentId/graduate' && method === 'POST') return 'Xét tốt nghiệp/hoàn thành khóa học cho học sinh';
  if (p === '/classes/:id/student-pool' && method === 'GET') return 'Danh sách học sinh chờ xếp lớp (Student Pool)';
  if (p === '/classes/:id/student-report' && method === 'GET') return 'Báo cáo tổng hợp tình hình học sinh trong lớp';
  if (p === '/classes/:id/daily-report' && method === 'GET') return 'Xem sổ theo dõi nhật ký hàng ngày của lớp';
  if (p === '/classes/:id/daily-report/student' && method === 'PUT') return 'Cập nhật nhật ký ngày cho một học sinh';
  if (p === '/classes/:id/daily-report/batch' && method === 'POST') return 'Lưu nhật ký ngày hàng loạt cho cả lớp';
  if (p === '/classes/:id/history-sources' && method === 'GET') return 'Lấy danh sách lớp nguồn trong lịch sử';
  if (p === '/classes/:id/history-students' && method === 'GET') return 'Lấy danh sách học sinh từ niên khóa trước';
  if (p === '/classes/:id/import-students' && method === 'POST') return 'Chuyển học sinh từ lớp cũ sang lớp mới';
  if (p === '/classes/:id/transfers' && method === 'GET') return 'Danh sách yêu cầu chuyển lớp của lớp học';
  if (p === '/classes/:id/transfers' && method === 'POST') return 'Tạo yêu cầu chuyển lớp cho học sinh';
  if (p === '/classes/:id/transfers/:transferId' && method === 'PATCH') return 'Phê duyệt chuyển lớp';
  if (p === '/classes/:id/transfers/:transferId/reject' && method === 'PATCH') return 'Từ chối yêu cầu chuyển lớp';
  if (p === '/classes/:id/transfers/:transferId/cancel' && method === 'PATCH') return 'Hủy yêu cầu chuyển lớp';
  if (p === '/classes/:id/export-data' && method === 'GET') return 'Xuất dữ liệu danh sách học sinh lớp (Excel format)';
  if (p === '/classes/transfers/all' && method === 'GET') return 'Toàn bộ yêu cầu chuyển lớp trong trường (BGH)';
  if (p === '/classes/transfers/:transferId' && method === 'GET') return 'Chi tiết đơn xin chuyển lớp';
  if (p === '/classes/transfers' && method === 'POST') return 'BGH tạo yêu cầu điều chuyển học sinh';
  if (p === '/classes/transfers/:transferId' && method === 'PATCH') return 'Cập nhật trạng thái đơn chuyển lớp';
  if (p === '/classes/transfers/:transferId/reject' && method === 'PATCH') return 'BGH từ chối đơn chuyển lớp';
  if (p === '/classes/transfers/:transferId/cancel' && method === 'PATCH') return 'Hủy đơn chuyển lớp';

  // Attendance
  if (p === '/attendance/classes/:classId/timetable') return 'Lấy lịch điểm danh & thời khóa biểu lớp';
  if (p === '/attendance/classes/:classId/records' && method === 'POST') return 'Lưu dữ liệu điểm danh đến lớp';
  if (p === '/attendance/classes/:classId/records' && method === 'DELETE') return 'Hủy / xóa dữ liệu điểm danh';
  if (p === '/attendance/classes/:classId/dismissal' && method === 'GET') return 'Danh sách đón trẻ và trả trẻ buổi chiều';
  if (p === '/attendance/classes/:classId/dismissal' && method === 'POST') return 'Ghi nhận trả trẻ (kèm ảnh/người đón)';
  if (p === '/attendance/classes/:classId/dismissal' && method === 'DELETE') return 'Hủy xác nhận trả trẻ';
  if (p === '/attendance/classes/:classId/dismissal/:studentId' && method === 'DELETE') return 'Hủy xác nhận trả trẻ cho 1 học sinh';
  if (p === '/attendance/classes/:classId/authorizations' && method === 'GET') return 'Danh sách ủy quyền đưa đón trẻ';
  if (p === '/attendance/classes/:classId/authorizations' && method === 'POST') return 'Tạo giấy ủy quyền người đón mới';
  if (p.includes('/authorizations/') && p.endsWith('/approve')) return 'Phê duyệt giấy ủy quyền đưa đón';
  if (p.includes('/authorizations/') && p.endsWith('/reject')) return 'Từ chối giấy ủy quyền đưa đón';

  // Health
  if (p === '/health/classes/:classId' && method === 'GET') return 'Tổng quan theo dõi sức khỏe học sinh của lớp';
  if (p === '/health/classes/:classId/records' && method === 'POST') return 'Ghi nhận chỉ số chiều cao, cân nặng và thể trạng';
  if (p === '/health/classes/:classId/records' && method === 'DELETE') return 'Xóa hồ sơ kiểm tra sức khỏe';

  // Planning
  if (p.includes('/activities') && method === 'GET') return 'Danh sách hoạt động giáo dục theo chủ đề';
  if (p.includes('/activities') && method === 'POST') return 'Thêm hoặc lưu hoạt động giáo dục';
  if (p.includes('/activities/:activityId') && method === 'DELETE') return 'Xóa hoạt động giáo dục';
  if (p.includes('/timetable') && method === 'GET') return 'Thời khóa biểu tuần của lớp học';
  if (p.includes('/assign-activity') && method === 'POST') return 'Gán hoạt động giáo dục vào tiết học';
  if (p.includes('/timetable/slots') && method === 'POST') return 'Tạo hoặc cập nhật khung giờ tiết học';
  if (p.includes('/timetable/reorder') && method === 'POST') return 'Sắp xếp lại thứ tự các tiết học trong tuần';
  if (p.includes('/timetable/slots/') && method === 'DELETE') return 'Xóa khung giờ tiết học';
  if (p.includes('/allocation') && method === 'GET') return 'Xem bảng phân bổ mục tiêu giáo dục';
  if (p.includes('/allocation') && method === 'POST') return 'Lưu phân bổ mục tiêu giáo dục';
  if (p.includes('/allocation/publish') && method === 'POST') return 'Phát hành / công bố kế hoạch giáo dục';
  if (p === '/planning/ai/allocation') return 'AI gợi ý phân bổ mục tiêu giáo dục';
  if (p === '/planning/ai/generate-activity') return 'AI tự động soạn thảo giáo án hoạt động';

  // Curriculum
  if (p === '/curriculum/themes/overview') return 'Tổng quan danh mục chủ đề giáo dục toàn trường';
  if (p === '/curriculum/themes/detail' && method === 'GET') return 'Chi tiết bộ chủ đề và nhánh chủ đề';
  if (p === '/curriculum/themes/status' && method === 'PATCH') return 'Cập nhật trạng thái bộ chủ đề (Draft/Active)';
  if (p === '/curriculum/themes/detail' && method === 'PUT') return 'Cập nhật nội dung bộ chủ đề';
  if (p === '/curriculum/goals/overview') return 'Tổng quan ngân hàng mục tiêu giáo dục';
  if (p === '/curriculum/goals/detail') return 'Chi tiết ngân hàng mục tiêu theo khối lớp';
  if (p === '/curriculum/goals/status') return 'Kích hoạt hoặc đóng ngân hàng mục tiêu';
  if (p === '/curriculum/goals/single-detail' && method === 'GET') return 'Xem chi tiết 1 mục tiêu giáo dục cụ thể';
  if (p === '/curriculum/goals/single-detail/contents' && method === 'PUT') return 'Cập nhật nội dung chi tiết mục tiêu';
  if (p === '/curriculum/goals/item' && method === 'POST') return 'Tạo mục tiêu giáo dục mới';
  if (p === '/curriculum/goals/item' && method === 'PUT') return 'Cập nhật mục tiêu giáo dục';
  if (p === '/curriculum/goals/item' && method === 'DELETE') return 'Xóa mục tiêu giáo dục';
  if (p === '/curriculum/goals/ai-assistant') return 'Trợ lý AI hỗ trợ xây dựng mục tiêu bài học';

  // Teachers
  if (p === '/teachers' && method === 'GET') return 'Danh sách cán bộ giáo viên';
  if (p === '/teachers' && method === 'POST') return 'Thêm mới hồ sơ giáo viên';
  if (p === '/teachers/:id' && method === 'GET') return 'Chi tiết hồ sơ giáo viên';
  if (p === '/teachers/:id' && method === 'PATCH') return 'Cập nhật thông tin giáo viên';
  if (p === '/teachers/:id' && method === 'DELETE') return 'Xóa giáo viên';
  if (p === '/teachers/:id/classes' && method === 'POST') return 'Phân công giáo viên phụ trách lớp học';
  if (p === '/teachers/:id/classes/:classId' && method === 'DELETE') return 'Rút phân công giáo viên khỏi lớp học';

  // School Years
  if (p === '/school-years' && method === 'GET') return 'Danh sách các năm học';
  if (p === '/school-years' && method === 'POST') return 'Khởi tạo năm học mới';
  if (p === '/school-years/active') return 'Lấy thông tin năm học đang kích hoạt';
  if (p === '/school-years/:id' && method === 'GET') return 'Chi tiết năm học';
  if (p === '/school-years/:id' && method === 'PATCH') return 'Cập nhật năm học';
  if (p === '/school-years/:id/activate') return 'Kích hoạt năm học hiện hành';
  if (p === '/school-years/:id/complete') return 'Đóng / hoàn thành năm học';
  if (p === '/school-years/:id' && method === 'DELETE') return 'Xóa năm học';
  if (p.includes('/transition-readiness')) return 'Kiểm tra điều kiện chuyển giao niên khóa';
  if (p.includes('/close-enrollments')) return 'Đóng danh sách tuyển sinh niên khóa cũ';
  if (p.includes('/execute-transition')) return 'Thực thi chuyển giao dữ liệu sang niên khóa mới';
  if (p.includes('/holidays') && method === 'GET') return 'Danh sách ngày nghỉ lễ, tết';
  if (p.includes('/holidays') && method === 'POST') return 'Thêm ngày nghỉ lễ';
  if (p.includes('/holidays/import') && method === 'POST') return 'Nhập lịch nghỉ lễ mặc định của Nhà nước';
  if (p.includes('/holidays/') && method === 'PATCH') return 'Cập nhật ngày nghỉ lễ';
  if (p.includes('/holidays/') && method === 'DELETE') return 'Xóa ngày nghỉ lễ';

  // Assessment
  if (p.includes('/records') && method === 'GET') return 'Xem kết quả đánh giá hoạt động học tập';
  if (p.includes('/records') && method === 'POST') return 'Ghi nhận đánh giá hoạt động học tập của trẻ';
  if (p.includes('/records') && method === 'DELETE') return 'Xóa kết quả đánh giá hoạt động';
  if (p === '/assessment/classes/:classId' && method === 'GET') return 'Tổng quan tình hình đánh giá lớp học';
  if (p.includes('/monthly') && method === 'GET') return 'Danh sách đánh giá bé ngoan theo tháng (TT28)';
  if (p.includes('/monthly') && method === 'POST') return 'Lưu kết quả đánh giá bé ngoan tháng';
  if (p.includes('/semester') && method === 'GET') return 'Danh sách đánh giá cuối học kỳ theo chuẩn GDMN';
  if (p.includes('/semester') && method === 'POST') return 'Lưu đánh giá cuối học kỳ';

  // Good Behavior
  if (p === '/good-behavior/classes/:classId' && method === 'GET') return 'Sổ theo dõi bé ngoan và sao rèn luyện';
  if (p === '/good-behavior/classes/:classId/records' && method === 'POST') return 'Ghi nhận sao và lời khen cho học sinh';

  // Parent Portal
  if (p === '/parent/home') return 'Màn hình trang chủ phụ huynh (Tin tức, tổng quan con)';
  if (p === '/parent/schedule') return 'Xem lịch học và thực đơn hàng tuần của bé';
  if (p === '/parent/profile') return 'Xem hồ sơ phụ huynh và danh sách các con đang theo học';
  if (p === '/parent/requests') return 'Danh sách các đơn xin nghỉ, đơn ủy quyền đã gửi';
  if (p === '/parent/requests/pickup' && method === 'POST') return 'Gửi đơn nhờ người thân đưa đón hộ';
  if (p.includes('/cancel') && method === 'POST') return 'Hủy đơn đưa đón';
  if (p === '/parent/good-behavior' && method === 'GET') return 'Xem hoa bé ngoan và nhận xét của cô giáo';
  if (p === '/parent/good-behavior/feedback' && method === 'POST') return 'Phụ huynh gửi lời cảm ơn / phản hồi nhận xét';
  if (p === '/parent/notifications') return 'Danh sách thông báo gửi đến phụ huynh';
  if (p.includes('/read') && method === 'PATCH') return 'Đánh dấu thông báo đã đọc';

  // Upload
  if (p === '/upload/avatar') return 'Tải ảnh đại diện (Avatar) cho giáo viên, học sinh';
  if (p === '/upload/pickup') return 'Tải ảnh người đưa đón ủy quyền';

  return `${method} ${fullPath}`;
}

// Convert express path '/classes/:id/students/:studentId' -> '/classes/{id}/students/{studentId}'
function toOpenApiPath(p) {
  return p.replace(/:([a-zA-Z0-9_]+)/g, '{$1}');
}

// Extract path parameter names
function extractPathParams(p) {
  const matches = p.match(/:([a-zA-Z0-9_]+)/g);
  if (!matches) return [];
  return matches.map(m => m.replace(':', ''));
}

// Helper to determine Request Schema
function getRequestSchemaRef(fullPath, method) {
  const p = fullPath;
  const m = method.toUpperCase();

  if (p === '/auth/login') return '#/components/schemas/LoginRequest';
  if (p === '/auth/verify-2fa') return '#/components/schemas/Verify2FARequest';
  if (p === '/auth/forgot-password') return '#/components/schemas/ForgotPasswordRequest';
  if (p === '/auth/verify-otp') return '#/components/schemas/VerifyOtpRequest';
  if (p === '/auth/reset-password') return '#/components/schemas/ResetPasswordRequest';
  if (p === '/auth/change-password') return '#/components/schemas/ChangePasswordRequest';

  if (p === '/accounts' && m === 'POST') return '#/components/schemas/CreateAccountRequest';
  if (p.startsWith('/accounts/') && m === 'PATCH') return '#/components/schemas/UpdateAccountRequest';
  if (p.endsWith('/reset-password') && p.startsWith('/accounts/') && m === 'POST') return '#/components/schemas/ResetPasswordAdminRequest';

  if (p === '/students' && m === 'POST') return '#/components/schemas/CreateStudentRequest';
  if (p.startsWith('/students/') && !p.includes('/parents') && m === 'PATCH') return '#/components/schemas/UpdateStudentRequest';
  if (p.endsWith('/enroll') && m === 'POST') return '#/components/schemas/EnrollStudentRequest';
  if (p.endsWith('/transfer') && m === 'POST') return '#/components/schemas/TransferStudentRequest';
  if (p.includes('/parents') && m === 'POST') return '#/components/schemas/CreateParentRequest';
  if (p.includes('/parents/') && m === 'PATCH') return '#/components/schemas/UpdateParentRequest';

  if (p === '/classes' && m === 'POST') return '#/components/schemas/CreateClassRequest';
  if (p.startsWith('/classes/') && !p.includes('/students') && !p.includes('/teachers') && m === 'PATCH') return '#/components/schemas/UpdateClassRequest';
  if (p.includes('/teachers') && m === 'POST') return '#/components/schemas/AssignTeacherClassRequest';
  if (p.includes('/students') && m === 'POST' && !p.includes('/import-students')) return '#/components/schemas/AllocateStudentsRequest';
  if (p.includes('/transfers') && m === 'POST') return '#/components/schemas/CreateTransferRequest';

  if (p === '/teachers' && m === 'POST') return '#/components/schemas/CreateTeacherRequest';
  if (p.startsWith('/teachers/') && m === 'PATCH') return '#/components/schemas/UpdateTeacherRequest';
  if (p.includes('/teachers/') && p.includes('/classes') && m === 'POST') return '#/components/schemas/AssignTeacherClassRequest';

  if (p === '/school-years' && m === 'POST') return '#/components/schemas/CreateSchoolYearRequest';
  if (p.startsWith('/school-years/') && m === 'PATCH') return '#/components/schemas/UpdateSchoolYearRequest';
  if (p.includes('/holidays') && m === 'POST') return '#/components/schemas/CreateHolidayRequest';

  if (p.includes('/attendance') && p.includes('/records') && m === 'POST') return '#/components/schemas/SaveAttendanceBatchRequest';
  if (p.includes('/attendance') && p.includes('/dismissal') && m === 'POST') return '#/components/schemas/SaveDismissalRequest';
  if (p.includes('/attendance') && p.includes('/authorizations') && m === 'POST') return '#/components/schemas/CreatePickupAuthorizationRequest';

  if (p.includes('/health') && p.includes('/records') && m === 'POST') return '#/components/schemas/SaveHealthRecordBatchRequest';

  if (p.includes('/planning') && p.includes('/activities') && m === 'POST') return '#/components/schemas/CreateEducationalActivityRequest';
  if (p.includes('/curriculum/goals/item') && (m === 'POST' || m === 'PUT')) return '#/components/schemas/CreateEducationalGoalRequest';

  if (p.includes('/assessment') && p.includes('/records') && m === 'POST') return '#/components/schemas/SaveDailyAssessmentBatchRequest';
  if (p.includes('/assessment') && p.includes('/monthly') && m === 'POST') return '#/components/schemas/SaveMonthlyAssessmentBatchRequest';
  if (p.includes('/assessment') && p.includes('/semester') && m === 'POST') return '#/components/schemas/SaveSemesterAssessmentBatchRequest';

  if (p.includes('/good-behavior') && p.includes('/records') && m === 'POST') return '#/components/schemas/SaveGoodBehaviorBatchRequest';
  if (p.includes('/parent/requests/pickup') && m === 'POST') return '#/components/schemas/CreatePickupAuthorizationRequest';

  return null;
}

// Build paths object
const paths = {
  '/health': {
    get: {
      tags: ['System'],
      summary: 'Kiểm tra trạng thái máy chủ (Health Check)',
      description: 'Trả về trạng thái hoạt động và thời gian uptime của hệ thống Sorak.',
      responses: {
        '200': {
          description: 'Máy chủ hoạt động bình thường',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/HealthResponse' },
            },
          },
        },
      },
    },
  },
};

for (const r of routes) {
  const openPath = toOpenApiPath(r.fullPath);
  const method = r.method.toLowerCase();
  const tag = fileToTag[r.file] || 'Other';
  const summary = generateSummary(r);
  const pathParams = extractPathParams(r.fullPath);

  if (!paths[openPath]) {
    paths[openPath] = {};
  }

  const parameters = [];
  for (const pp of pathParams) {
    parameters.push({
      name: pp,
      in: 'path',
      required: true,
      schema: { type: 'string' },
      description: `Mã định danh ${pp}`,
    });
  }

  // Add query parameters for common listing endpoints
  if (method === 'get' && (openPath.endsWith('/students') || openPath.endsWith('/classes') || openPath.endsWith('/teachers') || openPath.endsWith('/accounts') || openPath.endsWith('/school-years'))) {
    parameters.push({
      name: 'page',
      in: 'query',
      schema: { type: 'integer', default: 1 },
      description: 'Số trang',
    });
    parameters.push({
      name: 'limit',
      in: 'query',
      schema: { type: 'integer', default: 20 },
      description: 'Số bản ghi mỗi trang',
    });
    parameters.push({
      name: 'search',
      in: 'query',
      schema: { type: 'string' },
      description: 'Từ khóa tìm kiếm',
    });
  }

  const isPublic = (r.fullPath === '/auth/login' || r.fullPath === '/auth/mobile-challenge' || r.fullPath === '/auth/forgot-password' || r.fullPath === '/auth/verify-otp' || r.fullPath === '/auth/reset-password' || r.fullPath === '/auth/refresh');

  const op = {
    tags: [tag],
    summary,
    description: `Endpoint API nghiệp vụ cho chức năng **${summary}** thuộc phân hệ **${tag}**.`,
    ...(isPublic ? {} : { security: [{ bearerAuth: [] }] }),
    ...(parameters.length > 0 ? { parameters } : {}),
  };

  if (method === 'post' || method === 'put' || method === 'patch') {
    if (r.fullPath === '/upload/avatar' || r.fullPath === '/upload/pickup') {
      op.requestBody = {
        required: true,
        content: {
          'multipart/form-data': {
            schema: {
              type: 'object',
              properties: {
                file: {
                  type: 'string',
                  format: 'binary',
                  description: 'File hình ảnh cần tải lên',
                },
              },
            },
          },
        },
      };
    } else {
      const schemaRef = getRequestSchemaRef(r.fullPath, method);
      if (schemaRef) {
        op.requestBody = {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: schemaRef },
            },
          },
        };
      } else {
        op.requestBody = {
          required: false,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                description: 'Dữ liệu payload gửi lên server',
              },
            },
          },
        };
      }
    }
  }

  if (r.fullPath === '/auth/mobile-challenge') {
    op.responses = {
      '200': {
        description: 'Trang HTML giao diện Cloudflare Turnstile cho Mobile WebView',
        content: {
          'text/html': {
            schema: { type: 'string' },
          },
        },
      },
    };
  } else {
    op.responses = {
      '200': {
        description: 'Thao tác thành công',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                success: { type: 'boolean', example: true },
                data: { type: 'object' },
              },
            },
          },
        },
      },
      '400': {
        description: 'Dữ liệu không hợp lệ (Validation Error)',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorResponse' },
          },
        },
      },
      ...(isPublic ? {} : {
        '401': {
          description: 'Chưa xác thực hoặc Token đã hết hạn',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ErrorResponse' },
            },
          },
        },
        '403': {
          description: 'Không đủ quyền hạn truy cập (Forbidden)',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ErrorResponse' },
            },
          },
        },
      }),
    };
  }

  paths[openPath][method] = op;
}

// Comprehensive Component Schemas (Prisma 3NF Entities & Request DTOs)
const componentsSchemas = {
  // Generic Wrappers
  HealthResponse: {
    type: 'object',
    properties: {
      success: { type: 'boolean', example: true },
      data: {
        type: 'object',
        properties: {
          status: { type: 'string', example: 'ok' },
          uptime: { type: 'number', example: 1250.4 },
        },
      },
    },
  },
  ErrorResponse: {
    type: 'object',
    properties: {
      success: { type: 'boolean', example: false },
      error: {
        type: 'object',
        properties: {
          code: { type: 'string', example: 'VALIDATION_ERROR' },
          message: { type: 'string', example: 'Thông báo lỗi chi tiết từ server' },
          details: { type: 'object' },
        },
      },
    },
  },

  // 1. Auth Schemas
  LoginRequest: {
    type: 'object',
    required: ['username', 'password'],
    properties: {
      username: { type: 'string', example: 'BGH001', description: 'Tên đăng nhập hoặc Email' },
      password: { type: 'string', format: 'password', example: 'Sorak@2026', description: 'Mật khẩu tài khoản' },
      turnstileToken: { type: 'string', example: 'sorak-mobile-bypass', description: 'Token xác thực Cloudflare Turnstile' },
    },
  },
  Verify2FARequest: {
    type: 'object',
    required: ['tempToken', 'totpCode'],
    properties: {
      tempToken: { type: 'string', example: 'eyJhbGciOiJIUzI1Ni...' },
      totpCode: { type: 'string', example: '123456' },
    },
  },
  ForgotPasswordRequest: {
    type: 'object',
    required: ['email'],
    properties: {
      email: { type: 'string', format: 'email', example: 'admin@mamnonhontre.sorak.io.vn' },
    },
  },
  VerifyOtpRequest: {
    type: 'object',
    required: ['email', 'otp'],
    properties: {
      email: { type: 'string', format: 'email', example: 'admin@mamnonhontre.sorak.io.vn' },
      otp: { type: 'string', example: '654321' },
    },
  },
  ResetPasswordRequest: {
    type: 'object',
    required: ['resetToken', 'newPassword'],
    properties: {
      resetToken: { type: 'string', example: 'tok_rst_xyz123' },
      newPassword: { type: 'string', format: 'password', example: 'NewSecret@2026' },
    },
  },
  ChangePasswordRequest: {
    type: 'object',
    required: ['oldPassword', 'newPassword'],
    properties: {
      oldPassword: { type: 'string', format: 'password', example: 'Sorak@2026' },
      newPassword: { type: 'string', format: 'password', example: 'NewSecret@2026' },
    },
  },

  // 2. Account Schemas
  AccountEntity: {
    type: 'object',
    properties: {
      id: { type: 'string', example: 'usr_1001' },
      username: { type: 'string', example: 'gvhontre' },
      role: { type: 'string', enum: ['PRINCIPAL_BGH', 'TEACHER_GV', 'PARENT_PH'], example: 'TEACHER_GV' },
      isActive: { type: 'boolean', example: true },
      is2faEnabled: { type: 'boolean', example: false },
      createdAt: { type: 'string', format: 'date-time', example: '2026-09-01T08:00:00Z' },
    },
  },
  CreateAccountRequest: {
    type: 'object',
    required: ['username', 'password', 'role'],
    properties: {
      username: { type: 'string', example: 'gvhontre02' },
      password: { type: 'string', format: 'password', example: 'Sorak@2026' },
      role: { type: 'string', enum: ['PRINCIPAL_BGH', 'TEACHER_GV', 'PARENT_PH'], example: 'TEACHER_GV' },
      fullName: { type: 'string', example: 'Lê Thị Thu Thảo' },
      email: { type: 'string', format: 'email', example: 'thuthao@mamnonhontre.sorak.io.vn' },
      phone: { type: 'string', example: '0912345678' },
    },
  },
  UpdateAccountRequest: {
    type: 'object',
    properties: {
      role: { type: 'string', enum: ['PRINCIPAL_BGH', 'TEACHER_GV', 'PARENT_PH'] },
      fullName: { type: 'string', example: 'Lê Thị Thu Thảo' },
      email: { type: 'string', format: 'email' },
      phone: { type: 'string' },
    },
  },
  ResetPasswordAdminRequest: {
    type: 'object',
    required: ['newPassword'],
    properties: {
      newPassword: { type: 'string', format: 'password', example: 'Sorak@2026' },
    },
  },

  // 3. Student Schemas
  StudentEntity: {
    type: 'object',
    properties: {
      id: { type: 'string', example: 'stu_1001' },
      studentCode: { type: 'string', example: 'SORAK-2026-001' },
      fullName: { type: 'string', example: 'Trần Gia Bảo' },
      dateOfBirth: { type: 'string', format: 'date', example: '2021-05-15' },
      gender: { type: 'string', enum: ['MALE', 'FEMALE'], example: 'MALE' },
      ethnicity: { type: 'string', example: 'Kinh' },
      address: { type: 'string', example: 'Xã Hòn Tre, Kiên Hải, Kiên Giang' },
      status: { type: 'string', enum: ['STUDYING', 'SUSPENDED', 'DROPPED', 'GRADUATED'], example: 'STUDYING' },
      className: { type: 'string', example: 'Lớp Chồi 1' },
    },
  },
  CreateStudentRequest: {
    type: 'object',
    required: ['fullName', 'dateOfBirth', 'gender'],
    properties: {
      fullName: { type: 'string', example: 'Trần Gia Bảo' },
      dateOfBirth: { type: 'string', format: 'date', example: '2021-05-15' },
      gender: { type: 'string', enum: ['MALE', 'FEMALE'], example: 'MALE' },
      ethnicity: { type: 'string', default: 'Kinh' },
      address: { type: 'string', example: 'Hòn Tre, Kiên Giang' },
      classId: { type: 'string', example: 'cls_choi_01' },
    },
  },
  UpdateStudentRequest: {
    type: 'object',
    properties: {
      fullName: { type: 'string' },
      dateOfBirth: { type: 'string', format: 'date' },
      gender: { type: 'string', enum: ['MALE', 'FEMALE'] },
      address: { type: 'string' },
      status: { type: 'string', enum: ['STUDYING', 'SUSPENDED', 'DROPPED', 'GRADUATED'] },
    },
  },
  EnrollStudentRequest: {
    type: 'object',
    required: ['classId'],
    properties: {
      classId: { type: 'string', example: 'cls_choi_01' },
    },
  },
  TransferStudentRequest: {
    type: 'object',
    required: ['toClassId', 'reason'],
    properties: {
      toClassId: { type: 'string', example: 'cls_choi_02' },
      reason: { type: 'string', example: 'Chuyển theo nguyện vọng gia đình' },
    },
  },

  // 4. Parent Schemas
  ParentEntity: {
    type: 'object',
    properties: {
      id: { type: 'string', example: 'prn_1001' },
      fullName: { type: 'string', example: 'Trần Văn Nam' },
      relationship: { type: 'string', example: 'FATHER' },
      phone: { type: 'string', example: '0988776655' },
      email: { type: 'string', example: 'namtran@gmail.com' },
      isPrimaryContact: { type: 'boolean', example: true },
    },
  },
  CreateParentRequest: {
    type: 'object',
    required: ['fullName', 'relationship', 'phone'],
    properties: {
      fullName: { type: 'string', example: 'Trần Văn Nam' },
      relationship: { type: 'string', example: 'FATHER' },
      phone: { type: 'string', example: '0988776655' },
      email: { type: 'string', format: 'email', example: 'namtran@gmail.com' },
      isPrimaryContact: { type: 'boolean', default: true },
    },
  },
  UpdateParentRequest: {
    type: 'object',
    properties: {
      fullName: { type: 'string' },
      relationship: { type: 'string' },
      phone: { type: 'string' },
      email: { type: 'string', format: 'email' },
      isPrimaryContact: { type: 'boolean' },
    },
  },

  // 5. Class Schemas
  ClassEntity: {
    type: 'object',
    properties: {
      id: { type: 'string', example: 'cls_choi_01' },
      name: { type: 'string', example: 'Lớp Chồi 1' },
      ageGroup: { type: 'string', enum: ['NURSERY_NHA_TRE', 'JUNIOR_MAM', 'MIDDLE_CHOI', 'SENIOR_LA'], example: 'MIDDLE_CHOI' },
      roomNumber: { type: 'string', example: 'Phòng 201' },
      maxCapacity: { type: 'integer', example: 30 },
      currentStudents: { type: 'integer', example: 25 },
      schoolYearId: { type: 'string', example: 'sy_2026_2027' },
    },
  },
  CreateClassRequest: {
    type: 'object',
    required: ['name', 'ageGroup', 'schoolYearId'],
    properties: {
      name: { type: 'string', example: 'Lớp Lá 2' },
      ageGroup: { type: 'string', enum: ['NURSERY_NHA_TRE', 'JUNIOR_MAM', 'MIDDLE_CHOI', 'SENIOR_LA'], example: 'SENIOR_LA' },
      schoolYearId: { type: 'string', example: 'sy_2026_2027' },
      roomNumber: { type: 'string', example: 'Phòng 302' },
      maxCapacity: { type: 'integer', default: 30 },
    },
  },
  UpdateClassRequest: {
    type: 'object',
    properties: {
      name: { type: 'string' },
      roomNumber: { type: 'string' },
      maxCapacity: { type: 'integer' },
    },
  },
  AssignTeacherClassRequest: {
    type: 'object',
    required: ['teacherId', 'roleInClass'],
    properties: {
      teacherId: { type: 'string', example: 'tch_1001' },
      roleInClass: { type: 'string', enum: ['HEAD_TEACHER', 'ASSISTANT_TEACHER'], example: 'HEAD_TEACHER' },
    },
  },
  AllocateStudentsRequest: {
    type: 'object',
    required: ['studentIds'],
    properties: {
      studentIds: {
        type: 'array',
        items: { type: 'string' },
        example: ['stu_1001', 'stu_1002', 'stu_1003'],
      },
    },
  },
  CreateTransferRequest: {
    type: 'object',
    required: ['studentId', 'toClassId', 'reason'],
    properties: {
      studentId: { type: 'string', example: 'stu_1001' },
      toClassId: { type: 'string', example: 'cls_la_02' },
      reason: { type: 'string', example: 'Điều chuyển theo độ tuổi và quy mô phòng học' },
    },
  },

  // 6. Teacher Schemas
  TeacherEntity: {
    type: 'object',
    properties: {
      id: { type: 'string', example: 'tch_1001' },
      teacherCode: { type: 'string', example: 'GV-001' },
      fullName: { type: 'string', example: 'Nguyễn Thị Thu Cúc' },
      gender: { type: 'string', enum: ['MALE', 'FEMALE'], example: 'FEMALE' },
      phone: { type: 'string', example: '0901234567' },
      email: { type: 'string', example: 'thucuc@mamnonhontre.sorak.io.vn' },
      qualification: { type: 'string', example: 'Đại học Sư phạm Mầm non' },
      workStatus: { type: 'string', enum: ['WORKING', 'LEAVE_OF_ABSENCE', 'RESIGNED'], example: 'WORKING' },
    },
  },
  CreateTeacherRequest: {
    type: 'object',
    required: ['teacherCode', 'fullName', 'phone'],
    properties: {
      teacherCode: { type: 'string', example: 'GV-005' },
      fullName: { type: 'string', example: 'Trần Thị Mai' },
      gender: { type: 'string', enum: ['MALE', 'FEMALE'], default: 'FEMALE' },
      phone: { type: 'string', example: '0918765432' },
      email: { type: 'string', format: 'email', example: 'mai.tran@mamnonhontre.sorak.io.vn' },
      qualification: { type: 'string', example: 'Cử nhân Giáo dục Mầm non' },
    },
  },
  UpdateTeacherRequest: {
    type: 'object',
    properties: {
      fullName: { type: 'string' },
      phone: { type: 'string' },
      email: { type: 'string', format: 'email' },
      qualification: { type: 'string' },
      workStatus: { type: 'string', enum: ['WORKING', 'LEAVE_OF_ABSENCE', 'RESIGNED'] },
    },
  },

  // 7. School Year & Holiday Schemas
  SchoolYearEntity: {
    type: 'object',
    properties: {
      id: { type: 'string', example: 'sy_2026_2027' },
      name: { type: 'string', example: 'Năm học 2026 - 2027' },
      startDate: { type: 'string', format: 'date', example: '2026-09-01' },
      endDate: { type: 'string', format: 'date', example: '2027-05-31' },
      status: { type: 'string', enum: ['UPCOMING', 'ACTIVE', 'COMPLETED'], example: 'ACTIVE' },
    },
  },
  CreateSchoolYearRequest: {
    type: 'object',
    required: ['name', 'startDate', 'endDate'],
    properties: {
      name: { type: 'string', example: 'Năm học 2027 - 2028' },
      startDate: { type: 'string', format: 'date', example: '2027-09-01' },
      endDate: { type: 'string', format: 'date', example: '2028-05-31' },
    },
  },
  UpdateSchoolYearRequest: {
    type: 'object',
    properties: {
      name: { type: 'string' },
      startDate: { type: 'string', format: 'date' },
      endDate: { type: 'string', format: 'date' },
    },
  },
  CreateHolidayRequest: {
    type: 'object',
    required: ['holidayName', 'startDate', 'endDate'],
    properties: {
      holidayName: { type: 'string', example: 'Nghỉ Tết Nguyên Đán' },
      startDate: { type: 'string', format: 'date', example: '2027-02-05' },
      endDate: { type: 'string', format: 'date', example: '2027-02-15' },
      isRecurring: { type: 'boolean', default: false },
    },
  },

  // 8. Attendance & Dismissal Schemas
  AttendanceRecordItem: {
    type: 'object',
    required: ['studentId', 'status'],
    properties: {
      studentId: { type: 'string', example: 'stu_1001' },
      status: { type: 'string', enum: ['PRESENT', 'ABSENT_PERMITTED', 'ABSENT_UNPERMITTED'], example: 'PRESENT' },
      temperature: { type: 'number', example: 36.8 },
      absenceReason: { type: 'string', example: 'Bé bị ốm' },
      note: { type: 'string', example: 'Mẹ dặn cho bé uống nhiều nước' },
    },
  },
  SaveAttendanceBatchRequest: {
    type: 'object',
    required: ['date', 'records'],
    properties: {
      date: { type: 'string', format: 'date', example: '2026-11-03' },
      records: {
        type: 'array',
        items: { $ref: '#/components/schemas/AttendanceRecordItem' },
      },
    },
  },
  SaveDismissalRequest: {
    type: 'object',
    required: ['studentId', 'pickerName', 'relationship'],
    properties: {
      studentId: { type: 'string', example: 'stu_1001' },
      pickerName: { type: 'string', example: 'Bà Nguyễn Thị Lan' },
      relationship: { type: 'string', example: 'GRANDMOTHER' },
      pickupTime: { type: 'string', format: 'date-time', example: '2026-11-03T16:45:00Z' },
      photoUrl: { type: 'string', example: 'https://mamnonhontre.sorak.io.vn/uploads/pickup/pic_123.jpg' },
      notes: { type: 'string', example: 'Đã giao sổ bé ngoan cho bà' },
    },
  },
  CreatePickupAuthorizationRequest: {
    type: 'object',
    required: ['studentId', 'authorizedPersonName', 'phone', 'relationship'],
    properties: {
      studentId: { type: 'string', example: 'stu_1001' },
      authorizedPersonName: { type: 'string', example: 'Bác Lê Văn Hùng' },
      phone: { type: 'string', example: '0977889900' },
      relationship: { type: 'string', example: 'UNCLE' },
      photoUrl: { type: 'string', example: 'https://mamnonhontre.sorak.io.vn/uploads/auth/auth_pic_1.jpg' },
      notes: { type: 'string', example: 'Ủy quyền đón bé trong 3 ngày bố mẹ đi công tác' },
    },
  },

  // 9. Health Schemas
  HealthRecordItem: {
    type: 'object',
    required: ['studentId', 'heightCm', 'weightKg'],
    properties: {
      studentId: { type: 'string', example: 'stu_1001' },
      heightCm: { type: 'number', example: 102.5 },
      weightKg: { type: 'number', example: 16.2 },
      checkDate: { type: 'string', format: 'date', example: '2026-11-01' },
      healthStatus: { type: 'string', example: 'Bình thường, phát triển tốt' },
      notes: { type: 'string', example: 'Răng miệng sạch sẽ' },
    },
  },
  SaveHealthRecordBatchRequest: {
    type: 'object',
    required: ['records'],
    properties: {
      records: {
        type: 'array',
        items: { $ref: '#/components/schemas/HealthRecordItem' },
      },
    },
  },

  // 10. Planning & Curriculum Schemas
  CreateEducationalActivityRequest: {
    type: 'object',
    required: ['contentId', 'title', 'routineSlot'],
    properties: {
      contentId: { type: 'string', example: 'cnt_1001' },
      subThemeId: { type: 'string', example: 'sth_2001' },
      title: { type: 'string', example: 'Tạo hình: Xé dán cánh buồm' },
      routineSlot: {
        type: 'string',
        enum: ['ARRIVAL_PLAY', 'MORNING_EXERCISE', 'DIRECTED_STUDY', 'CORNER_PLAY', 'OUTDOOR_PLAY', 'HYGIENE_MEAL_SLEEP', 'AFTERNOON_ACTIVITY', 'RETURN_CHILD'],
        example: 'DIRECTED_STUDY',
      },
      objective: { type: 'string', example: 'Rèn luyện kỹ năng xé dải, xé bấm bằng ngón tay cái và ngón trỏ' },
      preparation: { type: 'string', example: 'Giấy màu, hồ dán, giấy A4 vẽ sẵn hình biển' },
      procedure: { type: 'string', example: '1. Ổn định và trò chuyện\n2. Cô hướng dẫn thao tác\n3. Trẻ thực hiện\n4. Trưng bày và nhận xét' },
      evaluationCriteria: { type: 'string', example: 'Trẻ dán được ít nhất 2 cánh buồm ngay ngắn' },
    },
  },
  CreateEducationalGoalRequest: {
    type: 'object',
    required: ['goalCode', 'domain', 'ageGroup', 'statement'],
    properties: {
      goalCode: { type: 'string', example: 'MT-TC-01' },
      domain: { type: 'string', enum: ['PHYSICAL', 'COGNITIVE', 'LANGUAGE', 'SOCIO_EMOTIONAL', 'AESTHETIC'], example: 'PHYSICAL' },
      ageGroup: { type: 'string', enum: ['NURSERY_NHA_TRE', 'JUNIOR_MAM', 'MIDDLE_CHOI', 'SENIOR_LA'], example: 'MIDDLE_CHOI' },
      statement: { type: 'string', example: 'Trẻ thực hiện được các vận động cơ bản: Đi, chạy, nhảy, tung bắt bóng' },
      isMandatory: { type: 'boolean', default: true },
    },
  },

  // 11. Assessment Schemas
  SaveDailyAssessmentBatchRequest: {
    type: 'object',
    required: ['activityId', 'date', 'records'],
    properties: {
      activityId: { type: 'string', example: 'act_1001' },
      date: { type: 'string', format: 'date', example: '2026-11-03' },
      records: {
        type: 'array',
        items: {
          type: 'object',
          required: ['studentId', 'status'],
          properties: {
            studentId: { type: 'string', example: 'stu_1001' },
            status: { type: 'string', enum: ['NOT_ACHIEVED', 'ACHIEVED', 'OUTSTANDING'], example: 'ACHIEVED' },
            note: { type: 'string', example: 'Bé xé dán rất khéo tay' },
          },
        },
      },
    },
  },
  SaveMonthlyAssessmentBatchRequest: {
    type: 'object',
    required: ['classId', 'month', 'year', 'records'],
    properties: {
      classId: { type: 'string', example: 'cls_choi_01' },
      month: { type: 'integer', example: 10 },
      year: { type: 'integer', example: 2026 },
      records: {
        type: 'array',
        items: {
          type: 'object',
          required: ['studentId', 'awardedStar'],
          properties: {
            studentId: { type: 'string', example: 'stu_1001' },
            criteriaScores: { type: 'object', example: { an_uong: true, le_phep: true, cham_chi: true } },
            awardedStar: { type: 'boolean', example: true },
            teacherNote: { type: 'string', example: 'Bé ngoan, chăm chỉ ăn hết suất' },
          },
        },
      },
    },
  },
  SaveSemesterAssessmentBatchRequest: {
    type: 'object',
    required: ['classId', 'semester', 'year', 'records'],
    properties: {
      classId: { type: 'string', example: 'cls_choi_01' },
      semester: { type: 'string', enum: ['SEMESTER_1', 'SEMESTER_2'], example: 'SEMESTER_1' },
      year: { type: 'integer', example: 2026 },
      records: {
        type: 'array',
        items: {
          type: 'object',
          required: ['studentId', 'overallResult'],
          properties: {
            studentId: { type: 'string', example: 'stu_1001' },
            overallResult: { type: 'string', enum: ['DAT_CHUAN', 'CHUA_DAT'], example: 'DAT_CHUAN' },
            summaryNote: { type: 'string', example: 'Đạt chuẩn phát triển 5 lĩnh vực theo độ tuổi' },
          },
        },
      },
    },
  },

  // 12. Good Behavior Schemas
  SaveGoodBehaviorBatchRequest: {
    type: 'object',
    required: ['classId', 'date', 'records'],
    properties: {
      classId: { type: 'string', example: 'cls_choi_01' },
      date: { type: 'string', format: 'date', example: '2026-11-03' },
      records: {
        type: 'array',
        items: {
          type: 'object',
          required: ['studentId', 'starsCount'],
          properties: {
            studentId: { type: 'string', example: 'stu_1001' },
            starsCount: { type: 'integer', example: 3 },
            compliment: { type: 'string', example: 'Hôm nay bé biết giúp bạn dọn đồ chơi' },
          },
        },
      },
    },
  },
};

const openapiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'Sorak Preschool Management System API',
    version: '1.0.0',
    description: `Tài liệu API đầy đủ và toàn diện của **Hệ thống Quản lý Trường Mầm non Sorak (Capstone SEP490)**.\nBao gồm toàn bộ **${routes.length} endpoints** thuộc 14 phân hệ nghiệp vụ và **${Object.keys(componentsSchemas).length} Schemas chi tiết** (Thực thể Prisma 3NF, Request DTOs và Response Wrappers).`,
  },
  servers: [
    { url: '/api', description: 'Current Server (Tự động thích ứng domain hiện tại)' },
    { url: 'https://mamnonhontre.sorak.io.vn/api', description: 'Production Server (HTTPS Domain chính thức)' },
    { url: 'http://103.69.191.210:8084/api', description: 'VPS Staging Port 8084 (HTTP Trực tiếp)' },
    { url: 'http://localhost:3000/api', description: 'Local Development Server' },
  ],
  tags: Object.keys(tagMeta).map(name => ({
    name,
    description: tagMeta[name],
  })),
  paths,
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Nhập Access Token lấy từ API /auth/login. Ví dụ: Bearer <token>',
      },
    },
    schemas: componentsSchemas,
  },
};

const yamlStr = YAML.stringify(openapiSpec);
fs.writeFileSync('./src/docs/openapi.yaml', yamlStr, 'utf8');
console.log('Successfully generated full openapi.yaml with ' + Object.keys(paths).length + ' distinct paths, ' + routes.length + ' operations, and ' + Object.keys(componentsSchemas).length + ' comprehensive schemas!');
