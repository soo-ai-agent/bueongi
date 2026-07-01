/**
 * 미도착 안전망 — "도착 예정시각 체크인" 타이밍(순수 함수).
 *
 * 길안내 시작 시각 + ETA(분) + 여유시간으로 '예정 도착 시각'을 잡고, 그 시각이 지나도록
 * 사용자가 귀가 완료를 누르지 않으면(=미도착) 보호자 알림 유도 플로우를 띄운다.
 * 자동 전송/푸시는 없다 — 현재 스택(웹 공유/복사) 안에서 사용자 액션을 '유도'만 한다.
 *
 * 순수 함수로 분리해 시계 없이 단위 검증한다(컴포넌트는 Date.now()/setTimeout으로 구동).
 */

/** ETA 경과 후 체크인까지의 여유(ms). 정시 도착자 오알림을 막는 1분 버퍼. */
export const CHECKIN_GRACE_MS = 60_000;

/** '조금 더 걸려요' 1회 연장분(ms) = 5분. 누적 연장에 사용. */
export const CHECKIN_SNOOZE_MS = 5 * 60_000;

/**
 * 예정 도착 시각(epoch ms) = 시작시각 + ETA(분) + 여유 + 누적 연장.
 * ETA가 비정상(0·음수·NaN)이면 ETA 성분을 0으로 두어 여유시간 뒤 바로 체크인한다(폭주 방지).
 */
export function expectedArrivalAt(
  startedAtMs: number,
  etaMinutes: number,
  extraMs = 0,
  graceMs: number = CHECKIN_GRACE_MS,
): number {
  const eta = Number.isFinite(etaMinutes) && etaMinutes > 0 ? etaMinutes : 0;
  return startedAtMs + eta * 60_000 + Math.max(0, graceMs) + Math.max(0, extraMs);
}

/** 지금(now) 기준 체크인까지 남은 ms. 0 이하이면 이미 도래(setTimeout 지연값으로 사용). */
export function msUntilCheckIn(expectedAtMs: number, nowMs: number): number {
  return expectedAtMs - nowMs;
}

/** 예정 도착 시각이 지났는지(체크인 도래 여부). */
export function isCheckInDue(expectedAtMs: number, nowMs: number): boolean {
  return nowMs >= expectedAtMs;
}
