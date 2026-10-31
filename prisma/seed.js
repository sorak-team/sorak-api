import bcrypt from 'bcryptjs';
import prisma from '../src/config/prisma.js';

async function seed() {
  console.log('🌱 Seeding authentication accounts & profiles...');

  const defaultPassword = await bcrypt.hash('Sorak@2026', 10);

  // 1. School Years & Classes Seeding First (for relations)
  console.log('🌱 Seeding school years and homeroom classrooms...');

  const activeYear = await prisma.schoolYear.upsert({
    where: { name: 'Năm học 2026–2027' },
    update: {},
    create: {
      name: 'Năm học 2026–2027',
      start_date: new Date('2026-09-05'),
      semester_1_end_date: new Date('2027-01-15'),
      end_date: new Date('2027-05-31'),
      status: 'ACTIVE',
    },
  });

  await prisma.schoolYear.upsert({
    where: { name: 'Năm học 2025–2026' },
    update: {},
    create: {
      name: 'Năm học 2025–2026',
      start_date: new Date('2025-09-05'),
      semester_1_end_date: new Date('2026-01-15'),
      end_date: new Date('2026-05-31'),
      status: 'COMPLETED',
    },
  });

  await prisma.schoolYear.upsert({
    where: { name: 'Năm học 2027–2028' },
    update: {},
    create: {
      name: 'Năm học 2027–2028',
      start_date: new Date('2027-09-05'),
      semester_1_end_date: new Date('2028-01-15'),
      end_date: new Date('2028-05-31'),
      status: 'UPCOMING',
    },
  });

  // Seed standard classes for the active school year
  const sampleClasses = [
    { name: 'Nhà trẻ 1', age_group: 'NHA_TRE', room_number: 'Phòng 101' },
    { name: 'Nhà trẻ 2', age_group: 'NHA_TRE', room_number: 'Phòng 102' },
    { name: 'Mầm 1', age_group: 'MAM', room_number: 'Phòng 201' },
    { name: 'Mầm 2', age_group: 'MAM', room_number: 'Phòng 202' },
    { name: 'Chồi 1', age_group: 'CHOI', room_number: 'Phòng 203' },
    { name: 'Chồi 2', age_group: 'CHOI', room_number: 'Phòng 204' },
    { name: 'Lá 1', age_group: 'LA', room_number: 'Phòng 301' },
    { name: 'Lá 2', age_group: 'LA', room_number: 'Phòng 302' },
  ];

  const createdClasses = {};
  for (const c of sampleClasses) {
    const cls = await prisma.class.upsert({
      where: {
        school_year_id_name: {
          school_year_id: activeYear.school_year_id,
          name: c.name,
        },
      },
      update: {
        room_number: c.room_number,
      },
      create: {
        school_year_id: activeYear.school_year_id,
        name: c.name,
        age_group: c.age_group,
        room_number: c.room_number,
        description: `${c.name} - Niên khóa 2026-2027`,
      },
    });
    createdClasses[c.name] = cls;
  }

  // 2. Admin / Principal Account (Pure credentials)
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
  console.log('✅ Created Principal account & profile: CB20001 (role: PRINCIPAL_BGH)');

  // 3. Teacher Accounts & Profiles (Pure credentials on accounts, contact/profile on teachers)
  const defaultTeachers = [
    {
      username: 'CB24001',
      employee_code: 'CB24001',
      full_name: 'Trần Thị Mai',
      email: 'maith@sorak.vn',
      phone: '0908123456',
      gender: 'FEMALE',
      date_of_birth: new Date('1996-12-11'),
      citizen_id: '079196001234',
      position: 'Phó hiệu trưởng',
      work_status: 'WORKING',
      start_date: new Date('2024-08-15'),
      address: '123 Nguyễn Văn Cừ, Quận 5, TP.HCM',
      assigned_class: 'Mầm 1',
    },
    {
      username: 'CB25001',
      employee_code: 'CB25001',
      full_name: 'Nguyễn Đình Vinh',
      email: 'vinhnd@sorak.vn',
      phone: '0788876568',
      gender: 'MALE',
      date_of_birth: new Date('1998-05-07'),
      citizen_id: '079198005678',
      position: 'Giáo viên',
      work_status: 'WORKING',
      start_date: new Date('2025-07-01'),
      address: '45 Lê Hồng Phong, Quận 10, TP.HCM',
      assigned_class: 'Mầm 1',
    },
    {
      username: 'CB26001',
      employee_code: 'CB26001',
      full_name: 'Lê Ngọc Hân',
      email: 'hanln@sorak.vn',
      phone: '0912345678',
      gender: 'FEMALE',
      date_of_birth: new Date('1999-09-05'),
      citizen_id: '079199009876',
      position: 'Giáo viên',
      work_status: 'WORKING',
      start_date: new Date('2026-09-01'),
      address: '78 Trường Chinh, Tân Bình, TP.HCM',
      assigned_class: 'Chồi 1',
    },
    {
      username: 'CB26002',
      employee_code: 'CB26002',
      full_name: 'Nguyễn Minh Khánh',
      email: 'khanhnm@sorak.vn',
      phone: '0912999888',
      gender: 'MALE',
      date_of_birth: new Date('1998-01-01'),
      citizen_id: '079962928078',
      position: 'Giáo viên',
      work_status: 'WORKING',
      start_date: new Date('2026-09-01'),
      address: '24 Điện Biên Phủ, TP. Rạch Giá, Kiên Giang',
      assigned_class: null,
    },
    {
      username: 'CB24002',
      employee_code: 'CB24002',
      full_name: 'Phạm Hoàng Anh',
      email: 'anhph@sorak.vn',
      phone: '0933456123',
      gender: 'MALE',
      date_of_birth: new Date('1997-03-22'),
      citizen_id: '079197003456',
      position: 'Giáo viên',
      work_status: 'LEAVE_OF_ABSENCE',
      start_date: new Date('2024-06-10'),
      address: '89 Điện Biên Phủ, Bình Thạnh, TP.HCM',
      assigned_class: null,
    },
    {
      username: 'CB26003',
      employee_code: 'CB26003',
      full_name: 'Trần Công Trực',
      email: 'tructc@sorak.vn',
      phone: '0912777666',
      gender: 'MALE',
      date_of_birth: new Date('1998-01-01'),
      citizen_id: '079964212268',
      position: 'Giáo viên',
      work_status: 'WORKING',
      start_date: new Date('2026-09-01'),
      address: '56 Hoàng Hoa Thám, TP. Rạch Giá, Kiên Giang',
      assigned_class: null,
    },
  ];

  for (const t of defaultTeachers) {
    const acc = await prisma.account.upsert({
      where: { username: t.username },
      update: {
        role: 'TEACHER_GV',
        password_hash: defaultPassword,
      },
      create: {
        username: t.username,
        password_hash: defaultPassword,
        role: 'TEACHER_GV',
        is_active: true,
        last_login_at: new Date(),
      },
    });

    const teacherRec = await prisma.teacher.upsert({
      where: { citizen_id: t.citizen_id },
      update: {
        account_id: acc.account_id,
        employee_code: t.employee_code,
        full_name: t.full_name,
        date_of_birth: t.date_of_birth,
        gender: t.gender,
        citizen_id: t.citizen_id,
        phone: t.phone,
        email: t.email,
        position: t.position,
        work_status: t.work_status,
        start_date: t.start_date,
        address: t.address,
      },
      create: {
        account_id: acc.account_id,
        employee_code: t.employee_code,
        full_name: t.full_name,
        date_of_birth: t.date_of_birth,
        gender: t.gender,
        citizen_id: t.citizen_id,
        phone: t.phone,
        email: t.email,
        position: t.position,
        work_status: t.work_status,
        start_date: t.start_date,
        address: t.address,
      },
    });

    if (t.assigned_class && createdClasses[t.assigned_class]) {
      const classRec = createdClasses[t.assigned_class];
      // Ensure teacher only has one active class in the same school year
      await prisma.teacherClass.updateMany({
        where: {
          teacher_id: teacherRec.teacher_id,
          class_id: { not: classRec.class_id },
          left_at: null,
          class: {
            school_year_id: classRec.school_year_id,
          },
        },
        data: {
          left_at: new Date('2026-09-05'),
          leave_reason: 'COMPLETED_SCHOOL_YEAR',
        },
      });

      const existingAllocation = await prisma.teacherClass.findFirst({
        where: {
          teacher_id: teacherRec.teacher_id,
          class_id: classRec.class_id,
          left_at: null,
        },
      });

      if (!existingAllocation) {
        await prisma.teacherClass.create({
          data: {
            teacher_id: teacherRec.teacher_id,
            class_id: classRec.class_id,
            assigned_at: new Date('2026-09-05'),
          },
        });
      }
    }
  }
  console.log(`✅ Seeded ${defaultTeachers.length} Teacher accounts & profiles`);

  // 4. Student & Parent Accounts (Pure credentials on accounts, contact on parents, toddler profile on students)
  const defaultStudents = [
    // Pool students (Chưa phân lớp trong năm học 2026–2027)
    {
      username: 'HS26001',
      student_code: 'HS26001',
      full_name: 'Nguyễn Minh An',
      gender: 'MALE',
      date_of_birth: new Date('2023-02-12'),
      enrollment_date: new Date('2025-09-05'),
      status: 'STUDYING',
      previous_school: null,
      class_name: null,
      parents: [{ full_name: 'Nguyễn Văn Minh', relationship: 'Bố', phone: '0901111001' }],
    },
    {
      username: 'HS26002',
      student_code: 'HS26002',
      full_name: 'Trần Gia Bảo',
      gender: 'MALE',
      date_of_birth: new Date('2023-03-28'),
      enrollment_date: new Date('2025-09-05'),
      status: 'STUDYING',
      previous_school: 'NT-B1 · 2025–26',
      class_name: null,
      parents: [{ full_name: 'Trần Văn Bảo', relationship: 'Bố', phone: '0901111002' }],
    },
    {
      username: 'HS26003',
      student_code: 'HS26003',
      full_name: 'Lê Khánh Chi',
      gender: 'FEMALE',
      date_of_birth: new Date('2023-01-04'),
      enrollment_date: new Date('2025-09-05'),
      status: 'STUDYING',
      previous_school: 'NT-A2 · 2025–26',
      class_name: null,
      parents: [{ full_name: 'Lê Hoàng Nam', relationship: 'Bố', phone: '0901111003' }],
    },
    {
      username: 'HS26004',
      student_code: 'HS26004',
      full_name: 'Phạm Nhật Duy',
      gender: 'MALE',
      date_of_birth: new Date('2023-05-17'),
      enrollment_date: new Date('2025-09-05'),
      status: 'STUDYING',
      previous_school: null,
      class_name: null,
      parents: [{ full_name: 'Phạm Văn Duy', relationship: 'Bố', phone: '0901111004' }],
    },
    {
      username: 'HS26005',
      student_code: 'HS26005',
      full_name: 'Võ Ngọc Hà',
      gender: 'FEMALE',
      date_of_birth: new Date('2023-04-09'),
      enrollment_date: new Date('2025-09-05'),
      status: 'STUDYING',
      previous_school: 'NT-C1 · 2025–26',
      class_name: null,
      parents: [{ full_name: 'Võ Minh Hà', relationship: 'Bố', phone: '0901111005' }],
    },
    {
      username: 'HS26006',
      student_code: 'HS26006',
      full_name: 'Nguyễn Gia Hân',
      gender: 'FEMALE',
      date_of_birth: new Date('2023-02-23'),
      enrollment_date: new Date('2025-09-05'),
      status: 'STUDYING',
      previous_school: 'NT-A1 · 2025–26',
      class_name: null,
      parents: [{ full_name: 'Nguyễn Tuấn Hân', relationship: 'Bố', phone: '0901111006' }],
    },
    {
      username: 'HS26007',
      student_code: 'HS26007',
      full_name: 'Trần Minh Khang',
      gender: 'MALE',
      date_of_birth: new Date('2023-06-11'),
      enrollment_date: new Date('2025-09-05'),
      status: 'STUDYING',
      previous_school: null,
      class_name: null,
      parents: [{ full_name: 'Trần Quốc Khang', relationship: 'Bố', phone: '0901111007' }],
    },
    {
      username: 'HS26008',
      student_code: 'HS26008',
      full_name: 'Lê Bảo Khôi',
      gender: 'MALE',
      date_of_birth: new Date('2023-01-30'),
      enrollment_date: new Date('2025-09-05'),
      status: 'STUDYING',
      previous_school: 'NT-B2 · 2025–26',
      class_name: null,
      parents: [{ full_name: 'Lê Văn Khôi', relationship: 'Bố', phone: '0901111008' }],
    },

    // Enrolled in Nhà trẻ A1 (18 students)
    {
      username: 'HS26016',
      student_code: 'HS26016',
      full_name: 'Nguyễn Anh Thư',
      gender: 'FEMALE',
      date_of_birth: new Date('2023-01-18'),
      enrollment_date: new Date('2026-09-05'),
      status: 'STUDYING',
      previous_school: null,
      class_name: 'Nhà trẻ A1',
      parents: [{ full_name: 'Nguyễn Quốc Thư', relationship: 'Bố', phone: '0901111016' }],
    },
    {
      username: 'HS26017',
      student_code: 'HS26017',
      full_name: 'Trần Hải Yến',
      gender: 'FEMALE',
      date_of_birth: new Date('2023-02-22'),
      enrollment_date: new Date('2026-09-05'),
      status: 'STUDYING',
      previous_school: null,
      class_name: 'Nhà trẻ A1',
      parents: [{ full_name: 'Trần Đình Yến', relationship: 'Bố', phone: '0901111017' }],
    },
    {
      username: 'HS26018',
      student_code: 'HS26018',
      full_name: 'Lê Minh Anh',
      gender: 'FEMALE',
      date_of_birth: new Date('2023-03-05'),
      enrollment_date: new Date('2026-09-05'),
      status: 'STUDYING',
      previous_school: null,
      class_name: 'Nhà trẻ A1',
      parents: [{ full_name: 'Lê Tuấn Anh', relationship: 'Bố', phone: '0901111018' }],
    },
    {
      username: 'HS26009',
      student_code: 'HS26009',
      full_name: 'Phạm Tuệ Lâm',
      gender: 'FEMALE',
      date_of_birth: new Date('2023-03-15'),
      enrollment_date: new Date('2026-09-05'),
      status: 'STUDYING',
      previous_school: null,
      class_name: 'Nhà trẻ A1',
      parents: [{ full_name: 'Phạm Hải Lâm', relationship: 'Bố', phone: '0901111009' }],
    },
    {
      username: 'HS26010',
      student_code: 'HS26010',
      full_name: 'Võ Gia Linh',
      gender: 'FEMALE',
      date_of_birth: new Date('2023-04-20'),
      enrollment_date: new Date('2026-09-05'),
      status: 'STUDYING',
      previous_school: null,
      class_name: 'Nhà trẻ A1',
      parents: [{ full_name: 'Võ Anh Linh', relationship: 'Bố', phone: '0901111010' }],
    },
    {
      username: 'HS26011',
      student_code: 'HS26011',
      full_name: 'Nguyễn Đức Minh',
      gender: 'MALE',
      date_of_birth: new Date('2023-05-10'),
      enrollment_date: new Date('2026-09-05'),
      status: 'STUDYING',
      previous_school: null,
      class_name: 'Nhà trẻ A1',
      parents: [{ full_name: 'Nguyễn Hoàng Minh', relationship: 'Bố', phone: '0901111011' }],
    },
    {
      username: 'HS26019',
      student_code: 'HS26019',
      full_name: 'Đặng Quang Huy',
      gender: 'MALE',
      date_of_birth: new Date('2023-04-12'),
      enrollment_date: new Date('2026-09-05'),
      status: 'STUDYING',
      previous_school: null,
      class_name: 'Nhà trẻ A1',
      parents: [{ full_name: 'Đặng Văn Huy', relationship: 'Bố', phone: '0901111019' }],
    },
    {
      username: 'HS26020',
      student_code: 'HS26020',
      full_name: 'Hoàng Mỹ Uyên',
      gender: 'FEMALE',
      date_of_birth: new Date('2023-06-01'),
      enrollment_date: new Date('2026-09-05'),
      status: 'STUDYING',
      previous_school: null,
      class_name: 'Nhà trẻ A1',
      parents: [{ full_name: 'Hoàng Đức Uyên', relationship: 'Bố', phone: '0901111020' }],
    },
    {
      username: 'HS26021',
      student_code: 'HS26021',
      full_name: 'Bùi Tuấn Khang',
      gender: 'MALE',
      date_of_birth: new Date('2023-02-08'),
      enrollment_date: new Date('2026-09-05'),
      status: 'STUDYING',
      previous_school: null,
      class_name: 'Nhà trẻ A1',
      parents: [{ full_name: 'Bùi Thế Khang', relationship: 'Bố', phone: '0901111021' }],
    },
    {
      username: 'HS26022',
      student_code: 'HS26022',
      full_name: 'Đỗ Thùy Trang',
      gender: 'FEMALE',
      date_of_birth: new Date('2023-03-25'),
      enrollment_date: new Date('2026-09-05'),
      status: 'STUDYING',
      previous_school: null,
      class_name: 'Nhà trẻ A1',
      parents: [{ full_name: 'Đỗ Tiến Trang', relationship: 'Bố', phone: '0901111022' }],
    },
    {
      username: 'HS26023',
      student_code: 'HS26023',
      full_name: 'Vũ Hoàng Long',
      gender: 'MALE',
      date_of_birth: new Date('2023-05-14'),
      enrollment_date: new Date('2026-09-05'),
      status: 'STUDYING',
      previous_school: null,
      class_name: 'Nhà trẻ A1',
      parents: [{ full_name: 'Vũ Hải Long', relationship: 'Bố', phone: '0901111023' }],
    },
    {
      username: 'HS26024',
      student_code: 'HS26024',
      full_name: 'Phan Bảo Ngọc',
      gender: 'FEMALE',
      date_of_birth: new Date('2023-01-29'),
      enrollment_date: new Date('2026-09-05'),
      status: 'STUDYING',
      previous_school: null,
      class_name: 'Nhà trẻ A1',
      parents: [{ full_name: 'Phan Duy Ngọc', relationship: 'Bố', phone: '0901111024' }],
    },
    {
      username: 'HS26025',
      student_code: 'HS26025',
      full_name: 'Lý Quốc Bảo',
      gender: 'MALE',
      date_of_birth: new Date('2023-04-05'),
      enrollment_date: new Date('2026-09-05'),
      status: 'STUDYING',
      previous_school: null,
      class_name: 'Nhà trẻ A1',
      parents: [{ full_name: 'Lý Thế Bảo', relationship: 'Bố', phone: '0901111025' }],
    },
    {
      username: 'HS26026',
      student_code: 'HS26026',
      full_name: 'Trương Kim Ngân',
      gender: 'FEMALE',
      date_of_birth: new Date('2023-02-18'),
      enrollment_date: new Date('2026-09-05'),
      status: 'STUDYING',
      previous_school: null,
      class_name: 'Nhà trẻ A1',
      parents: [{ full_name: 'Trương Văn Ngân', relationship: 'Bố', phone: '0901111026' }],
    },
    {
      username: 'HS26027',
      student_code: 'HS26027',
      full_name: 'Mai Phương Linh',
      gender: 'FEMALE',
      date_of_birth: new Date('2023-03-30'),
      enrollment_date: new Date('2026-09-05'),
      status: 'STUDYING',
      previous_school: null,
      class_name: 'Nhà trẻ 1',
      parents: [{ full_name: 'Mai Thanh Linh', relationship: 'Bố', phone: '0901111027' }],
    },
    {
      username: 'HS26028',
      student_code: 'HS26028',
      full_name: 'Đoàn Gia Hưng',
      gender: 'MALE',
      date_of_birth: new Date('2023-05-22'),
      enrollment_date: new Date('2026-09-05'),
      status: 'STUDYING',
      previous_school: null,
      class_name: 'Nhà trẻ 1',
      parents: [{ full_name: 'Đoàn Văn Hưng', relationship: 'Bố', phone: '0901111028' }],
    },
    {
      username: 'HS26029',
      student_code: 'HS26029',
      full_name: 'Cao Thùy Dương',
      gender: 'FEMALE',
      date_of_birth: new Date('2023-06-09'),
      enrollment_date: new Date('2026-09-05'),
      status: 'STUDYING',
      previous_school: null,
      class_name: 'Nhà trẻ 1',
      parents: [{ full_name: 'Cao Văn Dương', relationship: 'Bố', phone: '0901111029' }],
    },
    {
      username: 'HS26030',
      student_code: 'HS26030',
      full_name: 'Lâm Thiên An',
      gender: 'MALE',
      date_of_birth: new Date('2023-01-15'),
      enrollment_date: new Date('2026-09-05'),
      status: 'STUDYING',
      previous_school: null,
      class_name: 'Nhà trẻ 1',
      parents: [{ full_name: 'Lâm Văn An', relationship: 'Bố', phone: '0901111030' }],
    },
  ];

  for (const s of defaultStudents) {
    const acc = await prisma.account.upsert({
      where: { username: s.username },
      update: {
        role: 'PARENT_PH',
        password_hash: defaultPassword,
      },
      create: {
        username: s.username,
        password_hash: defaultPassword,
        role: 'PARENT_PH',
        is_active: true,
        last_login_at: new Date(),
      },
    });

    const studentRec = await prisma.student.upsert({
      where: { student_code: s.student_code },
      update: {
        account_id: acc.account_id,
        full_name: s.full_name,
        avatar_url: null,
        date_of_birth: s.date_of_birth,
        gender: s.gender,
        enrollment_date: s.enrollment_date,
        status: s.status,
        previous_school: s.previous_school,
      },
      create: {
        account_id: acc.account_id,
        student_code: s.student_code,
        full_name: s.full_name,
        avatar_url: null,
        date_of_birth: s.date_of_birth,
        gender: s.gender,
        enrollment_date: s.enrollment_date,
        status: s.status,
        previous_school: s.previous_school,
      },
    });

    // Parents
    for (const p of s.parents) {
      const existingParent = await prisma.parent.findFirst({
        where: {
          student_id: studentRec.student_id,
          phone: p.phone,
        },
      });

      if (!existingParent) {
        await prisma.parent.create({
          data: {
            student_id: studentRec.student_id,
            full_name: p.full_name,
            relationship: p.relationship,
            phone: p.phone,
          },
        });
      }
    }

    // Enrollment
    if (s.class_name && createdClasses[s.class_name]) {
      const classRec = createdClasses[s.class_name];
      const existingEnrollment = await prisma.studentEnrollment.findUnique({
        where: {
          student_id_class_id: {
            student_id: studentRec.student_id,
            class_id: classRec.class_id,
          },
        },
      });

      if (!existingEnrollment) {
        await prisma.studentEnrollment.create({
          data: {
            student_id: studentRec.student_id,
            class_id: classRec.class_id,
            enrolled_at: s.enrollment_date,
          },
        });
      }
    }
  }

  // 5. Seed past school year class "Nhà trẻ 1" in 2025–2026 to match progression history
  const pastYear = await prisma.schoolYear.findUnique({
    where: { name: 'Năm học 2025–2026' },
  });

  if (pastYear) {
    const pastClass1 = await prisma.class.upsert({
      where: {
        school_year_id_name: {
          school_year_id: pastYear.school_year_id,
          name: 'Nhà trẻ 1',
        },
      },
      update: {},
      create: {
        school_year_id: pastYear.school_year_id,
        name: 'Nhà trẻ 1',
        age_group: 'NHA_TRE',
        room_number: 'Phòng 101',
        description: 'Nhà trẻ 1 - Niên khóa 2025-2026',
      },
    });

    const pastStudents = await prisma.student.findMany({
      where: {
        student_code: {
          in: ['HS26001', 'HS26002', 'HS26003', 'HS26004', 'HS26005', 'HS26006', 'HS26007', 'HS26008'],
        },
      },
    });

    for (const ps of pastStudents) {
      await prisma.studentEnrollment.upsert({
        where: {
          student_id_class_id: {
            student_id: ps.student_id,
            class_id: pastClass1.class_id,
          },
        },
        update: {},
        create: {
          student_id: ps.student_id,
          class_id: pastClass1.class_id,
          enrolled_at: new Date('2025-09-05'),
          left_at: new Date('2026-05-31'),
        },
      });
    }

    // In 2026-2027, enroll HS26001 and HS26002 in "Mầm 1" so they show up as "Đã vào lớp khác"
    const mam1 = createdClasses['Mầm 1'];
    if (mam1) {
      const assignedOther = await prisma.student.findMany({
        where: { student_code: { in: ['HS26001', 'HS26002'] } },
      });
      for (const ao of assignedOther) {
        await prisma.studentEnrollment.upsert({
          where: {
            student_id_class_id: {
              student_id: ao.student_id,
              class_id: mam1.class_id,
            },
          },
          update: {},
          create: {
            student_id: ao.student_id,
            class_id: mam1.class_id,
            enrolled_at: new Date('2026-09-05'),
          },
        });
      }
    }
  }

  console.log(
    `✅ Seeded ${defaultStudents.length} Student & Parent accounts, profiles & enrollments`,
  );

  console.log('🎉 Seeding completed successfully!');
}

seed()
  .catch((e) => {
    console.error('❌ Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
