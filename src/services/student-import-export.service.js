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

export class StudentImportExportService {
  /**
   * 1. Sinh file Excel mẫu kèm hướng dẫn nhập học sinh
   */
  async getImportTemplate() {
    const columns = [
      { header: 'Mã học sinh', key: 'student_code', required: false },
      { header: 'Họ và tên', key: 'full_name', required: true },
      { header: 'Ngày sinh (dd/mm/yyyy)', key: 'date_of_birth', required: true },
      { header: 'Giới tính (Nam/Nữ)', key: 'gender', required: true },
      { header: 'Dân tộc', key: 'ethnic', required: false },
      { header: 'Nơi sinh', key: 'place_of_birth', required: false },
      { header: 'Địa chỉ thường trú', key: 'permanent_residence', required: false },
      { header: 'Tên lớp nhập học', key: 'class_name', required: false },
      { header: 'Ngày nhập học (dd/mm/yyyy)', key: 'enrollment_date', required: false },
      { header: 'Họ tên Phụ huynh 1', key: 'parent1_name', required: true },
      { header: 'Quan hệ PH 1 (Bố/Mẹ/Giám hộ)', key: 'parent1_relationship', required: true },
      { header: 'Số ĐT Phụ huynh 1', key: 'parent1_phone', required: true },
      { header: 'Số CCCD Phụ huynh 1', key: 'parent1_citizen_id', required: false },
      { header: 'Họ tên Phụ huynh 2', key: 'parent2_name', required: false },
      { header: 'Quan hệ PH 2', key: 'parent2_relationship', required: false },
      { header: 'Số ĐT Phụ huynh 2', key: 'parent2_phone', required: false },
      { header: 'Số CCCD Phụ huynh 2', key: 'parent2_citizen_id', required: false },
      { header: 'Ghi chú dị ứng/sức khỏe', key: 'allergy_notes', required: false },
    ];

    const sampleRows = [
      [
        'HS26001',
        'Nguyễn Gia Bảo',
        '15/03/2021',
        'Nam',
        'Kinh',
        'TP. Hồ Chí Minh',
        '123 Nguyễn Thị Minh Khai, Q.1, TP.HCM',
        'Mầm 1',
        '05/09/2026',
        'Nguyễn Văn Nam',
        'Bố',
        '0901234567',
        '079201004567',
        'Lê Thị Thu Thảo',
        'Mẹ',
        '0912345678',
        '079198005678',
        'Dị ứng hải sản nhẹ',
      ],
      [
        '',
        'Trần Mai Anh',
        '20/08/2022',
        'Nữ',
        'Kinh',
        'TP. Cần Thơ',
        '45 Lê Lợi, P. Bến Nghé, Q.1, TP.HCM',
        'Nhà trẻ 1',
        '05/09/2026',
        'Trần Văn Bình',
        'Bố',
        '0987654321',
        '',
        '',
        '',
        '',
        '',
        'Không có tiền sử dị ứng',
      ],
    ];

    const instructions = [
      { column: 'Mã học sinh', rule: 'Tùy chọn. Nếu để trống hệ thống sẽ tự sinh tự động theo định dạng HS{Năm}{STT} (ví dụ HS26001).', required: false },
      { column: 'Họ và tên', rule: 'Bắt buộc. Tên đầy đủ tiếng Việt có dấu của học sinh.', required: true },
      { column: 'Ngày sinh', rule: 'Bắt buộc. Định dạng ngày/tháng/năm (dd/mm/yyyy). Trẻ mầm non từ 1 đến 6 tuổi.', required: true },
      { column: 'Giới tính', rule: 'Bắt buộc. Chỉ điền "Nam" hoặc "Nữ".', required: true },
      { column: 'Dân tộc', rule: 'Tùy chọn. Nếu để trống hệ thống mặc định là "Kinh".', required: false },
      { column: 'Nơi sinh', rule: 'Tùy chọn. Tỉnh/Thành phố nơi sinh của bé.', required: false },
      { column: 'Địa chỉ thường trú', rule: 'Tùy chọn. Địa chỉ gia đình học sinh cư trú.', required: false },
      { column: 'Tên lớp nhập học', rule: 'Tùy chọn. Phải khớp chính xác với tên lớp đang hoạt động trong trường (ví dụ: Mầm 1, Chồi 2).', required: false },
      { column: 'Ngày nhập học', rule: 'Tùy chọn. Định dạng dd/mm/yyyy. Nếu để trống lấy ngày hiện tại.', required: false },
      { column: 'Họ tên Phụ huynh 1', rule: 'Bắt buộc. Tên cha, mẹ hoặc người giám hộ chính.', required: true },
      { column: 'Quan hệ PH 1', rule: 'Bắt buộc. Điền "Bố", "Mẹ" hoặc "Người giám hộ".', required: true },
      { column: 'Số ĐT Phụ huynh 1', rule: 'Bắt buộc. Số điện thoại di động 10 số (bắt đầu bằng 0). Dùng để liên hệ và tạo tài khoản PH.', required: true },
      { column: 'Số CCCD Phụ huynh 1', rule: 'Tùy chọn. 12 chữ số căn cước công dân.', required: false },
      { column: 'Họ tên Phụ huynh 2', rule: 'Tùy chọn. Tên mẹ hoặc người giám hộ thứ hai.', required: false },
      { column: 'Quan hệ PH 2', rule: 'Tùy chọn. Điền "Mẹ", "Bố" hoặc quan hệ gia đình.', required: false },
      { column: 'Số ĐT Phụ huynh 2', rule: 'Tùy chọn. Số ĐT di động của phụ huynh 2 nếu có.', required: false },
      { column: 'Số CCCD Phụ huynh 2', rule: 'Tùy chọn. 12 chữ số căn cước công dân của PH 2.', required: false },
      { column: 'Ghi chú dị ứng/sức khỏe', rule: 'Tùy chọn. Ghi rõ dị ứng thực phẩm, thuốc hoặc bệnh lý nền để nhà bếp/GV lưu ý.', required: false },
    ];

    return buildImportTemplateWorkbook({
      sheetName: 'Danh sách học sinh',
      title: 'MẪU NHẬP HỌC SINH MỚI ĐẦU NĂM',
      columns,
      sampleRows,
      instructions,
    });
  }

