import prisma from '../src/config/prisma.js';

async function inspect() {
  const atts = await prisma.attendance.findMany({
    where: { student_id: 17n },
    orderBy: { date: 'desc' },
    take: 5,
  });
  console.log('Student 17 recent attendances:', atts);

  const classes = await prisma.class.findMany({
    include: {
      student_enrollments: true,
    }
  });
  console.log('Classes:', classes.map(c => ({
    id: Number(c.class_id),
    name: c.name,
    age_group: c.age_group,
    year_id: Number(c.school_year_id),
    students_count: c.student_enrollments.length
  })));

  const allStudents = await prisma.student.findMany({
    select: {
      student_id: true,
      student_code: true,
      full_name: true,
      student_enrollments: {
        include: {
          class: true
        }
      }
    }
  });
  console.log('All 29 students and classes:');
  allStudents.forEach(s => {
    const cls = s.student_enrollments.map(e => `${e.class.name} (Year ${e.class.school_year_id})`).join(', ');
    console.log(`- ${s.student_code} [${s.student_id}]: ${s.full_name} -> ${cls || 'NO ENROLLMENT'}`);
  });

  const totalStudents = await prisma.student.count();
  console.log('Total students in DB:', totalStudents);

  const teachers = await prisma.teacher.findMany({
    select: {
      teacher_id: true,
      account_id: true,
      full_name: true
    }
  });
  console.log('Teachers:', teachers.map(t => ({
    id: Number(t.teacher_id),
    account_id: t.account_id ? Number(t.account_id) : null,
    name: t.full_name
  })));

  const accounts = await prisma.account.findMany({
    select: {
      account_id: true,
      username: true,
      role: true
    }
  });
  console.log('Accounts count:', accounts.length, accounts.map(a => ({ id: Number(a.account_id), role: a.role })));

  const themesCount = await prisma.curriculumTheme.count();
  const goalsCount = await prisma.educationalGoal.count();
  const contentsCount = await prisma.educationalContent.count();
  const activitiesCount = await prisma.educationalActivity.count();
  const attendanceCount = await prisma.attendance.count();
  const healthCount = await prisma.healthAssessment.count();
  const monthlyCount = await prisma.monthlyAssessment.count();
  const dailyCount = await prisma.dailyAssessment.count();

  console.log('Counts in DB:', {
    themesCount,
    goalsCount,
    contentsCount,
    activitiesCount,
    attendanceCount,
    healthCount,
    monthlyCount,
    dailyCount,
  });

  await prisma.$disconnect();
}

inspect().catch(err => {
  console.error(err);
  process.exit(1);
});
