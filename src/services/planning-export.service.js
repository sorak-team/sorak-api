import prisma from '../config/prisma.js';
import {
  createStandardWorkbook,
  addSchoolHeaderBanner,
  applyHeaderStyles,
  applyZebraAndBorders,
  autoFitColumns,
} from '../utils/excel.helper.js';
import { NotFound, BadRequest } from '../utils/http-error.js';

const AGE_GROUP_LABELS = {
  nhatre: 'Nhà trẻ (24 - 36 tháng)',
  mam: 'Khối Mầm (3 - 4 tuổi)',
  choi: 'Khối Chồi (4 - 5 tuổi)',
  la: 'Khối Lá (5 - 6 tuổi)',
};

const AGE_GROUP_DB_MAP = {
  nhatre: ['NHATRE', 'NHA_TRE', 'nhatre'],
  mam: ['MAM', 'mam'],
  choi: ['CHOI', 'choi'],
  la: ['LA', 'la'],
};

const SHEET_NAMES = {
  nhatre: 'Khối Nhà trẻ',
  mam: 'Khối Mầm',
  choi: 'Khối Chồi',
  la: 'Khối Lá',
};

const ROUTINE_SLOT_LABELS = {
  ARRIVAL_PLAY: 'Đón trẻ, chơi',
  MORNING_EXERCISE: 'Thể dục sáng',
  DIRECTED_STUDY: 'Hoạt động học',
  CORNER_PLAY: 'Chơi ở các góc',
  OUTDOOR_PLAY: 'Chơi ngoài trời',
  HYGIENE_MEAL_SLEEP: 'Vệ sinh, ăn, ngủ',
  EAT_SLEEP: 'Vệ sinh, ăn, ngủ',
  AFTERNOON_ACTIVITY: 'Hoạt động chiều',
  RETURN_CHILD: 'Trả trẻ',
};

const DAY_LABELS = {
  MONDAY: 'Thứ hai',
  TUESDAY: 'Thứ ba',
  WEDNESDAY: 'Thứ tư',
  THURSDAY: 'Thứ năm',
  FRIDAY: 'Thứ sáu',
  SATURDAY: 'Thứ bảy',
  SUNDAY: 'Chủ nhật',
};

const DOMAIN_LABELS = {
  PHYSICAL: 'Phát triển thể chất',
  COGNITIVE: 'Phát triển nhận thức',
  LANGUAGE: 'Phát triển ngôn ngữ',
  EMOTIONAL_SOCIAL: 'Phát triển tình cảm & kỹ năng xã hội',
  SOCIO_EMOTIONAL: 'Phát triển tình cảm & kỹ năng xã hội',
  AESTHETIC: 'Phát triển thẩm mỹ',
};

