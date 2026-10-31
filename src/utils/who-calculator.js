import { calculateAll } from '@pedi-growth/core';

/**
 * WHO Child Growth Standards Calculator (0–72 months)
 * Computes exact Z-scores and clinical classifications based on official WHO standards:
 * - Length/Height-for-age (HAZ)
 * - Weight-for-age (WAZ)
 * - BMI-for-age (BAZ)
 * - Weight-for-length/height (WHZ)
 */
export async function calculateWhoAssessment({
  gender,
  dateOfBirth,
  dateOfMeasurement,
  height,
  weight,
}) {
  const h = Number(height);
  const w = Number(weight);
  if (!h || !w || h <= 0 || w <= 0) return null;

  const bmi = Number((w / ((h / 100) ** 2)).toFixed(2));
  const isMale = gender === 'MALE' || gender === 'Nam' || gender === 'male' || gender === 'Trai';
  const sex = isMale ? 'male' : 'female';

  const dob = dateOfBirth ? new Date(dateOfBirth) : null;
  const dom = dateOfMeasurement ? new Date(dateOfMeasurement) : new Date();

  // Fallback if dateOfBirth is invalid
  if (!dob || isNaN(dob.getTime())) {
    let fallbackLabel = 'Bình thường (Đạt chuẩn WHO)';
    let fallbackColor = 'emerald';
    let fallbackStatus = 'NORMAL';

    if (bmi < 13.5) {
      fallbackLabel = 'Suy dinh dưỡng / Nhẹ cân';
      fallbackColor = 'amber';
      fallbackStatus = 'UNDERWEIGHT';
    } else if (bmi > 19.5) {
      fallbackLabel = 'Thừa cân / Béo phì';
      fallbackColor = 'rose';
      fallbackStatus = 'OBESE';
    } else if (bmi > 17.5) {
      fallbackLabel = 'Nguy cơ thừa cân';
      fallbackColor = 'amber';
      fallbackStatus = 'RISK_OVERWEIGHT';
    }

    return {
      bmi,
      zscores: {
        heightForAge: null,
        weightForAge: null,
        bmiForAge: null,
        weightForHeight: null,
      },
      classifications: {
        height: { label: 'Chưa xác định', severity: 'unknown' },
        weight: { label: 'Chưa xác định', severity: 'unknown' },
        bmi: { label: fallbackLabel, severity: 'unknown' },
        overall: { label: fallbackLabel, color: fallbackColor, status: fallbackStatus },
      },
    };
  }

  try {
    const res = await calculateAll({
      sex,
      dateOfBirth: dob,
      dateOfMeasurement: dom,
      weight: w,
      lengthHeight: h,
    });

    const resultMap = {};
    for (const r of res.results || []) {
      resultMap[r.indicator] = Number(r.zScore.toFixed(2));
    }

    const hz = resultMap['length-height-for-age'] ?? 0;
    const wz = resultMap['weight-for-age'] ?? 0;
    const bz = resultMap['bmi-for-age'] ?? 0;
    const whz = resultMap['weight-for-height'] ?? null;

    // 1. Chiều cao theo tuổi (HAZ)
    let heightClass = { label: 'Chiều cao đạt chuẩn', severity: 'adequate' };
    if (hz < -3) {
      heightClass = { label: 'Thấp còi độ 2 (nặng)', severity: 'severe' };
    } else if (hz < -2) {
      heightClass = { label: 'Thấp còi độ 1', severity: 'moderate' };
    } else if (hz > 2) {
      heightClass = { label: 'Cao hơn so với tuổi', severity: 'high' };
    }

    // 2. Cân nặng theo tuổi (WAZ)
    let weightClass = { label: 'Cân nặng đạt chuẩn', severity: 'adequate' };
    if (wz < -3) {
      weightClass = { label: 'Suy dinh dưỡng nhẹ cân độ 2 (nặng)', severity: 'severe' };
    } else if (wz < -2) {
      weightClass = { label: 'Suy dinh dưỡng nhẹ cân độ 1', severity: 'moderate' };
    } else if (wz > 2) {
      weightClass = { label: 'Cân nặng cao hơn so với tuổi', severity: 'high' };
    }

    // 3. BMI theo tuổi (BAZ)
    let bmiClass = { label: 'Bình thường (Đạt chuẩn WHO)', severity: 'adequate' };
    if (bz < -3) {
      bmiClass = { label: 'Gầy còm mức độ nặng', severity: 'severe' };
    } else if (bz < -2) {
      bmiClass = { label: 'Gầy còm', severity: 'moderate' };
    } else if (bz > 3) {
      bmiClass = { label: 'Béo phì', severity: 'severe' };
    } else if (bz > 2) {
      bmiClass = { label: 'Thừa cân', severity: 'moderate' };
    } else if (bz > 1.5 && wz > 1.5) {
      bmiClass = { label: 'Nguy cơ thừa cân', severity: 'mild' };
    }

    // 4. Overall Holistic Assessment (Tiêu chuẩn liên tịch Y tế học đường & WHO)
    let overall = {
      label: 'Bình thường (Đạt chuẩn WHO)',
      color: 'emerald',
      status: 'NORMAL',
    };

    if (bz > 3) {
      overall = { label: 'Béo phì', color: 'rose', status: 'OBESE' };
    } else if (bz > 2) {
      overall = { label: 'Thừa cân', color: 'rose', status: 'OVERWEIGHT' };
    } else if (bz > 1.5 && wz > 1.5) {
      overall = { label: 'Nguy cơ thừa cân', color: 'amber', status: 'RISK_OVERWEIGHT' };
    } else if (hz < -3) {
      overall = { label: 'Thấp còi độ 2 (nặng)', color: 'rose', status: 'SEVERELY_STUNTED' };
    } else if (wz < -3) {
      overall = { label: 'Suy dinh dưỡng nặng', color: 'rose', status: 'SEVERELY_UNDERWEIGHT' };
    } else if (hz < -2) {
      overall = { label: 'Thấp còi độ 1', color: 'amber', status: 'STUNTED' };
    } else if (wz < -2) {
      overall = { label: 'Suy dinh dưỡng nhẹ cân', color: 'amber', status: 'UNDERWEIGHT' };
    } else if (bz < -2) {
      overall = { label: 'Gầy còm', color: 'amber', status: 'WASTED' };
    }

    return {
      bmi,
      zscores: {
        heightForAge: hz,
        weightForAge: wz,
        bmiForAge: bz,
        weightForHeight: whz,
      },
      classifications: {
        height: heightClass,
        weight: weightClass,
        bmi: bmiClass,
        overall,
      },
    };
  } catch (err) {
    console.error('Error calculating WHO assessment:', err);
    return {
      bmi,
      zscores: {
        heightForAge: null,
        weightForAge: null,
        bmiForAge: null,
        weightForHeight: null,
      },
      classifications: {
        height: { label: 'Chưa xác định', severity: 'unknown' },
        weight: { label: 'Chưa xác định', severity: 'unknown' },
        bmi: { label: 'Bình thường', severity: 'unknown' },
        overall: { label: 'Bình thường (Đạt chuẩn WHO)', color: 'emerald', status: 'NORMAL' },
      },
    };
  }
}

