import prisma from '../src/config/prisma.js';

// ============================================================================
// SEED SCRIPT: FULL REAL DATA FOR SCHOOL YEAR 2026-2027 (SORAK PRESCHOOL)
// 1. 40 Themes with descriptions + 140 Sub-themes across 4 age groups
// 2. 61 Educational Goals + Educational Contents
// 3. 157 Educational Activities (NO sub_theme_activities per teacher autonomy)
// 4. Daily Attendance from 2026-09-07 to 2026-10-13 (weekdays only)
// 5. Health Assessments (2 checks/month: Sept x2, Oct x2)
// 6. Monthly & Daily Assessments (Giai đoạn & định kỳ)
// ============================================================================

const SCHOOL_YEAR_ID = 1n; // Năm học 2026–2027

// Helper to convert date string (YYYY-MM-DD) to Date object at UTC midnight
const d = (str) => new Date(`${str}T00:00:00.000Z`);
const dt = (dateStr, timeStr) => new Date(`${dateStr}T${timeStr}:00.000Z`);

async function main() {
  console.log('🚀 Starting Comprehensive Seed for School Year 2026-2027...');

  // 0. Ensure all 29 students have active enrollments in School Year 1
  const year1Classes = await prisma.class.findMany({
    where: { school_year_id: SCHOOL_YEAR_ID, deleted_at: null },
  });
  const nhaTre1Class = year1Classes.find(c => c.name === 'Nhà trẻ 1') || year1Classes[0];
  const allStudents = await prisma.student.findMany({ where: { deleted_at: null } });

  console.log(`Found ${allStudents.length} students in database.`);
  for (const st of allStudents) {
    const existing = await prisma.studentEnrollment.findFirst({
      where: {
        student_id: st.student_id,
        class: { school_year_id: SCHOOL_YEAR_ID },
      },
    });
    if (!existing) {
      await prisma.studentEnrollment.create({
        data: {
          student_id: st.student_id,
          class_id: nhaTre1Class.class_id,
          enrolled_at: d('2026-09-05'),
        },
      });
      console.log(`Enrolled student ${st.student_code} into ${nhaTre1Class.name} for Year 1.`);
    }
  }

  // Teacher / Staff accounts for audits
  const gvAccounts = await prisma.account.findMany({
    where: { role: 'TEACHER_GV', deleted_at: null },
  });
  const bghAccounts = await prisma.account.findMany({
    where: { role: 'PRINCIPAL_BGH', deleted_at: null },
  });
  const parentAccounts = await prisma.account.findMany({
    where: { role: 'PARENT_PH', deleted_at: null },
  });

  const defaultTeacherId = gvAccounts[0]?.account_id || 40n;
  const teacher2Id = gvAccounts[1]?.account_id || defaultTeacherId;
  const bghId = bghAccounts[0]?.account_id || 3n;
  const sampleParentId = parentAccounts[0]?.account_id || null;

  // ==========================================================================
  // PART 1: THEMES & SUB-THEMES (40 Themes, 140 Sub-themes)
  // ==========================================================================
  console.log('\n--- Seeding 40 Curriculum Themes and 140 Sub-themes ---');

  // Clear existing themes for year 1 if re-running
  await prisma.dailyAssessment.deleteMany({});
  await prisma.educationalActivity.deleteMany({});
  await prisma.educationalContent.deleteMany({});
  await prisma.educationalGoal.deleteMany({ where: { school_year_id: SCHOOL_YEAR_ID } });
  await prisma.subThemeLog.deleteMany({});
  await prisma.subThemeActivity.deleteMany({});
  await prisma.subTheme.deleteMany({});
  await prisma.curriculumTheme.deleteMany({ where: { school_year_id: SCHOOL_YEAR_ID } });

  const rawThemes = [
    // ------------------------------------------------------------------------
    // KHỐI NHÀ TRẺ (24 - 36 tháng) - age_group: 'NHA_TRE'
    // ------------------------------------------------------------------------
    {
      age_group: 'NHA_TRE',
      code: 'THEME_NT_01',
      name: 'Bé và các bạn',
      start_date: d('2026-09-07'),
      end_date: d('2026-09-18'),
      status: 'PUBLISHED',
      description: 'Giúp trẻ 24-36 tháng thích nghi với môi trường nhóm lớp mới, vượt qua cảm giác bỡ ngỡ xa cha mẹ, nhận biết tên gọi của bản thân và các bạn cùng lớp, hình thành sự gắn kết yêu thương đầu đời với cô giáo.',
      sub_themes: [
        { name: 'Các bạn của bé ở lớp', start_date: d('2026-09-07'), end_date: d('2026-09-11') },
        { name: 'Bé biết nhiều thứ', start_date: d('2026-09-14'), end_date: d('2026-09-18') },
      ],
    },
    {
      age_group: 'NHA_TRE',
      code: 'THEME_NT_02',
      name: 'Đồ chơi của bé',
      start_date: d('2026-09-21'),
      end_date: d('2026-10-16'),
      status: 'PUBLISHED',
      description: 'Hướng dẫn trẻ nhận biết, gọi tên các đồ chơi quen thuộc, phát triển vận động tinh qua xếp hình lắp ráp, tham gia sự kiện Tết Trung Thu và rèn luyện thói quen không tranh giành, biết cất đồ chơi vào rổ.',
      sub_themes: [
        { name: 'Những đồ chơi quen thuộc gần gũi', start_date: d('2026-09-21'), end_date: d('2026-09-25') },
        { name: 'Bé vui Tết Trung Thu', start_date: d('2026-09-28'), end_date: d('2026-10-02') },
        { name: 'Đồ chơi lắp ráp, xây dựng', start_date: d('2026-10-05'), end_date: d('2026-10-09') },
        { name: 'Những đồ chơi chuyển động', start_date: d('2026-10-12'), end_date: d('2026-10-16') },
      ],
    },
    {
      age_group: 'NHA_TRE',
      code: 'THEME_NT_03',
      name: 'Các cô bác trong trường MN',
      start_date: d('2026-10-19'),
      end_date: d('2026-11-06'),
      status: 'PUBLISHED',
      description: 'Giúp trẻ nhận biết công việc yêu thương của cô giáo, bác cấp dưỡng, bác bảo vệ; nhận biết đồ dùng quen thuộc của các cô bác và giáo dục trẻ lễ phép chào hỏi khi gặp người lớn trong trường.',
      sub_themes: [
        { name: 'Các cô giáo của bé', start_date: d('2026-10-19'), end_date: d('2026-10-23') },
        { name: 'Công việc của các cô bác trong trường', start_date: d('2026-10-26'), end_date: d('2026-10-30') },
        { name: 'Đồ dùng của các cô bác trong trường', start_date: d('2026-11-02'), end_date: d('2026-11-06') },
      ],
    },
    {
      age_group: 'NHA_TRE',
      code: 'THEME_NT_04',
      name: 'Mẹ và những người thân của bé',
      start_date: d('2026-11-09'),
      end_date: d('2026-12-04'),
      status: 'PUBLISHED',
      description: 'Bồi dưỡng tình cảm gắn bó với cha mẹ, ông bà; nhận biết đồ dùng quen thuộc trong gia đình; hòa chung không khí tri ân cô giáo ngày 20/11 qua các bài thơ, lời ca đơn giản.',
      sub_themes: [
        { name: 'Trò chuyện về bố, mẹ', start_date: d('2026-11-09'), end_date: d('2026-11-13') },
        { name: 'Biết ơn cô giáo kính yêu (20/11)', start_date: d('2026-11-16'), end_date: d('2026-11-20') },
        { name: 'Những người thân yêu của bé', start_date: d('2026-11-23'), end_date: d('2026-11-27') },
        { name: 'Đồ dùng trong gia đình của bé', start_date: d('2026-11-30'), end_date: d('2026-12-04') },
      ],
    },
    {
      age_group: 'NHA_TRE',
      code: 'THEME_NT_05',
      name: 'Những con vật đáng yêu',
      start_date: d('2026-12-07'),
      end_date: d('2027-01-01'),
      status: 'PUBLISHED',
      description: 'Giúp trẻ nhận biết tên gọi, tiếng kêu, thức ăn và đặc điểm nổi bật của các con vật nuôi trong nhà, con vật dưới nước và trong rừng; làm quen hình ảnh chú bộ đội bảo vệ Tổ quốc ngày 22/12.',
      sub_themes: [
        { name: 'Con vật nuôi trong gia đình', start_date: d('2026-12-07'), end_date: d('2026-12-11') },
        { name: 'Chú bộ đội của bé (22/12)', start_date: d('2026-12-14'), end_date: d('2026-12-18') },
        { name: 'Con vật sống dưới nước', start_date: d('2026-12-21'), end_date: d('2026-12-25') },
        { name: 'Con vật sống trong rừng', start_date: d('2026-12-28'), end_date: d('2027-01-01') },
      ],
    },
    {
      age_group: 'NHA_TRE',
      code: 'THEME_NT_06',
      name: 'Tết và mùa Xuân',
      start_date: d('2027-01-04'),
      end_date: d('2027-01-15'),
      status: 'PUBLISHED',
      description: 'Cho trẻ cảm nhận không khí rộn rã của ngày Tết cổ truyền, nhận biết hoa mai, hoa đào, bánh chưng, bánh tét; giáo dục trẻ biết nói lời chúc Tết ông bà cha mẹ và biết nhận lì xì bằng hai tay.',
      sub_themes: [
        { name: 'Hoa bánh trong ngày Tết', start_date: d('2027-01-04'), end_date: d('2027-01-08') },
        { name: 'Ngày Tết ấm áp bên gia đình', start_date: d('2027-01-11'), end_date: d('2027-01-15') },
      ],
    },
    {
      age_group: 'NHA_TRE',
      code: 'THEME_NT_07',
      name: 'Cây và những bông hoa đẹp',
      start_date: d('2027-02-15'),
      end_date: d('2027-03-12'),
      status: 'PUBLISHED',
      description: 'Kích thích giác quan của trẻ qua việc quan sát màu sắc của hoa, thưởng thức vị ngọt thơm của quả chín, nhận biết các loại rau củ bé ăn hàng ngày, hình thành thói quen thích ăn rau xanh.',
      sub_themes: [
        { name: 'Một số loại cây xanh quen thuộc', start_date: d('2027-02-15'), end_date: d('2027-02-19') },
        { name: 'Những bông hoa rực rỡ sắc màu', start_date: d('2027-02-22'), end_date: d('2027-02-26') },
        { name: 'Những loại quả ngọt thơm', start_date: d('2027-03-01'), end_date: d('2027-03-05') },
        { name: 'Những loại rau củ bé thích ăn', start_date: d('2027-03-08'), end_date: d('2027-03-12') },
      ],
    },
    {
      age_group: 'NHA_TRE',
      code: 'THEME_NT_08',
      name: 'Bé đi bằng PTGT gì?',
      start_date: d('2027-03-15'),
      end_date: d('2027-04-09'),
      status: 'PUBLISHED',
      description: 'Dạy trẻ nhận biết ô tô, xe máy, máy bay, tàu thủy qua âm thanh tiếng còi xe; giáo dục trẻ ngồi yên khi đi xe máy, đội mũ bảo hiểm và làm thiệp đơn giản tặng mẹ nhân ngày 8/3.',
      sub_themes: [
        { name: 'Món quà tặng mẹ và cô ngày 8/3', start_date: d('2027-03-15'), end_date: d('2027-03-19') },
        { name: 'Phương tiện giao thông đường bộ', start_date: d('2027-03-22'), end_date: d('2027-03-26') },
        { name: 'Phương tiện giao thông đường thủy', start_date: d('2027-03-29'), end_date: d('2027-04-02') },
        { name: 'Phương tiện giao thông đường hàng không', start_date: d('2027-04-05'), end_date: d('2027-04-09') },
      ],
    },
    {
      age_group: 'NHA_TRE',
      code: 'THEME_NT_09',
      name: 'Mùa hè với bé',
      start_date: d('2027-04-12'),
      end_date: d('2027-05-07'),
      status: 'DRAFT',
      description: 'Giúp trẻ nhận biết các hiện tượng thời tiết mùa hè (nắng, mưa rào), cảm nhận sự mát lành của nước; nhận biết trang phục mùa hè thoáng mát và các hoạt động vui chơi giải trí ngoài trời.',
      sub_themes: [
        { name: 'Nước ngọt mát lành với bé', start_date: d('2027-04-12'), end_date: d('2027-04-16') },
        { name: 'Thời tiết nắng ấm mùa hè', start_date: d('2027-04-19'), end_date: d('2027-04-23') },
        { name: 'Trang phục mùa hè thoáng mát', start_date: d('2027-04-26'), end_date: d('2027-04-30') },
        { name: 'Hoạt động vui chơi mùa hè của bé', start_date: d('2027-05-03'), end_date: d('2027-05-07') },
      ],
    },
    {
      age_group: 'NHA_TRE',
      code: 'THEME_NT_10',
      name: 'Bé lên mẫu giáo',
      start_date: d('2027-05-10'),
      end_date: d('2027-06-04'),
      status: 'DRAFT',
      description: 'Chuẩn bị tâm lý cho trẻ chuyển tiếp từ nhóm trẻ lên lớp mẫu giáo Mầm (3-4 tuổi); rèn luyện kỹ năng tự phục vụ (tự xúc cơm, tự đi vệ sinh), tự tin vui chơi và tạm biệt cô giáo nhà trẻ.',
      sub_themes: [
        { name: 'Hoạt động vui chơi của bé trong lớp', start_date: d('2027-05-10'), end_date: d('2027-05-14') },
        { name: 'Công việc yêu thương của cô giáo', start_date: d('2027-05-17'), end_date: d('2027-05-21') },
        { name: 'Đồ dùng học tập ở lớp mẫu giáo', start_date: d('2027-05-24'), end_date: d('2027-05-28') },
        { name: 'Tạm biệt nhà trẻ, bé lên lớp Mầm', start_date: d('2027-05-31'), end_date: d('2027-06-04') },
      ],
    },

    // ------------------------------------------------------------------------
    // KHỐI LỚP MẦM (3 - 4 tuổi) - age_group: 'MAM'
    // ------------------------------------------------------------------------
    {
      age_group: 'MAM',
      code: 'THEME_MAM_01',
      name: 'Trường mầm non của bé',
      start_date: d('2026-09-07'),
      end_date: d('2026-09-25'),
      status: 'PUBLISHED',
      description: 'Hình thành niềm vui khi đến lớp, nhận biết tên trường, tên lớp, cô giáo và các bạn cùng trang lứa; làm quen các khu vực chức năng trong trường và quy tắc an toàn cơ bản.',
      sub_themes: [
        { name: 'Trường mầm non thân yêu', start_date: d('2026-09-07'), end_date: d('2026-09-11') },
        { name: 'Lớp học của bé và các góc chơi', start_date: d('2026-09-14'), end_date: d('2026-09-18') },
        { name: 'Bé vui Tết Trung Thu cùng bạn', start_date: d('2026-09-21'), end_date: d('2026-09-25') },
      ],
    },
    {
      age_group: 'MAM',
      code: 'THEME_MAM_02',
      name: 'Bản thân',
      start_date: d('2026-09-28'),
      end_date: d('2026-10-16'),
      status: 'PUBLISHED',
      description: 'Giúp trẻ nhận thức về bản thân: Tên tuổi, giới tính, sở thích; chức năng các giác quan; phân biệt cảm xúc vui buồn và hình thành kỹ năng tự rửa tay, đánh răng giữ gìn vệ sinh cơ thể.',
      sub_themes: [
        { name: 'Tôi là ai - Giới tính và sở thích', start_date: d('2026-09-28'), end_date: d('2026-10-02') },
        { name: 'Cơ thể khỏe mạnh và các giác quan', start_date: d('2026-10-05'), end_date: d('2026-10-09') },
        { name: 'Bé cần gì để lớn lên khỏe mạnh', start_date: d('2026-10-12'), end_date: d('2026-10-16') },
      ],
    },
    {
      age_group: 'MAM',
      code: 'THEME_MAM_03',
      name: 'Gia đình yêu thương',
      start_date: d('2026-10-19'),
      end_date: d('2026-11-06'),
      status: 'PUBLISHED',
      description: 'Giáo dục tình cảm yêu thương, lòng biết ơn ông bà, cha mẹ; nhận biết các phòng trong nhà và các đồ dùng thiết yếu; dạy trẻ an toàn không nghịch ổ cắm điện, nước sôi.',
      sub_themes: [
        { name: 'Gia đình thân yêu của bé', start_date: d('2026-10-19'), end_date: d('2026-10-23') },
        { name: 'Ngôi nhà ấm cúng của bé', start_date: d('2026-10-26'), end_date: d('2026-10-30') },
        { name: 'Đồ dùng và an toàn trong gia đình', start_date: d('2026-11-02'), end_date: d('2026-11-06') },
      ],
    },
    {
      age_group: 'MAM',
      code: 'THEME_MAM_04',
      name: 'Nghề nghiệp quanh bé',
      start_date: d('2026-11-09'),
      end_date: d('2026-12-04'),
      status: 'PUBLISHED',
      description: 'Khám phá các nghề quen thuộc: Thầy cô giáo (chào mừng 20/11), bác sĩ, thợ xây, bác nông dân; trân trọng giá trị lao động và biết giữ gìn các sản phẩm người lao động làm ra.',
      sub_themes: [
        { name: 'Nghề dạy học - Ơn thầy cô (20/11)', start_date: d('2026-11-09'), end_date: d('2026-11-13') },
        { name: 'Nghề y tế chăm sóc sức khỏe', start_date: d('2026-11-16'), end_date: d('2026-11-20') },
        { name: 'Nghề xây dựng và kiến trúc', start_date: d('2026-11-23'), end_date: d('2026-11-27') },
        { name: 'Nghề nông nghiệp - Bác nông dân', start_date: d('2026-11-30'), end_date: d('2026-12-04') },
      ],
    },
    {
      age_group: 'MAM',
      code: 'THEME_MAM_05',
      name: 'Thế giới động vật',
      start_date: d('2026-12-07'),
      end_date: d('2027-01-08'),
      status: 'PUBLISHED',
      description: 'Mở rộng hiểu biết về tập tính, thức ăn, môi trường sống của thú nuôi, động vật dưới nước, chim muông; kết hợp hoạt động chào mừng ngày thành lập QĐNDVN 22/12 qua hình ảnh chú bộ đội.',
      sub_themes: [
        { name: 'Vật nuôi hiền lành trong gia đình', start_date: d('2026-12-07'), end_date: d('2026-12-11') },
        { name: 'Chú bộ đội của em (22/12)', start_date: d('2026-12-14'), end_date: d('2026-12-18') },
        { name: 'Thế giới động vật dưới nước', start_date: d('2026-12-21'), end_date: d('2026-12-25') },
        { name: 'Những con thú sống trong rừng', start_date: d('2026-12-28'), end_date: d('2027-01-01') },
        { name: 'Côn trùng và chim muông biết bay', start_date: d('2027-01-04'), end_date: d('2027-01-08') },
      ],
    },
    {
      age_group: 'MAM',
      code: 'THEME_MAM_06',
      name: 'Thực vật & Tết mùa xuân',
      start_date: d('2027-01-11'),
      end_date: d('2027-03-05'),
      status: 'PUBLISHED',
      description: 'Khám phá sự phát triển của cây xanh, hoa mùa xuân, rau củ quả tốt cho sức khỏe; trải nghiệm phong tục đón Tết Nguyên Đán và lễ hội mùa xuân rực rỡ sắc màu.',
      sub_themes: [
        { name: 'Cây xanh quanh bé và ích lợi', start_date: d('2027-01-11'), end_date: d('2027-01-15') },
        { name: 'Hoa đẹp mùa xuân và Tết cổ truyền', start_date: d('2027-02-15'), end_date: d('2027-02-19') },
        { name: 'Những loại quả thơm ngon bổ dưỡng', start_date: d('2027-02-22'), end_date: d('2027-02-26') },
        { name: 'Rau củ tốt cho hệ tiêu hóa', start_date: d('2027-03-01'), end_date: d('2027-03-05') },
      ],
    },
    {
      age_group: 'MAM',
      code: 'THEME_MAM_07',
      name: 'Giao thông an toàn',
      start_date: d('2027-03-08'),
      end_date: d('2027-03-26'),
      status: 'PUBLISHED',
      description: 'Phân loại các phương tiện đường bộ, đường thủy, đường sắt; làm quen tín hiệu đèn giao thông xanh - đỏ - vàng và quy tắc đi bộ an toàn; làm thiệp tri ân bà và mẹ ngày 8/3.',
      sub_themes: [
        { name: 'Món quà tặng mẹ ngày 8/3 & PTGT đường bộ', start_date: d('2027-03-08'), end_date: d('2027-03-12') },
        { name: 'Phương tiện đường thủy và đường hàng không', start_date: d('2027-03-15'), end_date: d('2027-03-19') },
        { name: 'Bé thực hành đèn tín hiệu giao thông', start_date: d('2027-03-22'), end_date: d('2027-03-26') },
      ],
    },
    {
      age_group: 'MAM',
      code: 'THEME_MAM_08',
      name: 'Nước & các hiện tượng tự nhiên',
      start_date: d('2027-03-29'),
      end_date: d('2027-04-16'),
      status: 'DRAFT',
      description: 'Khám phá tính chất không màu, không mùi của nước, sự bay hơi và đông đá; các hiện tượng thời tiết nắng, mưa, gió và giáo dục ý thức bảo vệ nguồn nước sạch.',
      sub_themes: [
        { name: 'Nước ngọt lành và ích lợi với sự sống', start_date: d('2027-03-29'), end_date: d('2027-04-02') },
        { name: 'Thời tiết bốn mùa và hiện tượng nắng mưa', start_date: d('2027-04-05'), end_date: d('2027-04-09') },
        { name: 'Gió, ánh sáng và không khí trong lành', start_date: d('2027-04-12'), end_date: d('2027-04-16') },
      ],
    },
    {
      age_group: 'MAM',
      code: 'THEME_MAM_09',
      name: 'Quê hương đất nước - Bác Hồ',
      start_date: d('2027-04-19'),
      end_date: d('2027-05-14'),
      status: 'DRAFT',
      description: 'Tìm hiểu danh lam thắng cảnh quê hương Kiên Giang và huyện đảo Kiên Hải; giáo dục lòng kính yêu Chủ tịch Hồ Chí Minh nhân ngày sinh 19/5 và tình yêu Tổ quốc Việt Nam.',
      sub_themes: [
        { name: 'Quê hương Hòn Tre biển đảo tươi đẹp', start_date: d('2027-04-19'), end_date: d('2027-04-23') },
        { name: 'Thủ đô Hà Nội và các danh lam thắng cảnh', start_date: d('2027-04-26'), end_date: d('2027-04-30') },
        { name: 'Bác Hồ kính yêu của thiếu nhi', start_date: d('2027-05-03'), end_date: d('2027-05-07') },
        { name: 'Bản đồ Việt Nam và cờ Tổ quốc', start_date: d('2027-05-10'), end_date: d('2027-05-14') },
      ],
    },
    {
      age_group: 'MAM',
      code: 'THEME_MAM_10',
      name: 'Bé vui đón hè',
      start_date: d('2027-05-17'),
      end_date: d('2027-06-04'),
      status: 'DRAFT',
      description: 'Chuẩn bị tâm thế hoàn thành chương trình lớp Mầm, chuyển tiếp lên lớp Chồi (4-5 tuổi); tổ chức các trò chơi nước giải nhiệt mùa hè và liên hoan tổng kết năm học.',
      sub_themes: [
        { name: 'Mùa hè rực rỡ và trang phục mát mẻ', start_date: d('2027-05-17'), end_date: d('2027-05-21') },
        { name: 'Kỳ nghỉ hè bổ ích bên gia đình', start_date: d('2027-05-24'), end_date: d('2027-05-28') },
        { name: 'Tạm biệt lớp Mầm, bé sẵn sàng lên lớp Chồi', start_date: d('2027-05-31'), end_date: d('2027-06-04') },
      ],
    },

    // ------------------------------------------------------------------------
    // KHỐI LỚP CHỒI (4 - 5 tuổi) - age_group: 'CHOI'
    // ------------------------------------------------------------------------
    {
      age_group: 'CHOI',
      code: 'THEME_CHOI_01',
      name: 'Trường mầm non thân yêu',
      start_date: d('2026-09-07'),
      end_date: d('2026-09-25'),
      status: 'PUBLISHED',
      description: 'Giúp trẻ 4-5 tuổi chủ động hòa nhập, tuân thủ các nội quy lớp học; phát triển kỹ năng giao tiếp lịch thiệp; nhận biết công việc của ban giám hiệu và giáo viên.',
      sub_themes: [
        { name: 'Trường mầm non Hòn Tre của bé', start_date: d('2026-09-07'), end_date: d('2026-09-11') },
        { name: 'Lớp học Chồi và các quy tắc thân thiện', start_date: d('2026-09-14'), end_date: d('2026-09-18') },
        { name: 'Đêm hội rước đèn Tết Trung Thu', start_date: d('2026-09-21'), end_date: d('2026-09-25') },
      ],
    },
    {
      age_group: 'CHOI',
      code: 'THEME_CHOI_02',
      name: 'Bản thân kỳ diệu',
      start_date: d('2026-09-28'),
      end_date: d('2026-10-16'),
      status: 'PUBLISHED',
      description: 'Khám phá cấu tạo cơ thể và sự phát triển thể chất; dinh dưỡng 4 nhóm thực phẩm; học cách tự bảo vệ cơ thể khỏi xâm hại và xử lý tình huống bị thương nhẹ.',
      sub_themes: [
        { name: 'Tôi là ai - Cá tính và sở trường của bé', start_date: d('2026-09-28'), end_date: d('2026-10-02') },
        { name: 'Khám phá sự phối hợp kỳ diệu của cơ thể', start_date: d('2026-10-05'), end_date: d('2026-10-09') },
        { name: 'Bé giữ gìn vệ sinh và phòng tránh nguy hiểm', start_date: d('2026-10-12'), end_date: d('2026-10-16') },
      ],
    },
    {
      age_group: 'CHOI',
      code: 'THEME_CHOI_03',
      name: 'Gia đình đầm ấm',
      start_date: d('2026-10-19'),
      end_date: d('2026-11-06'),
      status: 'PUBLISHED',
      description: 'Tìm hiểu về cây gia phả, mối quan hệ họ hàng; chia sẻ việc nhà vừa sức (gấp chăn, dọn bàn); tôn trọng người cao tuổi và ứng xử văn minh trong gia đình.',
      sub_themes: [
        { name: 'Các thế hệ sum vầy trong gia đình', start_date: d('2026-10-19'), end_date: d('2026-10-23') },
        { name: 'Địa chỉ nhà và các đồ dùng tiện ích', start_date: d('2026-10-26'), end_date: d('2026-10-30') },
        { name: 'Nhu cầu gia đình và bé giúp đỡ bố mẹ', start_date: d('2026-11-02'), end_date: d('2026-11-06') },
      ],
    },
    {
      age_group: 'CHOI',
      code: 'THEME_CHOI_04',
      name: 'Thế giới nghề nghiệp',
      start_date: d('2026-11-09'),
      end_date: d('2026-12-04'),
      status: 'PUBLISHED',
      description: 'Tìm hiểu sâu về công việc, trang phục và đồ dùng chuyên môn của các ngành nghề; giáo dục lòng tôn kính người làm nghề sư phạm 20/11; nuôi dưỡng ước mơ tương lai.',
      sub_themes: [
        { name: 'Nghề giáo viên - Người ươm mầm xanh (20/11)', start_date: d('2026-11-09'), end_date: d('2026-11-13') },
        { name: 'Nghề chăm sóc sức khỏe cộng đồng', start_date: d('2026-11-16'), end_date: d('2026-11-20') },
        { name: 'Nghề sản xuất vật chất và xây dựng', start_date: d('2026-11-23'), end_date: d('2026-11-27') },
        { name: 'Nghề dịch vụ, giao thông và quốc phòng', start_date: d('2026-11-30'), end_date: d('2026-12-04') },
      ],
    },
    {
      age_group: 'CHOI',
      code: 'THEME_CHOI_05',
      name: 'Thế giới muôn loài',
      start_date: d('2026-12-07'),
      end_date: d('2027-01-08'),
      status: 'PUBLISHED',
      description: 'Phân loại động vật theo môi trường sống, hình thức sinh sản (đẻ trứng, đẻ con); hiểu về chuỗi thức ăn đơn giản; kỷ niệm ngày thành lập QĐNDVN 22/12 tri ân chú bộ đội.',
      sub_themes: [
        { name: 'Động vật nuôi trong gia đình và bảo vệ chúng', start_date: d('2026-12-07'), end_date: d('2026-12-11') },
        { name: 'Noi gương chú bộ đội Cụ Hồ (22/12)', start_date: d('2026-12-14'), end_date: d('2026-12-18') },
        { name: 'Động vật biển và hải sản quê hương', start_date: d('2026-12-21'), end_date: d('2026-12-25') },
        { name: 'Động vật quý hiếm sống trong rừng sâu', start_date: d('2026-12-28'), end_date: d('2027-01-01') },
        { name: 'Thế giới côn trùng có ích và có hại', start_date: d('2027-01-04'), end_date: d('2027-01-08') },
      ],
    },
    {
      age_group: 'CHOI',
      code: 'THEME_CHOI_06',
      name: 'Thiên nhiên thực vật & Tết',
      start_date: d('2027-01-11'),
      end_date: d('2027-03-05'),
      status: 'PUBLISHED',
      description: 'Thí nghiệm thực vật cần nước và ánh sáng để phát triển; tìm hiểu ý nghĩa hoa mai hoa đào ngày Tết; phong tục gói bánh chưng; bảo vệ cây xanh không ngắt hoa bẻ cành.',
      sub_themes: [
        { name: 'Sự kỳ diệu của hạt nảy mầm và cây xanh', start_date: d('2027-01-11'), end_date: d('2027-01-15') },
        { name: 'Lễ hội hoa xuân và phong tục Tết cổ truyền', start_date: d('2027-02-15'), end_date: d('2027-02-19') },
        { name: 'Các loại quả đặc sản bốn mùa', start_date: d('2027-02-22'), end_date: d('2027-02-26') },
        { name: 'Rau xanh dinh dưỡng và món ăn ngày Tết', start_date: d('2027-03-01'), end_date: d('2027-03-05') },
      ],
    },
    {
      age_group: 'CHOI',
      code: 'THEME_CHOI_07',
      name: 'Phương tiện và luật giao thông',
      start_date: d('2027-03-08'),
      end_date: d('2027-03-26'),
      status: 'PUBLISHED',
      description: 'Tìm hiểu quy tắc giao thông đường bộ: Biển báo chỉ dẫn, vạch sang đường; phân tích hậu quả không tuân thủ luật; kết hợp làm thiệp kỷ niệm ngày Quốc tế Phụ nữ 8/3.',
      sub_themes: [
        { name: 'Bông hoa điểm mười tặng mẹ 8/3 & PTGT đường bộ', start_date: d('2027-03-08'), end_date: d('2027-03-12') },
        { name: 'Giao thông đường thủy trên vùng biển đảo', start_date: d('2027-03-15'), end_date: d('2027-03-19') },
        { name: 'Văn hóa giao thông và các biển báo quen thuộc', start_date: d('2027-03-22'), end_date: d('2027-03-26') },
      ],
    },
    {
      age_group: 'CHOI',
      code: 'THEME_CHOI_08',
      name: 'Các hiện tượng tự nhiên & STEAM',
      start_date: d('2027-03-29'),
      end_date: d('2027-04-16'),
      status: 'DRAFT',
      description: 'Dự án khám phá vòng tuần hoàn của nước; phân loại rác bảo vệ môi trường; tìm hiểu sấm chớp, cầu vồng; kỹ năng tự bảo vệ khi gặp giông lốc.',
      sub_themes: [
        { name: 'Vòng tuần hoàn kỳ thú của nước', start_date: d('2027-03-29'), end_date: d('2027-04-02') },
        { name: 'Hiện tượng thời tiết cực đoan và ứng phó', start_date: d('2027-04-05'), end_date: d('2027-04-09') },
        { name: 'Mặt trời, mặt trăng và các hành tinh', start_date: d('2027-04-12'), end_date: d('2027-04-16') },
      ],
    },
    {
      age_group: 'CHOI',
      code: 'THEME_CHOI_09',
      name: 'Quê hương Kiên Giang tươi đẹp',
      start_date: d('2027-04-19'),
      end_date: d('2027-05-14'),
      status: 'DRAFT',
      description: 'Giáo dục lòng tự hào về di tích lịch sử Hòn Tre, Rạch Giá, Phú Quốc; tìm hiểu cuộc đời Chủ tịch Hồ Chí Minh; hát các bài ca ngợi đất nước non sông.',
      sub_themes: [
        { name: 'Danh lam thắng cảnh tỉnh Kiên Giang quê em', start_date: d('2027-04-19'), end_date: d('2027-04-23') },
        { name: 'Bác Hồ muôn vàn kính yêu (19/5)', start_date: d('2027-04-26'), end_date: d('2027-04-30') },
        { name: 'Biển đảo quê hương và các chú lính hải quân', start_date: d('2027-05-03'), end_date: d('2027-05-07') },
        { name: 'Việt Nam đất nước ngàn năm văn hiến', start_date: d('2027-05-10'), end_date: d('2027-05-14') },
      ],
    },
    {
      age_group: 'CHOI',
      code: 'THEME_CHOI_10',
      name: 'Bé chào mùa hè rực rỡ',
      start_date: d('2027-05-17'),
      end_date: d('2027-06-04'),
      status: 'DRAFT',
      description: 'Tổng kết các kỹ năng học tập, nghệ thuật của năm học Chồi; chuẩn bị tâm thế bước vào lớp Lá (5-6 tuổi) - năm học tiền tiểu học quan trọng nhất.',
      sub_themes: [
        { name: 'Âm thanh mùa hè và hoa phượng đỏ', start_date: d('2027-05-17'), end_date: d('2027-05-21') },
        { name: 'Kế hoạch mùa hè vui tươi, an toàn', start_date: d('2027-05-24'), end_date: d('2027-05-28') },
        { name: 'Tạm biệt lớp Chồi, bé vững vàng lên lớp Lá', start_date: d('2027-05-31'), end_date: d('2027-06-04') },
      ],
    },

    // ------------------------------------------------------------------------
    // KHỐI LỚP LÁ (5 - 6 tuổi) - age_group: 'LA' (Bộ chuẩn phát triển trẻ 5 tuổi)
    // ------------------------------------------------------------------------
    {
      age_group: 'LA',
      code: 'THEME_LA_01',
      name: 'Trường mầm non của bé',
      start_date: d('2026-09-07'),
      end_date: d('2026-09-25'),
      status: 'PUBLISHED',
      description: 'Khẳng định vị thế anh chị lớn nhất trường mầm non; tự giác thực hiện nề nếp, gương mẫu hướng dẫn các em lớp bé; tổ chức lễ hội Trung Thu rộn ràng.',
      sub_themes: [
        { name: 'Chào năm học mới tại ngôi trường Hòn Tre', start_date: d('2026-09-07'), end_date: d('2026-09-11') },
        { name: 'Lớp Lá của bé và những người bạn thân', start_date: d('2026-09-14'), end_date: d('2026-09-18') },
        { name: 'Vui hội trăng rằm - Đêm hội Trung Thu', start_date: d('2026-09-21'), end_date: d('2026-09-25') },
      ],
    },
    {
      age_group: 'LA',
      code: 'THEME_LA_02',
      name: 'Bản thân',
      start_date: d('2026-09-28'),
      end_date: d('2026-10-09'),
      status: 'PUBLISHED',
      description: 'Nhận thức sâu sắc về giá trị bản thân, điểm mạnh, điểm yếu; kiểm soát cảm xúc khi tức giận; quy tắc 5 ngón tay phòng chống xâm hại cơ thể trẻ em.',
      sub_themes: [
        { name: 'Tôi là ai - Tự tin khẳng định cá tính', start_date: d('2026-09-28'), end_date: d('2026-10-02') },
        { name: 'Cơ thể tôi kỳ diệu và kỹ năng tự bảo vệ', start_date: d('2026-10-05'), end_date: d('2026-10-09') },
      ],
    },
    {
      age_group: 'LA',
      code: 'THEME_LA_03',
      name: 'Gia đình',
      start_date: d('2026-10-12'),
      end_date: d('2026-11-06'),
      status: 'PUBLISHED',
      description: 'Ghi nhớ chính xác địa chỉ nhà, số điện thoại cha mẹ để phòng khi lạc đường; bồi dưỡng lòng hiếu thảo đối với ông bà; nhận biết các nguy cơ cháy nổ, điện giật và kỹ năng thoát hiểm khi có sự cố.',
      sub_themes: [
        { name: 'Ngôi nhà gia đình sinh sống và địa chỉ nhà', start_date: d('2026-10-12'), end_date: d('2026-10-16') },
        { name: 'Gia đình yêu thương và gắn kết các thế hệ', start_date: d('2026-10-19'), end_date: d('2026-10-23') },
        { name: 'Mối quan hệ họ hàng nội ngoại thân thiết', start_date: d('2026-10-26'), end_date: d('2026-10-30') },
        { name: 'Đồ dùng sinh hoạt và an toàn khi ở nhà', start_date: d('2026-11-02'), end_date: d('2026-11-06') },
      ],
    },
    {
      age_group: 'LA',
      code: 'THEME_LA_04',
      name: 'Nghề nghiệp',
      start_date: d('2026-11-09'),
      end_date: d('2026-12-04'),
      status: 'PUBLISHED',
      description: 'Khám phá các nghề truyền thống địa phương (đánh bắt hải sản, dệt chiếu, làm gốm); hình thành ước mơ nghề nghiệp tương lai; biết quý trọng sức lao động và tự tay làm thiệp tri ân thầy cô 20/11.',
      sub_themes: [
        { name: 'Nghề nghiệp của bố mẹ và ước mơ của bé', start_date: d('2026-11-09'), end_date: d('2026-11-13') },
        { name: 'Biết ơn thầy cô giáo ngày 20/11', start_date: d('2026-11-16'), end_date: d('2026-11-20') },
        { name: 'Nghề truyền thống và dịch vụ địa phương', start_date: d('2026-11-23'), end_date: d('2026-11-27') },
        { name: 'Dụng cụ, phương tiện và trang phục nghề', start_date: d('2026-11-30'), end_date: d('2026-12-04') },
      ],
    },
    {
      age_group: 'LA',
      code: 'THEME_LA_05',
      name: 'Thế giới động vật',
      start_date: d('2026-12-07'),
      end_date: d('2027-01-08'),
      status: 'PUBLISHED',
      description: 'Phân loại động vật theo cấu tạo giải phẫu và hình thức sinh sản (đẻ trứng, đẻ con); tìm hiểu về chuỗi sinh thái và động vật hoang dã cần bảo tồn; học tập phẩm chất anh bộ đội Cụ Hồ ngày 22/12.',
      sub_themes: [
        { name: 'Động vật nuôi gia đình và thú làm cảnh', start_date: d('2026-12-07'), end_date: d('2026-12-11') },
        { name: 'Chú bộ đội QĐND Việt Nam (22/12)', start_date: d('2026-12-14'), end_date: d('2026-12-18') },
        { name: 'Động vật sống dưới nước ngọt và mặn', start_date: d('2026-12-21'), end_date: d('2026-12-25') },
        { name: 'Động vật hoang dã sống trong rừng sâu', start_date: d('2026-12-28'), end_date: d('2027-01-01') },
        { name: 'Một số loài côn trùng và chim bay lượn', start_date: d('2027-01-04'), end_date: d('2027-01-08') },
      ],
    },
    {
      age_group: 'LA',
      code: 'THEME_LA_06',
      name: 'Thế giới thực vật',
      start_date: d('2027-01-11'),
      end_date: d('2027-03-05'),
      status: 'PUBLISHED',
      description: 'Nghiên cứu sự quang hợp và điều kiện sinh trưởng của thực vật; thực hành cắm hoa nghệ thuật; tìm hiểu nét đẹp văn hóa gói bánh chưng bánh tét ngày Tết; có hành vi tích cực bảo vệ cây xanh đô thị.',
      sub_themes: [
        { name: 'Cây xanh, cây ăn quả và cây bóng mát', start_date: d('2027-01-11'), end_date: d('2027-01-15') },
        { name: 'Thế giới các loài hoa đẹp tỏa ngát hương', start_date: d('2027-02-15'), end_date: d('2027-02-19') },
        { name: 'Những loại rau củ bé ăn hàng ngày', start_date: d('2027-02-22'), end_date: d('2027-02-26') },
        { name: 'Hương sắc mùa xuân và ngày Tết quê em', start_date: d('2027-03-01'), end_date: d('2027-03-05') },
      ],
    },
    {
      age_group: 'LA',
      code: 'THEME_LA_07',
      name: 'Phương tiện giao thông',
      start_date: d('2027-03-08'),
      end_date: d('2027-04-09'),
      status: 'PUBLISHED',
      description: 'Nắm vững hệ thống biển báo giao thông cơ bản (biển cấm, biển chỉ dẫn, biển nguy hiểm); xây dựng văn hóa giao thông văn minh; tìm hiểu về công việc người điều khiển giao thông; tri ân bà và mẹ ngày 8/3.',
      sub_themes: [
        { name: 'Phương tiện giao thông đường bộ', start_date: d('2027-03-08'), end_date: d('2027-03-12') },
        { name: 'Món quà yêu thương tặng bà, mẹ ngày 8/3', start_date: d('2027-03-15'), end_date: d('2027-03-19') },
        { name: 'Phương tiện giao thông đường thủy & cảng biển', start_date: d('2027-03-22'), end_date: d('2027-03-26') },
        { name: 'Phương tiện giao thông đường hàng không', start_date: d('2027-03-29'), end_date: d('2027-04-02') },
        { name: 'Biển báo giao thông và văn hóa đi đường', start_date: d('2027-04-05'), end_date: d('2027-04-09') },
      ],
    },
    {
      age_group: 'LA',
      code: 'THEME_LA_08',
      name: 'Hiện tượng tự nhiên',
      start_date: d('2027-04-12'),
      end_date: d('2027-04-30'),
      status: 'DRAFT',
      description: 'Thực hiện các dự án STEAM khám phá vòng tuần hoàn nước, hiện tượng biến đổi khí hậu, bão lũ; rèn luyện kỹ năng ứng phó khi thời tiết xấu (sấm sét, mưa giông); phân loại rác thải nhựa bảo vệ môi trường.',
      sub_themes: [
        { name: 'Sự kỳ diệu của nước và vòng tuần hoàn nước', start_date: d('2027-04-12'), end_date: d('2027-04-16') },
        { name: 'Hiện tượng thời tiết: Gió, mưa, bão lũ', start_date: d('2027-04-19'), end_date: d('2027-04-23') },
        { name: 'Sự luân chuyển bốn mùa & bảo vệ môi trường', start_date: d('2027-04-26'), end_date: d('2027-04-30') },
      ],
    },
    {
      age_group: 'LA',
      code: 'THEME_LA_09',
      name: 'Trường Tiểu học',
      start_date: d('2027-05-03'),
      end_date: d('2027-05-14'),
      status: 'DRAFT',
      description: 'Tham quan trường Tiểu học, làm quen với lớp 1, bàn ghế học sinh, bảng đen, phấn trắng; rèn tư thế ngồi viết chuẩn, làm quen cặp sách và tạo tâm lý háo hức, tự tin cho trẻ sẵn sàng bước vào lớp 1.',
      sub_themes: [
        { name: 'Trường Tiểu học thân thương đón chào bé', start_date: d('2027-05-03'), end_date: d('2027-05-07') },
        { name: 'Đồ dùng học tập và trang phục học sinh lớp 1', start_date: d('2027-05-10'), end_date: d('2027-05-14') },
      ],
    },
    {
      age_group: 'LA',
      code: 'THEME_LA_10',
      name: 'Quê hương - Bác Hồ',
      start_date: d('2027-05-17'),
      end_date: d('2027-06-04'),
      status: 'DRAFT',
      description: 'Khơi dậy lòng tự hào về truyền thống cách mạng quê hương Hòn Tre - Kiên Giang; ghi nhớ công ơn Bác Hồ kính yêu nhân ngày 19/5; chuẩn bị lễ ra trường thiêng liêng tạm biệt mái trường mầm non.',
      sub_themes: [
        { name: 'Quê hương Kiên Giang đổi mới và phát triển', start_date: d('2027-05-17'), end_date: d('2027-05-21') },
        { name: 'Bác Hồ kính yêu với thiếu nhi (19/5)', start_date: d('2027-05-24'), end_date: d('2027-05-28') },
        { name: 'Đất nước Việt Nam hòa bình, thống nhất', start_date: d('2027-05-31'), end_date: d('2027-06-04') },
      ],
    },
  ];

  let insertedThemeCount = 0;
  let insertedSubThemeCount = 0;

  for (const thData of rawThemes) {
    const { sub_themes, ...themeProps } = thData;
    const theme = await prisma.curriculumTheme.create({
      data: {
        ...themeProps,
        school_year_id: SCHOOL_YEAR_ID,
      },
    });
    insertedThemeCount++;

    for (const sub of sub_themes) {
      await prisma.subTheme.create({
        data: {
          theme_id: theme.theme_id,
          name: sub.name,
          start_date: sub.start_date,
          end_date: sub.end_date,
          created_by: bghId,
        },
      });
      insertedSubThemeCount++;
    }
  }

  console.log(`✅ Inserted ${insertedThemeCount} CurriculumThemes and ${insertedSubThemeCount} SubThemes.`);

  // ==========================================================================
  // PART 2: GOALS & EDUCATIONAL CONTENTS (61 Goals)
  // ==========================================================================
  console.log('\n--- Seeding 61 Educational Goals and Contents ---');

  const rawGoals = [
    // ------------------------------------------------------------------------
    // KHỐI NHÀ TRẺ (11 Mục tiêu)
    // ------------------------------------------------------------------------
    { age_group: 'NHA_TRE', domain: 'PHYSICAL', goal_code: 'MT 1', title: 'Vận động nhóm cơ hô hấp, tay, lưng, bụng, chân theo hiệu lệnh đơn giản', contents: ['Tập các động tác phát triển nhóm cơ hô hấp: Hít vào sâu, thở ra từ từ', 'Tập các động tác tay, chân, lưng bụng theo nhịp đếm và bài hát'] },
    { age_group: 'NHA_TRE', domain: 'PHYSICAL', goal_code: 'MT 2', title: 'Giữ thăng bằng khi đi theo đường hẹp, đi kiễng gót 2-3 bước', contents: ['Đi theo đường hẹp có mang vật trên tay cự ly 2m', 'Đi kiễng gót 2-3 bước theo hiệu lệnh của cô'] },
    { age_group: 'NHA_TRE', domain: 'PHYSICAL', goal_code: 'MT 3', title: 'Phối hợp tay - mắt: Tung bắt bóng cùng cô, xếp chồng 4-6 khối gỗ', contents: ['Tung bắt bóng cùng cô ở khoảng cách 1m', 'Xếp chồng 4-6 khối gỗ thăng bằng không bị đổ'] },
    { age_group: 'NHA_TRE', domain: 'PHYSICAL', goal_code: 'MT 4', title: 'Thích nghi chế độ ăn ngủ, biết tự cầm thìa xúc cơm, tự đi vệ sinh khi có nhu cầu', contents: ['Rèn nề nếp tự cầm thìa xúc cơm gọn gàng', 'Tập thói quen gọi cô khi có nhu cầu đi vệ sinh'] },
    { age_group: 'NHA_TRE', domain: 'COGNITIVE', goal_code: 'MT 5', title: 'Nhận biết tên bản thân, các bộ phận mắt, mũi, miệng, tai, tay, chân', contents: ['Nhận biết và chỉ đúng các giác quan và bộ phận cơ thể', 'Nhận biết tên gọi của bé và các bạn trong lớp'] },
    { age_group: 'NHA_TRE', domain: 'COGNITIVE', goal_code: 'MT 6', title: 'Nhận biết, phân biệt 3 màu cơ bản: Đỏ, Vàng, Xanh lá cây; nhận biết to - nhỏ', contents: ['Phân biệt màu Đỏ và màu Vàng qua đồ chơi quả bóng', 'Nhận biết kích thước To - Nhỏ qua 2 con gấu bông'] },
    { age_group: 'NHA_TRE', domain: 'COGNITIVE', goal_code: 'MT 7', title: 'Nhận biết tên gọi và tiếng kêu của con vật nuôi quen thuộc', contents: ['Nhận biết con chó, con mèo và bắt chước tiếng kêu', 'Nhận biết con gà trống và thức ăn quen thuộc của gà'] },
    { age_group: 'NHA_TRE', domain: 'LANGUAGE', goal_code: 'MT 8', title: 'Lắng nghe hiểu lời nói, thực hiện mệnh lệnh đơn giản', contents: ['Thực hiện mệnh lệnh: Lấy bóng cho cô, cất dép lên giá', 'Lắng nghe và nhắc lại lời cô trong các hoạt động chơi'] },
    { age_group: 'NHA_TRE', domain: 'LANGUAGE', goal_code: 'MT 9', title: 'Sử dụng câu đơn 2-3 từ bày tỏ nhu cầu; chào cô, chào bố mẹ lễ phép', contents: ['Sử dụng câu đơn bày tỏ nhu cầu: Con uống nước, Cô bế con', 'Chào cô khi đến lớp và chào ba mẹ khi ra về'] },
    { age_group: 'NHA_TRE', domain: 'SOCIO_EMOTIONAL', goal_code: 'MT 10', title: 'Chơi cạnh bạn trong nhóm, không cắn hoặc đánh bạn; biểu lộ tình cảm yêu mến', contents: ['Chơi hòa thuận cạnh bạn, chia sẻ đồ chơi đơn giản', 'Biểu lộ tình cảm yêu quý cô giáo và các bạn cùng lớp'] },
    { age_group: 'NHA_TRE', domain: 'SOCIO_EMOTIONAL', goal_code: 'MT 11', title: 'Lắng nghe nhạc lắc lư vỗ tay; cầm bút sáp vẽ nét nguệch ngoạc trên giấy', contents: ['Lắc lư vỗ tay theo giai điệu bài hát vui nhộn', 'Cầm bút sáp di màu và vẽ nét nguệch ngoạc tự do'] },

    // ------------------------------------------------------------------------
    // KHỐI LỚP MẦM (14 Mục tiêu)
    // ------------------------------------------------------------------------
    { age_group: 'MAM', domain: 'PHYSICAL', goal_code: 'MT 1', title: 'Thực hiện đúng các động tác phát triển nhóm cơ và hô hấp', contents: ['Hít thở sâu và vận động tay vai theo nhạc khởi động', 'Tập bài thể dục sáng nhịp nhàng với nơ và gậy'] },
    { age_group: 'MAM', domain: 'PHYSICAL', goal_code: 'MT 2', title: 'Giữ thăng bằng cơ thể khi đi trên vạch kẻ thẳng trên sàn', contents: ['Đi trên vạch kẻ thẳng dài 3m đầu ngẩng cao', 'Đi thăng bằng bước qua chướng ngại vật thấp'] },
    { age_group: 'MAM', domain: 'PHYSICAL', goal_code: 'MT 3', title: 'Phối hợp tay mắt khi ném bóng trúng đích nằm ngang cự ly 1.5m', contents: ['Ném bóng bằng một tay trúng đích nằm ngang cách 1.5m', 'Bắt bóng nảy từ sàn bằng 2 tay'] },
    { age_group: 'MAM', domain: 'PHYSICAL', goal_code: 'MT 4', title: 'Rửa tay bằng xà phòng đúng quy trình, tự xúc ăn gọn gàng', contents: ['Thực hành rửa tay 6 bước bằng xà phòng trước khi ăn', 'Tự xúc cơm hết suất không làm rơi vãi'] },
    { age_group: 'MAM', domain: 'COGNITIVE', goal_code: 'MT 5', title: 'Quan sát, so sánh và phân loại sự vật theo 1 dấu hiệu nổi bật', contents: ['Phân loại đồ dùng đồ chơi theo màu sắc và kích thước', 'Nhận biết đặc điểm nổi bật của các con vật quen thuộc'] },
    { age_group: 'MAM', domain: 'COGNITIVE', goal_code: 'MT 6', title: 'Đếm trong phạm vi 3-5, nhận biết số lượng và chọn thẻ số', contents: ['Đếm trên đối tượng trong phạm vi 3 và gắn thẻ số', 'Đếm đến 5, nhận biết các nhóm có 5 đối tượng'] },
    { age_group: 'MAM', domain: 'COGNITIVE', goal_code: 'MT 7', title: 'Định hướng không gian: Phía trên - dưới, phía trước - sau của bản thân', contents: ['Xác định vị trí phía trên - phía dưới cơ thể', 'Xác định vị trí phía trước - phía sau cơ thể'] },
    { age_group: 'MAM', domain: 'COGNITIVE', goal_code: 'MT 8', title: 'Khám phá tính chất sự vật hiện tượng qua các giác quan', contents: ['Thí nghiệm tính chất của nước: Không màu, không mùi', 'Khám phá sự phát triển của hạt đỗ trong bông ẩm'] },
    { age_group: 'MAM', domain: 'LANGUAGE', goal_code: 'MT 9', title: 'Diễn đạt ý nghĩ bằng câu trọn vẹn đủ thành phần chủ ngữ - vị ngữ', contents: ['Trả lời câu hỏi của cô bằng câu trọn vẹn', 'Kể lại sự việc đơn giản diễn ra trong ngày'] },
    { age_group: 'MAM', domain: 'LANGUAGE', goal_code: 'MT 10', title: 'Đọc thơ diễn cảm và nghe kể chuyện cổ tích ngắn', contents: ['Đọc thuộc các bài thơ ngắn trong chủ đề', 'Nghe và hiểu nội dung câu chuyện: Gấu con chia quà'] },
    { age_group: 'MAM', domain: 'SOCIO_EMOTIONAL', goal_code: 'MT 11', title: 'Nhận biết biểu cảm vui buồn, chào hỏi lễ phép người lớn tuổi', contents: ['Nhận biết cảm xúc qua nét mặt và biết an ủi bạn', 'Chào hỏi lễ phép người lớn khi đến lớp và ra về'] },
    { age_group: 'MAM', domain: 'SOCIO_EMOTIONAL', goal_code: 'MT 12', title: 'Xếp hàng chờ đến lượt, cất dọn đồ chơi đúng nơi quy định', contents: ['Kiên nhẫn đứng xếp hàng chờ đến lượt chơi cầu trượt', 'Tự giác cất dọn đồ chơi vào rổ sau khi chơi xong'] },
    { age_group: 'MAM', domain: 'AESTHETIC', goal_code: 'MT 13', title: 'Hát đúng giai điệu bài hát thiếu nhi, vỗ tay theo phách', contents: ['Dạy hát bài: Vui đến trường và Cháu yêu cô chú công nhân', 'Vận động vỗ tay theo phách nhịp bài hát'] },
    { age_group: 'MAM', domain: 'AESTHETIC', goal_code: 'MT 14', title: 'Sử dụng kỹ năng tô màu không lem, nặn vo tròn lăn dài tạo sản phẩm', contents: ['Tô màu tranh rỗng không chờm ra ngoài nét vẽ', 'Nặn chiếc vòng đeo tay, viên kẹo từ đất nặn'] },

    // ------------------------------------------------------------------------
    // KHỐI LỚP CHỒI (14 Mục tiêu)
    // ------------------------------------------------------------------------
    { age_group: 'CHOI', domain: 'PHYSICAL', goal_code: 'MT 1', title: 'Thực hiện bài tập phát triển chung nhịp nhàng với gậy, nơ, vô lăng', contents: ['Tập bài thể dục sáng theo nhạc chủ đề kết hợp dụng cụ', 'Vận động thể lực nhịp nhàng tăng cường sức bền'] },
    { age_group: 'CHOI', domain: 'PHYSICAL', goal_code: 'MT 2', title: 'Đi thăng bằng trên ghế thể dục, bật xa 35-40cm tiếp đất nhẹ nhàng', contents: ['Đi thăng bằng trên ghế thể dục đầu đội túi cát', 'Bật xa 35-40cm bằng 2 chân tiếp đất an toàn'] },
    { age_group: 'CHOI', domain: 'PHYSICAL', goal_code: 'MT 3', title: 'Kỹ năng vận động tinh: Cắt kéo theo đường cong, cài cúc áo', contents: ['Sử dụng kéo an toàn cắt theo đường viền lượn sóng', 'Kỹ năng tự cài cúc áo và gấp quần áo gọn gàng'] },
    { age_group: 'CHOI', domain: 'PHYSICAL', goal_code: 'MT 4', title: 'Có thói quen ăn uống văn minh, nhận biết nguy cơ tai nạn điện nước', contents: ['Thực hành ăn uống văn minh, nhai kỹ, không nói chuyện khi nhai', 'Nhận biết các khu vực nguy hiểm: Ổ điện, ban công, ao hồ'] },
    { age_group: 'CHOI', domain: 'COGNITIVE', goal_code: 'MT 5', title: 'Phân loại đồ vật, con vật, cây cối theo 2-3 dấu hiệu', contents: ['Phân loại các phương tiện giao thông theo nơi hoạt động và công dụng', 'Phân loại động vật theo hình thức sinh sản và thức ăn'] },
    { age_group: 'CHOI', domain: 'COGNITIVE', goal_code: 'MT 6', title: 'Đếm, so sánh số lượng, thêm bớt trong phạm vi 5-7', contents: ['Đếm và tạo nhóm có 7 đối tượng, thêm bớt trong phạm vi 7', 'Tách gộp nhóm có 4-5 đối tượng bằng các cách khác nhau'] },
    { age_group: 'CHOI', domain: 'COGNITIVE', goal_code: 'MT 7', title: 'Nhận biết quy luật sắp xếp xen kẽ A-B; nhận biết khối vuông, tròn, chữ nhật', contents: ['Nhận biết quy tắc xếp xen kẽ và tiếp tục chuỗi mẫu', 'Phân biệt khối cầu - khối trụ, khối vuông - khối chữ nhật'] },
    { age_group: 'CHOI', domain: 'COGNITIVE', goal_code: 'MT 8', title: 'Thực hiện thí nghiệm khoa học đơn giản: Vật nổi - vật chìm, cây hút nước', contents: ['Thí nghiệm vật nổi vật chìm trong chậu nước', 'Quan sát quá trình nảy mầm và cây lớn lên'] },
    { age_group: 'CHOI', domain: 'LANGUAGE', goal_code: 'MT 9', title: 'Đặt câu hỏi Tại sao, Vì sao; tự tin thuyết trình mạch lạc trước nhóm', contents: ['Sử dụng câu hỏi Tại sao để tìm hiểu nguyên nhân sự vật', 'Thuyết trình ngắn về bức tranh do chính mình vẽ'] },
    { age_group: 'CHOI', domain: 'LANGUAGE', goal_code: 'MT 10', title: 'Kể lại chuyện đã được nghe theo tranh minh họa có mở đầu và kết thúc', contents: ['Kể chuyện sáng tạo theo tranh minh họa', 'Đọc thơ diễn cảm kết hợp cử chỉ điệu bộ'] },
    { age_group: 'CHOI', domain: 'SOCIO_EMOTIONAL', goal_code: 'MT 11', title: 'Chủ động hợp tác nhóm, thỏa thuận phân công vai chơi trong các góc', contents: ['Thỏa thuận vai chơi trong góc phân vai gia đình và bán hàng', 'Lắng nghe ý kiến của bạn khi cùng chơi trò chơi xây dựng'] },
    { age_group: 'CHOI', domain: 'SOCIO_EMOTIONAL', goal_code: 'MT 12', title: 'Có ý thức tiết kiệm điện nước, giữ gìn vệ sinh môi trường trường lớp', contents: ['Tắt vòi nước sau khi rửa tay, tắt quạt khi ra khỏi phòng', 'Nhặt rác bỏ vào thùng rác phân loại'] },
    { age_group: 'CHOI', domain: 'AESTHETIC', goal_code: 'MT 13', title: 'Hát múa minh họa, gõ phách tre theo tiết tấu chậm bài hát', contents: ['Hát múa minh họa bài: Em đi qua ngã tư đường phố', 'Gõ đệm phách tre và xắc xô theo tiết tấu chậm'] },
    { age_group: 'CHOI', domain: 'AESTHETIC', goal_code: 'MT 14', title: 'Vẽ tranh có bố cục cân đối xa gần, tạo hình từ vật liệu tái chế', contents: ['Vẽ tranh phong cảnh gia đình có bố cục hài hòa', 'Xé dán đàn cá bơi lội từ giấy màu và lá cây'] },

    // ------------------------------------------------------------------------
    // KHỐI LỚP LÁ (22 Mục tiêu gắn với Bộ Chuẩn Phát Triển Trẻ 5 Tuổi)
    // ------------------------------------------------------------------------
    { age_group: 'LA', domain: 'PHYSICAL', goal_code: 'MT 1', indicator_code: 'CS 1', title: 'Giữ tư thế đúng khi đứng, ngồi học và đi lại', contents: ['Rèn luyện tư thế ngồi ngay ngắn khi vào bàn học', 'Đi đứng thẳng lưng, mắt nhìn về phía trước'] },
    { age_group: 'LA', domain: 'PHYSICAL', goal_code: 'MT 2', indicator_code: 'CS 2', title: 'Bật xa tối thiểu 50cm tiếp đất nhẹ nhàng bằng mũi bàn chân', contents: ['Kỹ thuật bật xa 50cm và tiếp đất êm ái bằng nửa bàn chân trên', 'Trò chơi vận động nhảy bao bố tiếp sức'] },
    { age_group: 'LA', domain: 'PHYSICAL', goal_code: 'MT 3', indicator_code: 'CS 4', title: 'Đứng 1 chân giữ thăng bằng trong 10 giây', contents: ['Tập đứng một chân co gối giữ thăng bằng trong 10 giây', 'Đi trên ghế thể dục đầu đội túi cát'] },
    { age_group: 'LA', domain: 'PHYSICAL', goal_code: 'MT 4', indicator_code: 'CS 6', title: 'Chạy nhanh 18m trong 5 đến 6 giây', contents: ['Chạy nhanh 18m xuất phát đúng hiệu lệnh', 'Trò chơi chạy tiếp sức đồng đội'] },
    { age_group: 'LA', domain: 'PHYSICAL', goal_code: 'MT 5', indicator_code: 'CS 8', title: 'Cắt kéo lượn theo đường viền tròn, viền cong không bị lẹm', contents: ['Cắt kéo lượn theo đường cong phức tạp', 'Cắt dán hoa văn trang trí khung ảnh'] },
    { age_group: 'LA', domain: 'PHYSICAL', goal_code: 'MT 6', indicator_code: 'CS 10', title: 'Tự rửa mặt, chải răng đúng kỹ thuật sau bữa ăn', contents: ['Quy trình chải răng đúng cách mặt trong, mặt ngoài', 'Tự giặt khăn và rửa mặt sạch sẽ'] },
    { age_group: 'LA', domain: 'PHYSICAL', goal_code: 'MT 7', indicator_code: 'CS 12', title: 'Nhận biết nguy cơ tai nạn thương tích: Ao sâu, ổ điện, lòng đường', contents: ['Kỹ năng phòng chống đuối nước và không đến gần ao hồ', 'Nhận biết nguy hiểm khi tự ý băng qua lòng đường'] },
    { age_group: 'LA', domain: 'COGNITIVE', goal_code: 'MT 8', indicator_code: 'CS 23', title: 'Đếm, nhận biết số lượng và chữ số trong phạm vi 10', contents: ['Đếm đến 10, nhận biết các nhóm có 10 đối tượng', 'Nhận biết ý nghĩa của các con số trong đời sống'] },
    { age_group: 'LA', domain: 'COGNITIVE', goal_code: 'MT 9', indicator_code: 'CS 24', title: 'Tách và gộp 10 đối tượng thành 2 nhóm bằng các cách khác nhau', contents: ['Tách gộp nhóm 10 đối tượng theo các cách: 1-9, 2-8, 3-7, 4-6, 5-5', 'Ứng dụng phép tách gộp vào giải quyết bài toán thực tế'] },
    { age_group: 'LA', domain: 'COGNITIVE', goal_code: 'MT 10', indicator_code: 'CS 26', title: 'Nhận biết các ngày trong tuần, hôm qua, hôm nay, ngày mai', contents: ['Xem lịch tuần và gọi tên thứ 2 đến chủ nhật', 'Xác định mốc thời gian hôm qua, hôm nay, ngày mai'] },
    { age_group: 'LA', domain: 'COGNITIVE', goal_code: 'MT 11', indicator_code: 'CS 28', title: 'Khám phá tính chất của nước, không khí, thời tiết 4 mùa', contents: ['Dự án khám phá vòng tuần hoàn của nước', 'Thí nghiệm chứng minh không khí có ở xung quanh ta'] },
    { age_group: 'LA', domain: 'COGNITIVE', goal_code: 'MT 12', indicator_code: 'CS 30', title: 'Xác định vị trí không gian: Phía phải, phía trái của người đối diện', contents: ['Xác định tay phải, tay trái của người đứng đối diện', 'Trò chơi định hướng không gian trong sân trường'] },
    { age_group: 'LA', domain: 'LANGUAGE', goal_code: 'MT 13', indicator_code: 'CS 40', title: 'Lắng nghe hiểu truyện, trả lời câu hỏi suy luận và tóm tắt ý chính', contents: ['Nghe truyện kể và trả lời câu hỏi Vì sao, Nếu như', 'Tóm tắt nội dung chính của câu chuyện cổ tích'] },
    { age_group: 'LA', domain: 'LANGUAGE', goal_code: 'MT 14', indicator_code: 'CS 48', title: 'Nhận dạng và phát âm chính xác 29 chữ cái tiếng Việt', contents: ['Làm quen và phát âm chuẩn các nhóm chữ cái: b, d, đ, l, m, n', 'Tìm kiếm chữ cái đã học trong tên biển hiệu, sách báo'] },
    { age_group: 'LA', domain: 'LANGUAGE', goal_code: 'MT 15', indicator_code: 'CS 50', title: 'Sao chép chữ cái, chữ số và viết tên mình từ trái sang phải', contents: ['Tập tô các nét cơ bản: Nét thẳng, nét cong, nét móc', 'Tập chép tên của bé vào nhãn vở chuẩn bị vào lớp 1'] },
    { age_group: 'LA', domain: 'LANGUAGE', goal_code: 'MT 16', indicator_code: 'CS 52', title: 'Sử dụng câu phức, câu ghép để thuyết trình sản phẩm tạo hình', contents: ['Thuyết trình về sản phẩm sáng tạo trước cả lớp', 'Sử dụng từ nối diễn đạt mạch lạc suy nghĩ của mình'] },
    { age_group: 'LA', domain: 'SOCIO_EMOTIONAL', goal_code: 'MT 17', indicator_code: 'CS 65', title: 'Kiểm soát cảm xúc nóng giận, biết giải quyết mâu thuẫn bằng lời nói', contents: ['Nhận diện cơn giận và kỹ thuật hít thở sâu lấy lại bình tĩnh', 'Giải quyết tranh chấp đồ chơi bằng thương lượng'] },
    { age_group: 'LA', domain: 'SOCIO_EMOTIONAL', goal_code: 'MT 18', indicator_code: 'CS 70', title: 'Kiên trì thực hiện nhiệm vụ đến cùng không bỏ dở giữa chừng', contents: ['Hoàn thành bài tập ghép hình khó hoặc vẽ tranh', 'Ý thức trách nhiệm với công việc trực nhật được giao'] },
    { age_group: 'LA', domain: 'SOCIO_EMOTIONAL', goal_code: 'MT 19', indicator_code: 'CS 75', title: 'Biết bày tỏ lòng biết ơn cha mẹ, thầy cô, người lớn tuổi', contents: ['Tự làm thiệp chúc mừng tri ân thầy cô giáo 20/11', 'Nói lời cảm ơn và ôm hôn cha mẹ mỗi ngày'] },
    { age_group: 'LA', domain: 'SOCIO_EMOTIONAL', goal_code: 'MT 20', indicator_code: 'CS 80', title: 'Sẵn sàng tâm thế háo hức, tự tin bước vào trường Tiểu học', contents: ['Tham quan trường Tiểu học và làm quen với lớp 1', 'Rèn luyện thói quen tự chuẩn bị sách vở, đồ dùng học tập'] },
    { age_group: 'LA', domain: 'AESTHETIC', goal_code: 'MT 21', indicator_code: 'CS 95', title: 'Hát đúng giai điệu, gõ đệm tiết tấu chậm/tiết tấu phối hợp thuần thục', contents: ['Dạy hát và biểu diễn bài: Cháu vẫn nhớ trường mầm non', 'Gõ đệm tiết tấu phối hợp bằng nhạc cụ gõ dân tộc'] },
    { age_group: 'LA', domain: 'AESTHETIC', goal_code: 'MT 22', indicator_code: 'CS 100', title: 'Phối hợp các kỹ năng vẽ, xé dán, nặn tạo ra sản phẩm mỹ thuật sáng tạo', contents: ['Vẽ tranh phong cảnh quê hương biển đảo Hòn Tre', 'Làm mô hình phương tiện giao thông từ vật liệu tái chế'] },
  ];

  let insertedGoalCount = 0;
  let insertedContentCount = 0;
  const goalContentMap = new Map(); // goal_code + age_group -> content_id array

  for (const gData of rawGoals) {
    const goal = await prisma.educationalGoal.create({
      data: {
        school_year_id: SCHOOL_YEAR_ID,
        age_group: gData.age_group,
        domain: gData.domain,
        goal_code: gData.goal_code,
        indicator_code: gData.indicator_code || null,
        title: gData.title,
        is_approved: true,
      },
    });
    insertedGoalCount++;

    const contentIds = [];
    for (const cntTitle of gData.contents) {
      const content = await prisma.educationalContent.create({
        data: {
          goal_id: goal.goal_id,
          title: cntTitle,
        },
      });
      insertedContentCount++;
      contentIds.push(content.content_id);
    }
    goalContentMap.set(`${gData.age_group}_${gData.goal_code}`, contentIds);
  }

  console.log(`✅ Inserted ${insertedGoalCount} EducationalGoals and ${insertedContentCount} EducationalContents.`);

  // ==========================================================================
  // PART 3: EDUCATIONAL ACTIVITIES (157 Activities across Routine Slots)
  // ==========================================================================
  console.log('\n--- Seeding 157 Master Educational Activities ---');

  // Grab some content ids to associate
  const allContents = await prisma.educationalContent.findMany();
  const getRandomContentId = () => {
    const idx = Math.floor(Math.random() * allContents.length);
    return allContents[idx].content_id;
  };
  const getContentId = (age, goalCode, fallbackIdx = 0) => {
    const ids = goalContentMap.get(`${age}_${goalCode}`);
    if (ids && ids.length > 0) return ids[fallbackIdx % ids.length];
    return getRandomContentId();
  };

  const rawActivities = [
    // ------------------------------------------------------------------------
    // 1. ARRIVAL_PLAY & RETURN_CHILD (Universal frames for 4 cohorts)
    // ------------------------------------------------------------------------
    {
      content_id: getContentId('NHA_TRE', 'MT 9'),
      routine_slot: 'ARRIVAL_PLAY',
      title: 'Đón trẻ & trò chuyện đầu giờ theo chủ đề tuần',
      objective: 'Trẻ đến lớp vui vẻ, lễ phép chào cô và cha mẹ to rõ; tự cất giày dép, ba lô đúng tủ cá nhân; uống nước ấm, đo thân nhiệt và tham gia trò chuyện đầu giờ.',
      preparation: 'Phòng học sạch thoáng, bảng điểm danh nam châm hình ảnh của trẻ, loa mở bài hát vui nhộn đón trẻ.',
      procedure: '1. Cô đón trẻ tại cửa, quan sát sức khỏe, trao đổi nhanh với phụ huynh.\n2. Hướng dẫn trẻ tự tháo dép để lên giá, cất ba lô vào ngăn tủ có ký hiệu của mình.\n3. Trẻ gắn ảnh điểm danh lên bảng; ngồi vào thảm trò chuyện thời tiết và chủ đề tuần.',
      evaluation_criteria: 'Trẻ vui vẻ vào lớp, 100% trẻ thực hiện đúng quy trình nề nếp tự phục vụ.',
    },
    {
      content_id: getContentId('NHA_TRE', 'MT 9'),
      routine_slot: 'RETURN_CHILD',
      title: 'Vệ sinh cá nhân, trao đổi phụ huynh & trả trẻ an toàn',
      objective: 'Trẻ chỉnh trang quần áo, đầu tóc sạch sẽ gọn gàng; lấy đúng tư trang cá nhân; chào cô, chào bạn và chỉ ra về khi người đón hợp lệ xuất hiện.',
      preparation: 'Khăn ấm sạch, lược chải tóc, sổ điểm danh hoặc ứng dụng Sorak giao nhận trẻ trên điện thoại giáo viên.',
      procedure: '1. Cô hỗ trợ trẻ rửa mặt, chải đầu, chỉnh trang quần áo ngay ngắn.\n2. Dành 5 phút nhận xét nhanh nỗ lực của trẻ trong ngày, khen ngợi hành vi tích cực.\n3. Đối chiếu danh sách ủy quyền đưa đón trên Sorak, bàn giao trẻ tận tay phụ huynh.',
      evaluation_criteria: 'Tuyệt đối an toàn 100% trong công tác giao nhận trẻ; trẻ chào hỏi lễ phép khi ra về.',
    },

    // ------------------------------------------------------------------------
    // 2. MORNING_EXERCISE (40 bài tập cho 10 CĐ lớn x 4 nhóm tuổi)
    // ------------------------------------------------------------------------
    // Nhà trẻ
    { content_id: getContentId('NHA_TRE', 'MT 1'), routine_slot: 'MORNING_EXERCISE', title: 'Thể dục sáng: Bé ngoan đến trường (Nhà trẻ)', objective: 'Khởi động ngày mới, phát triển cơ hô hấp, vẫy tay nhẹ nhàng theo nhạc.', preparation: 'Sân trường thoáng, nhạc bài hát Bé ngoan.', procedure: 'Hít thở sâu, giơ tay lên cao, vẫy tay chào cô, dậm chân tại chỗ.', evaluation_criteria: 'Trẻ hào hứng vận động.' },
    { content_id: getContentId('NHA_TRE', 'MT 1'), routine_slot: 'MORNING_EXERCISE', title: 'Thể dục sáng: Cái mũi xinh của bé (Nhà trẻ)', objective: 'Vận động với nơ múa cầm tay, nhận biết các giác quan cơ thể.', preparation: 'Nơ múa nhiều màu sắc.', procedure: 'Cầm nơ vẫy ngang ngực, chỉ vào mũi xinh, xoay cổ tay.', evaluation_criteria: 'Trẻ phối hợp tay mắt nhịp nhàng.' },
    { content_id: getContentId('NHA_TRE', 'MT 1'), routine_slot: 'MORNING_EXERCISE', title: 'Thể dục sáng: Yêu mẹ yêu ba (Nhà trẻ)', objective: 'Vận động với gậy thể dục mini, tập cơ lưng bụng.', preparation: 'Gậy nhựa màu đỏ, vàng.', procedure: 'Hai tay nâng gậy lên cao, cúi gập người chạm mũi chân, đứng thẳng.', evaluation_criteria: 'Trẻ giữ chắc gậy khi tập.' },
    { content_id: getContentId('NHA_TRE', 'MT 1'), routine_slot: 'MORNING_EXERCISE', title: 'Thể dục sáng: Em làm thợ xây (Nhà trẻ)', objective: 'Tập các động tác mô phỏng chú thợ xây với bông tua cổ động.', preparation: 'Bông tua kim tuyến.', procedure: 'Động tác giã vôi, xây tường nhịp nhàng theo lời bài hát.', evaluation_criteria: 'Trẻ thực hiện động tác dứt khoát.' },
    { content_id: getContentId('NHA_TRE', 'MT 1'), routine_slot: 'MORNING_EXERCISE', title: 'Thể dục sáng: Gà con đi lon ton (Nhà trẻ)', objective: 'Vận động với vòng thể dục nhựa, rèn luyện bước đi nhịp nhàng.', preparation: 'Vòng nhựa đường kính 30cm.', procedure: 'Cầm vòng lắc lư sang 2 bên, bước chân theo nhịp gõ.', evaluation_criteria: 'Trẻ vui vẻ bắt chước tiếng gà.' },
    { content_id: getContentId('NHA_TRE', 'MT 1'), routine_slot: 'MORNING_EXERCISE', title: 'Thể dục sáng: Cây cao hoa đẹp (Nhà trẻ)', objective: 'Vận động cầm cành hoa đào/mai, vươn người đón nắng.', preparation: 'Cành hoa lụa nhỏ.', procedure: 'Giơ hoa lên cao, cúi xuống ngắm hoa, xoay tròn vỗ tay.', evaluation_criteria: 'Trẻ tự tin múa hoa.' },
    { content_id: getContentId('NHA_TRE', 'MT 1'), routine_slot: 'MORNING_EXERCISE', title: 'Thể dục sáng: Bé lái ô tô (Nhà trẻ)', objective: 'Tập vận động với vô lăng đồ chơi, mô phỏng tài xế lái xe.', preparation: 'Vô lăng nhựa mini.', procedure: 'Hai tay xoay vô lăng, chạy bước nhỏ, dừng lại khi có hiệu lệnh.', evaluation_criteria: 'Trẻ phản xạ nhanh theo tiếng còi.' },
    { content_id: getContentId('NHA_TRE', 'MT 1'), routine_slot: 'MORNING_EXERCISE', title: 'Thể dục sáng: Mưa rơi tí tách (Nhà trẻ)', objective: 'Vận động với chuông lắc, cảm nhận nhịp điệu mưa rơi.', preparation: 'Chuông lắc xúc xắc.', procedure: 'Lắc chuông trên cao, lắc chuông dưới thấp, vỗ tay reo vui.', evaluation_criteria: 'Trẻ hào hứng gõ đệm.' },
    { content_id: getContentId('NHA_TRE', 'MT 1'), routine_slot: 'MORNING_EXERCISE', title: 'Thể dục sáng: Bé ăn ngoan chóng lớn (Nhà trẻ)', objective: 'Vận động với quả bóng cao su mềm, rèn sức mạnh cơ bắp tay.', preparation: 'Quả bóng nhựa mềm.', procedure: 'Nâng bóng qua đầu, chuyền bóng bằng 2 tay, ngồi xổm đứng lên.', evaluation_criteria: 'Trẻ không làm rơi bóng.' },
    { content_id: getContentId('NHA_TRE', 'MT 1'), routine_slot: 'MORNING_EXERCISE', title: 'Thể dục sáng: Bé yêu Bác Hồ (Nhà trẻ)', objective: 'Vận động cầm cờ đỏ sao vàng vẫy chào ngày mới.', preparation: 'Cờ đỏ sao vàng mini.', procedure: 'Vẫy cờ nhịp nhàng theo bài hát Em mơ gặp Bác Hồ.', evaluation_criteria: 'Trẻ nghiêm túc vẫy cờ.' },

    // Khối Mầm
    { content_id: getContentId('MAM', 'MT 1'), routine_slot: 'MORNING_EXERCISE', title: 'Thể dục sáng: Vui chân đến trường (Khối Mầm)', objective: 'Tập bài thể dục tay không, rèn tính trật tự hàng lối.', preparation: 'Sân trường kẻ vạch đứng.', procedure: 'Tập các động tác tay, chân, bụng, bật nhảy theo nhịp đếm 1-2.', evaluation_criteria: 'Trẻ đứng thẳng hàng.' },
    { content_id: getContentId('MAM', 'MT 1'), routine_slot: 'MORNING_EXERCISE', title: 'Thể dục sáng: Bé khỏe mỗi ngày (Khối Mầm)', objective: 'Vận động với nơ múa cầm tay, phát triển cơ vai ngực.', preparation: 'Nơ vải lụa xanh đỏ.', procedure: 'Hai tay đưa ngang, lên cao, gập trước ngực theo điệu nhạc.', evaluation_criteria: 'Động tác chuẩn xác theo nhịp.' },
    { content_id: getContentId('MAM', 'MT 1'), routine_slot: 'MORNING_EXERCISE', title: 'Thể dục sáng: Cả nhà thương nhau (Khối Mầm)', objective: 'Tập với gậy thể dục mini, rèn cơ lưng lườn.', preparation: 'Gậy thể dục 40cm.', procedure: 'Nghiêng người sang trái, sang phải, xoay hông.', evaluation_criteria: 'Trẻ không va chạm bạn bên cạnh.' },
    { content_id: getContentId('MAM', 'MT 1'), routine_slot: 'MORNING_EXERCISE', title: 'Thể dục sáng: Cháu yêu cô chú công nhân (Khối Mầm)', objective: 'Vận động với bông tua cổ động theo bài hát ngành nghề.', preparation: 'Bông tua 2 màu.', procedure: 'Động tác nhịp nhàng, giơ cao và vẫy chào.', evaluation_criteria: 'Trẻ hào hứng, đều tay.' },
    { content_id: getContentId('MAM', 'MT 1'), routine_slot: 'MORNING_EXERCISE', title: 'Thể dục sáng: Chú voi con ở Bản Đôn (Khối Mầm)', objective: 'Tập với vòng thể dục nhựa, bước nhún chân nhịp nhàng.', preparation: 'Vòng nhựa thể dục.', procedure: 'Cầm vòng phía trước, nghiêng người, nhún gối.', evaluation_criteria: 'Trẻ nhún chân đúng nhịp.' },
    { content_id: getContentId('MAM', 'MT 1'), routine_slot: 'MORNING_EXERCISE', title: 'Thể dục sáng: Mùa xuân của bé (Khối Mầm)', objective: 'Vận động cầm cành hoa mai hoa đào, biểu diễn rộn ràng.', preparation: 'Cành hoa lụa.', procedure: 'Múa hoa kết hợp xoay người và nhảy chân sáo.', evaluation_criteria: 'Trẻ biểu cảm tươi vui.' },
    { content_id: getContentId('MAM', 'MT 1'), routine_slot: 'MORNING_EXERCISE', title: 'Thể dục sáng: Bác tài xế tí hon (Khối Mầm)', objective: 'Tập với vô lăng đồ chơi, rèn phản xạ dừng chạy.', preparation: 'Vô lăng nhựa.', procedure: 'Xoay vô lăng, chạy vòng tròn, phanh xe theo tiếng còi.', evaluation_criteria: 'Tuân thủ hiệu lệnh cô giáo.' },
    { content_id: getContentId('MAM', 'MT 1'), routine_slot: 'MORNING_EXERCISE', title: 'Thể dục sáng: Cho tôi đi làm mưa với (Khối Mầm)', objective: 'Tập với xắc xô, kết hợp bật nhảy tại chỗ.', preparation: 'Xắc xô cầm tay.', procedure: 'Gõ xắc xô theo tiết tấu, bật nhảy cao tiếp đất êm.', evaluation_criteria: 'Trẻ bật tiếp đất nhẹ nhàng.' },
    { content_id: getContentId('MAM', 'MT 1'), routine_slot: 'MORNING_EXERCISE', title: 'Thể dục sáng: Bữa ăn ngon lành (Khối Mầm)', objective: 'Vận động với quả bóng thể dục, phối hợp toàn thân.', preparation: 'Bóng nhựa nhiều màu.', procedure: 'Cầm bóng bằng 2 tay đưa lên cao, cúi gập, chuyền bóng.', evaluation_criteria: 'Trẻ giữ bóng thăng bằng.' },
    { content_id: getContentId('MAM', 'MT 1'), routine_slot: 'MORNING_EXERCISE', title: 'Thể dục sáng: Nhớ ơn Bác Hồ (Khối Mầm)', objective: 'Vận động cầm cờ Tổ quốc nghiêm trang, đều đặn.', preparation: 'Cờ đỏ sao vàng.', procedure: 'Động tác giơ cờ chào, diễu hành quanh sân trường.', evaluation_criteria: 'Đội hình hàng lối ngay ngắn.' },

    // Khối Chồi
    { content_id: getContentId('CHOI', 'MT 1'), routine_slot: 'MORNING_EXERCISE', title: 'Thể dục sáng: Hân hoan ngày tựu trường (Khối Chồi)', objective: 'Động tác tay không dứt khoát, xếp hàng giãn cách cự ly 1 sải tay.', preparation: 'Vạch kẻ sơn chuẩn.', procedure: 'Khởi động xoay các khớp, tập 4 bài tập cơ bản tay, chân, bụng, bật.', evaluation_criteria: 'Trẻ tự điều chỉnh khoảng cách hàng.' },
    { content_id: getContentId('CHOI', 'MT 1'), routine_slot: 'MORNING_EXERCISE', title: 'Thể dục sáng: Đôi bàn tay khéo léo (Khối Chồi)', objective: 'Vận động với nơ múa tay, phối hợp chéo tay nhịp nhàng.', preparation: 'Nơ lụa cầm tay.', procedure: 'Động tác chéo tay trước ngực, vươn cao, xoay người 180 độ.', evaluation_criteria: 'Động tác đều và dứt khoát.' },
    { content_id: getContentId('CHOI', 'MT 1'), routine_slot: 'MORNING_EXERCISE', title: 'Thể dục sáng: Tổ ấm yêu thương (Khối Chồi)', objective: 'Tập với gậy thể dục 50cm, phát triển cơ ngực và lườn.', preparation: 'Gậy thể dục nhựa.', procedure: 'Cầm 2 đầu gậy vươn thở, nghiêng lườn sâu sang hai bên.', evaluation_criteria: 'Giữ gậy ngang bằng vai.' },
    { content_id: getContentId('CHOI', 'MT 1'), routine_slot: 'MORNING_EXERCISE', title: 'Thể dục sáng: Nhịp điệu công trường (Khối Chồi)', objective: 'Tập với bông tua cổ động theo tiết tấu nhanh sôi động.', preparation: 'Bông tua kim tuyến.', procedure: 'Động tác bật tách khép chân kết hợp vung bông tua.', evaluation_criteria: 'Trẻ bắt kịp nhịp nhạc nhanh.' },
    { content_id: getContentId('CHOI', 'MT 1'), routine_slot: 'MORNING_EXERCISE', title: 'Thể dục sáng: Hành quân cùng chú bộ đội (Khối Chồi)', objective: 'Tập với vòng thể dục, động tác dậm chân đều bước khỏe khoắn.', preparation: 'Vòng thể dục.', procedure: 'Đội vòng lên vai như súng, dậm chân tại chỗ theo nhịp 1-2.', evaluation_criteria: 'Dậm chân dứt khoát, đúng nhịp.' },
    { content_id: getContentId('CHOI', 'MT 1'), routine_slot: 'MORNING_EXERCISE', title: 'Thể dục sáng: Hoa thơm bướm lượn (Khối Chồi)', objective: 'Vận động với cành hoa đào hoa mai, nhảy chân sáo uyển chuyển.', preparation: 'Cành hoa nghệ thuật.', procedure: 'Chạy bước nhỏ, nhảy chân sáo tạo vòng tròn hoa lớn.', evaluation_criteria: 'Trẻ di chuyển nhịp nhàng.' },
    { content_id: getContentId('CHOI', 'MT 1'), routine_slot: 'MORNING_EXERCISE', title: 'Thể dục sáng: Đèn đỏ đèn xanh (Khối Chồi)', objective: 'Tập với vô lăng thể dục, phản xạ theo đèn hiệu của cô.', preparation: 'Vô lăng nhựa và cờ tín hiệu.', procedure: 'Lái xe theo hiệu lệnh: Đèn xanh đi nhanh, đèn vàng đi chậm, đèn đỏ đứng im.', evaluation_criteria: '100% trẻ phản xạ đúng hiệu lệnh.' },
    { content_id: getContentId('CHOI', 'MT 1'), routine_slot: 'MORNING_EXERCISE', title: 'Thể dục sáng: Nắng sớm mai tươi sáng (Khối Chồi)', objective: 'Vận động với xắc xô, phát triển thể lực và sức bền.', preparation: 'Xắc xô thể dục.', procedure: 'Gõ xắc xô kết hợp nhảy lò cò đổi chân.', evaluation_criteria: 'Trẻ giữ thăng bằng tốt.' },
    { content_id: getContentId('CHOI', 'MT 1'), routine_slot: 'MORNING_EXERCISE', title: 'Thể dục sáng: Thể lực khỏe mạnh (Khối Chồi)', objective: 'Tập với bóng thể dục, bật nhảy qua bóng.', preparation: 'Bóng cao su tiêu chuẩn.', procedure: 'Đặt bóng xuống đất, bật nhảy chụm tách chân qua bóng.', evaluation_criteria: 'Tiếp đất bằng 2 chân an toàn.' },
    { content_id: getContentId('CHOI', 'MT 1'), routine_slot: 'MORNING_EXERCISE', title: 'Thể dục sáng: Non sông gấm vóc (Khối Chồi)', objective: 'Vận động cầm cờ đỏ sao vàng diễu hành uy nghiêm.', preparation: 'Cờ Tổ quốc.', procedure: 'Diễu hành đội ngũ, nâng cờ và quay phải quay trái.', evaluation_criteria: 'Đội hình ngay ngắn thẳng tắp.' },

    // Khối Lá
    { content_id: getContentId('LA', 'MT 1'), routine_slot: 'MORNING_EXERCISE', title: 'Thể dục sáng: Vươn cao búp măng non (Khối Lá)', objective: 'Bài tập thể dục Aerobic khởi động tay không theo nhạc hiện đại.', preparation: 'Hệ thống âm thanh sân trường.', procedure: 'Các động tác bật nhảy, vung tay, đá chân dứt khoát chuẩn xác.', evaluation_criteria: 'Động tác đồng đều, tự tin.' },
    { content_id: getContentId('LA', 'MT 1'), routine_slot: 'MORNING_EXERCISE', title: 'Thể dục sáng: Nhịp điệu tuổi thơ (Khối Lá)', objective: 'Vận động với nơ múa đôi, tạo hình đội hình hoa 4 cánh.', preparation: 'Nơ múa 2 tay.', procedure: 'Chuyển đội hình từ 4 hàng dọc sang 4 vòng tròn xoay.', evaluation_criteria: 'Trẻ chuyển đội hình thuần thục.' },
    { content_id: getContentId('LA', 'MT 1'), routine_slot: 'MORNING_EXERCISE', title: 'Thể dục sáng: Gia đình hạnh phúc (Khối Lá)', objective: 'Tập với gậy thể dục 60cm, uốn dẻo và phát triển cơ toàn thân.', preparation: 'Gậy thể dục chuẩn.', procedure: 'Đưa gậy ra sau lưng, vặn mình, cúi sâu chạm đất.', evaluation_criteria: 'Thực hiện biên độ động tác tối đa.' },
    { content_id: getContentId('LA', 'MT 1'), routine_slot: 'MORNING_EXERCISE', title: 'Thể dục sáng: Hành khúc người lao động (Khối Lá)', objective: 'Vận động sôi nổi với bông tua cổ động, rèn luyện sức bền tim mạch.', preparation: 'Bông tua lớn.', procedure: 'Bật nhảy dạng khép chân 8 nhịp kết hợp đánh chéo bông tua.', evaluation_criteria: 'Trẻ hoàn thành trọn vẹn bài tập.' },
    { content_id: getContentId('LA', 'MT 1'), routine_slot: 'MORNING_EXERCISE', title: 'Thể dục sáng: Khúc quân hành biển đảo (Khối Lá)', objective: 'Tập với vòng thể dục, mô phỏng duyệt binh chú bộ đội Hải quân.', preparation: 'Vòng thể dục.', procedure: 'Động tác vác vòng duyệt binh, chuyển bước diễu hành hào hùng.', evaluation_criteria: 'Trẻ thể hiện khí thế trang nghiêm.' },
    { content_id: getContentId('LA', 'MT 1'), routine_slot: 'MORNING_EXERCISE', title: 'Thể dục sáng: Hương sắc mùa xuân (Khối Lá)', objective: 'Múa cành hoa xuân kết hợp di chuyển đội hình chữ V.', preparation: 'Cành hoa nghệ thuật.', procedure: 'Chạy bước nhỏ xếp hình chữ V đón mùa xuân về.', evaluation_criteria: 'Đội hình cân đối, hoa múa đều.' },
    { content_id: getContentId('LA', 'MT 1'), routine_slot: 'MORNING_EXERCISE', title: 'Thể dục sáng: Văn hóa giao thông an toàn (Khối Lá)', objective: 'Tập với vô lăng, mô phỏng chấp hành luật giao thông đường bộ.', preparation: 'Vô lăng và biển báo.', procedure: 'Xoay vô lăng, phân luồng giao thông theo nhạc kèn hiệu.', evaluation_criteria: 'Phản xạ chuẩn mực theo biển báo.' },
    { content_id: getContentId('LA', 'MT 1'), routine_slot: 'MORNING_EXERCISE', title: 'Thể dục sáng: Vũ điệu của gió và nước (Khối Lá)', objective: 'Vận động nhịp điệu với xắc xô và chuông lắc gõ phách.', preparation: 'Nhạc cụ gõ mini.', procedure: 'Gõ tiết tấu phối hợp nhịp nhàng theo nhịp điệu bài hát.', evaluation_criteria: 'Đúng tiết tấu, ăn khớp toàn đội.' },
    { content_id: getContentId('LA', 'MT 1'), routine_slot: 'MORNING_EXERCISE', title: 'Thể dục sáng: Hành trang vào Lớp Một (Khối Lá)', objective: 'Tập với bóng thể dục, nâng cao sức mạnh cơ bắp chuẩn bị vào lớp 1.', preparation: 'Bóng thể dục.', procedure: 'Tung bóng lên cao bắt bằng 2 tay, đập bóng xuống sàn bắt lại.', evaluation_criteria: '100% trẻ bắt được bóng.' },
    { content_id: getContentId('LA', 'MT 1'), routine_slot: 'MORNING_EXERCISE', title: 'Thể dục sáng: Tự hào thiếu nhi Việt Nam (Khối Lá)', objective: 'Nghi thức chào cờ và đồng diễn thể dục cờ đỏ sao vàng.', preparation: 'Cờ Tổ quốc cầm tay.', procedure: 'Xếp hình bản đồ Việt Nam, vẫy cờ nhịp nhàng theo điệu nhạc.', evaluation_criteria: 'Trẻ vô cùng hào hứng và tự hào.' },

    // ------------------------------------------------------------------------
    // 3. DIRECTED_STUDY (60 Giáo án Học Trọng Tâm: 10 NT, 15 Mầm, 15 Chồi, 20 Lá)
    // ------------------------------------------------------------------------
    // Nhà trẻ (10 bài)
    { content_id: getContentId('NHA_TRE', 'MT 5'), routine_slot: 'DIRECTED_STUDY', title: 'NBTN: Tên gọi của bé và các bạn trong lớp', objective: 'Trẻ nhận biết, phát âm đúng tên bản thân và 2-3 bạn trong lớp.', preparation: 'Ảnh của các bé, khung tranh hoa.', procedure: 'Cô giới thiệu ảnh từng bé, mời bé lên nhận ảnh và gọi tên.', evaluation_criteria: 'Trẻ chỉ đúng ảnh và nói tên.' },
    { content_id: getContentId('NHA_TRE', 'MT 2'), routine_slot: 'DIRECTED_STUDY', title: 'Vận động: Đi theo đường hẹp mang vật trên tay', objective: 'Trẻ giữ thăng bằng đi trong đường hẹp dài 2m không làm rơi đồ chơi.', preparation: 'Đường hẹp rộng 25cm kẻ sẵn, đồ chơi gấu bông.', procedure: 'Cô làm mẫu, hướng dẫn mắt nhìn thẳng, trẻ lần lượt thực hiện.', evaluation_criteria: 'Trẻ đi hết đường hẹp, không bước ra ngoài.' },
    { content_id: getContentId('NHA_TRE', 'MT 6'), routine_slot: 'DIRECTED_STUDY', title: 'NBPB: Phân biệt màu Đỏ và màu Vàng qua quả bóng', objective: 'Trẻ nhận biết, gọi đúng tên màu đỏ và màu vàng; chọn bóng theo yêu cầu.', preparation: 'Bóng đỏ, bóng vàng, rổ tương ứng.', procedure: 'Cho trẻ sờ bóng, gọi tên màu sắc, chơi trò chơi thả bóng vào rổ đúng màu.', evaluation_criteria: 'Trẻ thả đúng bóng vào rổ màu đỏ/vàng.' },
    { content_id: getContentId('NHA_TRE', 'MT 8'), routine_slot: 'DIRECTED_STUDY', title: 'Văn học: Kể chuyện "Đôi bạn tốt" (kết hợp rối tay)', objective: 'Trẻ chú ý lắng nghe cô kể chuyện, hiểu vịt con và gà con là bạn thân.', preparation: 'Rối tay gà con, vịt con, mô hình hồ nước.', procedure: 'Cô diễn rối, đàm thoại trích dẫn nội dung câu chuyện.', evaluation_criteria: 'Trẻ nhớ tên nhân vật trong truyện.' },
    { content_id: getContentId('NHA_TRE', 'MT 11'), routine_slot: 'DIRECTED_STUDY', title: 'Âm nhạc: Dạy hát "Con gà trống" & Nghe hát "Đàn gà con"', objective: 'Trẻ hát theo cô từ cuối câu, bắt chước tiếng gáy ò ó o.', preparation: 'Mũ múa gà trống, bài hát thu âm.', procedure: 'Cô hát mẫu, dạy trẻ hát từng câu, kết hợp làm động tác gà vỗ cánh.', evaluation_criteria: 'Trẻ vui vẻ hát và làm động tác.' },
    { content_id: getContentId('NHA_TRE', 'MT 11'), routine_slot: 'DIRECTED_STUDY', title: 'Tạo hình: Di màu sáp trên tranh chiếc ô tô tải', objective: 'Trẻ biết cầm bút sáp bằng tay phải, di màu trong lòng hình ô tô.', preparation: 'Tranh ô tô rỗng, sáp màu đỏ vàng.', procedure: 'Cô hướng dẫn cách cầm bút và di màu kín hình, trẻ thực hiện.', evaluation_criteria: 'Trẻ cầm bút đúng tay, di màu đều.' },
    { content_id: getContentId('NHA_TRE', 'MT 5'), routine_slot: 'DIRECTED_STUDY', title: 'NBTN: Trò chuyện về mẹ và đồ dùng ăn uống (cái thìa, cái ca)', objective: 'Trẻ nhận biết công việc của mẹ và tên gọi cái ca, cái thìa.', preparation: 'Ca uống nước, thìa ăn cơm thật.', procedure: 'Cho trẻ quan sát, sờ và gọi tên công dụng của thìa và ca.', evaluation_criteria: 'Trẻ nói đúng tên và công dụng vật dụng.' },
    { content_id: getContentId('NHA_TRE', 'MT 2'), routine_slot: 'DIRECTED_STUDY', title: 'Vận động: Bò chui qua cổng hẹp không chạm đầu', objective: 'Trẻ phối hợp tay chân nhịp nhàng bò qua cổng cao 45cm.', preparation: '3 cổng chui thể dục bọc xốp mềm.', procedure: 'Cô làm mẫu tư thế bò bằng bàn tay và cẳng chân, trẻ lần lượt bò.', evaluation_criteria: 'Trẻ bò khéo léo không làm đổ cổng.' },
    { content_id: getContentId('NHA_TRE', 'MT 6'), routine_slot: 'DIRECTED_STUDY', title: 'NBPB: Nhận biết To - Nhỏ qua 2 con gấu bông', objective: 'Trẻ nhận biết và phát âm đúng từ "To hơn" - "Nhỏ hơn".', preparation: 'Gấu bông to, gấu bông nhỏ.', procedure: 'Đặt 2 gấu cạnh nhau so sánh, cho gấu to đội mũ to, gấu nhỏ đội mũ nhỏ.', evaluation_criteria: 'Trẻ chỉ đúng gấu to và gấu nhỏ.' },
    { content_id: getContentId('NHA_TRE', 'MT 11'), routine_slot: 'DIRECTED_STUDY', title: 'Âm nhạc: Vận động theo bài hát "Cây bắp cải"', objective: 'Trẻ nhún nhảy nhịp nhàng theo giai điệu bài hát về cây bắp cải.', preparation: 'Cây bắp cải thật, nhạc nền.', procedure: 'Cô đàm thoại về cây rau bắp cải búp lá cuộn tròn, hướng dẫn vận động.', evaluation_criteria: 'Trẻ hào hứng múa theo cô.' },

    // Khối Mầm (15 bài)
    { content_id: getContentId('MAM', 'MT 2'), routine_slot: 'DIRECTED_STUDY', title: 'Thể dục: Đi trên vạch kẻ thẳng trên sàn nhà (dài 3m)', objective: 'Giữ thăng bằng đi hết đoạn thẳng dài 3m không bước lệch ra ngoài.', preparation: 'Vạch sơn trắng 10cm x 3m.', procedure: 'Cô hướng dẫn mắt nhìn thẳng phía trước, hai tay dang ngang thăng bằng.', evaluation_criteria: 'Trẻ đi tự tin, chân bước thẳng.' },
    { content_id: getContentId('MAM', 'MT 5'), routine_slot: 'DIRECTED_STUDY', title: 'Khám phá: Lớp học mầm non và các đồ dùng đồ chơi thân quen', objective: 'Nhận biết các góc chơi trong lớp và công dụng của từng loại đồ chơi.', preparation: 'Các góc chơi được bài trí gọn gàng.', procedure: 'Dẫn trẻ đi tham quan từng góc chơi, trò chuyện quy tắc sử dụng.', evaluation_criteria: 'Trẻ nhớ tên các góc chơi chính.' },
    { content_id: getContentId('MAM', 'MT 6'), routine_slot: 'DIRECTED_STUDY', title: 'Toán: Nhận biết số lượng 1 và 2, chọn thẻ số tương ứng', objective: 'Đếm đối tượng đến 2, nhận biết nhóm có 1 và 2 đồ vật.', preparation: 'Bộ đồ chơi con thỏ, củ cà rốt, thẻ số 1-2.', procedure: 'Đếm số lượng thỏ, đếm cà rốt tặng thỏ, gắn thẻ chấm tròn tương ứng.', evaluation_criteria: 'Trẻ đếm đúng từ 1 đến 2.' },
    { content_id: getContentId('MAM', 'MT 10'), routine_slot: 'DIRECTED_STUDY', title: 'Văn học: Thơ "Lời chào" (Dạy trẻ chào hỏi lễ phép)', objective: 'Trẻ đọc thuộc thơ diễn cảm, hiểu ý nghĩa lời chào là ngoan nhất.', preparation: 'Tranh minh họa bài thơ.', procedure: 'Cô đọc mẫu, trích dẫn đàm thoại, dạy trẻ đọc thơ từng câu.', evaluation_criteria: 'Trẻ đọc rõ ràng, thuộc bài thơ.' },
    { content_id: getContentId('MAM', 'MT 13'), routine_slot: 'DIRECTED_STUDY', title: 'Âm nhạc: Dạy hát "Vui đến trường" & Vỗ tay theo phách', objective: 'Hát đúng cao độ, giai điệu bài hát; vỗ tay nhịp nhàng theo phách.', preparation: 'Xắc xô, đàn organ.', procedure: 'Cô hát mẫu, dạy trẻ hát cả bài, hướng dẫn vỗ tay theo phách.', evaluation_criteria: 'Trẻ hát to rõ, vỗ đúng phách.' },
    { content_id: getContentId('MAM', 'MT 14'), routine_slot: 'DIRECTED_STUDY', title: 'Tạo hình: Dán lá cây tạo thành chiếc thuyền buồm', objective: 'Kỹ năng phết hồ mặt sau và dán lá cây tạo thành hình thuyền buồm.', preparation: 'Lá cây khô hình tam giác, hồ dán, giấy A4.', procedure: 'Cô làm mẫu cách sắp xếp lá cây và phết hồ vừa đủ, trẻ thực hiện.', evaluation_criteria: 'Sản phẩm dán ngay ngắn, sạch sẽ.' },
    { content_id: getContentId('MAM', 'MT 3'), routine_slot: 'DIRECTED_STUDY', title: 'Thể dục: Ném bóng trúng đích nằm ngang cách 1.5m', objective: 'Phối hợp tay mắt khi ném bóng vào rổ đặt nằm ngang cách 1.5m.', preparation: 'Bóng nhựa, 3 rổ đích.', procedure: 'Tư thế chân trước chân sau, tay cầm bóng ngang tầm mắt ném vào rổ.', evaluation_criteria: 'Trẻ ném trúng đích tối thiểu 2/3 quả.' },
    { content_id: getContentId('MAM', 'MT 5'), routine_slot: 'DIRECTED_STUDY', title: 'Toán: Phân biệt hình tròn và hình vuông qua trò chơi xếp hình', objective: 'Nhận biết đặc điểm hình tròn lăn được, hình vuông có cạnh góc không lăn được.', preparation: 'Khối hình tròn, vuông bằng gỗ.', procedure: 'Thử lăn hình trên mặt bàn, đếm số cạnh góc của hình vuông.', evaluation_criteria: 'Trẻ gọi đúng tên và phân biệt được 2 hình.' },
    { content_id: getContentId('MAM', 'MT 8'), routine_slot: 'DIRECTED_STUDY', title: 'Khám phá: Khám phá 5 giác quan trên cơ thể bé', objective: 'Nhận biết thị giác, thính giác, khứu giác, vị giác, xúc giác.', preparation: 'Tranh minh họa, các lọ hương hoa, đĩa hoa quả ngọt.', procedure: 'Trẻ nhắm mắt nếm vị ngọt, ngửi mùi thơm, sờ vật mềm mịn.', evaluation_criteria: 'Trẻ gọi tên đúng các giác quan.' },
    { content_id: getContentId('MAM', 'MT 10'), routine_slot: 'DIRECTED_STUDY', title: 'Văn học: Truyện "Gấu con chia quà" (Bài học sẻ chia)', objective: 'Hiểu nội dung câu chuyện, học tập lòng tốt chia quà cho bạn bè.', preparation: 'Sa bàn câu chuyện Gấu con chia quà.', procedure: 'Kể chuyện kết hợp di chuyển nhân vật sa bàn, đàm thoại bài học.', evaluation_criteria: 'Trẻ nêu được ý nghĩa chia sẻ.' },
    { content_id: getContentId('MAM', 'MT 2'), routine_slot: 'DIRECTED_STUDY', title: 'Thể dục: Bật nhảy tại chỗ và tiếp đất bằng 2 chân', objective: 'Nhún gối bật nhảy cao lên không trung và tiếp đất nhẹ nhàng.', preparation: 'Đệm xốp an toàn.', procedure: 'Cô làm mẫu: Nhún gối lấy đà, bật lên cao, rơi xuống nhún nhẹ gối.', evaluation_criteria: 'Tiếp đất không bị ngã.' },
    { content_id: getContentId('MAM', 'MT 5'), routine_slot: 'DIRECTED_STUDY', title: 'Toán: So sánh chiều dài 2 đối tượng (Dài hơn - Ngắn hơn)', objective: 'Biết đặt 1 đầu 2 băng giấy bằng nhau để so sánh chiều dài.', preparation: 'Băng giấy đỏ dài hơn băng giấy xanh.', procedure: 'Đặt chồng mép băng giấy, quan sát phần thừa ra để kết luận.', evaluation_criteria: 'Trẻ nói đúng từ "Dài hơn" - "Ngắn hơn".' },
    { content_id: getContentId('MAM', 'MT 8'), routine_slot: 'DIRECTED_STUDY', title: 'Khám phá STEAM: Thí nghiệm hạt đỗ nảy mầm trong bông ẩm', objective: 'Quan sát sự thay đổi của hạt đỗ sau khi được tưới nước và phơi sáng.', preparation: 'Đĩa nhựa, bông gòn, hạt đỗ xanh.', procedure: 'Trẻ tự tay đặt hạt đỗ lên bông gòn, dùng bình xịt tưới ẩm.', evaluation_criteria: 'Trẻ thích thú quan sát mầm xanh.' },
    { content_id: getContentId('MAM', 'MT 13'), routine_slot: 'DIRECTED_STUDY', title: 'Âm nhạc: Dạy hát "Cháu yêu cô chú công nhân"', objective: 'Hát diễn cảm, thể hiện tình cảm biết ơn người lao động.', preparation: 'Trang phục công nhân múa.', procedure: 'Cô hát mẫu, giảng giải nội dung bài hát, trẻ luyện hát nhóm.', evaluation_criteria: 'Trẻ hát thuộc và đúng nhịp.' },
    { content_id: getContentId('MAM', 'MT 14'), routine_slot: 'DIRECTED_STUDY', title: 'Tạo hình: Nặn cái vòng đeo tay bằng đất nặn nhiều màu', objective: 'Kỹ năng làm mềm đất, lăn dài và uốn cong nối 2 đầu thành vòng tròn.', preparation: 'Đất nặn, bảng con, khăn ẩm.', procedure: 'Cô hướng dẫn lăn dọc thỏi đất đều tay, gắn đính hai đầu khéo léo.', evaluation_criteria: 'Vòng tròn khép kín, màu sắc đẹp.' },

    // Khối Chồi (15 bài)
    { content_id: getContentId('CHOI', 'MT 2'), routine_slot: 'DIRECTED_STUDY', title: 'Thể dục: Đi thăng bằng trên ghế thể dục đầu đội túi cát', objective: 'Giữ thăng bằng thân người khi bước trên ghế cao 30cm đầu đội túi cát.', preparation: 'Ghế thể dục mầm non, túi cát 150g.', procedure: 'Mắt nhìn thẳng phía trước, bước đi thăng bằng đến đầu ghế hạ túi cát xuống.', evaluation_criteria: 'Túi cát không bị rơi khỏi đầu.' },
    { content_id: getContentId('CHOI', 'MT 6'), routine_slot: 'DIRECTED_STUDY', title: 'Toán: Đếm và nhận biết nhóm số lượng trong phạm vi 5', objective: 'Đếm thành thạo đến 5, nhận biết chữ số 5 và số thứ tự.', preparation: 'Mô hình 5 con cá, 5 con tôm, thẻ số 1-5.', procedure: 'Xếp tương ứng 1-1, so sánh số lượng hai nhóm và gắn thẻ số 5.', evaluation_criteria: 'Trẻ đếm chính xác và gắn đúng thẻ số.' },
    { content_id: getContentId('CHOI', 'MT 5'), routine_slot: 'DIRECTED_STUDY', title: 'Khám phá: Khám phá các bộ phận và chức năng của ngôi nhà', objective: 'Nhận biết mái nhà, tường nhà, cửa sổ, phòng khách, phòng ngủ.', preparation: 'Mô hình ngôi nhà 3D.', procedure: 'Đàm thoại về cấu trúc ngôi nhà và các biện pháp giữ an toàn tại nhà.', evaluation_criteria: 'Trẻ mô tả đúng các phòng sinh hoạt.' },
    { content_id: getContentId('CHOI', 'MT 10'), routine_slot: 'DIRECTED_STUDY', title: 'Chữ cái: Làm quen chữ cái o, ô, ơ qua tranh từ chủ đề', objective: 'Nhận diện mặt chữ và phát âm chuẩn chữ cái o, ô, ơ.', preparation: 'Thẻ chữ cái o ô ơ, tranh từ "Cô giáo", "Bác sĩ".', procedure: 'Phân tích cấu tạo nét chữ o cong tròn khép kín, ô có mũ, ơ có râu.', evaluation_criteria: 'Trẻ phát âm chuẩn không ngọng.' },
    { content_id: getContentId('CHOI', 'MT 13'), routine_slot: 'DIRECTED_STUDY', title: 'Âm nhạc: Dạy hát "Cả nhà thương nhau" & Gõ phách tre', objective: 'Hát đúng nhạc, gõ đệm phách tre theo tiết tấu nhịp nhàng.', preparation: 'Thanh phách tre cho từng trẻ.', procedure: 'Cô hướng dẫn tư thế cầm phách gõ nhịp 2/4 ăn khớp từng lời ca.', evaluation_criteria: 'Tiếng gõ phách đều và chuẩn xác.' },
    { content_id: getContentId('CHOI', 'MT 14'), routine_slot: 'DIRECTED_STUDY', title: 'Tạo hình: Xé dán đàn cá bơi dưới nước từ giấy màu', objective: 'Kỹ năng xé dải, xé bấm hình thân cá cong tròn và dán tạo bố cục.', preparation: 'Giấy màu thủ công, hồ dán, bút chì màu.', procedure: 'Xé hình thân cá, vây cá, sắp xếp bơi theo đàn và vẽ thêm rong rêu.', evaluation_criteria: 'Bố cục bức tranh hài hòa, sinh động.' },
    { content_id: getContentId('CHOI', 'MT 2'), routine_slot: 'DIRECTED_STUDY', title: 'Thể dục: Bật xa 35-40cm tiếp đất nhẹ nhàng', objective: 'Nhún gối vung tay bật xa tối thiểu 35cm qua vạch kẻ.', preparation: 'Vạch xuất phát và vạch đích 35cm-40cm.', procedure: 'Tư thế chuẩn bị: Đứng sát vạch, tay đưa ra sau nhún gối bật mạnh.', evaluation_criteria: 'Trẻ bật qua vạch không chạm chân vào vạch.' },
    { content_id: getContentId('CHOI', 'MT 6'), routine_slot: 'DIRECTED_STUDY', title: 'Toán: Tách gộp trong phạm vi 4 bằng các cách khác nhau', objective: 'Nhận biết các cách tách 4 đối tượng thành 2 nhóm: 1-3 và 2-2.', preparation: 'Hộp toán học 4 củ cà rốt.', procedure: 'Trẻ thực hành chia 4 củ cà rốt vào 2 rổ và kiểm tra kết quả.', evaluation_criteria: 'Nêu đúng các cách tách gộp.' },
    { content_id: getContentId('CHOI', 'MT 8'), routine_slot: 'DIRECTED_STUDY', title: 'Khám phá: Quá trình nảy mầm và phát triển của cây xanh', objective: 'Hiểu vòng đời: Hạt -> Mầm -> Cây con -> Cây trưởng thành ra hoa kết quả.', preparation: 'Video vòng đời cây đậu xanh, chậu cây thật.', procedure: 'Xem video tua nhanh quá trình phát triển, sắp xếp thẻ tranh thứ tự.', evaluation_criteria: 'Sắp xếp đúng trình tự phát triển của cây.' },
    { content_id: getContentId('CHOI', 'MT 10'), routine_slot: 'DIRECTED_STUDY', title: 'Văn học: Thơ "Bác bầu bác bí" (Tình đoàn kết gắn bó)', objective: 'Đọc thơ diễn cảm, hiểu bài học yêu thương đồng loại cùng chung Tổ quốc.', preparation: 'Tranh quả bầu, quả bí leo giàn.', procedure: 'Cô đọc diễn cảm, đàm thoại trích dẫn làm rõ ý thơ.', evaluation_criteria: 'Trẻ thuộc thơ và hiểu ý nghĩa đoàn kết.' },
    { content_id: getContentId('CHOI', 'MT 2'), routine_slot: 'DIRECTED_STUDY', title: 'Thể dục: Ném trúng đích thẳng đứng cự ly 2m', objective: 'Ném bóng bằng 1 tay trúng vòng tròn đích cao 1.2m cách 2m.', preparation: 'Bia đích gắn trên tường, túi cát.', procedure: 'Đứng chân trước chân sau, mắt ngắm đích ném dứt khoát.', evaluation_criteria: 'Bóng trúng vào vòng tròn bia đích.' },
    { content_id: getContentId('CHOI', 'MT 7'), routine_slot: 'DIRECTED_STUDY', title: 'Toán: Nhận biết quy luật sắp xếp xen kẽ A-B và tiếp tục chuỗi', objective: 'Phát hiện quy tắc 1 hoa đỏ - 1 hoa vàng và xếp tiếp chuỗi theo mẫu.', preparation: 'Chuỗi hạt hoặc hoa màu sắc.', procedure: 'Phân tích mẫu, cho trẻ chọn hoa xếp tiếp theo đúng quy luật.', evaluation_criteria: 'Xếp chính xác quy luật 5 chu kỳ.' },
    { content_id: getContentId('CHOI', 'MT 8'), routine_slot: 'DIRECTED_STUDY', title: 'Khám phá STEAM: Thí nghiệm vật nổi, vật chìm trong nước', objective: 'Dự đoán và thử nghiệm vật nào nổi (xốp, gỗ), vật nào chìm (sỏi, sắt).', preparation: 'Chậu nước trong, sỏi, thuyền xốp, thìa inox, thìa nhựa.', procedure: 'Cho trẻ dự đoán trước khi thả vào nước, quan sát và ghi chép bảng.', evaluation_criteria: 'Trẻ giải thích được tại sao vật nổi/chìm.' },
    { content_id: getContentId('CHOI', 'MT 13'), routine_slot: 'DIRECTED_STUDY', title: 'Âm nhạc: Dạy hát "Em đi qua ngã tư đường phố" & Vỗ tiết tấu chậm', objective: 'Hát vang giai điệu, vỗ tay theo tiết tấu chậm: Cứ 3 phách vỗ 1 phách.', preparation: 'Mô hình đèn giao thông, thanh phách.', procedure: 'Luyện tập kỹ năng gõ đệm tiết tấu chậm theo nhóm và cá nhân.', evaluation_criteria: 'Vỗ đúng tiết tấu bài hát giao thông.' },
    { content_id: getContentId('CHOI', 'MT 3'), routine_slot: 'DIRECTED_STUDY', title: 'Kỹ năng sống: Dạy trẻ kỹ năng tự cài cúc áo và gấp quần áo', objective: 'Trẻ tự luồn cúc qua khuy áo từ trên xuống dưới thẳng hàng, gấp áo phẳng.', preparation: 'Áo sơ mi có khuy cài cho từng trẻ.', procedure: 'Cô làm mẫu thao tác cài từng cúc đối xứng, hướng dẫn gấp áo 3 bước.', evaluation_criteria: '100% trẻ cài đúng cúc không bị lệch tà.' },

    // Khối Lá (20 bài)
    { content_id: getContentId('LA', 'MT 3'), routine_slot: 'DIRECTED_STUDY', title: 'Thể dục: Đi trên ghế thể dục đầu đội túi cát & Trò chơi Kéo co', objective: 'Giữ thăng bằng hoàn hảo khi bước trên ghế cao 40cm, tăng cường thể lực.', preparation: 'Ghế thể dục cao 40cm, dây kéo co chuẩn.', procedure: 'Từng trẻ thực hiện bài tập thăng bằng, sau đó chia 2 đội thi đấu kéo co.', evaluation_criteria: 'Trẻ thăng bằng tốt, hào hứng chơi kéo co.' },
    { content_id: getContentId('LA', 'MT 9'), routine_slot: 'DIRECTED_STUDY', title: 'Toán: Tách - gộp 10 đối tượng thành 2 nhóm bằng các cách khác nhau', objective: 'Nắm vững 5 cách tách gộp số 10: 1-9, 2-8, 3-7, 4-6, 5-5.', preparation: 'Bộ que tính hoặc hạt đếm 10 hạt cho mỗi trẻ.', procedure: 'Trẻ thực hành tách theo yêu cầu cô và ghi chép lại kết quả phép tính.', evaluation_criteria: 'Nêu thành thạo các cặp số gộp thành 10.' },
    { content_id: getContentId('LA', 'MT 11'), routine_slot: 'DIRECTED_STUDY', title: 'Khám phá STEAM: Dự án nước: Thí nghiệm vật chìm vật nổi & sự biến đổi', objective: 'Tìm hiểu lực đẩy Archimedes đơn giản qua nước ngọt và nước muối.', preparation: '2 cốc nước (ngọt và muối), 2 quả trứng gà.', procedure: 'Thả trứng vào nước ngọt (chìm), thả vào nước muối đậm (nổi), đàm thoại.', evaluation_criteria: 'Trẻ tò mò khám phá và giải thích hiện tượng.' },
    { content_id: getContentId('LA', 'MT 14'), routine_slot: 'DIRECTED_STUDY', title: 'Chữ cái: Làm quen chữ cái b, d, đ & Trò chơi chữ cái kỳ diệu', objective: 'Phân biệt nét thẳng đứng và nét cong tròn bên phải/trái của b, d, đ.', preparation: 'Thẻ chữ b, d, đ to và rổ chữ con.', procedure: 'So sánh điểm giống và khác nhau của 3 chữ cái qua trò chơi tìm chữ nhanh.', evaluation_criteria: 'Phát âm chuẩn và nhận dạng chính xác.' },
    { content_id: getContentId('LA', 'MT 21'), routine_slot: 'DIRECTED_STUDY', title: 'Âm nhạc: Dạy hát "Em đi qua ngã tư đường phố" & Gõ tiết tấu chậm', objective: 'Biểu diễn tự tin, gõ đệm tiết tấu chậm thuần thục kết hợp nhạc cụ.', preparation: 'Trống lục lạc, phách tre, chuông tam giác.', procedure: 'Hát đối đáp nam nữ, hòa tấu nhạc cụ gõ theo tiết tấu chậm.', evaluation_criteria: 'Biểu diễn ăn ý, hòa quyện nhịp nhàng.' },
    { content_id: getContentId('LA', 'MT 22'), routine_slot: 'DIRECTED_STUDY', title: 'Tạo hình: Vẽ tranh phong cảnh quê hương biển đảo Hòn Tre', objective: 'Vẽ phong cảnh biển, thuyền buồm, ngọn hải đăng có chiều sâu không gian xa gần.', preparation: 'Giấy A3, màu nước, cọ vẽ.', procedure: 'Phân tích bố cục tiền cảnh - hậu cảnh, trẻ pha màu nước và vẽ tranh.', evaluation_criteria: 'Tranh sáng tạo, màu sắc tươi sáng.' },
    { content_id: getContentId('LA', 'MT 7'), routine_slot: 'DIRECTED_STUDY', title: 'Kỹ năng sống: Quy tắc 5 ngón tay phòng tránh xâm hại cơ thể', objective: 'Hiểu rõ vùng đồ bơi là vùng bất khả xâm phạm, biết hét to và bỏ chạy khi gặp nguy.', preparation: 'Bàn tay 5 ngón minh họa, video hoạt hình.', procedure: 'Phân tích ý nghĩa từng ngón tay: Ngón cái (ôm), ngón trỏ (bắt tay)...', evaluation_criteria: 'Trẻ thuộc lòng quy tắc và ứng phó đúng.' },
    { content_id: getContentId('LA', 'MT 10'), routine_slot: 'DIRECTED_STUDY', title: 'Toán: Nhận biết các ngày trong tuần và mối quan hệ hôm qua, hôm nay, ngày mai', objective: 'Hiểu tuần có 7 ngày, xác định thứ tự từ thứ 2 đến Chủ nhật.', preparation: 'Mô hình vòng quay các ngày trong tuần.', procedure: 'Quay kim chỉ hôm nay, hỏi trẻ hôm qua là thứ mấy, ngày mai là thứ mấy.', evaluation_criteria: 'Trả lời nhanh và chính xác các ngày.' },
    { content_id: getContentId('LA', 'MT 14'), routine_slot: 'DIRECTED_STUDY', title: 'Chữ cái: Làm quen nhóm chữ cái l, m, n; so sánh cấu tạo nét', objective: 'Nhận biết l (1 nét thẳng), m (1 nét thẳng 2 nét móc), n (1 nét thẳng 1 nét móc).', preparation: 'Thẻ chữ l, m, n nổi nhám tay.', procedure: 'Cho trẻ sờ nét chữ nhám, phân tích cấu tạo và đọc chuẩn âm.', evaluation_criteria: 'Phát âm không bị ngọng l và n.' },
    { content_id: getContentId('LA', 'MT 11'), routine_slot: 'DIRECTED_STUDY', title: 'Khám phá: Biến đổi thời tiết 4 mùa và tác động của biến đổi khí hậu', objective: 'Nhận biết đặc trưng thời tiết Xuân - Hạ - Thu - Đông và ý thức bảo vệ môi trường.', preparation: 'Tranh ảnh 4 mùa, biểu đồ nhiệt độ.', procedure: 'Đàm thoại trang phục 4 mùa, thảo luận vì sao trái đất nóng lên.', evaluation_criteria: 'Trẻ nêu được giải pháp trồng cây xanh.' },
    { content_id: getContentId('LA', 'MT 4'), routine_slot: 'DIRECTED_STUDY', title: 'Thể dục: Chạy nhanh 18m trong 5-6 giây & Bật xa 50cm', objective: 'Đạt chuẩn 5 tuổi CS 6 (chạy 18m trong 5-6s) và CS 2 (bật xa 50cm).', preparation: 'Đồng hồ bấm giây chuyên dụng, thước đo vạch kẻ.', procedure: 'Khởi động kỹ cơ chân, từng cặp trẻ xuất phát chạy nhanh về đích.', evaluation_criteria: 'Thời gian chạy đạt chuẩn dưới 6 giây.' },
    { content_id: getContentId('LA', 'MT 8'), routine_slot: 'DIRECTED_STUDY', title: 'Toán: Đo độ dài các vật bằng một đơn vị đo và so sánh kết quả', objective: 'Biết dùng thước đo để đo chiều dài bàn học, kết luận số lần đo.', preparation: 'Thước đo 10cm, bàn học, bảng con.', procedure: 'Hướng dẫn cách đặt thước nối tiếp đầu mút và vạch bút chì đánh dấu.', evaluation_criteria: 'Nêu đúng số lần đo thước.' },
    { content_id: getContentId('LA', 'MT 13'), routine_slot: 'DIRECTED_STUDY', title: 'Văn học: Đọc thơ diễn cảm bài thơ "Hạt gạo làng ta" & Đàm thoại', objective: 'Hiểu sự vất vả của bác nông dân, đọc thơ bằng giọng xúc động.', preparation: 'Hình ảnh cánh đồng lúa chín vàng.', procedure: 'Cô đọc mẫu truyền cảm, đàm thoại về giọt mồ hôi của người gặt lúa.', evaluation_criteria: 'Đọc diễn cảm ngắt nghỉ đúng nhịp thơ.' },
    { content_id: getContentId('LA', 'MT 15'), routine_slot: 'DIRECTED_STUDY', title: 'Chữ cái: Tập tô đồ các nét cơ bản và làm quen bảng chữ cái tiếng Việt', objective: 'Ngồi đúng tư thế, cầm bút bằng 3 ngón tay tô trùng khít nét chấm mờ.', preparation: 'Vở tập tô chữ cái, bút chì 2B.', procedure: 'Cô làm mẫu trên bảng kẻ ô ly, trẻ ngồi nắn nót tô các nét cơ bản.', evaluation_criteria: 'Nét tô không chờm ra ngoài chấm mờ.' },
    { content_id: getContentId('LA', 'MT 19'), routine_slot: 'DIRECTED_STUDY', title: 'Khám phá: Tìm hiểu về chú bộ đội Hải quân và chủ quyền biển đảo', objective: 'Hiểu nhiệm vụ canh giữ vùng trời vùng biển của chú bộ đội đảo Hòn Tre.', preparation: 'Trang phục chú hải quân, mô hình tàu tuần tra.', procedure: 'Gặp gỡ giao lưu hoặc xem phóng sự về đời sống người lính hải quân.', evaluation_criteria: 'Trẻ bày tỏ lòng tự hào yêu quý chú hải quân.' },
    { content_id: getContentId('LA', 'MT 22'), routine_slot: 'DIRECTED_STUDY', title: 'Tạo hình: Làm đồ chơi phương tiện giao thông từ vỏ hộp tái chế', objective: 'Khéo léo kết hợp vỏ hộp sữa, nắp chai tạo thành ô tô, máy bay.', preparation: 'Vỏ hộp sữa, nắp chai nhựa, súng bắn keo (cô hỗ trợ).', procedure: 'Trẻ lên ý tưởng, gắn bánh xe nắp chai, trang trí thân xe bằng decal.', evaluation_criteria: 'Sản phẩm hoàn thiện chắc chắn, chuyển động được.' },
    { content_id: getContentId('LA', 'MT 12'), routine_slot: 'DIRECTED_STUDY', title: 'Toán: Định hướng không gian: Phía phải, phía trái của bạn đối diện', objective: 'Xác định chính xác vị trí tay phải - tay trái của người đứng đối diện.', preparation: 'Khăn quàng đỏ đeo tay phải.', procedure: 'Chơi trò chơi Gương soi: Bắt chước hành động của bạn đứng đối diện.', evaluation_criteria: 'Không bị nhầm lẫn chiều trái phải đối xứng.' },
    { content_id: getContentId('LA', 'MT 14'), routine_slot: 'DIRECTED_STUDY', title: 'Chữ cái: Làm quen chữ cái v, r; tìm chữ trong từ dưới tranh', objective: 'Nhận biết phát âm chuẩn chữ v và r (r rung lưỡi nhẹ).', preparation: 'Tranh "Vịnh Hạ Long", "Rừng tràm Trà Sư".', procedure: 'Phát âm so sánh âm v và r, gạch chân chữ cái trong đoạn văn ngắn.', evaluation_criteria: 'Phát âm chuẩn xác âm rung r.' },
    { content_id: getContentId('LA', 'MT 20'), routine_slot: 'DIRECTED_STUDY', title: 'Khám phá: Tham quan trường Tiểu học, làm quen bàn ghế lớp 1', objective: 'Quan sát lớp 1, nhận biết cặp sách, bảng con, hộp bút, háo hức đi học.', preparation: 'Chuyến tham quan thực tế trường Tiểu học Hòn Tre.', procedure: 'Thầy cô lớp 1 đón tiếp, trẻ được ngồi vào bàn học thử viết bảng con.', evaluation_criteria: 'Trẻ hào hứng, không còn tâm lý e sợ.' },
    { content_id: getContentId('LA', 'MT 21'), routine_slot: 'DIRECTED_STUDY', title: 'Âm nhạc: Hát múa "Cháu vẫn nhớ trường mầm non" & Chia tay ra trường', objective: 'Hát tràn ngập cảm xúc bài hát tri ân mái trường mầm non.', preparation: 'Lễ đài, bằng chứng nhận tốt nghiệp mầm non.', procedure: 'Hát múa đồng ca, trao hoa tặng cô giáo, chụp ảnh kỷ niệm.', evaluation_criteria: 'Trẻ biểu diễn tự tin, xúc động.' },

    // ------------------------------------------------------------------------
    // 4. CORNER_PLAY (20 hoạt động góc cho 4 nhóm tuổi x 5 góc)
    // ------------------------------------------------------------------------
    { content_id: getContentId('NHA_TRE', 'MT 10'), routine_slot: 'CORNER_PLAY', title: 'Góc Phân vai (Nhà trẻ): Bế em búp bê, cho búp bê ăn thìa, ru em ngủ', objective: 'Trẻ tập cử chỉ âu yếm búp bê, dùng thìa xúc cơm cho em ăn.', preparation: 'Búp bê, bát thìa đồ chơi, nôi ru ngủ.', procedure: 'Cô hướng dẫn trẻ bế em nhẹ nhàng, đút thìa và hát ru.', evaluation_criteria: 'Trẻ chơi vui vẻ, không ném búp bê.' },
    { content_id: getContentId('NHA_TRE', 'MT 3'), routine_slot: 'CORNER_PLAY', title: 'Góc Xây dựng (Nhà trẻ): Xếp chồng khối gỗ làm hàng rào, đường đi', objective: 'Xếp chồng 4-6 khối gỗ thăng bằng tạo lối đi cho gấu bông.', preparation: 'Khối gỗ màu sắc to nhỏ.', procedure: 'Trẻ nhặt từng khối gỗ đặt chồng khéo léo lên nhau.', evaluation_criteria: 'Khối gỗ xếp không bị đổ.' },
    { content_id: getContentId('NHA_TRE', 'MT 11'), routine_slot: 'CORNER_PLAY', title: 'Góc Nghệ thuật (Nhà trẻ): Di màu sáp trên giấy to, vò giấy vo tròn', objective: 'Rèn luyện cơ bàn tay qua hành động vò giấy và di màu tự do.', preparation: 'Giấy A3, bút sáp to, giấy mềm vò.', procedure: 'Trẻ vò giấy thành viên tròn ném vào rổ, di màu sáp nét tự do.', evaluation_criteria: 'Trẻ hứng thú tham gia.' },
    { content_id: getContentId('NHA_TRE', 'MT 8'), routine_slot: 'CORNER_PLAY', title: 'Góc Sách truyện (Nhà trẻ): Xem tranh to về con vật, chỉ hình cô hỏi', objective: 'Lật từng trang sách bìa cứng to, nhận biết con vật qua tiếng kêu.', preparation: 'Sách tranh khổ lớn con vật nuôi.', procedure: 'Cô ngồi cạnh lật sách cùng trẻ, hỏi con gì đây và cho trẻ chỉ.', evaluation_criteria: 'Trẻ lật sách nhẹ nhàng, không xé sách.' },
    { content_id: getContentId('NHA_TRE', 'MT 4'), routine_slot: 'CORNER_PLAY', title: 'Góc Thiên nhiên (Nhà trẻ): Nhặt lá vàng bỏ rổ, tưới nước bằng bình xịt', objective: 'Trẻ thích thú cầm bình xịt bóp nước tưới cho chậu cây cảnh con.', preparation: 'Bình xịt phun sương mini, rổ con.', procedure: 'Trẻ bóp bình xịt tưới lá, nhặt lá rụng bỏ vào rổ.', evaluation_criteria: 'Trẻ biết giữ gìn chậu cây.' },

    // Khối Mầm góc
    { content_id: getContentId('MAM', 'MT 11'), routine_slot: 'CORNER_PLAY', title: 'Góc Phân vai (Khối Mầm): Bán hàng hoa quả, bác sĩ khám bệnh cho gấu', objective: 'Đóng vai người bán hàng tươi cười chào khách, bác sĩ đo nhiệt độ cho gấu.', preparation: 'Quầy bán hoa quả nhựa, bộ đồ bác sĩ.', procedure: 'Trẻ phân vai người mua - người bán, bác sĩ kê đơn ân cần.', evaluation_criteria: 'Nói lời cảm ơn khi mua hàng.' },
    { content_id: getContentId('MAM', 'MT 5'), routine_slot: 'CORNER_PLAY', title: 'Góc Xây dựng (Khối Mầm): Xây vườn hoa lớp học, xếp chuồng cho thú', objective: 'Lắp ráp hàng rào bảo vệ, cắm hoa nhựa tạo thành vườn hoa.', preparation: 'Bộ xếp hình khối nhựa liên hoàn.', procedure: 'Trẻ cùng bạn xếp hàng rào bao quanh, đặt các con thú vào chuồng.', evaluation_criteria: 'Công trình xây dựng vững chãi.' },
    { content_id: getContentId('MAM', 'MT 14'), routine_slot: 'CORNER_PLAY', title: 'Góc Tạo hình (Khối Mầm): Lăn dài nặn chiếc vòng, tô màu tranh con vật', objective: 'Nặn các hình khối đơn giản và tô màu tranh con vật rỗng.', preparation: 'Đất nặn, tranh vẽ con gà con vịt, sáp màu.', procedure: 'Trẻ chọn góc bàn yêu thích, tự do sáng tạo sản phẩm.', evaluation_criteria: 'Sản phẩm hoàn thiện sạch đẹp.' },
    { content_id: getContentId('MAM', 'MT 10'), routine_slot: 'CORNER_PLAY', title: 'Góc Học tập (Khối Mầm): Nối tranh đôi, ghép hình 3-4 mảnh đơn giản', objective: 'Tìm các cặp hình giống nhau nối lại, ghép tranh 4 mảnh hoàn chỉnh.', preparation: 'Bộ tranh ghép gỗ 4 mảnh, bút dạ xóa được.', procedure: 'Trẻ tự mày mò xoay các mảnh ghép ăn khớp theo đường cắt.', evaluation_criteria: 'Ghép đúng bức tranh hoàn chỉnh.' },
    { content_id: getContentId('MAM', 'MT 8'), routine_slot: 'CORNER_PLAY', title: 'Góc Thiên nhiên (Khối Mầm): Thả lá thuyền vào nước, tưới cây hoa ban công', objective: 'Quan sát thuyền lá nổi trên mặt nước, tưới nước bồn hoa lớp.', preparation: 'Chậu nước sạch, lá cây, bình tưới hoa.', procedure: 'Thả lá làm thuyền thổi nhẹ cho thuyền bơi, tưới cây hoa ban công.', evaluation_criteria: 'Trẻ không làm vung vãi nước ra sàn.' },

    // Khối Chồi góc
    { content_id: getContentId('CHOI', 'MT 11'), routine_slot: 'CORNER_PLAY', title: 'Góc Phân vai (Khối Chồi): Quán ăn gia đình, phòng khám nha khoa, thợ may', objective: 'Giao tiếp vai chơi đa dạng, dùng tiền tượng trưng để thanh toán.', preparation: 'Bàn ghế quán ăn, thực đơn, tiền đồ chơi, máy khâu mini.', procedure: 'Phân công đầu bếp nấu ăn, phục vụ bàn, khách ăn gọi món lịch sự.', evaluation_criteria: 'Phối hợp tương tác giữa các vai chơi tốt.' },
    { content_id: getContentId('CHOI', 'MT 7'), routine_slot: 'CORNER_PLAY', title: 'Góc Xây dựng (Khối Chồi): Xây dựng bến xe khách, công viên cây xanh', objective: 'Quy hoạch khu bãi đỗ xe ô tô, đường đi bộ, cây cầu vồng.', preparation: 'Bộ gạch nhựa, mô hình ô tô xe máy, cây xanh.', procedure: 'Bàn bạc bản thiết kế trước khi xây, phân chia người xếp đường, người dựng cầu.', evaluation_criteria: 'Bố cục công trình có tính quy hoạch.' },
    { content_id: getContentId('CHOI', 'MT 14'), routine_slot: 'CORNER_PLAY', title: 'Góc Nghệ thuật (Khối Chồi): Xé dán hoa lá, nặn con vật có chi tiết phụ', objective: 'Nặn con mèo có tai, râu, đuôi uốn cong; xé dán hoa lá nhiều màu.', preparation: 'Đất nặn màu, dao cắt đất an toàn, giấy thủ công.', procedure: 'Trẻ tạo hình chi tiết tinh xảo hơn, gắn kết chắc chắn.', evaluation_criteria: 'Sản phẩm có nét sáng tạo riêng.' },
    { content_id: getContentId('CHOI', 'MT 6'), routine_slot: 'CORNER_PLAY', title: 'Góc Học tập (Khối Chồi): Đếm số lượng gắn thẻ số 1-5, lật trang đọc sách', objective: 'Tự lấy thẻ số gắn vào nhóm đồ vật tương ứng, xem sách truyện khoa học.', preparation: 'Bảng cài số lượng, góc thư viện mini.', procedure: 'Tự chọn sách truyện, ngồi ngay ngắn lật từng trang xem tranh.', evaluation_criteria: 'Cất sách về đúng ngăn sau khi xem.' },
    { content_id: getContentId('CHOI', 'MT 8'), routine_slot: 'CORNER_PLAY', title: 'Góc Khám phá (Khối Chồi): Thí nghiệm cây hút nước màu, chăm sóc luống rau', objective: 'Quan sát cành hoa cúc trắng đổi màu khi cắm vào lọ nước nhuộm màu.', preparation: '3 cốc nước pha màu thực phẩm, hoa cúc trắng.', procedure: 'Cắm hoa vào cốc nước màu, quan sát hiện tượng đổi màu sau vài giờ.', evaluation_criteria: 'Trẻ ghi nhận được kết quả đổi màu của cánh hoa.' },

    // Khối Lá góc
    { content_id: getContentId('LA', 'MT 16'), routine_slot: 'CORNER_PLAY', title: 'Góc Phân vai (Khối Lá): Siêu thị mini, văn phòng bưu điện, nhà hàng ẩm thực', objective: 'Tổ chức chuỗi liên kết dịch vụ: Mua hàng ở siêu thị -> Gửi bưu phẩm -> Ăn trưa.', preparation: 'Quầy thu ngân có máy tính tiền mã vạch, bao bì thư, tem bưu chính.', procedure: 'Trẻ điều phối hoạt động tự chủ, giao tiếp bằng ngôn ngữ chuẩn mực.', evaluation_criteria: 'Trẻ thể hiện vai chơi rất chuyên nghiệp.' },
    { content_id: getContentId('LA', 'MT 8'), routine_slot: 'CORNER_PLAY', title: 'Góc Xây dựng (Khối Lá): Xây ngã tư đường phố, trường tiểu học, ngọn hải đăng', objective: 'Xây dựng tổ hợp công trình quy mô lớn với đầy đủ biển báo và tín hiệu đèn.', preparation: 'Bộ đại khối lắp ghép, cột đèn tín hiệu, sa bàn ngã tư.', procedure: 'Thảo luận trưởng nhóm phân công thi công từng hạng mục công trình.', evaluation_criteria: 'Công trình đồ sộ, logic và thẩm mỹ cao.' },
    { content_id: getContentId('LA', 'MT 22'), routine_slot: 'CORNER_PLAY', title: 'Góc Nghệ thuật (Khối Lá): Làm đồ chơi tái chế, vẽ tranh triển lãm nghệ thuật', objective: 'Tự tạo phòng tranh mini, trưng bày sản phẩm tranh vẽ phong cảnh có khung.', preparation: 'Kẹp gỗ, dây treo tranh, các vật liệu vỏ sò ốc biển đảo.', procedure: 'Đính tranh lên dây treo triển lãm, thuyết minh tác phẩm cho khách tham quan.', evaluation_criteria: 'Phòng tranh phong phú, tự tin giới thiệu.' },
    { content_id: getContentId('LA', 'MT 15'), routine_slot: 'CORNER_PLAY', title: 'Góc Học tập (Khối Lá): Ghép chữ cái thành tên mình, tách gộp hạt số 10', objective: 'Dùng thẻ chữ cái rời ghép thành họ tên của bản thân, thực hành bảng tách gộp.', preparation: 'Hộp chữ cái nam châm, bảng từ, hạt cúc bàn tính.', procedure: 'Tự ghép tên mình lên bảng từ, làm phiếu bài tập toán tư duy.', evaluation_criteria: 'Ghép chính xác tên không bị sai dấu.' },
    { content_id: getContentId('LA', 'MT 11'), routine_slot: 'CORNER_PLAY', title: 'Góc STEAM (Khối Lá): Thí nghiệm lọc nước bằng cát sỏi than hoạt tính', objective: 'Chế tạo mô hình lọc nước tầng lọc tự nhiên, quan sát nước đục trở nên trong.', preparation: 'Chai nhựa cắt đáy, bông gòn, than hoạt tính, cát thô, sỏi cuội.', procedure: 'Xếp các lớp vật liệu theo thứ tự, đổ nước đục vào và hứng nước trong.', evaluation_criteria: 'Trẻ hiểu nguyên lý lọc nước tự nhiên.' },

    // ------------------------------------------------------------------------
    // 5. OUTDOOR_PLAY (16 hoạt động ngoài trời: 4 hoạt động x 4 nhóm tuổi)
    // ------------------------------------------------------------------------
    { content_id: getContentId('NHA_TRE', 'MT 2'), routine_slot: 'OUTDOOR_PLAY', title: 'Ngoài trời (Nhà trẻ): Quan sát cây xanh sân trường, đàn kiến bò', objective: 'Trẻ hít thở không khí trong lành, quan sát kiến bò trên thân cây.', preparation: 'Khu vực gốc cây râm mát, an toàn.', procedure: 'Cô dắt trẻ đi dạo quanh sân, chỉ vào thân cây cho trẻ nhìn kiến bò.', evaluation_criteria: 'Trẻ không ngắt lá bẻ cành.' },
    { content_id: getContentId('NHA_TRE', 'MT 3'), routine_slot: 'OUTDOOR_PLAY', title: 'TCVĐ (Nhà trẻ): Trò chơi dân gian "Bóng tròn to" & "Trời nắng trời mưa"', objective: 'Cùng cô nắm tay xếp thành vòng tròn to nhỏ, chạy nhanh vào chỗ trú mưa.', preparation: 'Sân chơi sạch rộng.', procedure: 'Cô bắt nhịp bài hát Bóng tròn to, làm động tác mưa rơi cho trẻ chạy trú.', evaluation_criteria: 'Trẻ chơi vui, phản xạ nhanh.' },
    { content_id: getContentId('NHA_TRE', 'MT 2'), routine_slot: 'OUTDOOR_PLAY', title: 'Chơi tự do (Nhà trẻ): Nhặt lá rụng bỏ thùng rác, chơi cầu trượt thấp', objective: 'Vận động leo trèo cầu trượt thấp có cô đỡ, tập thói quen nhặt rác.', preparation: 'Cầu trượt nhà trẻ, thùng rác con.', procedure: 'Cô hướng dẫn trẻ lần lượt leo cầu trượt và đón ở chân cầu trượt.', evaluation_criteria: 'Tuyệt đối an toàn cho trẻ.' },
    { content_id: getContentId('NHA_TRE', 'MT 1'), routine_slot: 'OUTDOOR_PLAY', title: 'TCVĐ (Nhà trẻ): Trò chơi "Gà mẹ và gà con"', objective: 'Trẻ chạy theo cô giả làm gà mẹ kiếm mồi, ngồi thụp xuống khi có diều hâu.', preparation: 'Mũ gà mẹ cho cô, mũ gà con cho trẻ.', procedure: 'Gà con chạy lon ton kiếm mồi, nghe tiếng diều hâu chạy nhanh về bên mẹ.', evaluation_criteria: 'Trẻ hào hứng kêu chíp chíp.' },

    // Mầm ngoài trời
    { content_id: getContentId('MAM', 'MT 8'), routine_slot: 'OUTDOOR_PLAY', title: 'Ngoài trời (Khối Mầm): Quan sát bầu trời có mây, xe cộ qua lại cổng trường', objective: 'Quan sát màu sắc mây trời, nhận biết xe máy ô tô đi trên đường.', preparation: 'Khu vực sân trường nhìn ra cổng an toàn.', procedure: 'Cô đàm thoại về thời tiết hôm nay, hỏi trẻ vừa thấy xe gì chạy qua.', evaluation_criteria: 'Trẻ trả lời trọn câu rõ ý.' },
    { content_id: getContentId('MAM', 'MT 2'), routine_slot: 'OUTDOOR_PLAY', title: 'TCVĐ (Khối Mầm): Trò chơi "Mèo đuổi chuột" & "Dung dăng dung dẻ"', objective: 'Rèn luyện phản xạ chạy nhanh luồn qua các hang không để mèo bắt.', preparation: 'Địa điểm sân chơi rộng rãi.', procedure: 'Trẻ nắm tay giơ cao làm hang, 1 trẻ làm mèo, 1 trẻ làm chuột luồn lách.', evaluation_criteria: 'Trẻ chơi đúng luật, vui vẻ.' },
    { content_id: getContentId('MAM', 'MT 14'), routine_slot: 'OUTDOOR_PLAY', title: 'Chơi tự do (Khối Mầm): Vẽ phấn trên sân trường, chơi bập bênh dưới bóng cây', objective: 'Dùng phấn màu vẽ tự do các hình tròn, mặt trời trên nền gạch sân.', preparation: 'Hộp phấn màu nhiều màu, xô nước lau.', procedure: 'Trẻ tự do chọn chỗ vẽ tranh phấn, chơi xích đu bập bênh.', evaluation_criteria: 'Trẻ chia sẻ đồ chơi cùng bạn.' },
    { content_id: getContentId('MAM', 'MT 2'), routine_slot: 'OUTDOOR_PLAY', title: 'TCVĐ (Khối Mầm): Trò chơi "Ô tô và chim sẻ"', objective: 'Trẻ đóng vai chim sẻ nhặt thóc trên đường, ô tô bấm còi chạy nhanh lên vỉa hè.', preparation: 'Vô lăng cho cô, mũ chim sẻ.', procedure: 'Chim sẻ nhảy kiếm ăn, nghe còi pim pim bay nhanh về tổ.', evaluation_criteria: 'Trẻ chạy nhanh về đúng tổ.' },

    // Chồi ngoài trời
    { content_id: getContentId('CHOI', 'MT 8'), routine_slot: 'OUTDOOR_PLAY', title: 'Ngoài trời (Khối Chồi): Đo bóng râm buổi sáng, cấu tạo rễ cây bàng', objective: 'Khám phá sự thay đổi chiều dài bóng râm khi mặt trời lên cao.', preparation: 'Phấn đánh dấu bóng râm, cây bàng sân trường.', procedure: 'Dùng phấn đánh dấu đầu bóng râm lúc 8h30 và 9h30 để so sánh.', evaluation_criteria: 'Trẻ phát hiện bóng râm ngắn lại khi trưa.' },
    { content_id: getContentId('CHOI', 'MT 2'), routine_slot: 'OUTDOOR_PLAY', title: 'TCVĐ (Khối Chồi): Trò chơi "Rồng rắn lên mây" & "Bịt mắt bắt dê"', objective: 'Phối hợp di chuyển cả hàng lượn sóng không đứt khúc đuôi.', preparation: 'Khăn bịt mắt mềm.', procedure: 'Cả nhóm vừa đi vừa hát đồng dao Rồng rắn lên mây, thầy thuốc đuổi bắt khúc đuôi.', evaluation_criteria: 'Giữ hàng rồng rắn không bị đứt.' },
    { content_id: getContentId('CHOI', 'MT 3'), routine_slot: 'OUTDOOR_PLAY', title: 'Chơi tự do (Khối Chồi): Đi xe đạp 3 bánh, đắp lâu đài cát tại khu vui chơi', objective: 'Đạp xe vòng quanh sân theo làn đường, dùng khuôn đắp lâu đài cát.', preparation: 'Xe đạp 3 bánh, xẻng xô khu cát nước.', procedure: 'Trẻ đi xe đúng chiều quy định, cùng bạn đắp lâu đài cát.', evaluation_criteria: 'Trẻ rửa tay sạch sẽ sau khi chơi cát.' },
    { content_id: getContentId('CHOI', 'MT 2'), routine_slot: 'OUTDOOR_PLAY', title: 'TCVĐ (Khối Chồi): Trò chơi dân gian "Kéo co" tập thể', objective: 'Phát huy tinh thần đoàn kết và sức mạnh đồng đội.', preparation: 'Dây thừng kéo co có buộc dải đỏ giữa vạch.', procedure: 'Hai đội đứng đối diện cầm chắc dây, kéo hết sức khi có hiệu lệnh còi.', evaluation_criteria: 'Trẻ chơi nhiệt tình, chấp nhận kết quả thắng thua.' },

    // Lá ngoài trời
    { content_id: getContentId('LA', 'MT 11'), routine_slot: 'OUTDOOR_PLAY', title: 'Ngoài trời (Khối Lá): Quan sát hướng gió qua chong chóng, nhận biết giông bão', objective: 'Xác định hướng gió thổi qua chuyển động của chong chóng và ngọn cây.', preparation: 'Chong chóng giấy cho từng trẻ.', procedure: 'Cầm chong chóng giơ cao, quan sát chiều quay nhanh chậm của gió.', evaluation_criteria: 'Trẻ chỉ đúng hướng gió thổi.' },
    { content_id: getContentId('LA', 'MT 4'), routine_slot: 'OUTDOOR_PLAY', title: 'TCVĐ (Khối Lá): Trò chơi "Cướp cờ" & "Chạy tiếp sức 18m"', objective: 'Rèn luyện phản xạ nhanh nhạy, chiến thuật đánh lừa đối phương cướp cờ về đích.', preparation: 'Cờ đỏ đặt ở giữa sân, 2 vạch xuất phát.', procedure: 'Cô gọi số nào thì số đó của 2 đội chạy nhanh lên rình cờ cướp về đội.', evaluation_criteria: 'Trẻ chạy nhanh nhẹn, tuân thủ luật.' },
    { content_id: getContentId('LA', 'MT 22'), routine_slot: 'OUTDOOR_PLAY', title: 'Chơi tự do (Khối Lá): Đá bóng mini sân cỏ nhân tạo, tưới vườn thực nghiệm', objective: 'Đá bóng theo nhóm nhỏ, tưới nước luống rau cải thực nghiệm của lớp.', preparation: 'Quả bóng đá mini, bình tưới nước có vòi sen.', procedure: 'Chia 2 đội đá bóng vào cầu môn mini, một nhóm tưới rau sạch.', evaluation_criteria: 'Trẻ phối hợp đồng đội ăn ý.' },
    { content_id: getContentId('LA', 'MT 2'), routine_slot: 'OUTDOOR_PLAY', title: 'TCVĐ (Khối Lá): Trò chơi "Nhảy bao bố" tiếp sức', objective: 'Kỹ năng giữ thăng bằng nhảy liên tục bằng 2 chân trong bao bố.', preparation: 'Bao bố sạch mềm cỡ trẻ em.', procedure: 'Chui hai chân vào bao bố, hai tay túm miệng bao nhảy nhanh về đích.', evaluation_criteria: 'Trẻ nhảy nhanh không bị vấp ngã.' },

    // ------------------------------------------------------------------------
    // 6. AFTERNOON_ACTIVITY (19 hoạt động chiều theo ý thích)
    // ------------------------------------------------------------------------
    { content_id: getContentId('NHA_TRE', 'MT 9'), routine_slot: 'AFTERNOON_ACTIVITY', title: 'Hoạt động chiều (Nhà trẻ): Ôn lại bài thơ buổi sáng & chơi trò ngón tay', objective: 'Trẻ đọc vuốt đuôi bài thơ, chơi trò ngón tay Con cua đá.', preparation: 'Chiếu thảm ngồi ấm.', procedure: 'Cô và trẻ cùng ngồi trò chuyện, đọc lại bài thơ sáng nay vừa học.', evaluation_criteria: 'Trẻ nhớ lời thơ và vui vẻ tương tác.' },
    { content_id: getContentId('NHA_TRE', 'MT 4'), routine_slot: 'AFTERNOON_ACTIVITY', title: 'Hoạt động chiều (Nhà trẻ): Rèn kỹ năng tự đi tất và xếp dép lên giá', objective: 'Tập xỏ chân vào tất, lấy dép đi vào chân và cất lên giá gọn gàng.', preparation: 'Tất chân của bé, giá dép lớp.', procedure: 'Cô làm mẫu thao tác xỏ tất từ mũi đến gót, trẻ tự thực hành.', evaluation_criteria: 'Trẻ đi đúng chiều chiếc dép.' },
    { content_id: getContentId('NHA_TRE', 'MT 8'), routine_slot: 'AFTERNOON_ACTIVITY', title: 'Hoạt động chiều (Nhà trẻ): Nghe cô kể chuyện ru ngủ dậy & vận động nhẹ', objective: 'Tỉnh ngủ sau giờ ngủ trưa, ăn bữa phụ chiều ngon miệng.', preparation: 'Bữa phụ sữa và bánh mì.', procedure: 'Bật nhạc nhẹ đánh thức trẻ, xoa bóp tay chân nhẹ nhàng, cho trẻ uống nước ấm.', evaluation_criteria: 'Trẻ tỉnh táo, không quấy khóc.' },
    { content_id: getContentId('NHA_TRE', 'MT 10'), routine_slot: 'AFTERNOON_ACTIVITY', title: 'Hoạt động chiều (Nhà trẻ): Trò chơi âm nhạc "Ai đoán đúng tiếng kêu"', objective: 'Lắng nghe băng thu tiếng kêu đoán tên con vật chó, mèo, vịt.', preparation: 'Loa bluetooth thu tiếng các con vật.', procedure: 'Bật tiếng kêu cho trẻ đoán và giả làm động tác của con vật đó.', evaluation_criteria: 'Trẻ đoán đúng con vật.' },

    // Mầm chiều
    { content_id: getContentId('MAM', 'MT 9'), routine_slot: 'AFTERNOON_ACTIVITY', title: 'Hoạt động chiều (Khối Mầm): Đố vui đoán tên con vật và các loại hoa', objective: 'Lắng nghe câu đố ngắn, suy luận nhanh để tìm ra câu trả lời đúng.', preparation: 'Tập câu đố vui lứa tuổi mầm non.', procedure: 'Cô đọc câu đố có vần điệu, trẻ giơ tay trả lời và nhận tràng pháo tay.', evaluation_criteria: 'Trẻ hào hứng giơ tay phát biểu.' },
    { content_id: getContentId('MAM', 'MT 4'), routine_slot: 'AFTERNOON_ACTIVITY', title: 'Hoạt động chiều (Khối Mầm): Rèn kỹ năng cài cúc áo và tự lau mặt', objective: 'Tự dùng khăn mặt sạch lau mắt, mũi, miệng, cằm sau khi ngủ dậy.', preparation: 'Khăn mặt ấm có ký hiệu riêng của từng trẻ.', procedure: 'Trẻ lấy đúng khăn có hình hoa/xe của mình, lau mặt theo đúng quy trình 4 bước.', evaluation_criteria: 'Mặt trẻ sạch sẽ, khăn phơi đúng móc.' },
    { content_id: getContentId('MAM', 'MT 10'), routine_slot: 'AFTERNOON_ACTIVITY', title: 'Hoạt động chiều (Khối Mầm): Làm quen bài hát tiếng Anh mầm non vui nhộn', objective: 'Làm quen các từ vựng tiếng Anh đơn giản: Hello, Goodbye, Apple, Cat.', preparation: 'Video ca nhạc tiếng Anh trẻ em.', procedure: 'Nghe bài hát Hello Song, hát theo và nhún nhảy theo nhân vật hoạt hình.', evaluation_criteria: 'Trẻ phát âm tự tin từ vựng mới.' },
    { content_id: getContentId('MAM', 'MT 11'), routine_slot: 'AFTERNOON_ACTIVITY', title: 'Hoạt động chiều (Khối Mầm): Chơi trò chơi tĩnh "Chi chi chành chành"', objective: 'Rèn luyện phản xạ nhanh của ngón tay khi nghe hiệu lệnh "Đóng sập vào".', preparation: 'Chơi theo từng nhóm 3-4 trẻ.', procedure: 'Trẻ đặt ngón tay vào lòng bàn tay bạn, đọc đồng dao và rút tay thật nhanh.', evaluation_criteria: 'Trẻ phản xạ kịp thời không bị nắm trúng.' },
    { content_id: getContentId('MAM', 'MT 12'), routine_slot: 'AFTERNOON_ACTIVITY', title: 'Hoạt động chiều (Khối Mầm): Nêu gương cuối tuần - Phát cờ bé ngoan thứ Sáu', objective: 'Nhận xét các hành vi tốt trong tuần: Ăn ngoan, không khóc nhè, biết chào cô.', preparation: 'Bảng bé ngoan, cờ đỏ cho từng trẻ.', procedure: 'Bình xét từng tổ, trẻ lên cắm cờ vào ô tên mình và được cô khen ngợi.', evaluation_criteria: 'Trẻ tự hào và có ý thức cố gắng.' },

    // Chồi chiều
    { content_id: getContentId('CHOI', 'MT 9'), routine_slot: 'AFTERNOON_ACTIVITY', title: 'Hoạt động chiều (Khối Chồi): Ôn luyện bài học buổi sáng & Giải câu đố thơ', objective: 'Củng cố kiến thức học tập buổi sáng qua các trò chơi tương tác vui vẻ.', preparation: 'Bảng tương tác hoặc tranh bài tập.', procedure: 'Cô nêu lại các câu hỏi học tập buổi sáng, trẻ lên thao tác trên bảng.', evaluation_criteria: 'Trẻ khắc sâu bài học đã học.' },
    { content_id: getContentId('CHOI', 'MT 3'), routine_slot: 'AFTERNOON_ACTIVITY', title: 'Hoạt động chiều (Khối Chồi): Rèn kỹ năng gấp áo, cuộn tất cá nhân', objective: 'Trẻ tự gấp phẳng chiếc áo thun của mình, cuộn tròn đôi tất bỏ vào ba lô.', preparation: 'Áo thun và tất của trẻ.', procedure: 'Trải áo phẳng, gấp 2 tay áo vào trong, gập đôi thân áo gọn gàng.', evaluation_criteria: 'Ba lô của trẻ được sắp xếp ngăn nắp.' },
    { content_id: getContentId('CHOI', 'MT 10'), routine_slot: 'AFTERNOON_ACTIVITY', title: 'Hoạt động chiều (Khối Chồi): Trò chơi chữ cái: Vòng quay kỳ diệu', objective: 'Quay vòng quay chữ cái, đọc to và tìm chữ cái giống chữ kim chỉ.', preparation: 'Vòng quay chữ cái o, ô, ơ, a, ă, â.', procedure: 'Trẻ lên quay vòng quay, kim dừng ở chữ nào trẻ phát âm to chữ đó.', evaluation_criteria: 'Đọc đúng mặt chữ cái.' },
    { content_id: getContentId('CHOI', 'MT 13'), routine_slot: 'AFTERNOON_ACTIVITY', title: 'Hoạt động chiều (Khối Chồi): Biểu diễn văn nghệ cuối tuần tại lớp', objective: 'Tự tin đứng trên sân khấu mini của lớp biểu diễn bài hát yêu thích.', preparation: 'Micro đồ chơi, trang phục hóa trang.', procedure: 'Từng nhóm trẻ đăng ký tiết mục hát, múa, đọc thơ biểu diễn cho cả lớp xem.', evaluation_criteria: 'Trẻ tự tin, có phong thái biểu diễn.' },
    { content_id: getContentId('CHOI', 'MT 11'), routine_slot: 'AFTERNOON_ACTIVITY', title: 'Hoạt động chiều (Khối Chồi): Sinh hoạt Nêu gương cắm cờ bé ngoan chiều thứ Sáu', objective: 'Tự nhận xét bản thân đã đạt tiêu chuẩn bé ngoan chưa, chúc mừng bạn đạt hoa.', preparation: 'Sổ bé ngoan, cờ hoa bé ngoan.', procedure: 'Cô tổng kết tuần, tuyên dương các bạn tiến bộ, trao phiếu bé ngoan mang về.', evaluation_criteria: '100% trẻ hào hứng phấn đấu.' },

    // Lá chiều
    { content_id: getContentId('LA', 'MT 13'), routine_slot: 'AFTERNOON_ACTIVITY', title: 'Hoạt động chiều (Khối Lá): Đọc đồng dao, ca dao tục ngữ Việt Nam', objective: 'Mở rộng vốn từ vựng dân gian, cảm thụ nhịp điệu ca dao tục ngữ quê hương.', preparation: 'Tập đồng dao Việt Nam chọn lọc.', procedure: 'Đọc đối đáp ca dao theo vần điệu, tìm hiểu ý nghĩa câu ca dao tục ngữ.', evaluation_criteria: 'Đọc trôi chảy, đúng nhịp phách.' },
    { content_id: getContentId('LA', 'MT 20'), routine_slot: 'AFTERNOON_ACTIVITY', title: 'Hoạt động chiều (Khối Lá): Rèn kỹ năng sắp xếp cặp sách và đồ dùng học tập lớp 1', objective: 'Tập mở khóa cặp, xếp sách vở gáy hướng ra ngoài, gọt bút chì cẩn thận.', preparation: 'Cặp sách học sinh lớp 1, vở ô ly, hộp bút chì.', procedure: 'Thực hành thao tác lấy sách vở ra bàn học và cất lại vào cặp ngăn nắp.', evaluation_criteria: 'Thao tác nhanh nhẹn, giữ gìn sách vở phẳng phiu.' },
    { content_id: getContentId('LA', 'MT 7'), routine_slot: 'AFTERNOON_ACTIVITY', title: 'Hoạt động chiều (Khối Lá): Kỹ năng thực hành phòng cháy chữa cháy & thoát hiểm', objective: 'Biết lấy khăn ẩm bịt mũi miệng, cúi thấp người men theo chân tường thoát nạn.', preparation: 'Khăn ẩm sạch, còi báo động diễn tập.', procedure: 'Phát còi báo động giả định, trẻ nhanh chóng nhúng khăn ẩm và thoát ra cửa an toàn.', evaluation_criteria: 'Bình tĩnh thực hiện đúng kỹ năng thoát hiểm.' },
    { content_id: getContentId('LA', 'MT 14'), routine_slot: 'AFTERNOON_ACTIVITY', title: 'Hoạt động chiều (Khối Lá): Làm quen tiếng Anh qua Flashcard chủ đề trường tiểu học', objective: 'Ghi nhớ các từ: School, Teacher, Book, Pencil, Desk qua trò chơi lật thẻ.', preparation: 'Bộ thẻ Flashcard tiếng Anh khổ lớn.', procedure: 'Trò chơi tìm cặp thẻ từ vựng tương ứng và phát âm chuẩn bản ngữ.', evaluation_criteria: 'Nhớ từ vựng và tự tin phát âm.' },
    { content_id: getContentId('LA', 'MT 19'), routine_slot: 'AFTERNOON_ACTIVITY', title: 'Hoạt động chiều (Khối Lá): Sinh hoạt Nêu gương cuối tuần, bình xét bé ngoan xuất sắc', objective: 'Bình xét danh hiệu Cháu ngoan Bác Hồ trong tuần, chuẩn bị tâm thế tự tin.', preparation: 'Bảng vinh danh bé ngoan, phiếu bé ngoan tiêu chuẩn.', procedure: 'Trẻ tự đánh giá, bạn bè đóng góp ý kiến xây dựng, cô tổng kết khen ngợi.', evaluation_criteria: 'Trẻ tự giác, khiêm tốn học hỏi.' },
  ];

  const cleanActivityTitle = (title, routine_slot) => {
    let clean = title.trim();
    if (routine_slot === 'MORNING_EXERCISE') {
      clean = clean.replace(/^Thể dục sáng:\s*/i, '').replace(/\s*\((Nhà trẻ|Khối Mầm|Khối Chồi|Khối Lá)\)$/i, '');
    } else if (routine_slot === 'CORNER_PLAY') {
      clean = clean.replace(/^Góc\s+[^:]+:\s*/i, '');
    } else if (routine_slot === 'OUTDOOR_PLAY') {
      clean = clean.replace(/^(Ngoài trời|TCVĐ|Chơi tự do)\s*\([^)]+\):\s*/i, '');
    } else if (routine_slot === 'AFTERNOON_ACTIVITY') {
      clean = clean.replace(/^Hoạt động chiều\s*\([^)]+\):\s*/i, '');
    } else if (routine_slot === 'DIRECTED_STUDY') {
      clean = clean.replace(/^(NBTN|NBPB|Vận động|Văn học|Âm nhạc|Tạo hình|Thể dục|Khám phá STEAM|Khám phá|Toán|Chữ cái|Kỹ năng sống):\s*/i, '');
    }
    return clean.trim();
  };

  let insertedActivityCount = 0;
  for (const act of rawActivities) {
    await prisma.educationalActivity.create({
      data: {
        ...act,
        title: cleanActivityTitle(act.title, act.routine_slot),
      },
    });
    insertedActivityCount++;
  }

  console.log(`✅ Inserted ${insertedActivityCount} EducationalActivities across all 7 routine slots.`);
  console.log('⚡ Note: No weekly timetable schedules inserted into sub_theme_activities (preserving Teacher Autonomy).');

  // ==========================================================================
  // PART 4: ATTENDANCE (From 2026-09-07 to 2026-10-13, Weekdays Only)
  // ==========================================================================
  console.log('\n--- Seeding Real Attendance from 2026-09-07 to 2026-10-13 ---');

  // Clear existing attendance records
  await prisma.attendance.deleteMany({});

  // Generate list of weekdays between start and today
  const startDate = new Date('2026-09-07T00:00:00.000Z');
  const endDate = new Date('2026-10-13T00:00:00.000Z');
  const schoolDates = [];

  for (let cur = new Date(startDate); cur <= endDate; cur.setDate(cur.getDate() + 1)) {
    const dayOfWeek = cur.getUTCDay();
    if (dayOfWeek >= 1 && dayOfWeek <= 5) { // 1 = Mon, 5 = Fri
      schoolDates.push(new Date(cur));
    }
  }

  console.log(`Identified ${schoolDates.length} school days (Mon - Fri) between 07/09/2026 and 13/10/2026.`);

  // Get all active enrollments for Year 1
  const enrollments = await prisma.studentEnrollment.findMany({
    where: {
      class: { school_year_id: SCHOOL_YEAR_ID },
    },
    include: {
      student: {
        include: { parents: true },
      },
      class: true,
    },
  });

  const absenceReasons = [
    'Bé bị sốt nhẹ mọc răng, gia đình cho nghỉ theo dõi tại nhà',
    'Bé bị cảm cúm có đờm, gia đình xin phép nghỉ uống thuốc',
    'Gia đình có việc riêng về quê thăm ông bà',
    'Bé bị rối loạn tiêu hóa nhẹ, gia đình chăm sóc tại nhà',
    'Thời tiết thay đổi bé bị ho dị ứng, nghỉ ngơi tại nhà',
  ];

  const pickupRelationships = ['Mẹ', 'Bố', 'Bà nội', 'Bà ngoại', 'Ông nội', 'Ông ngoại'];

  let attendanceCount = 0;
  const attendanceBatch = [];

  for (const enr of enrollments) {
    const student = enr.student;
    const parent = student.parents[0];
    const defaultParentName = parent?.full_name || (student.gender === 'MALE' ? 'Nguyễn Văn Hùng' : 'Trần Thị Thu');
    const defaultParentPhone = parent?.phone || '0987654321';

    for (let dayIdx = 0; dayIdx < schoolDates.length; dayIdx++) {
      const attendanceDate = schoolDates[dayIdx];
      const dateStr = attendanceDate.toISOString().slice(0, 10);

      // Deterministic pseudo-randomness per student and day so data is realistic
      const seedVal = (Number(student.student_id) * 31 + dayIdx * 7) % 100;
      const isAbsent = seedVal < 6; // 6% absence rate
      const status = isAbsent ? 'EXCUSED_ABSENCE' : 'PRESENT';

      if (status === 'PRESENT') {
        const checkInMin = 15 + (seedVal % 30); // 07:15 to 07:45
        const checkOutMin = 30 + (seedVal % 35); // 16:30 to 17:05
        const checkInTime = new Date(`${dateStr}T07:${String(checkInMin).padStart(2, '0')}:00.000Z`);
        const checkOutTime = new Date(`${dateStr}T16:${String(checkOutMin).padStart(2, '0')}:00.000Z`);

        const relIdx = (seedVal + dayIdx) % pickupRelationships.length;
        const rel = pickupRelationships[relIdx];

        attendanceBatch.push({
          student_id: student.student_id,
          class_id: enr.class_id,
          date: attendanceDate,
          status: 'PRESENT',
          check_in_time: checkInTime,
          check_in_by: defaultTeacherId,
          check_out_time: checkOutTime,
          check_out_by: defaultTeacherId,
          pickup_person_name: rel === 'Mẹ' || rel === 'Bố' ? defaultParentName : `${rel} của bé`,
          pickup_person_phone: defaultParentPhone,
          pickup_relationship: rel,
          pickup_note: 'Bé vui vẻ, ăn hết suất, nề nếp tốt',
        });
      } else {
        const reason = absenceReasons[seedVal % absenceReasons.length];
        attendanceBatch.push({
          student_id: student.student_id,
          class_id: enr.class_id,
          date: attendanceDate,
          status: 'EXCUSED_ABSENCE',
          check_in_time: null,
          check_in_by: defaultTeacherId,
          check_out_time: null,
          check_out_by: null,
          absence_reason: reason,
        });
      }
    }
  }

  // Insert in chunks of 100
  for (let i = 0; i < attendanceBatch.length; i += 100) {
    const chunk = attendanceBatch.slice(i, i + 100);
    await prisma.attendance.createMany({ data: chunk });
    attendanceCount += chunk.length;
  }

  console.log(`✅ Inserted ${attendanceCount} real attendance records across ${schoolDates.length} school days.`);

  // ==========================================================================
  // PART 5: HEALTH ASSESSMENTS (2 Checks/Month: Sept x2, Oct x2)
  // ==========================================================================
  console.log('\n--- Seeding Health Growth Assessments (2 checks/month) ---');

  // Clear existing health records
  await prisma.healthAssessment.deleteMany({});

  const healthDates = [
    { date: d('2026-09-10'), label: 'Đợt 1 (Đầu tháng 9/2026 - Khám tổng quát đầu năm)' },
    { date: d('2026-09-24'), label: 'Đợt 2 (Cuối tháng 9/2026 - Kiểm tra thể lực)' },
    { date: d('2026-10-05'), label: 'Đợt 3 (Đầu tháng 10/2026 - Khám định kỳ)' },
    { date: d('2026-10-12'), label: 'Đợt 4 (Giữa tháng 10/2026 - Kiểm tra thể lực)' },
  ];

  let healthCount = 0;
  for (const enr of enrollments) {
    const student = enr.student;
    const ageGroup = enr.class.age_group;

    // Base height & weight depending on age group
    let baseH = 80.0;
    let baseW = 11.0;

    if (ageGroup === 'NHA_TRE') {
      baseH = 82.0 + (Number(student.student_id) % 8);
      baseW = 10.8 + (Number(student.student_id) % 5) * 0.4;
    } else if (ageGroup === 'MAM') {
      baseH = 94.0 + (Number(student.student_id) % 7);
      baseW = 13.5 + (Number(student.student_id) % 5) * 0.5;
    } else if (ageGroup === 'CHOI') {
      baseH = 103.0 + (Number(student.student_id) % 6);
      baseW = 16.5 + (Number(student.student_id) % 6) * 0.5;
    } else { // LA
      baseH = 111.0 + (Number(student.student_id) % 6);
      baseW = 19.5 + (Number(student.student_id) % 6) * 0.6;
    }

    for (let hIdx = 0; hIdx < healthDates.length; hIdx++) {
      const hCheck = healthDates[hIdx];
      // Subtle growth between 2-week intervals (+0.2cm to +0.4cm, +0.1kg to +0.2kg)
      const currentH = Number((baseH + hIdx * 0.25).toFixed(1));
      const currentW = Number((baseW + hIdx * 0.15).toFixed(2));
      const heightInM = currentH / 100.0;
      const bmiVal = Number((currentW / (heightInM * heightInM)).toFixed(2));

      await prisma.healthAssessment.create({
        data: {
          student_id: student.student_id,
          assessment_date: hCheck.date,
          height: currentH,
          weight: currentW,
          bmi: bmiVal,
          height_for_age_zscore: 0.15 + (hIdx * 0.05),
          weight_for_age_zscore: 0.20 + (hIdx * 0.04),
          bmi_for_age_zscore: 0.10 + (hIdx * 0.03),
          notes: `${hCheck.label}: Thể lực tốt, tăng trưởng chuẩn WHO, cơ thể cân đối.`,
          recorded_by: defaultTeacherId,
        },
      });
      healthCount++;
    }
  }

  console.log(`✅ Inserted ${healthCount} HealthAssessment records (4 checks per student across Sept & Oct).`);

  // ==========================================================================
  // PART 6: MONTHLY ASSESSMENTS (Sổ Bé Ngoan - Month 9 & Month 10)
  // ==========================================================================
  console.log('\n--- Seeding Monthly Assessments (Sổ Bé Ngoan) ---');

  await prisma.monthlyAssessment.deleteMany({});

  let monthlyCount = 0;
  for (const enr of enrollments) {
    const student = enr.student;

    // Month 9/2026 (Completed)
    await prisma.monthlyAssessment.create({
      data: {
        student_id: student.student_id,
        class_id: enr.class_id,
        month: 9,
        year: 2026,
        week_1_rose: true,
        week_2_rose: true,
        week_3_rose: true,
        week_4_rose: true,
        week_5_rose: false,
        roses_count: 4,
        teacher_notes: 'Con ngoan ngoãn, thích nghi rất nhanh với nề nếp lớp học, tích cực tham gia các hoạt động giáo dục, ăn ngủ tốt.',
        evaluated_by: defaultTeacherId,
        parent_feedback: 'Gia đình rất yên tâm khi gửi bé tại trường, cảm ơn các cô đã chăm sóc con chu đáo!',
        feedback_at: dt('2026-10-02', '18:30'),
        feedback_by: sampleParentId,
      },
    });
    monthlyCount++;

    // Month 10/2026 (In-progress: weeks 1 & 2 completed, weeks 3-5 pending)
    await prisma.monthlyAssessment.create({
      data: {
        student_id: student.student_id,
        class_id: enr.class_id,
        month: 10,
        year: 2026,
        week_1_rose: true,
        week_2_rose: true,
        week_3_rose: false,
        week_4_rose: false,
        week_5_rose: false,
        roses_count: 2,
        teacher_notes: 'Con tiến bộ rõ rệt trong giao tiếp, biết chia sẻ đồ chơi cùng bạn và tự phục vụ cá nhân rất tốt.',
        evaluated_by: defaultTeacherId,
        parent_feedback: null,
      },
    });
    monthlyCount++;
  }

  console.log(`✅ Inserted ${monthlyCount} MonthlyAssessment records.`);

  // ==========================================================================
  // PART 7: DAILY ASSESSMENTS (Evaluations on school days for activities)
  // ==========================================================================
  console.log('\n--- Seeding Daily Assessments (Giai đoạn & Hoạt động học) ---');

  const studyActivities = await prisma.educationalActivity.findMany({
    where: { routine_slot: 'DIRECTED_STUDY' },
    include: { content: { include: { goal: true } } },
    take: 10,
  });

  let dailyCount = 0;
  // Pick last 5 school days (07/10, 08/10, 09/10, 12/10, 13/10) to evaluate
  const recentDays = schoolDates.slice(-5);

  for (let dIdx = 0; dIdx < recentDays.length; dIdx++) {
    const act = studyActivities[dIdx % studyActivities.length];
    const assessDate = recentDays[dIdx];

    for (const enr of enrollments) {
      const student = enr.student;
      const statusRoll = (Number(student.student_id) + dIdx) % 10;
      const status = statusRoll === 0 ? 'NOT_ACHIEVED' : statusRoll > 7 ? 'OUTSTANDING' : 'ACHIEVED';
      const note = status === 'OUTSTANDING'
        ? 'Con rất xuất sắc, hào hứng phát biểu và hoàn thành vượt mong đợi'
        : status === 'ACHIEVED'
          ? 'Con đạt yêu cầu, tập trung chú ý và hợp tác tốt cùng cô'
          : 'Con còn rụt rè, cô cần hỗ trợ thêm trong giờ học';

      await prisma.dailyAssessment.create({
        data: {
          student_id: student.student_id,
          activity_id: act.activity_id,
          goal_id: act.content?.goal_id || null,
          assessment_date: assessDate,
          status,
          notes: note,
          evaluated_by: defaultTeacherId,
        },
      });
      dailyCount++;
    }
  }

  console.log(`✅ Inserted ${dailyCount} DailyAssessment records for recent study activities.`);

  console.log('\n=============================================================');
  console.log('🎉 ALL SEEDING TASKS COMPLETED SUCCESSFULLY!');
  console.log('Summary:');
  console.log(`- Themes: ${insertedThemeCount}`);
  console.log(`- Sub-themes: ${insertedSubThemeCount}`);
  console.log(`- Goals: ${insertedGoalCount}`);
  console.log(`- Contents: ${insertedContentCount}`);
  console.log(`- Master Activities: ${insertedActivityCount}`);
  console.log(`- Attendances: ${attendanceCount}`);
  console.log(`- Health Assessments: ${healthCount}`);
  console.log(`- Monthly Assessments: ${monthlyCount}`);
  console.log(`- Daily Assessments: ${dailyCount}`);
  console.log('=============================================================');

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error('❌ Error during seeding:', e);
  await prisma.$disconnect();
  process.exit(1);
});
