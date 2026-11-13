import prisma from '../config/prisma.js';
import statisticsService from './statistics.service.js';
import {
  createStandardWorkbook,
  addSchoolHeaderBanner,
  applyHeaderStyles,
  applyZebraAndBorders,
  autoFitColumns,
  EXCEL_COLORS,
} from '../utils/excel.helper.js';

const AGE_GROUP_NAMES = {
  NHA_TRE: 'Khối Nhà trẻ (24-36 tháng)',
  MAM: 'Khối Mầm (3-4 tuổi)',
  CHOI: 'Khối Chồi (4-5 tuổi)',
  LA: 'Khối Lá (5-6 tuổi)',
};

const AGE_GROUP_ORDER = {
  NHA_TRE: 1,
  MAM: 2,
  CHOI: 3,
  LA: 4,
};

export class StatisticsExportService {
  /**
   * Xuất Báo cáo Thống kê Toàn trường đa sheet đầy đủ các bảng và chỉ số
   * Bao gồm: Sĩ số 9 tháng, Kế hoạch GD, Trẻ cần hỗ trợ, Trẻ vượt trội, 5 Lĩnh vực phát triển
   */
  async exportSchoolStatisticsExcel({ schoolYearId }) {
    const data = await statisticsService.getSchoolOverview({ schoolYearId });
    const {
      schoolYear,
      summary,
      monthlyStudentMatrix,
      planStatistics,
      assessmentStatistics,
      childrenNeedingSupport,
      childrenOutstanding,
    } = data;

    const yearName = schoolYear?.name || 'Năm học 2026 - 2027';

    // Khởi tạo workbook với Sheet 1
    const { workbook, worksheet: sheet1 } = createStandardWorkbook('Sĩ số học sinh 9 tháng');

    // ========================================================================
    // SHEET 1: THỐNG KÊ SĨ SỐ HỌC SINH (9 Tháng & Khối Chỉ số Tổng quan)
    // ========================================================================
    addSchoolHeaderBanner(sheet1, {
      title: 'BẢNG THỐNG KÊ SĨ SỐ HỌC SINH VÀ CHỈ SỐ TOÀN TRƯỜNG',
      subtitle: 'Quy mô phân bổ học sinh theo tháng và biến động sĩ số (Quy chuẩn: Nữ / Tổng số trẻ)',
      schoolYearName: yearName,
      totalCols: 13,
    });

    // 1a. Khối Tóm tắt Chỉ số Tổng quan Toàn trường (KPI Cards)
    const kpiStartRow = 5;
    const kpiTitleRow = sheet1.getRow(kpiStartRow);
    kpiTitleRow.values = ['TỔNG HỢP CHỈ SỐ NĂM HỌC'];
    sheet1.mergeCells(kpiStartRow, 1, kpiStartRow, 13);
    kpiTitleRow.font = { name: 'Segoe UI', size: 11, bold: true, color: { argb: 'FF1E40AF' } };
    kpiTitleRow.height = 24;

    const kpiHeader = sheet1.getRow(kpiStartRow + 1);
    kpiHeader.values = [
      'Tổng học sinh',
      'Học sinh Nữ',
      'Học sinh Nam',
      'Tỷ lệ Nữ',
      'Tổng số lớp',
      'Tổng giáo viên',
      'Tổng kế hoạch',
      'Kế hoạch đã duyệt',
      'Kế hoạch chờ duyệt',
      'Tỷ lệ duyệt KH',
      'Trẻ cần hỗ trợ',
      'Trẻ vượt trội',
      'Trạng thái năm học',
    ];
    applyHeaderStyles(kpiHeader, '3B82F6');
    kpiHeader.height = 24;

    const kpiData = sheet1.getRow(kpiStartRow + 2);
    kpiData.values = [
      summary?.totalStudents || 0,
      summary?.totalFemaleStudents || 0,
      summary?.totalMaleStudents || 0,
      `${summary?.femaleRate || 0}%`,
      summary?.totalClasses || 0,
      summary?.totalTeachers || 0,
      planStatistics?.totalPlans || 0,
      planStatistics?.approvedPlans || 0,
      planStatistics?.pendingPlans || 0,
      `${planStatistics?.approvalRate || 0}%`,
      childrenNeedingSupport?.length || 0,
      childrenOutstanding?.length || 0,
      schoolYear?.status === 'ACTIVE' ? 'Đang hoạt động' : 'Đã kết thúc',
    ];
    kpiData.height = 26;
    kpiData.font = { name: 'Segoe UI', size: 10.5, bold: true, color: { argb: 'FF111827' } };
    for (let c = 1; c <= 13; c++) {
      const cell = kpiData.getCell(c);
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F7FF' } };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FF93C5FD' } },
        bottom: { style: 'thin', color: { argb: 'FF93C5FD' } },
        left: { style: 'thin', color: { argb: 'FFBFDBFE' } },
        right: { style: 'thin', color: { argb: 'FFBFDBFE' } },
      };
    }

    // Spacer row
    sheet1.getRow(kpiStartRow + 3).height = 16;

    // 1b. Bảng Thống kê Sĩ số 9 Tháng
    const tableTitleRow = sheet1.getRow(kpiStartRow + 4);
    tableTitleRow.values = ['CHI TIẾT BIẾN ĐỘNG SĨ SỐ 9 THÁNG THEO TỪNG LỚP HỌC (Nữ / Tổng số)'];
    sheet1.mergeCells(kpiStartRow + 4, 1, kpiStartRow + 4, 13);
    tableTitleRow.font = { name: 'Segoe UI', size: 11, bold: true, color: { argb: 'FF1E40AF' } };
    tableTitleRow.height = 24;

    const headerRow1 = sheet1.getRow(kpiStartRow + 5);
    headerRow1.values = [
      'STT',
      'LỚP HỌC',
      'KHỐI LỚP',
      'GIÁO VIÊN PHỤ TRÁCH',
      'THÁNG 9',
      'THÁNG 10',
      'THÁNG 11',
      'THÁNG 12',
      'THÁNG 01',
      'THÁNG 02',
      'THÁNG 03',
      'THÁNG 04',
      'THÁNG 05',
    ];
    applyHeaderStyles(headerRow1, EXCEL_COLORS.PRIMARY_HEADER);
    headerRow1.height = 28;

    let rowIdx1 = kpiStartRow + 6;
    const sortedClasses = [...(monthlyStudentMatrix.classes || [])].sort((a, b) => {
      const rankA = AGE_GROUP_ORDER[a.ageGroup] || 99;
      const rankB = AGE_GROUP_ORDER[b.ageGroup] || 99;
      if (rankA !== rankB) return rankA - rankB;
      return (a.name || '').localeCompare(b.name || '', 'vi', { numeric: true });
    });

    sortedClasses.forEach((cls, idx) => {
      const row = sheet1.getRow(rowIdx1++);
      const rowVals = [
        idx + 1,
        cls.name,
        AGE_GROUP_NAMES[cls.ageGroup] || cls.ageGroup || '',
        cls.teacherName || 'Chưa phân công giáo viên',
      ];
      (cls.monthsData || []).forEach((m) => {
        rowVals.push(m.isFuture || m.total === 0 ? '-' : m.label || '-');
      });
      row.values = rowVals;

      row.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
      row.getCell(2).alignment = { horizontal: 'left', vertical: 'middle' };
      row.getCell(3).alignment = { horizontal: 'left', vertical: 'middle' };
      row.getCell(4).alignment = { horizontal: 'left', vertical: 'middle' };
      for (let c = 5; c <= 13; c++) {
        row.getCell(c).alignment = { horizontal: 'center', vertical: 'middle' };
      }
      row.height = 24;
    });

    const dataEndRow1 = rowIdx1 - 1;

    // Hàng TỔNG SỐ
    const totalRow = sheet1.getRow(rowIdx1++);
    const totalVals = ['', 'TỔNG SỐ TOÀN TRƯỜNG', '', ''];
    (monthlyStudentMatrix.footer?.totalRow || []).forEach((m) => {
      totalVals.push(m.isFuture ? '-' : m.label || '-');
    });
    totalRow.values = totalVals;
    sheet1.mergeCells(rowIdx1 - 1, 2, rowIdx1 - 1, 4);
    totalRow.height = 26;
    totalRow.font = { name: 'Segoe UI', size: 10.5, bold: true, color: { argb: 'FF1E40AF' } };
    totalRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEBF5FF' } };
    for (let c = 1; c <= 13; c++) {
      totalRow.getCell(c).alignment = { horizontal: c <= 4 ? 'left' : 'center', vertical: 'middle' };
      totalRow.getCell(c).border = {
        top: { style: 'thin', color: { argb: 'FF93C5FD' } },
        bottom: { style: 'thin', color: { argb: 'FF93C5FD' } },
      };
    }

    // Hàng TĂNG
    const incRow = sheet1.getRow(rowIdx1++);
    const incVals = ['', 'HỌC SINH TĂNG (NHẬP HỌC)', '', ''];
    (monthlyStudentMatrix.footer?.increaseRow || []).forEach((m) => {
      incVals.push(m.isFuture ? '-' : m.count > 0 ? `+${m.count}` : '0');
    });
    incRow.values = incVals;
    sheet1.mergeCells(rowIdx1 - 1, 2, rowIdx1 - 1, 4);
    incRow.height = 24;
    incRow.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FF065F46' } };
    incRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0FDF4' } };
    for (let c = 1; c <= 13; c++) {
      incRow.getCell(c).alignment = { horizontal: c <= 4 ? 'left' : 'center', vertical: 'middle' };
    }

    // Hàng GIẢM
    const decRow = sheet1.getRow(rowIdx1++);
    const decVals = ['', 'HỌC SINH GIẢM (CHUYỂN/NGHỈ)', '', ''];
    (monthlyStudentMatrix.footer?.decreaseRow || []).forEach((m) => {
      decVals.push(m.isFuture ? '-' : m.count > 0 ? `-${m.count}` : '0');
    });
    decRow.values = decVals;
    sheet1.mergeCells(rowIdx1 - 1, 2, rowIdx1 - 1, 4);
    decRow.height = 24;
    decRow.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FF991B1B' } };
    decRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF2F2' } };
    for (let c = 1; c <= 13; c++) {
      decRow.getCell(c).alignment = { horizontal: c <= 4 ? 'left' : 'center', vertical: 'middle' };
    }

    applyZebraAndBorders(sheet1, kpiStartRow + 6, dataEndRow1);
    autoFitColumns(sheet1, {
      1: 6,
      2: 18,
      3: 26,
      4: 30,
      5: 12,
      6: 12,
      7: 12,
      8: 12,
      9: 12,
      10: 12,
      11: 12,
      12: 12,
      13: 12,
    });

    // ========================================================================
    // SHEET 2: TIẾN ĐỘ KẾ HOẠCH GIÁO DỤC (ClassThemePlan)
    // ========================================================================
    const sheet2 = workbook.addWorksheet('Tiến độ kế hoạch GD', {
      views: [{ showGridLines: true }],
    });
    addSchoolHeaderBanner(sheet2, {
      title: 'BÁO CÁO TIẾN ĐỘ KẾ HOẠCH GIÁO DỤC CÁC LỚP',
      subtitle: `Tỷ lệ duyệt kế hoạch toàn trường: ${planStatistics?.approvalRate || 0}% (${planStatistics?.approvedPlans || 0}/${planStatistics?.totalPlans || 0} kế hoạch đã duyệt)`,
      schoolYearName: yearName,
      totalCols: 11,
    });

    // Tóm tắt kế hoạch trên đầu bảng
    const planSummaryRow = sheet2.getRow(5);
    planSummaryRow.values = [
      'ĐÃ DUYỆT',
      planStatistics?.approvedPlans || 0,
      'CHỜ DUYỆT',
      planStatistics?.pendingPlans || 0,
      'YÊU CẦU SỬA',
      planStatistics?.rejectedPlans || 0,
      'BẢN NHÁP',
      planStatistics?.draftPlans || 0,
      'TỔNG CỘNG',
      planStatistics?.totalPlans || 0,
      `${planStatistics?.approvalRate || 0}%`,
    ];
    planSummaryRow.height = 24;
    planSummaryRow.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FF1E40AF' } };
    for (let c = 1; c <= 11; c++) {
      planSummaryRow.getCell(c).alignment = { horizontal: 'center', vertical: 'middle' };
      planSummaryRow.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEBF5FF' } };
      planSummaryRow.getCell(c).border = {
        top: { style: 'thin', color: { argb: 'FF93C5FD' } },
        bottom: { style: 'thin', color: { argb: 'FF93C5FD' } },
      };
    }

    const headerRow2 = sheet2.getRow(7);
    headerRow2.values = [
      'STT',
      'TÊN LỚP',
      'KHỐI LỚP',
      'GIÁO VIÊN PHỤ TRÁCH',
      'TỔNG SỐ KH',
      'ĐÃ DUYỆT',
      'CHỜ DUYỆT',
      'YÊU CẦU SỬA',
      'BẢN NHÁP',
      'TỶ LỆ DUYỆT (%)',
      'TRẠNG THÁI',
    ];
    applyHeaderStyles(headerRow2, EXCEL_COLORS.PRIMARY_HEADER);
    headerRow2.height = 28;

    const sortedPlans = [...(planStatistics?.byClass || [])].sort((a, b) => {
      const rankA = AGE_GROUP_ORDER[a.ageGroup] || 99;
      const rankB = AGE_GROUP_ORDER[b.ageGroup] || 99;
      if (rankA !== rankB) return rankA - rankB;
      return (a.className || '').localeCompare(b.className || '', 'vi', { numeric: true });
    });

    let rowIdx2 = 8;
    sortedPlans.forEach((cls, idx) => {
      const row = sheet2.getRow(rowIdx2++);
      const totalP = cls.totalPlans || 0;
      const appP = cls.approved || 0;
      const rate = totalP > 0 ? Math.round((appP / totalP) * 100) : 0;

      row.values = [
        idx + 1,
        cls.className,
        AGE_GROUP_NAMES[cls.ageGroup] || cls.ageGroup || '',
        cls.teacherName || 'Chưa phân công giáo viên',
        totalP,
        appP,
        cls.pending || 0,
        cls.rejected || 0,
        cls.draft || 0,
        `${rate}%`,
        cls.statusText || 'Chưa nộp',
      ];
      row.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
      row.getCell(2).alignment = { horizontal: 'left', vertical: 'middle' };
      row.getCell(3).alignment = { horizontal: 'left', vertical: 'middle' };
      row.getCell(4).alignment = { horizontal: 'left', vertical: 'middle' };
      for (let c = 5; c <= 10; c++) {
        row.getCell(c).alignment = { horizontal: 'center', vertical: 'middle' };
      }
      row.getCell(11).alignment = { horizontal: 'left', vertical: 'middle' };
      row.height = 24;
    });

    // Hàng tổng cộng kế hoạch
    const totalPlanRow = sheet2.getRow(rowIdx2++);
    totalPlanRow.values = [
      '',
      'TỔNG CỘNG TOÀN TRƯỜNG',
      '',
      '',
      planStatistics?.totalPlans || 0,
      planStatistics?.approvedPlans || 0,
      planStatistics?.pendingPlans || 0,
      planStatistics?.rejectedPlans || 0,
      planStatistics?.draftPlans || 0,
      `${planStatistics?.approvalRate || 0}%`,
      planStatistics?.pendingPlans > 0 ? 'Có kế hoạch chờ duyệt' : 'Đã hoàn tất duyệt',
    ];
    sheet2.mergeCells(rowIdx2 - 1, 2, rowIdx2 - 1, 4);
    totalPlanRow.height = 26;
    totalPlanRow.font = { name: 'Segoe UI', size: 10.5, bold: true, color: { argb: 'FF1E40AF' } };
    totalPlanRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEBF5FF' } };
    for (let c = 1; c <= 11; c++) {
      totalPlanRow.getCell(c).alignment = { horizontal: c <= 4 ? 'left' : 'center', vertical: 'middle' };
      totalPlanRow.getCell(c).border = {
        top: { style: 'thin', color: { argb: 'FF93C5FD' } },
        bottom: { style: 'thin', color: { argb: 'FF93C5FD' } },
      };
    }

    applyZebraAndBorders(sheet2, 8, rowIdx2 - 2);
    autoFitColumns(sheet2, {
      1: 6,
      2: 18,
      3: 26,
      4: 30,
      5: 14,
      6: 14,
      7: 14,
      8: 14,
      9: 14,
      10: 16,
      11: 20,
    });

    // ========================================================================
    // SHEET 3: TRẺ CẦN HỖ TRỢ (Tách riêng 1 sheet độc lập)
    // ========================================================================
    const sheet3 = workbook.addWorksheet('Trẻ cần hỗ trợ', {
      views: [{ showGridLines: true }],
    });
    addSchoolHeaderBanner(sheet3, {
      title: 'DANH SÁCH HỌC SINH CẦN HỖ TRỢ PHÁT TRIỂN',
      subtitle: `Tổng cộng ${childrenNeedingSupport?.length || 0} học sinh cần theo dõi và phối hợp phụ huynh can thiệp sớm`,
      schoolYearName: yearName,
      totalCols: 8,
    });

    const headerRow3 = sheet3.getRow(5);
    headerRow3.values = [
      'STT',
      'MÃ HỌC SINH',
      'HỌ VÀ TÊN',
      'LỚP HỌC',
      'GIỚI TÍNH',
      'MỤC TIÊU CHƯA ĐẠT',
      'CHƯA ĐẠT LIÊN TIẾP',
      'TÌNH TRẠNG ĐÁNH GIÁ & LÝ DO CẦN HỖ TRỢ',
    ];
    applyHeaderStyles(headerRow3, 'DC2626'); // Red Header
    headerRow3.height = 28;

    let rowIdx3 = 6;
    if (!childrenNeedingSupport || childrenNeedingSupport.length === 0) {
      const emptyRow = sheet3.getRow(rowIdx3++);
      emptyRow.values = ['', '', 'Hiện tại toàn trường không có học sinh nào thuộc nhóm cần hỗ trợ đặc biệt.'];
      sheet3.mergeCells(rowIdx3 - 1, 3, rowIdx3 - 1, 8);
      emptyRow.height = 32;
      emptyRow.font = { name: 'Segoe UI', size: 11, italic: true, color: { argb: 'FF065F46' } };
      emptyRow.alignment = { horizontal: 'center', vertical: 'middle' };
    } else {
      childrenNeedingSupport.forEach((st, idx) => {
        const row = sheet3.getRow(rowIdx3++);
        row.values = [
          idx + 1,
          st.studentCode || '',
          st.fullName,
          st.className,
          st.gender === 'FEMALE' || st.gender === 'Nữ' || String(st.gender).toLowerCase() === 'female' ? 'Nữ' : 'Nam',
          `${st.notAchievedCount}/${st.totalGoals} (${st.notAchievedPct}%)`,
          st.consecutiveNotAchieved > 0 ? `${st.consecutiveNotAchieved} mục tiêu` : '-',
          (st.reasons || []).join('; '),
        ];
        row.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
        row.getCell(2).alignment = { horizontal: 'center', vertical: 'middle' };
        row.getCell(3).alignment = { horizontal: 'left', vertical: 'middle' };
        row.getCell(4).alignment = { horizontal: 'left', vertical: 'middle' };
        row.getCell(5).alignment = { horizontal: 'center', vertical: 'middle' };
        row.getCell(6).alignment = { horizontal: 'center', vertical: 'middle' };
        row.getCell(7).alignment = { horizontal: 'center', vertical: 'middle' };
        row.getCell(8).alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
        row.height = 24;
      });
      applyZebraAndBorders(sheet3, 6, rowIdx3 - 1);
    }

    autoFitColumns(sheet3, {
      1: 6,
      2: 15,
      3: 24,
      4: 16,
      5: 12,
      6: 22,
      7: 20,
      8: 45,
    });

    // ========================================================================
    // SHEET 4: TRẺ VƯỢT TRỘI (Tách riêng 1 sheet độc lập)
    // ========================================================================
    const sheet4 = workbook.addWorksheet('Trẻ vượt trội', {
      views: [{ showGridLines: true }],
    });
    addSchoolHeaderBanner(sheet4, {
      title: 'DANH SÁCH HỌC SINH ĐẠT KẾT QUẢ VƯỢT TRỘI / XUẤT SẮC',
      subtitle: `Tổng cộng ${childrenOutstanding?.length || 0} học sinh xuất sắc và vượt trội mục tiêu phát triển`,
      schoolYearName: yearName,
      totalCols: 8,
    });

    const headerRow4 = sheet4.getRow(5);
    headerRow4.values = [
      'STT',
      'MÃ HỌC SINH',
      'HỌ VÀ TÊN',
      'LỚP HỌC',
      'GIỚI TÍNH',
      'MỤC TIÊU VƯỢT TRỘI',
      'PHÂN LOẠI DANH HIỆU',
      'BIỂU HIỆN NỔI BẬT & THÀNH TÍCH',
    ];
    applyHeaderStyles(headerRow4, '2563EB'); // Blue Header
    headerRow4.height = 28;

    let rowIdx4 = 6;
    if (!childrenOutstanding || childrenOutstanding.length === 0) {
      const emptyRow = sheet4.getRow(rowIdx4++);
      emptyRow.values = ['', '', 'Chưa có học sinh đạt chuẩn vượt trội trong kỳ đánh giá này.'];
      sheet4.mergeCells(rowIdx4 - 1, 3, rowIdx4 - 1, 8);
      emptyRow.height = 32;
      emptyRow.font = { name: 'Segoe UI', size: 11, italic: true, color: { argb: 'FF6B7280' } };
      emptyRow.alignment = { horizontal: 'center', vertical: 'middle' };
    } else {
      childrenOutstanding.forEach((st, idx) => {
        const row = sheet4.getRow(rowIdx4++);
        row.values = [
          idx + 1,
          st.studentCode || '',
          st.fullName,
          st.className,
          st.gender === 'FEMALE' || st.gender === 'Nữ' || String(st.gender).toLowerCase() === 'female' ? 'Nữ' : 'Nam',
          `${st.outstandingCount}/${st.totalGoals}`,
          st.outstandingType || 'Xuất sắc & Vượt trội',
          (st.reasons || []).join('; '),
        ];
        row.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
        row.getCell(2).alignment = { horizontal: 'center', vertical: 'middle' };
        row.getCell(3).alignment = { horizontal: 'left', vertical: 'middle' };
        row.getCell(4).alignment = { horizontal: 'left', vertical: 'middle' };
        row.getCell(5).alignment = { horizontal: 'center', vertical: 'middle' };
        row.getCell(6).alignment = { horizontal: 'center', vertical: 'middle' };
        row.getCell(7).alignment = { horizontal: 'left', vertical: 'middle' };
        row.getCell(8).alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
        row.height = 24;
      });
      applyZebraAndBorders(sheet4, 6, rowIdx4 - 1);
    }

    autoFitColumns(sheet4, {
      1: 6,
      2: 15,
      3: 24,
      4: 16,
      5: 12,
      6: 22,
      7: 24,
      8: 45,
    });

    // ========================================================================
    // SHEET 5: THỐNG KÊ 5 LĨNH VỰC PHÁT TRIỂN
    // ========================================================================
    const sheet5 = workbook.addWorksheet('Lĩnh vực phát triển', {
      views: [{ showGridLines: true }],
    });
    addSchoolHeaderBanner(sheet5, {
      title: 'THỐNG KÊ ĐÁNH GIÁ THEO 5 LĨNH VỰC PHÁT TRIỂN',
      subtitle: `Tổng số lượt đánh giá mục tiêu toàn trường: ${assessmentStatistics?.totalDailyAssessments || 0}`,
      schoolYearName: yearName,
      totalCols: 7,
    });

    const headerRow5 = sheet5.getRow(5);
    headerRow5.values = [
      'STT',
      'LĨNH VỰC PHÁT TRIỂN',
      'TỔNG LƯỢT ĐÁNH GIÁ',
      'ĐẠT CHUẨN (ACHIEVED)',
      'VƯỢT TRỘI (OUTSTANDING)',
      'CHƯA ĐẠT (NOT ACHIEVED)',
      'TỶ LỆ ĐẠT CHUẨN (%)',
    ];
    applyHeaderStyles(headerRow5, '0D9488'); // Teal Header
    headerRow5.height = 28;

    const domainEntries = Object.entries(assessmentStatistics?.byDomain || {}).filter(
      ([key]) => key !== 'GENERAL'
    );

    let rowIdx5 = 6;
    let sumTotal = 0;
    let sumAchieved = 0;
    let sumOutstanding = 0;
    let sumNotAchieved = 0;

    domainEntries.forEach(([key, dData], idx) => {
      const row = sheet5.getRow(rowIdx5++);
      const total = dData.total || 0;
      const achieved = dData.achieved || 0;
      const outstanding = dData.outstanding || 0;
      const notAchieved = dData.notAchieved || 0;
      const passTotal = achieved + outstanding;
      const rate = total > 0 ? Math.round((passTotal / total) * 100) : 0;

      sumTotal += total;
      sumAchieved += achieved;
      sumOutstanding += outstanding;
      sumNotAchieved += notAchieved;

      row.values = [
        idx + 1,
        dData.name || key,
        total,
        achieved,
        outstanding,
        notAchieved,
        `${rate}%`,
      ];
      row.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
      row.getCell(2).alignment = { horizontal: 'left', vertical: 'middle' };
      for (let c = 3; c <= 7; c++) {
        row.getCell(c).alignment = { horizontal: 'center', vertical: 'middle' };
      }
      row.height = 24;
    });

    // Hàng tổng cộng 5 lĩnh vực
    const sumPass = sumAchieved + sumOutstanding;
    const overallRate = sumTotal > 0 ? Math.round((sumPass / sumTotal) * 100) : 0;
    const totalDomainRow = sheet5.getRow(rowIdx5++);
    totalDomainRow.values = [
      '',
      'TỔNG CỘNG TOÀN TRƯỜNG',
      sumTotal,
      sumAchieved,
      sumOutstanding,
      sumNotAchieved,
      `${overallRate}%`,
    ];
    sheet5.mergeCells(rowIdx5 - 1, 1, rowIdx5 - 1, 2);
    totalDomainRow.height = 26;
    totalDomainRow.font = { name: 'Segoe UI', size: 10.5, bold: true, color: { argb: 'FF0D9488' } };
    totalDomainRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0FDFA' } };
    for (let c = 1; c <= 7; c++) {
      totalDomainRow.getCell(c).alignment = { horizontal: c <= 2 ? 'left' : 'center', vertical: 'middle' };
      totalDomainRow.getCell(c).border = {
        top: { style: 'thin', color: { argb: 'FF5EEAD4' } },
        bottom: { style: 'thin', color: { argb: 'FF5EEAD4' } },
      };
    }

    applyZebraAndBorders(sheet5, 6, rowIdx5 - 2);
    autoFitColumns(sheet5, {
      1: 6,
      2: 28,
      3: 20,
      4: 22,
      5: 24,
      6: 24,
      7: 22,
    });

    return await workbook.xlsx.writeBuffer();
  }
}

export const statisticsExportService = new StatisticsExportService();
export default statisticsExportService;
