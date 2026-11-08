/**
 * seed_nhatre1_full_data.js
 * 
 * Chuẩn hóa 100% dữ liệu Khối Nhà trẻ theo Thông tư Bộ GD&ĐT (docs/BGD):
 * 1. 56 mục tiêu chính thức + 106 nội dung giáo dục (NDGD) theo 4 lĩnh vực:
 *    - PHYSICAL (Thể chất): MT 1 -> MT 23
 *    - COGNITIVE (Nhận thức): MT 24 -> MT 33
 *    - LANGUAGE (Ngôn ngữ): MT 34 -> MT 44
 *    - SOCIO_EMOTIONAL (Tình cảm - KNXH & Thẩm mỹ): MT 45 -> MT 56
 * 2. Ngân hàng hoạt động mẫu (EducationalActivity) cho 7 routine slots.
 * 3. Lớp "Nhà trẻ 1" (class_id: 5n, Niên khóa 2026-2027):
 *    - Roster học sinh (14 bé độ tuổi 24-36 tháng).
 *    - CĐ 01: Đã duyệt (USED, 105 slot).
 *    - CĐ 02: Đã duyệt (USED, 140 slot).
 *    - CĐ 03 (Hiện tại: 26/10 - 22/11/2026): Đã duyệt (USED, 140 slot).
 *    - CĐ 04 (Tiếp theo: 23/11 - 20/12/2026): Bản nháp điền kín (DRAFT, 140 slot để test nộp BGH).
 * 4. Sức khỏe: Đánh giá 2 tuần/lần (Tuần 2, 4, 6, 8) với chiều cao, cân nặng, BMI chuẩn WHO.
 * 5. Điểm danh & đón/trả trẻ: Ghi nhận đầy đủ T2 - T6 từ 07/09/2026 đến 06/11/2026.
 * 6. Đánh giá ngày & Đánh giá tháng (Tháng 9 & Tháng 10/2026).
 */

import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';

const prisma = new PrismaClient();

const SCHOOL_YEAR_ID = 1n; // 2026-2027
const CLASS_ID = 5n; // Nhà trẻ 1
const TEACHER_ACCOUNT_ID = 76n; // Trần Công Trực
const BGH_ACCOUNT_ID = 3n; // Nguyễn Thu Trang

const ROUTINE_SLOTS = [
  'ARRIVAL_PLAY',
  'MORNING_EXERCISE',
  'DIRECTED_STUDY',
  'CORNER_PLAY',
  'OUTDOOR_PLAY',
  'HYGIENE_MEAL_SLEEP',
  'AFTERNOON_ACTIVITY',
];

const WEEK_DAYS = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'];

// Parse goals & contents from docs/BGD
function parseBgdGoals() {
  const filePath = path.resolve('..', 'docs', 'BGD', 'Kế hoạch Giao dục 2025-2026_extracted.txt');
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split(/[\r\n]+/).map((l) => l.replace(/[\u0007]/g, '').trim()).filter(Boolean);

  const start = lines.findIndex((l) => l.includes('1. Đối với trẻ 24 - 36 tháng tuổi'));
  const end = lines.findIndex((l) => l.includes('2. Đối với trẻ 3-4 tuổi'));
  const nhaTre = lines.slice(start, end);

  const domainMap = {
    'I. LĨNH VỰC PHÁT TRIỂN THỂ CHẤT': 'PHYSICAL',
    'II. LĨNH VỰC PHÁT TRIỂN NHẬN THỨC': 'COGNITIVE',
    'III. LĨNH VỰC PHÁT TRIỂN NGÔN NGỮ': 'LANGUAGE',
    'IV. LĨNH VỰC PHÁT TRIỂN TÌNH CẢM, KĨ NĂNG XÃ HỘI VÀ THẨM MĨ': 'SOCIO_EMOTIONAL',
  };

  let currentDomain = 'PHYSICAL';
  const goals = [];
  let currentGoal = null;

  nhaTre.forEach((l) => {
    for (const [k, v] of Object.entries(domainMap)) {
      if (l.includes(k)) {
        currentDomain = v;
        return;
      }
    }

    const m = l.match(/^(\d+)\.\s*(.+)/);
    if (m && parseInt(m[1]) >= 1 && parseInt(m[1]) <= 56) {
      currentGoal = {
        code: `MT${m[1]}`,
        num: parseInt(m[1]),
        title: m[2].trim(),
        domain: currentDomain,
        contents: [],
      };
      goals.push(currentGoal);
    } else if (currentGoal && (l.startsWith('-') || l.startsWith('+') || l.startsWith('*'))) {
      const cleanL = l.replace(/^[-+*]\s*/, '').trim();
      if (cleanL && !cleanL.toLowerCase().startsWith('thực hiện')) {
        currentGoal.contents.push(cleanL);
      }
    }
  });

  return goals;
}

