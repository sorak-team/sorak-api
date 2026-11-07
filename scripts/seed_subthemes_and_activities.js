import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  console.log('--- SEEDING SUBTHEMES, ACTIVITIES & GOALS FOR COMPREHENSIVE APPRAISAL ---');

  const schoolYearId = 1n;

  // 1. Ensure all themes in school year 1 have 3-4 subthemes (weeks)
  const allThemes = await prisma.curriculumTheme.findMany({
    where: { school_year_id: schoolYearId, deleted_at: null },
    include: { sub_themes: true },
  });

  for (const th of allThemes) {
    if (th.sub_themes.length === 0) {
      console.log(`Generating sub-themes for theme: ${th.name} (${th.age_group})`);
      const start = new Date(th.start_date);
      const end = new Date(th.end_date);
      const totalDays = Math.max(7, Math.round((end - start) / (1000 * 60 * 60 * 24)));
      const weeksCount = Math.min(4, Math.max(2, Math.round(totalDays / 7)));

      for (let w = 0; w < weeksCount; w++) {
        const wStart = new Date(start);
        wStart.setDate(start.getDate() + w * 7);
        const wEnd = new Date(wStart);
        wEnd.setDate(wStart.getDate() + 6);

        let subName = `Nhánh ${w + 1}: Khám phá ${th.name.toLowerCase()}`;
        if (w === 0) subName = `Tuần 1: Khám phá ${th.name}`;
        else if (w === 1) subName = `Tuần 2: Trải nghiệm cùng bé - ${th.name}`;
        else if (w === 2) subName = `Tuần 3: Bé thực hành và khám phá cùng ${th.name}`;
        else if (w === 3) subName = `Tuần 4: Bé chia sẻ và giữ gìn - ${th.name}`;

        await prisma.subTheme.create({
          data: {
            theme_id: th.theme_id,
            name: subName,
            start_date: wStart,
            end_date: wEnd,
          },
        });
      }
    }
  }

  // 2. Fetch all subthemes now
  const updatedThemes = await prisma.curriculumTheme.findMany({
    where: { school_year_id: schoolYearId, deleted_at: null },
    include: { sub_themes: true },
  });

  // 3. Seed sample goals in ClassThemeGoal for each class and theme if missing
  const classes = await prisma.class.findMany({
    where: { school_year_id: schoolYearId, deleted_at: null },
  });

  const availableGoals = await prisma.educationalGoal.findMany({
    where: { school_year_id: schoolYearId, deleted_at: null },
  });

  console.log(`Available goals count: ${availableGoals.length}`);

  for (const cls of classes) {
    const classThemes = updatedThemes.filter((t) => t.age_group === cls.age_group);

    for (const th of classThemes) {
      const existingGoals = await prisma.classThemeGoal.findMany({
        where: { class_id: cls.class_id, theme_id: th.theme_id },
      });

      if (existingGoals.length === 0 && availableGoals.length > 0) {
        // Pick 4-6 goals across different domains
        const goalsForClass = availableGoals.filter((g) => g.age_group === cls.age_group);
        const selectedGoals = (goalsForClass.length > 0 ? goalsForClass : availableGoals).slice(0, 5);

        for (const g of selectedGoals) {
          await prisma.classThemeGoal.create({
            data: {
              class_id: cls.class_id,
              theme_id: th.theme_id,
              goal_id: g.goal_id,
            },
          }).catch(() => {});
        }
      }
    }
  }

  // 4. Seed sample SubThemeActivity (Weekly Timetable) for each class in Theme 1 and Theme 2
  const activitiesPool = await prisma.educationalActivity.findMany({
    take: 30,
    select: { activity_id: true, title: true, routine_slot: true },
  });

  if (activitiesPool.length > 0) {
    const days = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'];

    for (const cls of classes) {
      const classThemes = updatedThemes.filter((t) => t.age_group === cls.age_group);

      // Seed for the first 2 themes of each class
      for (const th of classThemes.slice(0, 2)) {
        for (const st of th.sub_themes.slice(0, 3)) {
          const existingActs = await prisma.subThemeActivity.count({
            where: { class_id: cls.class_id, sub_theme_id: st.sub_theme_id },
          });

          if (existingActs === 0) {
            let actIdx = 0;
            for (let d = 0; d < days.length; d++) {
              const day = days[d];
              const schedDate = new Date(st.start_date);
              schedDate.setDate(schedDate.getDate() + d);

              // 1 Directed Study (Hoạt động học có chủ đích)
              const act1 = activitiesPool[actIdx % activitiesPool.length];
              actIdx++;
              await prisma.subThemeActivity.create({
                data: {
                  class_id: cls.class_id,
                  sub_theme_id: st.sub_theme_id,
                  activity_id: act1.activity_id,
                  day_of_week: day,
                  routine_slot: 'DIRECTED_STUDY',
                  scheduled_date: schedDate,
                  order_index: 1,
                  status: 'SCHEDULED',
                },
              });

              // 1 Corner Play (Chơi góc) or Outdoor (Chơi ngoài trời)
              const act2 = activitiesPool[actIdx % activitiesPool.length];
              actIdx++;
              await prisma.subThemeActivity.create({
                data: {
                  class_id: cls.class_id,
                  sub_theme_id: st.sub_theme_id,
                  activity_id: act2.activity_id,
                  day_of_week: day,
                  routine_slot: d % 2 === 0 ? 'CORNER_PLAY' : 'OUTDOOR_PLAY',
                  scheduled_date: schedDate,
                  order_index: 2,
                  status: 'SCHEDULED',
                },
              });
            }
          }
        }
      }
    }
  }

  const totalSubThemeActs = await prisma.subThemeActivity.count();
  const totalClassGoals = await prisma.classThemeGoal.count();
  console.log(`✓ Seeding finished! Total scheduled activities: ${totalSubThemeActs}, total goals: ${totalClassGoals}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

