import prisma from '../config/prisma.js';
import {
  createStandardWorkbook,
  addSchoolHeaderBanner,
  applyHeaderStyles,
  applyZebraAndBorders,
  autoFitColumns,
} from '../utils/excel.helper.js';
import { NotFound, BadRequest } from '../utils/http-error.js';

export class GoodBehaviorExportService {
  /**
   * Helper tìm class theo ID hoặc Public ID
   */
  async _resolveClass(id) {
    if (!id) return null;
    const str = String(id).trim();
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
    return prisma.class.findFirst({
      where: {
        OR: [
          isUuid ? { public_id: str } : undefined,
          /^\d+$/.test(str) ? { class_id: BigInt(str) } : undefined,
        ].filter(Boolean),
        deleted_at: null,
      },
      include: {
        school_year: true,
        teacher_classes: {
          where: { left_at: null },
          include: { teacher: true },
        },
      },
    });
  }

  // ==========================================================================
  // 1. EXPORT SỔ BÉ NGOAN RA FILE EXCEL
  // ==========================================================================

  async exportGoodBehaviorExcel({ classId, month = 10, year = 2026 }) {
    const targetClass = await this._resolveClass(classId);
    if (!targetClass) throw new NotFound('Không tìm thấy thông tin lớp học.');

    const parsedMonth = parseInt(month, 10) || 10;
    const parsedYear = parseInt(year, 10) || 2026;
    const teacherName = targetClass.teacher_classes?.[0]?.teacher?.full_name || 'Giáo viên phụ trách';
    const schoolYearName = targetClass.school_year?.name || '2026-2027';

    // Lấy danh sách học sinh đang học
    const enrollments = await prisma.studentEnrollment.findMany({
      where: {
        class_id: targetClass.class_id,
        status: 'ENROLLED',
        student: { deleted_at: null },
      },
      include: {
        student: true,
      },
      orderBy: { student: { full_name: 'asc' } },
    });

    // Lấy đánh giá bé ngoan tháng
    const monthlyAssessments = await prisma.monthlyAssessment.findMany({
      where: {
        class_id: targetClass.class_id,
        month: parsedMonth,
        year: parsedYear,
      },
    });

    const assessMap = new Map();
    monthlyAssessments.forEach((ma) => {
      assessMap.set(ma.student_id.toString(), ma);
    });

    const { workbook, worksheet: sheet } = createStandardWorkbook(`Tháng ${parsedMonth}`);
    sheet.pageSetup.orientation = 'landscape';

    // Thêm Banner tiêu đề trường học đồng bộ với các file xuất khác
    const startRow = addSchoolHeaderBanner(sheet, {
      title: `SỔ THEO DÕI BÉ NGOAN - THÁNG ${parsedMonth}/${parsedYear}`,
      subtitle: `Lớp: ${targetClass.name.toUpperCase()}  |  Tháng: ${parsedMonth}/${parsedYear}  |  Giáo viên: ${teacherName}`,
      schoolYearName,
      totalCols: 12,
    });

    const headerRow = sheet.getRow(startRow);
    headerRow.values = [
      'STT',
      'Mã học sinh',
      'Họ và tên',
      'Giới tính',
      'Tuần 1',
      'Tuần 2',
      'Tuần 3',
      'Tuần 4',
      'Tuần 5',
      'Tổng hoa',
      'Danh hiệu / Xếp loại',
      'Nhận xét của giáo viên',
    ];
    applyHeaderStyles(headerRow);

    let curRow = startRow + 1;
    enrollments.forEach((enr, idx) => {
      const st = enr.student;
      const ma = assessMap.get(st.student_id.toString());
      const rCount = ma?.roses_count ?? (
        (ma?.week_1_rose ? 1 : 0) +
        (ma?.week_2_rose ? 1 : 0) +
        (ma?.week_3_rose ? 1 : 0) +
        (ma?.week_4_rose ? 1 : 0) +
        (ma?.week_5_rose ? 1 : 0)
      );

      let rank = 'Chưa xếp loại';
      if (rCount >= 4) rank = 'Bé ngoan xuất sắc';
      else if (rCount === 3) rank = 'Bé chăm ngoan';
      else if (rCount > 0) rank = 'Bé cần cố gắng';

      const genderStr = st.gender === 'FEMALE' ? 'Nữ' : 'Nam';

      const row = sheet.getRow(curRow++);
      row.values = [
        idx + 1,
        st.student_code || '',
        st.full_name || '',
        genderStr,
        ma?.week_1_rose ? 'Đạt' : '-',
        ma?.week_2_rose ? 'Đạt' : '-',
        ma?.week_3_rose ? 'Đạt' : '-',
        ma?.week_4_rose ? 'Đạt' : '-',
        ma?.week_5_rose ? 'Đạt' : '-',
        rCount,
        rank,
        ma?.teacher_notes || '',
      ];
    });

    applyZebraAndBorders(sheet, startRow + 1);
    sheet.columns = [
      { width: 7 },   // STT
      { width: 14 },  // Mã học sinh
      { width: 25 },  // Họ và tên
      { width: 11 },  // Giới tính
      { width: 10 },  // Tuần 1
      { width: 10 },  // Tuần 2
      { width: 10 },  // Tuần 3
      { width: 10 },  // Tuần 4
      { width: 10 },  // Tuần 5
      { width: 12 },  // Tổng hoa
      { width: 22 },  // Danh hiệu
      { width: 45 },  // Nhận xét
    ];

    sheet.eachRow((row, rowNumber) => {
      if (rowNumber > startRow) {
        row.getCell(1).alignment = { vertical: 'middle', horizontal: 'center' };
        row.getCell(2).alignment = { vertical: 'middle', horizontal: 'center' };
        row.getCell(3).alignment = { vertical: 'middle', horizontal: 'left' };
        row.getCell(4).alignment = { vertical: 'middle', horizontal: 'center' };
        row.getCell(5).alignment = { vertical: 'middle', horizontal: 'center' };
        row.getCell(6).alignment = { vertical: 'middle', horizontal: 'center' };
        row.getCell(7).alignment = { vertical: 'middle', horizontal: 'center' };
        row.getCell(8).alignment = { vertical: 'middle', horizontal: 'center' };
        row.getCell(9).alignment = { vertical: 'middle', horizontal: 'center' };
        row.getCell(10).alignment = { vertical: 'middle', horizontal: 'center', font: { bold: true } };
        row.getCell(11).alignment = { vertical: 'middle', horizontal: 'center' };
        row.getCell(12).alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
      }
    });

    return workbook.xlsx.writeBuffer();
  }

