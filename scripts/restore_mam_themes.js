import prisma from '../src/config/prisma.js';

const mamThemesData = [
  {
    name: 'Trường mầm non của bé',
    subThemes: [
      'Trường mầm non thân yêu',
      'Lớp học của bé và các góc chơi',
      'Bé vui Tết Trung Thu cùng bạn',
    ],
  },
  {
    name: 'Bản thân',
    subThemes: [
      'Tôi là ai (Họ tên, ngày sinh, giới tính)',
      'Cơ thể tôi (Các giác quan và vận động)',
      'Tôi cần gì để lớn lên và khỏe mạnh',
    ],
  },
  {
    name: 'Gia đình yêu thương',
    subThemes: [
      'Tổ ấm gia đình của bé',
      'Những người thân yêu trong gia đình',
      'Đồ dùng trong gia đình bé',
    ],
  },
  {
    name: 'Nghề nghiệp trong xã hội',
    subThemes: [
      'Nghề thầy giáo, cô giáo (Tri ân 20/11)',
      'Bác sĩ, y tá chăm sóc sức khỏe',
      'Chú thợ xây, thợ điện và thợ may',
      'Bác nông dân gieo trồng cần mẫn',
    ],
  },
  {
    name: 'Thế giới động vật',
    subThemes: [
      'Vật nuôi trong gia đình bé',
      'Động vật phục vụ đời sống & Chú bộ đội của em (22/12)',
      'Thế giới động vật dưới nước',
      'Những con thú sống trong rừng',
      'Côn trùng và chim muông biết bay',
    ],
  },
  {
    name: 'Thực vật & Tết mùa xuân',
    subThemes: [
      'Cây xanh quanh bé và ích lợi',
      'Hoa đẹp mùa xuân và Tết cổ truyền',
      'Những loại quả thơm ngon bổ dưỡng',
      'Rau củ tốt cho hệ tiêu hóa',
    ],
  },
  {
    name: 'Giao thông an toàn',
    subThemes: [
      'Món quà tặng mẹ ngày 8/3 & PTGT đường bộ',
      'Phương tiện đường thủy và đường hàng không',
      'Bé thực hành đèn tín hiệu giao thông',
    ],
  },
  {
    name: 'Nước & các hiện tượng tự nhiên',
    subThemes: [
      'Nước ngọt lành và ích lợi với sự sống',
      'Thời tiết bốn mùa và hiện tượng nắng mưa',
      'Gió, ánh sáng và không khí trong lành',
    ],
  },
  {
    name: 'Quê hương đất nước - Bác Hồ',
    subThemes: [
      'Quê hương Hòn Tre biển đảo tươi đẹp',
      'Thủ đô Hà Nội và các danh lam thắng cảnh',
      'Bác Hồ kính yêu của thiếu nhi',
      'Bản đồ Việt Nam và cờ Tổ quốc',
    ],
  },
  {
    name: 'Bé vui đón hè',
    subThemes: [
      'Mùa hè rực rỡ và trang phục mát mẻ',
      'Kỳ nghỉ hè bổ ích bên gia đình',
      'Tạm biệt lớp Mầm, bé sẵn sàng lên lớp Chồi',
    ],
  },
];

async function restoreMamThemes() {
  console.log('Restoring 10 MAM themes...');
  const schoolYear = await prisma.schoolYear.findFirst({
    where: { name: { contains: '2026' } },
  });
  const syId = schoolYear ? schoolYear.school_year_id : 1n;

  // Clean existing MAM themes
  await prisma.curriculumTheme.deleteMany({
    where: { age_group: 'MAM' },
  });

  const baseMonday = new Date(Date.UTC(2026, 8, 7)); // 2026-09-07 (Mon)
  let currentWeek = 0;

  for (let i = 0; i < mamThemesData.length; i++) {
    const item = mamThemesData[i];
    const subCount = item.subThemes.length;

    const tStartDate = new Date(baseMonday);
    tStartDate.setUTCDate(baseMonday.getUTCDate() + currentWeek * 7);

    const tEndDate = new Date(tStartDate);
    tEndDate.setUTCDate(tStartDate.getUTCDate() + subCount * 7 - 1);

    const createdTheme = await prisma.curriculumTheme.create({
      data: {
        name: item.name,
        age_group: 'MAM',
        school_year_id: syId,
        start_date: tStartDate,
        end_date: tEndDate,
        status: 'DRAFT',
      },
    });

    for (let j = 0; j < subCount; j++) {
      const sDate = new Date(baseMonday);
      sDate.setUTCDate(baseMonday.getUTCDate() + (currentWeek + j) * 7);
      const eDate = new Date(sDate);
      eDate.setUTCDate(sDate.getUTCDate() + 6);

      await prisma.subTheme.create({
        data: {
          theme_id: createdTheme.theme_id,
          name: item.subThemes[j],
          start_date: sDate,
          end_date: eDate,
        },
      });
    }

    currentWeek += subCount;
    console.log(`✅ Restored Theme "${item.name}": ${tStartDate.toISOString().slice(0, 10)} -> ${tEndDate.toISOString().slice(0, 10)} (${subCount} tuần)`);
  }

  // Also relink sub_theme_activities
  const allSubThemes = await prisma.subTheme.findMany({
    where: { deleted_at: null },
  });
  const allActivities = await prisma.subThemeActivity.findMany();
  let remapped = 0;
  for (const act of allActivities) {
    if (!act.scheduled_date) continue;
    const dateStr = act.scheduled_date.toISOString().slice(0, 10);
    const matched = allSubThemes.find((st) => {
      const s = st.start_date.toISOString().slice(0, 10);
      const e = st.end_date.toISOString().slice(0, 10);
      return dateStr >= s && dateStr <= e;
    });
    if (matched && matched.sub_theme_id !== act.sub_theme_id) {
      await prisma.subThemeActivity.update({
        where: { id: act.id },
        data: { sub_theme_id: matched.sub_theme_id },
      });
      remapped++;
    }
  }
  console.log(`✨ Re-aligned ${remapped} activities.`);
  console.log('🎉 Done restoring MAM themes!');
}

restoreMamThemes().finally(() => prisma.$disconnect());
