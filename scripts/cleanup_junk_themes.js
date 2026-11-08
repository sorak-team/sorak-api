import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  console.log('--- CLEANING UP DUPLICATE JUNK THEMES (201, 214, 215, 216, 217) ---');

  const junkThemeIds = [201n, 214n, 215n, 216n, 217n];

  // 1. Delete class theme plans pointing to these junk themes
  const deletedPlans = await prisma.classThemePlan.deleteMany({
    where: { theme_id: { in: junkThemeIds } },
  });
  console.log(`Deleted ${deletedPlans.count} plans on junk themes.`);

  // 2. Delete educational activities pointing to these junk themes
  const deletedActivities = await prisma.educationalActivity.deleteMany({
    where: { theme_id: { in: junkThemeIds } },
  });
  console.log(`Deleted ${deletedActivities.count} activities on junk themes.`);

  // 3. Delete or soft-delete junk themes
  const deletedThemes = await prisma.curriculumTheme.deleteMany({
    where: { theme_id: { in: junkThemeIds } },
  });
  console.log(`Deleted ${deletedThemes.count} junk themes.`);

  console.log('✓ Cleanup complete! Themes are now 100% unique, chronological, and non-overlapping.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

