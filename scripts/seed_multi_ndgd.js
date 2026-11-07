import prisma from '../src/config/prisma.js';

const MULTI_CONTENTS_DATA = [
  {
    goalCode: 'MT 01',
    contents: [
      'Động tác hô hấp: Hít vào thở sâu, tập gà gáy, thổi bóng bay',
      'Động tác tay - vai: Đưa 2 tay sang ngang, lên cao, gập trước ngực theo nhịp',
      'Động tác lưng - bụng: Nghiêng người sang 2 bên, cúi gập người về phía trước',
      'Động tác chân: Nhún chân, khuỵu gối, giậm chân tại chỗ theo nhịp đếm',
    ],
    allocatedIndices: [0, 1], // Partially selected (2/4)
  },
  {
    goalCode: 'MT 02',
    contents: [
      'Đi thăng bằng trên ghế thể dục (cao 30cm, rộng 25cm), đầu đội túi cát',
      'Đi thăng bằng theo đường kẻ thẳng 3m trên sàn không bước lệch',
    ],
    allocatedIndices: [0, 1], // Fully selected (2/2)
  },
  {
    goalCode: 'MT 03',
    contents: [
      'Đi kiễng gót liên tục 3m - 5m giữ thăng bằng',
      'Đứng kiễng gót bằng 2 chân liên tục trong 5 giây',
      'Đi kiễng gót đổi hướng theo hiệu lệnh của cô giáo',
    ],
    allocatedIndices: [0], // Partially selected (1/3)
  },
  {
    goalCode: 'MT 04',
    contents: [
      'Chạy nâng cao đùi tại chỗ nhịp nhàng theo nhịp gõ xắc xô',
      'Chạy nhanh 15m theo hướng thẳng tới đích không chệch làn',
    ],
    allocatedIndices: [0, 1], // Fully selected (2/2)
  },
  {
    goalCode: 'MT 05',
    contents: [
      'Bật tại chỗ liên tục 4 - 5 lần tiếp đất êm bằng mũi bàn chân',
      'Bật nhảy tiến qua vạch kẻ thẳng bằng 2 chân liên tục',
      'Bật chụm tách chân vào các vòng tròn kế tiếp nhau trên sân',
    ],
    allocatedIndices: [], // Unselected (0/3)
  },
  {
    goalCode: 'MT 06',
    contents: [
      'Bật xa 20 - 25cm bằng hai chân và tiếp đất nhẹ nhàng',
      'Phối hợp nhún chân và vung tay tạo đà bật xa về phía trước',
    ],
    allocatedIndices: [0, 1], // Fully selected (2/2)
  },
  {
    goalCode: 'MT 07',
    contents: [
      'Tung và bắt bóng bằng 2 tay với cô giáo ở khoảng cách 1.5m',
      'Bắt bóng bằng 2 tay tiếp xúc bóng êm, không ôm bóng vào ngực',
    ],
    allocatedIndices: [0, 1], // Fully selected (2/2)
  },
  {
    goalCode: 'MT 23',
    contents: [
      'Trò chuyện về tên trường, tên lớp học và các phòng chức năng trong trường',
      'Làm quen, ghi nhớ và gọi đúng tên cô giáo chủ nhiệm, cô bảo mẫu và các bạn trong lớp',
      'Khám phá các góc hoạt động và quy định chung của lớp mầm non',
    ],
    allocatedIndices: [0, 1], // Partially selected (2/3)
  },
  {
    goalCode: 'MT 24',
    contents: [
      'Nhận biết tên gọi và công dụng chính của các đồ chơi quen thuộc trong lớp',
      'Gọi tên và sử dụng đúng cách đồ dùng học tập: Bút màu, đất nặn, giấy vẽ',
      'Thực hành cất dọn và phân loại đồ chơi gọn gàng đúng nơi quy định sau khi chơi',
    ],
    allocatedIndices: [], // Unselected
  },
  {
    goalCode: 'MT 25',
    contents: [
      'Định hướng không gian lớp học: Góc xây dựng, góc phân vai, góc học tập',
      'Nhận biết vị trí và quy ước hoạt động tại góc nghệ thuật và góc sách truyện',
    ],
    allocatedIndices: [], // Unselected
  },
  {
    goalCode: 'MT 26',
    contents: [
      'Khám phá cơ thể người: Mắt để nhìn, tai để nghe, mũi để ngửi, miệng để nói',
      'Nhận biết chức năng của bàn tay, bàn chân trong vận động và sinh hoạt hàng ngày',
      'Thực hành các thói quen giữ gìn vệ sinh thân thể sạch sẽ',
    ],
    allocatedIndices: [], // Unselected
  },
  {
    goalCode: 'MT 27',
    contents: [
      'Sử dụng xúc giác để phân biệt đồ vật có bề mặt nhẵn bóng - sần sùi',
      'Khám phá và nhận biết đặc điểm vật lý: Nóng / lạnh, cứng / mềm',
    ],
    allocatedIndices: [], // Unselected
  },
];

