import { attendanceService } from '../src/services/attendance.service.js';
import { healthService } from '../src/services/health.service.js';
import { goodBehaviorService } from '../src/services/good-behavior.service.js';
import { assessmentService } from '../src/services/assessment.service.js';
import { curriculumService } from '../src/services/curriculum.service.js';
import { planningService } from '../src/services/planning.service.js';
import prisma from '../src/config/prisma.js';

async function verify() {
  console.log('--- Verifying Attendance Service ---');
  const att = await attendanceService.getTimetableOverview({ classId: '5' });
  console.log('Attendance Class:', att.classInfo.name, 'Students:', att.students.length, 'Present:', att.stats.presentCount, 'Absent:', att.stats.absentCount);
  console.log('Sample student attendance:', att.students[0]);

  console.log('\n--- Verifying Health Service ---');
  const health = await healthService.getHealthOverview({ classId: '5' });
  console.log('Health Class:', health.classInfo.name, 'Students:', health.students.length);
  console.log('Sample student health:', health.students[0]);

  console.log('\n--- Verifying Good Behavior Service ---');
  const gb = await goodBehaviorService.getGoodBehaviorOverview({ classId: '5' });
  console.log('Good Behavior Students:', gb.students.length, 'Sample:', gb.students[0]);

  console.log('\n--- Verifying Assessment Service ---');
  const assess = await assessmentService.getAssessmentOverview({ classId: '5' });
  console.log('Assessment Activity:', assess.activeActivity.title, 'Students:', assess.students.length, 'P:', assess.stats.pCount, 'N:', assess.stats.nCount);

  const monthly = await assessmentService.getMonthlyAssessments({ classId: '5', month: 10, year: 2026 });
  console.log('Monthly Assessments Month 10:', monthly.students.length, 'Sample:', monthly.students[0]);

  console.log('\n--- Verifying Curriculum Service ---');
  const themeDetail = await curriculumService.getThemeSetDetail({ year: '2026–2027', ageGroup: 'nhatre' });
  console.log('Curriculum Themes (Nhà trẻ):', themeDetail.themes.length, 'Total subthemes:', themeDetail.summary.totalSubThemes);
  console.log('Theme 1:', themeDetail.themes[0].name, 'Subthemes count:', themeDetail.themes[0].subThemes.length);

  const goalDetail = await curriculumService.getGoalBankDetail({ year: '2026–2027', ageGroup: 'nhatre' });
  console.log('Curriculum Goal Bank Domains:', goalDetail.tree.length, 'Total Goals:', goalDetail.info.totalGoals);
  console.log('Domain 1:', goalDetail.tree[0].title, 'Goals in Domain 1:', goalDetail.tree[0].children.length);

  console.log('\n--- Verifying Planning Service ---');
  const plan = await planningService.getThemeActivities({ classId: '5' });
  console.log('Planning Themes:', plan.themes.length, 'Goals with activities:', plan.goals.length, 'Total activities:', plan.stats.totalActivities);

  await prisma.$disconnect();
}

verify().catch((e) => {
  console.error('Verification error:', e);
  process.exit(1);
});
