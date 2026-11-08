import prisma from '../src/config/prisma.js';

async function alignThemesMonSun() {
  console.log('🚀 Starting alignment of themes and sub-themes to Mon-Sun weeks...');

  // 1. Process MAM themes
  const mamThemes = await prisma.curriculumTheme.findMany({
    where: { age_group: 'MAM' },
    include: {
      sub_themes: {
        where: { deleted_at: null },
        orderBy: { start_date: 'asc' },
      },
    },
    orderBy: { start_date: 'asc' },
  });

  const baseMonday = new Date(Date.UTC(2026, 8, 7)); // 2026-09-07 (Mon)
  let weekIndex = 0;

  for (const theme of mamThemes) {
    if (!theme.sub_themes || theme.sub_themes.length === 0) continue;

    let themeStartStr = null;
    let themeEndStr = null;

    for (let j = 0; j < theme.sub_themes.length; j++) {
      const sub = theme.sub_themes[j];
      const sDate = new Date(baseMonday);
      sDate.setUTCDate(baseMonday.getUTCDate() + weekIndex * 7);

      const eDate = new Date(sDate);
      eDate.setUTCDate(sDate.getUTCDate() + 6);

      const sStr = sDate.toISOString().slice(0, 10);
      const eStr = eDate.toISOString().slice(0, 10);

      if (j === 0) themeStartStr = sStr;
      if (j === theme.sub_themes.length - 1) themeEndStr = eStr;

      await prisma.subTheme.update({
        where: { sub_theme_id: sub.sub_theme_id },
        data: {
          start_date: new Date(`${sStr}T00:00:00.000Z`),
          end_date: new Date(`${eStr}T00:00:00.000Z`),
        },
      });

      console.log(`  [Tuần ${weekIndex + 1}] SubTheme "${sub.name}": ${sStr} (T2) -> ${eStr} (CN)`);
      weekIndex++;
    }

    await prisma.curriculumTheme.update({
      where: { theme_id: theme.theme_id },
      data: {
        start_date: new Date(`${themeStartStr}T00:00:00.000Z`),
        end_date: new Date(`${themeEndStr}T00:00:00.000Z`),
      },
    });

    console.log(`✅ Theme "${theme.name}": ${themeStartStr} (T2) -> ${themeEndStr} (CN) [${theme.sub_themes.length} tuần]\n`);
  }

  // 2. Process NHA_TRE themes
  const nhaTreThemes = await prisma.curriculumTheme.findMany({
    where: { age_group: 'NHA_TRE' },
    include: {
      sub_themes: {
        where: { deleted_at: null },
        orderBy: { start_date: 'asc' },
      },
    },
  });

  for (const nt of nhaTreThemes) {
    if (nt.sub_themes.length === 0) {
      await prisma.curriculumTheme.update({
        where: { theme_id: nt.theme_id },
        data: {
          start_date: new Date('2026-09-07T00:00:00.000Z'),
          end_date: new Date('2026-09-27T00:00:00.000Z'),
        },
      });
      console.log(`✅ Theme NHA_TRE "${nt.name}": 2026-09-07 (T2) -> 2026-09-27 (CN)`);
    }
  }

  // 3. Re-link sub_theme_activities so each scheduled activity points to the exact sub-theme covering its date
  console.log('\n🔗 Re-aligning sub_theme_activities to exact sub-themes by scheduled_date...');
  const allSubThemes = await prisma.subTheme.findMany({
    where: { deleted_at: null },
    select: { sub_theme_id: true, name: true, start_date: true, end_date: true },
  });

  const allSlots = await prisma.subThemeActivity.findMany({
    select: { id: true, sub_theme_id: true, scheduled_date: true, day_of_week: true },
  });

  let remappedCount = 0;
  for (const slot of allSlots) {
    if (!slot.scheduled_date) continue;
    const slotDateStr = slot.scheduled_date.toISOString().slice(0, 10);
    const matchingSub = allSubThemes.find((st) => {
      const stS = st.start_date.toISOString().slice(0, 10);
      const stE = st.end_date.toISOString().slice(0, 10);
      return slotDateStr >= stS && slotDateStr <= stE;
    });

    if (matchingSub && matchingSub.sub_theme_id !== slot.sub_theme_id) {
      await prisma.subThemeActivity.update({
        where: { id: slot.id },
        data: { sub_theme_id: matchingSub.sub_theme_id },
      });
      remappedCount++;
    }
  }

  console.log(`✨ Successfully re-aligned ${remappedCount} activities to their exact sub-theme weeks.`);
  console.log('🎉 Done!');
}

alignThemesMonSun()
  .catch((err) => {
    console.error('❌ Error during alignment:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