  /**
   * 2. Xem trước và kiểm tra tính hợp lệ của file Excel tải lên
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

    // Tìm dòng tiêu đề cột (dòng chứa từ khóa "Họ và tên" hoặc "Họ tên")
    let headerRowNumber = 1;
    for (let r = 1; r <= Math.min(10, worksheet.rowCount); r++) {
      const row = worksheet.getRow(r);
      const text = (row.values || []).join(' ');
      if (/họ và tên|họ tên/i.test(text)) {
        headerRowNumber = r;
        break;
      }
    }

    // Đọc danh sách lớp học hiện có để kiểm tra tên lớp
    const existingClasses = await prisma.class.findMany({
      where: { deleted_at: null },
      select: { class_id: true, name: true, public_id: true },
    });
    const classMap = new Map();
    existingClasses.forEach((c) => {
      classMap.set(c.name.trim().toLowerCase(), c);
    });

    // Đọc danh sách mã học sinh hiện có
    const existingCodes = await prisma.student.findMany({
      where: { deleted_at: null },
      select: { student_code: true },
    });
    const codeSet = new Set(existingCodes.map((s) => s.student_code.toUpperCase()));

    const rows = [];
    let validCount = 0;
    let invalidCount = 0;
    const seenCodesInBatch = new Set();

    for (let r = headerRowNumber + 1; r <= worksheet.rowCount; r++) {
      const row = worksheet.getRow(r);
      // Bỏ qua dòng trống
      const rawFullName = row.getCell(2).value;
      if (!rawFullName && !row.getCell(3).value && !row.getCell(10).value) {
        continue;
      }

      const rowErrors = [];

      const rawCode = String(row.getCell(1).value || '').trim().toUpperCase();
      const fullName = String(rawFullName || '').trim();
      const rawDob = row.getCell(3).value;
      const rawGender = String(row.getCell(4).value || '').trim();
      const ethnic = String(row.getCell(5).value || 'Kinh').trim();
      const placeOfBirth = String(row.getCell(6).value || '').trim();
      const permanentResidence = String(row.getCell(7).value || '').trim();
      const rawClassName = String(row.getCell(8).value || '').trim();
      const rawEnrollmentDate = row.getCell(9).value;
      const parentName = String(row.getCell(10).value || '').trim();
      const rawRelation = String(row.getCell(11).value || 'Bố').trim();
      const parentPhone = String(row.getCell(12).value || '').replace(/\D/g, '');
      const parentCitizenId = String(row.getCell(13).value || '').replace(/\D/g, '');

      // Optional Parent 2 (tối đa 2 phụ huynh)
      let parent2Name = '';
      let parent2Relation = 'Mẹ';
      let parent2Phone = '';
      let parent2CitizenId = '';
      let allergyNotes = '';

      if (row.cellCount >= 16 || (row.getCell(14).value && row.getCell(16).value)) {
        parent2Name = String(row.getCell(14).value || '').trim();
        parent2Relation = String(row.getCell(15).value || 'Mẹ').trim();
        parent2Phone = String(row.getCell(16).value || '').replace(/\D/g, '');
        parent2CitizenId = String(row.getCell(17).value || '').replace(/\D/g, '');
        allergyNotes = String(row.getCell(18).value || '').trim();
      } else {
        allergyNotes = String(row.getCell(14).value || '').trim();
      }

      // Validate Họ tên
      if (!fullName || fullName.length < 2) {
        rowErrors.push('Họ và tên học sinh không được để trống.');
      }

      // Validate Ngày sinh
      const dob = parseExcelDate(rawDob);
      if (!dob) {
        rowErrors.push('Ngày sinh không hợp lệ (cần định dạng dd/mm/yyyy).');
      } else {
        const now = new Date();
        const ageInDays = (now.getTime() - dob.getTime()) / (1000 * 3600 * 24);
        if (dob.getTime() > now.getTime()) {
          rowErrors.push('Ngày sinh không được ở tương lai.');
        } else if (ageInDays < 180 || ageInDays > 2555) {
          rowErrors.push('Độ tuổi học sinh phải từ 6 tháng đến 7 tuổi.');
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

      // Validate Mã học sinh
      if (rawCode) {
        if (codeSet.has(rawCode)) {
          rowErrors.push(`Mã học sinh '${rawCode}' đã tồn tại trong hệ thống.`);
        } else if (seenCodesInBatch.has(rawCode)) {
          rowErrors.push(`Mã học sinh '${rawCode}' bị trùng lặp trong file tải lên.`);
        } else {
          seenCodesInBatch.add(rawCode);
        }
      }

      // Validate Phụ huynh 1
      if (!parentName || parentName.length < 2) {
        rowErrors.push('Họ tên phụ huynh 1 không được để trống.');
      }
      if (!parentPhone || !/^0\d{9}$/.test(parentPhone)) {
        rowErrors.push('Số điện thoại phụ huynh 1 phải là 10 số di động hợp lệ (bắt đầu bằng số 0).');
      }

      // Validate Phụ huynh 2 (nếu có điền)
      if (parent2Phone && !/^0\d{9}$/.test(parent2Phone)) {
        rowErrors.push('Số điện thoại phụ huynh 2 phải là 10 số di động hợp lệ (bắt đầu bằng số 0).');
      }

      // Validate Lớp học (nếu có điền)
      let matchedClass = null;
      if (rawClassName) {
        matchedClass = classMap.get(rawClassName.toLowerCase());
        if (!matchedClass) {
          rowErrors.push(`Không tìm thấy lớp học có tên '${rawClassName}'.`);
        }
      }

      const isValid = rowErrors.length === 0;
      if (isValid) validCount++;
      else invalidCount++;

      rows.push({
        rowNumber: r,
        studentCode: rawCode || null,
        fullName,
        dateOfBirth: dob ? formatDateDMY(dob) : rawDob,
        dateOfBirthRaw: dob ? dob.toISOString() : null,
        gender: genderEnum,
        genderLabel: genderEnum === 'MALE' ? 'Nam' : 'Nữ',
        ethnic: ethnic || 'Kinh',
        placeOfBirth: placeOfBirth || null,
        permanentResidence: permanentResidence || null,
        className: rawClassName || null,
        classId: matchedClass ? matchedClass.class_id.toString() : null,
        classPublicId: matchedClass ? matchedClass.public_id : null,
        enrollmentDate: parseExcelDate(rawEnrollmentDate) ? formatDateDMY(parseExcelDate(rawEnrollmentDate)) : formatDateDMY(new Date()),
        enrollmentDateRaw: parseExcelDate(rawEnrollmentDate) ? parseExcelDate(rawEnrollmentDate).toISOString() : new Date().toISOString(),
        parentName,
        relationship: rawRelation || 'Bố',
        parentPhone,
        parentCitizenId: parentCitizenId || null,
        parent2Name: parent2Name || null,
        parent2Relation: parent2Relation || null,
        parent2Phone: parent2Phone || null,
        parent2CitizenId: parent2CitizenId || null,
        allergyNotes: allergyNotes || null,
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
   * 3. Thực thi Import danh sách học sinh hợp lệ vào Database
   */
  async importStudents(studentsToImport, actorId) {
    if (!Array.isArray(studentsToImport) || studentsToImport.length === 0) {
      throw new BadRequest('Danh sách học sinh nhập không được để trống.');
    }

    const currentYear = new Date().getFullYear();
    const yearSuffix = String(currentYear).slice(-2);
    const prefix = `HS${yearSuffix}`;

    // Tìm max sequence hiện tại
    const existing = await prisma.student.findMany({
      where: { student_code: { startsWith: prefix, mode: 'insensitive' } },
      select: { student_code: true },
    });
    let maxSeq = 0;
    const regex = new RegExp(`^${prefix}(\\d{3})$`, 'i');
    for (const s of existing) {
      const match = s.student_code.match(regex);
      if (match) {
        const num = parseInt(match[1], 10);
        if (num > maxSeq) maxSeq = num;
      }
    }

    const results = {
      total: studentsToImport.length,
      successCount: 0,
      failedCount: 0,
      errors: [],
    };

    for (const item of studentsToImport) {
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
          // Sinh mã học sinh nếu chưa có
          let studentCode = item.studentCode;
          if (!studentCode) {
            maxSeq++;
            studentCode = `${prefix}${String(maxSeq).padStart(3, '0')}`;
          }

          // 1. Tạo Student
          const dob = item.dateOfBirthRaw ? new Date(item.dateOfBirthRaw) : new Date(item.dateOfBirth);
          const enrollDate = item.enrollmentDateRaw ? new Date(item.enrollmentDateRaw) : new Date();

          const student = await tx.student.create({
            data: {
              student_code: studentCode,
              full_name: item.fullName,
              date_of_birth: dob,
              gender: item.gender || 'MALE',
              ethnic: item.ethnic || 'Kinh',
              nationality: 'Việt Nam',
              place_of_birth: item.placeOfBirth || null,
              permanent_residence: item.permanentResidence || null,
              current_residence: item.permanentResidence || null,
              status: 'STUDYING',
              enrollment_date: enrollDate,
              allergy_notes: item.allergyNotes || null,
              medical_notes: null,
              avatar_url: `https://api.dicebear.com/10.x/critters/svg?seed=${encodeURIComponent(studentCode)}`,
            },
          });

          // 2. Tạo Phụ huynh 1
          await tx.parent.create({
            data: {
              student_id: student.student_id,
              full_name: item.parentName,
              relationship: item.relationship || 'Bố',
              phone: item.parentPhone,
              citizen_id: item.parentCitizenId || null,
            },
          });

          // Tạo Phụ huynh 2 nếu có (tối đa 2 phụ huynh theo nghiệp vụ)
          if (item.parent2Name && item.parent2Phone) {
            await tx.parent.create({
              data: {
                student_id: student.student_id,
                full_name: item.parent2Name,
                relationship: item.parent2Relation || 'Mẹ',
                phone: item.parent2Phone,
                citizen_id: item.parent2CitizenId || null,
              },
            });
          }

          // 3. Xếp lớp nếu có chỉ định lớp
          if (item.classId) {
            await tx.studentEnrollment.create({
              data: {
                student_id: student.student_id,
                class_id: BigInt(item.classId),
                enrolled_at: enrollDate,
                status: 'ENROLLED',
              },
            });
          }
        });

