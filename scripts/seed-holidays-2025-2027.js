import prisma from '../src/config/prisma.js';

async function seedHolidays() {
  console.log('--- Bắt đầu cập nhật lịch nghỉ & sự kiện thực tế cho năm 2025–2026 và 2026–2027 ---');

  const years = await prisma.schoolYear.findMany({
    where: {
      deleted_at: null,
      school_year_id: { in: [1n, 2n] },
    },
  });

  console.log(`Tìm thấy ${years.length} năm học:`, years.map(y => `${y.name} (id: ${y.school_year_id})`));

  // 1. Dữ liệu năm học 2025–2026 (School Year ID: 2n)
  const holidays2025_2026 = [
    {
      name: 'Lễ Khai giảng năm học 2025–2026 & Ngày hội bé đến trường',
      startDate: '2025-09-05',
      endDate: '2025-09-05',
      isTeachingAllowed: true,
      description: 'Ngày hội toàn dân đưa trẻ đến trường và Lễ Khai giảng năm học mới',
    },
    {
      name: 'Vui Tết Trung thu 2025 (Đêm hội Trăng Rằm)',
      startDate: '2025-10-06',
      endDate: '2025-10-06',
      isTeachingAllowed: true,
      description: 'Lễ hội Trung thu cho bé, trải nghiệm rước đèn và phá cỗ',
    },
    {
      name: 'Ngày Phụ nữ Việt Nam 20/10',
      startDate: '2025-10-20',
      endDate: '2025-10-20',
      isTeachingAllowed: true,
      description: 'Sinh hoạt chuyên đề bé làm hoa và thiệp tặng bà, mẹ và cô giáo',
    },
    {
      name: 'Hội thao mầm non toàn trường',
      startDate: '2025-10-31',
      endDate: '2025-10-31',
      isTeachingAllowed: true,
      description: 'Hội thao vận động khỏe đẹp và trò chơi dân gian cho bé các khối lớp',
    },
    {
      name: 'Kỷ niệm Ngày Nhà giáo Việt Nam 20/11',
      startDate: '2025-11-20',
      endDate: '2025-11-20',
      isTeachingAllowed: true,
      description: 'Lễ kỷ niệm và tri ân thầy cô giáo toàn trường',
    },
    {
      name: 'Lễ hội Giáng sinh & Chào đón năm mới 2026',
      startDate: '2025-12-24',
      endDate: '2025-12-24',
      isTeachingAllowed: true,
      description: 'Giao lưu văn nghệ Giáng sinh và ông già Noel tặng quà cho các bé',
    },
    {
      name: 'Nghỉ Tết Dương lịch 2026',
      startDate: '2026-01-01',
      endDate: '2026-01-04',
      isTeachingAllowed: false,
      description: 'Nghỉ Tết Dương lịch 2026 theo quy định của Nhà nước (4 ngày)',
    },
    {
      name: 'Lễ Sơ kết Học kỳ 1 năm học 2025–2026',
      startDate: '2026-01-15',
      endDate: '2026-01-15',
      isTeachingAllowed: true,
      description: 'Tổng kết đánh giá hoạt động nuôi dưỡng, chăm sóc và giáo dục Học kỳ 1',
    },
    {
      name: 'Nghỉ Tết Nguyên Đán Bính Ngọ 2026',
      startDate: '2026-02-14',
      endDate: '2026-02-25',
      isTeachingAllowed: false,
      description: 'Nghỉ Tết Nguyên Đán Bính Ngọ theo kế hoạch năm học ngành GD&ĐT (12 ngày)',
    },
    {
      name: 'Ngày Quốc tế Phụ nữ 8/3',
      startDate: '2026-03-06',
      endDate: '2026-03-06',
      isTeachingAllowed: true,
      description: 'Hoạt động trải nghiệm làm quà tặng bà, mẹ và cô giáo nhân ngày 8/3',
    },
    {
      name: 'Nghỉ Lễ Giỗ Tổ Hùng Vương (10/3 Âm lịch)',
      startDate: '2026-04-25',
      endDate: '2026-04-27',
      isTeachingAllowed: false,
      description: 'Nghỉ Lễ Giỗ Tổ Hùng Vương (10/3 Âm lịch) và nghỉ bù theo quy định (3 ngày)',
    },
    {
      name: 'Nghỉ Lễ Chiến thắng 30/4 & Quốc tế Lao động 1/5',
      startDate: '2026-04-30',
      endDate: '2026-05-03',
      isTeachingAllowed: false,
      description: 'Nghỉ Lễ Giải phóng Miền Nam 30/4 và Ngày Quốc tế Lao động 1/5 (4 ngày)',
    },
    {
      name: 'Lễ Bế giảng năm học & Ra trường cho bé 5 tuổi',
      startDate: '2026-05-29',
      endDate: '2026-05-29',
      isTeachingAllowed: true,
      description: 'Lễ Tổng kết năm học 2025–2026 và Trao giấy chứng nhận hoàn thành chương trình mầm non',
    },
  ];

  // 2. Dữ liệu năm học 2026–2027 (School Year ID: 1n)
  const holidays2026_2027 = [
    {
      name: 'Lễ Khai giảng năm học 2026–2027 & Ngày hội bé đến trường',
      startDate: '2026-09-07',
      endDate: '2026-09-07',
      isTeachingAllowed: true,
      description: 'Lễ Khai giảng năm học mới & Ngày hội đưa trẻ mầm non đến trường',
    },
    {
      name: 'Vui Tết Trung thu 2026 (Đêm hội Trăng Rằm)',
      startDate: '2026-09-25',
      endDate: '2026-09-25',
      isTeachingAllowed: true,
      description: 'Lễ hội Trung thu rước đèn múa lân, phá cỗ và giao lưu văn nghệ các khối lớp',
    },
    {
      name: 'Ngày Phụ nữ Việt Nam 20/10',
      startDate: '2026-10-20',
      endDate: '2026-10-20',
      isTeachingAllowed: true,
      description: 'Bé trải nghiệm cắm hoa, làm thiệp chúc mừng mẹ và cô giáo',
    },
    {
      name: 'Hội thao mầm non toàn trường',
      startDate: '2026-10-30',
      endDate: '2026-10-30',
      isTeachingAllowed: true,
      description: 'Hội thao vận động khỏe đẹp và trò chơi dân gian cho bé các khối lớp',
    },
    {
      name: 'Kỷ niệm Ngày Nhà giáo Việt Nam 20/11',
      startDate: '2026-11-20',
      endDate: '2026-11-20',
      isTeachingAllowed: true,
      description: 'Kỷ niệm ngày Nhà giáo Việt Nam 20/11, tri ân thầy cô giáo toàn trường',
    },
    {
      name: 'Lễ hội Giáng sinh & Chào đón năm mới 2027',
      startDate: '2026-12-24',
      endDate: '2026-12-24',
      isTeachingAllowed: true,
      description: 'Văn nghệ Noel, hoạt cảnh mùa đông và tặng quà ông già Noel',
    },
    {
      name: 'Nghỉ Tết Dương Lịch 2027',
      startDate: '2027-01-01',
      endDate: '2027-01-03',
      isTeachingAllowed: false,
      description: 'Nghỉ Tết Dương Lịch 2027 theo quy định của Nhà nước (3 ngày)',
    },
    {
      name: 'Lễ Sơ kết Học kỳ 1 năm học 2026–2027',
      startDate: '2027-01-15',
      endDate: '2027-01-15',
      isTeachingAllowed: true,
      description: 'Sơ kết công tác chăm sóc, giáo dục trẻ Học kỳ 1 và triển khai kế hoạch Học kỳ 2',
    },
    {
      name: 'Nghỉ Tết Nguyên Đán Đinh Mùi 2027',
      startDate: '2027-02-04',
      endDate: '2027-02-15',
      isTeachingAllowed: false,
      description: 'Nghỉ Tết Nguyên Đán Đinh Mùi theo kế hoạch năm học ngành GD&ĐT (12 ngày)',
    },
    {
      name: 'Ngày Quốc tế Phụ nữ 8/3',
      startDate: '2027-03-08',
      endDate: '2027-03-08',
      isTeachingAllowed: true,
      description: 'Hoạt động bé yêu mẹ và cô giáo nhân ngày Quốc tế Phụ nữ 8/3',
    },
    {
      name: 'Nghỉ Lễ Giỗ Tổ Hùng Vương (10/3 Âm lịch)',
      startDate: '2027-04-16',
      endDate: '2027-04-18',
      isTeachingAllowed: false,
      description: 'Nghỉ Lễ Giỗ Tổ Hùng Vương (10/3 Âm lịch) theo quy định Nhà nước (3 ngày)',
    },
    {
      name: 'Nghỉ Lễ Chiến thắng 30/4 & Quốc tế Lao động 1/5',
      startDate: '2027-04-30',
      endDate: '2027-05-03',
      isTeachingAllowed: false,
      description: 'Nghỉ Lễ Giải phóng Miền Nam 30/4 và Ngày Quốc tế Lao động 1/5 (4 ngày)',
    },
    {
      name: 'Lễ Bế giảng năm học & Ra trường cho bé 5 tuổi',
      startDate: '2027-05-28',
      endDate: '2027-05-28',
      isTeachingAllowed: true,
      description: 'Lễ Bế giảng năm học 2026–2027 và Lễ ra trường cho trẻ khối Lá (5 tuổi)',
    },
  ];

  // Xóa sạch các mục cũ / placeholder của cả 2 năm
  const deletedOld = await prisma.schoolHoliday.deleteMany({
    where: {
      school_year_id: { in: [1n, 2n] },
    },
  });
  console.log(`Đã xóa ${deletedOld.count} mục lịch cũ/placeholder.`);

  // Chèn năm 2025–2026
  let count2025 = 0;
  for (const item of holidays2025_2026) {
    await prisma.schoolHoliday.create({
      data: {
        school_year_id: 2n,
        name: item.name,
        start_date: new Date(item.startDate),
        end_date: new Date(item.endDate),
        is_teaching_allowed: item.isTeachingAllowed,
        description: item.description,
        target_grades: [],
        created_by: 1n,
      },
    });
    count2025++;
  }
  console.log(`✓ Đã thêm ${count2025} lịch nghỉ & sự kiện thực tế cho Năm học 2025–2026.`);

  // Chèn năm 2026–2027
  let count2026 = 0;
  for (const item of holidays2026_2027) {
    await prisma.schoolHoliday.create({
      data: {
        school_year_id: 1n,
        name: item.name,
        start_date: new Date(item.startDate),
        end_date: new Date(item.endDate),
        is_teaching_allowed: item.isTeachingAllowed,
        description: item.description,
        target_grades: [],
        created_by: 1n,
      },
    });
    count2026++;
  }
  console.log(`✓ Đã thêm ${count2026} lịch nghỉ & sự kiện thực tế cho Năm học 2026–2027.`);

  console.log('--- Hoàn tất cập nhật lịch nghỉ & sự kiện thực tế vào database! ---');
  await prisma.$disconnect();
}

seedHolidays().catch((err) => {
  console.error('Lỗi khi seed lịch nghỉ:', err);
  process.exit(1);
});
