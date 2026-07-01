import { describe, it, expect, vi, afterEach } from 'vitest';
import { removeContactFromState, addRecentDestination } from './appStore';
import type { AppState, Destination } from './appStore';

const dest = (name: string): Destination => ({ name, address: `${name} 주소`, lat: 37.5, lng: 127.0 });

const KEY = 'bueongi-app-state-v1';

const baseState: AppState = {
  destination: null,
  recentDestinations: [],
  savedPlaces: {
    home: { name: null, address: null, lat: null, lng: null },
    school: { name: null, address: null, lat: null, lng: null },
    work: { name: null, address: null, lat: null, lng: null },
  },
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

describe('addRecentDestination (실제로 안심귀가 시작한 목적지만 최신순 누적)', () => {
  it('빈 목록에 추가하면 맨 앞에 온다', () => {
    expect(addRecentDestination([], dest('강남역')).map((d) => d.name)).toEqual(['강남역']);
  });

  it('최신 선택이 맨 앞, 최근순 정렬', () => {
    let recents: Destination[] = [];
    recents = addRecentDestination(recents, dest('A'));
    recents = addRecentDestination(recents, dest('B'));
    recents = addRecentDestination(recents, dest('C'));
    expect(recents.map((d) => d.name)).toEqual(['C', 'B', 'A']);
  });

  it('같은 이름은 중복 없이 맨 앞으로 끌어올린다(길이 불변)', () => {
    const recents = [dest('A'), dest('B'), dest('C')];
    const next = addRecentDestination(recents, dest('C'));
    expect(next.map((d) => d.name)).toEqual(['C', 'A', 'B']);
    expect(next).toHaveLength(3);
  });

  it('최대 개수(기본 5)를 넘으면 오래된 것부터 잘린다', () => {
    let recents: Destination[] = [];
    for (const n of ['A', 'B', 'C', 'D', 'E', 'F']) recents = addRecentDestination(recents, dest(n));
    expect(recents.map((d) => d.name)).toEqual(['F', 'E', 'D', 'C', 'B']);
    expect(recents).toHaveLength(5);
  });

  it('원본 배열을 변형하지 않는다', () => {
    const recents = [dest('A')];
    addRecentDestination(recents, dest('B'));
    expect(recents.map((d) => d.name)).toEqual(['A']);
  });
});
