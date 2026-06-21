import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  currentMonthVersion,
  extractSeoulRows,
  loadSeoulSafeItems,
  loadSeoulSafePaths,
  parseSafeReturnPath,
  parseSafeReturnPoint,
  parseWktLineString,
} from './seoulSafeReturn';

function memoryStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
  };
}

beforeEach(() => vi.stubGlobal('localStorage', memoryStorage()));
afterEach(() => vi.unstubAllGlobals());

describe('parseWktLineString', () => {
  it('lng lat 쌍을 {lat,lng}로 파싱', () => {
    expect(parseWktLineString('LINESTRING(127.0 37.5, 127.01 37.51)')).toEqual([
      { lat: 37.5, lng: 127.0 },
      { lat: 37.51, lng: 127.01 },
    ]);
  });

  it('좌표 없는 문자열은 빈 배열', () => {
    expect(parseWktLineString('LINESTRING EMPTY')).toEqual([]);
  });
});

describe('parseSafeReturnPath', () => {
  it('WKT 지오메트리에서 좌표열을 만든다', () => {
    const path = parseSafeReturnPath({ LINK_ID: 'L1', WKT: 'LINESTRING(127.0 37.5, 127.01 37.51)' }, 0);
    expect(path?.id).toBe('L1');
    expect(path?.coords).toHaveLength(2);
  });

  it('WKT 없으면 시작/끝 점으로 폴백', () => {
    const path = parseSafeReturnPath({ START_X: 127.0, START_Y: 37.5, END_X: 127.01, END_Y: 37.51 }, 3);
    expect(path?.coords).toEqual([
      { lat: 37.5, lng: 127.0 },
      { lat: 37.51, lng: 127.01 },
    ]);
    expect(path?.id).toBe('a1-3');
  });

  it('좌표를 못 만들면 null', () => {
    expect(parseSafeReturnPath({}, 0)).toBeNull();
  });
});

describe('parseSafeReturnPoint', () => {
  it('여러 컬럼명 후보에서 좌표를 뽑는다(문자열 숫자 포함)', () => {
    expect(parseSafeReturnPoint({ LAT: '37.5', LNG: '127.0' })).toEqual({ lat: 37.5, lng: 127.0 });
    expect(parseSafeReturnPoint({ YCRD: 37.5, XCRD: 127.0 })).toEqual({ lat: 37.5, lng: 127.0 });
  });

  it('범위 밖은 null', () => {
    expect(parseSafeReturnPoint({ LAT: 999, LNG: 127 })).toBeNull();
  });
});

describe('extractSeoulRows', () => {
  it('정상 응답에서 row 배열을 꺼낸다', () => {
    const payload = { tbSafeReturnItem: { RESULT: { CODE: 'INFO-000' }, row: [{ LAT: 37.5, LNG: 127 }] } };
    expect(extractSeoulRows(payload, 'tbSafeReturnItem')).toHaveLength(1);
  });

  it('오류 코드면 throw', () => {
    const payload = { tbSafeReturnPath: { RESULT: { CODE: 'INFO-100' } } };
    expect(() => extractSeoulRows(payload, 'tbSafeReturnPath')).toThrow('INFO-100');
  });
});

describe('currentMonthVersion', () => {
  it('yyyy-mm 형식', () => {
    expect(currentMonthVersion(Date.UTC(2026, 5, 19))).toBe('2026-06');
  });
});

describe('loadSeoulSafePaths/Items 직접 호출 + 캐시', () => {
  it('첫 실행은 직접 호출, 같은 월 재호출은 캐시', async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ tbSafeReturnPath: { RESULT: { CODE: 'INFO-000' }, row: [{ WKT: 'LINESTRING(127.0 37.5, 127.01 37.51)' }] } }), { status: 200 }),
    );
    const opts = { apiKey: 'K', fetchImpl, monthVersion: '2026-06', now: 1000 };
    const first = await loadSeoulSafePaths(opts);
    expect(first).toHaveLength(1);
    await loadSeoulSafePaths({ ...opts, now: 2000 });
    expect(fetchImpl).toHaveBeenCalledTimes(1); // 캐시
  });

  it('forceRefresh(서울 진입 우선 갱신)는 캐시 무시하고 재호출', async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ tbSafeReturnItem: { RESULT: { CODE: 'INFO-000' }, row: [{ LAT: 37.5, LNG: 127 }] } }), { status: 200 }),
    );
    const opts = { apiKey: 'K', fetchImpl, monthVersion: '2026-06', now: 1000 };
    await loadSeoulSafeItems(opts);
    await loadSeoulSafeItems({ ...opts, forceRefresh: true });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('인증키 없으면 throw(CDN 점수 폴백 신호)', async () => {
    await expect(loadSeoulSafePaths({ apiKey: '', fetchImpl: vi.fn() })).rejects.toThrow('인증키');
  });
});