        results.successCount++;
      } catch (err) {
        logger.error(`[StudentImport] Error importing row ${item.rowNumber} (${item.fullName}):`, err);
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
   * 4. Xuất danh sách học sinh ra file Excel theo bộ lọc
   */
  async exportStudentsExcel({ schoolYearId, classId, status, gender, search }) {
    const where = { deleted_at: null };

    const normalizedStatus = status && status !== 'ALL' ? String(status).toUpperCase() : null;
    const isHistoricalStatus =
      normalizedStatus && ['RESERVED', 'TRANSFERRED', 'DROPPED_OUT', 'DROPPED', 'GRADUATED'].includes(normalizedStatus);

    if (normalizedStatus) {
      where.status = normalizedStatus;
    }
    if (gender && gender !== 'ALL') {
      where.gender = gender;
    }
    if (search && search.trim()) {
      const q = search.trim();
      where.OR = [
        { full_name: { contains: q, mode: 'insensitive' } },
        { student_code: { contains: q, mode: 'insensitive' } },
        { parents: { some: { phone: { contains: q } } } },
      ];
    }

    // Filter by class or school year
    if (classId) {
      const targetClass = await prisma.class.findFirst({
        where: {
          OR: [
            { public_id: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(classId) ? classId : undefined },
            { class_id: /^\d+$/.test(classId) ? BigInt(classId) : undefined },
          ].filter(Boolean),
        },
      });
      if (targetClass) {
        where.student_enrollments = {
          some: { class_id: targetClass.class_id, status: 'ENROLLED' },
        };
      }
    } else if (schoolYearId) {
      if (isHistoricalStatus) {
        where.OR = [
          {
            student_enrollments: {
              some: {
                class: {
                  OR: [
                    { school_year: { public_id: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(schoolYearId) ? schoolYearId : undefined } },
                    { school_year_id: /^\d+$/.test(schoolYearId) ? BigInt(schoolYearId) : undefined },
                  ].filter(Boolean),
                },
              },
            },
          },
          {
            student_enrollments: { none: {} },
          },
        ];
      } else {
        where.student_enrollments = {
          some: {
            class: {
              OR: [
                { school_year: { public_id: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(schoolYearId) ? schoolYearId : undefined } },
                { school_year_id: /^\d+$/.test(schoolYearId) ? BigInt(schoolYearId) : undefined },
              ].filter(Boolean),
            },
            status: 'ENROLLED',
          },
        };
      }
    }

    const students = await prisma.student.findMany({
      where,
      include: {
        parents: { where: { deleted_at: null }, orderBy: { parent_id: 'asc' }, take: 2 },
        student_enrollments: {
          where: { status: 'ENROLLED' },
          include: { class: { select: { name: true, age_group: true } } },
          orderBy: { enrolled_at: 'desc' },
          take: 1,
        },
      },
      orderBy: [{ student_code: 'asc' }],
    });

    const { workbook, worksheet } = createStandardWorkbook('Danh sách học sinh');

    const totalCols = 15;
    const startRow = addSchoolHeaderBanner(worksheet, {
      title: 'DANH SÁCH HỌC SINH TOÀN TRƯỜNG',
      subtitle: `Tổng số học sinh: ${students.length}`,
      totalCols,
    });

    const headerRow = worksheet.addRow([
      'STT',
      'Mã học sinh',
      'Họ và tên',
      'Ngày sinh',
      'Giới tính',
      'Lớp học',
      'Trạng thái',
      'Họ tên Phụ huynh 1',
      'Quan hệ PH 1',
      'Số điện thoại PH 1',
      'Họ tên Phụ huynh 2',
      'Quan hệ PH 2',
      'Số điện thoại PH 2',
      'Địa chỉ thường trú',
      'Ghi chú sức khỏe/dị ứng',
    ]);
    applyHeaderStyles(headerRow);

    if (students.length === 0) {
      const emptyRow = worksheet.addRow(['(Không có dữ liệu học sinh phù hợp với bộ lọc hiện tại)']);
      worksheet.mergeCells(startRow + 1, 1, startRow + 1, totalCols);
      emptyRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
      emptyRow.getCell(1).font = { italic: true, color: { argb: 'FF888888' }, size: 11 };
      applyZebraAndBorders(worksheet, startRow + 1, startRow + 1);
    } else {
      students.forEach((s, idx) => {
        const p1 = s.parents?.[0];
        const p2 = s.parents?.[1];
        const enrollment = s.student_enrollments?.[0];
        const statusMap = {
          STUDYING: 'Đang học',
          TRANSFERRED: 'Chuyển trường',
          GRADUATED: 'Đã tốt nghiệp',
          RESERVED: 'Bảo lưu',
          DROPPED: 'Thôi học',
          DROPPED_OUT: 'Thôi học',
        };

        worksheet.addRow([
          idx + 1,
          s.student_code,
          s.full_name,
          formatDateDMY(s.date_of_birth),
          s.gender === 'MALE' ? 'Nam' : 'Nữ',
          enrollment?.class?.name || 'Chưa xếp lớp',
          statusMap[s.status] || s.status,
          p1?.full_name || '',
          p1?.relationship || '',
          p1?.phone || '',
          p2?.full_name || '',
          p2?.relationship || '',
          p2?.phone || '',
          s.permanent_residence || s.current_residence || '',
          s.allergy_notes || '',
        ]);
      });

      const endRow = startRow + students.length;
      applyZebraAndBorders(worksheet, startRow + 1, endRow);
    }
    autoFitColumns(worksheet);

    return workbook.xlsx.writeBuffer();
  }
}

export const studentImportExportService = new StudentImportExportService();
export default studentImportExportService;
