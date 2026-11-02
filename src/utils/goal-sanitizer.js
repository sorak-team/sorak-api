/**
 * Educational goal titles lookup & sanitizer to prevent corrupt encoding from legacy seeds
 */
export const NHA_TRE_STANDARD_GOALS = {
  MT01: 'Trẻ thực hiện được các động tác trong bài tập thể dục theo cô.',
  MT02: 'Trẻ làm được một số việc tự phục vụ đơn giản với sự hỗ trợ của người lớn.',
  MT03: 'Trẻ nhận biết và tránh một số vật dụng, nơi nguy hiểm khi được nhắc nhở.',
  MT04: 'Trẻ chọn và phân nhóm đồ vật theo một dấu hiệu nổi bật.',
  MT05: 'Trẻ nhận biết số lượng một và nhiều.',
  MT06: 'Trẻ nhận biết, gọi tên đồ vật, con vật và hành động quen thuộc.',
  MT07: 'Trẻ tham gia hoạt động đơn giản và bước đầu chơi cạnh bạn.',
  MT08: 'Trẻ hiểu câu hỏi đơn giản và dùng lời nói để thể hiện nhu cầu.',
  MT09: 'Trẻ đọc được bài thơ, đồng dao ngắn với sự giúp đỡ của cô.',
  MT10: 'Trẻ thực hiện một số yêu cầu đơn giản và bước đầu biết nhường đồ chơi.',
  MT11: 'Trẻ thích nghe hát, vận động theo nhạc và tham gia tạo hình đơn giản.',
};

export const MAM_STANDARD_GOALS = {
  MT01: 'Trẻ đi hết đoạn đường hẹp, giữ thăng bằng và không bước ra ngoài đường.',
  MT02: 'Trẻ đếm trên các đối tượng trong phạm vi 5 và nói được kết quả đếm.',
  MT03: 'Trẻ kể lại một vài tình tiết của câu chuyện đã nghe với sự giúp đỡ của người lớn.',
  MT04: 'Trẻ biết cùng chơi với bạn trong nhóm nhỏ và sử dụng đồ chơi chung khi được hướng dẫn.',
  MT05: 'Trẻ sử dụng các nét thẳng, nét ngang và nét cong để tạo thành bức tranh đơn giản.',
};

export const CHOI_STANDARD_GOALS = {
  MT01: 'Trẻ giữ được thăng bằng cơ thể khi đi trên ghế thể dục.',
  MT02: 'Trẻ đếm được đến 10, nhận biết nhóm có 10 đối tượng và chữ số 10.',
  MT03: 'Trẻ kể lại câu chuyện đã nghe theo đúng trình tự các sự việc chính.',
  MT04: 'Trẻ biết thỏa thuận, phân công và phối hợp với bạn để thực hiện nhiệm vụ chung.',
  MT05: 'Trẻ phối hợp các kỹ năng vẽ để tạo thành bức tranh có màu sắc hài hòa, bố cục cân đối.',
};

export const LA_STANDARD_GOALS = {
  MT01: 'Trẻ giữ được thăng bằng khi đi trên ghế thể dục, phối hợp tay và chân phù hợp.',
  MT02: 'Trẻ so sánh số lượng của hai nhóm đối tượng trong phạm vi 10 và nói được nhóm bằng nhau, nhiều hơn, ít hơn.',
  MT03: 'Trẻ kể lại câu chuyện đã nghe theo trình tự các sự việc chính với tranh hoặc câu hỏi gợi ý.',
  MT04: 'Trẻ biết trao đổi, thỏa thuận với bạn để cùng thực hiện hoạt động chung.',
  MT05: 'Trẻ phối hợp các nét thẳng, xiên, ngang và cong để tạo thành bức tranh có màu sắc, bố cục theo ý tưởng.',
};

export function normalizeGoalCode(code) {
  if (!code) return '';
  const raw = String(code).toUpperCase().trim();
  const digitsMatch = raw.match(/\d+/);
  if (digitsMatch) {
    const num = parseInt(digitsMatch[0], 10);
    if (!isNaN(num)) {
      return num < 10 ? `MT0${num}` : `MT${num}`;
    }
  }
  return raw.replace(/[^A-Z0-9]/g, '');
}

