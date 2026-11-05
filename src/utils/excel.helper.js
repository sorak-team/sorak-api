import ExcelJS from 'exceljs';

/**
 * Common Excel styling and utility helpers for Sorak Preschool Management System
 */

export const EXCEL_COLORS = {
  PRIMARY_HEADER: '1E40AF',   // Sorak Deep Blue
  SECONDARY_HEADER: '3B82F6', // Blue Accent
  SUB_HEADER: 'E0E7FF',       // Light Indigo
  ZEBRA_ROW: 'F9FAFB',        // Light Gray
  BORDER: 'D1D5DB',           // Cool Gray Border
  TEXT_MAIN: '111827',        // Gray 900
  TEXT_MUTED: '6B7280',       // Gray 500
  SUCCESS_BG: 'DEF7EC',       // Light Green
  SUCCESS_TEXT: '03543F',     // Dark Green
  ERROR_BG: 'FDE8E8',         // Light Red
  ERROR_TEXT: '9B1C1C',       // Dark Red
  WARNING_BG: 'FEF08A',       // Light Yellow
};

/**
 * Creates a standard styled workbook with metadata and gridlines
 */
export function createStandardWorkbook(sheetName = 'Sheet1') {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Sorak Preschool Management System';
  workbook.lastModifiedBy = 'Sorak Admin';
  workbook.created = new Date();
  workbook.modified = new Date();

  const worksheet = workbook.addWorksheet(sheetName, {
    views: [{ showGridLines: true }],
    pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true },
  });

  return { workbook, worksheet };
}

/**
 * Adds an official School Header Banner
 */
export function addSchoolHeaderBanner(worksheet, { title, subtitle, schoolYearName, totalCols = 10 }) {
  // Line 1: School Name
  const row1 = worksheet.addRow(['TRƯỜNG MẦM NON HÒN TRE · SORAK']);
  worksheet.mergeCells(1, 1, 1, totalCols);
  row1.getCell(1).font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FF4B5563' } };
  row1.getCell(1).alignment = { horizontal: 'left', vertical: 'middle' };
  row1.height = 20;

  // Line 2: Main Document Title
  const row2 = worksheet.addRow([title.toUpperCase()]);
  worksheet.mergeCells(2, 1, 2, totalCols);
  row2.getCell(1).font = { name: 'Segoe UI', size: 15, bold: true, color: { argb: `FF${EXCEL_COLORS.PRIMARY_HEADER}` } };
  row2.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
  row2.height = 32;

  // Line 3: Subtitle / School Year / Export Date
  const subText = [
    schoolYearName ? `Niên khóa: ${schoolYearName}` : null,
    subtitle || null,
    `Ngày xuất: ${new Date().toLocaleDateString('vi-VN')}`,
  ].filter(Boolean).join('  |  ');

  const row3 = worksheet.addRow([subText]);
  worksheet.mergeCells(3, 1, 3, totalCols);
  row3.getCell(1).font = { name: 'Segoe UI', size: 10, italic: true, color: { argb: `FF${EXCEL_COLORS.TEXT_MUTED}` } };
  row3.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
  row3.height = 20;

  // Empty spacer row
  worksheet.addRow([]);
  return 5; // Next row index for table header
}

/**
 * Applies header row styling
 */
export function applyHeaderStyles(headerRow, bgColor = EXCEL_COLORS.PRIMARY_HEADER) {
  headerRow.height = 28;
  headerRow.eachCell((cell) => {
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: `FF${bgColor}` },
    };
    cell.font = {
      name: 'Segoe UI',
      size: 11,
      bold: true,
      color: { argb: 'FFFFFFFF' },
    };
    cell.alignment = {
      vertical: 'middle',
      horizontal: 'center',
      wrapText: true,
    };
    cell.border = {
      top: { style: 'thin', color: { argb: `FF${EXCEL_COLORS.BORDER}` } },
      left: { style: 'thin', color: { argb: `FF${EXCEL_COLORS.BORDER}` } },
      bottom: { style: 'medium', color: { argb: 'FF1E3A8A' } },
      right: { style: 'thin', color: { argb: `FF${EXCEL_COLORS.BORDER}` } },
    };
  });
}

/**
 * Applies zebra striping and thin borders to table rows
 */
export function applyZebraAndBorders(worksheet, startRowNumber, endRowNumber) {
  for (let r = startRowNumber; r <= endRowNumber; r++) {
    const row = worksheet.getRow(r);
    const isEven = r % 2 === 0;
    row.height = 22;

    row.eachCell({ includeEmpty: true }, (cell) => {
      if (isEven && !cell.fill) {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: `FF${EXCEL_COLORS.ZEBRA_ROW}` },
        };
      }
      cell.border = {
        top: { style: 'thin', color: { argb: `FF${EXCEL_COLORS.BORDER}` } },
        left: { style: 'thin', color: { argb: `FF${EXCEL_COLORS.BORDER}` } },
        bottom: { style: 'thin', color: { argb: `FF${EXCEL_COLORS.BORDER}` } },
        right: { style: 'thin', color: { argb: `FF${EXCEL_COLORS.BORDER}` } },
      };
      if (!cell.font) {
        cell.font = { name: 'Segoe UI', size: 10, color: { argb: `FF${EXCEL_COLORS.TEXT_MAIN}` } };
      }
      if (!cell.alignment) {
        cell.alignment = { vertical: 'middle' };
      }
    });
  }
}

