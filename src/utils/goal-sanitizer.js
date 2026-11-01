/**
 * Educational goal titles lookup & sanitizer to prevent corrupt encoding from legacy seeds
 */
export const NHA_TRE_STANDARD_GOALS = {
  MT01: 'Trẻ thực hiện được các động tác phát triển nhóm cơ và hô hấp, phối hợp tay, chân nhịp nhàng.',
  MT02: 'Trẻ tự thực hiện một số việc phục vụ bản thân và giữ vệ sinh cá nhân.',
  MT03: 'Trẻ nhận biết một số tình huống nguy hiểm và lựa chọn cách xử lý phù hợp.',
  MT04: 'Trẻ phân loại được một số đối tượng theo đặc điểm chung và gọi tên nhóm.',
  MT05: 'Trẻ đếm, so sánh và thực hiện tách, gộp nhóm đối tượng trong phạm vi 10.',
  MT06: 'Trẻ nghe hiểu câu hỏi, diễn đạt rõ ý và sử dụng lời nói lịch sự trong giao tiếp.',
  MT07: 'Trẻ nhận biết và gọi tên một số chữ cái đã học trong từ gần gũi.',
  MT08: 'Trẻ thực hiện được một số quy định chung, biết chờ đến lượt và chia sẻ với bạn.',
  MT09: 'Trẻ thể hiện cảm xúc và ý tưởng thông qua âm nhạc, tạo hình.',
  MT10: 'Trẻ chủ động tham gia, phối hợp với bạn và cố gắng hoàn thành nhiệm vụ được giao.',
  MT11: 'Trẻ đọc biểu cảm bài thơ, đồng dao phù hợp với độ tuổi.',
};

export function cleanGoalTitle(goalCode, title, ageGroup) {
  if (!title) return NHA_TRE_STANDARD_GOALS[goalCode] || '';
  if (title.includes('?')) {
    if (NHA_TRE_STANDARD_GOALS[goalCode]) {
      return NHA_TRE_STANDARD_GOALS[goalCode];
    }
  }
  return title;
}

export default {
  NHA_TRE_STANDARD_GOALS,
  cleanGoalTitle,
};