  // ==========================================================================
  // 2. EXPORT PHIẾU BÉ NGOAN THÁNG IN ẤN HTML (KHỔ A4 / A5)
  // ==========================================================================

  async exportGoodBehaviorPrintHtml({ classId, studentId, month = 10, year = 2026 }) {
    const targetClass = await this._resolveClass(classId);
    if (!targetClass) throw new NotFound('Không tìm thấy thông tin lớp học.');

    const parsedMonth = parseInt(month, 10) || 10;
    const parsedYear = parseInt(year, 10) || 2026;

    // Tìm học sinh
    let enrollments = [];
    if (studentId) {
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(studentId));
      enrollments = await prisma.studentEnrollment.findMany({
        where: {
          class_id: targetClass.class_id,
          student: {
            OR: [
              isUuid ? { public_id: studentId } : undefined,
              /^\d+$/.test(studentId) ? { student_id: BigInt(studentId) } : undefined,
              { student_code: studentId },
            ].filter(Boolean),
            deleted_at: null,
          },
        },
        include: { student: true },
      });
    } else {
      enrollments = await prisma.studentEnrollment.findMany({
        where: {
          class_id: targetClass.class_id,
          status: 'ENROLLED',
          student: { deleted_at: null },
        },
        include: { student: true },
        orderBy: { student: { full_name: 'asc' } },
      });
    }

    const monthlyAssessments = await prisma.monthlyAssessment.findMany({
      where: {
        class_id: targetClass.class_id,
        month: parsedMonth,
        year: parsedYear,
      },
    });

    const assessMap = new Map();
    monthlyAssessments.forEach((ma) => {
      assessMap.set(ma.student_id.toString(), ma);
    });

    const teacherName = targetClass.teacher_classes?.[0]?.teacher?.full_name || 'Cô giáo chủ nhiệm';

