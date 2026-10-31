import prisma from '../config/prisma.js';
import { calculateWhoAssessment } from '../utils/who-calculator.js';

async function main() {
  console.log('🔄 Đang đồng bộ và tính toán lại Z-Score WHO cho toàn bộ dữ liệu sức khỏe...');

  const assessments = await prisma.healthAssessment.findMany({
    where: { deleted_at: null },
    include: {
      student: {
        select: {
          student_id: true,
          full_name: true,
          gender: true,
          date_of_birth: true,
        },
      },
    },
    orderBy: { assessment_id: 'asc' },
  });

  console.log(`📊 Tìm thấy tổng cộng: ${assessments.length} bản ghi sức khỏe`);

  let updatedCount = 0;
  for (const h of assessments) {
    if (!h.student) continue;

    const res = await calculateWhoAssessment({
      gender: h.student.gender,
      dateOfBirth: h.student.date_of_birth,
      dateOfMeasurement: h.assessment_date,
      height: Number(h.height),
      weight: Number(h.weight),
    });

    if (res && res.zscores) {
      await prisma.healthAssessment.update({
        where: { assessment_id: h.assessment_id },
        data: {
          bmi: res.bmi,
          height_for_age_zscore: res.zscores.heightForAge,
          weight_for_age_zscore: res.zscores.weightForAge,
          bmi_for_age_zscore: res.zscores.bmiForAge,
        },
      });
      updatedCount++;
    }
  }

  console.log(`✅ Đã cập nhật thành công ${updatedCount}/${assessments.length} bản ghi theo chuẩn WHO 100%!`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('❌ Lỗi tính toán Z-score WHO:', err);
  prisma.$disconnect();
  process.exit(1);
});
