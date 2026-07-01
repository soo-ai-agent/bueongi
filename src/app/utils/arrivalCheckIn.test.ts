import { describe, it, expect } from 'vitest';
import {
  expectedArrivalAt,
  msUntilCheckIn,
  isCheckInDue,
  CHECKIN_GRACE_MS,
  CHECKIN_SNOOZE_MS,
} from './arrivalCheckIn';

const START = 1_000_000_000_000; // 임의 고정 시각(ms)

describe('expectedArrivalAt', () => {
  it('시작 + ETA(분) + 여유 = 예정 도착 시각', () => {
    // ETA 20분 → 20*60000 + 여유(1분).
    expect(expectedArrivalAt(START, 20)).toBe(START + 20 * 60_000 + CHECKIN_GRACE_MS);
  });

  it('누적 연장(extraMs)을 더한다', () => {
    expect(expectedArrivalAt(START, 20, CHECKIN_SNOOZE_MS)).toBe(
      START + 20 * 60_000 + CHECKIN_GRACE_MS + CHECKIN_SNOOZE_MS,
    );
  });

  it('ETA가 0·음수·NaN이면 ETA 성분을 0으로(여유시간 뒤 바로 체크인, 폭주 방지)', () => {
    expect(expectedArrivalAt(START, 0)).toBe(START + CHECKIN_GRACE_MS);
    expect(expectedArrivalAt(START, -5)).toBe(START + CHECKIN_GRACE_MS);
    expect(expectedArrivalAt(START, Number.NaN)).toBe(START + CHECKIN_GRACE_MS);
  });

  it('여유시간(grace)을 직접 지정할 수 있다', () => {
    expect(expectedArrivalAt(START, 10, 0, 0)).toBe(START + 10 * 60_000);
  });
});

describe('msUntilCheckIn', () => {
  it('예정 시각까지 남은 ms(양수) — setTimeout 지연값', () => {
    const target = expectedArrivalAt(START, 10);
    expect(msUntilCheckIn(target, START)).toBe(10 * 60_000 + CHECKIN_GRACE_MS);
  });

  it('이미 지났으면 0 이하', () => {
    const target = expectedArrivalAt(START, 10);
    expect(msUntilCheckIn(target, target + 5_000)).toBeLessThanOrEqual(0);
  });
});

describe('isCheckInDue', () => {
  it('예정 시각 이전에는 false, 도달/경과 시 true', () => {
    const target = expectedArrivalAt(START, 10);
    expect(isCheckInDue(target, target - 1)).toBe(false);
    expect(isCheckInDue(target, target)).toBe(true);
    expect(isCheckInDue(target, target + 1)).toBe(true);
  });
});
