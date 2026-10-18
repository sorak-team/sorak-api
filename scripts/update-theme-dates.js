import prisma from '../src/config/prisma.js';

function formatDate(d) {
  return d.toISOString().slice(0, 10);
}

function addDays(startDateStr, days) {
  const d = new Date(startDateStr + 'T00:00:00.000Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

async function updateThemeDates() {
  const sy = await prisma.schoolYear.findUnique({ where: { school_year_id: 1n } });
  if (!sy) {
    throw new Error('School year 1 not found!');
  }

  const syStart = sy.start_date.toISOString().slice(0, 10); // '2026-09-05'
  const syEnd = sy.end_date.toISOString().slice(0, 10);     // '2027-05-31'

  const startDateObj = new Date(syStart + 'T00:00:00.000Z');
  const endDateObj = new Date(syEnd + 'T00:00:00.000Z');
  const totalDays = Math.round((endDateObj - startDateObj) / (1000 * 60 * 60 * 24)) + 1;

  console.log(`Updating themes & subthemes for School Year "${sy.name}" (ID ${sy.school_year_id})`);
  console.log(`Target range: ${syStart} -> ${syEnd} (${totalDays} continuous days)`);

  const ageGroups = ['NHA_TRE', 'MAM', 'CHOI', 'LA'];
  let totalThemesUpdated = 0;
  let totalSubsUpdated = 0;

  for (const ag of ageGroups) {
    const themes = await prisma.curriculumTheme.findMany({
      where: { school_year_id: 1n, age_group: ag },
      include: { sub_themes: { orderBy: { sub_theme_id: 'asc' } } },
      orderBy: { theme_id: 'asc' },
    });

    const totalSubs = themes.reduce((acc, t) => acc + t.sub_themes.length, 0);
    let globalSubIndex = 0;

    for (let tIdx = 0; tIdx < themes.length; tIdx++) {
      const t = themes[tIdx];
      const subThemes = t.sub_themes;
      let themeStartDate = null;
      let themeEndDate = null;

      for (let sIdx = 0; sIdx < subThemes.length; sIdx++) {
        const startDayOffset = Math.round((globalSubIndex * totalDays) / totalSubs);
        const endDayOffset = Math.round(((globalSubIndex + 1) * totalDays) / totalSubs) - 1;

        const subStart = new Date(startDateObj.getTime() + startDayOffset * 24 * 60 * 60 * 1000);
        const subEnd = new Date(startDateObj.getTime() + endDayOffset * 24 * 60 * 60 * 1000);

        if (sIdx === 0) {
          themeStartDate = subStart;
        }
        if (sIdx === subThemes.length - 1) {
          themeEndDate = subEnd;
        }

        await prisma.subTheme.update({
          where: { sub_theme_id: subThemes[sIdx].sub_theme_id },
          data: {
            start_date: subStart,
            end_date: subEnd,
          },
        });

        totalSubsUpdated++;
        globalSubIndex++;
      }

      await prisma.curriculumTheme.update({
        where: { theme_id: t.theme_id },
        data: {
          start_date: themeStartDate,
          end_date: themeEndDate,
        },
      });

      totalThemesUpdated++;
      console.log(`  Updated Theme [${t.theme_id}] ${t.name}: ${formatDate(themeStartDate)} -> ${formatDate(themeEndDate)}`);
    }

    console.log(`Finished ${ag}: ${themes.length} themes, ${totalSubs} subthemes updated.`);
  }

  console.log(`\nTOTAL: ${totalThemesUpdated} themes, ${totalSubsUpdated} subthemes successfully updated in PostgreSQL.`);

  // Verification step
  console.log('\n--- VERIFYING INTEGRITY IN POSTGRESQL ---');
  for (const ag of ageGroups) {
    const themes = await prisma.curriculumTheme.findMany({
      where: { school_year_id: 1n, age_group: ag },
      include: { sub_themes: { orderBy: { sub_theme_id: 'asc' } } },
      orderBy: { theme_id: 'asc' },
    });

    const firstTheme = themes[0];
    const lastTheme = themes[themes.length - 1];

    if (formatDate(firstTheme.start_date) !== syStart) {
      throw new Error(`Integrity check failed: First theme starts at ${formatDate(firstTheme.start_date)} instead of ${syStart}`);
    }
    if (formatDate(lastTheme.end_date) !== syEnd) {
      throw new Error(`Integrity check failed: Last theme ends at ${formatDate(lastTheme.end_date)} instead of ${syEnd}`);
    }

    let allSubs = [];
    themes.forEach(t => allSubs.push(...t.sub_themes));

    for (let i = 0; i < allSubs.length - 1; i++) {
      const curEnd = formatDate(allSubs[i].end_date);
      const nextStart = formatDate(allSubs[i + 1].start_date);
      const expected = addDays(curEnd, 1);
      if (nextStart !== expected) {
        throw new Error(`Integrity check failed: Sub gap between ${curEnd} and ${nextStart}`);
      }
    }

    for (let i = 0; i < themes.length - 1; i++) {
      const curEnd = formatDate(themes[i].end_date);
      const nextStart = formatDate(themes[i + 1].start_date);
      const expected = addDays(curEnd, 1);
      if (nextStart !== expected) {
        throw new Error(`Integrity check failed: Theme gap between ${curEnd} and ${nextStart}`);
      }
    }

    console.log(`Verified ${ag}: 100% continuous from ${syStart} to ${syEnd} with 0 gaps!`);
  }
}

updateThemeDates()
  .catch((err) => {
    console.error('Error updating theme dates:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
