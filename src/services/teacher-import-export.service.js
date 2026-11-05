import bcrypt from 'bcryptjs';
import ExcelJS from 'exceljs';
import prisma from '../config/prisma.js';
import { BadRequest } from '../utils/http-error.js';
import logger from '../utils/logger.js';
import {
  buildImportTemplateWorkbook,
  createStandardWorkbook,
  addSchoolHeaderBanner,
  applyHeaderStyles,
  applyZebraAndBorders,
  autoFitColumns,
  parseExcelDate,
  formatDateDMY,
} from '../utils/excel.helper.js';

export class TeacherImportExportService {
  /**
   * 1. Sinh file Excel mẫu kèm hướng dẫn nhập giáo viên
   */
  async getImportTemplate() {
    const columns = [
      { header: 'Mã giáo viên / Cán bộ', key: 'employee_code', required: false },
      { header: 'Họ và tên', key: 'full_name', required: true },
      { header: 'Ngày sinh (dd/mm/yyyy)', key: 'date_of_birth', required: true },
      { header: 'Giới tính (Nam/Nữ)', key: 'gender', required: true },
      { header: 'Số CCCD/CMND (12 số)', key: 'citizen_id', required: true },
      { header: 'Số điện thoại', key: 'phone', required: true },
      { header: 'Email', key: 'email', required: true },
      { header: 'Vị trí / Chức vụ', key: 'position', required: false },
      { header: 'Địa chỉ thường trú', key: 'address', required: false },
      { header: 'Ngày vào trường (dd/mm/yyyy)', key: 'start_date', required: false },
    ];

    const sampleRows = [
      [
        'CB26001',
        'Nguyễn Thị Mai',
        '10/05/1992',
        'Nữ',
        '079192004567',
        '0909876543',
        'mai.nguyen@sorak.edu.vn',
        'Giáo viên chủ nhiệm',
        '123 Hai Bà Trưng, Q.3, TP.HCM',
        '01/08/2026',
      ],
      [
        '',
        'Trần Minh Đức',
        '25/11/1990',
        'Nam',
        '079190001234',
        '0918765432',
        'duc.tran@sorak.edu.vn',
        'Giáo viên thể chất',
        '45 Lê Duẩn, Q.1, TP.HCM',
        '01/08/2026',
      ],
    ];

    const instructions = [
      { column: 'Mã giáo viên / Cán bộ', rule: 'Tùy chọn. Nếu để trống hệ thống sẽ tự sinh dạng CB{Năm}{STT} (ví dụ CB26001).', required: false },
      { column: 'Họ và tên', rule: 'Bắt buộc. Tên đầy đủ của giáo viên/cán bộ.', required: true },
      { column: 'Ngày sinh', rule: 'Bắt buộc. Định dạng dd/mm/yyyy. Độ tuổi từ 18 đến 65 tuổi.', required: true },
      { column: 'Giới tính', rule: 'Bắt buộc. Điền "Nam" hoặc "Nữ".', required: true },
      { column: 'Số CCCD/CMND', rule: 'Bắt buộc. Đúng 12 số định danh cá nhân. Không được trùng lặp trong hệ thống.', required: true },
      { column: 'Số điện thoại', rule: 'Bắt buộc. 10 số di động hợp lệ (bắt đầu bằng 0).', required: true },
      { column: 'Email', rule: 'Bắt buộc. Email duy nhất, dùng để liên hệ và cấp tài khoản.', required: true },
      { column: 'Vị trí / Chức vụ', rule: 'Tùy chọn. Mặc định là "Giáo viên mầm non".', required: false },
      { column: 'Địa chỉ thường trú', rule: 'Tùy chọn. Địa chỉ cư trú của giáo viên.', required: false },
      { column: 'Ngày vào trường', rule: 'Tùy chọn. Định dạng dd/mm/yyyy. Nếu để trống lấy ngày hiện tại.', required: false },
    ];

    return buildImportTemplateWorkbook({
      sheetName: 'Danh sách cán bộ GV',
      title: 'MẪU NHẬP CÁN BỘ GIÁO VIÊN MỚI',
      columns,
      sampleRows,
      instructions,
    });
  }