// Generate activity template for a given routine slot
function getActivityTemplate(slot, contentTitle, goalTitle, themeName) {
  switch (slot) {
    case 'ARRIVAL_PLAY':
      return {
        title: `Trò chuyện: ${contentTitle || goalTitle}`,
        objective: 'Trẻ vui vẻ chào cô, chào bố mẹ, cất dép và đồ dùng cá nhân đúng nơi quy định.',
        preparation: 'Phòng học thoáng mát, đồ chơi bày ngăn nắp tại các góc đón.',
        procedure: 'Cô đón trẻ từ phụ huynh, quan sát thể trạng trẻ, hướng dẫn trẻ cất giày dép, trò chuyện nhẹ nhàng về chủ đề.',
        criteria: 'Trẻ vui vẻ vào lớp, không khóc nhè, biết chào cô.',
      };
    case 'MORNING_EXERCISE':
      return {
        title: `Khởi động với bài tập nhẹ nhàng (${themeName})`,
        objective: 'Rèn luyện phản xạ hô hấp, vận động tay chân theo nhịp trống và hiệu lệnh của cô.',
        preparation: 'Sân chơi sạch sẽ hoặc phòng nhóm rộng rãi, nhạc thể dục sôi động.',
        procedure: 'Khởi động xoay cổ tay cổ chân; bài tập phát triển chung (hô hấp, tay, lưng/bụng, chân); hồi tĩnh đi dạo nhẹ nhàng.',
        criteria: 'Trẻ tập trung, làm theo các động tác mẫu của cô.',
      };
    case 'DIRECTED_STUDY':
      return {
        title: `${contentTitle}`,
        objective: `Trẻ nhận biết, rèn luyện kỹ năng: ${goalTitle}.`,
        preparation: 'Tranh ảnh, đồ dùng trực quan, học liệu sinh động phù hợp lứa tuổi 24-36 tháng.',
        procedure: '1. Gợi mở tạo hứng thú bằng bài hát hoặc câu đố; 2. Cô làm mẫu, hướng dẫn trẻ thực hiện; 3. Cho từng trẻ và nhóm trẻ thực hành, cô quan sát hỗ trợ; 4. Nhận xét khen ngợi trẻ tích cực.',
        criteria: 'Trẻ hào hứng tham gia, phát âm rõ ràng hoặc thực hiện được động tác mẫu.',
      };
    case 'CORNER_PLAY':
      return {
        title: `Góc bé chơi búp bê & góc ghép hình (${contentTitle})`,
        objective: 'Trẻ biết thao tác với đồ vật, bế em búp bê, xếp chồng khối gỗ, chơi cạnh bạn.',
        preparation: 'Góc thao tác vai (búp bê, thìa, bát), góc xây dựng lắp ghép (khối gỗ to, hộp lồng).',
        procedure: 'Cô giới thiệu các góc chơi, gợi ý vai chơi, cho trẻ tự chọn góc, cô đến từng góc hướng dẫn và chơi cùng trẻ.',
        criteria: 'Trẻ không tranh giành đồ chơi, biết cất đồ chơi vào rổ khi hết giờ.',
      };
    case 'OUTDOOR_PLAY':
      return {
        title: `Quan sát thiên nhiên & TCVĐ (${contentTitle})`,
        objective: 'Trẻ được hít thở không khí trong lành, quan sát cây cỏ hoa lá, vận động thoải mái.',
        preparation: 'Sân trường an toàn, bóng nhựa, phấn vẽ, bóng bay.',
        procedure: '1. Cho trẻ quan sát cảnh vật sân trường; 2. Tổ chức trò chơi vận động nhẹ; 3. Chơi tự do với bóng và đồ chơi ngoài trời dưới sự giám sát của cô.',
        criteria: 'Trẻ chạy nhảy vui tươi, an toàn, biết đi theo cô.',
      };
    case 'HYGIENE_MEAL_SLEEP':
      return {
        title: `Chăm sóc vệ sinh, ăn trưa & ngủ trưa ngoan`,
        objective: 'Trẻ rèn thói quen rửa tay trước khi ăn, tự cầm thìa xúc cơm, ngủ đủ giấc trưa.',
        preparation: 'Bàn ghế ăn sạch sẽ, khăn lau tay ẩm, thìa bát cá nhân, giường nệm gối sạch.',
        procedure: 'Hướng dẫn trẻ rửa tay, ngồi vào bàn ăn, cô động viên trẻ ăn hết suất, lau miệng sau ăn; ru trẻ ngủ trưa êm đềm.',
        criteria: 'Trẻ ăn hết khẩu phần, không ngậm cơm, ngủ ngoan từ 11:30 đến 14:00.',
      };
    case 'AFTERNOON_ACTIVITY':
      return {
        title: `Rèn nề nếp buổi chiều (${contentTitle})`,
        objective: 'Trẻ ôn lại bài học buổi sáng, vận động nhẹ nhàng sau ngủ dậy, nghe cô đọc thơ kể chuyện.',
        preparation: 'Sách tranh khổ to, đồ chơi lắp ráp, đồ dùng vệ sinh chiều.',
        procedure: 'Đánh thức trẻ dậy, vận động nhẹ, cho trẻ ăn bữa xế chiều; tổ chức đọc thơ, hát hoặc cho trẻ chơi tự do tại các góc.',
        criteria: 'Trẻ tỉnh táo, thoải mái, nề nếp sinh hoạt tốt.',
      };
    default:
      return {
        title: `Hoạt động sinh hoạt: ${contentTitle || goalTitle}`,
        objective: 'Giáo dục nề nếp và kỹ năng cho trẻ.',
        preparation: 'Đồ dùng học liệu cần thiết.',
        procedure: 'Tiến hành theo quy trình chăm sóc nuôi dạy mầm non.',
        criteria: 'Trẻ tham gia tích cực.',
      };
  }
}