    // Tạo danh sách thẻ Phiếu Bé Ngoan
    const cardsHtml = enrollments.map((enr, idx) => {
      const st = enr.student;
      const ma = assessMap.get(st.student_id.toString());
      const rCount = ma?.roses_count ?? (
        (ma?.week_1_rose ? 1 : 0) +
        (ma?.week_2_rose ? 1 : 0) +
        (ma?.week_3_rose ? 1 : 0) +
        (ma?.week_4_rose ? 1 : 0) +
        (ma?.week_5_rose ? 1 : 0)
      );

      const titleRank = rCount >= 4 ? 'BÉ NGOAN XUẤT SẮC' : rCount === 3 ? 'BÉ CHĂM NGOAN' : 'BÉ CẦN CỐ GẮNG';
      const comment = ma?.teacher_notes || 'Bé đi học chuyên cần, lễ phép chào cô, biết nhường nhịn đồ chơi và tích cực tham gia các hoạt động ở lớp.';

      const flowerSvgActive = `<svg width="24" height="24" viewBox="0 0 24 24" fill="#e11d48"><path d="M12 2C13.5 4.5 16 5 18 5C18 7.5 17.5 10 20 11.5C18 13 18 15.5 18 18C15.5 18 13.5 18.5 12 21C10.5 18.5 8.5 18 6 18C6 15.5 6 13 4 11.5C6.5 10 6 7.5 6 5C8 5 10.5 4.5 12 2Z"/></svg>`;
      const flowerSvgInactive = `<svg width="24" height="24" viewBox="0 0 24 24" fill="#cbd5e1"><path d="M12 2C13.5 4.5 16 5 18 5C18 7.5 17.5 10 20 11.5C18 13 18 15.5 18 18C15.5 18 13.5 18.5 12 21C10.5 18.5 8.5 18 6 18C6 15.5 6 13 4 11.5C6.5 10 6 7.5 6 5C8 5 10.5 4.5 12 2Z"/></svg>`;

      return `
        <div class="certificate-card">
          <div class="inner-border">
            <div class="cert-header">
              <p class="school-name">TRƯỜNG MẦM NON HÒN TRE</p>
              <h2 class="cert-title">PHIẾU BÉ NGOAN</h2>
              <p class="cert-month">Tháng ${parsedMonth} / ${parsedYear}</p>
            </div>

            <div class="cert-body">
              <p class="praise-text">Khen tặng bé:</p>
              <h3 class="student-name">${st.full_name}</h3>
              <p class="student-sub">Học sinh lớp: <strong>${targetClass.name}</strong> &bull; Mã HS: <strong>${st.student_code}</strong></p>

              <div class="roses-container">
                <div class="rose-item ${ma?.week_1_rose ? 'active' : ''}">
                  ${ma?.week_1_rose ? flowerSvgActive : flowerSvgInactive}
                  <span>Tuần 1</span>
                </div>
                <div class="rose-item ${ma?.week_2_rose ? 'active' : ''}">
                  ${ma?.week_2_rose ? flowerSvgActive : flowerSvgInactive}
                  <span>Tuần 2</span>
                </div>
                <div class="rose-item ${ma?.week_3_rose ? 'active' : ''}">
                  ${ma?.week_3_rose ? flowerSvgActive : flowerSvgInactive}
                  <span>Tuần 3</span>
                </div>
                <div class="rose-item ${ma?.week_4_rose ? 'active' : ''}">
                  ${ma?.week_4_rose ? flowerSvgActive : flowerSvgInactive}
                  <span>Tuần 4</span>
                </div>
                <div class="rose-item ${ma?.week_5_rose ? 'active' : ''}">
                  ${ma?.week_5_rose ? flowerSvgActive : flowerSvgInactive}
                  <span>Tuần 5</span>
                </div>
              </div>

              <div class="award-badge">
                <span class="badge-title">DANH HIỆU: ${titleRank}</span>
                <span class="badge-sub">Đạt ${rCount}/5 Bông Hoa Bé Ngoan</span>
              </div>

              <div class="comment-box">
                <p><strong>Lời cô dặn dò:</strong> &ldquo;${comment}&rdquo;</p>
              </div>
            </div>

            <div class="cert-footer">
              <div class="sig-col">
                <strong>HIỆU TRƯỞNG</strong>
                <div style="height: 42px;"></div>
                <em>(Ký, đóng dấu)</em>
              </div>
              <div class="sig-col">
                <strong>CÔ GIÁO CHỦ NHIỆM</strong>
                <div style="height: 42px;"></div>
                <strong>${teacherName}</strong>
              </div>
            </div>
          </div>
        </div>
      `;
    });