export const applyZebraRows = applyZebraAndBorders;

/**
 * Auto-fit column widths with min & max boundaries
 */
export function autoFitColumns(worksheet, customWidths = {}) {
  worksheet.columns.forEach((column) => {
    const colNumber = column.number;
    if (customWidths[colNumber]) {
      column.width = customWidths[colNumber];
      return;
    }

    let maxLength = 10;
    column.eachCell({ includeEmpty: false }, (cell, rowNumber) => {
      if (rowNumber <= 3) return; // Skip title banner rows
      const val = cell.value ? String(cell.value) : '';
      if (val.length > maxLength) {
        maxLength = val.length;
      }
    });

    column.width = Math.min(Math.max(maxLength + 4, 12), 40);
  });
}

/**
 * Safely parse date from various Excel inputs (Date object, dd/mm/yyyy string, serial number)
 */
export function parseExcelDate(val) {
  if (!val) return null;

  if (val instanceof Date && !isNaN(val.getTime())) {
    return val;
  }

  if (typeof val === 'number') {
    // Excel serial date to JS Date
    const excelEpoch = new Date(Date.UTC(1899, 11, 30));
    return new Date(excelEpoch.getTime() + val * 86400000);
  }

  if (typeof val === 'string') {
    const trimmed = val.trim();
    // Match dd/mm/yyyy or d/m/yyyy
    const dmyMatch = trimmed.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/);
    if (dmyMatch) {
      const day = parseInt(dmyMatch[1], 10);
      const month = parseInt(dmyMatch[2], 10) - 1;
      const year = parseInt(dmyMatch[3], 10);
      const parsed = new Date(year, month, day);
      if (!isNaN(parsed.getTime())) return parsed;
    }

    // Match yyyy-mm-dd
    const ymdMatch = trimmed.match(/^(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})$/);
    if (ymdMatch) {
      const year = parseInt(ymdMatch[1], 10);
      const month = parseInt(ymdMatch[2], 10) - 1;
      const day = parseInt(ymdMatch[3], 10);
      const parsed = new Date(year, month, day);
      if (!isNaN(parsed.getTime())) return parsed;
    }
  }

  return null;
}

/**
 * Format a Date object to dd/mm/yyyy
 */
export function formatDateDMY(date) {
  if (!date) return '';
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return '';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

/**
 * Helper to build a standard Template Workbook with Instructions sheet
 */
export async function buildImportTemplateWorkbook({
  sheetName = 'Dữ liệu nhập',
  title = 'MẪU DỮ LIỆU NHẬP',
  columns = [],
  sampleRows = [],
  instructions = [],
}) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Sorak Preschool';

  // 1. Data Sheet
  const dataSheet = workbook.addWorksheet(sheetName, {
    views: [{ showGridLines: true }],
  });

  // Banner
  const startRow = addSchoolHeaderBanner(dataSheet, {
    title,
    subtitle: 'Vui lòng đọc sheet "Hướng dẫn" trước khi nhập dữ liệu',
    totalCols: columns.length,
  });

  // Header row
  const headerValues = columns.map((c) => c.header + (c.required ? ' *' : ''));
  const headerRow = dataSheet.addRow(headerValues);
  applyHeaderStyles(headerRow);

  // Sample rows
  sampleRows.forEach((rowVals) => {
    dataSheet.addRow(rowVals);
  });

  const endRow = startRow + sampleRows.length;
  applyZebraAndBorders(dataSheet, startRow + 1, endRow);
  autoFitColumns(dataSheet);

  // 2. Instructions Sheet
  const guideSheet = workbook.addWorksheet('Hướng dẫn nhập', {
    views: [{ showGridLines: true }],
  });

  const guideTitle = guideSheet.addRow(['HƯỚNG DẪN NHẬP DỮ LIỆU CHUẨN']);
  guideSheet.mergeCells(1, 1, 1, 3);
  guideTitle.getCell(1).font = { name: 'Segoe UI', size: 14, bold: true, color: { argb: `FF${EXCEL_COLORS.PRIMARY_HEADER}` } };
  guideTitle.height = 28;

  const guideHeader = guideSheet.addRow(['Tên cột', 'Quy định / Định dạng', 'Bắt buộc']);
  applyHeaderStyles(guideHeader, EXCEL_COLORS.SECONDARY_HEADER);

  instructions.forEach((inst) => {
    guideSheet.addRow([inst.column, inst.rule, inst.required ? 'Bắt buộc' : 'Tùy chọn']);
  });

  applyZebraAndBorders(guideSheet, 3, 2 + instructions.length);
  autoFitColumns(guideSheet);

  return workbook.xlsx.writeBuffer();
}

