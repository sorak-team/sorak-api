import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  console.log('--- ENRICHING THEME MATRIX DATA FOR 2026-2027 ---');

  const schoolYearId = 1n; // Năm học 2026–2027

  // Update themes 204..213 to school_year_id = 1n
  await prisma.curriculumTheme.updateMany({
    where: {
      theme_id: { in: [204n, 205n, 206n, 207n, 208n, 209n, 210n, 211n, 212n, 213n] },
    },
    data: {
      school_year_id: schoolYearId,
    },
  });
  console.log('✓ Updated MAM themes 204-213 to school_year_id = 1');

  // Khối Nhà Trẻ themes
  const nhaTreThemes = [
    { name: 'Bé và các bạn mới', start_date: new Date('2026-09-07'), end_date: new Date('2026-09-27') },
    { name: 'Đồ chơi yêu thích của bé', start_date: new Date('2026-09-28'), end_date: new Date('2026-10-25') },
    { name: 'Những con vật nuôi đáng yêu', start_date: new Date('2026-10-26'), end_date: new Date('2026-11-22') },
    { name: 'Cây xanh và hoa đẹp quanh bé', start_date: new Date('2026-11-23'), end_date: new Date('2026-12-20') },
    { name: 'Bé đón Tết và mùa xuân', start_date: new Date('2026-12-21'), end_date: new Date('2027-01-17') },
  ];

  // Khối Chồi themes
  const choiThemes = [
    { name: 'Trường mầm non thân yêu', start_date: new Date('2026-09-07'), end_date: new Date('2026-09-27') },
    { name: 'Bản thân bé tự tin', start_date: new Date('2026-09-28'), end_date: new Date('2026-10-25') },
    { name: 'Gia đình ấm áp của bé', start_date: new Date('2026-10-26'), end_date: new Date('2026-11-22') },
    { name: 'Những nghề quen thuộc', start_date: new Date('2026-11-23'), end_date: new Date('2026-12-20') },
    { name: 'Thế giới động vật đa dạng', start_date: new Date('2026-12-21'), end_date: new Date('2027-01-17') },
  ];

  // Khối Lá themes
  const laThemes = [
    { name: 'Trường mầm non - Năm học mới', start_date: new Date('2026-09-07'), end_date: new Date('2026-09-27') },
    { name: 'Tôi là ai - Bạn là ai', start_date: new Date('2026-09-28'), end_date: new Date('2026-10-25') },
    { name: 'Gia đình và người thân yêu', start_date: new Date('2026-10-26'), end_date: new Date('2026-11-22') },
    { name: 'Nghề nghiệp trong tương lai', start_date: new Date('2026-11-23'), end_date: new Date('2026-12-20') },
    { name: 'Thế giới thực vật & Mùa xuân', start_date: new Date('2026-12-21'), end_date: new Date('2027-01-17') },
  ];

  async function syncThemes(ageGroup, list) {
    for (const item of list) {
      const existing = await prisma.curriculumTheme.findFirst({
        where: {
          school_year_id: schoolYearId,
          age_group: ageGroup,
          name: item.name,
        },
      });
      if (!existing) {
        await prisma.curriculumTheme.create({
          data: {
            school_year_id: schoolYearId,
            age_group: ageGroup,
            name: item.name,
            start_date: item.start_date,
            end_date: item.end_date,
            status: 'PUBLISHED',
          },
        });
      }
    }
  }

  await syncThemes('NHA_TRE', nhaTreThemes);
  await syncThemes('CHOI', choiThemes);
  await syncThemes('LA', laThemes);
  console.log('✓ Synced themes for NHA_TRE, CHOI, LA');

  // Get all themes for 2026-2027
  const allThemes = await prisma.curriculumTheme.findMany({
    where: { school_year_id: schoolYearId, deleted_at: null },
    orderBy: { start_date: 'asc' },
  });

  const bghAccount = await prisma.account.findFirst({ where: { role: 'PRINCIPAL_BGH' } });
  const gvAccount = await prisma.account.findFirst({ where: { role: 'TEACHER_GV' } });

  const classes = await prisma.class.findMany({
    where: { school_year_id: schoolYearId, deleted_at: null },
  });

  console.log(`Found ${classes.length} classes and ${allThemes.length} themes in school year 2026-2027.`);

  // Create or update realistic plans for each class and its age group themes
  for (const cls of classes) {
    const ageThemes = allThemes.filter((t) => t.age_group === cls.age_group);
    console.log(`Class ${cls.name} (${cls.age_group}) has ${ageThemes.length} themes.`);

    for (let index = 0; index < ageThemes.length; index++) {
      const theme = ageThemes[index];
      let status = 'DRAFT';
      let reviewNote = null;
      let rejectionReason = null;
      let reviewedAt = null;
      let submittedAt = null;

      // Realistic distribution:
      // Index 0 (Tháng 9): ALL APPROVED (USED)
      if (index === 0) {
        status = 'USED';
        submittedAt = new Date('2026-08-28T09:00:00Z');
        reviewedAt = new Date('2026-08-30T14:30:00Z');
        reviewNote = 'Kế hoạch chi tiết, mục tiêu phát triển toàn diện, phân bổ thời khóa biểu hợp lý.';
      }
      // Index 1 (Tháng 10): 4 PENDING_APPROVAL, 2 USED, 2 REJECTED
      else if (index === 1) {
        if (cls.name.includes('1') && (cls.age_group === 'NHA_TRE' || cls.age_group === 'CHOI')) {
          status = 'PENDING_APPROVAL';
          submittedAt = new Date('2026-09-24T15:00:00Z');
        } else if (cls.name.includes('2') && (cls.age_group === 'MAM' || cls.age_group === 'LA')) {
          status = 'PENDING_APPROVAL';
          submittedAt = new Date('2026-09-25T10:15:00Z');
        } else if (cls.name.includes('2') && cls.age_group === 'NHA_TRE') {
          status = 'REJECTED';
          submittedAt = new Date('2026-09-23T11:00:00Z');
          reviewedAt = new Date('2026-09-25T16:00:00Z');
          rejectionReason = 'Phân bổ mục tiêu nhánh 2 còn thiếu nội dung giáo dục dinh dưỡng và vệ sinh cá nhân, cần bổ sung trước ngày 28/09.';
        } else if (cls.name.includes('1') && cls.age_group === 'MAM') {
          status = 'REJECTED';
          submittedAt = new Date('2026-09-24T09:00:00Z');
          reviewedAt = new Date('2026-09-25T14:00:00Z');
          rejectionReason = 'Thời khóa biểu tuần 3 phân bổ hoạt động tạo hình quá nặng, đề nghị điều chỉnh sang rèn kỹ năng xã hội.';
        } else {
          status = 'USED';
          submittedAt = new Date('2026-09-22T08:30:00Z');
          reviewedAt = new Date('2026-09-24T11:00:00Z');
          reviewNote = 'Đã hoàn thiện tốt theo góp ý từ đợt thẩm định trước.';
        }
      }
      // Index 2 (Tháng 11): 2 PENDING_APPROVAL, 3 DRAFT, 3 Not submitted
      else if (index === 2) {
        if (cls.name === 'Lá 1' || cls.name === 'Mầm 2') {
          status = 'PENDING_APPROVAL';
          submittedAt = new Date('2026-10-18T16:00:00Z');
        } else if (cls.name === 'Chồi 1' || cls.name === 'Nhà trẻ 1' || cls.name === 'Lá 2') {
          status = 'DRAFT';
          submittedAt = null;
        } else {
          // not submitted, skip creating row
          continue;
        }
      } else {
        // Later themes are not yet submitted
        continue;
      }

      // Upsert
      const existingPlan = await prisma.classThemePlan.findFirst({
        where: {
          class_id: cls.class_id,
          theme_id: theme.theme_id,
        },
      });

      if (existingPlan) {
        await prisma.classThemePlan.update({
          where: { id: existingPlan.id },
          data: {
            status,
            submitted_at: submittedAt,
            submitted_by: submittedAt ? (gvAccount?.account_id || null) : null,
            reviewed_at: reviewedAt,
            reviewed_by: reviewedAt ? (bghAccount?.account_id || null) : null,
            review_note: reviewNote,
            rejection_reason: rejectionReason,
          },
        });
      } else {
        await prisma.classThemePlan.create({
          data: {
            class_id: cls.class_id,
            theme_id: theme.theme_id,
            status,
            submitted_at: submittedAt,
            submitted_by: submittedAt ? (gvAccount?.account_id || null) : null,
            reviewed_at: reviewedAt,
            reviewed_by: reviewedAt ? (bghAccount?.account_id || null) : null,
            review_note: reviewNote,
            rejection_reason: rejectionReason,
          },
        });
      }
    }
  }

  console.log('✓ Successfully enriched realistic theme matrix data!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
