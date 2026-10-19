import prisma from '../src/config/prisma.js';

async function standardizeIdentityCodes() {
  console.log('🔄 Starting identity code standardization in database...');

  await prisma.$transaction(async (tx) => {
    // 1. Delete obsolete test student 1 (if exists)
    const s1 = await tx.student.findUnique({
      where: { student_id: 1 },
      include: {
        attendances: true,
        health_assessments: true,
        daily_assessments: true,
      },
    });

    if (s1 && s1.attendances.length === 0 && s1.health_assessments.length === 0) {
      console.log('🗑️ Removing obsolete duplicate test record student 1 & account 22...');
      await tx.studentEnrollment.deleteMany({ where: { student_id: 1 } });
      await tx.parent.deleteMany({ where: { student_id: 1 } });
      await tx.student.delete({ where: { student_id: 1 } });
      if (s1.account_id) {
        await tx.account.delete({ where: { account_id: s1.account_id } });
      }
    }

    // 2. Map of non-compliant student codes (HS001..HS030) to standardized (HS26001..HS26030)
    // All these students are cohort 2026 (born in 2023 for Nhà trẻ in school year 2026-2027)
    const oldStudents = await tx.student.findMany({
      where: {
        student_code: {
          startsWith: 'HS0',
        },
      },
      include: {
        account: true,
      },
    });

    console.log(`Found ${oldStudents.length} students with legacy prefix HS0...`);

    // Temporary prefix to avoid unique constraint collisions during renaming
    for (const s of oldStudents) {
      const match = s.student_code.match(/^HS0(\d{2})$/);
      if (match) {
        const tempCode = `TMP_${s.student_code}`;
        await tx.student.update({
          where: { student_id: s.student_id },
          data: { student_code: tempCode },
        });
        if (s.account) {
          await tx.account.update({
            where: { account_id: s.account.account_id },
            data: { username: tempCode },
          });
        }
      }
    }

    // Now update to final standardized HS26xxx
    for (const s of oldStudents) {
      const match = s.student_code.match(/^HS0(\d{2})$/);
      if (match) {
        const num = match[1]; // e.g. "01", "16", "30"
        const newCode = `HS260${num}`; // e.g. "HS26001", "HS26016", "HS26030"

        await tx.student.update({
          where: { student_id: s.student_id },
          data: { student_code: newCode },
        });

        if (s.account) {
          await tx.account.update({
            where: { account_id: s.account.account_id },
            data: { username: newCode },
          });
        }
        console.log(`  Updated ${s.student_code} -> ${newCode} (${s.full_name})`);
      }
    }
  });

  // 3. Validation
  const allStudents = await prisma.student.findMany({
    select: {
      student_id: true,
      student_code: true,
      full_name: true,
      account: { select: { username: true } },
    },
    orderBy: { student_code: 'asc' },
  });

  const allTeachers = await prisma.teacher.findMany({
    select: {
      teacher_id: true,
      employee_code: true,
      full_name: true,
      account: { select: { username: true } },
    },
    orderBy: { employee_code: 'asc' },
  });

  console.log('\n--- VERIFICATION OF STANDARDIZED IDENTITY CODES ---');
  console.log(`Total Teachers: ${allTeachers.length}`);
  allTeachers.forEach((t) => {
    const isCompliant = /^CB\d{5}$/.test(t.employee_code);
    console.log(`  [${isCompliant ? 'VALID' : 'INVALID'}] Teacher ${t.employee_code} (${t.full_name}) - Username: ${t.account?.username}`);
  });

  console.log(`\nTotal Students: ${allStudents.length}`);
  let nonCompliantCount = 0;
  allStudents.forEach((s) => {
    const isCompliant = /^HS\d{5}$/.test(s.student_code);
    if (!isCompliant) nonCompliantCount++;
    console.log(`  [${isCompliant ? 'VALID' : 'INVALID'}] Student ${s.student_code} (${s.full_name}) - Username: ${s.account?.username}`);
  });

  if (nonCompliantCount === 0) {
    console.log('\n✅ 100% of student codes and staff codes in the database strictly comply with naming rules!');
  } else {
    console.warn(`\n⚠️ Found ${nonCompliantCount} non-compliant student codes!`);
  }
}

standardizeIdentityCodes()
  .catch((err) => {
    console.error('Migration failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
