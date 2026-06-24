import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  currentMonthVersion,
  extractSeoulRows,
  linkItemsToPaths,
  loadSeoulLinkedPaths,
  loadSeoulSafeItems,
  loadSeoulSafePaths,
  parseSafeReturnItem,
  parseSafeReturnPath,
  parseSafeReturnPoint,
  parseWktLineString,
  type SeoulSafeItem,
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

describe('parseSafeReturnItem (A-2 링크ID 보존)', () => {
  it('좌표 + LINK_ID + 종류를 함께 파싱', () => {
    expect(parseSafeReturnItem({ LAT: 37.5, LNG: 127.0, LINK_ID: 'L1', ITEM_SE: '안심벨' })).toEqual({
      coords: { lat: 37.5, lng: 127.0 },
      linkId: 'L1',
      kind: '안심벨',
    });
  });

  it('LINK_ID 없으면 linkId 미포함(미연계 시설)', () => {
    expect(parseSafeReturnItem({ LAT: 37.5, LNG: 127.0 })).toEqual({ coords: { lat: 37.5, lng: 127.0 } });
  });

  it('좌표 없으면 null', () => {
    expect(parseSafeReturnItem({ LINK_ID: 'L1' })).toBeNull();
  });
});

describe('linkItemsToPaths (A-2 ↔ A-1 LINK_ID 연계)', () => {
  const paths = [
    { id: 'L1', coords: [{ lat: 37.5, lng: 127.0 }, { lat: 37.51, lng: 127.01 }] },
    { id: 'L2', coords: [{ lat: 37.6, lng: 127.1 }, { lat: 37.61, lng: 127.11 }] },
  ];

  it('같은 LINK_ID 시설물을 해당 경로에 묶고 개수를 센다', () => {
    const items: SeoulSafeItem[] = [
      { coords: { lat: 37.5, lng: 127.0 }, linkId: 'L1' },
      { coords: { lat: 37.505, lng: 127.005 }, linkId: 'L1' },
      { coords: { lat: 37.6, lng: 127.1 }, linkId: 'L2' },
    ];
    const linked = linkItemsToPaths(paths, items);
    expect(linked.find((p) => p.id === 'L1')?.itemCount).toBe(2);
    expect(linked.find((p) => p.id === 'L2')?.itemCount).toBe(1);
  });

  it('linkId 없는 시설물은 어떤 경로에도 붙지 않는다', () => {
    const items: SeoulSafeItem[] = [{ coords: { lat: 37.5, lng: 127.0 } }];
    const linked = linkItemsToPaths(paths, items);
    expect(linked.every((p) => p.itemCount === 0)).toBe(true);
  });

  it('매칭 경로가 없는 linkId는 무시(연계 실패해도 경로는 유지)', () => {
    const items: SeoulSafeItem[] = [{ coords: { lat: 37.9, lng: 127.9 }, linkId: 'L999' }];
    const linked = linkItemsToPaths(paths, items);
    expect(linked).toHaveLength(2);
    expect(linked.every((p) => p.itemCount === 0)).toBe(true);
  });

  it('같은 LINK_ID 경로가 둘이면 첫 경로에만 시설을 붙인다(안전점수 이중가산 차단)', () => {
    // 서울 원천에 동일 LINK_ID 행이 중복돼도 같은 시설물이 두 경로에 가산되면
    // 겹침 보너스가 부풀어 거짓으로 더 안전한 경로처럼 보인다 — consumed dedup 회귀 가드.
    const dupPaths = [
      { id: 'DUP', coords: [{ lat: 37.5, lng: 127.0 }, { lat: 37.51, lng: 127.01 }] },
      { id: 'DUP', coords: [{ lat: 37.5, lng: 127.0 }, { lat: 37.51, lng: 127.01 }] },
    ];
    const items: SeoulSafeItem[] = [
      { coords: { lat: 37.5, lng: 127.0 }, linkId: 'DUP' },
      { coords: { lat: 37.505, lng: 127.005 }, linkId: 'DUP' },
    ];
    const linked = linkItemsToPaths(dupPaths, items);
    expect(linked.map((p) => p.itemCount)).toEqual([2, 0]);
    // 동일 시설물이 두 경로 합산으로 중복 계상되지 않는다.
    expect(linked.reduce((sum, p) => sum + p.itemCount, 0)).toBe(items.length);
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

describe('loadSeoulLinkedPaths (A-1+A-2 다운로드 후 LINK_ID 연계)', () => {
  it('A-1 경로와 A-2 시설물을 모두 받아 LINK_ID로 연계', async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('tbSafeReturnPath')) {
        return new Response(
          JSON.stringify({
            tbSafeReturnPath: {
              RESULT: { CODE: 'INFO-000' },
              row: [{ LINK_ID: 'L1', WKT: 'LINESTRING(127.0 37.5, 127.01 37.51)' }],
            },
          }),
          { status: 200 },
        );
      }
      return new Response(
        JSON.stringify({
          tbSafeReturnItem: {
            RESULT: { CODE: 'INFO-000' },
            row: [
              { LAT: 37.5, LNG: 127.0, LINK_ID: 'L1', ITEM_SE: '안심벨' },
              { LAT: 37.505, LNG: 127.005, LINK_ID: 'L1', ITEM_SE: 'CCTV' },
            ],
          },
        }),
        { status: 200 },
      );
    });
    const linked = await loadSeoulLinkedPaths({ apiKey: 'K', fetchImpl, monthVersion: '2026-06', now: 1000 });
    expect(linked).toHaveLength(1);
    expect(linked[0].id).toBe('L1');
    expect(linked[0].itemCount).toBe(2);
    expect(linked[0].items).toHaveLength(2);
  });

  it('A-2 호출 실패해도 A-1 경로는 연계 0개로 유지', async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('tbSafeReturnPath')) {
        return new Response(
          JSON.stringify({
            tbSafeReturnPath: {
              RESULT: { CODE: 'INFO-000' },
              row: [{ LINK_ID: 'L1', WKT: 'LINESTRING(127.0 37.5, 127.01 37.51)' }],
            },
          }),
          { status: 200 },
        );
      }
      return new Response('err', { status: 500 });
    });
    const linked = await loadSeoulLinkedPaths({ apiKey: 'K', fetchImpl, monthVersion: '2026-06', now: 1000 });
    expect(linked).toHaveLength(1);
    expect(linked[0].itemCount).toBe(0);
  });
});