export function cleanGoalTitle(goalCode, title, ageGroup) {
  let result = title || '';

  // 1. Semantic pattern repair for legacy corrupted characters with question marks '?'
  if (result.includes('?')) {
    if (result.includes('ph?t tri?n') && result.includes('nh?m c?')) {
      return 'Trẻ thực hiện được các động tác phát triển các nhóm cơ và hệ thần kinh vững chắc.';
    }
    if (result.includes('v?n đ?ng th?') || result.includes('v?n đ?ng tinh')) {
      return 'Trẻ thực hiện được các động tác vận động thô và vận động tinh cơ bản.';
    }
    if (result.includes('nguy hi?m')) {
      return 'Trẻ nhận biết một số tình huống nguy hiểm và lựa chọn cách xử lý phù hợp.';
    }
    if (result.includes('ph?n lo?i')) {
      return 'Trẻ phân loại được một số đối tượng theo đặc điểm chung và gọi tên nhóm.';
    }
    if (result.includes('t?ch') || result.includes('ph?m vi 10')) {
      return 'Trẻ đếm, so sánh và thực hiện tách, gộp nhóm đối tượng trong phạm vi 10.';
    }
    if (result.includes('giao ti?p') || result.includes('l?ch s?')) {
      return 'Trẻ nghe hiểu câu hỏi, diễn đạt rõ ý và sử dụng lời nói lịch sự trong giao tiếp.';
    }
    if (result.includes('ch? c?i')) {
      return 'Trẻ nhận biết và gọi tên một số chữ cái đã học trong từ gần gũi.';
    }
    if (result.includes('chia s?') || result.includes('ch? đ?n l??t')) {
      return 'Trẻ thực hiện được một số quy định chung, biết chờ đến lượt và chia sẻ với bạn.';
    }
    if (result.includes('?m nh?c') || result.includes('t?o h?nh')) {
      return 'Trẻ thể hiện cảm xúc và ý tưởng thông qua âm nhạc, tạo hình.';
    }
    if (result.includes('tham gia') && (result.includes('nhi?m v?') || result.includes('ch? đ?ng'))) {
      return 'Trẻ chủ động tham gia, phối hợp với bạn và cố gắng hoàn thành nhiệm vụ được giao.';
    }
    if (result.includes('bi?u c?m') || result.includes('đ?ng dao')) {
      return 'Trẻ đọc biểu cảm bài thơ, đồng dao phù hợp với độ tuổi.';
    }
    if (result.includes('nh??ng đ? ch?i')) {
      return 'Trẻ thực hiện một số yêu cầu đơn giản và bước đầu biết nhường đồ chơi.';
    }
    if (result.includes('th? d?c theo c?')) {
      return 'Trẻ thực hiện được các động tác trong bài tập thể dục theo cô.';
    }
    if (result.includes('t? ph?c v?')) {
      return 'Trẻ làm được một số việc tự phục vụ đơn giản với sự hỗ trợ của người lớn.';
    }
    if (result.includes('m?t v? nhi?u')) {
      return 'Trẻ nhận biết số lượng một và nhiều.';
    }
    if (result.includes('đ? v?t, con v?t')) {
      return 'Trẻ nhận biết, gọi tên đồ vật, con vật và hành động quen thuộc.';
    }
    if (result.includes('ch?i c?nh b?n')) {
      return 'Trẻ tham gia hoạt động đơn giản và bước đầu chơi cạnh bạn.';
    }
    if (result.includes('th? hi?n nhu c?u')) {
      return 'Trẻ hiểu câu hỏi đơn giản và dùng lời nói để thể hiện nhu cầu.';
    }
  }

  const norm = normalizeGoalCode(goalCode);
  const ag = String(ageGroup || '').toUpperCase();

  // If title has corrupted question marks or is missing, look up standard goal text
  if (!result || result.includes('?')) {
    if (ag.includes('MAM')) {
      if (MAM_STANDARD_GOALS[norm]) return MAM_STANDARD_GOALS[norm];
    } else if (ag.includes('CHOI')) {
      if (CHOI_STANDARD_GOALS[norm]) return CHOI_STANDARD_GOALS[norm];
    } else if (ag.includes('LA')) {
      if (LA_STANDARD_GOALS[norm]) return LA_STANDARD_GOALS[norm];
    }

    if (NHA_TRE_STANDARD_GOALS[norm]) {
      return NHA_TRE_STANDARD_GOALS[norm];
    }
  }

  // Also check if title exists but still has corrupted question marks that can be repaired
  if (result.includes('?')) {
    if (NHA_TRE_STANDARD_GOALS[norm]) return NHA_TRE_STANDARD_GOALS[norm];
    if (MAM_STANDARD_GOALS[norm]) return MAM_STANDARD_GOALS[norm];
    if (CHOI_STANDARD_GOALS[norm]) return CHOI_STANDARD_GOALS[norm];
    if (LA_STANDARD_GOALS[norm]) return LA_STANDARD_GOALS[norm];
  }

  return result;
}

export default {
  NHA_TRE_STANDARD_GOALS,
  MAM_STANDARD_GOALS,
  CHOI_STANDARD_GOALS,
  LA_STANDARD_GOALS,
  normalizeGoalCode,
  cleanGoalTitle,
};
