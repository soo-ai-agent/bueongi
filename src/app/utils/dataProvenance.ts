import type { RouteScoreBreakdown, RouteProvenance } from './routeCompare';

/**
 * 데이터 출처/근거 표기(P0-1·P0-3·P0-4) 순수 헬퍼.
 * - 점수 근거: "CCTV 8.2/km · 비상벨 1.1/km · 지킴이집 1 · 안심귀갓길 60% 겹침"
 * - 출처 표기: "기준일 2026.06 · 공공데이터포털·서울 열린데이터광장"
 * - 과신 방지 문구: 점수는 데이터 기반 추정일 뿐임을 항상 함께 알린다.
 */

/** 과신 방지 문구(P0-4). 점수·근거 옆에 항상 함께 노출한다. */
export const SCORE_CAUTION_NOTE = '공공데이터 기반 추정으로, 실제 현장과 다를 수 있어요.';

/** 폴백(예시) 데이터 안내 — 실데이터 배지와 짝을 이루는 설명 문구(P0-1). */
export const FALLBACK_NOTICE = '예시 데이터로 표시 중이에요. 실데이터 연결 시 자동 전환됩니다.';

function fmt(n: number): string {
  // 밀도는 소수 1자리(8.25→8.3), 정수는 그대로.
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

/**
 * 점수 근거 한 줄(P0-4). 값이 0인 항목은 생략해 짧게 유지하되, 전부 0이면
 * "회랑 내 안심시설 없음"으로 정직하게 알린다(빈 문자열로 얼버무리지 않음).
 */
export function formatScoreBasis(b: RouteScoreBreakdown): string {
  const parts: string[] = [];
  if (b.cctvDensity > 0) parts.push(`CCTV ${fmt(b.cctvDensity)}/km`);
  if (b.lampDensity > 0) parts.push(`조명 ${fmt(b.lampDensity)}/km`);
  if (b.bellDensity > 0) parts.push(`비상벨 ${fmt(b.bellDensity)}/km`);
  if (b.safehouseCount > 0) parts.push(`지킴이집 ${b.safehouseCount}`);
  if (b.policeCount > 0) parts.push(`지구대 ${b.policeCount}`);
  if (b.safePathOverlap > 0) parts.push(`안심귀갓길 ${Math.round(b.safePathOverlap * 100)}% 겹침`);
  return parts.length > 0 ? parts.join(' · ') : '경로 30m 내 집계된 안심시설 없음';
}

/** 출처/기준일 한 줄(P0-3). 기준일 미상이면 출처만. */
export function formatProvenanceNote(p: RouteProvenance): string {
  return p.basedOn ? `기준일 ${p.basedOn} · ${p.origin}` : `출처 ${p.origin}`;
}
