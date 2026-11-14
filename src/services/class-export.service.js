import ExcelJS from 'exceljs';
import prisma from '../config/prisma.js';
import { NotFound } from '../utils/http-error.js';
import {
  createStandardWorkbook,
  addSchoolHeaderBanner,
  applyHeaderStyles,
  applyZebraAndBorders,
  autoFitColumns,
  formatDateDMY,
} from '../utils/excel.helper.js';

export class ClassExportService {
  /**
   * Helper tìm class theo ID hoặc Public ID
   */
  async _resolveClass(id) {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(id).trim());
    return prisma.class.findFirst({
      where: {
        OR: [
          isUuid ? { public_id: id } : undefined,
          /^\d+$/.test(id) ? { class_id: BigInt(id) } : undefined,
        ].filter(Boolean),
        deleted_at: null,
      },
      include: {
        school_year: true,
        teacher_classes: {
          where: { left_at: null },
          include: { teacher: true },
        },
        student_enrollments: {
          where: { status: 'ENROLLED' },
          include: {
            student: {
              include: {
                parents: { where: { deleted_at: null } },
              },
            },
          },
          orderBy: { student: { full_name: 'asc' } },
        },
      },
    });
  }

  /**
   * 1. Xuất danh sách tất cả các lớp ra Excel
   */
  async exportClassesExcel({ schoolYearId }) {
    const where = { deleted_at: null };

    if (schoolYearId) {
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(schoolYearId).trim());
      where.OR = [
        isUuid ? { school_year: { public_id: schoolYearId } } : undefined,
        /^\d+$/.test(schoolYearId) ? { school_year_id: BigInt(schoolYearId) } : undefined,
      ].filter(Boolean);
    }

    const classes = await prisma.class.findMany({
      where,
      include: {
        school_year: true,
        teacher_classes: {
          where: { left_at: null },
          include: { teacher: true },
        },
        student_enrollments: {
          where: { status: 'ENROLLED' },
          include: { student: true },
        },
      },
      orderBy: [{ age_group: 'asc' }, { name: 'asc' }],
    });

    const { workbook, worksheet } = createStandardWorkbook('Danh sách lớp học');

    const totalCols = 9;
    const startRow = addSchoolHeaderBanner(worksheet, {
      title: 'DANH SÁCH CÁC LỚP HỌC TOÀN TRƯỜNG',
      subtitle: `Tổng số lớp: ${classes.length}`,
      totalCols,
    });

    const headerRow = worksheet.addRow([
      'STT',
      'Tên lớp',
      'Khối lớp',
      'Phòng học',
      'Năm học',
      'Giáo viên phụ trách',
      'Tổng sĩ số',
      'Học sinh Nam',
      'Học sinh Nữ',
    ]);
    applyHeaderStyles(headerRow);

    const ageGroupMap = {
      NHA_TRE: 'Khối Nhà trẻ (24-36 tháng tuổi)',
      MAM: 'Khối Mầm (3-4 tuổi)',
      CHOI: 'Khối Chồi (4-5 tuổi)',
      LA: 'Khối Lá (5-6 tuổi)',
    };

    classes.forEach((cls, idx) => {
      const teachers = cls.teacher_classes.map((tc) => tc.teacher.full_name).join(', ');
      const totalStudents = cls.student_enrollments.length;
      const maleStudents = cls.student_enrollments.filter((se) => se.student.gender === 'MALE').length;
      const femaleStudents = cls.student_enrollments.filter((se) => se.student.gender === 'FEMALE').length;

      worksheet.addRow([
        idx + 1,
        cls.name,
        ageGroupMap[cls.age_group] || cls.age_group,
        cls.room_number || '',
        cls.school_year?.name || '',
        teachers || 'Chưa phân công',
        totalStudents,
        maleStudents,
        femaleStudents,
      ]);
    });

    const endRow = startRow + classes.length;
    applyZebraAndBorders(worksheet, startRow + 1, endRow);
    autoFitColumns(worksheet);

    return workbook.xlsx.writeBuffer();
  }

  /**
   * 2. Xuất sổ danh sách học sinh của một lớp cụ thể ra Excel
   */
  async exportClassRosterExcel(classId) {
    const cls = await this._resolveClass(classId);
    if (!cls) {
      throw new NotFound('Không tìm thấy thông tin lớp học.');
    }

    const { workbook, worksheet } = createStandardWorkbook(`Lớp ${cls.name}`);

    const teachers = cls.teacher_classes.map((tc) => tc.teacher.full_name).join(', ');
    const totalCols = 14;
    const startRow = addSchoolHeaderBanner(worksheet, {
      title: `DANH SÁCH HỌC SINH LỚP ${cls.name.toUpperCase()}`,
      subtitle: `Năm học: ${cls.school_year?.name || ''}  |  GVCN: ${teachers || 'Chưa phân công'}  |  Sĩ số: ${cls.student_enrollments.length}`,
      totalCols,
    });

    const headerRow = worksheet.addRow([
      'STT',
      'Mã học sinh',
      'Họ và tên',
      'Ngày sinh',
      'Giới tính',
      'Họ tên Phụ huynh 1',
      'Quan hệ PH 1',
      'Số điện thoại PH 1',
      'Họ tên Phụ huynh 2',
      'Quan hệ PH 2',
      'Số điện thoại PH 2',
      'Địa chỉ thường trú',
      'Ngày nhập học',
      'Ghi chú sức khỏe/dị ứng',
    ]);
    applyHeaderStyles(headerRow);

    cls.student_enrollments.forEach((se, idx) => {
      const s = se.student;
      const p1 = s.parents?.[0];
      const p2 = s.parents?.[1];

      worksheet.addRow([
        idx + 1,
        s.student_code,
        s.full_name,
        formatDateDMY(s.date_of_birth),
        s.gender === 'MALE' ? 'Nam' : 'Nữ',
        p1?.full_name || '',
        p1?.relationship || '',
        p1?.phone || '',
        p2?.full_name || '',
        p2?.relationship || '',
        p2?.phone || '',
        s.permanent_residence || s.current_residence || '',
        formatDateDMY(se.enrolled_at),
        s.allergy_notes || '',
      ]);
    });

    const endRow = startRow + cls.student_enrollments.length;
    applyZebraAndBorders(worksheet, startRow + 1, endRow);
    autoFitColumns(worksheet);

    return workbook.xlsx.writeBuffer();
  }

  /**
   * 3. Xuất Sổ danh sách học sinh theo mẫu HTML in ấn A4 chuẩn BGD
   */
  async exportClassRosterPrintHtml(classId) {
    const cls = await this._resolveClass(classId);
    if (!cls) {
      throw new NotFound('Không tìm thấy thông tin lớp học.');
    }

    const teachers = cls.teacher_classes.map((tc) => tc.teacher.full_name).join(', ');
    const totalStudents = cls.student_enrollments.length;
    const maleCount = cls.student_enrollments.filter((se) => se.student.gender === 'MALE').length;
    const femaleCount = cls.student_enrollments.filter((se) => se.student.gender === 'FEMALE').length;

    const rowsHtml = cls.student_enrollments
      .map((se, idx) => {
        const s = se.student;
        const p1 = s.parents?.[0];
        const p2 = s.parents?.[1];
        const isFemale = s.gender === 'FEMALE';
        const parentsText = [
          p1 ? p1.full_name : '',
          p2 ? `<small style="color: #666;">${p2.full_name}</small>` : '',
        ].filter(Boolean).join('<br>');
        const phonesText = [
          p1 ? p1.phone : '',
          p2 ? `<small style="color: #666;">${p2.phone}</small>` : '',
        ].filter(Boolean).join('<br>');

        return `
        <tr>
          <td style="text-align: center;">${idx + 1}</td>
          <td style="text-align: center; font-family: monospace;">${s.student_code}</td>
          <td style="font-weight: 500;">${s.full_name}</td>
          <td style="text-align: center;">${formatDateDMY(s.date_of_birth)}</td>
          <td style="text-align: center; font-weight: bold;">${isFemale ? 'x' : ''}</td>
          <td>${parentsText}</td>
          <td style="text-align: center;">${phonesText}</td>
          <td>${s.permanent_residence || s.current_residence || ''}</td>
          <td style="font-size: 11px;">${s.allergy_notes || ''}</td>
          <td></td>
        </tr>`;
      })
      .join('\n');

    return `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <title>Danh sách học sinh lớp ${cls.name} - Trường Mầm non Hòn Tre</title>
  <style>
    @page {
      size: A4 portrait;
      margin: 15mm 15mm 15mm 15mm;
    }
    body {
      font-family: 'Times New Roman', Times, serif;
      font-size: 13px;
      color: #111;
      margin: 0;
      padding: 10px;
    }
    .no-print {
      position: fixed;
      top: 15px;
      right: 15px;
      z-index: 9999;
    }
    .btn-print {
      background: #1E40AF;
      color: white;
      border: none;
      padding: 8px 18px;
      font-size: 14px;
      font-weight: bold;
      border-radius: 6px;
      cursor: pointer;
      box-shadow: 0 2px 8px rgba(0,0,0,0.2);
    }
    .btn-print:hover {
      background: #1D4ED8;
    }
    @media print {
      .no-print { display: none !important; }
      body { padding: 0; }
    }
    .header-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 12px;
    }
    .header-table td {
      vertical-align: top;
      border: none;
      padding: 2px;
    }
    .title {
      text-align: center;
      margin-top: 10px;
      margin-bottom: 4px;
    }
    .title h2 {
      margin: 0;
      font-size: 17px;
      font-weight: bold;
      text-transform: uppercase;
    }
    .meta-info {
      text-align: center;
      font-size: 13px;
      margin-bottom: 15px;
      font-style: italic;
    }
    .summary-bar {
      display: flex;
      justify-content: space-between;
      margin-bottom: 10px;
      font-weight: 500;
    }
    table.data-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 20px;
    }
    table.data-table th, table.data-table td {
      border: 1px solid #333;
      padding: 5px 6px;
      vertical-align: middle;
    }
    table.data-table th {
      background-color: #f2f2f2;
      text-align: center;
      font-weight: bold;
      font-size: 12px;
    }
    .footer-table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 25px;
      page-break-inside: avoid;
    }
    .footer-table td {
      border: none;
      text-align: center;
      vertical-align: top;
      width: 50%;
    }
    .signature-space {
      height: 70px;
    }
  </style>
</head>
<body>
  <div class="no-print">
    <button class="btn-print" onclick="window.print()">🖨️ In Danh Sách (A4)</button>
  </div>

  <table class="header-table">
    <tr>
      <td style="width: 45%; text-align: center;">
        <div style="font-size: 12px; text-transform: uppercase;">PHÒNG GIÁO DỤC VÀ ĐÀO TẠO</div>
        <div style="font-size: 13px; font-weight: bold; text-transform: uppercase;">TRƯỜNG MẦM NON HÒN TRE</div>
        <div style="font-size: 11px; margin-top: 2px;">***</div>
      </td>
      <td style="width: 55%; text-align: center;">
        <div style="font-size: 12px; font-weight: bold; text-transform: uppercase;">CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</div>
        <div style="font-size: 13px; font-weight: bold; text-decoration: underline;">Độc lập - Tự do - Hạnh phúc</div>
      </td>
    </tr>
  </table>

  <div class="title">
    <h2>DANH SÁCH HỌC SINH LỚP ${cls.name.toUpperCase()}</h2>
  </div>
  <div class="meta-info">
    Niên khóa: ${cls.school_year?.name || '2026 - 2027'}  |  Khối: ${cls.age_group}
  </div>

  <div class="summary-bar">
    <div><strong>Giáo viên chủ nhiệm:</strong> ${teachers || 'Chưa phân công'}</div>
    <div><strong>Tổng số:</strong> ${totalStudents} trẻ (Nam: ${maleCount}, Nữ: ${femaleCount})</div>
  </div>

  <table class="data-table">
    <thead>
      <tr>
        <th style="width: 30px;">STT</th>
        <th style="width: 65px;">Mã HS</th>
        <th style="width: 140px;">Họ và tên</th>
        <th style="width: 75px;">Ngày sinh</th>
        <th style="width: 32px;">Nữ</th>
        <th style="width: 120px;">Họ tên Cha/Mẹ</th>
        <th style="width: 85px;">Số điện thoại</th>
        <th>Địa chỉ thường trú</th>
        <th style="width: 90px;">Ghi chú y tế</th>
        <th style="width: 55px;">Ký nhận</th>
      </tr>
    </thead>
    <tbody>
      ${rowsHtml || '<tr><td colspan="10" style="text-align:center; padding: 20px;">Lớp chưa có học sinh nào.</td></tr>'}
    </tbody>
  </table>

  <table class="footer-table">
    <tr>
      <td></td>
      <td style="font-style: italic;">
        Ngày ...... tháng ...... năm 20......
      </td>
    </tr>
    <tr>
      <td style="font-weight: bold;">
        HIỆU TRƯỞNG DUYỆT<br>
        <span style="font-weight: normal; font-size: 11px;">(Ký, đóng dấu và ghi rõ họ tên)</span>
        <div class="signature-space"></div>
      </td>
      <td style="font-weight: bold;">
        GIÁO VIÊN CHỦ NHIỆM<br>
        <span style="font-weight: normal; font-size: 11px;">(Ký và ghi rõ họ tên)</span>
        <div class="signature-space"></div>
        <div>${teachers || ''}</div>
      </td>
    </tr>
  </table>
</body>
</html>`;
  }
}

export const classExportService = new ClassExportService();
export default classExportService;
