import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { writeCache } from './localCache';
import { loadNearestPolice } from './policeSource';

function memoryStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
  };
}

const current = { lat: 37.5, lng: 127.0 };

beforeEach(() => {
  vi.stubGlobal('localStorage', memoryStorage());
  vi.stubGlobal('process', { env: {} }); // CDN 미설정 기본
});
afterEach(() => vi.unstubAllGlobals());

describe('loadNearestPolice', () => {
  it('캐시가 있으면 네트워크 없이 로컬 검색(오프라인)', async () => {
    // police:all 캐시를 미리 채움(스키마 1).
    writeCache('police:all', 1, 'v1', [
      { id: 'a', type: 'police', name: '가까운파출소', lat: 37.501, lng: 127.0, tel: '02-111-2222' },
      { id: 'b', type: 'police', name: '먼파출소', lat: 37.9, lng: 127.0 },
    ]);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const list = await loadNearestPolice(current, { limit: 3 });
    expect(list.map((p) => p.id)).toEqual(['a']); // b는 10km 밖
    expect(fetchMock).not.toHaveBeenCalled(); // 네트워크 호출 없음
  });

  it('캐시가 없고 CDN도 없으면 정직하게 throw', async () => {
    await expect(loadNearestPolice(current)).rejects.toThrow('파출소 데이터');
  });

  it('캐시가 없으면 CDN에서 받아 검색한다', async () => {
    vi.stubGlobal('process', { env: { VITE_CDN_BASE_URL: 'https://cdn.test' } });
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/manifest.json')) return new Response(JSON.stringify({ version: 'v1' }), { status: 200 });
      return new Response(JSON.stringify([{ id: 'x', lat: 37.5005, lng: 127.0, properties: { tel: '031-1' } }]), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const list = await loadNearestPolice(current);
    expect(list).toHaveLength(1);
    expect(list[0].tel).toBe('031-1');
  });
});
