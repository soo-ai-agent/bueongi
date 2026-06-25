/**
 * 예상 도착 시간(ETA) 표시 포맷.
 *  분(minutes) 정수를 "약 N분" / "약 H시간 M분" 으로. 0 이하·비정상이면 빈 문자열(배지 숨김).
 */
export function formatEta(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes <= 0) return '';
  const m = Math.round(minutes);
  if (m < 60) return `약 ${m}분`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem > 0 ? `약 ${h}시간 ${rem}분` : `약 ${h}시간`;
}
