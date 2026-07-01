import { describe, it, expect } from 'vitest';
import { formatScoreBasis, formatProvenanceNote, SCORE_CAUTION_NOTE } from './dataProvenance';
import type { RouteScoreBreakdown } from './routeCompare';

const base: RouteScoreBreakdown = {
  routeKm: 1.2,
  cctvDensity: 0,
  lampDensity: 0,
  bellDensity: 0,
  safehouseCount: 0,
  policeCount: 0,
  safePathOverlap: 0,
};

describe('formatScoreBasis (P0-4 점수 근거)', () => {
  it('값이 있는 항목만 " · "로 잇는다(밀도는 소수 1자리)', () => {
    const s = formatScoreBasis({ ...base, cctvDensity: 8.25, bellDensity: 1, safehouseCount: 2, safePathOverlap: 0.6 });
    expect(s).toBe('CCTV 8.3/km · 비상벨 1/km · 지킴이집 2 · 안심귀갓길 60% 겹침');
  });

  it('조명·지구대도 포함한다', () => {
    const s = formatScoreBasis({ ...base, lampDensity: 12, policeCount: 1 });
    expect(s).toBe('조명 12/km · 지구대 1');
  });

  it('전부 0이면 빈 문자열 대신 "없음"을 정직하게 알린다', () => {
    expect(formatScoreBasis(base)).toBe('경로 30m 내 집계된 안심시설 없음');
  });
});

describe('formatProvenanceNote (P0-3 기준일·출처)', () => {
  it('기준일이 있으면 "기준일 YYYY.MM · 출처" 형식', () => {
    expect(formatProvenanceNote({ kind: 'live', basedOn: '2026.06', origin: '공공데이터포털' })).toBe(
      '기준일 2026.06 · 공공데이터포털',
    );
  });

  it('기준일 미상이면 출처만', () => {
    expect(formatProvenanceNote({ kind: 'live', origin: '공공데이터포털' })).toBe('출처 공공데이터포털');
  });
});

describe('SCORE_CAUTION_NOTE (과신 방지)', () => {
  it('현장과 다를 수 있음을 명시한다', () => {
    expect(SCORE_CAUTION_NOTE).toContain('다를 수 있어요');
  });
});
