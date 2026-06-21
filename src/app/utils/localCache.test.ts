import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MONTH_MS, clearCache, readCache, shouldRefresh, writeCache } from './localCache';

function memoryStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    _map: map,
  };
}

describe('readCache/writeCache', () => {
  beforeEach(() => vi.stubGlobal('localStorage', memoryStorage()));
  afterEach(() => vi.unstubAllGlobals());

  it('쓴 뒤 같은 스키마/버전으로 읽으면 페이로드를 돌려준다', () => {
    expect(writeCache('cctv:11680', 1, 'v1', [{ id: 'a' }], 1000)).toBe(true);
    const cache = readCache<{ id: string }[]>('cctv:11680', 1);
    expect(cache?.payload).toEqual([{ id: 'a' }]);
    expect(cache?.version).toBe('v1');
    expect(cache?.savedAt).toBe(1000);
  });

  it('스키마 버전이 다르면 null(구조 변경 무효화)', () => {
    writeCache('t', 1, 'v1', [1], 1000);
    expect(readCache('t', 2)).toBeNull();
  });

  it('손상 JSON은 null', () => {
    localStorage.setItem('bueongi-cache:t', '{not json');
    expect(readCache('t', 1)).toBeNull();
  });

  it('clearCache 후엔 null', () => {
    writeCache('t', 1, 'v1', [1]);
    clearCache('t');
    expect(readCache('t', 1)).toBeNull();
  });
});

describe('writeCache 실패 표면화', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('localStorage 없으면 false(거짓확신 방지)', () => {
    vi.stubGlobal('localStorage', undefined);
    expect(writeCache('t', 1, 'v1', [1])).toBe(false);
  });

  it('setItem 예외(quota)면 false', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: () => {
        throw new Error('quota');
      },
      removeItem: () => {},
    });
    expect(writeCache('t', 1, 'v1', [1])).toBe(false);
  });
});

describe('shouldRefresh', () => {
  const cache = { schema: 1, version: 'v1', savedAt: 0, payload: [] };

  it('캐시 없으면 갱신', () => {
    expect(shouldRefresh(null, 'v1', MONTH_MS, 0)).toBe(true);
  });

  it('버전 불일치(manifest 변경)면 갱신', () => {
    expect(shouldRefresh(cache, 'v2', MONTH_MS, 0)).toBe(true);
  });

  it('신선도 안이면 갱신 안 함', () => {
    expect(shouldRefresh(cache, 'v1', MONTH_MS, MONTH_MS - 1)).toBe(false);
  });

  it('신선도 초과(월1회)면 갱신', () => {
    expect(shouldRefresh(cache, 'v1', MONTH_MS, MONTH_MS)).toBe(true);
  });
});
