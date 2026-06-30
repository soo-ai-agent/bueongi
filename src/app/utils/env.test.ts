import { afterEach, describe, expect, it, vi } from 'vitest';
import { getCdnBaseUrl, getShareApiBaseUrl, getTmapAppKey, maskSecret } from './env';

afterEach(() => vi.unstubAllGlobals());

describe('env getters (process.env 폴백)', () => {
  it('Tmap AppKey를 읽는다', () => {
    vi.stubGlobal('process', { env: { VITE_TMAP_APP_KEY: 'tmap-key' } });
    expect(getTmapAppKey()).toBe('tmap-key');
  });

  it('CDN base URL 끝 슬래시를 정규화', () => {
    vi.stubGlobal('process', { env: { VITE_CDN_BASE_URL: 'https://cdn.test/bueongi///' } });
    expect(getCdnBaseUrl()).toBe('https://cdn.test/bueongi');
  });

  it('미설정은 undefined', () => {
    vi.stubGlobal('process', { env: {} });
    expect(getShareApiBaseUrl()).toBeUndefined();
  });
});

describe('maskSecret', () => {
  it('앞 6자리만 남기고 마스킹', () => {
    expect(maskSecret('abcdefghijklmnop')).toBe('abcdef…');
  });

  it('짧은 키도 노출 최소화', () => {
    expect(maskSecret('abc')).toBe('a***');
  });

  it('없으면 (none)', () => {
    expect(maskSecret(undefined)).toBe('(none)');
  });
});
