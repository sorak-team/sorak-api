-- =========================================================================
-- SCRIPT CẬP NHẬT ĐẦY ĐỦ BỘ CHỦ ĐỀ & CHỦ ĐỀ NHÁNH KHỐI NHÀ TRẺ (2026–2027)
-- Áp dụng cho DB: sorak_test2 hoặc sorak_hk9 hoặc sorak
-- =========================================================================

DO $$
DECLARE
  v_sy_id BIGINT;
  v_theme_id BIGINT;
BEGIN
  -- Lấy school_year_id của Năm học 2026–2027
  SELECT school_year_id INTO v_sy_id FROM school_years WHERE name LIKE '%2026%2027%' AND deleted_at IS NULL ORDER BY start_date DESC LIMIT 1;
  IF v_sy_id IS NULL THEN
    RAISE EXCEPTION 'Không tìm thấy Năm học 2026–2027';
  END IF;

  -- Xoá các chủ đề nháp không hợp lệ (Chủ đề mới 06..14) nếu tồn tại
  DELETE FROM sub_themes WHERE theme_id IN (
    SELECT theme_id FROM curriculum_themes WHERE school_year_id = v_sy_id AND age_group = 'NHA_TRE' AND name LIKE 'Chủ đề mới%'
  );
  DELETE FROM curriculum_themes WHERE school_year_id = v_sy_id AND age_group = 'NHA_TRE' AND name LIKE 'Chủ đề mới%';

  -- Theme: "Những loại quả và rau củ bé thích"
  SELECT theme_id INTO v_theme_id FROM curriculum_themes WHERE school_year_id = v_sy_id AND age_group = 'NHA_TRE' AND name = 'Những loại quả và rau củ bé thích';
  IF v_theme_id IS NULL THEN
    INSERT INTO curriculum_themes (school_year_id, age_group, name, start_date, end_date, description, status, created_at, updated_at)
    VALUES (v_sy_id, 'NHA_TRE', 'Những loại quả và rau củ bé thích', '2027-01-18', '2027-02-14', 'Khám phá thế giới thực vật, rau củ quả tốt cho sức khỏe bé', 'PUBLISHED', NOW(), NOW())
    RETURNING theme_id INTO v_theme_id;
  ELSE
    UPDATE curriculum_themes SET status = 'PUBLISHED', start_date = '2027-01-18', end_date = '2027-02-14', updated_at = NOW() WHERE theme_id = v_theme_id;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM sub_themes WHERE theme_id = v_theme_id AND name = 'Quả ngọt thơm ngon bé thích') THEN
    INSERT INTO sub_themes (theme_id, name, start_date, end_date, created_at, updated_at)
    VALUES (v_theme_id, 'Quả ngọt thơm ngon bé thích', '2027-01-18', '2027-01-24', NOW(), NOW());
  ELSE
    UPDATE sub_themes SET start_date = '2027-01-18', end_date = '2027-01-24', updated_at = NOW() WHERE theme_id = v_theme_id AND name = 'Quả ngọt thơm ngon bé thích';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM sub_themes WHERE theme_id = v_theme_id AND name = 'Rau củ tươi xanh, bổ dưỡng') THEN
    INSERT INTO sub_themes (theme_id, name, start_date, end_date, created_at, updated_at)
    VALUES (v_theme_id, 'Rau củ tươi xanh, bổ dưỡng', '2027-01-25', '2027-01-31', NOW(), NOW());
  ELSE
    UPDATE sub_themes SET start_date = '2027-01-25', end_date = '2027-01-31', updated_at = NOW() WHERE theme_id = v_theme_id AND name = 'Rau củ tươi xanh, bổ dưỡng';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM sub_themes WHERE theme_id = v_theme_id AND name = 'Hoa đẹp mùa xuân quanh bé') THEN
    INSERT INTO sub_themes (theme_id, name, start_date, end_date, created_at, updated_at)
    VALUES (v_theme_id, 'Hoa đẹp mùa xuân quanh bé', '2027-02-01', '2027-02-07', NOW(), NOW());
  ELSE
    UPDATE sub_themes SET start_date = '2027-02-01', end_date = '2027-02-07', updated_at = NOW() WHERE theme_id = v_theme_id AND name = 'Hoa đẹp mùa xuân quanh bé';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM sub_themes WHERE theme_id = v_theme_id AND name = 'Bé tập chăm sóc vườn cây nhỏ') THEN
    INSERT INTO sub_themes (theme_id, name, start_date, end_date, created_at, updated_at)
    VALUES (v_theme_id, 'Bé tập chăm sóc vườn cây nhỏ', '2027-02-08', '2027-02-14', NOW(), NOW());
  ELSE
    UPDATE sub_themes SET start_date = '2027-02-08', end_date = '2027-02-14', updated_at = NOW() WHERE theme_id = v_theme_id AND name = 'Bé tập chăm sóc vườn cây nhỏ';
  END IF;

  -- Theme: "Phương tiện giao thông quen thuộc"
  SELECT theme_id INTO v_theme_id FROM curriculum_themes WHERE school_year_id = v_sy_id AND age_group = 'NHA_TRE' AND name = 'Phương tiện giao thông quen thuộc';
  IF v_theme_id IS NULL THEN
    INSERT INTO curriculum_themes (school_year_id, age_group, name, start_date, end_date, description, status, created_at, updated_at)
    VALUES (v_sy_id, 'NHA_TRE', 'Phương tiện giao thông quen thuộc', '2027-02-15', '2027-03-14', 'Nhận biết các phương tiện đi lại gần gũi với bé và giữ an toàn', 'PUBLISHED', NOW(), NOW())
    RETURNING theme_id INTO v_theme_id;
  ELSE
    UPDATE curriculum_themes SET status = 'PUBLISHED', start_date = '2027-02-15', end_date = '2027-03-14', updated_at = NOW() WHERE theme_id = v_theme_id;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM sub_themes WHERE theme_id = v_theme_id AND name = 'Xe đạp, xe máy bé đi cùng bố mẹ') THEN
    INSERT INTO sub_themes (theme_id, name, start_date, end_date, created_at, updated_at)
    VALUES (v_theme_id, 'Xe đạp, xe máy bé đi cùng bố mẹ', '2027-02-15', '2027-02-21', NOW(), NOW());
  ELSE
    UPDATE sub_themes SET start_date = '2027-02-15', end_date = '2027-02-21', updated_at = NOW() WHERE theme_id = v_theme_id AND name = 'Xe đạp, xe máy bé đi cùng bố mẹ';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM sub_themes WHERE theme_id = v_theme_id AND name = 'Ô tô, xe buýt trên đường phố') THEN
    INSERT INTO sub_themes (theme_id, name, start_date, end_date, created_at, updated_at)
    VALUES (v_theme_id, 'Ô tô, xe buýt trên đường phố', '2027-02-22', '2027-02-28', NOW(), NOW());
  ELSE
    UPDATE sub_themes SET start_date = '2027-02-22', end_date = '2027-02-28', updated_at = NOW() WHERE theme_id = v_theme_id AND name = 'Ô tô, xe buýt trên đường phố';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM sub_themes WHERE theme_id = v_theme_id AND name = 'Tàu hỏa và máy bay trên bầu trời') THEN
    INSERT INTO sub_themes (theme_id, name, start_date, end_date, created_at, updated_at)
    VALUES (v_theme_id, 'Tàu hỏa và máy bay trên bầu trời', '2027-03-01', '2027-03-07', NOW(), NOW());
  ELSE
    UPDATE sub_themes SET start_date = '2027-03-01', end_date = '2027-03-07', updated_at = NOW() WHERE theme_id = v_theme_id AND name = 'Tàu hỏa và máy bay trên bầu trời';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM sub_themes WHERE theme_id = v_theme_id AND name = 'Thuyền buồm lướt sóng trên mặt nước') THEN
    INSERT INTO sub_themes (theme_id, name, start_date, end_date, created_at, updated_at)
    VALUES (v_theme_id, 'Thuyền buồm lướt sóng trên mặt nước', '2027-03-08', '2027-03-14', NOW(), NOW());
  ELSE
    UPDATE sub_themes SET start_date = '2027-03-08', end_date = '2027-03-14', updated_at = NOW() WHERE theme_id = v_theme_id AND name = 'Thuyền buồm lướt sóng trên mặt nước';
  END IF;

  -- Theme: "Những con vật sống dưới nước và trong rừng"
  SELECT theme_id INTO v_theme_id FROM curriculum_themes WHERE school_year_id = v_sy_id AND age_group = 'NHA_TRE' AND name = 'Những con vật sống dưới nước và trong rừng';
  IF v_theme_id IS NULL THEN
    INSERT INTO curriculum_themes (school_year_id, age_group, name, start_date, end_date, description, status, created_at, updated_at)
    VALUES (v_sy_id, 'NHA_TRE', 'Những con vật sống dưới nước và trong rừng', '2027-03-15', '2027-04-11', 'Mở rộng hiểu biết về thế giới động vật xung quanh', 'PUBLISHED', NOW(), NOW())
    RETURNING theme_id INTO v_theme_id;
  ELSE
    UPDATE curriculum_themes SET status = 'PUBLISHED', start_date = '2027-03-15', end_date = '2027-04-11', updated_at = NOW() WHERE theme_id = v_theme_id;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM sub_themes WHERE theme_id = v_theme_id AND name = 'Con cá vàng bơi lội trong bể nước') THEN
    INSERT INTO sub_themes (theme_id, name, start_date, end_date, created_at, updated_at)
    VALUES (v_theme_id, 'Con cá vàng bơi lội trong bể nước', '2027-03-15', '2027-03-21', NOW(), NOW());
  ELSE
    UPDATE sub_themes SET start_date = '2027-03-15', end_date = '2027-03-21', updated_at = NOW() WHERE theme_id = v_theme_id AND name = 'Con cá vàng bơi lội trong bể nước';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM sub_themes WHERE theme_id = v_theme_id AND name = 'Chú rùa chậm chạp và bạn tôm bạn cua') THEN
    INSERT INTO sub_themes (theme_id, name, start_date, end_date, created_at, updated_at)
    VALUES (v_theme_id, 'Chú rùa chậm chạp và bạn tôm bạn cua', '2027-03-22', '2027-03-28', NOW(), NOW());
  ELSE
    UPDATE sub_themes SET start_date = '2027-03-22', end_date = '2027-03-28', updated_at = NOW() WHERE theme_id = v_theme_id AND name = 'Chú rùa chậm chạp và bạn tôm bạn cua';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM sub_themes WHERE theme_id = v_theme_id AND name = 'Thỏ con nhanh nhẹn và khỉ con leo trèo') THEN
    INSERT INTO sub_themes (theme_id, name, start_date, end_date, created_at, updated_at)
    VALUES (v_theme_id, 'Thỏ con nhanh nhẹn và khỉ con leo trèo', '2027-03-29', '2027-04-04', NOW(), NOW());
  ELSE
    UPDATE sub_themes SET start_date = '2027-03-29', end_date = '2027-04-04', updated_at = NOW() WHERE theme_id = v_theme_id AND name = 'Thỏ con nhanh nhẹn và khỉ con leo trèo';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM sub_themes WHERE theme_id = v_theme_id AND name = 'Chú voi hiền lành và những người bạn to lớn') THEN
    INSERT INTO sub_themes (theme_id, name, start_date, end_date, created_at, updated_at)
    VALUES (v_theme_id, 'Chú voi hiền lành và những người bạn to lớn', '2027-04-05', '2027-04-11', NOW(), NOW());
  ELSE
    UPDATE sub_themes SET start_date = '2027-04-05', end_date = '2027-04-11', updated_at = NOW() WHERE theme_id = v_theme_id AND name = 'Chú voi hiền lành và những người bạn to lớn';
  END IF;

  -- Theme: "Nước và các hiện tượng tự nhiên quanh bé"
  SELECT theme_id INTO v_theme_id FROM curriculum_themes WHERE school_year_id = v_sy_id AND age_group = 'NHA_TRE' AND name = 'Nước và các hiện tượng tự nhiên quanh bé';
  IF v_theme_id IS NULL THEN
    INSERT INTO curriculum_themes (school_year_id, age_group, name, start_date, end_date, description, status, created_at, updated_at)
    VALUES (v_sy_id, 'NHA_TRE', 'Nước và các hiện tượng tự nhiên quanh bé', '2027-04-12', '2027-05-09', 'Làm quen với nước, ánh sáng, mưa và không khí', 'PUBLISHED', NOW(), NOW())
    RETURNING theme_id INTO v_theme_id;
  ELSE
    UPDATE curriculum_themes SET status = 'PUBLISHED', start_date = '2027-04-12', end_date = '2027-05-09', updated_at = NOW() WHERE theme_id = v_theme_id;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM sub_themes WHERE theme_id = v_theme_id AND name = 'Nước sạch bé uống và tắm mát lành') THEN
    INSERT INTO sub_themes (theme_id, name, start_date, end_date, created_at, updated_at)
    VALUES (v_theme_id, 'Nước sạch bé uống và tắm mát lành', '2027-04-12', '2027-04-18', NOW(), NOW());
  ELSE
    UPDATE sub_themes SET start_date = '2027-04-12', end_date = '2027-04-18', updated_at = NOW() WHERE theme_id = v_theme_id AND name = 'Nước sạch bé uống và tắm mát lành';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM sub_themes WHERE theme_id = v_theme_id AND name = 'Bầu trời ban ngày và ánh nắng sớm mai') THEN
    INSERT INTO sub_themes (theme_id, name, start_date, end_date, created_at, updated_at)
    VALUES (v_theme_id, 'Bầu trời ban ngày và ánh nắng sớm mai', '2027-04-19', '2027-04-25', NOW(), NOW());
  ELSE
    UPDATE sub_themes SET start_date = '2027-04-19', end_date = '2027-04-25', updated_at = NOW() WHERE theme_id = v_theme_id AND name = 'Bầu trời ban ngày và ánh nắng sớm mai';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM sub_themes WHERE theme_id = v_theme_id AND name = 'Hạt mưa rơi tí tách và hiện tượng thời tiết') THEN
    INSERT INTO sub_themes (theme_id, name, start_date, end_date, created_at, updated_at)
    VALUES (v_theme_id, 'Hạt mưa rơi tí tách và hiện tượng thời tiết', '2027-04-26', '2027-05-02', NOW(), NOW());
  ELSE
    UPDATE sub_themes SET start_date = '2027-04-26', end_date = '2027-05-02', updated_at = NOW() WHERE theme_id = v_theme_id AND name = 'Hạt mưa rơi tí tách và hiện tượng thời tiết';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM sub_themes WHERE theme_id = v_theme_id AND name = 'Làn gió mát lành và sắc màu cầu vồng') THEN
    INSERT INTO sub_themes (theme_id, name, start_date, end_date, created_at, updated_at)
    VALUES (v_theme_id, 'Làn gió mát lành và sắc màu cầu vồng', '2027-05-03', '2027-05-09', NOW(), NOW());
  ELSE
    UPDATE sub_themes SET start_date = '2027-05-03', end_date = '2027-05-09', updated_at = NOW() WHERE theme_id = v_theme_id AND name = 'Làn gió mát lành và sắc màu cầu vồng';
  END IF;

  -- Theme: "Mùa hè của bé và tạm biệt lớp nhà trẻ"
  SELECT theme_id INTO v_theme_id FROM curriculum_themes WHERE school_year_id = v_sy_id AND age_group = 'NHA_TRE' AND name = 'Mùa hè của bé và tạm biệt lớp nhà trẻ';
  IF v_theme_id IS NULL THEN
    INSERT INTO curriculum_themes (school_year_id, age_group, name, start_date, end_date, description, status, created_at, updated_at)
    VALUES (v_sy_id, 'NHA_TRE', 'Mùa hè của bé và tạm biệt lớp nhà trẻ', '2027-05-10', '2027-05-30', 'Tổng kết năm học, trang bị tâm thế tự tin cho bé lên lớp mầm', 'PUBLISHED', NOW(), NOW())
    RETURNING theme_id INTO v_theme_id;
  ELSE
    UPDATE curriculum_themes SET status = 'PUBLISHED', start_date = '2027-05-10', end_date = '2027-05-30', updated_at = NOW() WHERE theme_id = v_theme_id;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM sub_themes WHERE theme_id = v_theme_id AND name = 'Ánh nắng mùa hè rực rỡ và trang phục mát') THEN
    INSERT INTO sub_themes (theme_id, name, start_date, end_date, created_at, updated_at)
    VALUES (v_theme_id, 'Ánh nắng mùa hè rực rỡ và trang phục mát', '2027-05-10', '2027-05-16', NOW(), NOW());
  ELSE
    UPDATE sub_themes SET start_date = '2027-05-10', end_date = '2027-05-16', updated_at = NOW() WHERE theme_id = v_theme_id AND name = 'Ánh nắng mùa hè rực rỡ và trang phục mát';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM sub_themes WHERE theme_id = v_theme_id AND name = 'Bé vui chơi thỏa thích cùng bạn bè ngày hè') THEN
    INSERT INTO sub_themes (theme_id, name, start_date, end_date, created_at, updated_at)
    VALUES (v_theme_id, 'Bé vui chơi thỏa thích cùng bạn bè ngày hè', '2027-05-17', '2027-05-23', NOW(), NOW());
  ELSE
    UPDATE sub_themes SET start_date = '2027-05-17', end_date = '2027-05-23', updated_at = NOW() WHERE theme_id = v_theme_id AND name = 'Bé vui chơi thỏa thích cùng bạn bè ngày hè';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM sub_themes WHERE theme_id = v_theme_id AND name = 'Bé ngoan, tự tin chào tạm biệt lớp nhà trẻ lên lớp mầm') THEN
    INSERT INTO sub_themes (theme_id, name, start_date, end_date, created_at, updated_at)
    VALUES (v_theme_id, 'Bé ngoan, tự tin chào tạm biệt lớp nhà trẻ lên lớp mầm', '2027-05-24', '2027-05-30', NOW(), NOW());
  ELSE
    UPDATE sub_themes SET start_date = '2027-05-24', end_date = '2027-05-30', updated_at = NOW() WHERE theme_id = v_theme_id AND name = 'Bé ngoan, tự tin chào tạm biệt lớp nhà trẻ lên lớp mầm';
  END IF;

  -- Đảm bảo toàn bộ 10 chủ đề của Nhà trẻ đều có status = 'PUBLISHED'
  UPDATE curriculum_themes SET status = 'PUBLISHED', updated_at = NOW() WHERE school_year_id = v_sy_id AND age_group = 'NHA_TRE';

  RAISE NOTICE 'Đã cập nhật thành công 10 chủ đề và % chủ đề nhánh cho Khối Nhà trẻ 2026–2027', (SELECT count(*) FROM sub_themes WHERE theme_id IN (SELECT theme_id FROM curriculum_themes WHERE school_year_id = v_sy_id AND age_group = 'NHA_TRE'));
END $$;
