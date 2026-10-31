import prisma from '../src/config/prisma.js';
import { calculateWhoAssessment } from '../src/utils/who-calculator.js';

async function main() {
  console.log('🚀 Bắt đầu fill dữ liệu Nhật ký ngày từ 26/10/2026 đến 30/10/2026...');

  // 1. Tìm lớp Mầm 1 (class_id = 7)
  const targetClass = await prisma.class.findFirst({
    where: { class_id: 7 },
  });

  if (!targetClass) {
    throw new Error('Không tìm thấy lớp Mầm 1 (class_id = 7)');
  }
  console.log(`✓ Lớp học: ${targetClass.name} (ID: ${targetClass.class_id})`);

  // 2. Lấy danh sách học sinh đang học
  const enrollments = await prisma.studentEnrollment.findMany({
    where: {
      class_id: targetClass.class_id,
      status: 'ENROLLED',
    },
    include: {
      student: {
        include: {
          parents: true,
        },
      },
    },
    orderBy: { student: { student_code: 'asc' } },
  });

  console.log(`✓ Tìm thấy ${enrollments.length} học sinh trong lớp ${targetClass.name}`);

  // 3. Xoá dữ liệu cũ nếu đã tồn tại trong khoảng 26/10 - 30/10
  const startDate = new Date('2026-10-26T00:00:00.000Z');
  const endDate = new Date('2026-10-30T23:59:59.999Z');

  const studentIds = enrollments.map((e) => e.student_id);

  console.log('🧹 Dọn dẹp dữ liệu cũ (nếu có) trong khoảng 26/10 đến 30/10...');
  await prisma.dailyAssessment.deleteMany({
    where: {
      student_id: { in: studentIds },
      assessment_date: { gte: startDate, lte: endDate },
    },
  });

  await prisma.attendance.deleteMany({
    where: {
      class_id: targetClass.class_id,
      date: { gte: startDate, lte: endDate },
    },
  });

  await prisma.healthAssessment.deleteMany({
    where: {
      student_id: { in: studentIds },
      assessment_date: { gte: startDate, lte: endDate },
    },
  });

  await prisma.subThemeActivity.deleteMany({
    where: {
      class_id: targetClass.class_id,
      scheduled_date: { gte: startDate, lte: endDate },
    },
  });

  // 4. Định nghĩa lịch 35 slots HĐGD (7 slots/ngày x 5 ngày)
  const schedulePlan = [
    // Thứ Hai 26/10/2026
    {
      date: '2026-10-26',
      dayOfWeek: 'MONDAY',
      subThemeId: 602,
      slots: [
        { slot: 'ARRIVAL_PLAY', activityId: 836, order: 1, note: 'Thực hành giao tiếp: Bé bày tỏ mong muốn với cô giáo bằng câu hoàn chỉnh' },
        { slot: 'MORNING_EXERCISE', activityId: 786, order: 2, note: 'Bài tập thể dục sáng: "Gà trống gáy sáng" kết hợp cờ và nơ hoa' },
        { slot: 'DIRECTED_STUDY', activityId: 814, order: 3, note: 'Khám phá xã hội: "Gia đình thân yêu và những người tôi yêu quý"' },
        { slot: 'CORNER_PLAY', activityId: 797, order: 4, note: 'Bé xâu vòng tay tặng mẹ từ hạt cườm màu sắc' },
        { slot: 'OUTDOOR_PLAY', activityId: 820, order: 5, note: 'Bé dạo chơi vườn trường quan sát hoa hồng, hoa cúc và quả chuối' },
        { slot: 'AFTERNOON_ACTIVITY', activityId: 834, order: 6, note: 'Luyện thanh vui nhộn: "Bé phát âm các từ quen thuộc qua trò chơi con ong vò vẽ"' },
        { slot: 'RETURN_CHILD', activityId: 851, order: 7, note: 'Giờ trả trẻ: Bé kể cho cô hoặc bố mẹ nghe điều vui nhất hôm nay ở lớp' },
      ],
    },
    // Thứ Ba 27/10/2026
    {
      date: '2026-10-27',
      dayOfWeek: 'TUESDAY',
      subThemeId: 602,
      slots: [
        { slot: 'ARRIVAL_PLAY', activityId: 838, order: 1, note: 'Nghi thức đón trả trẻ: Bé khoanh tay chào cô và chào bố mẹ' },
        { slot: 'MORNING_EXERCISE', activityId: 786, order: 2, note: 'Bài tập thể dục sáng: "Gà trống gáy sáng" kết hợp cờ và nơ hoa' },
        { slot: 'DIRECTED_STUDY', activityId: 815, order: 3, note: 'Khám phá đồ dùng gia đình: "Bé giúp mẹ xếp bát đĩa gọn gàng"' },
        { slot: 'CORNER_PLAY', activityId: 816, order: 4, note: 'Trò chơi: "Chọn trang phục phù hợp cho bạn búp bê đi dạo phố"' },
        { slot: 'OUTDOOR_PLAY', activityId: 823, order: 5, note: 'Trò chơi giao thông: "Bé làm chú cảnh sát chỉ huy đèn tín hiệu"' },
        { slot: 'AFTERNOON_ACTIVITY', activityId: 837, order: 6, note: 'Kỹ năng sống: "Lời cảm ơn và lời xin lỗi chân thành của bé"' },
        { slot: 'RETURN_CHILD', activityId: 856, order: 7, note: 'Bình cờ cuối ngày: Bé tự hào được nhận phiếu bé ngoan và hoa hồng' },
      ],
    },
    // Thứ Tư 28/10/2026 (Có khám sức khỏe)
    {
      date: '2026-10-28',
      dayOfWeek: 'WEDNESDAY',
      subThemeId: 602,
      slots: [
        { slot: 'ARRIVAL_PLAY', activityId: 839, order: 1, note: 'Trò chuyện sáng: Bé trả lời câu hỏi của cô bằng câu có từ "Dạ, thưa cô..."' },
        { slot: 'MORNING_EXERCISE', activityId: 786, order: 2, note: 'Bài tập thể dục sáng: "Gà trống gáy sáng" kết hợp cờ và nơ hoa' },
        { slot: 'DIRECTED_STUDY', activityId: 818, order: 3, note: 'Khám phá thế giới động vật: "Những người bạn nhỏ đáng yêu trong nhà"' },
        { slot: 'CORNER_PLAY', activityId: 798, order: 4, note: 'Bé tập cầm kéo cắt dải giấy màu trang trí lớp học' },
        { slot: 'OUTDOOR_PLAY', activityId: 795, order: 5, note: 'Trò chơi: "Chuột con bò chui qua hầm lấy phô mai"' },
        { slot: 'AFTERNOON_ACTIVITY', activityId: 848, order: 6, note: 'Bé đọc sách tranh Ehon Nhật Bản cùng cô giáo' },
        { slot: 'RETURN_CHILD', activityId: 851, order: 7, note: 'Giờ trả trẻ: Bé kể cho cô hoặc bố mẹ nghe điều vui nhất hôm nay ở lớp' },
      ],
    },
    // Thứ Năm 29/10/2026
    {
      date: '2026-10-29',
      dayOfWeek: 'THURSDAY',
      subThemeId: 603,
      slots: [
        { slot: 'ARRIVAL_PLAY', activityId: 847, order: 1, note: 'Tìm đúng ngăn tủ ba lô có ký hiệu bông hoa hoặc quả táo của bé' },
        { slot: 'MORNING_EXERCISE', activityId: 786, order: 2, note: 'Bài tập thể dục sáng: "Gà trống gáy sáng" kết hợp cờ và nơ hoa' },
        { slot: 'DIRECTED_STUDY', activityId: 819, order: 3, note: 'Phân loại động vật sống dưới nước và động vật sống trong rừng' },
        { slot: 'CORNER_PLAY', activityId: 809, order: 4, note: 'Khám phá: "Những món đồ chơi xinh xắn trong góc lớp của bé"' },
        { slot: 'OUTDOOR_PLAY', activityId: 824, order: 5, note: 'Quan sát thời tiết trong ngày và trò chuyện về ích lợi của mưa' },
        { slot: 'AFTERNOON_ACTIVITY', activityId: 867, order: 6, note: 'Trò chơi gắn thẻ hành động: Mặt cười cho việc ngoan, mặt mếu cho việc chưa ngoan' },
        { slot: 'RETURN_CHILD', activityId: 856, order: 7, note: 'Bình cờ cuối ngày: Bé tự hào được nhận phiếu bé ngoan và hoa hồng' },
      ],
    },
    // Thứ Sáu 30/10/2026
    {
      date: '2026-10-30',
      dayOfWeek: 'FRIDAY',
      subThemeId: 603,
      slots: [
        { slot: 'ARRIVAL_PLAY', activityId: 865, order: 1, note: 'Bé ôm cô và trò chuyện vui vẻ, tin tưởng giãi bày tâm sự cùng cô' },
        { slot: 'MORNING_EXERCISE', activityId: 786, order: 2, note: 'Bài tập thể dục sáng: "Gà trống gáy sáng" kết hợp cờ và nơ hoa' },
        { slot: 'DIRECTED_STUDY', activityId: 804, order: 3, note: 'Khám phá bữa ăn ngon: Bé nhận biết rau xanh, thịt cá và trái cây' },
        { slot: 'CORNER_PLAY', activityId: 816, order: 4, note: 'Trò chơi: "Chọn trang phục phù hợp cho bạn búp bê đi dạo phố"' },
        { slot: 'OUTDOOR_PLAY', activityId: 820, order: 5, note: 'Bé dạo chơi vườn trường quan sát hoa hồng, hoa cúc và quả chuối' },
        { slot: 'AFTERNOON_ACTIVITY', activityId: 878, order: 6, note: 'Trò chơi âm nhạc: "Đoán tên bài hát qua tiếng đàn piano của cô"' },
        { slot: 'RETURN_CHILD', activityId: 856, order: 7, note: 'Bình cờ cuối ngày: Bé tự hào được nhận phiếu bé ngoan và hoa hồng' },
      ],
    },
  ];

  // 5. Lấy goal_id cho các activityId
  const allActivityIds = Array.from(
    new Set(schedulePlan.flatMap((day) => day.slots.map((s) => s.activityId)))
  );

  const activitiesWithGoals = await prisma.educationalActivity.findMany({
    where: { activity_id: { in: allActivityIds } },
    include: {
      content: {
        select: { goal_id: true },
      },
    },
  });

  const activityGoalMap = new Map();
  activitiesWithGoals.forEach((act) => {
    activityGoalMap.set(act.activity_id, act.content?.goal_id || null);
  });

  // 6. Tạo 35 slots HĐGD & Đánh giá slot cho học sinh
  console.log('🌱 Tạo 35 slots HĐGD và đánh giá học sinh cho từng slot...');
  let totalSlots = 0;
  let totalDailyAssessments = 0;

  for (const dayPlan of schedulePlan) {
    const scheduledDateObj = new Date(`${dayPlan.date}T00:00:00.000Z`);
    const isToday30 = dayPlan.date === '2026-10-30';

    for (const slotItem of dayPlan.slots) {
      await prisma.subThemeActivity.create({
        data: {
          class_id: targetClass.class_id,
          sub_theme_id: dayPlan.subThemeId,
          activity_id: slotItem.activityId,
          scheduled_date: scheduledDateObj,
          day_of_week: dayPlan.dayOfWeek,
          routine_slot: slotItem.slot,
          order_index: slotItem.order,
          status: isToday30 ? 'SCHEDULED' : 'COMPLETED',
          notes: slotItem.note,
          created_by: 45,
        },
      });
      totalSlots++;

      // Ngày 30/10 chưa đánh giá để người dùng test thực tế trong ngày
      if (!isToday30) {
        const goalId = activityGoalMap.get(slotItem.activityId) || null;

        // Đánh giá học sinh cho slot này (đa số ACHIEVED, một số OUTSTANDING)
        const assessmentsData = enrollments.map((enr, i) => {
          const isOutstanding = (i + slotItem.order) % 4 === 0;
          return {
            student_id: enr.student_id,
            activity_id: slotItem.activityId,
            goal_id: goalId,
            assessment_date: scheduledDateObj,
            status: isOutstanding ? 'OUTSTANDING' : 'ACHIEVED',
            notes: isOutstanding
              ? 'Bé thể hiện xuất sắc, chủ động tương tác và giúp đỡ bạn'
              : 'Bé tiếp thu tốt, hoàn thành hoạt động đúng mục tiêu',
            evaluated_by: 45,
          };
        });

        await prisma.dailyAssessment.createMany({
          data: assessmentsData,
          skipDuplicates: true,
        });
        totalDailyAssessments += assessmentsData.length;
      }
    }
  }

  console.log(`✓ Đã tạo ${totalSlots} slots HĐGD và ${totalDailyAssessments} lượt đánh giá học sinh`);

  // 7. Tạo dữ liệu Điểm danh & Đón trẻ cho các ngày 26/10 - 29/10 (30/10 để trống)
  console.log('🌱 Tạo Điểm danh và Đón trẻ cho các ngày 26/10 - 29/10...');
  let totalAttendance = 0;

  for (let d = 0; d < schedulePlan.length; d++) {
    const dayPlan = schedulePlan[d];
    const dateStr = dayPlan.date;
    if (dateStr === '2026-10-30') continue; // Bỏ qua ngày 30/10 theo yêu cầu

    const dateObj = new Date(`${dateStr}T00:00:00.000Z`);

    for (let idx = 0; idx < enrollments.length; idx++) {
      const enr = enrollments[idx];
      const student = enr.student;
      const parent = student.parents?.[0];

      // Giả lập 1 học sinh nghỉ có phép ở T2 và 1 ở T3 cho sinh động
      const isExcused = (d === 0 && idx === 0) || (d === 1 && idx === 1);

      if (isExcused) {
        await prisma.attendance.create({
          data: {
            student_id: student.student_id,
            class_id: targetClass.class_id,
            date: dateObj,
            status: 'EXCUSED_ABSENCE',
            notes: 'Phụ huynh xin phép cho bé nghỉ khám nha khoa',
            check_in_by: 45,
          },
        });
      } else {
        const inMin = 20 + (idx % 20); // 07:20 - 07:40
        const outMin = 30 + (idx % 25); // 16:30 - 16:55
        const inTime = new Date(`${dateStr}T00:${String(inMin).padStart(2, '0')}:00.000Z`);
        const outTime = new Date(`${dateStr}T09:${String(outMin).padStart(2, '0')}:00.000Z`);

        await prisma.attendance.create({
          data: {
            student_id: student.student_id,
            class_id: targetClass.class_id,
            date: dateObj,
            status: 'PRESENT',
            check_in_time: inTime,
            check_in_by: 45,
            check_out_time: outTime,
            check_out_by: 45,
            pickup_person_name: parent?.full_name || 'Phụ huynh học sinh',
            pickup_person_phone: parent?.phone || '0901111000',
            pickup_relationship: parent?.relationship || 'Bố',
            pickup_note: 'Bé vui vẻ, chào cô và bố mẹ ra về',
            notes: 'Đi học đúng giờ, ngoan ngoãn',
          },
        });
      }
      totalAttendance++;
    }
  }

  console.log(`✓ Đã tạo ${totalAttendance} bản ghi Điểm danh & Đón trẻ (cả 5 ngày đã điểm danh & đón đầy đủ)`);

  // 8. Tạo dữ liệu Khám sức khỏe vào ngày 28/10/2026
  console.log('🌱 Tạo hồ sơ Khám sức khỏe ngày 28/10/2026...');
  const healthDateObj = new Date('2026-10-28T00:00:00.000Z');
  let totalHealth = 0;

  for (let idx = 0; idx < enrollments.length; idx++) {
    const enr = enrollments[idx];
    const student = enr.student;

    // Chiều cao dao động 95.0cm - 103.5cm, cân nặng 14.0kg - 17.5kg (chuẩn độ tuổi 3 tuổi Mầm)
    const baseHeight = 95.0 + (idx * 0.38);
    const baseWeight = 14.1 + (idx * 0.15);
    const height = Number(baseHeight.toFixed(2));
    const weight = Number(baseWeight.toFixed(2));

    const whoResult = await calculateWhoAssessment({
      gender: student.gender,
      dateOfBirth: student.date_of_birth,
      dateOfMeasurement: '2026-10-28',
      height,
      weight,
    });

    const bmi = whoResult ? Number(whoResult.bmi) : Number((weight / ((height / 100) ** 2)).toFixed(2));
    const hZ = whoResult?.zscores?.heightForAge ? Number(whoResult.zscores.heightForAge) : -0.5;
    const wZ = whoResult?.zscores?.weightForAge ? Number(whoResult.zscores.weightForAge) : -0.2;
    const bZ = whoResult?.zscores?.bmiForAge ? Number(whoResult.zscores.bmiForAge) : 0.1;

    await prisma.healthAssessment.create({
      data: {
        student_id: student.student_id,
        assessment_date: healthDateObj,
        height,
        weight,
        bmi,
        height_for_age_zscore: hZ,
        weight_for_age_zscore: wZ,
        bmi_for_age_zscore: bZ,
        notes: 'Khám sức khỏe định kỳ Tháng 10/2026: Thể lực phát triển tốt, dinh dưỡng bình thường',
        recorded_by: 45,
      },
    });
    totalHealth++;
  }

  console.log(`✓ Đã tạo ${totalHealth} hồ sơ Khám sức khỏe ngày 28/10/2026 chuẩn WHO`);
  console.log('🎉 HOÀN TẤT FILL DỮ LIỆU NHẬT KÝ NGÀY 26/10 ĐẾN 30/10!');
}

main()
  .catch((err) => {
    console.error('❌ Lỗi khi fill dữ liệu:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