    return `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <title>Phiếu Bé Ngoan Tháng ${parsedMonth}/${parsedYear} - ${targetClass.name}</title>
  <style>
    @page {
      size: A4 portrait;
      margin: 8mm;
    }
    body {
      font-family: 'Times New Roman', serif;
      margin: 0;
      padding: 0;
      background: #f8fafc;
      color: #1e293b;
    }
    .grid-page {
      display: grid;
      grid-template-columns: 1fr;
      gap: 16px;
      padding: 10px;
    }
    .certificate-card {
      background: #ffffff;
      border: 3px double #f43f5e;
      padding: 8px;
      box-sizing: border-box;
      page-break-inside: avoid;
      margin-bottom: 12px;
      border-radius: 4px;
    }
    .inner-border {
      border: 1px solid #fda4af;
      padding: 14px 18px;
      text-align: center;
      background: radial-gradient(circle, #fffbfb 0%, #ffffff 100%);
    }
    .school-name {
      font-size: 11pt;
      font-weight: bold;
      color: #881337;
      margin: 0 0 2px 0;
      letter-spacing: 0.5px;
    }
    .cert-title {
      font-size: 20pt;
      font-weight: bold;
      color: #e11d48;
      margin: 2px 0 2px 0;
      letter-spacing: 1px;
    }
    .cert-month {
      font-size: 11pt;
      font-style: italic;
      color: #475569;
      margin: 0 0 8px 0;
    }
    .praise-text {
      font-size: 11.5pt;
      margin: 6px 0 2px 0;
      color: #334155;
    }
    .student-name {
      font-size: 17pt;
      font-weight: bold;
      color: #0f172a;
      margin: 2px 0 4px 0;
      text-transform: uppercase;
    }
    .student-sub {
      font-size: 11pt;
      color: #64748b;
      margin: 0 0 10px 0;
    }
    .roses-container {
      display: flex;
      justify-content: center;
      gap: 16px;
      margin: 10px 0;
    }
    .rose-item {
      display: flex;
      flex-col: column;
      flex-direction: column;
      align-items: center;
      font-size: 9.5pt;
      font-weight: 600;
      color: #94a3b8;
    }
    .rose-item.active {
      color: #e11d48;
    }
    .rose-item span {
      margin-top: 3px;
    }
    .award-badge {
      display: inline-block;
      background: #ffe4e6;
      border: 1px dashed #f43f5e;
      padding: 6px 16px;
      border-radius: 4px;
      margin: 8px 0;
    }
    .badge-title {
      display: block;
      font-size: 12.5pt;
      font-weight: bold;
      color: #9f1239;
    }
    .badge-sub {
      display: block;
      font-size: 10pt;
      color: #be123c;
      margin-top: 1px;
    }
    .comment-box {
      background: #fdf2f8;
      border-left: 3px solid #f43f5e;
      padding: 6px 12px;
      text-align: left;
      font-size: 10.5pt;
      color: #334155;
      margin: 8px 12px;
      font-style: italic;
    }
    .comment-box p {
      margin: 0;
    }
    .cert-footer {
      display: flex;
      justify-content: space-between;
      margin-top: 14px;
      padding: 0 20px;
    }
    .sig-col {
      width: 45%;
      text-align: center;
      font-size: 10.5pt;
    }
    .btn-print {
      position: fixed;
      top: 16px;
      right: 16px;
      background: #e11d48;
      color: #fff;
      border: none;
      padding: 8px 18px;
      font-size: 14px;
      font-weight: bold;
      cursor: pointer;
      box-shadow: 0 2px 6px rgba(0,0,0,0.25);
      z-index: 9999;
    }
    @media print {
      body { background: #fff; }
      .btn-print { display: none; }
      .certificate-card {
        page-break-after: always;
        border: 2px solid #f43f5e;
      }
      .certificate-card:last-child {
        page-break-after: avoid;
      }
    }
  </style>
</head>
<body>
  <button onclick="window.print()" class="btn-print">In Phiếu Bé Ngoan</button>
  <div class="grid-page">
    ${cardsHtml.join('')}
  </div>
</body>
</html>`;
  }
}

export const goodBehaviorExportService = new GoodBehaviorExportService();
export default goodBehaviorExportService;
