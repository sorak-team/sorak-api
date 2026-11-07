import prisma from '../config/prisma.js';

async function seedNhaTre1SevenSlotsTimetable() {
  console.log('--- Starting Seed 7-Slot Timetable for Lớp Nhà trẻ 1 (Theme 219) ---');

  const classId = 5n; // Nhà trẻ 1 in School Year 1
  const themeId = 219n; // Đồ chơi yêu thích của bé

  const targetClass = await prisma.class.findUnique({ where: { class_id: classId } });
  if (!targetClass) {
    throw new Error('Class 5 not found!');
  }

  const theme = await prisma.curriculumTheme.findUnique({
    where: { theme_id: themeId },
    include: { sub_themes: { orderBy: { start_date: 'asc' } } },
  });
  if (!theme) {
    throw new Error('Theme 219 not found!');
  }

  const firstAccount = await prisma.account.findFirst();
  const createdBy = firstAccount ? firstAccount.account_id : 1n;

  // 1. Get or create Goals for all 5 domains for NHA_TRE
  const goals = await prisma.educationalGoal.findMany({
    where: { age_group: 'NHA_TRE' },
  });

  const getGoal = (code) => goals.find((g) => g.goal_code === code) || goals[0];

  // 2. Link Goals to ClassThemeGoal for this theme
  console.log('Linking ClassThemeGoals...');
  const goalCodesToLink = ['MT 01', 'MT 02', 'MT 03', 'MT 04', 'MT 05', 'MT 08', 'MT 09', 'MT 10', 'MT 11'];
  for (const code of goalCodesToLink) {
    const g = getGoal(code);
    if (!g) continue;
    const existing = await prisma.classThemeGoal.findFirst({
      where: { class_id: classId, theme_id: themeId, goal_id: g.goal_id },
    });
    if (!existing) {
      await prisma.classThemeGoal.create({
        data: {
          class_id: classId,
          theme_id: themeId,
          goal_id: g.goal_id,
        },
      });
    }
  }

  // 3. Clear existing subThemeActivity for this class in Theme 219
  const subThemeIds = theme.sub_themes.map((st) => st.sub_theme_id);
  console.log('Clearing old activities for subThemes:', subThemeIds.map((s) => s.toString()));
  await prisma.subThemeActivity.deleteMany({
    where: {
      class_id: classId,
      sub_theme_id: { in: subThemeIds },
    },
  });

  // 4. Define realistic 7-slot daily routine
  // 1. ARRIVAL_PLAY (07:15 – 08:00): Đón Trẻ, Chơi
  // 2. MORNING_EXERCISE (08:00 – 08:30): Thể Dục Sáng
  // 3. DIRECTED_STUDY (08:30 – 09:15): Học
  // 4. CORNER_PLAY (09:15 – 10:15): Chơi, Hoạt Động Ở Các Góc
  // 5. OUTDOOR_PLAY (10:15 – 11:00): Chơi Ngoài Trời
  // 6. AFTERNOON_ACTIVITY (14:00 – 14:45): Chơi, Hoạt Động Theo Ý Thích
  // 7. RETURN_CHILD (15:30 – 16:30): Trả Trẻ

  const week1Schedule = {
    MONDAY: [
      {
        slot: 'ARRIVAL_PLAY',
        title: 'Đón trẻ: Trẻ tự cất ba lô, chào cô và chơi tự do góc đón trẻ',
        goalCode: 'MT 10',
        contentTitle: 'Rèn thói quen lễ phép và tự lập đầu giờ',
      },
      {
        slot: 'MORNING_EXERCISE',
        title: 'Thể dục sáng: Bài tập "Gà trống gáy sáng" kết hợp cờ và nơ hoa',
        goalCode: 'MT 01',
        contentTitle: 'Phát triển nhóm cơ tay, vai và hô hấp',
      },
      {
        slot: 'DIRECTED_STUDY',
        title: 'Vận động cơ bản: "Đi trên vạch kẻ thẳng trên sàn, đầu đội túi cát"',
        goalCode: 'MT 01',
        contentTitle: 'Tập giữ thăng bằng và định hướng không gian',
      },
      {
        slot: 'CORNER_PLAY',
        title: 'Góc thao tác vai: "Bé bế búp bê và cho búp bê ăn thìa"',
        goalCode: 'MT 10',
        contentTitle: 'Mô phỏng hành vi chăm sóc của người lớn',
      },
      {
        slot: 'OUTDOOR_PLAY',
        title: 'Quan sát ngoài trời: Cùng cô thăm vườn đồ chơi ngoài sân, TCVĐ "Bóng tròn to"',
        goalCode: 'MT 01',
        contentTitle: 'Vận động ngoài trời và hít thở không khí trong lành',
      },
      {
        slot: 'AFTERNOON_ACTIVITY',
        title: 'Kỹ năng tự phục vụ: Bé tập tự cất dép vào đúng ngăn sau giờ chơi',
        goalCode: 'MT 02',
        contentTitle: 'Rèn thói quen tự lập và ngăn nắp',
      },
      {
        slot: 'RETURN_CHILD',
        title: 'Trả trẻ: Trao đổi tình hình trong ngày với phụ huynh, bé chào cô ra về',
        goalCode: 'MT 10',
        contentTitle: 'Kỹ năng giao tiếp lễ phép lúc tan trường',
      },
    ],
    TUESDAY: [
      {
        slot: 'ARRIVAL_PLAY',
        title: 'Đón trẻ vui tươi: Bé chơi ghép hình các loại ô tô, máy bay đồ chơi',
        goalCode: 'MT 04',
        contentTitle: 'Khơi gợi hứng thú đầu ngày với đồ vật',
      },
      {
        slot: 'MORNING_EXERCISE',
        title: 'Thể dục sáng: Khởi động xoay cổ tay, cổ chân theo bài hát "Đoàn tàu nhỏ xíu"',
        goalCode: 'MT 01',
        contentTitle: 'Khởi động ngày mới nhẹ nhàng',
      },
      {
        slot: 'DIRECTED_STUDY',
        title: 'Nhận biết phân biệt: "Quả bóng màu đỏ - Quả bóng màu xanh"',
        goalCode: 'MT 04',
        contentTitle: 'Nhận biết màu sắc cơ bản và gọi tên đúng',
      },
      {
        slot: 'CORNER_PLAY',
        title: 'Góc đồ vật: "Chọn bóng đỏ bỏ rổ đỏ, bóng xanh bỏ rổ xanh"',
        goalCode: 'MT 04',
        contentTitle: 'Luyện tập phân loại màu sắc',
      },
      {
        slot: 'OUTDOOR_PLAY',
        title: 'Trò chơi cát & nước: Thả bóng nhựa trên máng nước chảy',
        goalCode: 'MT 04',
        contentTitle: 'Khám phá sự chìm nổi của đồ vật',
      },
      {
        slot: 'AFTERNOON_ACTIVITY',
        title: 'Nghe kể chuyện: "Chiếc ô tô đỏ của bạn Gấu con"',
        goalCode: 'MT 08',
        contentTitle: 'Phát triển thính giác và khả năng chú ý lời nói',
      },
      {
        slot: 'RETURN_CHILD',
        title: 'Trả trẻ: Hướng dẫn bé tự lấy bình nước cá nhân bỏ vào ba lô',
        goalCode: 'MT 02',
        contentTitle: 'Ý thức tự quản lý đồ dùng cá nhân',
      },
    ],
    WEDNESDAY: [
      {
        slot: 'ARRIVAL_PLAY',
        title: 'Đón trẻ: Bé chơi xâu vòng hạt cườm to cùng bạn bè',
        goalCode: 'MT 01',
        contentTitle: 'Rèn sự phối hợp khéo léo của các ngón tay',
      },
      {
        slot: 'MORNING_EXERCISE',
        title: 'Thể dục sáng: Vận động cùng gậy thể dục theo nhịp đếm 1-2',
        goalCode: 'MT 01',
        contentTitle: 'Rèn sự phối hợp tay chân đồng bộ',
      },
      {
        slot: 'DIRECTED_STUDY',
        title: 'Phát triển ngôn ngữ: Thơ "Bé chơi xếp hình"',
        goalCode: 'MT 08',
        contentTitle: 'Dạy trẻ đọc theo cô từng câu thơ ngắn',
      },
      {
        slot: 'CORNER_PLAY',
        title: 'Góc xây dựng: "Xếp chuồng nuôi gấu bông, hàng rào đồ chơi"',
        goalCode: 'MT 05',
        contentTitle: 'Rèn sự khéo léo của các ngón tay',
      },
      {
        slot: 'OUTDOOR_PLAY',
        title: 'Dạo chơi sân trường: TCVĐ "Đoàn tàu nối đuôi nhau"',
        goalCode: 'MT 01',
        contentTitle: 'Đi theo hàng lối và nghe hiệu lệnh',
      },
      {
        slot: 'AFTERNOON_ACTIVITY',
        title: 'Đồng dao quen thuộc: "Nu na nu nống" và "Tập tầm vông"',
        goalCode: 'MT 09',
        contentTitle: 'Phát triển nhịp điệu ngôn ngữ dân gian',
      },
      {
        slot: 'RETURN_CHILD',
        title: 'Trả trẻ: Nhắc bé uống nước ấm, khoanh tay chào bố mẹ đón về',
        goalCode: 'MT 10',
        contentTitle: 'Giao tiếp lễ độ với người thân',
      },
    ],
    THURSDAY: [
      {
        slot: 'ARRIVAL_PLAY',
        title: 'Đón trẻ: Bé xem tranh ảnh các loại đồ chơi tại góc thư viện',
        goalCode: 'MT 08',
        contentTitle: 'Làm quen với sách tranh đồ chơi',
      },
      {
        slot: 'MORNING_EXERCISE',
        title: 'Thể dục sáng: Bài tập "Chim non bay" kết hợp lắc chuông reo',
        goalCode: 'MT 01',
        contentTitle: 'Tập các động tác nghiêng người, vươn vai',
      },
      {
        slot: 'DIRECTED_STUDY',
        title: 'Giáo dục âm nhạc: Dạy hát "Đôi dép xinh", nghe hát "Búp bê bằng bông"',
        goalCode: 'MT 11',
        contentTitle: 'Cảm thụ giai điệu vui tươi của bài hát thiếu nhi',
      },
      {
        slot: 'CORNER_PLAY',
        title: 'Góc âm nhạc: "Gõ xúc xắc, vỗ tay theo nhịp bài hát đồ chơi"',
        goalCode: 'MT 11',
        contentTitle: 'Vận động theo bài hát và tiết tấu',
      },
      {
        slot: 'OUTDOOR_PLAY',
        title: 'Giao lưu vận động: "Bé chạy nhặt bóng vào giỏ của cô"',
        goalCode: 'MT 01',
        contentTitle: 'Rèn luyện phản xạ nhanh nhẹn',
      },
      {
        slot: 'AFTERNOON_ACTIVITY',
        title: 'Kỹ năng giao tiếp: Dạy bé biết nói "Cảm ơn" khi được cô chia đồ chơi',
        goalCode: 'MT 10',
        contentTitle: 'Hình thành lời nói lịch sự và lễ phép',
      },
      {
        slot: 'RETURN_CHILD',
        title: 'Trả trẻ: Trao đổi thực đơn dinh dưỡng và tình hình ăn ngủ với mẹ',
        goalCode: 'MT 02',
        contentTitle: 'Phối hợp gia đình chăm sóc trẻ',
      },
    ],
    FRIDAY: [
      {
        slot: 'ARRIVAL_PLAY',
        title: 'Đón trẻ cuối tuần: Trò chuyện vui vẻ về đồ chơi bé mang từ nhà đến',
        goalCode: 'MT 10',
        contentTitle: 'Khích lệ sự cởi mở và giao tiếp',
      },
      {
        slot: 'MORNING_EXERCISE',
        title: 'Thể dục sáng: Đồng diễn toàn khối với vòng thể dục màu sắc',
        goalCode: 'MT 01',
        contentTitle: 'Vận động tập thể vui tươi cuối tuần',
      },
      {
        slot: 'DIRECTED_STUDY',
        title: 'Tạo hình: "Dán chấm tròn trang trí quả bóng tặng bạn"',
        goalCode: 'MT 11',
        contentTitle: 'Kỹ năng bóc dán hình ảnh và phối màu',
      },
      {
        slot: 'CORNER_PLAY',
        title: 'Góc nghệ thuật: "Bé nặn đất sét thành viên bi tròn"',
        goalCode: 'MT 11',
        contentTitle: 'Luyện cơ ngón tay và lòng bàn tay',
      },
      {
        slot: 'OUTDOOR_PLAY',
        title: 'Vẽ phấn tự do trên sân trường: Vẽ những chiếc ô tô, quả bóng',
        goalCode: 'MT 11',
        contentTitle: 'Khơi gợi trí tưởng tượng của trẻ',
      },
      {
        slot: 'AFTERNOON_ACTIVITY',
        title: 'Tổng kết tuần: Bé biểu diễn văn nghệ đồ chơi và cắm cờ bé ngoan',
        goalCode: 'MT 10',
        contentTitle: 'Khích lệ sự tự tin và khen thưởng cuối tuần',
      },
      {
        slot: 'RETURN_CHILD',
        title: 'Trả trẻ: Trao cờ bé ngoan cho bé, chúc bé và gia đình cuối tuần vui vẻ',
        goalCode: 'MT 10',
        contentTitle: 'Tạo tâm lý hào hứng sau tuần học',
      },
    ],
  };

  // Helper to insert a week of schedule
  async function insertWeek(subTheme, scheduleObj, startDateStr) {
    console.log(`Inserting 7-slot activities for ${subTheme.name}...`);
    const baseDate = new Date(startDateStr);

    const dayMap = {
      MONDAY: 0,
      TUESDAY: 1,
      WEDNESDAY: 2,
      THURSDAY: 3,
      FRIDAY: 4,
    };

    let count = 0;
    for (const [dayKey, items] of Object.entries(scheduleObj)) {
      const dayOffset = dayMap[dayKey] ?? 0;
      const scheduledDate = new Date(baseDate);
      scheduledDate.setDate(baseDate.getDate() + dayOffset);

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const goal = getGoal(item.goalCode);

        // Create educational content
        const content = await prisma.educationalContent.create({
          data: {
            title: item.contentTitle || item.title,
            goal_id: goal ? goal.goal_id : null,
          },
        });

        // Create educational activity
        const activity = await prisma.educationalActivity.create({
          data: {
            title: item.title,
            routine_slot: item.slot,
            content_id: content.content_id,
            theme_id: themeId,
            created_by: createdBy,
          },
        });

        // Schedule to SubThemeActivity
        await prisma.subThemeActivity.create({
          data: {
            class_id: classId,
            sub_theme_id: subTheme.sub_theme_id,
            activity_id: activity.activity_id,
            day_of_week: dayKey,
            routine_slot: item.slot,
            order_index: i + 1,
            scheduled_date: scheduledDate,
            status: 'SCHEDULED',
            created_by: createdBy,
          },
        });

        count++;
      }
    }
    console.log(`=> Created ${count} activities for ${subTheme.name}`);
  }

  // Week 2 Variation
  const week2Schedule = {
    MONDAY: [
      {
        slot: 'ARRIVAL_PLAY',
        title: 'Đón trẻ: Trẻ tự cất giày dép, cùng cô ngắm bể cá và cây xanh',
        goalCode: 'MT 10',
        contentTitle: 'Tạo cảm giác thân thiện khi đến lớp',
      },
      {
        slot: 'MORNING_EXERCISE',
        title: 'Thể dục sáng: Vận động theo lời ca bài "Chim mẹ và chim con"',
        goalCode: 'MT 01',
        contentTitle: 'Phát triển thể lực buổi sáng',
      },
      {
        slot: 'DIRECTED_STUDY',
        title: 'Vận động cơ bản: "Bật nhảy qua vạch kẻ thẳng hái hoa tặng cô"',
        goalCode: 'MT 01',
        contentTitle: 'Rèn sức bật của đôi chân',
      },
      {
        slot: 'CORNER_PLAY',
        title: 'Góc thao tác vai: "Nấu bột và cho em búp bê uống sữa"',
        goalCode: 'MT 10',
        contentTitle: 'Kỹ năng bắt chước hành vi yêu thương',
      },
      {
        slot: 'OUTDOOR_PLAY',
        title: 'Chơi với thiên nhiên: Nhặt lá vàng khô xếp hình ô tô tải',
        goalCode: 'MT 11',
        contentTitle: 'Khám phá thiên nhiên quanh bé',
      },
      {
        slot: 'AFTERNOON_ACTIVITY',
        title: 'Rèn kỹ năng vệ sinh: Hướng dẫn bé tự cầm khăn lau mặt sạch sẽ',
        goalCode: 'MT 02',
        contentTitle: 'Vệ sinh cá nhân cơ bản',
      },
      {
        slot: 'RETURN_CHILD',
        title: 'Trả trẻ: Hướng dẫn bé kiểm tra đồ chơi không mang về nhà',
        goalCode: 'MT 03',
        contentTitle: 'Ý thức giữ gìn đồ chơi chung',
      },
    ],
    TUESDAY: [
      {
        slot: 'ARRIVAL_PLAY',
        title: 'Đón trẻ: Cho bé chọn đồ chơi yêu thích trong rổ đồ chơi buổi sáng',
        goalCode: 'MT 10',
        contentTitle: 'Khuyến khích trẻ chủ động chọn hoạt động',
      },
      {
        slot: 'MORNING_EXERCISE',
        title: 'Thể dục sáng: Khởi động các khớp với vòng nhựa hoa',
        goalCode: 'MT 01',
        contentTitle: 'Khởi động ngày mới vui vẻ',
      },
      {
        slot: 'DIRECTED_STUDY',
        title: 'Nhận biết tập nói: "Con gấu bông - Con thỏ bông đáng yêu"',
        goalCode: 'MT 08',
        contentTitle: 'Dạy trẻ phát âm đúng tên và đặc điểm đồ chơi mềm',
      },
      {
        slot: 'CORNER_PLAY',
        title: 'Góc hoạt động với đồ vật: "Bé xâu vòng hạt cườm to tặng thỏ bông"',
        goalCode: 'MT 01',
        contentTitle: 'Phát triển sự phối hợp tay - mắt',
      },
      {
        slot: 'OUTDOOR_PLAY',
        title: 'TCVĐ: "Bắt bướm trên sân trường", tắm nắng ấm',
        goalCode: 'MT 01',
        contentTitle: 'Vận động rèn phản xạ nhảy với',
      },
      {
        slot: 'AFTERNOON_ACTIVITY',
        title: 'Đọc thơ: "Con tàu nhỏ xíu chạy trên đường ray"',
        goalCode: 'MT 09',
        contentTitle: 'Rèn phát âm rõ ràng mạch lạc',
      },
      {
        slot: 'RETURN_CHILD',
        title: 'Trả trẻ: Bé vòng tay chào cô và bố mẹ',
        goalCode: 'MT 10',
        contentTitle: 'Lễ phép khi ra về',
      },
    ],
    WEDNESDAY: [
      {
        slot: 'ARRIVAL_PLAY',
        title: 'Đón trẻ: Cho bé nghe nhạc thiếu nhi êm dịu lúc vào lớp',
        goalCode: 'MT 11',
        contentTitle: 'Thư giãn tâm lý đầu giờ sáng',
      },
      {
        slot: 'MORNING_EXERCISE',
        title: 'Thể dục sáng: Bài tập "Thổi bóng bay" hít thở sâu',
        goalCode: 'MT 01',
        contentTitle: 'Điều hòa hơi thở buổi sáng',
      },
      {
        slot: 'DIRECTED_STUDY',
        title: 'Làm quen toán học: "Đếm đồ chơi có số lượng 1 và 2"',
        goalCode: 'MT 05',
        contentTitle: 'Làm quen với số lượng đồ vật',
      },
      {
        slot: 'CORNER_PLAY',
        title: 'Góc xây dựng: "Xếp ga tàu cho các toa xe lửa chở đồ chơi"',
        goalCode: 'MT 05',
        contentTitle: 'Kỹ năng xếp chồng và xếp cạnh',
      },
      {
        slot: 'OUTDOOR_PLAY',
        title: 'Chơi tự do với đồ chơi ngoài trời có cô bao quát',
        goalCode: 'MT 03',
        contentTitle: 'Ý thức an toàn khi chơi cầu trượt',
      },
      {
        slot: 'AFTERNOON_ACTIVITY',
        title: 'Kỹ năng sống: Dạy bé không tranh giành đồ chơi của bạn',
        goalCode: 'MT 10',
        contentTitle: 'Biết chia sẻ và chơi hòa đồng',
      },
      {
        slot: 'RETURN_CHILD',
        title: 'Trả trẻ: Trao đổi giờ ngủ trưa của trẻ với người thân',
        goalCode: 'MT 02',
        contentTitle: 'Chăm sóc sức khỏe liên tục',
      },
    ],
    THURSDAY: [
      {
        slot: 'ARRIVAL_PLAY',
        title: 'Đón trẻ: Bé chơi xếp khối gỗ chữ nhật thành con đường nhỏ',
        goalCode: 'MT 05',
        contentTitle: 'Tập trung chú ý vào đồ vật',
      },
      {
        slot: 'MORNING_EXERCISE',
        title: 'Thể dục sáng: Vận động cùng cô bài "Tay thơm tay ngoan"',
        goalCode: 'MT 01',
        contentTitle: 'Khởi động cơ bản buổi sáng',
      },
      {
        slot: 'DIRECTED_STUDY',
        title: 'Giáo dục âm nhạc: Nghe hát bài "Quả bóng tròn", vận động theo nhạc',
        goalCode: 'MT 11',
        contentTitle: 'Thưởng thức và đung đưa theo giai điệu',
      },
      {
        slot: 'CORNER_PLAY',
        title: 'Góc âm nhạc: "Bé gõ phách tre bài hát đồ chơi"',
        goalCode: 'MT 11',
        contentTitle: 'Cảm nhận nhịp phách đơn giản',
      },
      {
        slot: 'OUTDOOR_PLAY',
        title: 'Quan sát vườn hoa: TCVĐ "Gieo hạt nảy mầm"',
        goalCode: 'MT 01',
        contentTitle: 'Vận động ngồi xổm, đứng lên nhịp nhàng',
      },
      {
        slot: 'AFTERNOON_ACTIVITY',
        title: 'Nghe kể chuyện: "Chiếc xe buýt tốt bụng"',
        goalCode: 'MT 08',
        contentTitle: 'Nuôi dưỡng tình cảm biết giúp đỡ bạn',
      },
      {
        slot: 'RETURN_CHILD',
        title: 'Trả trẻ: Hướng dẫn bé tự mang giày dép khi ra về',
        goalCode: 'MT 02',
        contentTitle: 'Kỹ năng tự phục vụ',
      },
    ],
    FRIDAY: [
      {
        slot: 'ARRIVAL_PLAY',
        title: 'Đón trẻ: Cùng cô tưới nước cho bồn hoa đồ chơi ngoài hành lang',
        goalCode: 'MT 10',
        contentTitle: 'Yêu quý thiên nhiên lớp học',
      },
      {
        slot: 'MORNING_EXERCISE',
        title: 'Thể dục sáng: Đồng diễn toàn trường kết hợp nhạc vui nhộn',
        goalCode: 'MT 01',
        contentTitle: 'Khởi động thể lực cuối tuần',
      },
      {
        slot: 'DIRECTED_STUDY',
        title: 'Tạo hình: "Xé dán dải giấy màu trang trí đuôi diều đồ chơi"',
        goalCode: 'MT 11',
        contentTitle: 'Tập kỹ năng xé dải giấy đơn giản',
      },
      {
        slot: 'CORNER_PLAY',
        title: 'Góc nghệ thuật: "Tô màu quả bóng đỏ"',
        goalCode: 'MT 11',
        contentTitle: 'Luyện cầm sáp màu bằng các ngón tay',
      },
      {
        slot: 'OUTDOOR_PLAY',
        title: 'Chơi bóng ngoài trời: "Tung bóng và bắt bóng cùng cô"',
        goalCode: 'MT 01',
        contentTitle: 'Rèn luyện khả năng bắt bóng',
      },
      {
        slot: 'AFTERNOON_ACTIVITY',
        title: 'Sinh hoạt cuối tuần: Bé biểu diễn văn nghệ và cắm cờ bé ngoan',
        goalCode: 'MT 10',
        contentTitle: 'Động viên khích lệ bé ngoan trong tuần',
      },
      {
        slot: 'RETURN_CHILD',
        title: 'Trả trẻ cuối tuần: Trao đổi phiếu bé ngoan và khen ngợi bé trước bố mẹ',
        goalCode: 'MT 10',
        contentTitle: 'Khích lệ tinh thần cuối tuần',
      },
    ],
  };

  // Seed Tuần 1, 2, 3, 4
  if (theme.sub_themes[0]) {
    await insertWeek(theme.sub_themes[0], week1Schedule, '2026-09-28');
  }
  if (theme.sub_themes[1]) {
    await insertWeek(theme.sub_themes[1], week2Schedule, '2026-10-05');
  }
  if (theme.sub_themes[2]) {
    await insertWeek(theme.sub_themes[2], week1Schedule, '2026-10-12');
  }
  if (theme.sub_themes[3]) {
    await insertWeek(theme.sub_themes[3], week2Schedule, '2026-10-19');
  }

  console.log('--- Finished seeding full 7-slot timetable for Nhà trẻ 1 successfully! ---');
}

seedNhaTre1SevenSlotsTimetable()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  });
