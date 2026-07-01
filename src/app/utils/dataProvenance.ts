import type { RouteScoreBreakdown, RouteProvenance } from './routeCompare';

/**
 * 데이터 출처/근거 표기(P0-1·P0-3·P0-4) 순수 헬퍼.
 * - 점수 근거: "CCTV 8.2/km · 비상벨 1.1/km · 지킴이집 1 · 안심귀갓길 60% 겹침"
 * - 출처 표기: "기준일 2026.06 · 공공데이터포털·서울 열린데이터광장"
 * - 과신 방지 문구: 점수는 데이터 기반 추정일 뿐임을 항상 함께 알린다.
 */

/** 과신 방지 문구(P0-4). 화면 하단 데이터 안내(formatDataFooter)에 포함된다. */
export const SCORE_CAUTION_NOTE = '실제 현장과 다를 수 있어요';

function fmt(n: number): string {
  // 밀도는 소수 1자리(8.25→8.3), 정수는 그대로.
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

/**
 * 점수 근거 칩 목록(P0-4). 값이 0인 항목은 생략해 스캔 가능하게 유지하되, 전부 0이면
 * "근처 안심시설 없음" 한 개로 정직하게 알린다(빈 목록으로 얼버무리지 않음).
 */
export function scoreBasisItems(b: RouteScoreBreakdown): string[] {
  const parts: string[] = [];
  if (b.cctvDensity > 0) parts.push(`CCTV ${fmt(b.cctvDensity)}/km`);
  if (b.lampDensity > 0) parts.push(`조명 ${fmt(b.lampDensity)}/km`);
  if (b.bellDensity > 0) parts.push(`비상벨 ${fmt(b.bellDensity)}/km`);
  if (b.safehouseCount > 0) parts.push(`지킴이집 ${b.safehouseCount}`);
  if (b.policeCount > 0) parts.push(`지구대 ${b.policeCount}`);
  if (b.safePathOverlap > 0) parts.push(`안심귀갓길 ${Math.round(b.safePathOverlap * 100)}%`);
  return parts.length > 0 ? parts : ['근처 안심시설 없음'];
}

/** 점수 근거 한 줄(칩 목록을 " · "로 연결). */
export function formatScoreBasis(b: RouteScoreBreakdown): string {
  return scoreBasisItems(b).join(' · ');
}

/** 출처/기준일 한 줄(P0-3) — 마커 정보 카드 등 좁은 영역용. 기준일 미상이면 출처만. */
export function formatProvenanceNote(p: RouteProvenance): string {
  return p.basedOn ? `기준일 ${p.basedOn} · ${p.origin}` : `출처 ${p.origin}`;
}

/**
 * 화면 하단 데이터 안내 한 문장(P0-1·P0-3·P0-4 통합).
 * 카드마다 반복하지 않고 목록/카드 아래 1회만 노출한다 — 실데이터면 기준일·출처 + 과신 방지,
 * 폴백이면 예시 데이터임과 자동 전환을 알린다.
 */
export function formatDataFooter(p?: RouteProvenance | null): string {
  if (!p) return '지금은 예시 데이터로 보여드리고 있어요. 실데이터가 연결되면 자동 전환돼요.';
  const based = p.basedOn ? `기준일 ${p.basedOn} · ` : '';
  return `${based}${p.origin} 기준이며, ${SCORE_CAUTION_NOTE}.`;
}
