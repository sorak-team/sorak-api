/**
 * Seed & Cập nhật đầy đủ 10 Bộ chủ đề & 38 Chủ đề nhánh chuẩn GDMN cho Khối Nhà trẻ (Năm học 2026–2027)
 * Đảm bảo 100% điều kiện bao quát trọn năm học (38 tuần: 07/09/2026 -> 30/05/2027) và đủ điều kiện công bố.
 */
import prisma from '../src/config/prisma.js';
import { curriculumService } from '../src/services/curriculum.service.js';

export const ALL_NHA_TRE_THEMES = [
  {
    name: 'Bé và các bạn mới',
    start_date: new Date('2026-09-07'),
    end_date: new Date('2026-09-27'),
    description: 'Làm quen cô giáo, bạn bè và nề nếp sinh hoạt lớp nhà trẻ',
    sub_themes: [
      {
        name: 'Tuần 1: Khám phá cùng bé - Bé và các bạn mới',
        start_date: new Date('2026-09-07'),
        end_date: new Date('2026-09-13'),
      },
      {
        name: 'Tuần 2: Trải nghiệm cùng bé - Bé và các bạn mới',
        start_date: new Date('2026-09-14'),
        end_date: new Date('2026-09-20'),
      },
      {
        name: 'Tuần 3: Bé thực hành và khám phá cùng Bé và các bạn mới',
        start_date: new Date('2026-09-21'),
        end_date: new Date('2026-09-27'),
      },
    ],
  },
  {
    name: 'Đồ chơi yêu thích của bé',
    start_date: new Date('2026-09-28'),
    end_date: new Date('2026-10-25'),
    description: 'Nhận biết các loại đồ chơi an toàn, phát triển giác quan và thói quen cất đồ chơi gọn gàng',
    sub_themes: [
      {
        name: 'Tuần 1: Khám phá đồ chơi yêu thích của bé',
        start_date: new Date('2026-09-28'),
        end_date: new Date('2026-10-04'),
      },
      {
        name: 'Tuần 2: Đồ chơi chuyển động và phát ra âm thanh',
        start_date: new Date('2026-10-05'),
        end_date: new Date('2026-10-11'),
      },
      {
        name: 'Tuần 3: Đồ chơi lắp ghép, xếp hình & bé chơi búp bê',
        start_date: new Date('2026-10-12'),
        end_date: new Date('2026-10-18'),
      },
      {
        name: 'Tuần 4: Bé giữ gìn và bảo quản đồ chơi gọn gàng',
        start_date: new Date('2026-10-19'),
        end_date: new Date('2026-10-25'),
      },
    ],
  },
  {
    name: 'Những con vật nuôi đáng yêu',
    start_date: new Date('2026-10-26'),
    end_date: new Date('2026-11-22'),
    description: 'Khám phá và nhận biết hình dáng, tiếng kêu của các con vật nuôi quen thuộc',
    sub_themes: [
      {
        name: 'Tuần 1: Khám phá Những con vật nuôi đáng yêu',
        start_date: new Date('2026-10-26'),
        end_date: new Date('2026-11-01'),
      },
      {
        name: 'Tuần 2: Trải nghiệm cùng bé - Những con vật nuôi đáng yêu',
        start_date: new Date('2026-11-02'),
        end_date: new Date('2026-11-08'),
      },
      {
        name: 'Tuần 3: Bé thực hành và khám phá cùng Những con vật nuôi đáng yêu',
        start_date: new Date('2026-11-09'),
        end_date: new Date('2026-11-15'),
      },
      {
        name: 'Tuần 4: Bé chia sẻ và giữ gìn - Những con vật nuôi đáng yêu',
        start_date: new Date('2026-11-16'),
        end_date: new Date('2026-11-22'),
      },
    ],
  },
  {
    name: 'Cây xanh và hoa đẹp quanh bé',
    start_date: new Date('2026-11-23'),
    end_date: new Date('2026-12-20'),
    description: 'Nhận biết màu sắc, mùi hương và các bộ phận cơ bản của cây và hoa',
    sub_themes: [
      {
        name: 'Tuần 1: Khám phá Cây xanh và hoa đẹp quanh bé',
        start_date: new Date('2026-11-23'),
        end_date: new Date('2026-11-29'),
      },
      {
        name: 'Tuần 2: Trải nghiệm cùng bé - Cây xanh và hoa đẹp quanh bé',
        start_date: new Date('2026-11-30'),
        end_date: new Date('2026-12-06'),
      },
      {
        name: 'Tuần 3: Bé thực hành và khám phá cùng Cây xanh và hoa đẹp quanh bé',
        start_date: new Date('2026-12-07'),
        end_date: new Date('2026-12-13'),
      },
      {
        name: 'Tuần 4: Bé chia sẻ và giữ gìn - Cây xanh và hoa đẹp quanh bé',
        start_date: new Date('2026-12-14'),
        end_date: new Date('2026-12-20'),
      },
    ],
  },
  {
    name: 'Bé đón Tết và mùa xuân',
    start_date: new Date('2026-12-21'),
    end_date: new Date('2027-01-17'),
    description: 'Trải nghiệm không khí vui tươi, phong tục đón Tết và mùa xuân ấm áp',
    sub_themes: [
      {
        name: 'Tuần 1: Khám phá Bé đón Tết và mùa xuân',
        start_date: new Date('2026-12-21'),
        end_date: new Date('2026-12-27'),
      },
      {
        name: 'Tuần 2: Trải nghiệm cùng bé - Bé đón Tết và mùa xuân',
        start_date: new Date('2026-12-28'),
        end_date: new Date('2027-01-03'),
      },
      {
        name: 'Tuần 3: Bé thực hành và khám phá cùng Bé đón Tết và mùa xuân',
        start_date: new Date('2027-01-04'),
        end_date: new Date('2027-01-10'),
      },
      {
        name: 'Tuần 4: Bé chia sẻ và giữ gìn - Bé đón Tết và mùa xuân',
        start_date: new Date('2027-01-11'),
        end_date: new Date('2027-01-17'),
      },
    ],
  },
  {
    name: 'Những loại quả và rau củ bé thích',
    start_date: new Date('2027-01-18'),
    end_date: new Date('2027-02-14'),
    description: 'Khám phá thế giới thực vật, rau củ quả tốt cho sức khỏe bé',
    sub_themes: [
      {
        name: 'Quả ngọt thơm ngon bé thích',
        start_date: new Date('2027-01-18'),
        end_date: new Date('2027-01-24'),
      },
      {
        name: 'Rau củ tươi xanh, bổ dưỡng',
        start_date: new Date('2027-01-25'),
        end_date: new Date('2027-01-31'),
      },
      {
        name: 'Hoa đẹp mùa xuân quanh bé',
        start_date: new Date('2027-02-01'),
        end_date: new Date('2027-02-07'),
      },
      {
        name: 'Bé tập chăm sóc vườn cây nhỏ',
        start_date: new Date('2027-02-08'),
        end_date: new Date('2027-02-14'),
      },
    ],
  },
  {
    name: 'Phương tiện giao thông quen thuộc',
    start_date: new Date('2027-02-15'),
    end_date: new Date('2027-03-14'),
    description: 'Nhận biết các phương tiện đi lại gần gũi với bé và giữ an toàn',
    sub_themes: [
      {
        name: 'Xe đạp, xe máy bé đi cùng bố mẹ',
        start_date: new Date('2027-02-15'),
        end_date: new Date('2027-02-21'),
      },
      {
        name: 'Ô tô, xe buýt trên đường phố',
        start_date: new Date('2027-02-22'),
        end_date: new Date('2027-02-28'),
      },
      {
        name: 'Tàu hỏa và máy bay trên bầu trời',
        start_date: new Date('2027-03-01'),
        end_date: new Date('2027-03-07'),
      },
      {
        name: 'Thuyền buồm lướt sóng trên mặt nước',
        start_date: new Date('2027-03-08'),
        end_date: new Date('2027-03-14'),
      },
    ],
  },
  {
    name: 'Những con vật sống dưới nước và trong rừng',
    start_date: new Date('2027-03-15'),
    end_date: new Date('2027-04-11'),
    description: 'Mở rộng hiểu biết về thế giới động vật xung quanh',
    sub_themes: [
      {
        name: 'Con cá vàng bơi lội trong bể nước',
        start_date: new Date('2027-03-15'),
        end_date: new Date('2027-03-21'),
      },
      {
        name: 'Chú rùa chậm chạp và bạn tôm bạn cua',
        start_date: new Date('2027-03-22'),
        end_date: new Date('2027-03-28'),
      },
      {
        name: 'Thỏ con nhanh nhẹn và khỉ con leo trèo',
        start_date: new Date('2027-03-29'),
        end_date: new Date('2027-04-04'),
      },
      {
        name: 'Chú voi hiền lành và những người bạn to lớn',
        start_date: new Date('2027-04-05'),
        end_date: new Date('2027-04-11'),
      },
    ],
  },
  {
    name: 'Nước và các hiện tượng tự nhiên quanh bé',
    start_date: new Date('2027-04-12'),
    end_date: new Date('2027-05-09'),
    description: 'Làm quen với nước, ánh sáng, mưa và không khí',
    sub_themes: [
      {
        name: 'Nước sạch bé uống và tắm mát lành',
        start_date: new Date('2027-04-12'),
        end_date: new Date('2027-04-18'),
      },
      {
        name: 'Bầu trời ban ngày và ánh nắng sớm mai',
        start_date: new Date('2027-04-19'),
        end_date: new Date('2027-04-25'),
      },
      {
        name: 'Hạt mưa rơi tí tách và hiện tượng thời tiết',
        start_date: new Date('2027-04-26'),
        end_date: new Date('2027-05-02'),
      },
      {
        name: 'Làn gió mát lành và sắc màu cầu vồng',
        start_date: new Date('2027-05-03'),
        end_date: new Date('2027-05-09'),
      },
    ],
  },
  {
    name: 'Mùa hè của bé và tạm biệt lớp nhà trẻ',
    start_date: new Date('2027-05-10'),
    end_date: new Date('2027-05-30'),
    description: 'Tổng kết năm học, trang bị tâm thế tự tin cho bé lên lớp mầm',
    sub_themes: [
      {
        name: 'Ánh nắng mùa hè rực rỡ và trang phục mát',
        start_date: new Date('2027-05-10'),
        end_date: new Date('2027-05-16'),
      },
      {
        name: 'Bé vui chơi thỏa thích cùng bạn bè ngày hè',
        start_date: new Date('2027-05-17'),
        end_date: new Date('2027-05-23'),
      },
      {
        name: 'Bé ngoan, tự tin chào tạm biệt lớp nhà trẻ lên lớp mầm',
        start_date: new Date('2027-05-24'),
        end_date: new Date('2027-05-30'),
      },
    ],
  },
];

