import { describe, it, expect, vi, afterEach } from 'vitest';
import { removeContactFromState } from './appStore';
import type { AppState } from './appStore';

const KEY = 'bueongi-app-state-v1';

const baseState: AppState = {
  destination: null,
  recentDestinations: [],
  savedPlaces: { home: { address: null }, school: { address: null }, work: { address: null } },
  contacts: [
    { id: 1, name: '아빠', phone: '010-1111-2222' },
    { id: 2, name: '엄마', phone: '010-3333-4444' },
  ],
};

describe('removeContactFromState (BUE-CONTACT-DELETE-PERSIST-HONESTY)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('해당 id만 삭제하고 나머지는 보존한다', () => {
    vi.stubGlobal('localStorage', { setItem: vi.fn() });
    const { next } = removeContactFromState(baseState, 1);
    expect(next.contacts.map((c) => c.id)).toEqual([2]);
    expect(next.contacts).toHaveLength(1);
  });

  it('영속 성공 → persisted=true (다음 상태가 직렬화되어 setItem 호출)', () => {
    const setItem = vi.fn();
    vi.stubGlobal('localStorage', { setItem });
    const { next, persisted } = removeContactFromState(baseState, 2);
    expect(persisted).toBe(true);
    expect(setItem).toHaveBeenCalledWith(KEY, JSON.stringify(next));
  });

  it('영속 실패(프라이빗 모드 setItem throw) → persisted=false (거짓 "삭제됨" 차단 신호, raw 비전파)', () => {
    vi.stubGlobal('localStorage', {
      setItem: vi.fn(() => {
        throw new DOMException('exceeded', 'QuotaExceededError');
      }),
    });
    const { next, persisted } = removeContactFromState(baseState, 1);
    // in-memory next 상태는 여전히 삭제 반영(앱은 계속 동작), 단 영속은 실패 신호.
    expect(next.contacts.map((c) => c.id)).toEqual([2]);
    expect(persisted).toBe(false);
  });

  it('localStorage 접근 자체 차단(정책) → persisted=false', () => {
    vi.stubGlobal('localStorage', {
      setItem: vi.fn(() => {
        throw new Error('access denied');
      }),
    });
    const { persisted } = removeContactFromState(baseState, 2);
    expect(persisted).toBe(false);
  });

  it('존재하지 않는 id 삭제는 목록 불변(원본 비변형)', () => {
    vi.stubGlobal('localStorage', { setItem: vi.fn() });
    const { next } = removeContactFromState(baseState, 999);
    expect(next.contacts.map((c) => c.id)).toEqual([1, 2]);
    expect(baseState.contacts).toHaveLength(2); // 원본 불변
  });
});