function formatDateVn(date) {
  if (!date) return '';
  const d = new Date(date);
  if (isNaN(d.getTime())) return '';
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

function formatDateShort(date) {
  if (!date) return '';
  const d = new Date(date);
  if (isNaN(d.getTime())) return '';
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  return `${day}/${month}`;
}

function cleanSheetTitle(rawTitle, maxLen = 31) {
  if (!rawTitle) return 'Sheet';
  const cleaned = rawTitle.replace(/[\\/?*[\]:]/g, '_').trim();
  return cleaned.length > maxLen ? cleaned.substring(0, maxLen).trim() : cleaned;
}

export class PlanningExportService {
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

  /**
   * Helper tìm theme an toàn theo ID, Public ID (UUID) hoặc tên, tránh lỗi casting UUID
   */
  async _resolveTheme(themeId, ageGroup, schoolYearId) {
    if (themeId) {
      const str = String(themeId).trim();
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
      const isNumeric = /^\d+$/.test(str);
      const theme = await prisma.curriculumTheme.findFirst({
        where: {
          deleted_at: null,
          OR: [
            isUuid ? { public_id: str } : undefined,
            isNumeric ? { theme_id: BigInt(str) } : undefined,
            { name: { contains: str, mode: 'insensitive' } },
          ].filter(Boolean),
        },
        include: {
          sub_themes: {
            where: { deleted_at: null },
            orderBy: [{ start_date: 'asc' }],
          },
        },
      });
      if (theme) return theme;
    }

    return prisma.curriculumTheme.findFirst({
      where: {
        deleted_at: null,
        age_group: ageGroup || undefined,
        school_year_id: schoolYearId || undefined,
      },
      include: {
        sub_themes: { where: { deleted_at: null }, orderBy: [{ start_date: 'asc' }] },
      },
      orderBy: [{ start_date: 'asc' }],
    });
  }

  // ==========================================================================
  // 1. EXPORT THEME PLAN (Kế hoạch phân phối chủ đề 35 tuần của Năm học)
  // Backlog #94 - Dựa trên mẫu docs/BGD/DỰ KIẾN CHỦ ĐỀ (NH 2025-2026).doc
  // ==========================================================================

  async exportThemePlanExcel({ schoolYearId, ageGroup }) {
    let schoolYearObj = null;
    if (schoolYearId) {
      schoolYearObj = await prisma.schoolYear.findFirst({
        where: {
          OR: [
            { school_year_id: isNaN(Number(schoolYearId)) ? undefined : BigInt(schoolYearId) },
            { name: { contains: String(schoolYearId) } },
          ],
          deleted_at: null,
        },
      });
    }
    if (!schoolYearObj) {
      schoolYearObj = await prisma.schoolYear.findFirst({
        where: { deleted_at: null },
        orderBy: [{ status: 'asc' }, { school_year_id: 'desc' }],
      });
    }

    const ageKeys = ageGroup && AGE_GROUP_LABELS[ageGroup.toLowerCase()]
      ? [ageGroup.toLowerCase()]
      : ['nhatre', 'mam', 'choi', 'la'];

    const firstKey = ageKeys[0];
    const firstSheetName = SHEET_NAMES[firstKey] || 'Kế hoạch chủ đề';
    const { workbook, worksheet } = createStandardWorkbook(firstSheetName);

    let isFirstSheet = true;

    for (const key of ageKeys) {
      const dbCodes = AGE_GROUP_DB_MAP[key] || [key.toUpperCase()];
      const sheetName = SHEET_NAMES[key] || key;
      
      const sheet = isFirstSheet 
        ? worksheet
        : workbook.addWorksheet(sheetName, {
            views: [{ showGridLines: true }],
            pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
          });
      
      if (isFirstSheet) {
        sheet.name = sheetName;
        sheet.pageSetup = { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
        isFirstSheet = false;
      }

      const themes = await prisma.curriculumTheme.findMany({
        where: {
          deleted_at: null,
          age_group: { in: dbCodes },
          ...(schoolYearObj ? { school_year_id: schoolYearObj.school_year_id } : {}),
        },
        include: {
          sub_themes: {
            where: { deleted_at: null },
            orderBy: [{ start_date: 'asc' }, { sub_theme_id: 'asc' }],
          },
        },
        orderBy: [{ start_date: 'asc' }, { theme_id: 'asc' }],
      });

      const startRow = addSchoolHeaderBanner(sheet, {
        title: 'KẾ HOẠCH PHÂN PHỐI BỘ CHỦ ĐỀ VÀ THỜI GIAN THỰC HIỆN',
        subtitle: `Khối: ${AGE_GROUP_LABELS[key] || key}`,
        schoolYearName: schoolYearObj?.name || '2026-2027',
        totalCols: 7,
      });

      const headerRow = sheet.getRow(startRow);
      headerRow.values = [
        'STT',
        'Chủ đề lớn',
        'Chủ đề nhánh',
        'Số tuần',
        'Thứ tự tuần',
        'Dự kiến thời gian',
        'Ghi chú / Sự kiện tích hợp',
      ];
      applyHeaderStyles(headerRow);

      let currentRowIdx = startRow + 1;
      let cumulativeWeek = 1;

      themes.forEach((theme, tIdx) => {
        const subThemes = theme.sub_themes || [];
        const themeDurationWeeks = subThemes.length > 0 ? subThemes.length : 1;

        if (subThemes.length === 0) {
          const row = sheet.getRow(currentRowIdx++);
          const startStr = formatDateVn(theme.start_date);
          const endStr = formatDateVn(theme.end_date);
          row.values = [
            tIdx + 1,
            theme.name,
            '(Chưa phân nhánh)',
            '1 tuần',
            `Tuần ${cumulativeWeek}`,
            `Từ ${startStr} đến ${endStr}`,
            theme.description || '',
          ];
          row.eachCell((cell, colNum) => {
            if (colNum === 1 || colNum === 4 || colNum === 5 || colNum === 6) {
              cell.alignment = { horizontal: 'center', vertical: 'middle' };
            } else {
              cell.alignment = { vertical: 'middle' };
            }
          });
          cumulativeWeek++;
        } else {
          subThemes.forEach((st, sIdx) => {
            const row = sheet.getRow(currentRowIdx++);
            const startStr = formatDateVn(st.start_date || theme.start_date);
            const endStr = formatDateVn(st.end_date || theme.end_date);
            row.values = [
              sIdx === 0 ? tIdx + 1 : '',
              sIdx === 0 ? theme.name : '',
              st.name,
              sIdx === 0 ? `${themeDurationWeeks} tuần` : '',
              `Tuần ${cumulativeWeek}`,
              `Từ ${startStr} đến ${endStr}`,
              st.notes || (sIdx === 0 ? theme.description || '' : ''),
            ];
            row.eachCell((cell, colNum) => {
              if (colNum === 1 || colNum === 4 || colNum === 5 || colNum === 6) {
                cell.alignment = { horizontal: 'center', vertical: 'middle' };
              } else {
                cell.alignment = { vertical: 'middle' };
              }
            });
            cumulativeWeek++;
          });
        }
      });

      if (currentRowIdx > startRow + 1) {
        applyZebraAndBorders(sheet, startRow + 1, currentRowIdx - 1);
      }

      autoFitColumns(sheet, {
        1: 8,   // STT
        2: 28,  // Chủ đề lớn
        3: 35,  // Chủ đề nhánh
        4: 12,  // Số tuần
        5: 14,  // Thứ tự tuần
        6: 30,  // Dự kiến thời gian
        7: 25,  // Ghi chú
      });
    }

    return workbook.xlsx.writeBuffer();
  }

  async exportThemePlanPrintHtml({ schoolYearId, ageGroup }) {
    const ageKeys = ageGroup && AGE_GROUP_LABELS[ageGroup.toLowerCase()]
      ? [ageGroup.toLowerCase()]
      : ['nhatre', 'mam', 'choi', 'la'];

    const sections = [];

    for (const key of ageKeys) {
      const dbCodes = AGE_GROUP_DB_MAP[key] || [key.toUpperCase()];
      const label = AGE_GROUP_LABELS[key];

      const themes = await prisma.curriculumTheme.findMany({
        where: {
          deleted_at: null,
          age_group: { in: dbCodes },
          ...(schoolYearId ? { school_year_id: BigInt(schoolYearId) } : {}),
        },
        include: {
          sub_themes: {
            where: { deleted_at: null },
            orderBy: [{ start_date: 'asc' }, { sub_theme_id: 'asc' }],
          },
        },
        orderBy: [{ start_date: 'asc' }, { theme_id: 'asc' }],
      });

      let cumulativeWeek = 1;
      const rows = [];

      themes.forEach((theme, tIdx) => {
        const subThemes = theme.sub_themes || [];
        const themeDurationWeeks = subThemes.length > 0 ? subThemes.length : 1;

        if (subThemes.length === 0) {
          const startStr = formatDateVn(theme.start_date);
          const endStr = formatDateVn(theme.end_date);
          rows.push(`
            <tr>
              <td style="text-align:center; font-weight:bold;">${tIdx + 1}</td>
              <td style="font-weight:bold;">${theme.name}</td>
              <td>-</td>
              <td style="text-align:center;">1 tuần</td>
              <td style="text-align:center;">Tuần ${cumulativeWeek}</td>
              <td style="text-align:center;">Từ ${startStr} đến ${endStr}</td>
              <td>${theme.description || ''}</td>
            </tr>
          `);
          cumulativeWeek++;
        } else {
          subThemes.forEach((st, sIdx) => {
            const startStr = formatDateVn(st.start_date || theme.start_date);
            const endStr = formatDateVn(st.end_date || theme.end_date);
            const rowspanAttr = sIdx === 0 ? ` rowspan="${subThemes.length}"` : '';
            rows.push(`
              <tr>
                ${sIdx === 0 ? `<td${rowspanAttr} style="text-align:center; font-weight:bold; vertical-align:middle;">${tIdx + 1}</td>` : ''}
                ${sIdx === 0 ? `<td${rowspanAttr} style="font-weight:bold; vertical-align:middle;">${theme.name}</td>` : ''}
                <td>${st.name}</td>
                ${sIdx === 0 ? `<td${rowspanAttr} style="text-align:center; vertical-align:middle;">${themeDurationWeeks} tuần</td>` : ''}
                <td style="text-align:center;">Tuần ${cumulativeWeek}</td>
                <td style="text-align:center;">Từ ${startStr} đến ${endStr}</td>
                <td>${st.notes || ''}</td>
              </tr>
            `);
            cumulativeWeek++;
          });
        }
      });

      sections.push({
        label,
        totalWeeks: cumulativeWeek - 1,
        totalThemes: themes.length,
        rowsHtml: rows.join(''),
      });
    }

    return `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <title>Dự kiến Kế hoạch Phân phối Chủ đề 35 tuần</title>
  <style>
    @page {
      size: A4 landscape;
      margin: 12mm 15mm;
    }
    body {
      font-family: 'Times New Roman', serif;
      font-size: 13pt;
      line-height: 1.35;
      color: #111;
      margin: 0;
      padding: 0;
    }
    .sheet {
      page-break-after: always;
    }
    .sheet:last-child {
      page-break-after: avoid;
    }
    .header-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 8px;
    }
    .header-table td {
      border: none;
      vertical-align: top;
      font-size: 11.5pt;
    }
    .title-section {
      text-align: center;
      margin: 12px 0 16px 0;
    }
    .main-title {
      font-size: 16pt;
      font-weight: bold;
      text-transform: uppercase;
      margin: 0 0 4px 0;
    }
    .sub-title {
      font-size: 13pt;
      font-weight: bold;
      margin: 0;
    }
    table.data-table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 8px;
    }
    table.data-table th, table.data-table td {
      border: 1px solid #333;
      padding: 6px 8px;
      font-size: 11pt;
    }
    table.data-table th {
      background-color: #f1f5f9;
      font-weight: bold;
      text-align: center;
      text-transform: uppercase;
    }
    .summary-text {
      margin-top: 8px;
      font-weight: bold;
      font-size: 11.5pt;
    }
    .signature-table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 24px;
      page-break-inside: avoid;
    }
    .signature-table td {
      border: none;
      text-align: center;
      vertical-align: top;
      font-size: 11.5pt;
      width: 33.33%;
    }
    .btn-print {
      position: fixed;
      top: 16px;
      right: 16px;
      background: #1e40af;
      color: #fff;
      border: none;
      padding: 8px 16px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      box-shadow: 0 2px 6px rgba(0,0,0,0.2);
      z-index: 9999;
    }
    @media print {
      .btn-print { display: none; }
    }
  </style>
</head>
<body>
  <button onclick="window.print()" class="btn-print">In Kế hoạch (A4)</button>
  
  ${sections.map((sec) => `
    <div class="sheet">
      <table class="header-table">
        <tr>
          <td style="width: 45%;">
            UBND HUYỆN KIÊN HẢI<br>
            <strong>TRƯỜNG MẦM NON HÒN TRE</strong>
          </td>
          <td style="width: 55%; text-align: center;">
            <strong>CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</strong><br>
            <u>Độc lập - Tự do - Hạnh phúc</u>
          </td>
        </tr>
      </table>

      <div class="title-section">
        <h1 class="main-title">DỰ KIẾN KẾ HOẠCH CHỦ ĐỀ VÀ THỜI GIAN THỰC HIỆN</h1>
        <p class="sub-title">* ${sec.label.toUpperCase()}</p>
      </div>

      <table class="data-table">
        <thead>
          <tr>
            <th style="width: 5%;">STT</th>
            <th style="width: 22%;">Chủ đề lớn</th>
            <th style="width: 25%;">Chủ đề nhánh</th>
            <th style="width: 9%;">Số tuần</th>
            <th style="width: 11%;">Thứ tự tuần</th>
            <th style="width: 18%;">Dự kiến thời gian</th>
            <th style="width: 10%;">Ghi chú</th>
          </tr>
        </thead>
        <tbody>
          ${sec.rowsHtml}
        </tbody>
      </table>

      <p class="summary-text">Tổng số: ${sec.totalThemes} chủ đề lớn &mdash; Tổng cộng 35 tuần thực hiện.</p>

      <table class="signature-table">
        <tr>
          <td>
            <strong>NGƯỜI LẬP KẾ HOẠCH</strong><br>
            <em>(Ký, ghi rõ họ tên)</em>
            <div style="height: 60px;"></div>
          </td>
          <td>
            <strong>TỔ TRƯỞNG CHUYÊN MÔN</strong><br>
            <em>(Ký, ghi rõ họ tên)</em>
            <div style="height: 60px;"></div>
          </td>
          <td>
            <em>Ngày ..... tháng ..... năm 2026</em><br>
            <strong>HIỆU TRƯỞNG DUYỆT</strong><br>
            <em>(Ký, đóng dấu)</em>
            <div style="height: 60px;"></div>
          </td>
        </tr>
      </table>
    </div>
  `).join('')}
</body>
</html>`;
  }

  // ==========================================================================
  // 2. EXPORT THEME TEACHING PLAN (Kế hoạch giáo dục theo chủ đề nhánh của Lớp)
  // Backlog #103 - Dựa trên mẫu docs/BGD/Lớp học của bé.html
  // ==========================================================================

  async exportThemeTeachingPlanPrintHtml({ classId, themeId }) {
    const targetClass = await this._resolveClass(classId);
    if (!targetClass) throw new NotFound('Không tìm thấy thông tin lớp học.');

    // Tìm theme an toàn qua helper
    const theme = await this._resolveTheme(themeId, targetClass.age_group, targetClass.school_year_id);

    // Lấy hoạt động theo chủ đề
    const activities = await prisma.subThemeActivity.findMany({
      where: {
        class_id: targetClass.class_id,
        sub_theme: { theme_id: theme ? theme.theme_id : undefined },
      },
      include: {
        activity: {
          include: {
            content: {
              include: { goal: true },
            },
          },
        },
        sub_theme: true,
      },
      orderBy: [{ scheduled_date: 'asc' }, { order_index: 'asc' }],
    });

    const teacherName = targetClass.teacher_classes?.[0]?.teacher?.full_name || 'Giáo viên phụ trách';
    const startDateStr = theme?.start_date ? formatDateVn(theme.start_date) : '07/09/2026';
    const endDateStr = theme?.end_date ? formatDateVn(theme.end_date) : '02/10/2026';

    // Nhóm hoạt động theo Routine Slot
    const slotKeys = [
      'ARRIVAL_PLAY',
      'MORNING_EXERCISE',
      'DIRECTED_STUDY',
      'CORNER_PLAY',
      'OUTDOOR_PLAY',
      'EAT_SLEEP',
      'AFTERNOON_ACTIVITY',
      'RETURN_CHILD',
    ];

    const slotData = slotKeys.map((slot) => {
      const matched = activities.filter((a) => a.routine_slot === slot);
      const title = ROUTINE_SLOT_LABELS[slot] || slot;
      
      let descriptionHtml = '';
      let objectivesHtml = '';
      let preparationHtml = '';
      let executionHtml = '';
      let goalsHtml = '';

      if (matched.length > 0) {
        descriptionHtml = matched.map((m) => `<p>• ${m.activity?.title || ''}</p>`).join('');
        objectivesHtml = matched
          .map((m) => m.activity?.objective)
          .filter(Boolean)
          .map((o) => `<p>${o}</p>`)
          .join('') || '<p>Trẻ thực hiện tốt nội dung hoạt động theo lứa tuổi.</p>';
        preparationHtml = matched
          .map((m) => m.activity?.preparation)
          .filter(Boolean)
          .map((p) => `<p>${p}</p>`)
          .join('') || '<p>Đồ dùng dạy học, tranh ảnh, đồ chơi tại các góc an toàn.</p>';
        executionHtml = matched
          .map((m) => m.activity?.procedure)
          .filter(Boolean)
          .map((p) => `<p>${p}</p>`)
          .join('') || '<p>1. Khởi động tạo hứng thú &mdash; 2. Trọng động tổ chức hoạt động &mdash; 3. Nhận xét, kết thúc.</p>';
        goalsHtml = matched
          .map((m) => m.activity?.content?.goal?.goal_code)
          .filter(Boolean)
          .map((g) => `<span style="display:inline-block; margin:2px 4px; padding:2px 6px; background:#e2e8f0; font-weight:bold; font-size:10pt;">${g}</span>`)
          .join('');
      } else {
        // Mẫu chuẩn sư phạm nếu chưa xếp chi tiết
        if (slot === 'ARRIVAL_PLAY') {
          descriptionHtml = '<p>Cô đón trẻ vào lớp, hướng dẫn trẻ cất đồ dùng cá nhân, điểm danh, trò chuyện về chủ đề.</p>';
          objectivesHtml = '<p>Trẻ biết chào cô, chào bố mẹ, cất đồ dùng đúng nơi quy định, vui vẻ vào lớp.</p>';
          preparationHtml = '<p>Phòng học thoáng mát, sạch sẽ, đồ chơi an toàn.</p>';
          executionHtml = '<p>Cô niềm nở đón trẻ, nhắc trẻ cất ba lô, dép đúng nơi. Cho trẻ tự chọn góc chơi nhẹ nhàng.</p>';
          goalsHtml = '<span style="font-weight:bold; color:#1e40af;">(MT 01, MT 02)</span>';
        } else if (slot === 'MORNING_EXERCISE') {
          descriptionHtml = '<p>Tập bài thể dục sáng theo nhạc chủ đề: Hô hấp, Tay, Bụng - lườn, Chân, Bật nhảy.</p>';
          objectivesHtml = '<p>Trẻ tập đúng động tác cùng cô, phát triển thể lực và tính kỷ luật.</p>';
          preparationHtml = '<p>Sân bãi sạch sẽ, thoáng mát, âm nhạc loa đài sẵn sàng.</p>';
          executionHtml = '<p>1. Khởi động đi vòng tròn &mdash; 2. Trọng động tập bài thể dục theo nhịp &mdash; 3. Hồi tĩnh đi nhẹ nhàng.</p>';
          goalsHtml = '<span style="font-weight:bold; color:#1e40af;">(MT 03, MT 04)</span>';
        } else if (slot === 'DIRECTED_STUDY') {
          descriptionHtml = '<p>Hoạt động học có chủ đích theo các lĩnh vực: Khám phá khoa học, Làm quen toán, Âm nhạc, Tạo hình, Văn học.</p>';
          objectivesHtml = '<p>Trẻ tiếp thu kiến thức trọng tâm của đề tài, tích cực phát biểu, rèn luyện kỹ năng nhận thức.</p>';
          preparationHtml = '<p>Giáo án điện tử, tranh ảnh trực quan, học liệu tạo hình cho trẻ.</p>';
          executionHtml = '<p>1. Ổn định gây hứng thú &mdash; 2. Nội dung chính: Cung cấp kiến thức & cho trẻ trải nghiệm &mdash; 3. Củng cố, đánh giá.</p>';
          goalsHtml = '<span style="font-weight:bold; color:#1e40af;">(MT 12, MT 15)</span>';
        } else {
          descriptionHtml = '<p>Tổ chức các hoạt động rèn luyện nền nếp, kỹ năng sống và vui chơi sinh hoạt.</p>';
          objectivesHtml = '<p>Trẻ biết phối hợp cùng bạn, giữ gìn vệ sinh và an toàn.</p>';
          preparationHtml = '<p>Đồ dùng, đồ chơi phù hợp hoạt động.</p>';
          executionHtml = '<p>Cô hướng dẫn, quan sát, động viên và trợ giúp trẻ kịp thời.</p>';
          goalsHtml = '<span style="color:#64748b;">(Đạt 100%)</span>';
        }
      }

      return `
        <tr>
          <td style="vertical-align: top; width: 22%;">
            <strong style="text-transform: uppercase; color: #1e3a8a;">${title}</strong>
            <div style="font-size: 10.5pt; margin-top: 4px; color: #334155;">${descriptionHtml}</div>
          </td>
          <td style="vertical-align: top; width: 60%;">
            <div style="margin-bottom: 6px;">
              <strong>1. Mục đích - Yêu cầu:</strong>
              <div style="margin-left: 8px;">${objectivesHtml}</div>
            </div>
            <div style="margin-bottom: 6px;">
              <strong>2. Chuẩn bị:</strong>
              <div style="margin-left: 8px;">${preparationHtml}</div>
            </div>
            <div>
              <strong>3. Tổ chức thực hiện:</strong>
              <div style="margin-left: 8px;">${executionHtml}</div>
            </div>
          </td>
          <td style="vertical-align: top; width: 18%; text-align: center;">
            <div style="margin-bottom: 6px;">${goalsHtml}</div>
            <div style="font-size: 10pt; color: #475569; margin-top: 8px;">Trẻ hứng thú tham gia, đạt yêu cầu đề ra.</div>
          </td>
        </tr>
      `;
    });

    return `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <title>Kế hoạch Giáo dục theo Chủ đề - ${targetClass.name}</title>
  <style>
    @page {
      size: A4 landscape;
      margin: 12mm 15mm;
    }
    body {
      font-family: 'Times New Roman', serif;
      font-size: 12.5pt;
      line-height: 1.35;
      color: #111;
      margin: 0;
      padding: 0;
    }
    .header-box {
      display: flex;
      justify-content: space-between;
      margin-bottom: 12px;
    }
    .title-box {
      text-align: center;
      margin: 8px 0 16px 0;
    }
    .title-box h1 {
      font-size: 16pt;
      margin: 0 0 4px 0;
      text-transform: uppercase;
      font-weight: bold;
    }
    .title-box h2 {
      font-size: 13pt;
      margin: 0;
      font-weight: normal;
    }
    table.plan-table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 8px;
    }
    table.plan-table th, table.plan-table td {
      border: 1px solid #333;
      padding: 8px;
      font-size: 11pt;
    }
    table.plan-table th {
      background-color: #f1f5f9;
      font-weight: bold;
      text-align: center;
      text-transform: uppercase;
    }
    .btn-print {
      position: fixed;
      top: 16px;
      right: 16px;
      background: #1e40af;
      color: #fff;
      border: none;
      padding: 8px 16px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      box-shadow: 0 2px 6px rgba(0,0,0,0.2);
      z-index: 9999;
    }
    @media print {
      .btn-print { display: none; }
    }
  </style>
</head>
<body>
  <button onclick="window.print()" class="btn-print">In Kế hoạch Chủ đề (A4)</button>

  <div class="header-box">
    <div>
      <p style="margin:0; font-weight:bold;">ĐƠN VỊ: TRƯỜNG MẦM NON HÒN TRE</p>
      <p style="margin:2px 0;">LỚP: ${targetClass.name} &mdash; ${targetClass.grade_label || 'Khối mầm non'}</p>
    </div>
    <div style="text-align:right;">
      <p style="margin:0;">Giáo viên thực hiện: <strong>${teacherName}</strong></p>
      <p style="margin:2px 0;">Thời gian: <strong>Từ ${startDateStr} đến ${endDateStr}</strong></p>
    </div>
  </div>

  <div class="title-box">
    <h1>KẾ HOẠCH GIÁO DỤC CHỦ ĐỀ: ${(theme?.name || 'CHỦ ĐỀ CHÍNH').toUpperCase()}</h1>
    <h2>Lớp ${targetClass.name} &bull; Năm học 2026 &ndash; 2027</h2>
  </div>

  <table class="plan-table">
    <thead>
      <tr>
        <th style="width: 22%;">GIỜ SINH HOẠT</th>
        <th style="width: 60%;">NỘI DUNG HOẠT ĐỘNG & BIỆN PHÁP THỰC HIỆN</th>
        <th style="width: 18%;">MỤC TIÊU & ĐÁNH GIÁ</th>
      </tr>
    </thead>
    <tbody>
      ${slotData.join('')}
    </tbody>
  </table>

  <table style="width: 100%; border-collapse: collapse; margin-top: 24px; page-break-inside: avoid;">
    <tr>
      <td style="width: 50%; text-align: center; vertical-align: top; border: none; font-size: 11pt;">
        <strong>GIÁO VIÊN CHỦ NHIỆM</strong><br>
        <em>(Ký, ghi rõ họ tên)</em>
        <div style="height: 60px;"></div>
        <strong>${teacherName}</strong>
      </td>
      <td style="width: 50%; text-align: center; vertical-align: top; border: none; font-size: 11pt;">
        <em>Hòn Tre, ngày ..... tháng ..... năm 2026</em><br>
        <strong>BAN GIÁM HIỆU DUYỆT</strong><br>
        <em>(Ký, đóng dấu)</em>
        <div style="height: 60px;"></div>
      </td>
    </tr>
  </table>
</body>
</html>`;
  }

  /**
   * Xuất Kế hoạch phân bổ mục tiêu và kế hoạch giáo dục theo chủ đề ra file Excel (.xlsx)
   */
  async exportThemeTeachingPlanExcel({ classId, themeId }) {
    const targetClass = await this._resolveClass(classId);
    if (!targetClass) throw new NotFound('Không tìm thấy thông tin lớp học.');

    // Tìm theme an toàn qua helper
    const targetTheme = await this._resolveTheme(themeId, targetClass.age_group, targetClass.school_year_id);

    const teacherName = targetClass.teacher_classes?.[0]?.teacher?.full_name || 'Giáo viên phụ trách';
    const schoolYearName = targetClass.school_year?.name || '2026-2027';

    // 1. Lấy tất cả chủ đề của khối lớp trong năm học kèm các chủ đề nhánh
    const themes = await prisma.curriculumTheme.findMany({
      where: {
        school_year_id: targetClass.school_year_id,
        age_group: targetClass.age_group,
        deleted_at: null,
      },
      include: {
        sub_themes: {
          where: { deleted_at: null },
          orderBy: { start_date: 'asc' },
        },
      },
      orderBy: { start_date: 'asc' },
    });

    // 2. Lấy tất cả hoạt động đã lên lịch của lớp
    const allSubThemeActivities = await prisma.subThemeActivity.findMany({
      where: { class_id: targetClass.class_id },
      include: {
        activity: {
          include: {
            content: {
              include: { goal: true },
            },
          },
        },
        sub_theme: true,
      },
      orderBy: [
        { scheduled_date: 'asc' },
        { routine_slot: 'asc' },
        { order_index: 'asc' },
      ],
    });

    // Map hoạt động theo sub_theme_id
    const actsBySubTheme = new Map();
    for (const act of allSubThemeActivities) {
      const stId = act.sub_theme_id.toString();
      if (!actsBySubTheme.has(stId)) actsBySubTheme.set(stId, []);
      actsBySubTheme.get(stId).push(act);
    }

    // 3. Lấy phân bổ nội dung của lớp (classThemeContent) để fallback cho các nội dung chưa xếp lịch ngày
    const allClassContents = await prisma.classThemeContent.findMany({
      where: { class_id: targetClass.class_id },
      include: {
        content: {
          include: {
            goal: true,
            activities: { where: { deleted_at: null } },
          },
        },
      },
    });

    const contentsByTheme = new Map();
    for (const cc of allClassContents) {
      const tId = cc.theme_id.toString();
      if (!contentsByTheme.has(tId)) contentsByTheme.set(tId, []);
      contentsByTheme.get(tId).push(cc);
    }

    // Khởi tạo Workbook chuẩn Sorak
    const { workbook, worksheet: sheetOverview } = createStandardWorkbook('Tổng quan năm học');

    // =========================================================================
    // SHEET 1: TỔNG QUAN NĂM HỌC (Mục lục các chủ đề, thời gian, số nhánh, số HĐ)
    // =========================================================================
    const startRowOverview = addSchoolHeaderBanner(sheetOverview, {
      title: 'TỔNG QUAN PHÂN PHỐI CHỦ ĐỀ & KẾ HOẠCH GIÁO DỤC',
      subtitle: `Lớp: ${targetClass.name.toUpperCase()}  |  Năm học: ${schoolYearName}  |  Giáo viên: ${teacherName}  |  Tổng số chủ đề: ${themes.length}`,
      schoolYearName,
      totalCols: 6,
    });

    const headerRowOverview = sheetOverview.getRow(startRowOverview);
    headerRowOverview.values = [
      'STT',
      'Tên chủ đề giáo dục',
      'Thời gian thực hiện',
      'Số nhánh (Tuần)',
      'Số hoạt động GD',
      'Trạng thái kế hoạch',
    ];
    applyHeaderStyles(headerRowOverview);

    let curRowOverview = startRowOverview + 1;
    themes.forEach((t, idx) => {
      const subThemes = t.sub_themes || [];
      let actCount = 0;
      subThemes.forEach((st) => {
        actCount += (actsBySubTheme.get(st.sub_theme_id.toString()) || []).length;
      });

      const startStr = t.start_date ? formatDateVn(t.start_date) : '';
      const endStr = t.end_date ? formatDateVn(t.end_date) : '';
      const timeStr = startStr && endStr ? `${startStr} - ${endStr}` : 'Chưa xếp lịch';
      const statusStr = actCount > 0 ? 'Đã lập kế hoạch' : 'Chưa phân bổ';

      const row = sheetOverview.getRow(curRowOverview++);
      row.values = [
        idx + 1,
        t.name,
        timeStr,
        subThemes.length,
        actCount,
        statusStr,
      ];
    });

    applyZebraAndBorders(sheetOverview, startRowOverview + 1);
    sheetOverview.columns = [
      { width: 8 },   // STT
      { width: 38 },  // Tên chủ đề
      { width: 26 },  // Thời gian
      { width: 16 },  // Số nhánh
      { width: 18 },  // Số HĐ
      { width: 22 },  // Trạng thái
    ];

    // =========================================================================
    // CÁC SHEET TIẾP THEO: MỖI CHỦ ĐỀ 1 SHEET RIÊNG BIỆT (BẢNG 5 CỘT TINH GỌN)
    // =========================================================================
    const seenSheetTitles = new Set(['Tổng quan năm học']);
    let targetSheetIndex = -1;

    themes.forEach((theme, tIdx) => {
      const numPrefix = String(tIdx + 1).padStart(2, '0');
      let sheetTitle = cleanSheetTitle(`CĐ ${numPrefix} - ${theme.name}`, 31);
      if (seenSheetTitles.has(sheetTitle)) {
        sheetTitle = cleanSheetTitle(`CĐ ${numPrefix} (${tIdx + 1})`, 31);
      }
      seenSheetTitles.add(sheetTitle);

      // Ghi nhận tab active nếu trùng với chủ đề đang thao tác
      if (
        targetTheme &&
        (targetTheme.theme_id === theme.theme_id ||
          (targetTheme.public_id && targetTheme.public_id === theme.public_id))
      ) {
        targetSheetIndex = tIdx + 1; // +1 vì sheet 0 là sheet Tổng quan
      }

      const sheetTheme = workbook.addWorksheet(sheetTitle, {
        views: [{ showGridLines: true }],
        pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
      });

      const startDateStr = theme.start_date ? formatDateVn(theme.start_date) : '';
      const endDateStr = theme.end_date ? formatDateVn(theme.end_date) : '';
      const timeRangeStr = startDateStr && endDateStr ? `${startDateStr} - ${endDateStr}` : '';
      const subThemeCount = (theme.sub_themes || []).length;

      const startRowTheme = addSchoolHeaderBanner(sheetTheme, {
        title: `KẾ HOẠCH GIÁO DỤC CHỦ ĐỀ ${numPrefix}: ${theme.name.toUpperCase()}`,
        subtitle: `Lớp: ${targetClass.name.toUpperCase()}  |  Thời gian: ${timeRangeStr} (${subThemeCount} nhánh chủ đề)  |  GV: ${teacherName}`,
        schoolYearName,
        totalCols: 5,
      });

      const headerRowTheme = sheetTheme.getRow(startRowTheme);
      headerRowTheme.values = [
        'STT',
        'Chủ đề nhánh (Tuần)',
        'Chế độ sinh hoạt',
        'Mục tiêu & Nội dung giáo dục',
        'Hoạt động giáo dục & Kết quả mong đợi',
      ];
      applyHeaderStyles(headerRowTheme);

      let stt = 1;
      let curRow = startRowTheme + 1;

      if (!theme.sub_themes || theme.sub_themes.length === 0) {
        const row = sheetTheme.getRow(curRow++);
        row.values = [
          1,
          '(Chưa phân chia nhánh)',
          '-',
          '(Chưa phân bổ nội dung giáo dục)',
          '(Chưa xếp lịch hoạt động giáo dục)',
        ];
      } else {
        for (const subTheme of theme.sub_themes) {
          const subStartDate = subTheme.start_date ? formatDateVn(subTheme.start_date) : '';
          const subEndDate = subTheme.end_date ? formatDateVn(subTheme.end_date) : '';
          const subDates = subStartDate && subEndDate ? `\n(${subStartDate} - ${subEndDate})` : '';
          const subThemeLabel = `${subTheme.name}${subDates}`;

          const scheduledActs = actsBySubTheme.get(subTheme.sub_theme_id.toString()) || [];

          if (scheduledActs.length > 0) {
            for (const actItem of scheduledActs) {
              const act = actItem.activity;
              const content = act?.content;
              const goal = content?.goal;
              const domainLabel = DOMAIN_LABELS[goal?.domain] || goal?.domain || 'Chung';
              const rawSlotLabel = ROUTINE_SLOT_LABELS[actItem.routine_slot] || actItem.routine_slot || '';
              const dayLabel = DAY_LABELS[actItem.day_of_week] || '';
              const dateStr = actItem.scheduled_date ? formatDateVn(actItem.scheduled_date) : '';
              const timeDetail = [dayLabel, dateStr].filter(Boolean).join(' - ');
              const slotLabel = timeDetail ? `${rawSlotLabel}\n• ${timeDetail}` : rawSlotLabel;

              // Cột 4: [Mã MT] Lĩnh vực GD \n • Tên nội dung
              const goalCodePart = goal?.goal_code ? `[${goal.goal_code}] ` : '';
              const contentCell = `${goalCodePart}${domainLabel}\n• ${content?.title || 'Nội dung chung'}`;

              // Cột 5: Tên hoạt động \n • Kết quả: Kết quả mong đợi
              const objPart = act?.objective ? `\n• Kết quả: ${act.objective}` : '';
              const activityCell = `${act?.title || 'Hoạt động giáo dục'}${objPart}`;

              const row = sheetTheme.getRow(curRow++);
              row.values = [
                stt++,
                subThemeLabel,
                slotLabel,
                contentCell,
                activityCell,
              ];
            }
          } else {
            // Chưa có lịch chi tiết, fallback phân bổ nội dung từ classThemeContent
            const allocated = contentsByTheme.get(theme.theme_id.toString()) || [];
            if (allocated.length > 0) {
              for (const ac of allocated) {
                const content = ac.content;
                const goal = content?.goal;
                const domainLabel = DOMAIN_LABELS[goal?.domain] || goal?.domain || 'Chung';
                const bankActs = content?.activities || [];

                const goalCodePart = goal?.goal_code ? `[${goal.goal_code}] ` : '';
                const contentCell = `${goalCodePart}${domainLabel}\n• ${content?.title || 'Nội dung chung'}`;

                if (bankActs.length > 0) {
                  for (const ba of bankActs) {
                    const slotLabel = ROUTINE_SLOT_LABELS[ba.routine_slot] || ba.routine_slot || '';
                    const objPart = ba.objective ? `\n• Kết quả: ${ba.objective}` : '';
                    const activityCell = `${ba.title || 'Hoạt động giáo dục'}${objPart}`;

                    const row = sheetTheme.getRow(curRow++);
                    row.values = [
                      stt++,
                      subThemeLabel,
                      slotLabel,
                      contentCell,
                      activityCell,
                    ];
                  }
                } else {
                  const row = sheetTheme.getRow(curRow++);
                  row.values = [
                    stt++,
                    subThemeLabel,
                    '-',
                    contentCell,
                    '(Chưa tạo hoạt động trong ngân hàng)',
                  ];
                }
              }
            } else {
              const row = sheetTheme.getRow(curRow++);
              row.values = [
                stt++,
                subThemeLabel,
                '-',
                '(Chưa phân bổ nội dung giáo dục)',
                '(Chưa xếp lịch hoạt động giáo dục)',
              ];
            }
          }
        }
      }

      applyZebraAndBorders(sheetTheme, startRowTheme + 1);
      sheetTheme.columns = [
        { width: 7 },   // STT
        { width: 30 },  // Nhánh chủ đề (Tuần)
        { width: 22 },  // Chế độ sinh hoạt
        { width: 44 },  // Mục tiêu & Nội dung GD
        { width: 50 },  // Hoạt động GD & Kết quả mong đợi
      ];

      sheetTheme.eachRow((row, rowNumber) => {
        if (rowNumber > startRowTheme) {
          row.getCell(2).alignment = { vertical: 'top', wrapText: true };
          row.getCell(3).alignment = { vertical: 'top', wrapText: true };
          row.getCell(4).alignment = { vertical: 'top', wrapText: true };
          row.getCell(5).alignment = { vertical: 'top', wrapText: true };
        }
      });
    });

    // Mở đúng Sheet của chủ đề đang chọn nếu có
    if (targetSheetIndex >= 0) {
      workbook.views = [
        {
          x: 0,
          y: 0,
          width: 10000,
          height: 20000,
          firstSheet: 0,
          activeTab: targetSheetIndex,
          visibility: 'visible',
        },
      ];
    }

    return workbook.xlsx.writeBuffer();
  }

  // ==========================================================================
  // 3. EXPORT WEEKLY TEACHING PLAN (Kế hoạch giáo dục Tuần)
  // Backlog #110 - Dựa trên mẫu docs/BGD/KHTuan_1_Lớp học của bé.html
  // ==========================================================================

  async exportWeeklyTeachingPlanPrintHtml({ classId, weekNumber = 1, date }) {
    const targetClass = await this._resolveClass(classId);
    if (!targetClass) throw new NotFound('Không tìm thấy thông tin lớp học.');

    // Tính khoảng ngày Thứ hai - Thứ sáu của tuần
    const parsedWeekNum = parseInt(weekNumber, 10) || 1;
    const startAcademic = new Date(Date.UTC(2026, 8, 7)); // Thứ 2 ngày 07/09/2026
    const weekMonday = new Date(startAcademic);
    weekMonday.setUTCDate(startAcademic.getUTCDate() + (parsedWeekNum - 1) * 7);

    const weekFriday = new Date(weekMonday);
    weekFriday.setUTCDate(weekMonday.getUTCDate() + 4);

    const startStr = formatDateVn(weekMonday);
    const endStr = formatDateVn(weekFriday);

    // Truy vấn hoạt động trong tuần của lớp
    const activities = await prisma.subThemeActivity.findMany({
      where: {
        class_id: targetClass.class_id,
        scheduled_date: {
          gte: weekMonday,
          lte: new Date(weekMonday.getTime() + 6 * 24 * 60 * 60 * 1000),
        },
      },
      include: {
        activity: {
          include: {
            content: {
              include: { goal: true },
            },
          },
        },
        sub_theme: true,
      },
      orderBy: [{ scheduled_date: 'asc' }, { order_index: 'asc' }],
    });

    const teacherName = targetClass.teacher_classes?.[0]?.teacher?.full_name || 'Lee Dieu';
    const subThemeName = activities?.[0]?.sub_theme?.name || 'Khám phá trường lớp mầm non của bé';

    // Xây dựng ma trận 5 ngày
    const days = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'];

    const slots = [
      { key: 'ARRIVAL_PLAY', label: 'Đón Trẻ, Chơi' },
      { key: 'MORNING_EXERCISE', label: 'Thể Dục Sáng' },
      { key: 'DIRECTED_STUDY', label: 'Học' },
      { key: 'CORNER_PLAY', label: 'Chơi Ở Các Góc' },
      { key: 'OUTDOOR_PLAY', label: 'Chơi Ngoài Trời' },
      { key: 'EAT_SLEEP', label: 'Ăn, Ngủ, Vệ Sinh' },
      { key: 'AFTERNOON_ACTIVITY', label: 'Hoạt Động Chiều' },
      { key: 'RETURN_CHILD', label: 'Trả Trẻ' },
    ];

    const rowsHtml = slots.map((slot) => {
      // Đối với Đón trẻ, Thể dục sáng, Chơi góc: Nếu giống nhau cả tuần thì colspan 5
      if (['ARRIVAL_PLAY', 'MORNING_EXERCISE', 'CORNER_PLAY', 'OUTDOOR_PLAY', 'EAT_SLEEP', 'RETURN_CHILD'].includes(slot.key)) {
        const anyAct = activities.find((a) => a.routine_slot === slot.key);
        let content = anyAct?.activity?.title || '';
        let goalCode = anyAct?.activity?.content?.goal?.goal_code || '';

        if (!content) {
          if (slot.key === 'ARRIVAL_PLAY') {
            content = 'Cô đón trẻ mở phòng thông thoáng, mở nhạc chủ đề, cùng trò chuyện về chủ đề trường mầm non. Điểm danh, nhắc trẻ chào cô chào bố mẹ.';
          } else if (slot.key === 'MORNING_EXERCISE') {
            content = 'Thể dục sáng theo nhạc: Hô hấp (2x8), Tay đưa lên cao (2x8), Lưng bụng lườn (2x8), Bật chân (2x8 nhịp).';
            goalCode = 'MT 02, MT 01';
          } else if (slot.key === 'CORNER_PLAY') {
            content = 'Góc phân vai: Bác sĩ, Gia đình, Bán hàng. Góc xây dựng: Xây trường mầm non. Góc nghệ thuật: Vẽ hoa, nặn quả.';
          } else if (slot.key === 'OUTDOOR_PLAY') {
            content = 'Quan sát thời tiết, chăm sóc vườn hoa sân trường. Trò chơi vận động: Kéo co, Mèo đuổi chuột.';
          } else if (slot.key === 'EAT_SLEEP') {
            content = 'Rèn thói quen rửa tay bằng xà phòng trước khi ăn, xúc cơm gọn gàng, ngủ đúng giờ, dậy xếp chăn gối.';
          } else if (slot.key === 'RETURN_CHILD') {
            content = 'Vệ sinh cho trẻ, cho trẻ chơi tự do, trao đổi tình hình trong ngày với phụ huynh khi đón trẻ.';
          }
        }

        return `
          <tr>
            <td style="text-align:center; font-weight:bold; background:#f8fafc;">${slot.label}</td>
            <td colspan="5" style="padding: 8px 10px;">
              <div>${content}</div>
              ${goalCode ? `<div style="color:#b91c1c; font-weight:bold; margin-top:4px;">(${goalCode})</div>` : ''}
            </td>
          </tr>
        `;
      }

      // Đối với Hoạt động Học và Chiều: Chia theo 5 cột ngày
      const dayCells = days.map((day) => {
        const act = activities.find((a) => a.day_of_week === day && a.routine_slot === slot.key);
        if (act) {
          const goal = act.activity?.content?.goal?.goal_code;
          return `
            <td style="vertical-align: top; padding: 6px 8px;">
              <div style="font-weight: 500;">${act.activity?.title || ''}</div>
              ${goal ? `<div style="color: #b91c1c; font-weight: bold; font-size: 10pt; margin-top: 4px;">(${goal})</div>` : ''}
            </td>
          `;
        }

        // Fallback mẫu theo chuẩn mẫu BGD
        let defaultText = '';
        if (slot.key === 'DIRECTED_STUDY') {
          if (day === 'MONDAY') defaultText = '<strong>Âm nhạc:</strong> Dạy hát "Vui đến trường", Vỗ tay theo phách <br><span style="color:#b91c1c;">(MT 135)</span>';
          else if (day === 'TUESDAY') defaultText = '<strong>Thể dục:</strong> Đi khụy gối, Bò dích dắc qua chướng ngại vật <br><span style="color:#b91c1c;">(MT 12)</span>';
          else if (day === 'WEDNESDAY') defaultText = '<strong>Khám phá:</strong> Trò chuyện về trường mầm non và các bạn <br><span style="color:#b91c1c;">(MT 65)</span>';
          else if (day === 'THURSDAY') defaultText = '<strong>Tạo hình:</strong> Vẽ và tô màu bức tranh trường của bé <br><span style="color:#b91c1c;">(MT 120)</span>';
          else defaultText = '<strong>Làm quen toán:</strong> Đếm đến 5, nhận biết nhóm có 5 đối tượng <br><span style="color:#b91c1c;">(MT 40)</span>';
        } else {
          defaultText = 'Ôn luyện kỹ năng, làm quen bài hát mới, biểu diễn văn nghệ cuối tuần.';
        }

        return `<td style="vertical-align: top; padding: 6px 8px;">${defaultText}</td>`;
      });

      return `
        <tr>
          <td style="text-align:center; font-weight:bold; background:#f8fafc;">${slot.label}</td>
          ${dayCells.join('')}
        </tr>
      `;
    });

    return `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <title>Kế hoạch Giáo dục Tuần ${parsedWeekNum} - ${targetClass.name}</title>
  <style>
    @page {
      size: A4 landscape;
      margin: 10mm 15mm;
    }
    body {
      font-family: 'Times New Roman', serif;
      font-size: 12pt;
      line-height: 1.35;
      color: #111;
      margin: 0;
      padding: 0;
    }
    .header-box {
      display: flex;
      justify-content: space-between;
      margin-bottom: 8px;
    }
    .title-box {
      text-align: center;
      margin: 6px 0 12px 0;
    }
    .title-box h1 {
      font-size: 16pt;
      margin: 0 0 4px 0;
      text-transform: uppercase;
      font-weight: bold;
    }
    .title-box h2 {
      font-size: 13pt;
      margin: 0 0 2px 0;
      font-weight: bold;
      color: #1e3a8a;
    }
    table.week-table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 8px;
    }
    table.week-table th, table.week-table td {
      border: 1px solid #333;
      padding: 6px 8px;
      font-size: 10.5pt;
    }
    table.week-table th {
      background-color: #f1f5f9;
      font-weight: bold;
      text-align: center;
      text-transform: uppercase;
    }
    .btn-print {
      position: fixed;
      top: 16px;
      right: 16px;
      background: #1e40af;
      color: #fff;
      border: none;
      padding: 8px 16px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      box-shadow: 0 2px 6px rgba(0,0,0,0.2);
      z-index: 9999;
    }
    @media print {
      .btn-print { display: none; }
    }
  </style>
</head>
<body>
  <button onclick="window.print()" class="btn-print">In Kế hoạch Tuần (A4)</button>

  <div class="header-box">
    <div>
      <p style="margin:0; font-weight:bold;">ĐƠN VỊ: TRƯỜNG MN HÒN TRE</p>
      <p style="margin:2px 0;">TỔ KHỐI: ${targetClass.grade_label || 'Khối 5 - 6 tuổi'}</p>
      <p style="margin:2px 0;">LỚP: <strong>${targetClass.name}</strong></p>
    </div>
    <div style="text-align:right;">
      <p style="margin:0;">Giáo viên thực hiện: <strong>${teacherName}</strong></p>
      <p style="margin:2px 0;">Thời gian: <strong>Từ ngày ${startStr} đến ngày ${endStr}</strong></p>
    </div>
  </div>

  <div class="title-box">
    <h1>KẾ HOẠCH GIÁO DỤC TUẦN ${parsedWeekNum}</h1>
    <h2>CHỦ ĐỀ NHÁNH: ${subThemeName.toUpperCase()}</h2>
  </div>

  <table class="week-table">
    <thead>
      <tr>
        <th style="width: 12%;">Giờ sinh hoạt</th>
        <th style="width: 17.6%;">Thứ hai</th>
        <th style="width: 17.6%;">Thứ ba</th>
        <th style="width: 17.6%;">Thứ tư</th>
        <th style="width: 17.6%;">Thứ năm</th>
        <th style="width: 17.6%;">Thứ sáu</th>
      </tr>
    </thead>
    <tbody>
      ${rowsHtml.join('')}
    </tbody>
  </table>

  <table style="width: 100%; border-collapse: collapse; margin-top: 20px; page-break-inside: avoid;">
    <tr>
      <td style="width: 50%; text-align: center; vertical-align: top; border: none; font-size: 11pt;">
        <strong>GIÁO VIÊN THỰC HIỆN</strong><br>
        <em>(Ký, ghi rõ họ tên)</em>
        <div style="height: 55px;"></div>
        <strong>${teacherName}</strong>
      </td>
      <td style="width: 50%; text-align: center; vertical-align: top; border: none; font-size: 11pt;">
        <em>Hòn Tre, ngày ..... tháng ..... năm 2026</em><br>
        <strong>HIỆU TRƯỞNG / TỔ TRƯỞNG DUYỆT</strong><br>
        <em>(Ký, ghi rõ họ tên)</em>
        <div style="height: 55px;"></div>
      </td>
    </tr>
  </table>
</body>
</html>`;
  }

  async exportWeeklyTeachingPlanExcel({ classId, weekNumber = 1 }) {
    const targetClass = await this._resolveClass(classId);
    if (!targetClass) throw new NotFound('Không tìm thấy thông tin lớp học.');

    const parsedWeekNum = parseInt(weekNumber, 10) || 1;
    const startAcademic = new Date(Date.UTC(2026, 8, 7)); // Thứ 2 ngày 07/09/2026
    const weekMonday = new Date(startAcademic);
    weekMonday.setUTCDate(startAcademic.getUTCDate() + (parsedWeekNum - 1) * 7);

    const weekFriday = new Date(weekMonday);
    weekFriday.setUTCDate(weekMonday.getUTCDate() + 4);

    const weekSunday = new Date(weekMonday);
    weekSunday.setUTCDate(weekMonday.getUTCDate() + 6);

    const startStr = formatDateVn(weekMonday);
    const endStr = formatDateVn(weekFriday);
    const schoolYearName = targetClass.school_year?.name || '2026-2027';
    const teacherName = targetClass.teacher_classes?.[0]?.teacher?.full_name || 'Giáo viên phụ trách';

    // 1. Truy vấn hoạt động trong tuần của lớp từ PostgreSQL
    const activities = await prisma.subThemeActivity.findMany({
      where: {
        class_id: targetClass.class_id,
        scheduled_date: {
          gte: weekMonday,
          lte: weekSunday,
        },
      },
      include: {
        activity: {
          include: {
            content: {
              include: { goal: true },
            },
          },
        },
        sub_theme: {
          include: { theme: true },
        },
      },
      orderBy: [
        { scheduled_date: 'asc' },
        { routine_slot: 'asc' },
        { order_index: 'asc' },
      ],
    });

    const themeName = activities?.[0]?.sub_theme?.theme?.name || 'Kế hoạch giáo dục';
    const subThemeName = activities?.[0]?.sub_theme?.name || `Tuần ${parsedWeekNum}`;

    // Danh sách 5 ngày học (Thứ 2 đến Thứ 6)
    const daysList = [
      { key: 'MONDAY', label: 'Thứ hai', offset: 0 },
      { key: 'TUESDAY', label: 'Thứ ba', offset: 1 },
      { key: 'WEDNESDAY', label: 'Thứ tư', offset: 2 },
      { key: 'THURSDAY', label: 'Thứ năm', offset: 3 },
      { key: 'FRIDAY', label: 'Thứ sáu', offset: 4 },
    ].map((d) => {
      const curD = new Date(weekMonday);
      curD.setUTCDate(weekMonday.getUTCDate() + d.offset);
      return {
        ...d,
        date: curD,
        dateStr: formatDateShort(curD),
        fullDateStr: formatDateVn(curD),
      };
    });

    // 8 Chế độ sinh hoạt chuẩn mầm non
    const routineSlots = [
      { key: 'ARRIVAL_PLAY', name: 'Đón trẻ, chơi' },
      { key: 'MORNING_EXERCISE', name: 'Thể dục sáng' },
      { key: 'DIRECTED_STUDY', name: 'Hoạt động học' },
      { key: 'CORNER_PLAY', name: 'Chơi ở các góc' },
      { key: 'OUTDOOR_PLAY', name: 'Chơi ngoài trời' },
      { key: 'HYGIENE_MEAL_SLEEP', altKey: 'EAT_SLEEP', name: 'Vệ sinh, ăn, ngủ' },
      { key: 'AFTERNOON_ACTIVITY', name: 'Hoạt động chiều' },
      { key: 'RETURN_CHILD', name: 'Trả trẻ' },
    ];

    // Khởi tạo Workbook chuẩn Sorak
    const { workbook, worksheet: sheet1 } = createStandardWorkbook('Thời khóa biểu tuần');

    // =========================================================================
    // SHEET 1: MA TRẬN THỜI KHÓA BIỂU TUẦN (Thứ 2 -> Thứ 6)
    // =========================================================================
    const startRow1 = addSchoolHeaderBanner(sheet1, {
      title: `KẾ HOẠCH GIÁO DỤC TUẦN ${parsedWeekNum}`,
      subtitle: `Chủ đề: ${themeName.toUpperCase()} — Nhánh: ${subThemeName.toUpperCase()}  |  Lớp: ${targetClass.name.toUpperCase()}  |  Từ ${startStr} đến ${endStr}  |  GV: ${teacherName}`,
      schoolYearName,
      totalCols: 6,
    });

    const headerRow1 = sheet1.getRow(startRow1);
    headerRow1.values = [
      'Chế độ sinh hoạt',
      ...daysList.map((d) => `${d.label}\n(${d.dateStr})`),
    ];
    applyHeaderStyles(headerRow1);

    let curRow1 = startRow1 + 1;

    routineSlots.forEach((slot) => {
      const rowValues = [slot.name];

      daysList.forEach((day) => {
        const matched = activities.filter((a) => {
          const slotMatch = a.routine_slot === slot.key || (slot.altKey && a.routine_slot === slot.altKey);
          const dayMatch = a.day_of_week === day.key;
          return slotMatch && dayMatch;
        });

        if (matched.length > 0) {
          const cellText = matched
            .map((m) => {
              const act = m.activity;
              const goalCode = act?.content?.goal?.goal_code ? ` (${act.content.goal.goal_code})` : '';
              return `• ${act?.title || 'Hoạt động giáo dục'}${goalCode}`;
            })
            .join('\n');
          rowValues.push(cellText);
        } else {
          rowValues.push('-');
        }
      });

      const row = sheet1.getRow(curRow1++);
      row.values = rowValues;
    });

    applyZebraAndBorders(sheet1, startRow1 + 1);
    sheet1.columns = [
      { width: 22 },  // Chế độ sinh hoạt
      { width: 28 },  // Thứ 2
      { width: 28 },  // Thứ 3
      { width: 28 },  // Thứ 4
      { width: 28 },  // Thứ 5
      { width: 28 },  // Thứ 6
    ];

    sheet1.eachRow((row, rowNumber) => {
      if (rowNumber > startRow1) {
        row.alignment = { vertical: 'top', wrapText: true };
        row.getCell(1).alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
      }
    });

    // =========================================================================
    // SHEET 2: KẾ HOẠCH CHI TIẾT TỪNG HOẠT ĐỘNG (GIÁO ÁN CHI TIẾT TUẦN)
    // =========================================================================
    const sheet2 = workbook.addWorksheet('Chi tiết hoạt động', {
      views: [{ showGridLines: true }],
      pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
    });

    const startRow2 = addSchoolHeaderBanner(sheet2, {
      title: `KẾ HOẠCH CHI TIẾT HOẠT ĐỘNG GIÁO DỤC - TUẦN ${parsedWeekNum}`,
      subtitle: `Chủ đề: ${themeName.toUpperCase()} — Nhánh: ${subThemeName.toUpperCase()}  |  Lớp: ${targetClass.name.toUpperCase()}  |  Từ ${startStr} đến ${endStr}  |  GV: ${teacherName}`,
      schoolYearName,
      totalCols: 8,
    });

    const headerRow2 = sheet2.getRow(startRow2);
    headerRow2.values = [
      'STT',
      'Thứ / Ngày thực hiện',
      'Chế độ sinh hoạt',
      'Hoạt động & Mục tiêu GD',
      'Mục đích yêu cầu',
      'Chuẩn bị (Đồ dùng, học liệu)',
      'Cách tiến hành (Các bước thực hiện)',
      'Tiêu chí đánh giá',
    ];
    applyHeaderStyles(headerRow2);

    let stt2 = 1;
    let curRow2 = startRow2 + 1;

    if (activities.length === 0) {
      const row = sheet2.getRow(curRow2++);
      row.values = [
        1,
        '-',
        '-',
        '(Chưa có hoạt động nào được xếp lịch trong tuần này)',
        '-',
        '-',
        '-',
        '-',
      ];
    } else {
      activities.forEach((actItem) => {
        const act = actItem.activity;
        const content = act?.content;
        const goal = content?.goal;
        const domainLabel = DOMAIN_LABELS[goal?.domain] || goal?.domain || '';
        const rawSlotLabel = ROUTINE_SLOT_LABELS[actItem.routine_slot] || actItem.routine_slot || '';
        const dayLabel = DAY_LABELS[actItem.day_of_week] || '';
        const dateStr = actItem.scheduled_date ? formatDateVn(actItem.scheduled_date) : '';
        const timeCell = [dayLabel, dateStr].filter(Boolean).join('\n');

        // Cột 4: Tên hoạt động & Mã MT - Lĩnh vực - Nội dung
        const goalPart = goal?.goal_code ? `\n[${goal.goal_code}] ${domainLabel}` : '';
        const contentPart = content?.title ? `\n• ${content.title}` : '';
        const activityCell = `${act?.title || 'Hoạt động giáo dục'}${goalPart}${contentPart}`;

        // Cột 5: Mục đích yêu cầu
        const objectiveCell = act?.objective || '(Chưa cập nhật mục đích yêu cầu)';

        // Cột 6: Chuẩn bị
        const preparationCell = act?.preparation || '(Cô và trẻ chuẩn bị học liệu theo quy định)';

        // Cột 7: Cách tiến hành
        const procedureCell = act?.procedure || '(Thực hiện theo tiến trình sinh hoạt lớp)';

        // Cột 8: Tiêu chí đánh giá
        const evalCell = act?.evaluation_criteria || '(Trẻ tích cực, hào hứng tham gia)';

        const row = sheet2.getRow(curRow2++);
        row.values = [
          stt2++,
          timeCell,
          rawSlotLabel,
          activityCell,
          objectiveCell,
          preparationCell,
          procedureCell,
          evalCell,
        ];
      });
    }

    applyZebraAndBorders(sheet2, startRow2 + 1);
    sheet2.columns = [
      { width: 7 },   // STT
      { width: 18 },  // Thứ / Ngày
      { width: 20 },  // Chế độ sinh hoạt
      { width: 38 },  // Hoạt động & Mục tiêu GD
      { width: 38 },  // Mục đích yêu cầu
      { width: 35 },  // Chuẩn bị
      { width: 45 },  // Cách tiến hành
      { width: 32 },  // Tiêu chí đánh giá
    ];

    sheet2.eachRow((row, rowNumber) => {
      if (rowNumber > startRow2) {
        row.getCell(1).alignment = { vertical: 'top', horizontal: 'center' };
        row.getCell(2).alignment = { vertical: 'top', horizontal: 'center', wrapText: true };
        row.getCell(3).alignment = { vertical: 'top', horizontal: 'center', wrapText: true };
        row.getCell(4).alignment = { vertical: 'top', wrapText: true };
        row.getCell(5).alignment = { vertical: 'top', wrapText: true };
        row.getCell(6).alignment = { vertical: 'top', wrapText: true };
        row.getCell(7).alignment = { vertical: 'top', wrapText: true };
        row.getCell(8).alignment = { vertical: 'top', wrapText: true };
      }
    });

    return workbook.xlsx.writeBuffer();
  }
}

export const planningExportService = new PlanningExportService();
export default planningExportService;