  /**
   * 2. Xem trước và kiểm tra tính hợp lệ của file Excel giáo viên tải lên
   */
  async previewImport(fileBuffer) {
    if (!fileBuffer || fileBuffer.length === 0) {
      throw new BadRequest('Tệp tải lên không được để trống.');
    }

    const workbook = new ExcelJS.Workbook();
    try {
      await workbook.xlsx.load(fileBuffer);
    } catch (err) {
      throw new BadRequest('Định dạng tệp không hợp lệ. Vui lòng tải lên file Excel (.xlsx).');
    }

    const worksheet = workbook.worksheets[0];
    if (!worksheet || worksheet.rowCount < 2) {
      throw new BadRequest('Tệp Excel không có dữ liệu để nhập.');
    }

    // Tìm dòng header
    let headerRowNumber = 1;
    for (let r = 1; r <= Math.min(10, worksheet.rowCount); r++) {
      const row = worksheet.getRow(r);
      const text = (row.values || []).join(' ');
      if (/họ và tên|họ tên/i.test(text)) {
        headerRowNumber = r;
        break;
      }
    }

    // Lấy danh sách CCCD, Email, EmployeeCode đã có trong DB
    const existingTeachers = await prisma.teacher.findMany({
      select: { employee_code: true, citizen_id: true, email: true },
    });
    const codeSet = new Set(existingTeachers.map((t) => (t.employee_code || '').toUpperCase()));
    const cccdSet = new Set(existingTeachers.map((t) => (t.citizen_id || '').trim()));
    const emailSet = new Set(existingTeachers.map((t) => (t.email || '').toLowerCase().trim()));

    const rows = [];
    let validCount = 0;
    let invalidCount = 0;
    const seenCodesInBatch = new Set();
    const seenCccdsInBatch = new Set();
    const seenEmailsInBatch = new Set();

    for (let r = headerRowNumber + 1; r <= worksheet.rowCount; r++) {
      const row = worksheet.getRow(r);
      const rawFullName = row.getCell(2).value;
      if (!rawFullName && !row.getCell(5).value && !row.getCell(7).value) {
        continue;
      }

      const rowErrors = [];

      const rawCode = String(row.getCell(1).value || '').trim().toUpperCase();
      const fullName = String(rawFullName || '').trim();
      const rawDob = row.getCell(3).value;
      const rawGender = String(row.getCell(4).value || '').trim();
      const citizenId = String(row.getCell(5).value || '').replace(/\D/g, '');
      const phone = String(row.getCell(6).value || '').replace(/\D/g, '');
      const email = String(row.getCell(7).value || '').trim().toLowerCase();
      const position = String(row.getCell(8).value || 'Giáo viên mầm non').trim();
      const address = String(row.getCell(9).value || '').trim();
      const rawStartDate = row.getCell(10).value;

      // Validate Họ tên
      if (!fullName || fullName.length < 2) {
        rowErrors.push('Họ và tên giáo viên không được để trống.');
      }

      // Validate Ngày sinh
      const dob = parseExcelDate(rawDob);
      if (!dob) {
        rowErrors.push('Ngày sinh không hợp lệ (cần định dạng dd/mm/yyyy).');
      } else {
        const now = new Date();
        const age = (now.getFullYear() - dob.getFullYear());
        if (age < 18 || age > 65) {
          rowErrors.push('Độ tuổi giáo viên/cán bộ phải từ 18 đến 65 tuổi.');
        }
      }

      // Validate Giới tính
      let genderEnum = null;
      if (/^nam$/i.test(rawGender)) {
        genderEnum = 'MALE';
      } else if (/^n[uữ]$/i.test(rawGender)) {
        genderEnum = 'FEMALE';
      } else {
        rowErrors.push('Giới tính chỉ được điền "Nam" hoặc "Nữ".');
      }

      // Validate CCCD
      if (!citizenId || !/^\d{12}$/.test(citizenId)) {
        rowErrors.push('Số CCCD phải có đúng 12 chữ số.');
      } else if (cccdSet.has(citizenId)) {
        rowErrors.push(`Số CCCD '${citizenId}' đã tồn tại trong hệ thống.`);
      } else if (seenCccdsInBatch.has(citizenId)) {
        rowErrors.push(`Số CCCD '${citizenId}' bị trùng lặp trong file tải lên.`);
      } else {
        seenCccdsInBatch.add(citizenId);
      }

      // Validate Phone
      if (!phone || !/^0\d{9}$/.test(phone)) {
        rowErrors.push('Số điện thoại phải là 10 số di động hợp lệ (bắt đầu bằng 0).');
      }

      // Validate Email
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        rowErrors.push('Email không đúng định dạng.');
      } else if (emailSet.has(email)) {
        rowErrors.push(`Email '${email}' đã tồn tại trong hệ thống.`);
      } else if (seenEmailsInBatch.has(email)) {
        rowErrors.push(`Email '${email}' bị trùng lặp trong file tải lên.`);
      } else {
        seenEmailsInBatch.add(email);
      }

      // Validate Mã giáo viên
      if (rawCode) {
        if (codeSet.has(rawCode)) {
          rowErrors.push(`Mã giáo viên '${rawCode}' đã tồn tại trong hệ thống.`);
        } else if (seenCodesInBatch.has(rawCode)) {
          rowErrors.push(`Mã giáo viên '${rawCode}' bị trùng lặp trong file tải lên.`);
        } else {
          seenCodesInBatch.add(rawCode);
        }
      }

      const isValid = rowErrors.length === 0;
      if (isValid) validCount++;
      else invalidCount++;

      rows.push({
        rowNumber: r,
        employeeCode: rawCode || null,
        fullName,
        dateOfBirth: dob ? formatDateDMY(dob) : rawDob,
        dateOfBirthRaw: dob ? dob.toISOString() : null,
        gender: genderEnum,
        genderLabel: genderEnum === 'MALE' ? 'Nam' : 'Nữ',
        citizenId,
        phone,
        email,
        position: position || 'Giáo viên mầm non',
        address: address || null,
        startDate: parseExcelDate(rawStartDate) ? formatDateDMY(parseExcelDate(rawStartDate)) : formatDateDMY(new Date()),
        startDateRaw: parseExcelDate(rawStartDate) ? parseExcelDate(rawStartDate).toISOString() : new Date().toISOString(),
        isValid,
        errors: rowErrors,
      });
    }

