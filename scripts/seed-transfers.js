import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('--- Inspecting Current DB State ---');
  const count = await prisma.classTransfer.count();
  console.log(`Current classTransfer count: ${count}`);

  const activeEnrollments = await prisma.studentEnrollment.findMany({
    where: { left_at: null },
    include: {
      student: true,
      class: {
        include: { school_year: true },
      },
    },
    take: 10,
  });

  console.log(`Found ${activeEnrollments.length} active enrollments:`);
  for (const e of activeEnrollments) {
    console.log(`- ${e.student.student_code} (${e.student.full_name}) in class ${e.class.name} (${e.class.age_group})`);
  }

  const allClasses = await prisma.class.findMany({
    where: { deleted_at: null },
    include: { school_year: true },
  });

  console.log(`Total classes in DB: ${allClasses.length}`);

  const adminAccount = await prisma.account.findFirst({
    where: { role: 'PRINCIPAL_BGH' },
  });
  const creatorId = adminAccount ? adminAccount.account_id : 1n;

  // Let's create 3 sample transfer requests if we have at least 2 classes and enrolled students
  if (activeEnrollments.length >= 2 && allClasses.length >= 2) {
    const samples = [
      {
        enrollment: activeEnrollments[0],
        reason: 'Phụ huynh xin chuyển sang lớp Mầm 2 để học cùng anh chị họ và thuận tiện đón đưa',
        status: 'PENDING',
        transferDate: new Date('2026-10-15'),
      },
      {
        enrollment: activeEnrollments[1],
        reason: 'Giáo viên chủ nhiệm đề xuất điều chuyển sĩ số theo định biên nhà trường',
        status: 'APPROVED',
        transferDate: new Date('2026-10-01'),
      },
      {
        enrollment: activeEnrollments[2] || activeEnrollments[0],
        reason: 'Gia đình thay đổi nơi cư trú sang khu vực gần lớp Chồi 2',
        status: 'REJECTED',
        rejectedReason: 'Sĩ số lớp Chồi 2 đã vượt quá quy định 30 trẻ/lớp của Bộ GD&ĐT',
        transferDate: new Date('2026-09-20'),
      },
    ];

    for (let i = 0; i < samples.length; i++) {
      const s = samples[i];
      if (!s.enrollment) continue;

      // Find a destination class that is DIFFERENT from from_class
      const destClass = allClasses.find(
        (c) => c.class_id !== s.enrollment.class_id && c.age_group === s.enrollment.class.age_group
      ) || allClasses.find((c) => c.class_id !== s.enrollment.class_id);

      if (!destClass) continue;

      // Check if already exists
      const existing = await prisma.classTransfer.findFirst({
        where: {
          student_id: s.enrollment.student_id,
          from_class_id: s.enrollment.class_id,
          to_class_id: destClass.class_id,
        },
      });

      if (!existing) {
        const created = await prisma.classTransfer.create({
          data: {
            student_id: s.enrollment.student_id,
            from_class_id: s.enrollment.class_id,
            to_class_id: destClass.class_id,
            transfer_date: s.transferDate,
            reason: s.reason,
            status: s.status,
            rejected_reason: s.rejectedReason || null,
            created_by: creatorId,
            approved_by: s.status === 'APPROVED' ? creatorId : null,
            approved_at: s.status === 'APPROVED' ? new Date() : null,
          },
        });
        console.log(`Created sample transfer #${i + 1}: ${s.enrollment.student.full_name} (${s.enrollment.class.name} -> ${destClass.name}) [${s.status}]`);
      } else {
        console.log(`Transfer for ${s.enrollment.student.full_name} already exists, skipping.`);
      }
    }
  }

  const newCount = await prisma.classTransfer.count();
  console.log(`New total classTransfer count: ${newCount}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
