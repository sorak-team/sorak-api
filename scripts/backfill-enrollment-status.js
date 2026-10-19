import prisma from '../src/config/prisma.js';

async function backfill() {
  console.log('Starting backfill for student_enrollments.status...');
  const enrollments = await prisma.studentEnrollment.findMany({
    include: {
      student: true,
      class: {
        include: {
          school_year: true,
        },
      },
    },
  });

  console.log(`Found ${enrollments.length} enrollments to process.`);

  let updatedCount = 0;

  for (const enr of enrollments) {
    let newStatus = 'ENROLLED';
    let leaveReason = null;

    if (!enr.left_at) {
      if (enr.student.status === 'RESERVED') {
        newStatus = 'RESERVED';
        leaveReason = 'Bảo lưu';
      } else if (enr.student.status === 'TRANSFERRED') {
        newStatus = 'TRANSFERRED_SCHOOL';
        leaveReason = 'Chuyển trường';
      } else if (enr.student.status === 'DROPPED_OUT') {
        newStatus = 'DROPPED_OUT';
        leaveReason = 'Thôi học';
      } else {
        newStatus = 'ENROLLED';
      }
    } else {
      // Has left_at: Check if internal transfer
      const transfer = await prisma.classTransfer.findFirst({
        where: {
          student_id: enr.student_id,
          from_class_id: enr.class_id,
          status: 'APPROVED',
        },
      });

      if (transfer) {
        newStatus = 'TRANSFERRED_CLASS';
        leaveReason = transfer.reason || 'Chuyển lớp';
      } else if (enr.class.age_group === 'LA' && (enr.class.school_year?.status === 'COMPLETED' || enr.student.status === 'GRADUATED')) {
        newStatus = 'GRADUATED';
        leaveReason = 'Tốt nghiệp ra trường';
      } else if (enr.class.school_year?.status === 'COMPLETED') {
        newStatus = 'COMPLETED';
        leaveReason = 'Hoàn thành năm học';
      } else if (enr.student.status === 'RESERVED') {
        newStatus = 'RESERVED';
        leaveReason = 'Bảo lưu';
      } else if (enr.student.status === 'TRANSFERRED') {
        newStatus = 'TRANSFERRED_SCHOOL';
        leaveReason = 'Chuyển trường';
      } else if (enr.student.status === 'DROPPED_OUT') {
        newStatus = 'DROPPED_OUT';
        leaveReason = 'Thôi học';
      } else {
        newStatus = 'COMPLETED';
        leaveReason = 'Hoàn thành chương trình';
      }
    }

    await prisma.studentEnrollment.update({
      where: { enrollment_id: enr.enrollment_id },
      data: {
        status: newStatus,
        leave_reason: leaveReason,
      },
    });
    updatedCount++;
  }

  console.log(`Successfully backfilled ${updatedCount} enrollments.`);
  process.exit(0);
}

backfill().catch((err) => {
  console.error('Backfill error:', err);
  process.exit(1);
});