async function main() {
  console.log('🚀 BẮT ĐẦU CHUẨN HÓA TOÀN BỘ DỮ LIỆU KHỐI NHÀ TRẺ (2026-2027)...');

  // 1. DỌN SẠCH DỮ LIỆU CŨ CỦA KHỐI NHÀ TRẺ
  console.log('\n🧹 Bước 1: Xóa dữ liệu cũ của Khối Nhà trẻ (Nhà trẻ 1 & Nhà trẻ 2)...');
  const targetClassIds = [5n, 6n];

  // Lấy danh sách học sinh thuộc 2 lớp Nhà trẻ
  const studentEnrollments = await prisma.studentEnrollment.findMany({
    where: { class_id: { in: targetClassIds } },
    select: { student_id: true },
  });
  const studentIds = studentEnrollments.map((e) => e.student_id);

  if (studentIds.length > 0) {
    await prisma.dailyAssessment.deleteMany({ where: { student_id: { in: studentIds } } });
    await prisma.monthlyAssessment.deleteMany({ where: { student_id: { in: studentIds } } });
    await prisma.attendance.deleteMany({ where: { student_id: { in: studentIds } } });
    await prisma.healthAssessment.deleteMany({ where: { student_id: { in: studentIds } } });
  }

  await prisma.subThemeActivity.deleteMany({ where: { class_id: { in: targetClassIds } } });
  await prisma.classThemeContent.deleteMany({ where: { class_id: { in: targetClassIds } } });
  await prisma.classThemeGoal.deleteMany({ where: { class_id: { in: targetClassIds } } });
  await prisma.classThemePlan.deleteMany({ where: { class_id: { in: targetClassIds } } });

  // Xóa Master Activities, Contents, Goals cũ của NHA_TRE
  const oldGoals = await prisma.educationalGoal.findMany({
    where: { age_group: 'NHA_TRE', school_year_id: SCHOOL_YEAR_ID },
    select: { goal_id: true },
  });
  const oldGoalIds = oldGoals.map((g) => g.goal_id);

  if (oldGoalIds.length > 0) {
    const oldContents = await prisma.educationalContent.findMany({
      where: { goal_id: { in: oldGoalIds } },
      select: { content_id: true },
    });
    const oldContentIds = oldContents.map((c) => c.content_id);

    if (oldContentIds.length > 0) {
      await prisma.educationalActivity.deleteMany({
        where: { content_id: { in: oldContentIds } },
      });
      await prisma.educationalContent.deleteMany({
        where: { content_id: { in: oldContentIds } },
      });
    }

    await prisma.educationalGoal.deleteMany({
      where: { goal_id: { in: oldGoalIds } },
    });
  }

  console.log('✅ Đã dọn sạch dữ liệu cũ của Khối Nhà trẻ.');

  // 2. IMPORT 56 MỤC TIÊU & 106 NDGD CHUẨN TỪ FILE BGD
  console.log('\n📚 Bước 2: Import 56 Mục tiêu và Nội dung giáo dục chuẩn BGD...');
  const parsedGoals = parseBgdGoals();
  console.log(`Đã đọc được ${parsedGoals.length} mục tiêu từ tài liệu chuẩn.`);

  const insertedGoalsMap = new Map(); // goal_code -> goal record
  const createdActivities = []; // master activities

  for (const g of parsedGoals) {
    const createdGoal = await prisma.educationalGoal.create({
      data: {
        school_year_id: SCHOOL_YEAR_ID,
        age_group: 'NHA_TRE',
        domain: g.domain,
        goal_code: g.code,
        title: g.title,
        is_approved: true,
      },
    });
    insertedGoalsMap.set(g.code, createdGoal);

    // Tạo các Nội dung giáo dục (NDGD) thuộc mục tiêu này
    const contentsToInsert = g.contents.length > 0 ? g.contents : [g.title];
    for (const cTitle of contentsToInsert) {
      const createdContent = await prisma.educationalContent.create({
        data: {
          goal_id: createdGoal.goal_id,
          title: cTitle.slice(0, 255),
        },
      });

      // Tạo sẵn Master EducationalActivities cho 7 slots
      for (const slot of ROUTINE_SLOTS) {
        const tmpl = getActivityTemplate(slot, cTitle, g.title, 'Khối Nhà trẻ');
        const act = await prisma.educationalActivity.create({
          data: {
            content_id: createdContent.content_id,
            title: tmpl.title.slice(0, 255),
            routine_slot: slot,
            objective: tmpl.objective,
            preparation: tmpl.preparation,
            procedure: tmpl.procedure,
            evaluation_criteria: tmpl.criteria,
          },
        });
        createdActivities.push({
          activity: act,
          goal: createdGoal,
          content: createdContent,
          slot,
        });
      }
    }
  }

  console.log(`✅ Đã tạo thành công ${insertedGoalsMap.size} Mục tiêu chuẩn và ${createdActivities.length} Hoạt động mẫu.`);

  // 3. CHUẨN HÓA ROSTER HỌC SINH LỚP NHÀ TRẺ 1 (14 BÉ)
  console.log('\n👶 Bước 3: Đồng bộ danh sách 14 học sinh lớp Nhà trẻ 1...');
  const existingEnrollments = await prisma.studentEnrollment.findMany({
    where: { class_id: CLASS_ID, status: 'ENROLLED' },
    include: { student: true },
  });

  const studentsList = existingEnrollments.map((e) => e.student);

  // Danh sách học sinh mẫu nếu cần bổ sung đủ 14 bé
  const extraStudentNames = [
    { name: 'Nguyễn Minh Khang', gender: 'MALE', dob: '2024-03-15' },
    { name: 'Trần Ngọc Bảo An', gender: 'FEMALE', dob: '2024-05-20' },
    { name: 'Lê Hoàng Bách', gender: 'MALE', dob: '2024-02-10' },
    { name: 'Phạm Quỳnh Chi', gender: 'FEMALE', dob: '2024-07-25' },
    { name: 'Vũ Đức Minh', gender: 'MALE', dob: '2024-04-18' },
    { name: 'Đỗ Thùy Trang', gender: 'FEMALE', dob: '2024-06-30' },
    { name: 'Bùi Hải Nam', gender: 'MALE', dob: '2024-01-22' },
    { name: 'Ngô Khánh Linh', gender: 'FEMALE', dob: '2024-08-14' },
    { name: 'Đinh Tuấn Kiệt', gender: 'MALE', dob: '2024-05-05' },
    { name: 'Lương Mai Anh', gender: 'FEMALE', dob: '2024-09-02' },
  ];

  while (studentsList.length < 14 && extraStudentNames.length > 0) {
    const nextKid = extraStudentNames.shift();
    const stCode = `HS26NT${String(studentsList.length + 1).padStart(2, '0')}`;
    const newStudent = await prisma.student.create({
      data: {
        student_code: stCode,
        full_name: nextKid.name,
        date_of_birth: new Date(`${nextKid.dob}T00:00:00.000Z`),
        gender: nextKid.gender,
        nationality: 'Việt Nam',
        status: 'STUDYING',
        enrollment_date: new Date('2026-09-05T00:00:00.000Z'),
      },
    });

    await prisma.studentEnrollment.create({
      data: {
        student_id: newStudent.student_id,
        class_id: CLASS_ID,
        status: 'ENROLLED',
        enrolled_at: new Date('2026-09-05T00:00:00.000Z'),
      },
    });

    studentsList.push(newStudent);
  }

  // Đảm bảo tất cả 14 bé đều có ngày sinh năm 2024 chuẩn
  for (let idx = 0; idx < studentsList.length; idx++) {
    const s = studentsList[idx];
    if (!s.date_of_birth) {
      const month = String((idx % 11) + 1).padStart(2, '0');
      const day = String((idx * 2) + 1).padStart(2, '0');
      await prisma.student.update({
        where: { student_id: s.student_id },
        data: { date_of_birth: new Date(`2024-${month}-${day}T00:00:00.000Z`) },
      });
      s.date_of_birth = new Date(`2024-${month}-${day}T00:00:00.000Z`);
    }
  }

  console.log(`✅ Lớp Nhà trẻ 1 hiện có đủ ${studentsList.length} bé (độ tuổi 24–36 tháng).`);

  // 4. LÊN KẾ HOẠCH & XẾP THỜI KHÓA BIỂU CHO 4 CHỦ ĐỀ CỦA NHÀ TRẺ 1
  console.log('\n📅 Bước 4: Lên kế hoạch giáo dục & xếp thời khóa biểu 4 chủ đề...');
  const themes = await prisma.curriculumTheme.findMany({
    where: { school_year_id: SCHOOL_YEAR_ID, age_group: 'NHA_TRE', deleted_at: null },
    include: { sub_themes: { orderBy: { start_date: 'asc' } } },
    orderBy: { start_date: 'asc' },
  });

  const allGoalsList = Array.from(insertedGoalsMap.values());

  for (let tIdx = 0; tIdx < Math.min(4, themes.length); tIdx++) {
    const th = themes[tIdx];
    const subThemes = th.sub_themes || [];
    const totalWeeks = subThemes.length;
    const isApprovedTheme = tIdx < 3; // CĐ 01, CĐ 02, CĐ 03 (hiện tại) -> BGH đã duyệt
    const isDraftNextTheme = tIdx === 3; // CĐ 04 -> Bản nháp kín slot để test

    console.log(`\n  👉 CĐ 0${tIdx + 1}: "${th.name}" (${totalWeeks} tuần) - Trạng thái: ${isApprovedTheme ? 'USED (Đã phê duyệt)' : 'DRAFT (Bản nháp)'}`);

    // Phân bổ 12 - 16 mục tiêu cho mỗi chủ đề
    const allocatedGoals = allGoalsList.slice((tIdx * 14) % allGoalsList.length, ((tIdx + 1) * 14) % allGoalsList.length || allGoalsList.length);
    for (const g of allocatedGoals) {
      await prisma.classThemeGoal.upsert({
        where: {
          class_id_theme_id_goal_id: {
            class_id: CLASS_ID,
            theme_id: th.theme_id,
            goal_id: g.goal_id,
          },
        },
        update: {},
        create: {
          class_id: CLASS_ID,
          theme_id: th.theme_id,
          goal_id: g.goal_id,
        },
      });
    }

    // Lấy các hoạt động thuộc các mục tiêu đã phân bổ cho chủ đề này để xếp TKB đa dạng theo ngày
    const themeGoalIds = allocatedGoals.map((g) => g.goal_id);
    const themeActs = createdActivities.filter((a) => themeGoalIds.includes(a.goal.goal_id));
    const actsBySlot = {};
    for (const slot of ROUTINE_SLOTS) {
      actsBySlot[slot] = themeActs.filter((a) => a.slot === slot);
      if (actsBySlot[slot].length === 0) {
        actsBySlot[slot] = createdActivities.filter((a) => a.slot === slot);
      }
    }

    // Xếp kín 35 slot cho mỗi tuần của chủ đề với bài học thay đổi mỗi ngày
    let scheduledSlotsCount = 0;
    for (let wIdx = 0; wIdx < subThemes.length; wIdx++) {
      const st = subThemes[wIdx];
      const stStart = new Date(st.start_date);

      for (let dIdx = 0; dIdx < 5; dIdx++) {
        const slotDate = new Date(stStart);
        slotDate.setDate(slotDate.getDate() + dIdx);
        const dayOfWeek = WEEK_DAYS[dIdx];
        const dayOffset = wIdx * 5 + dIdx;

        for (let sIdx = 0; sIdx < ROUTINE_SLOTS.length; sIdx++) {
          const slot = ROUTINE_SLOTS[sIdx];
          const slotPool = actsBySlot[slot] || [];
          const matched = slotPool[dayOffset % slotPool.length] || createdActivities[0];

          await prisma.subThemeActivity.create({
            data: {
              class_id: CLASS_ID,
              sub_theme_id: st.sub_theme_id,
              activity_id: matched.activity.activity_id,
              scheduled_date: slotDate,
              day_of_week: dayOfWeek,
              routine_slot: slot,
            },
          });
          scheduledSlotsCount++;
        }
      }
    }

    console.log(`     Đã xếp kín ${scheduledSlotsCount}/${totalWeeks * 35} slot thời khóa biểu.`);

    // Thiết lập trạng thái duyệt kế hoạch
    const submitDate = new Date(th.start_date);
    submitDate.setDate(submitDate.getDate() - 6);
    const reviewDate = new Date(th.start_date);
    reviewDate.setDate(reviewDate.getDate() - 3);

    await prisma.classThemePlan.upsert({
      where: {
        class_id_theme_id: {
          class_id: CLASS_ID,
          theme_id: th.theme_id,
        },
      },
      update: {
        status: isApprovedTheme ? 'USED' : 'DRAFT',
        submitted_at: isApprovedTheme ? submitDate : null,
        submitted_by: isApprovedTheme ? TEACHER_ACCOUNT_ID : null,
        reviewed_at: isApprovedTheme ? reviewDate : null,
        reviewed_by: isApprovedTheme ? BGH_ACCOUNT_ID : null,
        review_note: isApprovedTheme ? 'Kế hoạch đã được Ban Giám Hiệu thẩm định mục tiêu, cân đối thời khóa biểu và phê duyệt áp dụng.' : null,
      },
      create: {
        class_id: CLASS_ID,
        theme_id: th.theme_id,
        status: isApprovedTheme ? 'USED' : 'DRAFT',
        submitted_at: isApprovedTheme ? submitDate : null,
        submitted_by: isApprovedTheme ? TEACHER_ACCOUNT_ID : null,
        reviewed_at: isApprovedTheme ? reviewDate : null,
        reviewed_by: isApprovedTheme ? BGH_ACCOUNT_ID : null,
        review_note: isApprovedTheme ? 'Kế hoạch đã được Ban Giám Hiệu thẩm định mục tiêu, cân đối thời khóa biểu và phê duyệt áp dụng.' : null,
      },
    });
  }

  // 5. ĐIỂM DANH, ĐÓN TRẺ, TRẢ TRẺ (TỪ 07/09/2026 ĐẾN 06/11/2026)
  console.log('\n🚸 Bước 5: Tạo dữ liệu điểm danh, đón trẻ & trả trẻ...');
  const startDate = new Date('2026-09-07T00:00:00.000Z');
  const endDate = new Date('2026-11-06T00:00:00.000Z');
  let cur = new Date(startDate);
  let attendanceCount = 0;

  while (cur <= endDate) {
    const day = cur.getDay(); // 0 is Sun, 6 is Sat
    if (day >= 1 && day <= 5) {
      const curDateStr = cur.toISOString().slice(0, 10);
      const checkInTime = new Date(`${curDateStr}T07:25:00.000Z`);
      const checkOutTime = new Date(`${curDateStr}T16:20:00.000Z`);

      for (const st of studentsList) {
        await prisma.attendance.create({
          data: {
            student_id: st.student_id,
            class_id: CLASS_ID,
            date: new Date(`${curDateStr}T00:00:00.000Z`),
            status: 'PRESENT',
            check_in_time: checkInTime,
            check_in_by: TEACHER_ACCOUNT_ID,
            check_out_time: checkOutTime,
            check_out_by: TEACHER_ACCOUNT_ID,
            pickup_person_name: 'Mẹ bé',
            pickup_relationship: 'Mẹ',
            notes: 'Bé đến lớp vui vẻ, ăn hết suất, thân nhiệt 36.6°C',
          },
        });
        attendanceCount++;
      }
    }
    cur.setDate(cur.getDate() + 1);
  }
  console.log(`✅ Đã tạo ${attendanceCount} lượt điểm danh & đón/trả trẻ.`);

  // 6. ĐÁNH GIÁ SỨC KHỎE ĐỊNH KỲ (2 TUẦN / LẦN)
  console.log('\n🩺 Bước 6: Tạo dữ liệu theo dõi sức khỏe định kỳ 2 tuần/lần...');
  const healthAssessmentDates = [
    '2026-09-18', // Tuần 2
    '2026-10-02', // Tuần 4
    '2026-10-16', // Tuần 6
    '2026-10-30', // Tuần 8
  ];

  let healthRecordsCount = 0;
  for (let hIdx = 0; hIdx < healthAssessmentDates.length; hIdx++) {
    const dStr = healthAssessmentDates[hIdx];
    const assessmentDate = new Date(`${dStr}T00:00:00.000Z`);

    for (let sIdx = 0; sIdx < studentsList.length; sIdx++) {
      const st = studentsList[sIdx];
      // Tăng trưởng đều đặn theo thời gian
      const baseHeight = 85.0 + (sIdx % 5) * 1.5;
      const height = Number((baseHeight + hIdx * 0.7).toFixed(1));

      const baseWeight = 11.5 + (sIdx % 5) * 0.5;
      const weight = Number((baseWeight + hIdx * 0.25).toFixed(1));

      const bmi = Number((weight / Math.pow(height / 100, 2)).toFixed(2));
      const zscore = Number((0.2 + (sIdx % 3) * 0.1).toFixed(2));

      await prisma.healthAssessment.create({
        data: {
          student_id: st.student_id,
          assessment_date: assessmentDate,
          height,
          weight,
          bmi,
          height_for_age_zscore: zscore,
          weight_for_age_zscore: zscore,
          bmi_for_age_zscore: zscore,
          notes: 'Trẻ phát triển thể chất cân đối, bình thường theo chuẩn WHO.',
          recorded_by: TEACHER_ACCOUNT_ID,
        },
      });
      healthRecordsCount++;
    }
  }
  console.log(`✅ Đã tạo ${healthRecordsCount} bản ghi đo sức khỏe định kỳ (4 đợt x 14 bé).`);

  // 7. ĐÁNH GIÁ THÁNG (THÁNG 9 & THÁNG 10/2026)
  console.log('\n⭐ Bước 7: Tạo dữ liệu Đánh giá tháng (Sổ bé ngoan)...');
  const evaluationMonths = [
    { month: 9, year: 2026, notes: 'Bé làm quen trường lớp nhanh, ngoan ngoãn, thích nghi tốt với nề nếp sinh hoạt ở nhà trẻ.' },
    { month: 10, year: 2026, notes: 'Bé tự giác cầm thìa xúc cơm gọn gàng, tích cực tham gia các hoạt động chơi tập và vận động cùng bạn.' },
  ];

  let monthlyCount = 0;
  for (const m of evaluationMonths) {
    for (const st of studentsList) {
      await prisma.monthlyAssessment.create({
        data: {
          student_id: st.student_id,
          class_id: CLASS_ID,
          month: m.month,
          year: m.year,
          week_1_rose: true,
          week_2_rose: true,
          week_3_rose: true,
          week_4_rose: true,
          week_5_rose: false,
          roses_count: 4,
          teacher_notes: m.notes,
          evaluated_by: TEACHER_ACCOUNT_ID,
        },
      });
      monthlyCount++;
    }
  }
  console.log(`✅ Đã tạo ${monthlyCount} phiếu đánh giá tháng (2 tháng x 14 bé).`);

  // 8. ĐÁNH GIÁ NGÀY (DAILY ASSESSMENT CHO TUẦN HIỆN TẠI)
  console.log('\n📝 Bước 8: Tạo dữ liệu Đánh giá ngày gần đây...');
  const coreActivities = createdActivities.filter((a) => a.slot === 'DIRECTED_STUDY').slice(0, 5);
  const recentDates = ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06'];

  let dailyCount = 0;
  for (let i = 0; i < recentDates.length; i++) {
    const dStr = recentDates[i];
    const actItem = coreActivities[i % coreActivities.length];

    for (const st of studentsList) {
      await prisma.dailyAssessment.create({
        data: {
          student_id: st.student_id,
          activity_id: actItem.activity.activity_id,
          goal_id: actItem.goal.goal_id,
          assessment_date: new Date(`${dStr}T00:00:00.000Z`),
          status: 'ACHIEVED',
          notes: 'Bé thực hiện đúng thao tác, hào hứng tham gia hoạt động.',
          evaluated_by: TEACHER_ACCOUNT_ID,
        },
      });
      dailyCount++;
    }
  }
  console.log(`✅ Đã tạo ${dailyCount} lượt đánh giá hoạt động ngày.`);

  console.log('\n🎉 HOÀN TẤT TOÀN DIỆN KHỞI TẠO DỮ LIỆU CHUẨN MẪU KHỐI NHÀ TRẺ!');
}

main()
  .catch((err) => {
    console.error('❌ Lỗi khi khởi tạo dữ liệu:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