export async function seedNhaTreThemes() {
  console.log('🌱 [Curriculum] Seeding full theme set for Khối Nhà trẻ (2026–2027)...');

  const sy = await curriculumService.resolveSchoolYear('2026–2027');
  if (!sy) {
    throw new Error('School year 2026-2027 not found');
  }
  const schoolYearId = sy.school_year_id;

  // Xoá các chủ đề nháp/dummy không hợp lệ (như "Chủ đề mới 06" .. "Chủ đề mới 14")
  const dummyThemes = await prisma.curriculumTheme.findMany({
    where: {
      school_year_id: schoolYearId,
      age_group: 'NHA_TRE',
      name: { startsWith: 'Chủ đề mới' },
    },
  });
  for (const t of dummyThemes) {
    await prisma.subTheme.deleteMany({ where: { theme_id: t.theme_id } });
    await prisma.curriculumTheme.delete({ where: { theme_id: t.theme_id } });
  }

  // Tạo hoặc cập nhật từng chủ đề và các chủ đề nhánh
  for (const t of ALL_NHA_TRE_THEMES) {
    let theme = await prisma.curriculumTheme.findFirst({
      where: {
        school_year_id: schoolYearId,
        age_group: 'NHA_TRE',
        name: t.name,
      },
      include: { sub_themes: true },
    });

    if (!theme) {
      theme = await prisma.curriculumTheme.create({
        data: {
          school_year_id: schoolYearId,
          age_group: 'NHA_TRE',
          name: t.name,
          start_date: t.start_date,
          end_date: t.end_date,
          description: t.description,
          status: 'PUBLISHED',
          sub_themes: {
            create: t.sub_themes.map((st) => ({
              name: st.name,
              start_date: st.start_date,
              end_date: st.end_date,
            })),
          },
        },
        include: { sub_themes: true },
      });
      console.log(`✓ Đã tạo mới chủ đề: "${t.name}" (${t.sub_themes.length} chủ đề nhánh)`);
    } else {
      // Cập nhật ngày và status nếu có thay đổi
      await prisma.curriculumTheme.update({
        where: { theme_id: theme.theme_id },
        data: {
          start_date: t.start_date,
          end_date: t.end_date,
          status: 'PUBLISHED',
        },
      });

      // Đảm bảo đủ các chủ đề nhánh
      for (const st of t.sub_themes) {
        const existingSub = theme.sub_themes.find((s) => s.name === st.name);
        if (!existingSub) {
          await prisma.subTheme.create({
            data: {
              theme_id: theme.theme_id,
              name: st.name,
              start_date: st.start_date,
              end_date: st.end_date,
            },
          });
        } else {
          await prisma.subTheme.update({
            where: { sub_theme_id: existingSub.sub_theme_id },
            data: {
              start_date: st.start_date,
              end_date: st.end_date,
            },
          });
        }
      }
      console.log(`✓ Đã cập nhật chủ đề: "${t.name}"`);
    }
  }

  // Cập nhật trạng thái PUBLISHED cho toàn bộ chủ đề Nhà trẻ
  const publishResult = await curriculumService.updateThemeSetStatus({
    year: '2026–2027',
    ageGroup: 'nhatre',
    status: 'PUBLISHED',
  });

  console.log(`🎉 Thành công! Đã công bố ${publishResult.summary?.publishedCount}/${publishResult.summary?.totalThemes} chủ đề (${publishResult.summary?.totalSubThemes} chủ đề nhánh) cho Khối Nhà trẻ 2026–2027!`);
}

// Chạy trực tiếp nếu file được gọi từ CLI
if (process.argv[1]?.includes('seed_nhatre_themes.js')) {
  seedNhaTreThemes()
    .catch((err) => {
      console.error('Error seeding Nha Tre themes:', err);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