    return {
      summary: {
        totalRows: rows.length,
        validCount,
        invalidCount,
      },
      previewData: rows,
    };
  }

  /**
   * 3. Thực thi Import danh sách giáo viên hợp lệ vào Database & Tự tạo Account
   */
  async importTeachers(teachersToImport, actorId) {
    if (!Array.isArray(teachersToImport) || teachersToImport.length === 0) {
      throw new BadRequest('Danh sách giáo viên nhập không được để trống.');
    }

    const currentYear = new Date().getFullYear();
    const yearSuffix = String(currentYear).slice(-2);
    const prefix = `CB${yearSuffix}`;

    const existing = await prisma.teacher.findMany({
      where: { employee_code: { startsWith: prefix, mode: 'insensitive' } },
      select: { employee_code: true },
    });
    let maxSeq = 0;
    const regex = new RegExp(`^${prefix}(\\d{3,})$`, 'i');
    for (const t of existing) {
      const match = String(t.employee_code || '').trim().match(regex);
      if (match) {
        const num = parseInt(match[1], 10);
        if (num > maxSeq) maxSeq = num;
      }
    }

    // Default hashed password for new teacher accounts: "Sorak@2026"
    const defaultPasswordHash = await bcrypt.hash('Sorak@2026', 10);

    const results = {
      total: teachersToImport.length,
      successCount: 0,
      failedCount: 0,
      errors: [],
    };

    for (const item of teachersToImport) {
      if (!item.isValid && item.errors && item.errors.length > 0) {
        results.failedCount++;
        results.errors.push({
          rowNumber: item.rowNumber,
          fullName: item.fullName,
          reasons: item.errors,
        });
        continue;
      }

      try {
        await prisma.$transaction(async (tx) => {
          let code = item.employeeCode;
          if (!code) {
            maxSeq++;
            code = `${prefix}${String(maxSeq).padStart(3, '0')}`;
          }

          const dob = item.dateOfBirthRaw ? new Date(item.dateOfBirthRaw) : new Date(item.dateOfBirth);
          const startDate = item.startDateRaw ? new Date(item.startDateRaw) : new Date();

          // 1. Tạo Account cho giáo viên
          const account = await tx.account.create({
            data: {
              username: code.toLowerCase(),
              password_hash: defaultPasswordHash,
              role: 'TEACHER_GV',
              is_active: true,
              email: item.email,
              phone: item.phone,
            },
          });

          // 2. Tạo Teacher
          await tx.teacher.create({
            data: {
              account_id: account.account_id,
              employee_code: code,
              full_name: item.fullName,
              date_of_birth: dob,
              gender: item.gender || 'FEMALE',
              citizen_id: item.citizenId,
              phone: item.phone,
              email: item.email,
              position: item.position || 'Giáo viên mầm non',
              address: item.address || null,
              work_status: 'WORKING',
              start_date: startDate,
              avatar_url: `https://api.dicebear.com/9.x/initials/svg?seed=${encodeURIComponent(item.fullName)}`,
            },
          });
        });

        results.successCount++;
      } catch (err) {
        logger.error(`[TeacherImport] Error importing row ${item.rowNumber} (${item.fullName}):`, err);
        results.failedCount++;
        results.errors.push({
          rowNumber: item.rowNumber,
          fullName: item.fullName,
          reasons: [err.message || 'Lỗi lưu trữ cơ sở dữ liệu.'],
        });
      }
    }

    return results;
  }

  /**
   * 4. Xuất danh sách giáo viên ra file Excel
   */
  async exportTeachersExcel({ workStatus, gender, search, schoolYearId }) {
    const where = { deleted_at: null };

    if (workStatus && workStatus !== 'ALL') {
      where.work_status = workStatus;
    }
    if (gender && gender !== 'ALL') {
      where.gender = gender;
    }
    if (search && search.trim()) {
      const q = search.trim();
      where.OR = [
        { full_name: { contains: q, mode: 'insensitive' } },
        { employee_code: { contains: q, mode: 'insensitive' } },
        { phone: { contains: q } },
        { email: { contains: q, mode: 'insensitive' } },
        { citizen_id: { contains: q } },
      ];
    }

    // Xác định năm học hiện hành hoặc theo tham số lọc để chỉ lấy lớp đang phụ trách
    let targetSchoolYear = null;
    if (schoolYearId) {
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(schoolYearId).trim());
      const isNum = /^\d+$/.test(String(schoolYearId).trim());
      targetSchoolYear = await prisma.schoolYear.findFirst({
        where: {
          OR: [
            isUuid ? { public_id: String(schoolYearId).trim() } : undefined,
            isNum ? { school_year_id: BigInt(schoolYearId) } : undefined,
            { name: String(schoolYearId).trim() },
          ].filter(Boolean),
          deleted_at: null,
        },
      });
    }

    if (!targetSchoolYear) {
      targetSchoolYear = await prisma.schoolYear.findFirst({
        where: { status: 'ACTIVE', deleted_at: null },
      }) || await prisma.schoolYear.findFirst({
        where: { deleted_at: null },
        orderBy: { start_date: 'desc' },
      });
    }

    const teachers = await prisma.teacher.findMany({
      where,
      include: {
        teacher_classes: {
          where: {
            left_at: null,
            class: {
              deleted_at: null,
              ...(targetSchoolYear ? { school_year_id: targetSchoolYear.school_year_id } : { school_year: { status: 'ACTIVE' } }),
            },
          },
          include: {
            class: {
              select: {
                name: true,
                age_group: true,
                school_year: { select: { name: true, status: true } },
              },
            },
          },
          orderBy: [{ assigned_at: 'desc' }, { id: 'desc' }],
        },
      },
      orderBy: [{ employee_code: 'asc' }],
    });

    const { workbook, worksheet } = createStandardWorkbook('Danh sách cán bộ giáo viên');

    const totalCols = 11;
    const startRow = addSchoolHeaderBanner(worksheet, {
      title: 'DANH SÁCH CÁN BỘ GIÁO VIÊN NHÀ TRƯỜNG',
      schoolYearName: targetSchoolYear?.name,
      subtitle: `Tổng số nhân sự: ${teachers.length}`,
      totalCols,
    });

    const headerRow = worksheet.addRow([
      'STT',
      'Mã cán bộ/GV',
      'Họ và tên',
      'Ngày sinh',
      'Giới tính',
      'Số CCCD',
      'Số điện thoại',
      'Email',
      'Chức vụ',
      'Lớp phụ trách',
      'Trạng thái công tác',
    ]);
    applyHeaderStyles(headerRow);

    const workStatusMap = {
      WORKING: 'Đang làm việc',
      ON_LEAVE: 'Nghỉ phép',
      RESIGNED: 'Đã thôi việc',
    };

    teachers.forEach((t, idx) => {
      // Chỉ lấy duy nhất lớp hiện đang phụ trách trong năm học
      const currentClass = t.teacher_classes[0]?.class?.name || 'Chưa phân công';
      worksheet.addRow([
        idx + 1,
        t.employee_code,
        t.full_name,
        formatDateDMY(t.date_of_birth),
        t.gender === 'MALE' ? 'Nam' : 'Nữ',
        t.citizen_id,
        t.phone || '',
        t.email || '',
        t.position || 'Giáo viên',
        currentClass,
        workStatusMap[t.work_status] || t.work_status,
      ]);
    });

    const endRow = startRow + teachers.length;
    applyZebraAndBorders(worksheet, startRow + 1, endRow);
    autoFitColumns(worksheet);

    return workbook.xlsx.writeBuffer();
  }
}

export const teacherImportExportService = new TeacherImportExportService();
export default teacherImportExportService;
