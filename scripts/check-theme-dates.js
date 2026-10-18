import prisma from '../src/config/prisma.js';

async function check() {
  const sy = await prisma.schoolYear.findUnique({
    where: { school_year_id: 1n },
  });
  console.log('School Year 1:', sy.name, 'start:', sy.start_date.toISOString().slice(0, 10), 'end:', sy.end_date.toISOString().slice(0, 10));

  const ths = await prisma.curriculumTheme.findMany({
    where: { school_year_id: 1n },
    include: { sub_themes: { orderBy: { start_date: 'asc' } } },
    orderBy: [{ age_group: 'asc' }, { start_date: 'asc' }],
  });

  const ageGroups = ['NHA_TRE', 'MAM', 'CHOI', 'LA'];
  for (const ag of ageGroups) {
    const list = ths.filter(t => t.age_group === ag);
    const firstTheme = list[0];
    const lastTheme = list[list.length - 1];
    const totalSubThemes = list.reduce((sum, t) => sum + t.sub_themes.length, 0);
    console.log(`\nAge group ${ag}: ${list.length} themes, ${totalSubThemes} sub-themes`);
    console.log(`  First theme: ${firstTheme?.name} (${firstTheme?.start_date.toISOString().slice(0, 10)} - ${firstTheme?.end_date.toISOString().slice(0, 10)})`);
    console.log(`  Last theme: ${lastTheme?.name} (${lastTheme?.start_date.toISOString().slice(0, 10)} - ${lastTheme?.end_date.toISOString().slice(0, 10)})`);
    
    // Check gaps between themes
    for (let i = 0; i < list.length - 1; i++) {
      const curEnd = list[i].end_date.toISOString().slice(0, 10);
      const nextStart = list[i + 1].start_date.toISOString().slice(0, 10);
      console.log(`  Theme ${i + 1} (${curEnd}) -> Theme ${i + 2} (${nextStart})`);
    }
  }

  await prisma.$disconnect();
}

check().catch(console.error);
