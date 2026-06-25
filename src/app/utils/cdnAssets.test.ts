import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  fileVersion,
  loadCctv,
  loadManifest,
  loadPolice,
  loadSafepath,
  toSafetyPoint,
  type CdnManifest,
} from './cdnAssets';

function memoryStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
  };
}

const BASE = 'https://cdn.test/bueongi';

beforeEach(() => vi.stubGlobal('localStorage', memoryStorage()));
afterEach(() => vi.unstubAllGlobals());

describe('toSafetyPoint', () => {
  it('WGS84 범위 밖/손상 아이템은 버린다', () => {
    expect(toSafetyPoint({ lat: 999, lng: 127 }, 'cctv')).toBeNull();
    expect(toSafetyPoint({ lat: 37.5 }, 'cctv')).toBeNull();
    expect(toSafetyPoint(null, 'cctv')).toBeNull();
  });

  it('유효 아이템은 표준 스키마로 변환(type 폴백 적용)', () => {
    expect(toSafetyPoint({ id: 'x', lat: 37.5, lng: 127, name: 'CCTV1' }, 'cctv')).toEqual({
      id: 'x',
      type: 'cctv',
      name: 'CCTV1',
      lat: 37.5,
      lng: 127,
    });
  });
});

describe('loadManifest', () => {
  it('version 문자열이 없으면 throw', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({}), { status: 200 }));
    await expect(loadManifest({ baseUrl: BASE, fetchImpl })).rejects.toThrow('version');
  });

  it('정상 manifest를 반환', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ version: 'v3' }), { status: 200 }));
    await expect(loadManifest({ baseUrl: BASE, fetchImpl })).resolves.toMatchObject({ version: 'v3' });
  });
});

describe('loadCctv 캐시 무효화', () => {
  const payload = JSON.stringify([
    { id: '1', lat: 37.5, lng: 127.0 },
    { id: '2', lat: 999, lng: 127.0 }, // 손상 → 제외
  ]);

  it('첫 호출은 네트워크, 같은 버전 재호출은 캐시(네트워크 없음)', async () => {
    const fetchImpl = vi.fn(async () => new Response(payload, { status: 200 }));
    const first = await loadCctv('11680', 'v1', { baseUrl: BASE, fetchImpl, now: 1000 });
    expect(first).toHaveLength(1);
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    await loadCctv('11680', 'v1', { baseUrl: BASE, fetchImpl, now: 2000 });
    expect(fetchImpl).toHaveBeenCalledTimes(1); // 캐시 사용
  });

  it('manifest 버전이 바뀌면 재다운로드', async () => {
    const fetchImpl = vi.fn(async () => new Response(payload, { status: 200 }));
    await loadCctv('11680', 'v1', { baseUrl: BASE, fetchImpl, now: 1000 });
    await loadCctv('11680', 'v2', { baseUrl: BASE, fetchImpl, now: 1000 });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('자치구 코드로 파일 경로를 결정한다', async () => {
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response('[]', { status: 200 }));
    await loadCctv('11710', 'v1', { baseUrl: BASE, fetchImpl });
    expect(fetchImpl.mock.calls[0][0]).toBe(`${BASE}/cctv/11710.json`);
  });
});

describe('loadPolice / loadSafepath', () => {
  it('police는 properties.tel을 끌어올린다', async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify([{ id: 'p1', lat: 37.5, lng: 127, properties: { tel: '02-100-2000' } }]), { status: 200 }),
    );
    const police = await loadPolice('v1', { baseUrl: BASE, fetchImpl });
    expect(police[0].tel).toBe('02-100-2000');
  });

  it('safepath는 [lng,lat] 좌표열을 파싱하고 2점 미만은 버린다', async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify([
          { id: 's1', coords: [[127.0, 37.5], [127.01, 37.51]] },
          { id: 's2', coords: [[127.0, 37.5]] }, // 1점 → 제외
        ]),
        { status: 200 },
      ),
    );
    const paths = await loadSafepath('v1', { baseUrl: BASE, fetchImpl });
    expect(paths).toHaveLength(1);
    expect(paths[0].coords[0]).toEqual({ lat: 37.5, lng: 127.0 });
  });
});

describe('fileVersion', () => {
  it('파일별 sha256 우선(파이프라인 배열 계약), 없으면 manifest 전체 버전', () => {
    const manifest: CdnManifest = { version: 'v9', files: [{ path: 'cctv/11680.json', sha256: 'abc123' }] };
    expect(fileVersion(manifest, 'cctv/11680.json')).toBe('abc123');
    expect(fileVersion(manifest, 'safehouse/all.json')).toBe('v9');
  });
});

describe('baseUrl 미설정', () => {
  it('throw로 직접 호출 폴백 신호', async () => {
    await expect(loadCctv('11680', 'v1', { fetchImpl: vi.fn() })).rejects.toThrow('CDN base URL');
  });
});
