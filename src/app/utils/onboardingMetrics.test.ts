import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  recordOnboardingEvent,
  getOnboardingMetrics,
  guardianRegistrationRate,
} from './onboardingMetrics';

// 누적 동작을 검증하려면 실제로 값을 보관하는 Map 백엔드 localStorage 목이 필요하다.
function memoryLocalStorage() {
  const store = new Map<string, string>();
  return {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
  };
}

describe('onboardingMetrics', () => {
  beforeEach(() => vi.stubGlobal('localStorage', memoryLocalStorage()));
  afterEach(() => vi.unstubAllGlobals());

  it('미기록이면 빈 계측(모든 카운트 0, rate null)', () => {
    const m = getOnboardingMetrics();
    expect(m.counts.onboarding_started).toBe(0);
    expect(m.counts.guardian_registered).toBe(0);
    expect(m.firstAt).toBeNull();
    expect(guardianRegistrationRate(m)).toBeNull();
  });

  it('이벤트를 누적하고 first/last 시각을 기록한다', () => {
    recordOnboardingEvent('onboarding_started', 1000);
    recordOnboardingEvent('guardian_registered', 2000);
    recordOnboardingEvent('guardian_registered', 3000);
    const m = getOnboardingMetrics();
    expect(m.counts.onboarding_started).toBe(1);
    expect(m.counts.guardian_registered).toBe(2);
    expect(m.firstAt).toBe(1000);
    expect(m.lastAt).toBe(3000);
  });

  it('보호자 등록률 = guardian_registered / onboarding_completed', () => {
    // 완료 4명 중 3명 등록 → 0.75.
    recordOnboardingEvent('onboarding_completed');
    recordOnboardingEvent('onboarding_completed');
    recordOnboardingEvent('onboarding_completed');
    recordOnboardingEvent('onboarding_completed');
    recordOnboardingEvent('guardian_registered');
    recordOnboardingEvent('guardian_registered');
    recordOnboardingEvent('guardian_registered');
    expect(guardianRegistrationRate()).toBeCloseTo(0.75, 5);
  });

  it('완료 이벤트가 없으면 등록률은 null(0 나눗셈 방지)', () => {
    recordOnboardingEvent('guardian_registered');
    expect(guardianRegistrationRate()).toBeNull();
  });

  it('localStorage 접근 불가여도 throw하지 않고 빈 계측으로 폴백', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    });
    expect(() => recordOnboardingEvent('onboarding_started')).not.toThrow();
    expect(getOnboardingMetrics().counts.onboarding_started).toBe(0);
  });
});
