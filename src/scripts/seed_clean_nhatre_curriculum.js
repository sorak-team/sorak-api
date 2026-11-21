/**
 * seed_clean_nhatre_curriculum.js
 * 
 * CHUẨN HÓA 100% DỮ LIỆU KHỐI NHÀ TRẺ (24-36 THÁNG):
 * - 56 Mục tiêu giáo dục chuẩn theo Thông tư 51/2020/TT-BGDĐT.
 * - Nội dung giáo dục (NDGD) chuẩn hóa từ docs/BGD/Kế hoạch Giao dục 2025-2026_extracted.txt.
 * - Hoạt động giáo dục (HĐGD) chuyên sâu mầm non:
 *   + Mỗi NDGD có 1 - 2 HĐGD cụ thể, gắn đúng Khung giờ sinh hoạt tự nhiên.
 *   + TUYỆT ĐỐI KHÔNG nhân bản cơ học 7 slot cho mỗi NDGD.
 *   + Tái sử dụng HĐGD giữa các chủ đề: Cùng 1 NDGD xuất hiện ở nhiều chủ đề thì HĐGD đó được tái sử dụng.
 * - Lớp Nhà trẻ 1 (class_id: 5n):
 *   + 14 học sinh độ tuổi 24-36 tháng.
 *   + 4 Chủ đề phân bổ hợp lý, kế thừa các kỹ năng nề nếp cốt lõi.
 *   + Thời khóa biểu các tuần được xếp chuẩn theo đúng khung giờ và bài học thực tế.
 *   + Trạng thái phê duyệt: CĐ 01, 02, 03: USED; CĐ 04: REJECTED (để giáo viên test chỉnh sửa).
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const SCHOOL_YEAR_ID = 1n; // 2026-2027
const CLASS_ID = 5n; // Nhà trẻ 1
const TEACHER_ACCOUNT_ID = 76n; // Trần Công Trực
const BGH_ACCOUNT_ID = 3n; // Nguyễn Thu Trang

// Dữ liệu 56 Mục tiêu, Nội dung giáo dục & Hoạt động giáo dục chuẩn mầm non
const NHA_TRE_CURRICULUM_DATA = [
  // ==========================================
  // I. LĨNH VỰC PHÁT TRIỂN THỂ CHẤT (MT 01 -> MT 23)
  // ==========================================
  {
    num: 1,
    domain: 'PHYSICAL',
    title: 'Trẻ khỏe mạnh, cân nặng và chiều cao phát triển bình thường theo lứa tuổi',
    contents: [
      {
        title: 'Chế độ dinh dưỡng cân đối, hợp lý',
        activities: [
          {
            slot: 'HYGIENE_MEAL_SLEEP',
            title: 'Tổ chức giờ ăn trưa dinh dưỡng đủ 4 nhóm chất cho trẻ',
            objective: 'Trẻ ăn ngon miệng, ăn hết khẩu phần cơm canh giàu đạm, vitamin và khoáng chất.',
            preparation: 'Bàn ghế ăn sạch sẽ, khay cơm đủ 4 nhóm thực phẩm (đạm, bột đường, béo, vitamin).',
            procedure: 'Cô giới thiệu món ăn hấp dẫn, động viên trẻ tự xúc ăn, theo dõi trẻ ăn hết suất.',
            criteria: 'Trẻ hào hứng ăn, ăn hết suất ăn của mình.',
          },
        ],
      },
      {
        title: 'Tăng cường vận động phát triển thể chất',
        activities: [
          {
            slot: 'OUTDOOR_PLAY',
            title: 'Vận động ngoài trời: Hít thở không khí trong lành & dạo chơi sân trường',
            objective: 'Trẻ được tắm nắng sớm, tăng cường hấp thu vitamin D và vận động linh hoạt.',
            preparation: 'Sân trường sạch sẽ, thoáng mát, bóng cây râm mát.',
            procedure: 'Cô dắt trẻ đi dạo quanh sân, hướng dẫn hít thở sâu, chỉ cho trẻ quan sát cảnh quan sân trường.',
            criteria: 'Trẻ vui tươi, tích cực vận động cùng cô và bạn.',
          },
        ],
      },
      {
        title: 'Các hoạt động giáo dục trong ngày',
        activities: [
          {
            slot: 'ARRIVAL_PLAY',
            title: 'Trò chuyện sáng: Một ngày vui của bé ở trường mầm non',
            objective: 'Trẻ làm quen với nhịp sinh hoạt trong ngày tại trường mầm non, tạo tâm lý vui vẻ khi đến lớp.',
            preparation: 'Tranh ảnh các hoạt động trong ngày của bé tại trường.',
            procedure: 'Cô đón trẻ từ phụ huynh, cùng bé ngắm tranh và trò chuyện về các hoạt động bé sắp tham gia trong ngày.',
            criteria: 'Trẻ vui vẻ vào lớp, hợp tác trò chuyện cùng cô.',
          },
        ],
      },
    ],
  },
  {
    num: 2,
    domain: 'PHYSICAL',
    title: 'Trẻ thực hiện được các động tác trong bài tập thể dục: hít thở, tay, lưng/bụng và chân',
    contents: [
      {
        title: 'Hô hấp: tập hít vào, thở ra',
        activities: [
          {
            slot: 'MORNING_EXERCISE',
            title: 'TDS: Thổi bóng bay (Tập hít sâu thở đều)',
            objective: 'Rèn luyện phản xạ hô hấp, trẻ biết hít vào bằng mũi và thở ra bằng miệng.',
            preparation: 'Bóng bay màu sắc, nhạc không lời vui nhộn.',
            procedure: '1. Khởi động đi vòng tròn; 2. Làm động tác đưa 2 tay lên miệng thổi bóng to phồng má; 3. Hồi tĩnh.',
            criteria: 'Trẻ biết làm theo động tác thổi bóng của cô.',
          },
        ],
      },
      {
        title: 'Tay: giơ cao, đưa ra phía trước, đưa sang ngang, kết hợp lắc bàn tay',
        activities: [
          {
            slot: 'MORNING_EXERCISE',
            title: 'TDS: Động tác tay - Giơ cao, vẫy vẫy bàn tay xinh',
            objective: 'Phát triển các nhóm cơ bắp tay và khớp vai cho trẻ.',
            preparation: 'Vòng nhựa nhỏ hoặc nơ đeo tay nhiều màu.',
            procedure: 'Cô làm mẫu động tác giơ tay lên cao, đưa ra trước, dang ngang và vẫy cổ tay theo nhịp trống.',
            criteria: 'Trẻ giơ tay đúng hướng và lắc cổ tay theo cô.',
          },
        ],
      },
      {
        title: 'Lưng, bụng, lườn: cúi về phía trước, nghiêng người sang 2 bên, vặn người sang 2 bên',
        activities: [
          {
            slot: 'MORNING_EXERCISE',
            title: 'TDS: Động tác lườn bụng - Cây nghiêng đón gió mát',
            objective: 'Rèn luyện sự dẻo dai của cột sống và các nhóm cơ lườn bụng.',
            preparation: 'Nhạc bài hát "Cây trúc xinh".',
            procedure: 'Trẻ đứng hai chân rộng bằng vai, hai tay giơ cao nghiêng sang trái, nghiêng sang phải bắt chước cây đung đưa.',
            criteria: 'Trẻ nghiêng người theo nhịp và giữ được thăng bằng.',
          },
        ],
      },
      {
        title: 'Chân: ngồi xuống, đứng lên, co duỗi từng chân',
        activities: [
          {
            slot: 'MORNING_EXERCISE',
            title: 'TDS: Động tác chân - Cùng nhún nhảy theo nhịp',
            objective: 'Phát triển cơ chân, rèn luyện sự phối hợp vận động toàn thân.',
            preparation: 'Xắc xô, sàn tập bằng phẳng an toàn.',
            procedure: 'Cô gõ xắc xô, hướng dẫn trẻ ngồi xổm, đứng lên nhún nhảy và co duỗi từng chân nhịp nhàng.',
            criteria: 'Trẻ ngồi xổm và đứng dậy vững vàng, không ngã.',
          },
        ],
      },
    ],
  },
  {
    num: 3,
    domain: 'PHYSICAL',
    title: 'Trẻ giữ được thăng bằng trong vận động đi thay đổi tốc độ nhanh-chậm theo cô hoặc đi trong đường hẹp có bê vật trên đầu',
    contents: [
      {
        title: 'Đi theo hiệu lệnh, đi trong đường hẹp',
        activities: [
          {
            slot: 'DIRECTED_STUDY',
            title: 'VĐCB: Đi trong đường hẹp (rộng 25-30cm)',
            objective: 'Trẻ biết đi thẳng người trong đường hẹp, mắt nhìn thẳng, không bước chân ra ngoài vạch kẻ.',
            preparation: 'Con đường hẹp kẻ bằng ruy băng màu trên sàn (dài 3m, rộng 25cm), hoa nhựa.',
            procedure: '1. Khởi động; 2. Trọng động: Cô làm mẫu đi trong đường hẹp, trẻ lần lượt thực hiện; 3. TCVĐ nhẹ; 4. Hồi tĩnh.',
            criteria: 'Trẻ đi khéo léo trong đường hẹp, chân không giẫm lên vạch.',
          },
          {
            slot: 'OUTDOOR_PLAY',
            title: 'TCVĐ: Đi theo đường hẹp hái hoa tặng cô',
            objective: 'Củng cố kỹ năng đi thăng bằng kết hợp rèn luyện sự tự tin ngoài trời.',
            preparation: 'Đường hẹp trên sân bê tông xốp, rổ hoa giả xinh xắn.',
            procedure: 'Cô chia nhóm cho trẻ bước theo đường hoa, hái một bông hoa mang về rổ của đội mình.',
            criteria: 'Trẻ đi nối đuôi nhau trật tự, chân bước vững.',
          },
        ],
      },
      {
        title: 'Đi có mang vật trên tay',
        activities: [
          {
            slot: 'DIRECTED_STUDY',
            title: 'VĐCB: Đi mang vật trên tay khéo léo về đích',
            objective: 'Rèn luyện khả năng giữ thăng bằng khi cầm đồ vật di chuyển.',
            preparation: 'Rổ bóng nhựa nhẹ, đích đến cách 3m.',
            procedure: 'Trẻ hai tay cầm quả bóng, bước đi thẳng hướng đến đặt bóng vào rổ đích và quay về hàng.',
            criteria: 'Trẻ cầm chắc bóng, không làm rơi bóng trong khi đi.',
          },
        ],
      },
      {
        title: 'Đứng co 1 chân',
        activities: [
          {
            slot: 'OUTDOOR_PLAY',
            title: 'TCVĐ: Chú cò con đứng co một chân',
            objective: 'Rèn tố chất thăng bằng tĩnh ở tư thế đứng một chân.',
            preparation: 'Sân cỏ sạch sẽ, an toàn.',
            procedure: 'Cô làm mẫu chú cò đứng co một chân trong 3-5 giây, trẻ bắt chước làm theo tiếng hô của cô.',
            criteria: 'Trẻ đứng co 1 chân được tối thiểu 3 giây.',
          },
        ],
      },
    ],
  },
  {
    num: 4,
    domain: 'PHYSICAL',
    title: 'Trẻ giữ được thăng bằng trong vận động chạy thay đổi tốc độ nhanh - chậm theo cô',
    contents: [
      {
        title: 'Chạy theo hướng thẳng',
        activities: [
          {
            slot: 'DIRECTED_STUDY',
            title: 'VĐCB: Chạy 15m theo hướng thẳng về phía cô',
            objective: 'Trẻ biết phối hợp tay chân nhịp nhàng, chạy thẳng hướng đến cô khi có hiệu lệnh.',
            preparation: 'Vạch xuất phát và cờ hoa ở vạch đích (khoảng cách 15m).',
            procedure: '1. Khởi động xoay cổ tay cổ chân; 2. Cô làm mẫu chạy mắt nhìn về đích; 3. Cho từng trẻ chạy; 4. Nhận xét khen ngợi.',
            criteria: 'Trẻ chạy liên tục 15m không dừng lại giữa chừng, không ngã.',
          },
        ],
      },
      {
        title: 'Chạy thay đổi tốc độ nhanh - chậm theo cô',
        activities: [
          {
            slot: 'OUTDOOR_PLAY',
            title: 'TCVĐ: Đoàn tàu tí hon chạy nhanh - chạy chậm theo hiệu lệnh còi',
            objective: 'Trẻ điều chỉnh được tốc độ chạy theo hiệu lệnh âm thanh của cô.',
            preparation: 'Còi hiệu lệnh hoặc trống lắc xắc.',
            procedure: 'Cô giả làm đầu tàu, trẻ làm các toa tàu bám áo nhau chạy nhanh khi cô gõ nhanh, chạy chậm khi cô gõ chậm.',
            criteria: 'Trẻ phản ứng nhanh nhạy theo tốc độ gõ của cô.',
          },
        ],
      },
    ],
  },
  {
    num: 5,
    domain: 'PHYSICAL',
    title: 'Trẻ giữ được thăng bằng trong vận động bật',
    contents: [
      {
        title: 'Bật tại chỗ',
        activities: [
          {
            slot: 'OUTDOOR_PLAY',
            title: 'TCVĐ: Những chú ếch con bật nhảy tại chỗ',
            objective: 'Phát triển sức bật của đôi chân, trẻ biết nhún gối bật nhảy bằng 2 chân.',
            preparation: 'Mũ ếch xanh cho trẻ, thảm xốp mềm.',
            procedure: 'Trẻ đội mũ ếch, ngồi chồm hổm rồi cùng bật nhảy lên cao và kêu "ộp ộp" vui nhộn.',
            criteria: 'Trẻ nhún chân bật nhảy liên tục 3-4 lần.',
          },
        ],
      },
      {
        title: 'Bật qua vạch kẻ',
        activities: [
          {
            slot: 'DIRECTED_STUDY',
            title: 'VĐCB: Bật qua vạch kẻ (rộng 20cm)',
            objective: 'Trẻ biết nhún chân lấy đà và bật chụm hai chân qua vạch kẻ an toàn.',
            preparation: 'Vạch kẻ song song cách nhau 20cm trên sàn tập.',
            procedure: '1. Khởi động; 2. Trọng động: Cô làm mẫu tư thế chuẩn bị, nhún chân bật qua suối; 3. Trẻ thực hành; 4. Hồi tĩnh.',
            criteria: 'Trẻ tiếp đất bằng hai bàn chân nhẹ nhàng, không chạm vạch.',
          },
        ],
      },
    ],
  },
  {
    num: 6,
    domain: 'PHYSICAL',
    title: 'Trẻ tung - bắt được bóng với người khác ở khoảng cách 1m',
    contents: [
      {
        title: 'Tung - bắt bóng cùng cô',
        activities: [
          {
            slot: 'DIRECTED_STUDY',
            title: 'VĐCB: Tung và bắt bóng cùng cô (khoảng cách 1m)',
            objective: 'Rèn luyện phản xạ phối hợp tay - mắt, trẻ bắt được bóng cô tung ở khoảng cách 1m.',
            preparation: 'Bóng cao su mềm đường kính 15-18cm.',
            procedure: 'Cô ngồi đối diện trẻ cách 1m, hướng dẫn trẻ xòe hai tay đón bóng, sau đó hai tay tung bóng lại cho cô.',
            criteria: 'Trẻ bắt được bóng tối thiểu 3 lần liên tiếp không làm rơi bóng.',
          },
        ],
      },
    ],
  },
  {
    num: 7,
    domain: 'PHYSICAL',
    title: 'Trẻ ném vào đích xa 1-1,2 m',
    contents: [
      {
        title: 'Ném bóng về phía trước',
        activities: [
          {
            slot: 'DIRECTED_STUDY',
            title: 'VĐCB: Ném bóng về phía trước bằng một tay',
            objective: 'Rèn lực cổ tay và cánh tay, trẻ ném bóng về phía trước xa trên 1m.',
            preparation: 'Túi cát nhỏ hoặc bóng nhựa nhẹ vừa tay trẻ.',
            procedure: 'Trẻ đứng chân trước chân sau, tay cầm bóng giơ cao ngang tầm mắt và vung tay ném mạnh về phía trước.',
            criteria: 'Trẻ ném được bóng về phía trước qua vạch đích 1m.',
          },
        ],
      },
      {
        title: 'Ném bóng vào đích',
        activities: [
          {
            slot: 'OUTDOOR_PLAY',
            title: 'TCVĐ: Bé ném bóng trúng đích nằm ngang',
            objective: 'Rèn luyện khả năng định hướng không gian và độ chuẩn xác của tay.',
            preparation: 'Rổ đích nằm ngang cách vạch ném 1-1.2m, rổ bóng màu sắc.',
            procedure: 'Trẻ đứng trước vạch ném, cầm bóng ngắm chuẩn và ném vào rổ đích.',
            criteria: 'Trẻ ném được ít nhất 1-2 quả bóng trúng vào rổ đích.',
          },
        ],
      },
    ],
  },
  {
    num: 8,
    domain: 'PHYSICAL',
    title: 'Trẻ phối hơp tay, chân, cơ thể khi bò để giữ được vật trên lưng',
    contents: [
      {
        title: 'Bò thẳng hướng và có vật trên lưng',
        activities: [
          {
            slot: 'DIRECTED_STUDY',
            title: 'VĐCB: Bò theo hướng thẳng mang bao cát trên lưng',
            objective: 'Rèn luyện khả năng bò bằng bàn tay và cẳng chân phối hợp nhịp nhàng giữ vật không rơi.',
            preparation: 'Thảm cỏ nhân tạo sạch, bao cát nhỏ nhẹ hình thú bông.',
            procedure: 'Cô đặt bao cát lên lưng trẻ, hướng dẫn trẻ bò chậm rãi, lưng thẳng về phía đích.',
            criteria: 'Trẻ bò được 3m mà không làm rơi bao cát khỏi lưng.',
          },
        ],
      },
      {
        title: 'Bò chui qua cổng',
        activities: [
          {
            slot: 'DIRECTED_STUDY',
            title: 'VĐCB: Bò chui qua cổng không chạm đầu',
            objective: 'Trẻ biết cúi thấp đầu và lưng để bò qua cổng chui an toàn.',
            preparation: 'Cổng chui hình vòm hoa cao 50cm.',
            procedure: 'Trẻ chống tay và cẳng chân xuống sàn, bò nhịp nhàng chui qua 2 cổng liên tiếp.',
            criteria: 'Trẻ bò khéo léo, đầu và lưng không va chạm vào cổng.',
          },
        ],
      },
      {
        title: 'Bò trườn qua vật cản',
        activities: [
          {
            slot: 'OUTDOOR_PLAY',
            title: 'TCVĐ: Bé bò trườn qua vật cản tìm bóng',
            objective: 'Rèn luyện sức dẻo dai cơ bắp toàn thân khi vượt qua chướng ngại vật mềm.',
            preparation: 'Gối xốp êm thấp cao 10cm làm vật cản.',
            procedure: 'Trẻ bò trườn qua các khối xốp trên sân cỏ đến lấy bóng về cho cô.',
            criteria: 'Trẻ bò vượt qua vật cản hào hứng và nhanh nhẹn.',
          },
        ],
      },
    ],
  },
  {
    num: 9,
    domain: 'PHYSICAL',
    title: 'Trẻ thể hiện sức mạnh của cơ bắp trong vận động ném, đá bóng: ném xa lên phía trước bằng 1 tay (tối thiểu 1,5m)',
    contents: [
      {
        title: 'Ném xa bằng 1 tay',
        activities: [
          {
            slot: 'DIRECTED_STUDY',
            title: 'VĐCB: Ném bóng xa bằng một tay (tối thiểu 1,5m)',
            objective: 'Trẻ thể hiện lực ném mạnh mẽ của cánh tay, đưa bóng đi xa trên 1.5m.',
            preparation: 'Bóng tennis nhựa mềm hoặc bóng da nhỏ, vạch đo khoảng cách trên sân.',
            procedure: 'Cô làm mẫu tư thế cầm bóng, đưa bóng ra sau và lấy đà ném mạnh về phía trước.',
            criteria: 'Trẻ ném bóng bay xa tối thiểu 1.5m.',
          },
        ],
      },
    ],
  },
  {
    num: 10,
    domain: 'PHYSICAL',
    title: 'Trẻ vận động được cổ tay, bàn tay, ngón tay-thực hiện ‘múa khéo’',
    contents: [
      {
        title: 'Xoay tay, chạm các đầu ngón tay với nhau',
        activities: [
          {
            slot: 'CORNER_PLAY',
            title: 'Góc hoạt động với đồ vật: Múa khéo bàn tay xinh và các ngón tay',
            objective: 'Rèn sự linh hoạt của khớp cổ tay và độ mềm dẻo của các ngón tay.',
            preparation: 'Gương lớn, nhạc bài hát "Xòe bàn tay đếm ngón tay".',
            procedure: 'Cô cho trẻ ngồi đối diện nhau, cùng xoay cổ tay múa hoa và chạm các đầu ngón tay từng cặp một.',
            criteria: 'Trẻ chạm được lần lượt các đầu ngón tay cái, trỏ, giữa vào nhau.',
          },
        ],
      },
      {
        title: 'Rót, nhào, khuấy, đảo vò xé',
        activities: [
          {
            slot: 'CORNER_PLAY',
            title: 'Góc thao tác vai: Bé tập khuấy bột, nhào đất mềm và vò giấy màu',
            objective: 'Phát triển trương lực cơ ngón tay và khả năng phối hợp 2 tay.',
            preparation: 'Đất nặn mềm dẻo, bát thìa nhựa, giấy báo mềm.',
            procedure: 'Cô hướng dẫn trẻ dùng tay nhào đất, dùng thìa khuấy trong bát và hai tay vò viên giấy báo.',
            criteria: 'Trẻ thực hiện được các thao tác nhào, khuấy và vò giấy.',
          },
        ],
      },
    ],
  },
  {
    num: 11,
    domain: 'PHYSICAL',
    title: 'Trẻ phối hợp được cử động bàn tay, ngón tay và phối hợp tay mắt trong hoạt động: nhào đất nặn, vẽ tổ chim, xâu vòng tay, chuỗi đeo cổ',
    contents: [
      {
        title: 'Đóng cọc bàn gỗ, nhón nhặt đồ vật',
        activities: [
          {
            slot: 'CORNER_PLAY',
            title: 'Góc hoạt động với đồ vật: Bé cầm búa gõ đóng cọc gỗ nhiều màu',
            objective: 'Rèn luyện sự phối hợp tay mắt và sự khéo léo của lực cầm nắm.',
            preparation: 'Bộ bàn gõ búa gỗ kèm cọc nhiều màu sắc an toàn.',
            procedure: 'Trẻ cầm búa gõ nhẹ nhàng vào đầu cọc gỗ cho cọc thụt xuống lỗ.',
            criteria: 'Trẻ gõ búa trúng đầu cọc gỗ và vui vẻ chơi cùng bạn.',
          },
        ],
      },
      {
        title: 'Chắp ghép hình',
        activities: [
          {
            slot: 'CORNER_PLAY',
            title: 'Góc hoạt động với đồ vật: Chắp ghép các mảnh hình khối đơn giản',
            objective: 'Phát triển khả năng quan sát không gian và vận động tinh.',
            preparation: 'Tranh ghép gỗ 2-4 mảnh hình con vật, hoa quả.',
            procedure: 'Trẻ tìm và ghép 2 mảnh ghép lại với nhau tạo thành bức tranh hoàn chỉnh.',
            criteria: 'Trẻ tự ghép được tranh ghép 2 mảnh.',
          },
        ],
      },
      {
        title: 'Tập cầm bút tô, vẽ',
        activities: [
          {
            slot: 'DIRECTED_STUDY',
            title: 'Tạo hình: Bé tập cầm bút sáp màu di vẽ tự do trên giấy',
            objective: 'Dạy trẻ cách cầm bút sáp bằng 3 ngón tay và di màu tạo nét vẽ trên giấy A4.',
            preparation: 'Bút sáp màu to vừa tay trẻ, giấy vẽ trắng.',
            procedure: 'Cô hướng dẫn trẻ cầm bút màu đỏ, di các đường nét xoay tròn hoặc ziczac tạo bức tranh màu sắc.',
            criteria: 'Trẻ biết cầm bút sáp di màu kín giấy, không cắn bút.',
          },
        ],
      },
      {
        title: 'Lật mở trang sách',
        activities: [
          {
            slot: 'CORNER_PLAY',
            title: 'Góc sách truyện: Bé tập lật mở từng trang tranh truyện khổ to',
            objective: 'Rèn thói quen yêu thích sách và kỹ năng lật từng trang sách nhẹ nhàng.',
            preparation: 'Sách bìa cứng khổ to in hình ảnh sinh động.',
            procedure: 'Cô ngồi cạnh hướng dẫn trẻ dùng ngón trỏ và ngón cái lật từng trang từ phải sang trái.',
            criteria: 'Trẻ lật mở sách cẩn thận, không làm rách trang sách.',
          },
        ],
      },
    ],
  },
  {
    num: 12,
    domain: 'PHYSICAL',
    title: 'Trẻ xếp tháp, lồng hộp ; xếp chồng 6 - 8 hình khối.',
    contents: [
      {
        title: 'Chồng, xếp 6-8 khối hộp, lồng hộp vuông, hộp tròn to nhỏ',
        activities: [
          {
            slot: 'CORNER_PLAY',
            title: 'Góc xây dựng: Xếp chồng 6-8 khối gỗ tạo tòa tháp cao & lồng hộp to nhỏ',
            objective: 'Trẻ biết đặt khối gỗ thẳng hàng xếp chồng lên nhau không bị đổ và lồng các hộp theo kích cỡ.',
            preparation: 'Khối gỗ lập phương màu sắc, bộ hộp tròn lồng nhau 4 kích cỡ.',
            procedure: 'Cô làm mẫu xếp khối to ở dưới, khối nhỏ ở trên; hướng dẫn trẻ tự thao tác.',
            criteria: 'Trẻ xếp chồng được từ 6 khối gỗ trở lên đứng vững.',
          },
        ],
      },
    ],
  },
  {
    num: 13,
    domain: 'PHYSICAL',
    title: 'Trẻ tập xâu, luồn dây, cài, cởi cút, buộc dây',
    contents: [
      {
        title: 'Tập xâu, luồn dây, cài, cởi cúc, buộc dây',
        activities: [
          {
            slot: 'CORNER_PLAY',
            title: 'Góc hoạt động với đồ vật: Bé xâu vòng hoa tặng mẹ & tập cài cúc áo to',
            objective: 'Rèn luyện sự kiên trì và phối hợp khéo léo ngón tay cái - ngón tay trỏ.',
            preparation: 'Dây dù đầu cứng, hạt gỗ to có lỗ xuyên, khung cài cúc vải.',
            procedure: 'Cô hướng dẫn trẻ luồn đầu dây qua lỗ hạt gỗ và kéo dây; sau đó tập cài cúc áo to.',
            criteria: 'Trẻ xâu được chuỗi 4-5 hạt vòng hoa xinh xắn.',
          },
        ],
      },
    ],
  },
  {
    num: 14,
    domain: 'PHYSICAL',
    title: 'Trẻ thích nghi với chế độ sinh hoạt ở nhà trẻ',
    contents: [
      {
        title: 'Tập luyện nề nếp, thói quen tốt trong học tập vui chơi, trong ăn uống rửa tay trước khi ăn',
        activities: [
          {
            slot: 'HYGIENE_MEAL_SLEEP',
            title: 'Rèn nề nếp: Rửa tay bằng xà phòng trước khi ăn cơm và lau miệng sau ăn',
            objective: 'Trẻ hình thành thói quen vệ sinh cá nhân, biết rửa tay sạch trước giờ ăn.',
            preparation: 'Bồn rửa tay thấp vừa tầm trẻ, nước rửa tay dịu nhẹ, khăn lau sạch.',
            procedure: 'Cô hướng dẫn trẻ xoa xà phòng vào 2 lòng bàn tay dưới vòi nước chảy, rửa sạch và lau khô tay.',
            criteria: 'Trẻ tự giác ra bồn rửa tay khi nghe cô gọi giờ ăn.',
          },
        ],
      },
    ],
  },
  {
    num: 15,
    domain: 'PHYSICAL',
    title: 'Trẻ thích nghi với chế độ ăn cơm, ăn được các loại thức ăn khác nhau',
    contents: [
      {
        title: 'Làm quen với chế độ ăn cơm và các loại thức ăn khác nhau',
        activities: [
          {
            slot: 'HYGIENE_MEAL_SLEEP',
            title: 'Giờ ăn trưa: Bé ăn cơm ngoan và thử các món canh, rau, thịt cá đa dạng',
            objective: 'Trẻ tập nhai nuốt thức ăn hạt cơm mềm, không ngậm cơm, ăn được nhiều loại thực phẩm.',
            preparation: 'Cơm mềm xới nóng, thức ăn xắt nhỏ vừa miệng trẻ.',
            procedure: 'Cô động viên trẻ nếm thử từng món ăn, khen ngợi trẻ nhai kỹ và nuốt gọn.',
            criteria: 'Trẻ ăn hết khẩu phần cơm canh mà cô đã chia.',
          },
        ],
      },
    ],
  },
  {
    num: 16,
    domain: 'PHYSICAL',
    title: 'Trẻ ngủ 1 giấc ngủ trưa',
    contents: [
      {
        title: 'Luyện thói quen một giấc ngủ trưa',
        activities: [
          {
            slot: 'HYGIENE_MEAL_SLEEP',
            title: 'Tổ chức giờ ngủ trưa: Hát ru êm dịu, bé ngủ ngoan đủ giấc từ 11:30 đến 14:00',
            objective: 'Trẻ đi vào giấc ngủ trưa tự nhiên, ngủ sâu giấc từ 2 - 2.5 tiếng.',
            preparation: 'Phòng ngủ yên tĩnh thoáng mát, đệm nệm gối cá nhân sạch sẽ.',
            procedure: 'Sau giờ ăn và vệ sinh, cô cho trẻ nằm đúng chỗ đệm của mình, bật nhạc ru nhẹ nhàng dỗ trẻ ngủ.',
            criteria: 'Trẻ nằm ngoan trên giường và chìm vào giấc ngủ trong vòng 15-20 phút.',
          },
        ],
      },
    ],
  },
  {
    num: 17,
    domain: 'PHYSICAL',
    title: 'Trẻ đi vệ sinh đúng nơi quy định',
    contents: [
      {
        title: 'Tập đi vệ sinh đúng nơi quy định',
        activities: [
          {
            slot: 'HYGIENE_MEAL_SLEEP',
            title: 'Rèn nề nếp vệ sinh: Bé biết đi tiểu tiện, đại tiện đúng bồn cầu ngồi ngoan',
            objective: 'Trẻ biết gọi cô khi có nhu cầu đi vệ sinh và đi đúng bồn cầu dành cho lứa tuổi nhà trẻ.',
            preparation: 'Nhà vệ sinh sạch sẽ, khô ráo, bồn cầu mầm non an toàn.',
            procedure: 'Cô đưa trẻ vào nhà vệ sinh theo giờ quy định (sau ngủ dậy, trước khi ăn), hướng dẫn trẻ ngồi bồn cầu.',
            criteria: 'Trẻ không đi tiểu tiện ra quần, biết ngồi bồn cầu ngay ngắn.',
          },
        ],
      },
    ],
  },
  {
    num: 18,
    domain: 'PHYSICAL',
    title: 'Trẻ biết bỏ rác đúng nơi quy định',
    contents: [
      {
        title: 'Rèn trẻ biết bỏ rác đúng nơi quy định',
        activities: [
          {
            slot: 'AFTERNOON_ACTIVITY',
            title: 'Kỹ năng sống: Bé nhặt rác, vỏ hộp sữa bỏ vào thùng rác của lớp',
            objective: 'Giáo dục ý thức giữ gìn vệ sinh môi trường lớp học sạch đẹp.',
            preparation: 'Thùng rác có nắp mở đạp chân hoặc hình thú ngộ nghĩnh.',
            procedure: 'Sau giờ ăn xế uống sữa, cô nhắc bé cầm vỏ hộp sữa đi đến thùng rác và bỏ vào thùng.',
            criteria: 'Trẻ tự giác bỏ vỏ rác vào thùng rác sau khi dùng xong.',
          },
        ],
      },
    ],
  },
  {
    num: 19,
    domain: 'PHYSICAL',
    title: 'Trẻ làm được một số việc tự phục vụ đơn giản (tự xúc ăn, uống nước, cài cúc áo)',
    contents: [
      {
        title: 'Xúc cơm, uống nước',
        activities: [
          {
            slot: 'HYGIENE_MEAL_SLEEP',
            title: 'Giờ ăn: Rèn trẻ tự cầm thìa xúc cơm gọn gàng và tự cầm cốc uống nước',
            objective: 'Trẻ tự lập cầm thìa xúc thức ăn đưa vào miệng, không làm rơi vãi nhiều.',
            preparation: 'Thìa inox vừa tay cầm, cốc uống nước có quai.',
            procedure: 'Cô ngồi cạnh nhắc trẻ cầm thìa tay phải, tay trái giữ mép bát, tự xúc ăn từ từ.',
            criteria: 'Trẻ tự xúc ăn hết nửa bát cơm trở lên.',
          },
        ],
      },
      {
        title: 'Mặc quần áo, đi dép, đi vệ sinh, cởi quần áo khi bị bẩn, bị ướt',
        activities: [
          {
            slot: 'AFTERNOON_ACTIVITY',
            title: 'Rèn tự phục vụ: Bé tập tự xỏ dép, cất dép và nhận biết quần áo bị ướt',
            objective: 'Trẻ biết tự đi dép vào chân đúng chiều và biết nói khi áo quần bị ướt.',
            preparation: 'Giá để dép có ký hiệu hình con vật của từng bé.',
            procedure: 'Cô dạy trẻ phân biệt dép chiếc trái chiếc phải, xỏ chân vào dép và cất lên ngăn giá đúng ký hiệu.',
            criteria: 'Trẻ tự xỏ được dép vào chân và cất dép đúng nơi.',
          },
        ],
      },
    ],
  },
  {
    num: 20,
    domain: 'PHYSICAL',
    title: 'Trẻ chấp nhận: đội mũ khi đi ra nắng; đi giầy dép; mặc quần áo ấm khi trời lạnh',
    contents: [
      {
        title: 'Mặc quần áo ấm, đi giầy dép, đội mũ khi ra nắng',
        activities: [
          {
            slot: 'OUTDOOR_PLAY',
            title: 'Kỹ năng tự bảo vệ: Bé tự lấy và đội mũ rộng vành trước khi ra sân hoạt động',
            objective: 'Hình thành thói quen bảo vệ sức khỏe khi ra ngoài trời.',
            preparation: 'Mũ nan mầm non để trên giá móc vừa tầm tay bé.',
            procedure: 'Trước khi ra sân chơi dạo, cô nhắc nhở cả lớp cùng lấy mũ đội lên đầu rồi mới xếp hàng ra sân.',
            criteria: 'Trẻ sẵn sàng đội mũ khi ra sân và không giật vứt mũ.',
          },
        ],
      },
    ],
  },
  {
    num: 21,
    domain: 'PHYSICAL',
    title: 'Trẻ thể hiện một số nhu cầu ăn uống, vệ sinh bằng cử chỉ/ lời nói.',
    contents: [
      {
        title: 'Tập nói với người lớn khi có nhu cầu ăn, ngủ, vệ sinh',
        activities: [
          {
            slot: 'ARRIVAL_PLAY',
            title: 'Trò chuyện sáng: Nhắc bé biết nói "Cô ơi con muốn uống nước / đi vệ sinh"',
            objective: 'Trẻ biết dùng lời nói hoặc cử chỉ chỉ tay để thông báo nhu cầu cá nhân với cô giáo.',
            preparation: 'Tranh minh họa bé uống nước, bé đi vệ sinh.',
            procedure: 'Cô trò chuyện, khuyến khích trẻ mạnh dạn nói ra nhu cầu của mình bất cứ lúc nào trong ngày.',
            criteria: 'Trẻ chủ động chạy lại nói với cô khi khát nước hoặc buồn tiểu.',
          },
        ],
      },
    ],
  },
  {
    num: 22,
    domain: 'PHYSICAL',
    title: 'Trẻ biết tránh một số vật dụng, nơi nguy hiểm',
    contents: [
      {
        title: 'Nhận biết vật dụng và nơi nguy hiểm: bếp đang đun, phích nước nóng, xô nước, giếng',
        activities: [
          {
            slot: 'DIRECTED_STUDY',
            title: 'Kỹ năng sống: Nhận biết không chạm vào phích nước sôi, ổ cắm điện',
            objective: 'Trẻ nhận biết các vật dụng có thể gây bỏng, giật điện và biết tránh xa.',
            preparation: 'Mô hình ổ điện có dấu gạch chéo đỏ, tranh phích nước nóng bốc khói.',
            procedure: 'Cô cho trẻ xem tranh, giải thích vì sao nguy hiểm, dạy bé hô "Nóng lắm, không sờ!".',
            criteria: 'Trẻ nói được "Không sờ vào ổ điện / nước nóng".',
          },
        ],
      },
    ],
  },
  {
    num: 23,
    domain: 'PHYSICAL',
    title: 'Trẻ  biết tránh một số hành động nguy hiểm',
    contents: [
      {
        title: 'Nhận biết một số hành động nguy hiểm và phòng tránh: leo trèo lan can, chơi vật sắc nhọn',
        activities: [
          {
            slot: 'AFTERNOON_ACTIVITY',
            title: 'Trò chuyện an toàn: Bé không leo trèo cửa sổ, lan can cầu thang',
            objective: 'Trẻ hiểu được hành vi leo trèo có thể bị ngã đau và biết đi lại an toàn trong lớp.',
            preparation: 'Video hoạt hình ngắn về bạn nhỏ bị ngã khi trèo ghế.',
            procedure: 'Cô cho xem clip ngắn, trò chuyện cùng trẻ về việc chỉ ngồi trên ghế ngoan, không trèo lên bàn hay cửa sổ.',
            criteria: 'Trẻ không leo trèo lên bàn ghế, lan can cầu thang.',
          },
        ],
      },
    ],
  },

  // ==========================================
  // II. LĨNH VỰC PHÁT TRIỂN NHẬN THỨC (MT 24 -> MT 33)
  // ==========================================
  {
    num: 24,
    domain: 'COGNITIVE',
    title: 'Trẻ sờ nắn, nhìn, ngửi, nếm để nhận biết đặc điểm nổi bật của đối tượng',
    contents: [
      {
        title: 'Sờ nắn, nhìn, ngửi đồ vật, hoa, quả để nhận biết đặc điểm nổi bật',
        activities: [
          {
            slot: 'DIRECTED_STUDY',
            title: 'Khám phá khoa học: Chiếc hộp bí mật (Bé sờ, ngửi các loại quả thơm quen thuộc)',
            objective: 'Trẻ phát triển các giác quan thị giác, khứu giác, xúc giác khi tiếp xúc vật thật.',
            preparation: 'Hộp bí mật có lỗ thò tay, quả cam, quả chuối thật.',
            procedure: 'Trẻ thò tay vào hộp sờ nắn vỏ quả, ngửi mùi thơm và đoán tên quả.',
            criteria: 'Trẻ nhận biết và gọi đúng tên quả thông qua sờ và ngửi.',
          },
        ],
      },
      {
        title: 'Sờ nắn đồ vật, đồ chơi để nhận biết cứng, mềm, trơn (nhẵn) - xù xì',
        activities: [
          {
            slot: 'CORNER_PLAY',
            title: 'Góc khám phá: Cảm nhận bề mặt đồ vật cứng - mềm, trơn nhẵn - xù xì',
            objective: 'Trẻ phân biệt được cảm giác xúc giác cứng của khối gỗ và mềm của thú bông.',
            preparation: 'Khối gỗ, thú bông bông gòn, lá bưởi ráp, quả bóng nhựa nhẵn.',
            procedure: 'Cô cho từng trẻ sờ tay vào thú bông và khối gỗ, tập phát âm từ "cứng", "mềm".',
            criteria: 'Trẻ chỉ đúng đồ vật cứng và đồ vật mềm theo yêu cầu của cô.',
          },
        ],
      },
    ],
  },
  {
    num: 25,
    domain: 'COGNITIVE',
    title: 'Trẻ chơi bắt chước một số hành động quen thuộc của những người gần gũi.',
    contents: [
      {
        title: 'Bắt chước một số hành động quen thuộc của những người gần gũi: cô giáo, ông bà, ba mẹ',
        activities: [
          {
            slot: 'CORNER_PLAY',
            title: 'Góc thao tác vai: Bé tập làm đầu bếp nấu ăn, bế em búp bê như mẹ',
            objective: 'Trẻ tái hiện lại hành động quen thuộc của mẹ như khuấy cháo, bón thìa cho búp bê.',
            preparation: 'Búp bê em bé, bình sữa đồ chơi, xoong chảo đồ chơi.',
            procedure: 'Cô gợi ý tình huống "Em bé đói rồi", trẻ vào góc lấy thìa xúc bột cho em bé ăn.',
            criteria: 'Trẻ thực hiện được các thao tác chăm sóc búp bê mô phỏng người lớn.',
          },
        ],
      },
    ],
  },
  {
    num: 26,
    domain: 'COGNITIVE',
    title: 'Trẻ sử dụng được một số đồ dùng, đồ chơi quen thuộc',
    contents: [
      {
        title: 'Đồ dùng, đồ chơi của bản thân và của nhóm/lớp',
        activities: [
          {
            slot: 'CORNER_PLAY',
            title: 'Hoạt động góc: Bé khám phá và sử dụng đồ chơi xếp hình, lăn xe ôtô đúng cách',
            objective: 'Trẻ biết công dụng cơ bản của đồ chơi (xe ôtô để đẩy lăn trên sàn, bóng để lăn tung).',
            preparation: 'Bộ xe ôtô nhựa, đồ chơi xếp hình bằng nhựa to.',
            procedure: 'Cô hướng dẫn trẻ dùng tay đẩy nhẹ xe chạy trên sàn, lắp các khối bánh răng khớp nhau.',
            criteria: 'Trẻ thao tác đúng chức năng của đồ chơi, không ném đồ chơi.',
          },
        ],
      },
    ],
  },
  {
    num: 27,
    domain: 'COGNITIVE',
    title: 'Trẻ nói được tên của bản thân và những người gần gũi',
    contents: [
      {
        title: 'Tên và một số đặc điểm bên ngoài của bản thân',
        activities: [
          {
            slot: 'DIRECTED_STUDY',
            title: 'NBTN: Tên của bé và bạn trai, bạn gái trong lớp',
            objective: 'Trẻ nói được tên của mình và phân biệt được bạn trai mặc quần, bạn gái mặc váy.',
            preparation: 'Gương soi lớn, ảnh chân dung của từng trẻ.',
            procedure: 'Cô gọi từng trẻ đứng trước gương, hỏi "Con tên là gì? Con là bạn trai hay bạn gái?".',
            criteria: 'Trẻ nói rõ tên của mình khi được hỏi.',
          },
        ],
      },
      {
        title: 'Tên và công việc của những người thân gần gũi trong gia đình',
        activities: [
          {
            slot: 'DIRECTED_STUDY',
            title: 'NBTN: Những người thân yêu trong gia đình của bé',
            objective: 'Trẻ biết gọi tên bố, mẹ, ông, bà và nói được tình cảm yêu thương với gia đình.',
            preparation: 'Tranh ảnh gia đình gồm ông, bà, bố, mẹ và bé.',
            procedure: 'Cô chỉ vào từng người trong tranh, hỏi trẻ "Ai đây?", trò chuyện về công việc của mẹ nấu cơm, bố đi làm.',
            criteria: 'Trẻ chỉ và nói đúng "Bố", "Mẹ", "Ông", "Bà".',
          },
        ],
      },
      {
        title: 'Tên của cô giáo, các bạn, nhóm/lớp',
        activities: [
          {
            slot: 'ARRIVAL_PLAY',
            title: 'Trò chuyện sáng: Chào hỏi cô giáo và bạn mới lớp Nhà trẻ 1',
            objective: 'Trẻ nhớ được tên 2 cô giáo phụ trách lớp và nhớ tên một số bạn chơi cùng.',
            preparation: 'Bảng ảnh cô và các bé lớp Nhà trẻ 1.',
            procedure: 'Đầu giờ sáng, cô cùng các bé chào hỏi nhau, điểm danh gọi tên từng bạn ấm áp.',
            criteria: 'Trẻ gọi đúng tên cô giáo đứng lớp.',
          },
        ],
      },
    ],
  },
  {
    num: 28,
    domain: 'COGNITIVE',
    title: 'Trẻ nói được tên và chức năng của một số bộ phận cơ thể',
    contents: [
      {
        title: 'Tên, chức năng chính các bộ phận: Mắt, mũi, miệng, tai, tay, chân',
        activities: [
          {
            slot: 'DIRECTED_STUDY',
            title: 'NBTN: Mắt, mũi, miệng, tai và đôi bàn tay xinh của bé',
            objective: 'Trẻ chỉ và gọi đúng tên các giác quan, hiểu mắt để nhìn, tai để nghe, miệng để nói.',
            preparation: 'Búp bê lớn, gương soi, bài hát "Khuôn mặt cười".',
            procedure: 'Cô hỏi đố "Mắt xinh của con đâu?", trẻ chỉ vào mắt mình và đồng thanh nói tên.',
            criteria: 'Trẻ chỉ đúng tối thiểu 4 bộ phận trên cơ thể khi cô gọi tên.',
          },
        ],
      },
      {
        title: 'Nếm vị của một số thức ăn, quả (ngọt, mặn, chua)',
        activities: [
          {
            slot: 'AFTERNOON_ACTIVITY',
            title: 'Trải nghiệm vị giác: Nếm vị ngọt của quả chuối và vị chua của quả quất',
            objective: 'Trẻ cảm nhận và gọi tên được 2 vị cơ bản: ngọt và chua.',
            preparation: 'Đĩa chuối tiêu chín ngọt, vài giọt nước quất pha loãng, thìa nhỏ.',
            procedure: 'Cô cho trẻ nếm miếng chuối ngọt, hỏi trẻ thấy thế nào, sau đó cho nếm nước quất chua nhẹ.',
            criteria: 'Trẻ nói được từ "ngọt" và biểu lộ cảm xúc khi nếm vị chua.',
          },
        ],
      },
    ],
  },
  {
    num: 29,
    domain: 'COGNITIVE',
    title: 'Trẻ nói được tên và một vài đặc điểm nổi bật của các đồ vật, hoa quả, con vật quen thuộc.',
    contents: [
      {
        title: 'Tên, đặc điểm nổi bật, công dụng của đồ dùng, đồ chơi quen thuộc',
        activities: [
          {
            slot: 'DIRECTED_STUDY',
            title: 'NBTN: Cái bát, cái thìa dùng để ăn cơm',
            objective: 'Trẻ nhận biết hình dáng cái bát sâu lòng, cái thìa dài và công dụng trong bữa ăn.',
            preparation: 'Bát thìa nhựa đủ màu sắc sạch sẽ.',
            procedure: 'Cô đưa cái bát ra hỏi "Cái gì đây? Dùng để làm gì?", cho trẻ cầm sờ và tập nói câu hoàn chỉnh.',
            criteria: 'Trẻ phát âm rõ ràng "Cái bát", "Cái thìa để xúc cơm".',
          },
        ],
      },
      {
        title: 'Tên, đặc điểm nổi bật, công dụng của PTGT gần gũi',
        activities: [
          {
            slot: 'DIRECTED_STUDY',
            title: 'NBTN: Xe máy và xe đạp chở bé đi học',
            objective: 'Trẻ nhận biết tiếng còi xe máy "bíp bíp", chuông xe đạp "kính coong" và 2 bánh xe.',
            preparation: 'Mô hình xe máy và xe đạp đồ chơi chuyển động được.',
            procedure: 'Cô tạo âm thanh tiếng còi, cho trẻ quan sát mô hình xe, chỉ vào bánh xe và yên xe.',
            criteria: 'Trẻ chỉ đúng xe máy và xe đạp khi cô yêu cầu.',
          },
        ],
      },
      {
        title: 'Tên, đặc điểm nổi bật của con vật, rau, hoa quả quen thuộc',
        activities: [
          {
            slot: 'DIRECTED_STUDY',
            title: 'NBTN: Con gà trống gáy vang và chú vịt bầu bơi lội',
            objective: 'Trẻ nhận biết mào đỏ của gà trống kêu "ò ó o", mỏ dẹt của vịt bầu kêu "cạp cạp".',
            preparation: 'Mô hình con gà trống, con vịt bầu sinh động.',
            procedure: 'Cô giả tiếng gáy gà trống, cho trẻ xem mô hình, chỉ vào mào gà, đuôi gà và bắt chước tiếng kêu.',
            criteria: 'Trẻ nói được tên con gà, con vịt và phát âm được tiếng kêu của chúng.',
          },
        ],
      },
    ],
  },
  {
    num: 30,
    domain: 'COGNITIVE',
    title: 'Trẻ chỉ/lấy/gọi tên đồ vật, rau, hoa, quả có màu đỏ, vàng, xanh khi yêu cầu.',
    contents: [
      {
        title: 'Nhận biết, phân biệt, gọi tên màu đỏ, vàng, xanh',
        activities: [
          {
            slot: 'DIRECTED_STUDY',
            title: 'NBTN: Nhận biết, phân biệt màu đỏ và màu vàng',
            objective: 'Trẻ nhận biết chính xác màu đỏ và màu vàng qua đồ dùng, hoa quả trực quan.',
            preparation: 'Bông hoa màu đỏ, bông hoa màu vàng, rổ đựng cùng màu.',
            procedure: 'Cô giới thiệu bông hoa màu đỏ rực rỡ, bông hoa màu vàng tươi; cho trẻ tìm hoa đỏ cắm vào lọ đỏ.',
            criteria: 'Trẻ chọn đúng đồ vật màu đỏ và màu vàng theo lời cô yêu cầu.',
          },
        ],
      },
      {
        title: 'Số lượng (một - nhiều)',
        activities: [
          {
            slot: 'DIRECTED_STUDY',
            title: 'NBTN: Phân biệt số lượng một - nhiều qua chùm bóng bay',
            objective: 'Trẻ hiểu khái niệm một đồ vật và nhiều đồ vật trong thực tế.',
            preparation: 'Một quả bóng màu xanh và một chùm nhiều quả bóng màu đỏ.',
            procedure: 'Cô cầm 1 quả bóng lên hỏi trẻ, sau đó đưa chùm nhiều quả bóng cho trẻ cùng đếm "nhiều bóng".',
            criteria: 'Trẻ chỉ đúng bên có "một" và bên có "nhiều".',
          },
        ],
      },
    ],
  },
  {
    num: 31,
    domain: 'COGNITIVE',
    title: 'Trẻ chỉ/lấy/gọi tên đồ vật, rau, hoa, quả có kích thước to, nhỏ khi yêu cầu',
    contents: [
      {
        title: 'Nhận biết, phân biệt, gọi tên kích thước to, nhỏ',
        activities: [
          {
            slot: 'DIRECTED_STUDY',
            title: 'NBTN: Nhận biết quả cam to - quả cam nhỏ',
            objective: 'Trẻ so sánh và nhận biết được sự khác biệt về kích thước to hơn - nhỏ hơn khi đặt cạnh nhau.',
            preparation: 'Quả cam sành to và quả quất nhỏ, 2 đĩa to nhỏ tương ứng.',
            procedure: 'Cô đặt quả to cạnh quả nhỏ, hướng dẫn trẻ so sánh và đặt quả to vào đĩa to, quả nhỏ vào đĩa nhỏ.',
            criteria: 'Trẻ lấy đúng vật to và vật nhỏ khi cô yêu cầu.',
          },
        ],
      },
    ],
  },
  {
    num: 32,
    domain: 'COGNITIVE',
    title: 'Trẻ nhận biết hình dạng',
    contents: [
      {
        title: 'Nhận dạng và gọi tên hình tròn, hình vuông',
        activities: [
          {
            slot: 'DIRECTED_STUDY',
            title: 'NBTN: Nhận biết hình tròn lăn được và hình vuông đứng yên',
            objective: 'Trẻ nhận biết hình tròn có đường bao cong tròn lăn được, hình vuông có các góc cạnh.',
            preparation: 'Hình tròn màu đỏ lăn được, hình vuông màu xanh đứng yên bằng gỗ.',
            procedure: 'Cô cho trẻ cầm hình tròn lăn trên bàn, sau đó thử lăn hình vuông; cùng trẻ nhắc tên hình.',
            criteria: 'Trẻ chỉ đúng hình tròn và hình vuông khi cô gọi tên.',
          },
        ],
      },
    ],
  },
  {
    num: 33,
    domain: 'COGNITIVE',
    title: 'Trẻ nhận biết vị trí trong không gian so với bản thân',
    contents: [
      {
        title: 'Vị trí trong không gian (trên - dưới; trước - sau) so với bản thân của trẻ',
        activities: [
          {
            slot: 'DIRECTED_STUDY',
            title: 'NBTN: Phía trên - phía dưới và phía trước - phía sau của bé',
            objective: 'Trẻ xác định được phía trên (ngẩng đầu nhìn trần nhà), phía dưới (cúi nhìn sàn nhà).',
            preparation: 'Bóng bay treo phía trên trần lớp, thảm hoa trải phía dưới chân trẻ.',
            procedure: 'Cô cho trẻ giơ tay lên cao chỉ quả bóng "ở phía trên", cúi xuống nhìn chân "ở phía dưới".',
            criteria: 'Trẻ giơ tay đúng hướng phía trên và phía dưới theo hiệu lệnh của cô.',
          },
        ],
      },
    ],
  },

  // ==========================================
  // III. LĨNH VỰC PHÁT TRIỂN NGÔN NGỮ (MT 34 -> MT 44)
  // ==========================================
  {
    num: 34,
    domain: 'LANGUAGE',
    title: 'Trẻ làm được theo chỉ dẫn một số yêu cầu đơn giản',
    contents: [
      {
        title: 'Nghe và thực hiện các yêu cầu bằng lời nói',
        activities: [
          {
            slot: 'ARRIVAL_PLAY',
            title: 'Đón trẻ: Bé làm theo yêu cầu "Bé cất dép lên giá và mang ba lô vào tủ"',
            objective: 'Rèn luyện khả năng lắng nghe và thực hiện đúng chỉ dẫn của cô giáo.',
            preparation: 'Khu vực đón trẻ, giá dép, tủ ba lô cá nhân.',
            procedure: 'Cô chào đón bé, đưa ra lời hướng dẫn nhẹ nhàng từng bước để bé tự cất đồ dùng.',
            criteria: 'Trẻ hiểu lời nói và làm đúng thao tác cất dép, cất ba lô.',
          },
        ],
      },
    ],
  },
  {
    num: 35,
    domain: 'LANGUAGE',
    title: 'Trẻ trả lời các câu hỏi : “Ai đây?”,”Cái gì đây?”,…” làm gì?”, “Thế nào ?”',
    contents: [
      {
        title: 'Nghe và trả lời các câu hỏi: Cái gì?, Làm gì?, Ở đâu?, Như thế nào?',
        activities: [
          {
            slot: 'AFTERNOON_ACTIVITY',
            title: 'Trò chuyện theo tranh: Bé trả lời "Ai đây? Con gì đây? Đang làm gì?"',
            objective: 'Kích thích phản xạ ngôn ngữ mạch lạc, phát triển vốn từ cho trẻ.',
            preparation: 'Bộ tranh truyện khổ lớn có các hoạt động vui chơi của bé và muông thú.',
            procedure: 'Cô chỉ vào nhân vật trong tranh, đặt câu hỏi gợi mở để trẻ quan sát và trả lời thành câu ngắn.',
            criteria: 'Trẻ trả lời được từ 2-3 từ rõ ràng theo câu hỏi của cô.',
          },
        ],
      },
    ],
  },
  {
    num: 36,
    domain: 'LANGUAGE',
    title: 'Trẻ hiểu được nội dung truyện ngắn đơn giản: Trả lời được các câu hỏi về tên truyện, tên và hành động của các nhân vật',
    contents: [
      {
        title: 'Lắng nghe khi người lớn đọc sách',
        activities: [
          {
            slot: 'CORNER_PLAY',
            title: 'Góc sách truyện: Bé cùng cô xem tranh và lắng nghe giọng đọc truyền cảm',
            objective: 'Rèn luyện sự tập trung chú ý lắng nghe cô kể chuyện, tạo tình cảm với sách truyện.',
            preparation: 'Góc thư viện mini có thảm xốp êm, sách tranh nhiều màu sắc.',
            procedure: 'Cô ôm các bé vào lòng, lật mở từng trang tranh và kể chuyện bằng giọng điệu diễn cảm.',
            criteria: 'Trẻ ngồi trật tự lắng nghe cô đọc sách trong 5-7 phút.',
          },
        ],
      },
      {
        title: 'Trả lời và đặt câu hỏi về nhân vật trong truyện',
        activities: [
          {
            slot: 'DIRECTED_STUDY',
            title: 'Kể chuyện: Chuyện Thỏ con không vâng lời mẹ',
            objective: 'Trẻ hiểu nội dung truyện, nhớ tên bạn Thỏ con, bác Gấu và nhớ lời mẹ dặn.',
            preparation: 'Sa bàn rối Thỏ con, Bướm hoa và Bác Gấu.',
            procedure: '1. Cô kể chuyện diễn cảm lần 1; 2. Kể lần 2 kết hợp sa bàn rối; 3. Trò chuyện đàm thoại cùng trẻ.',
            criteria: 'Trẻ trả lời được câu hỏi "Trong truyện có ai?" và nhắc lại được "Thỏ con".',
          },
        ],
      },
    ],
  },
  {
    num: 37,
    domain: 'LANGUAGE',
    title: 'Trẻ phát âm rõ tiếng',
    contents: [
      {
        title: 'Xem tranh và gọi tên nhân vật, hành động gần gũi trong tranh',
        activities: [
          {
            slot: 'AFTERNOON_ACTIVITY',
            title: 'Luyện phát âm: Bé xem tranh và gọi to tên đồ vật, con vật quen thuộc',
            objective: 'Sửa ngọng, giúp trẻ phát âm rõ ràng, tròn vành rõ chữ các âm tiết cơ bản.',
            preparation: 'Thẻ flashcard hình ảnh con mèo, con chó, quả bóng, xe ôtô.',
            procedure: 'Cô giơ thẻ hình ảnh lên, phát âm mẫu chậm rãi, sau đó cho từng trẻ phát âm lại theo cô.',
            criteria: 'Trẻ phát âm rõ tiếng tên vật trong tranh.',
          },
        ],
      },
      {
        title: 'Kể lại đoạn truyện được nghe nhiều lần, có gợi ý',
        activities: [
          {
            slot: 'DIRECTED_STUDY',
            title: 'Kể chuyện theo rối tay: Quả thị thơm (Bé nhắc lời thoại nhân vật)',
            objective: 'Trẻ tự tin phát âm câu ngắn theo lời gợi ý của cô giáo.',
            preparation: 'Rối tay hình Bà lão và Quả thị.',
            procedure: 'Cô dùng rối tay thể hiện đoạn đối thoại, khuyến khích bé cùng đọc theo "Thị ơi thị rụng bị bà".',
            criteria: 'Trẻ phát âm đồng thanh được câu thơ ngắn trong truyện.',
          },
        ],
      },
    ],
  },
  {
    num: 38,
    domain: 'LANGUAGE',
    title: 'Trẻ đọc được bài thơ, ca dao, đồng dao với sự giúp đỡ của cô giáo',
    contents: [
      {
        title: 'Nghe và đọc bài thơ ngắn có câu 3-4 tiếng',
        activities: [
          {
            slot: 'DIRECTED_STUDY',
            title: 'Dạy thơ: Bạn mới / Giờ ăn cơm (Bé đọc diễn cảm theo cô)',
            objective: 'Trẻ nhớ tên bài thơ, đọc được từng câu thơ 3-4 tiếng theo nhịp điệu của cô.',
            preparation: 'Tranh minh họa bài thơ "Bạn mới", nhạc đệm êm dịu.',
            procedure: '1. Cô đọc thơ mẫu diễn cảm; 2. Dạy trẻ đọc từng câu theo lối đối thoại; 3. Cả lớp và từng tổ cùng đọc thơ.',
            criteria: 'Trẻ đọc thuộc các câu thơ ngắn với sự trợ giúp của cô.',
          },
        ],
      },
      {
        title: 'Nghe đồng dao, ca dao, hò vè dân gian',
        activities: [
          {
            slot: 'AFTERNOON_ACTIVITY',
            title: 'Đọc đồng dao, ca dao dân gian: Dung dăng dung dẻ, Nu na nu nống',
            objective: 'Trẻ làm quen với nhịp điệu ca dao dân gian vui tươi, kết hợp vận động tay chân.',
            preparation: 'Chiếu cói, xắc xô gõ nhịp điệu.',
            procedure: 'Cô và trẻ cùng nắm tay nhau đi dạo theo vòng tròn, đọc to bài đồng dao "Dung dăng dung dẻ".',
            criteria: 'Trẻ đọc nhịp nhàng theo nhịp gõ xắc xô.',
          },
        ],
      },
    ],
  },
  {
    num: 39,
    domain: 'LANGUAGE',
    title: 'Trẻ nói được câu đơn, câu có 5-7 tiếng, có các từ thông dụng chỉ sự vật, hoạt động, đặc điểm quen thuộc',
    contents: [
      {
        title: 'Sử dụng các từ ngữ quen thuộc trong giao tiếp câu đơn 5-7 tiếng',
        activities: [
          {
            slot: 'ARRIVAL_PLAY',
            title: 'Trò chuyện đầu giờ: Bé kể chuyện sáng nay ăn gì, đi xe gì đến lớp',
            objective: 'Khuyến khích trẻ nói câu đầy đủ chủ vị "Mẹ chở con đi học bằng xe máy".',
            preparation: 'Khu vực trò chuyện ấm cúng, ghế nệm mầm non.',
            procedure: 'Cô đặt câu hỏi gợi mở cho từng trẻ "Sáng nay ai đưa bé đến trường?", kiên nhẫn lắng nghe trẻ diễn đạt.',
            criteria: 'Trẻ nói được câu có từ 4-6 tiếng mạch lạc.',
          },
        ],
      },
    ],
  },
  {
    num: 40,
    domain: 'LANGUAGE',
    title: 'Trẻ sử dụng lời nói với các mục đích khác nhau',
    contents: [
      {
        title: 'Thể hiện nhu cầu, mong muốn và hiểu biết bằng câu đơn giản',
        activities: [
          {
            slot: 'AFTERNOON_ACTIVITY',
            title: 'Rèn kỹ năng giao tiếp: Bé bày tỏ mong muốn "Cô ơi cho con xin đồ chơi"',
            objective: 'Trẻ biết dùng ngôn ngữ lịch sự để thể hiện mong muốn của bản thân.',
            preparation: 'Hộp đồ chơi gấu bông, xe ôtô đẹp.',
            procedure: 'Cô tạo tình huống phân phát đồ chơi, hướng dẫn trẻ nói câu đề nghị lịch sự.',
            criteria: 'Trẻ nói được câu xin đồ chơi với thái độ ngoan ngoãn.',
          },
        ],
      },
    ],
  },
  {
    num: 41,
    domain: 'LANGUAGE',
    title: 'Trẻ chào hỏi khi trò chuyện',
    contents: [
      {
        title: 'Chào hỏi khi trò chuyện',
        activities: [
          {
            slot: 'ARRIVAL_PLAY',
            title: 'Đón trẻ: Bé khoanh tay chào cô giáo và vẫy tay chào tạm biệt bố mẹ',
            objective: 'Rèn luyện thói quen chào hỏi lễ phép ngay từ khi bước vào cửa lớp.',
            preparation: 'Cô giáo tươi cười đón trẻ ở cửa lớp.',
            procedure: 'Khi trẻ đến cửa lớp, cô cúi chào trẻ và nhắc nhở nhẹ nhàng để trẻ khoanh tay chào cô.',
            criteria: 'Trẻ tự giác khoanh tay chào cô và chào người thân.',
          },
        ],
      },
    ],
  },
  {
    num: 42,
    domain: 'LANGUAGE',
    title: 'Trẻ bày tỏ nhu cầu bản thân',
    contents: [
      {
        title: 'Thể hiện mong muốn của bản thân',
        activities: [
          {
            slot: 'HYGIENE_MEAL_SLEEP',
            title: 'Rèn thói quen: Bé biết nói "Con uống nước", "Con ăn thêm cơm" trong giờ sinh hoạt',
            objective: 'Trẻ chủ động nói lên cảm giác đói, no, khát để cô hỗ trợ kịp thời.',
            preparation: 'Khu vực bàn ăn, bình nước sạch.',
            procedure: 'Cô hỏi thăm từng trẻ trong bàn ăn, khuyến khích trẻ mạnh dạn nói lên mong muốn của mình.',
            criteria: 'Trẻ thể hiện được nhu cầu bằng lời nói rõ ràng.',
          },
        ],
      },
    ],
  },
  {
    num: 43,
    domain: 'LANGUAGE',
    title: 'Trẻ hỏi về vấn đề quan tâm',
    contents: [
      {
        title: 'Hỏi “con gì đây?”; “cái gì đây?”',
        activities: [
          {
            slot: 'OUTDOOR_PLAY',
            title: 'Dạo chơi sân trường: Bé quan sát bướm lượn, hoa nở và hào hứng hỏi cô',
            objective: 'Kích thích trí tò mò, khám phá thế giới xung quanh qua các câu hỏi "Cái gì đây cô?".',
            preparation: 'Vườn hoa, cây xanh trong khuôn viên trường mầm non.',
            procedure: 'Cô dẫn trẻ đi tham quan bồn hoa, khuyến khích trẻ tò mò chỉ vào các sự vật lạ và hỏi cô.',
            criteria: 'Trẻ biết chủ động đặt câu hỏi "Con gì đây?", "Hoa gì đây?".',
          },
        ],
      },
    ],
  },
  {
    num: 44,
    domain: 'LANGUAGE',
    title: 'Trẻ nói to đủ nghe, lễ phép',
    contents: [
      {
        title: 'Sử dụng các từ thể hiện sự lễ phép khi nói chuyện với người lớn',
        activities: [
          {
            slot: 'RETURN_CHILD',
            title: 'Trả trẻ: Rèn trẻ nói lời lễ phép "Dạ", "Vâng ạ", "Con chào cô con về ạ"',
            objective: 'Hình thành nề nếp văn minh, lễ độ khi giao tiếp với người lớn tuổi.',
            preparation: 'Khu vực trả trẻ cuối buổi chiều.',
            procedure: 'Khi phụ huynh đến đón, cô nhắc trẻ lại chào cô, nhận ba lô bằng hai tay và nói "Dạ vâng ạ".',
            criteria: 'Trẻ nói to, rõ ràng câu chào lễ phép trước khi ra về.',
          },
        ],
      },
    ],
  },

  // ==========================================
  // IV. LĨNH VỰC PHÁT TRIỂN TÌNH CẢM, KNXH & THẨM MĨ (MT 45 -> MT 56)
  // ==========================================
  {
    num: 45,
    domain: 'SOCIO_EMOTIONAL',
    title: 'Trẻ nói được một vài thông tin về mình',
    contents: [
      {
        title: 'Nhận biết tên gọi, một số đặc điểm bên ngoài bản thân',
        activities: [
          {
            slot: 'DIRECTED_STUDY',
            title: 'Trò chuyện: Bé nói họ tên, tuổi và nhận ra ảnh của mình trên bảng tin lớp',
            objective: 'Trẻ nhận thức được bản thân, biết tự hào về tên gọi và sở thích của mình.',
            preparation: 'Bảng ảnh bé ngoan có gắn ảnh từng trẻ.',
            procedure: 'Cô mời từng trẻ lên bảng, chỉ vào ảnh của mình, giới thiệu tên và tuổi cho cả lớp nghe.',
            criteria: 'Trẻ nhận đúng ảnh của mình và nói được họ tên.',
          },
        ],
      },
      {
        title: 'Thực hiện yêu cầu đơn giản của giáo viên',
        activities: [
          {
            slot: 'AFTERNOON_ACTIVITY',
            title: 'Rèn nề nếp: Bé giúp cô nhặt đồ chơi rơi, mang dép để vào giá',
            objective: 'Rèn tính chăm chỉ, biết hợp tác và giúp đỡ cô giáo việc nhỏ vừa sức.',
            preparation: 'Đồ chơi lớp học.',
            procedure: 'Sau giờ chơi, cô nhờ bé cùng cô cất các khối gỗ vào rổ, khen ngợi bé chăm chỉ.',
            criteria: 'Trẻ vui vẻ làm theo lời nhờ giúp đỡ của cô.',
          },
        ],
      },
    ],
  },
  {
    num: 46,
    domain: 'SOCIO_EMOTIONAL',
    title: 'Trẻ thể hiện điều mình thích và không thích',
    contents: [
      {
        title: 'Nhận biết một số đồ dùng, đồ chơi yêu thích của mình',
        activities: [
          {
            slot: 'CORNER_PLAY',
            title: 'Hoạt động góc: Bé tự do chọn góc chơi và đồ chơi mà bé yêu thích nhất',
            objective: 'Tôn trọng sở thích cá nhân của trẻ, phát huy tính độc lập tự chủ.',
            preparation: 'Các góc chơi bố trí đồ dùng phong phú (góc búp bê, góc ghép hình, góc sách).',
            procedure: 'Cô mở các góc chơi, để trẻ tự do di chuyển đến góc mà trẻ hứng thú nhất.',
            criteria: 'Trẻ tự chọn được món đồ chơi mình yêu thích và say sưa chơi.',
          },
        ],
      },
    ],
  },
  {
    num: 47,
    domain: 'SOCIO_EMOTIONAL',
    title: 'Trẻ biểu lộ sự thích giao tiếp với người khác bằng cử chỉ, lời nói',
    contents: [
      {
        title: 'Giao tiếp với những người xung quanh bằng cử chỉ và lời nói',
        activities: [
          {
            slot: 'ARRIVAL_PLAY',
            title: 'Đón trẻ: Bé tươi cười chạy lại ôm cô, bắt tay và cười đùa với bạn',
            objective: 'Hình thành mối quan hệ gắn bó, tin cậy giữa trẻ với cô giáo và bạn bè.',
            preparation: 'Không gian đón trẻ thân thiện, tiếng nhạc êm đềm.',
            procedure: 'Cô dang tay đón trẻ, mỉm cười âu yếm, khuyến khích trẻ vẫy tay gọi bạn cùng vào chơi.',
            criteria: 'Trẻ thể hiện nét mặt vui tươi, chủ động đến gần cô và bạn.',
          },
        ],
      },
    ],
  },
  {
    num: 48,
    domain: 'SOCIO_EMOTIONAL',
    title: 'Trẻ nhận biết được trang thái cảm xúc vui, buồn, sợ hãi',
    contents: [
      {
        title: 'Nhận biết và thể hiện một số trạng thái cảm xúc: vui, buồn, tức giận',
        activities: [
          {
            slot: 'DIRECTED_STUDY',
            title: 'Kỹ năng cảm xúc: Bé soi gương và nhận biết khuôn mặt vui cười, khuôn mặt mếu',
            objective: 'Trẻ nhận diện được cảm xúc qua biểu cảm khuôn mặt và mắt cười.',
            preparation: 'Gương soi cá nhân, bộ thẻ mặt cười - mặt mếu bằng xốp nỉ.',
            procedure: 'Cô làm mẫu khuôn mặt cười tươi ha ha, khuôn mặt mếu sắp khóc; cho trẻ soi gương làm theo.',
            criteria: 'Trẻ phân biệt được thẻ mặt vui và thẻ mặt buồn.',
          },
        ],
      },
    ],
  },
  {
    num: 49,
    domain: 'SOCIO_EMOTIONAL',
    title: 'Trẻ biểu lộ cảm xúc: vui, buồn,sợ hãi qua nét mặt, cử chỉ',
    contents: [
      {
        title: 'Biểu lộ cảm xúc: vui, buồn, sợ hãi qua nét mặt, cử chỉ',
        activities: [
          {
            slot: 'AFTERNOON_ACTIVITY',
            title: 'Trò chơi cảm xúc: Cùng làm mặt cười híp mắt và vỗ tay reo mừng',
            objective: 'Giúp trẻ giải tỏa năng lượng tích cực, biết bày tỏ niềm vui cùng tập thể.',
            preparation: 'Nhạc bài hát "Nếu bạn đang vui hãy vỗ đôi bàn tay".',
            procedure: 'Cô và cả lớp cùng hát múa theo nhạc, khi nghe giai điệu vui nhộn cùng vỗ tay reo mừng.',
            criteria: 'Trẻ biểu lộ nụ cười rạng rỡ và vỗ tay hòa nhịp theo bài hát.',
          },
        ],
      },
    ],
  },
  {
    num: 50,
    domain: 'SOCIO_EMOTIONAL',
    title: 'Trẻ biểu lộ sự thân thiện với một số con vật quen thuộc/ gần gũi: Bắt chước tiếng kêu, gọi',
    contents: [
      {
        title: 'Quan tâm đến các vật nuôi gần gũi trong gia đình',
        activities: [
          {
            slot: 'DIRECTED_STUDY',
            title: 'NBTN & Vận động: Bé bắt chước tiếng cún con "gâu gâu", mèo con "meo meo"',
            objective: 'Giáo dục lòng yêu thương loài vật, trẻ thích vuốt ve thú cưng bông và giả tiếng kêu.',
            preparation: 'Thú nhồi bông hình chú chó nhỏ, chú mèo con.',
            procedure: 'Cô cho trẻ ôm vuốt ve thú bông, giả tiếng gọi "Meo meo lại đây với bé nào".',
            criteria: 'Trẻ thể hiện cử chỉ âu yếm vuốt ve thú bông và bắt chước đúng tiếng kêu.',
          },
        ],
      },
    ],
  },
  {
    num: 51,
    domain: 'SOCIO_EMOTIONAL',
    title: 'Trẻ biết chào tạm biệt cảm ơn, vâng ạ',
    contents: [
      {
        title: 'Thực hiện hành vi văn hóa: Chào tạm biệt, cảm ơn, nói từ dạ, vâng ạ',
        activities: [
          {
            slot: 'RETURN_CHILD',
            title: 'Trả trẻ: Rèn văn hóa nhận đồ bằng hai tay, nói cảm ơn và chào cô ra về',
            objective: 'Trẻ hình thành thói quen văn minh: biết cảm ơn khi được nhận quà, biết vâng lời.',
            preparation: 'Phiếu bé ngoan hoặc hoa điểm thưởng cuối ngày.',
            procedure: 'Cô trao phiếu bé ngoan cho trẻ, dạy trẻ xòe hai tay nhận và nói "Con cảm ơn cô ạ".',
            criteria: 'Trẻ biết đưa hai tay đón nhận và nói lời cảm ơn.',
          },
        ],
      },
    ],
  },
  {
    num: 52,
    domain: 'SOCIO_EMOTIONAL',
    title: 'Trẻ thể hiện một số hành vi xã hội đơn giản qua trò chơi giả bộ (trò chơi bế em, khuấy bột cho em bé, nghe điện thoại...)',
    contents: [
      {
        title: 'Tập sử dụng đồ dùng, đồ chơi qua trò chơi giả bộ',
        activities: [
          {
            slot: 'CORNER_PLAY',
            title: 'Góc thao tác vai: Bé ru em búp bê ngủ, cho em bú bình và bón thìa',
            objective: 'Phát triển tình cảm yêu thương, trẻ biết quan tâm chăm sóc búp bê như em bé thật.',
            preparation: 'Giường nệm búp bê, gối nhỏ, bình sữa đồ chơi.',
            procedure: 'Trẻ bế búp bê vào lòng, hát ru "À ơi", đặt búp bê nằm lên giường và đắp chăn nhẹ.',
            criteria: 'Trẻ nhẹ nhàng bế ẵm búp bê và biết làm động tác đắp chăn.',
          },
        ],
      },
    ],
  },
  {
    num: 53,
    domain: 'SOCIO_EMOTIONAL',
    title: 'Trẻ chơi thân thiện cạnh trẻ khác',
    contents: [
      {
        title: 'Chơi thân thiện với bạn: Chơi cạnh bạn, không tranh giành đồ chơi với bạn',
        activities: [
          {
            slot: 'CORNER_PLAY',
            title: 'Chơi góc thân thiện: Bé cùng bạn xếp đoàn tàu gỗ, biết nhường đồ chơi cho bạn',
            objective: 'Rèn tính hòa đồng, giảm tính ích kỷ cá nhân, trẻ biết chơi cạnh bạn vui vẻ.',
            preparation: 'Bộ xếp hình đoàn tàu gỗ có nhiều toa xe.',
            procedure: 'Cô hướng dẫn 2-3 trẻ cùng ngồi ghép các toa tàu nối liền nhau, dạy trẻ chia sẻ đồ chơi.',
            criteria: 'Trẻ không giằng giật đồ chơi của bạn, biết ngồi chơi ngoan bên cạnh bạn.',
          },
        ],
      },
    ],
  },
  {
    num: 54,
    domain: 'SOCIO_EMOTIONAL',
    title: 'Trẻ thực hiện một số yêu cầu của người lớn',
    contents: [
      {
        title: 'Thực hiện một số quy định đơn giản: Xếp hàng chờ đến lượt, để đồ chơi vào nơi quy định',
        activities: [
          {
            slot: 'CORNER_PLAY',
            title: 'Rèn nề nếp: Bé xếp hàng chờ rửa tay và cất đồ chơi gọn gàng sau khi chơi xong',
            objective: 'Hình thành nề nếp kỷ luật tích cực trong sinh hoạt tập thể tại trường mầm non.',
            preparation: 'Vạch dán chân xếp hàng chờ rửa tay, rổ đựng đồ chơi có nhãn hình.',
            procedure: 'Khi hết giờ chơi, cô bật bài hát "Thu dọn đồ chơi", nhắc cả lớp cùng mang đồ chơi để vào rổ.',
            criteria: 'Trẻ biết thu dọn đồ chơi vào rổ gọn gàng trước khi chuyển hoạt động.',
          },
        ],
      },
    ],
  },
  {
    num: 55,
    domain: 'SOCIO_EMOTIONAL',
    title: 'Trẻ hát và vận động đơn giản theo một vài bài hát/ bản nhạc quen thuộc',
    contents: [
      {
        title: 'Nghe hát, nghe nhạc với các giai điệu khác nhau; nghe âm thanh nhạc cụ',
        activities: [
          {
            slot: 'DIRECTED_STUDY',
            title: 'Giáo dục âm nhạc: Nghe hát "Lời chào buổi sáng" & Nghe âm thanh xắc xô',
            objective: 'Phát triển tai nghe âm nhạc, trẻ thích thú lắng nghe cô hát và cảm thụ giai điệu.',
            preparation: 'Trống lắc xắc xô, đàn organ, cô giáo hát diễn cảm.',
            procedure: '1. Ổn định; 2. Cô hát diễn cảm bài hát cho trẻ nghe 2 lần; 3. Cho trẻ gõ thử xắc xô hưởng ứng.',
            criteria: 'Trẻ chăm chú lắng nghe cô hát và vỗ tay theo nhịp bài hát.',
          },
        ],
      },
      {
        title: 'Hát và tập vận động đơn giản theo nhạc',
        activities: [
          {
            slot: 'DIRECTED_STUDY',
            title: 'Dạy hát & VĐTN: Bé hát và nhún nhảy theo bài hát "Con chim vành khuyên"',
            objective: 'Trẻ hát theo lời bài hát vui nhộn và làm các động tác múa chim bay.',
            preparation: 'Mũ múa chim vành khuyên, nhạc beat sôi động.',
            procedure: 'Cô hát mẫu từng câu ngắn, hướng dẫn trẻ dang 2 tay vẫy làm cánh chim bay nhún nhảy.',
            criteria: 'Trẻ hát được các từ cuối câu và nhún nhảy theo nhịp nhạc.',
          },
        ],
      },
    ],
  },
  {
    num: 56,
    domain: 'SOCIO_EMOTIONAL',
    title: 'Trẻ thích tô màu, vẽ, nặn, xé, xếp hình, xem tranh (cầm bút di màu, vẽ nguệch ngoạc)',
    contents: [
      {
        title: 'Vẽ các đường nét khác nhau, di màu, nặn, xé, vò, xếp hình',
        activities: [
          {
            slot: 'DIRECTED_STUDY',
            title: 'Tạo hình: Bé tập di màu chiếc lá cây xanh và nặn viên bi tròn xinh',
            objective: 'Phát triển xúc giác và năng khiếu thẩm mỹ, rèn kỹ năng cầm bút di màu và xoay tròn đất nặn.',
            preparation: 'Hình vẽ chiếc lá to viền đen đậm, sáp màu xanh lá cây, đất nặn dẻo an toàn.',
            procedure: 'Cô làm mẫu di màu kín hình chiếc lá, sau đó hướng dẫn trẻ xoay tròn viên đất nặn đặt lên đĩa.',
            criteria: 'Trẻ cầm sáp màu di màu vào lòng hình vẽ và nặn được viên bi đất tròn.',
          },
        ],
      },
      {
        title: 'Xem Tranh',
        activities: [
          {
            slot: 'CORNER_PLAY',
            title: 'Góc nghệ thuật: Bé cùng cô ngắm nhìn triển lãm tranh tô màu của nhóm lớp',
            objective: 'Giúp trẻ biết thưởng thức vẻ đẹp của màu sắc và tự hào về sản phẩm của mình.',
            preparation: 'Dây kẹp treo tranh triển lãm tại góc nghệ thuật.',
            procedure: 'Cô kẹp các bài vẽ của bé lên dây treo, cùng các bé đứng ngắm và khen ngợi sự cố gắng của từng bé.',
            criteria: 'Trẻ thích thú chỉ vào bức tranh của mình và của bạn.',
          },
        ],
      },
    ],
  },
];

const ROUTINE_SLOTS = [
  'ARRIVAL_PLAY',
  'MORNING_EXERCISE',
  'DIRECTED_STUDY',
  'CORNER_PLAY',
  'OUTDOOR_PLAY',
  'HYGIENE_MEAL_SLEEP',
  'AFTERNOON_ACTIVITY',
  'RETURN_CHILD',
];

const WEEK_DAYS = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'];

async function main() {
  console.log('🚀 BẮT ĐẦU CHUẨN HÓA 100% DỮ LIỆU KHỐI NHÀ TRẺ THEO THỰC TẾ SƯ PHẠM MẦM NON...');

  // 1. DỌN SẠCH DỮ LIỆU CŨ CỦA KHỐI NHÀ TRẺ
  console.log('\n🧹 Bước 1: Xóa dữ liệu kế hoạch & hoạt động cũ của Khối Nhà trẻ...');
  const targetClassIds = [5n, 6n];

  await prisma.subThemeActivity.deleteMany({ where: { class_id: { in: targetClassIds } } });
  await prisma.classThemeContent.deleteMany({ where: { class_id: { in: targetClassIds } } });
  await prisma.classThemeGoal.deleteMany({ where: { class_id: { in: targetClassIds } } });
  await prisma.classThemePlan.deleteMany({ where: { class_id: { in: targetClassIds } } });

  // Xóa Master Activities, Contents, Goals cũ của NHA_TRE
  const oldGoals = await prisma.educationalGoal.findMany({
    where: { age_group: 'NHA_TRE', school_year_id: SCHOOL_YEAR_ID },
    select: { goal_id: true },
  });
  const oldGoalIds = oldGoals.map((g) => g.goal_id);

  if (oldGoalIds.length > 0) {
    const oldContents = await prisma.educationalContent.findMany({
      where: { goal_id: { in: oldGoalIds } },
      select: { content_id: true },
    });
    const oldContentIds = oldContents.map((c) => c.content_id);

    if (oldContentIds.length > 0) {
      const oldActs = await prisma.educationalActivity.findMany({
        where: { content_id: { in: oldContentIds } },
        select: { activity_id: true },
      });
      const oldActIds = oldActs.map((a) => a.activity_id);

      if (oldActIds.length > 0) {
        await prisma.dailyAssessment.deleteMany({
          where: { activity_id: { in: oldActIds } },
        });
        await prisma.educationalActivity.deleteMany({
          where: { activity_id: { in: oldActIds } },
        });
      }

      await prisma.educationalContent.deleteMany({
        where: { content_id: { in: oldContentIds } },
      });
    }

    await prisma.dailyAssessment.deleteMany({
      where: { goal_id: { in: oldGoalIds } },
    });

    await prisma.educationalGoal.deleteMany({
      where: { goal_id: { in: oldGoalIds } },
    });
  }

  console.log('✅ Đã dọn sạch dữ liệu cũ của Khối Nhà trẻ.');

  // 2. TẠO 56 MỤC TIÊU, NỘI DUNG GIÁO DỤC VÀ HOẠT ĐỘNG CHUẨN MỰC
  console.log('\n📚 Bước 2: Import 56 Mục tiêu, Nội dung giáo dục & Hoạt động giáo dục chuẩn mầm non...');
  
  const createdGoalsMap = new Map(); // num -> goal record
  const createdContentsList = []; // list of { content, goal, activities }
  const allCreatedActivities = []; // all master activities

  for (const item of NHA_TRE_CURRICULUM_DATA) {
    const goalCode = `MT ${String(item.num).padStart(2, '0')}`;
    const createdGoal = await prisma.educationalGoal.create({
      data: {
        school_year_id: SCHOOL_YEAR_ID,
        age_group: 'NHA_TRE',
        domain: item.domain,
        goal_code: goalCode,
        title: item.title,
        is_approved: true,
      },
    });
    createdGoalsMap.set(item.num, createdGoal);

    for (const cntData of item.contents) {
      const createdContent = await prisma.educationalContent.create({
        data: {
          goal_id: createdGoal.goal_id,
          title: cntData.title.slice(0, 255),
        },
      });

      const contentActs = [];
      for (const actData of cntData.activities) {
        const createdAct = await prisma.educationalActivity.create({
          data: {
            content_id: createdContent.content_id,
            title: actData.title.slice(0, 500),
            routine_slot: actData.slot,
            objective: actData.objective,
            preparation: actData.preparation,
            procedure: actData.procedure,
            evaluation_criteria: actData.criteria,
            created_by: TEACHER_ACCOUNT_ID,
          },
        });
        contentActs.push(createdAct);
        allCreatedActivities.push({
          activity: createdAct,
          content: createdContent,
          goal: createdGoal,
          slot: actData.slot,
        });
      }

      createdContentsList.push({
        content: createdContent,
        goal: createdGoal,
        activities: contentActs,
      });
    }
  }

  console.log(`✅ Đã tạo thành công:
   - ${createdGoalsMap.size} Mục tiêu giáo dục chuẩn.
   - ${createdContentsList.length} Nội dung giáo dục (NDGD) sạch và chuẩn hóa.
   - ${allCreatedActivities.length} Hoạt động giáo dục (HĐGD) chuyên biệt, không lặp lại vô cớ.`);

  // 3. ĐỒNG BỘ 4 CHỦ ĐỀ CHO LỚP NHÀ TRẺ 1
  console.log('\n📅 Bước 3: Phân bổ mục tiêu & nội dung giáo dục cho 4 chủ đề của Nhà trẻ 1...');
  const themes = await prisma.curriculumTheme.findMany({
    where: { school_year_id: SCHOOL_YEAR_ID, age_group: 'NHA_TRE', deleted_at: null },
    include: { sub_themes: { orderBy: { start_date: 'asc' } } },
    orderBy: { start_date: 'asc' },
    take: 4,
  });

  // Phân bổ nội dung giáo dục theo chủ đề:
  // - Nội dung cốt lõi (Nề nếp ăn ngủ vệ sinh MT 14-19, Thể dục sáng MT 02, Chào hỏi MT 41/51, Dinh dưỡng MT 01)
  //   sẽ được chọn XUYÊN SUỐT CÁC CHỦ ĐỀ để thể hiện tính tái sử dụng cao!
  // - Các nội dung theo chủ đề đặc thù sẽ phân bổ tương ứng:
  const CORE_GOAL_NUMS = [1, 2, 14, 15, 16, 17, 18, 19, 41, 51]; // 10 mục tiêu nề nếp dùng chung

  const THEME_SPECIFIC_GOAL_NUMS = {
    0: [3, 4, 10, 25, 27, 34, 38, 45, 47, 52, 55], // CĐ 01: Bé và các bạn mới
    1: [5, 6, 11, 12, 13, 26, 30, 31, 39, 46, 53], // CĐ 02: Đồ chơi yêu thích của bé
    2: [7, 8, 20, 24, 29, 36, 37, 43, 50, 54],     // CĐ 03: Những con vật nuôi đáng yêu
    3: [9, 21, 22, 23, 28, 32, 33, 35, 40, 48, 56], // CĐ 04: Cây xanh và hoa đẹp quanh bé
  };

  for (let tIdx = 0; tIdx < themes.length; tIdx++) {
    const th = themes[tIdx];
    const subThemes = th.sub_themes || [];
    const isApproved = tIdx < 3; // CĐ 01, 02, 03: Đã phê duyệt (USED); CĐ 04: REJECTED (BGH yêu cầu sửa)

    console.log(`\n  👉 CĐ 0${tIdx + 1}: "${th.name}" (${subThemes.length} tuần)`);

    // Danh sách mục tiêu phân bổ cho chủ đề này (Core + Specific)
    const specificNums = THEME_SPECIFIC_GOAL_NUMS[tIdx] || [];
    const targetGoalNums = Array.from(new Set([...CORE_GOAL_NUMS, ...specificNums]));

    const themeGoalRecords = [];
    const themeContentRecords = [];
    const themeActivitiesPool = [];

    for (const gNum of targetGoalNums) {
      const gRecord = createdGoalsMap.get(gNum);
      if (!gRecord) continue;

      themeGoalRecords.push(gRecord);

      // Lưu ClassThemeGoal
      await prisma.classThemeGoal.create({
        data: {
          class_id: CLASS_ID,
          theme_id: th.theme_id,
          goal_id: gRecord.goal_id,
        },
      });

      // Lấy tất cả contents thuộc goal này
      const cntMatches = createdContentsList.filter((c) => c.goal.goal_id === gRecord.goal_id);
      for (const cntMatch of cntMatches) {
        themeContentRecords.push(cntMatch.content);

        // Lưu ClassThemeContent
        await prisma.classThemeContent.create({
          data: {
            class_id: CLASS_ID,
            theme_id: th.theme_id,
            content_id: cntMatch.content.content_id,
          },
        });

        // Đưa các HĐGD của NDGD này vào pool hoạt động của chủ đề
        for (const act of cntMatch.activities) {
          themeActivitiesPool.push({
            activity: act,
            content: cntMatch.content,
            goal: gRecord,
            slot: act.routine_slot,
          });
        }
      }
    }

    console.log(`     Đã phân bổ ${themeGoalRecords.length} Mục tiêu & ${themeContentRecords.length} Nội dung giáo dục.`);
    console.log(`     Số hoạt động giáo dục khả dụng: ${themeActivitiesPool.length} HĐGD.`);

    // 4. XẾP THỜI KHÓA BIỂU CÁC TUẦN (SUBTHEMEACTIVITY)
    // Phân loại hoạt động theo từng routine_slot
    const actsBySlot = {};
    for (const slot of ROUTINE_SLOTS) {
      actsBySlot[slot] = themeActivitiesPool.filter((a) => a.slot === slot);
      // Fallback nếu thiếu slot cụ thể từ pool chủ đề
      if (actsBySlot[slot].length === 0) {
        actsBySlot[slot] = allCreatedActivities.filter((a) => a.slot === slot);
      }
    }

    let scheduledCount = 0;
    for (let wIdx = 0; wIdx < subThemes.length; wIdx++) {
      const st = subThemes[wIdx];
      const stStart = new Date(st.start_date);

      for (let dIdx = 0; dIdx < 5; dIdx++) {
        const slotDate = new Date(stStart);
        slotDate.setDate(slotDate.getDate() + dIdx);
        const dayOfWeek = WEEK_DAYS[dIdx];
        const dayOffset = wIdx * 5 + dIdx;

        // Xếp các slot cơ bản trong 1 ngày mầm non (đúng 7 slot thời khóa biểu)
        const dailySlots = [
          'ARRIVAL_PLAY',
          'MORNING_EXERCISE',
          'DIRECTED_STUDY',
          'CORNER_PLAY',
          'OUTDOOR_PLAY',
          'AFTERNOON_ACTIVITY',
          'RETURN_CHILD',
        ];

        for (let sIdx = 0; sIdx < dailySlots.length; sIdx++) {
          const slotKey = dailySlots[sIdx];
          const pool = actsBySlot[slotKey];
          if (!pool || pool.length === 0) continue;

          // Xoay vòng các bài học phong phú mỗi ngày
          const chosen = pool[dayOffset % pool.length];

          await prisma.subThemeActivity.create({
            data: {
              class_id: CLASS_ID,
              sub_theme_id: st.sub_theme_id,
              activity_id: chosen.activity.activity_id,
              scheduled_date: slotDate,
              day_of_week: dayOfWeek,
              routine_slot: slotKey,
              order_index: sIdx + 1,
            },
          });
          scheduledCount++;
        }
      }
    }

    console.log(`     Đã xếp lịch ${scheduledCount} lượt hoạt động vào Kế hoạch tuần.`);

    // Thiết lập trạng thái kế hoạch
    const submitDate = new Date(th.start_date);
    submitDate.setDate(submitDate.getDate() - 6);
    const reviewDate = new Date(th.start_date);
    reviewDate.setDate(reviewDate.getDate() - 3);

    const planStatus = isApproved ? 'USED' : 'REJECTED';
    const reviewNote = isApproved
      ? 'Kế hoạch đã được Ban Giám Hiệu thẩm định mục tiêu, cân đối thời khóa biểu và phê duyệt áp dụng.'
      : 'BGH yêu cầu rà soát lại các nội dung giáo dục thể chất và tăng cường hoạt động trải nghiệm ngoài trời.';

    await prisma.classThemePlan.create({
      data: {
        class_id: CLASS_ID,
        theme_id: th.theme_id,
        status: planStatus,
        submitted_at: isApproved ? submitDate : new Date(),
        submitted_by: TEACHER_ACCOUNT_ID,
        reviewed_at: isApproved ? reviewDate : new Date(),
        reviewed_by: BGH_ACCOUNT_ID,
        review_note: reviewNote,
      },
    });
  }

  console.log('\n✨ HOÀN THÀNH CHUẨN HÓA DỮ LIỆU KHỐI NHÀ TRẺ THÀNH CÔNG RỰC RỠ!');
}

main()
  .catch((e) => {
    console.error('❌ Lỗi seed dữ liệu:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
