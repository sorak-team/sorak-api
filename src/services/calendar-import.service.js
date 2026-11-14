import ExcelJS from 'exceljs';
import prisma from '../config/prisma.js';
import { BadRequest, NotFound } from '../utils/http-error.js';
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

export class CalendarImportService {
  /**
   * 1. Sinh file Excel mẫu lịch năm học & ngày lễ
   */
  async getImportTemplate() {
    const columns = [
      { header: 'Tên sự kiện / Ngày nghỉ', key: 'name', required: true },
      { header: 'Ngày bắt đầu (dd/mm/yyyy)', key: 'start_date', required: true },
      { header: 'Ngày kết thúc (dd/mm/yyyy)', key: 'end_date', required: true },
      { header: 'Có được dạy học không? (Có/Không)', key: 'is_teaching_allowed', required: false },
      { header: 'Khối lớp áp dụng', key: 'target_grades', required: false },
      { header: 'Mô tả / Ghi chú', key: 'description', required: false },
    ];

    const sampleRows = [
      [
        'Lễ Khai Giảng Năm Học Mới',
        '05/09/2026',
        '05/09/2026',
        'Có',
        'Tất cả',
        'Toàn trường tổ chức lễ khai giảng ngày hội bé đến trường',
      ],
      [
        'Nghỉ Tết Nguyên Đán Bính Ngọ',
        '14/02/2026',
        '22/02/2026',
        'Không',
        'Tất cả',
        'Nghỉ Tết Nguyên Đán theo quy định của Bộ GD&ĐT',
      ],
      [
        'Lễ Hội Bé Vui Tết Trung Thu',
        '25/09/2026',
        '25/09/2026',
        'Có',
        'MAM, CHOI, LA',
        'Hoạt động ngoại khóa rước đèn phá cỗ tại sân trường',
      ],
    ];

    const instructions = [
      { column: 'Tên sự kiện / Ngày nghỉ', rule: 'Bắt buộc. Tên ngày lễ, sự kiện trường hoặc kỳ nghỉ (ví dụ: Nghỉ Quốc khánh 2/9, Nghỉ Tết).', required: true },
      { column: 'Ngày bắt đầu', rule: 'Bắt buộc. Định dạng dd/mm/yyyy.', required: true },
      { column: 'Ngày kết thúc', rule: 'Bắt buộc. Định dạng dd/mm/yyyy. Phải lớn hơn hoặc bằng ngày bắt đầu.', required: true },
      { column: 'Có được dạy học không?', rule: 'Tùy chọn. Điền "Có" (nếu có tổ chức sự kiện/dạy học) hoặc "Không" (nếu nghỉ hoàn toàn toàn trường). Mặc định: "Không".', required: false },
      { column: 'Khối lớp áp dụng', rule: 'Tùy chọn. Điền "Tất cả" hoặc các mã khối: NHA_TRE, MAM, CHOI, LA. Mặc định: "Tất cả".', required: false },
      { column: 'Mô tả / Ghi chú', rule: 'Tùy chọn. Thông tin hướng dẫn chi tiết cho giáo viên và phụ huynh.', required: false },
    ];

    return buildImportTemplateWorkbook({
      sheetName: 'Lịch năm học',
      title: 'MẪU NHẬP LỊCH & NGÀY NGHỈ NĂM HỌC',
      columns,
      sampleRows,
      instructions,
    });
  }