async function main() {
  console.log('Seeding multiple educational contents (NDGD)...');

  // Goals for MAM year 1
  const allMamGoals = await prisma.educationalGoal.findMany({
    where: { school_year_id: 1n, age_group: 'MAM', deleted_at: null },
    include: { contents: true },
    orderBy: { goal_code: 'asc' },
  });

  const class7 = await prisma.class.findUnique({ where: { class_id: 7n } });
  const theme171 = await prisma.curriculumTheme.findFirst({
    where: { age_group: 'MAM', name: { contains: 'Trường mầm non' } },
  });

  const allocatedContentIdsForTheme171 = [];
  const allocatedGoalIdsForTheme171 = new Set();

  for (const item of MULTI_CONTENTS_DATA) {
    const goal = allMamGoals.find((g) => g.goal_code.startsWith(item.goalCode));
    if (!goal) {
      console.warn(`Goal ${item.goalCode} not found in MAM year 1!`);
      continue;
    }

    console.log(`\nProcessing Goal [${goal.goal_code}] (ID: ${goal.goal_id}): ${goal.title}`);
    
    // Existing contents for this goal
    const existing = goal.contents || [];
    const contentsMap = new Map(); // title -> content

    // Update existing first content title if available
    if (existing.length > 0 && item.contents.length > 0) {
      const firstTitle = item.contents[0];
      const updated = await prisma.educationalContent.update({
        where: { content_id: existing[0].content_id },
        data: { title: firstTitle },
      });
      contentsMap.set(firstTitle, updated);
      console.log(`  Updated existing content ${existing[0].content_id} -> "${firstTitle}"`);
    }

    // Insert remaining contents if not already existing
    for (let i = 1; i < item.contents.length; i++) {
      const title = item.contents[i];
      const matched = existing.find((c) => c.title === title);
      if (matched) {
        contentsMap.set(title, matched);
        console.log(`  Content already exists: [${matched.content_id}] "${title}"`);
      } else {
        const created = await prisma.educationalContent.create({
          data: {
            goal_id: goal.goal_id,
            title,
          },
        });
        contentsMap.set(title, created);
        console.log(`  Created content [${created.content_id}]: "${title}"`);
      }
    }

    // Collect allocations for Theme 171 (Trường mầm non của bé)
    const contentList = item.contents.map((t) => contentsMap.get(t)).filter(Boolean);
    item.allocatedIndices.forEach((idx) => {
      const c = contentList[idx];
      if (c) {
        allocatedContentIdsForTheme171.push(c.content_id);
        allocatedGoalIdsForTheme171.add(goal.goal_id);
      }
    });
  }

  // Also include contents for other goals already allocated in theme 171 (MT 08 to MT 12)
  const otherAllocatedCodes = ['MT 08', 'MT 09', 'MT 10', 'MT 11', 'MT 12'];
  for (const code of otherAllocatedCodes) {
    const goal = allMamGoals.find((g) => g.goal_code.startsWith(code));
    if (goal && goal.contents.length > 0) {
      allocatedContentIdsForTheme171.push(goal.contents[0].content_id);
      allocatedGoalIdsForTheme171.add(goal.goal_id);
    }
  }

  // Update class_theme_contents for Class 7 & Theme
  const targetThemeId = theme171 ? theme171.theme_id : 204n;

  console.log(`\nUpdating class_theme_contents for Class 7 and Theme ${targetThemeId}...`);
  await prisma.classThemeContent.deleteMany({
    where: { class_id: 7n, theme_id: targetThemeId },
  });

  await prisma.classThemeContent.createMany({
    data: allocatedContentIdsForTheme171.map((cId) => ({
      class_id: 7n,
      theme_id: targetThemeId,
      content_id: cId,
    })),
    skipDuplicates: true,
  });

  // Update class_theme_goals for Class 7 & Theme
  console.log(`Updating class_theme_goals for Class 7 and Theme ${targetThemeId}...`);
  await prisma.classThemeGoal.deleteMany({
    where: { class_id: 7n, theme_id: targetThemeId },
  });

  await prisma.classThemeGoal.createMany({
    data: Array.from(allocatedGoalIdsForTheme171).map((gId) => ({
      class_id: 7n,
      theme_id: targetThemeId,
      goal_id: gId,
    })),
    skipDuplicates: true,
  });

  console.log(`\nDone! Total allocated contents in Theme 171: ${allocatedContentIdsForTheme171.length}`);
  console.log(`Total allocated goals in Theme 171: ${allocatedGoalIdsForTheme171.size}`);
}

main().catch(console.error).finally(() => prisma.$disconnect());

