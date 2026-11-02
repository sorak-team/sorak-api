/**
 * Educational goal titles lookup & sanitizer to prevent corrupt encoding from legacy seeds
 */
export const NHA_TRE_STANDARD_GOALS = {
  MT01: 'Trẻ thực hiện được các động tác trong bài tập thể dục theo cô.',
  MT02: 'Trẻ làm được một số việc tự phục vụ đơn giản với sự hỗ trợ của người lớn.',
  MT03: 'Trẻ nhận biết và tránh một số vật dụng, nơi nguy hiểm khi được nhắc nhở.',
  MT04: 'Trẻ chọn và phân nhóm đồ vật theo một dấu hiệu nổi bật.',
  MT05: 'Trẻ nhận biết số lượng một và nhiều.',
  MT06: 'Trẻ tham gia hoạt động đơn giản và bước đầu chơi cạnh bạn.',
  MT07: 'Trẻ nhận biết, gọi tên đồ vật, con vật và hành động quen thuộc.',
  MT08: 'Trẻ đọc được bài thơ, đồng dao ngắn với sự giúp đỡ của cô.',
  MT09: 'Trẻ hiểu câu hỏi đơn giản và dùng lời nói để thể hiện nhu cầu.',
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

export function cleanGoalTitle(goalCode, title, ageGroup) {
  if (!title || title.includes('?')) {
    const raw = String(goalCode || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    let norm = raw;
    if (raw.startsWith('MT')) {
      const num = raw.replace(/^MT/, '');
      norm = num.length === 1 ? `MT0${num}` : `MT${num}`;
    } else if (/^\d+$/.test(raw)) {
      norm = raw.length === 1 ? `MT0${raw}` : `MT${raw}`;
    }

    const ag = String(ageGroup || '').toUpperCase();
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
  return title || '';
}

export default {
  NHA_TRE_STANDARD_GOALS,
  MAM_STANDARD_GOALS,
  CHOI_STANDARD_GOALS,
  LA_STANDARD_GOALS,
  cleanGoalTitle,
};
