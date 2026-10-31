import bcrypt from 'bcryptjs';
import prisma from '../src/config/prisma.js';

async function seedTest2() {
  console.log('🌱 [Test2] Seeding minimal environment...');

  const defaultPassword = await bcrypt.hash('Sorak@2026', 10);

  // 1. Chỉ tạo 2 năm học
  console.log('🌱 Seeding 2 school years...');
  const pastYear = await prisma.schoolYear.upsert({
    where: { name: 'Năm học 2025–2026' },
    update: {},
    create: {
      name: 'Năm học 2025–2026',
      start_date: new Date('2025-09-05'),
      semester_1_end_date: new Date('2026-01-15'),
      end_date: new Date('2026-05-31'),
      status: 'COMPLETED',
      color_theme: 'amber',
    },
  });

  const activeYear = await prisma.schoolYear.upsert({
    where: { name: 'Năm học 2026–2027' },
    update: {},
    create: {
      name: 'Năm học 2026–2027',
      start_date: new Date('2026-09-05'),
      semester_1_end_date: new Date('2027-01-15'),
      end_date: new Date('2027-05-31'),
      status: 'ACTIVE',
      color_theme: 'blue',
    },
  });

  console.log(`✓ Created/Verified 2 School Years: ${pastYear.name}, ${activeYear.name}`);

  // 2. Chỉ tạo 1 tài khoản Ban Giám Hiệu (BGH)
  console.log('🌱 Seeding 1 BGH account...');
  const adminAcc = await prisma.account.upsert({
    where: { username: 'CB20001' },
    update: {
      role: 'PRINCIPAL_BGH',
      password_hash: defaultPassword,
      is_active: true,
    },
    create: {
      username: 'CB20001',
      password_hash: defaultPassword,
      role: 'PRINCIPAL_BGH',
      is_active: true,
      last_login_at: new Date(),
    },
  });

  await prisma.teacher.upsert({
    where: { citizen_id: '079185001111' },
    update: {
      account_id: adminAcc.account_id,
      employee_code: 'CB20001',
      full_name: 'Nguyễn Thu Trang',
      date_of_birth: new Date('1985-04-12'),
      gender: 'FEMALE',
      citizen_id: '079185001111',
      phone: '0987654321',
      email: 'admin@sorak.edu.vn',
      position: 'Hiệu trưởng',
      work_status: 'WORKING',
      start_date: new Date('2020-01-01'),
      address: 'Phường Bến Nghé, Quận 1, TP.HCM',
    },
    create: {
      account_id: adminAcc.account_id,
      employee_code: 'CB20001',
      full_name: 'Nguyễn Thu Trang',
      date_of_birth: new Date('1985-04-12'),
      gender: 'FEMALE',
      citizen_id: '079185001111',
      phone: '0987654321',
      email: 'admin@sorak.edu.vn',
      position: 'Hiệu trưởng',
      work_status: 'WORKING',
      start_date: new Date('2020-01-01'),
      address: 'Phường Bến Nghé, Quận 1, TP.HCM',
    },
  });

  console.log(`✓ Created 1 BGH Account: CB20001 (Nguyễn Thu Trang - Hiệu trưởng)`);
  console.log('🎉 [Test2] Minimal seed complete! Exactly 2 school years and 1 BGH account.');
}

seedTest2()
  .catch((err) => {
    console.error('Seed error:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
