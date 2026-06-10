import { describe, it, expect, vi, afterEach } from 'vitest';
import { persistAppState } from './persist';

const KEY = 'bueongi-app-state-v1';
const SAFE_STATE = {
  contacts: [{ id: 1, name: '아빠', phone: '010-1234-5678' }],
  savedPlaces: { home: { address: '서울 강남구 역삼로' }, school: { address: null }, work: { address: null } },
  destination: null,
  recentDestinations: [],
};

describe('persistAppState', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('정상 저장 → true (값이 직렬화되어 setItem 호출)', () => {
    const setItem = vi.fn();
    vi.stubGlobal('localStorage', { setItem });
    expect(persistAppState(KEY, SAFE_STATE)).toBe(true);
    expect(setItem).toHaveBeenCalledWith(KEY, JSON.stringify(SAFE_STATE));
  });

  it('quota 초과(프라이빗 모드 등) → false (거짓확신 차단 신호, raw 비전파)', () => {
    const setItem = vi.fn(() => {
      throw new DOMException('exceeded', 'QuotaExceededError');
    });
    vi.stubGlobal('localStorage', { setItem });
    // 긴급 연락처 저장 실패 경로
    expect(persistAppState(KEY, SAFE_STATE)).toBe(false);
  });

  it('localStorage 접근 자체 차단(정책) → false', () => {
    const setItem = vi.fn(() => {
      throw new Error('access denied');
    });
    vi.stubGlobal('localStorage', { setItem });
    // 자주 가는 장소 저장 실패 경로
    expect(persistAppState(KEY, { ...SAFE_STATE, savedPlaces: { ...SAFE_STATE.savedPlaces, home: { address: '집 주소' } } })).toBe(false);
  });
});