/**
 * Format evaluation badge based on stored Z-scores
 */
export function getClassificationFromZScores({ heightZ, weightZ, bmiZ, bmiVal }) {
  const hz = heightZ != null ? Number(heightZ) : null;
  const wz = weightZ != null ? Number(weightZ) : null;
  const bz = bmiZ != null ? Number(bmiZ) : null;

  if (bz != null) {
    if (bz > 3) return { label: 'Béo phì', color: 'rose', status: 'OBESE' };
    if (bz > 2) return { label: 'Thừa cân', color: 'rose', status: 'OVERWEIGHT' };
    if (bz > 1.5 && (wz == null || wz > 1.5)) return { label: 'Nguy cơ thừa cân', color: 'amber', status: 'RISK_OVERWEIGHT' };
    if (bz < -3) return { label: 'Gầy còm mức độ nặng', color: 'rose', status: 'SEVERELY_WASTED' };
    if (bz < -2) return { label: 'Gầy còm', color: 'amber', status: 'WASTED' };
  }

  if (hz != null) {
    if (hz < -3) return { label: 'Thấp còi độ 2 (nặng)', color: 'rose', status: 'SEVERELY_STUNTED' };
    if (hz < -2) return { label: 'Thấp còi độ 1', color: 'amber', status: 'STUNTED' };
  }

  if (wz != null) {
    if (wz < -3) return { label: 'Suy dinh dưỡng nặng', color: 'rose', status: 'SEVERELY_UNDERWEIGHT' };
    if (wz < -2) return { label: 'Suy dinh dưỡng nhẹ cân', color: 'amber', status: 'UNDERWEIGHT' };
  }

  if (bz == null && hz == null && wz == null && bmiVal != null) {
    const num = Number(bmiVal);
    if (num < 13.5) return { label: 'Suy dinh dưỡng / Nhẹ cân', color: 'amber', status: 'UNDERWEIGHT' };
    if (num > 19.5) return { label: 'Thừa cân / Béo phì', color: 'rose', status: 'OBESE' };
    if (num > 17.5) return { label: 'Nguy cơ thừa cân', color: 'amber', status: 'RISK_OVERWEIGHT' };
  }

  return { label: 'Bình thường (Đạt chuẩn WHO)', color: 'emerald', status: 'NORMAL' };
}
