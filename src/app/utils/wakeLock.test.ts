import { describe, it, expect, vi } from 'vitest';
import { createScreenWakeLock } from './wakeLock';

function makeSentinel() {
  const listeners: Array<() => void> = [];
  const s = {
    released: false,
    release: vi.fn(async () => {
      s.released = true;
      listeners.forEach((l) => l());
    }),
    addEventListener: (_t: 'release', cb: () => void) => listeners.push(cb),
    // 테스트에서 브라우저의 자동 해제(화면 숨김 등)를 흉내낸다.
    fireRelease: () => {
      s.released = true;
      listeners.forEach((l) => l());
    },
  };
  return s;
}

function makeDoc(initial: DocumentVisibilityState = 'visible') {
  const listeners: Record<string, Array<() => void>> = {};
  return {
    visibilityState: initial,
    addEventListener: (t: string, cb: () => void) => void (listeners[t] ||= []).push(cb),
    removeEventListener: (t: string, cb: () => void) => {
      listeners[t] = (listeners[t] || []).filter((x) => x !== cb);
    },
    set(state: DocumentVisibilityState) {
      this.visibilityState = state;
      (listeners['visibilitychange'] || []).forEach((l) => l());
    },
  };
}

function makeNav(sentinels: ReturnType<typeof makeSentinel>[] = []) {
  const request = vi.fn(async () => {
    const s = makeSentinel();
    sentinels.push(s);
    return s;
  });
  return { nav: { wakeLock: { request } }, request, sentinels };
}

describe('createScreenWakeLock', () => {
  it('wakeLock 미지원 환경이면 supported=false, enable해도 무해(활성 안 됨)', async () => {
    const lock = createScreenWakeLock({ nav: {}, doc: makeDoc() });
    expect(lock.supported).toBe(false);
    await lock.enable();
    expect(lock.isActive()).toBe(false);
  });

  it('보이는 상태에서 enable하면 화면 잠금을 요청하고 활성화된다', async () => {
    const { nav, request } = makeNav();
    const lock = createScreenWakeLock({ nav, doc: makeDoc('visible') });
    expect(lock.supported).toBe(true);
    await lock.enable();
    expect(request).toHaveBeenCalledWith('screen');
    expect(lock.isActive()).toBe(true);
  });

  it('disable하면 잠금을 반납하고 비활성화된다', async () => {
    const sentinels: ReturnType<typeof makeSentinel>[] = [];
    const { nav } = makeNav(sentinels);
    const lock = createScreenWakeLock({ nav, doc: makeDoc('visible') });
    await lock.enable();
    await lock.disable();
    expect(sentinels[0].release).toHaveBeenCalled();
    expect(lock.isActive()).toBe(false);
  });

  it('화면이 숨겨져 자동 해제되면 다시 보일 때 재요청한다(백그라운드 복귀)', async () => {
    const sentinels: ReturnType<typeof makeSentinel>[] = [];
    const { nav, request } = makeNav(sentinels);
    const doc = makeDoc('visible');
    const lock = createScreenWakeLock({ nav, doc });
    await lock.enable();
    expect(lock.isActive()).toBe(true);

    // 화면 숨김: 브라우저가 잠금을 자동 해제.
    sentinels[0].fireRelease();
    doc.set('hidden');
    expect(lock.isActive()).toBe(false);

    // 다시 보이면 재요청.
    doc.set('visible');
    await Promise.resolve(); // acquire의 await 소진
    expect(request).toHaveBeenCalledTimes(2);
    expect(lock.isActive()).toBe(true);
  });

  it('숨겨진 상태에서 enable하면 아직 요청하지 않고, 보일 때 요청한다', async () => {
    const { nav, request } = makeNav();
    const doc = makeDoc('hidden');
    const lock = createScreenWakeLock({ nav, doc });
    await lock.enable();
    expect(request).not.toHaveBeenCalled();
    expect(lock.isActive()).toBe(false);

    doc.set('visible');
    await Promise.resolve();
    expect(request).toHaveBeenCalledTimes(1);
    expect(lock.isActive()).toBe(true);
  });

  it('요청이 거부(reject)돼도 throw하지 않고 비활성으로 남는다', async () => {
    const request = vi.fn(async () => {
      throw new Error('NotAllowedError');
    });
    const lock = createScreenWakeLock({ nav: { wakeLock: { request } }, doc: makeDoc('visible') });
    await expect(lock.enable()).resolves.toBeUndefined();
    expect(lock.isActive()).toBe(false);
  });

  it('disable 후에는 visibility 변화에 재요청하지 않는다(리스너 정리)', async () => {
    const { nav, request } = makeNav();
    const doc = makeDoc('visible');
    const lock = createScreenWakeLock({ nav, doc });
    await lock.enable();
    await lock.disable();
    request.mockClear();
    doc.set('hidden');
    doc.set('visible');
    await Promise.resolve();
    expect(request).not.toHaveBeenCalled();
  });
});