  /**
   * Helper tìm schoolYear theo ID hoặc Public ID
   */
  async _resolveSchoolYear(id) {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(id).trim());
    return prisma.schoolYear.findFirst({
      where: {
        OR: [
          isUuid ? { public_id: id } : undefined,
          /^\d+$/.test(id) ? { school_year_id: BigInt(id) } : undefined,
        ].filter(Boolean),
        deleted_at: null,
      },
    });
  }

  /**
   * 2. Xem trước và kiểm tra tính hợp lệ của file Excel lịch năm học tải lên
   */
  async previewImport(fileBuffer, schoolYearId) {
    if (!fileBuffer || fileBuffer.length === 0) {
      throw new BadRequest('Tệp tải lên không được để trống.');
    }

    const schoolYear = await this._resolveSchoolYear(schoolYearId);
    if (!schoolYear) {
      throw new NotFound('Không tìm thấy thông tin năm học.');
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

    let headerRowNumber = 1;
    for (let r = 1; r <= Math.min(10, worksheet.rowCount); r++) {
      const row = worksheet.getRow(r);
      const text = (row.values || []).join(' ');
      if (/tên sự kiện|ngày nghỉ/i.test(text)) {
        headerRowNumber = r;
        break;
      }
    }

    const syStart = new Date(schoolYear.start_date);
    const syEnd = new Date(schoolYear.end_date);

    const rows = [];
    let validCount = 0;
    let invalidCount = 0;

    for (let r = headerRowNumber + 1; r <= worksheet.rowCount; r++) {
      const row = worksheet.getRow(r);
      const rawName = row.getCell(1).value;
      if (!rawName && !row.getCell(2).value) {
        continue;
      }

      const rowErrors = [];
      const name = String(rawName || '').trim();
      const rawStart = row.getCell(2).value;
      const rawEnd = row.getCell(3).value;
      const rawTeaching = String(row.getCell(4).value || '').trim();
      const rawGrades = String(row.getCell(5).value || 'Tất cả').trim();
      const description = String(row.getCell(6).value || '').trim();

      if (!name || name.length < 2) {
        rowErrors.push('Tên sự kiện / ngày nghỉ không được để trống.');
      }

      const startDate = parseExcelDate(rawStart);
      const endDate = parseExcelDate(rawEnd);

      if (!startDate) {
        rowErrors.push('Ngày bắt đầu không hợp lệ (cần định dạng dd/mm/yyyy).');
      }
      if (!endDate) {
        rowErrors.push('Ngày kết thúc không hợp lệ (cần định dạng dd/mm/yyyy).');
      }

      if (startDate && endDate) {
        if (startDate.getTime() > endDate.getTime()) {
          rowErrors.push('Ngày bắt đầu không được lớn hơn ngày kết thúc.');
        }
        if (startDate.getTime() < syStart.getTime() - 86400000 * 30 || endDate.getTime() > syEnd.getTime() + 86400000 * 30) {
          rowErrors.push(`Khoảng thời gian cần nằm trong niên khóa (${formatDateDMY(syStart)} - ${formatDateDMY(syEnd)}).`);
        }
      }

      const isTeachingAllowed = /^có$/i.test(rawTeaching);

      let targetGrades = [];
      if (/tất cả/i.test(rawGrades) || !rawGrades) {
        targetGrades = ['NHA_TRE', 'MAM', 'CHOI', 'LA'];
      } else {
        const parts = rawGrades.split(/[,;\s]+/).map((p) => p.toUpperCase().trim()).filter(Boolean);
        const validGrades = ['NHA_TRE', 'MAM', 'CHOI', 'LA'];
        targetGrades = parts.filter((p) => validGrades.includes(p));
        if (targetGrades.length === 0) {
          targetGrades = ['NHA_TRE', 'MAM', 'CHOI', 'LA'];
        }
      }

      const isValid = rowErrors.length === 0;
      if (isValid) validCount++;
      else invalidCount++;

      rows.push({
        rowNumber: r,
        name,
        startDate: startDate ? formatDateDMY(startDate) : rawStart,
        startDateRaw: startDate ? startDate.toISOString() : null,
        endDate: endDate ? formatDateDMY(endDate) : rawEnd,
        endDateRaw: endDate ? endDate.toISOString() : null,
        isTeachingAllowed,
        isTeachingAllowedLabel: isTeachingAllowed ? 'Có' : 'Không',
        targetGrades,
        targetGradesLabel: targetGrades.join(', '),
        description: description || null,
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
      schoolYear: {
        name: schoolYear.name,
        startDate: formatDateDMY(schoolYear.start_date),
        endDate: formatDateDMY(schoolYear.end_date),
      },
      previewData: rows,
    };
  }

  /**
   * 3. Thực thi Import lịch năm học vào Database
   */
  async importCalendar(holidaysToImport, schoolYearId, actorAccountId) {
    if (!Array.isArray(holidaysToImport) || holidaysToImport.length === 0) {
      throw new BadRequest('Danh sách lịch/ngày nghỉ không được để trống.');
    }

    const schoolYear = await this._resolveSchoolYear(schoolYearId);
    if (!schoolYear) {
      throw new NotFound('Không tìm thấy thông tin năm học.');
    }

    const results = {
      total: holidaysToImport.length,
      successCount: 0,
      failedCount: 0,
      errors: [],
    };

    for (const item of holidaysToImport) {
      if (!item.isValid && item.errors && item.errors.length > 0) {
        results.failedCount++;
        results.errors.push({
          rowNumber: item.rowNumber,
          name: item.name,
          reasons: item.errors,
        });
        continue;
      }

      try {
        const start = item.startDateRaw ? new Date(item.startDateRaw) : new Date(item.startDate);
        const end = item.endDateRaw ? new Date(item.endDateRaw) : new Date(item.endDate);

        await prisma.schoolHoliday.create({
          data: {
            school_year_id: schoolYear.school_year_id,
            name: item.name,
            start_date: start,
            end_date: end,
            is_teaching_allowed: !!item.isTeachingAllowed,
            target_grades: Array.isArray(item.targetGrades) ? item.targetGrades : ['NHA_TRE', 'MAM', 'CHOI', 'LA'],
            description: item.description || null,
            created_by: BigInt(actorAccountId || 1),
          },
        });

        results.successCount++;
      } catch (err) {
        logger.error(`[CalendarImport] Error inserting holiday ${item.name}:`, err);
        results.failedCount++;
        results.errors.push({
          rowNumber: item.rowNumber,
          name: item.name,
          reasons: [err.message || 'Lỗi lưu trữ cơ sở dữ liệu.'],
        });
      }
    }

    return results;
  }

  /**
   * 4. Xuất toàn bộ Lịch năm học & Ngày lễ ra file Excel
   */
  async exportCalendarExcel(schoolYearId) {
    const schoolYear = await this._resolveSchoolYear(schoolYearId);
    if (!schoolYear) {
      throw new NotFound('Không tìm thấy thông tin năm học.');
    }

    const holidays = await prisma.schoolHoliday.findMany({
      where: {
        school_year_id: schoolYear.school_year_id,
        deleted_at: null,
      },
      orderBy: [{ start_date: 'asc' }, { holiday_id: 'asc' }],
    });

    const { workbook, worksheet } = createStandardWorkbook('Lịch năm học');

    const totalCols = 8;
    const startRow = addSchoolHeaderBanner(worksheet, {
      title: `LỊCH HOẠT ĐỘNG & NGÀY NGHỈ NĂM HỌC ${schoolYear.name}`,
      subtitle: `Thời gian: ${formatDateDMY(schoolYear.start_date)} - ${formatDateDMY(schoolYear.end_date)}  |  Tổng số: ${holidays.length} sự kiện/ngày nghỉ`,
      totalCols,
    });

    const headerRow = worksheet.addRow([
      'STT',
      'Tên sự kiện / Ngày nghỉ',
      'Ngày bắt đầu',
      'Ngày kết thúc',
      'Số ngày',
      'Được tổ chức dạy học',
      'Khối lớp áp dụng',
      'Mô tả / Ghi chú',
    ]);
    applyHeaderStyles(headerRow);

    const gradeMap = {
      NHA_TRE: 'Nhà trẻ',
      MAM: 'Mầm',
      CHOI: 'Chồi',
      LA: 'Lá',
    };

    holidays.forEach((h, idx) => {
      const start = new Date(h.start_date);
      const end = new Date(h.end_date);
      const diffDays = Math.max(1, Math.round((end - start) / (1000 * 60 * 60 * 24)) + 1);

      let targetGradesLabel = 'Tất cả';
      if (Array.isArray(h.target_grades) && h.target_grades.length > 0 && h.target_grades.length < 4) {
        targetGradesLabel = h.target_grades.map((g) => gradeMap[g] || g).join(', ');
      }

      worksheet.addRow([
        idx + 1,
        h.name,
        formatDateDMY(h.start_date),
        formatDateDMY(h.end_date),
        diffDays,
        h.is_teaching_allowed ? 'Có' : 'Không (Nghỉ)',
        targetGradesLabel,
        h.description || '',
      ]);
    });

    const endRow = startRow + holidays.length;
    applyZebraAndBorders(worksheet, startRow + 1, endRow);
    autoFitColumns(worksheet);

    return workbook.xlsx.writeBuffer();
  }
}

export const calendarImportService = new CalendarImportService();
export default calendarImportService;
