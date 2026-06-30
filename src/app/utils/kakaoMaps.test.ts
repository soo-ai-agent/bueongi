import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  __resetKakaoMapsLoaderForTest,
  getKakaoJsKey,
  isKakaoMapsReady,
  loadKakaoMaps,
} from './kakaoMaps';

type TestScriptElement = {
  dataset: Record<string, string>;
  async?: boolean;
  src?: string;
  onload: (() => void) | null;
  onerror: (() => void) | null;
};

function createTestScript(): TestScriptElement {
  return { dataset: {}, onload: null, onerror: null };
}

function fireScriptLoad(script: TestScriptElement): void {
  expect(script.onload).toEqual(expect.any(Function));
  script.onload?.();
}

function fireScriptError(script: TestScriptElement): void {
  expect(script.onerror).toEqual(expect.any(Function));
  script.onerror?.();
}

// vitest 환경은 node(브라우저 전역 없음)이므로 window/document를 stubGlobal로 주입해
// SDK 로더 계약을 검증한다(triplan loadKakaoMaps 계약과 동형).
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  __resetKakaoMapsLoaderForTest();
});

describe('getKakaoJsKey', () => {
  it('VITE_KAKAO_JS_KEY를 읽고, 미설정이면 빈 문자열', () => {
    vi.stubEnv('VITE_KAKAO_JS_KEY', 'js-key-123');
    expect(getKakaoJsKey()).toBe('js-key-123');
  });
});

describe('loadKakaoMaps', () => {
  it('비브라우저(window 없음)에서는 스크립트를 만들지 않고 false', async () => {
    // node 기본: window/document 전역이 없다.
    await expect(loadKakaoMaps()).resolves.toBe(false);
  });

  it('이미 Kakao Maps SDK가 로드되어 있으면 즉시 true', async () => {
    vi.stubGlobal('window', { kakao: { maps: { Map: vi.fn() } } });
    vi.stubGlobal('document', { querySelector: vi.fn(() => null) });
    expect(isKakaoMapsReady()).toBe(true);
    await expect(loadKakaoMaps()).resolves.toBe(true);
  });

  it('JS 키가 없으면 스크립트를 만들지 않고 false', async () => {
    vi.stubEnv('VITE_KAKAO_JS_KEY', '');
    const createElement = vi.fn();
    vi.stubGlobal('window', {});
    vi.stubGlobal('document', { querySelector: vi.fn(() => null), createElement, head: { appendChild: vi.fn() } });

    await expect(loadKakaoMaps()).resolves.toBe(false);
    expect(createElement).not.toHaveBeenCalled();
  });

  it('키가 있으면 dapi.kakao.com 스크립트를 주입하고, onload+maps.load 완료 시 true', async () => {
    vi.stubEnv('VITE_KAKAO_JS_KEY', 'js-key-123');

    const script = createTestScript();
    const appendChild = vi.fn();
    const kakao = { maps: { load: (cb: () => void) => cb() } };
    vi.stubGlobal('window', {
      kakao,
      setTimeout: vi.fn(() => 1),
      clearTimeout: vi.fn(),
    });
    vi.stubGlobal('document', {
      querySelector: vi.fn(() => null),
      createElement: vi.fn(() => script),
      head: { appendChild },
    });

    const promise = loadKakaoMaps();
    // 스크립트가 주입되고 autoload=false로 dapi SDK를 가리킨다.
    expect(appendChild).toHaveBeenCalledWith(script);
    expect(script.src).toContain('dapi.kakao.com/v2/maps/sdk.js');
    expect(script.src).toContain('appkey=js-key-123');
    expect(script.src).toContain('autoload=false');

    // 브라우저가 스크립트를 로드한 것을 시뮬레이션.
    fireScriptLoad(script);
    await expect(promise).resolves.toBe(true);
  });

  it('스크립트 onerror 시 false로 폴백하고 재시도가 가능하다', async () => {
    vi.stubEnv('VITE_KAKAO_JS_KEY', 'js-key-123');
    const script = createTestScript();
    vi.stubGlobal('window', { setTimeout: vi.fn(() => 1), clearTimeout: vi.fn() });
    vi.stubGlobal('document', {
      querySelector: vi.fn(() => null),
      createElement: vi.fn(() => script),
      head: { appendChild: vi.fn() },
    });

    const promise = loadKakaoMaps();
    fireScriptError(script);
    await expect(promise).resolves.toBe(false);
  });

  it('기존 스크립트가 있지만 SDK ready 신호가 없으면 타임아웃 후 false로 폴백한다', async () => {
    vi.useFakeTimers();
    vi.stubEnv('VITE_KAKAO_JS_KEY', 'js-key-123');
    const existingScript = { addEventListener: vi.fn() };
    vi.stubGlobal('window', {
      setTimeout: globalThis.setTimeout,
      clearTimeout: globalThis.clearTimeout,
    });
    vi.stubGlobal('document', {
      querySelector: vi.fn(() => existingScript),
      createElement: vi.fn(),
      head: { appendChild: vi.fn() },
    });

    const promise = loadKakaoMaps();

    expect(existingScript.addEventListener).toHaveBeenCalledWith('load', expect.any(Function), {
      once: true,
    });
    expect(existingScript.addEventListener).toHaveBeenCalledWith('error', expect.any(Function), {
      once: true,
    });

    await vi.advanceTimersByTimeAsync(8000);
    await expect(promise).resolves.toBe(false);
  });
});
