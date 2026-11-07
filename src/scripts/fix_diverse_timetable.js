import prisma from '../config/prisma.js';

const ROUTINE_SLOTS = [
  'ARRIVAL_PLAY',
  'MORNING_EXERCISE',
  'DIRECTED_STUDY',
  'CORNER_PLAY',
  'OUTDOOR_PLAY',
  'AFTERNOON_ACTIVITY',
  'RETURN_CHILD',
];
const WEEK_DAYS = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'];
const CLASS_ID = 5n;

async function reschedule() {
  console.log('🔄 Đang phân bổ lại TKB cho lớp Nhà trẻ 1 sao cho đa dạng và thay đổi mỗi ngày...');

  // 1. Lấy danh sách 4 chủ đề của Nhà trẻ 1
  const themes = await prisma.curriculumTheme.findMany({
    where: { school_year_id: 1n, age_group: 'NHA_TRE', deleted_at: null },
    include: { sub_themes: { orderBy: { start_date: 'asc' } } },
    orderBy: { start_date: 'asc' },
    take: 4,
  });

  // 2. Xóa toàn bộ 525 slot cũ bị lặp lại
  await prisma.subThemeActivity.deleteMany({
    where: { class_id: CLASS_ID }
  });
  console.log('Đã xóa các slot trùng lặp cũ.');

  let totalScheduled = 0;

  for (let tIdx = 0; tIdx < themes.length; tIdx++) {
    const th = themes[tIdx];
    const subThemes = th.sub_themes || [];

    // Lấy tất cả activities thuộc mục tiêu của chủ đề này
    const themeGoals = await prisma.classThemeGoal.findMany({
      where: { class_id: CLASS_ID, theme_id: th.theme_id },
      include: {
        goal: {
          include: {
            contents: {
              include: {
                activities: true
              }
            }
          }
        }
      }
    });

    const actsBySlot = {};
    for (const s of ROUTINE_SLOTS) actsBySlot[s] = [];

    for (const tg of themeGoals) {
      for (const cnt of tg.goal.contents) {
        for (const act of cnt.activities) {
          if (actsBySlot[act.routine_slot]) {
            actsBySlot[act.routine_slot].push(act);
          }
        }
      }
    }

    console.log(`Chủ đề ${tIdx + 1} (${th.name}): có ${themeGoals.length} mục tiêu, DIRECTED_STUDY có ${actsBySlot['DIRECTED_STUDY']?.length} bài học.`);

    // Lên lịch cho từng tuần và từng ngày
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
          const pool = actsBySlot[slot];
          if (!pool || pool.length === 0) continue;

          // Xoay vòng các hoạt động khác nhau theo ngày!
          const chosenAct = pool[dayOffset % pool.length];

          await prisma.subThemeActivity.create({
            data: {
              class_id: CLASS_ID,
              sub_theme_id: st.sub_theme_id,
              activity_id: chosenAct.activity_id,
              scheduled_date: slotDate,
              day_of_week: dayOfWeek,
              routine_slot: slot,
              order_index: sIdx + 1,
            }
          });
          totalScheduled++;
        }
      }
    }
  }

  console.log(`✅ Đã xếp mới thành công ${totalScheduled} slot TKB đa dạng cho 15 tuần học.`);
}

reschedule().catch(console.error).finally(() => process.exit(0));

