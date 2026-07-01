/**
 * 온보딩 퍼널 계측(로컬). 백엔드 분석 파이프라인 없이도 "보호자 등록률"을 산출할 수 있도록
 * 온보딩 단계 이벤트 카운트를 localStorage 에 누적한다. 나중에 서버 분석으로 옮겨도
 * getOnboardingMetrics()/guardianRegistrationRate() 계약은 그대로 재사용할 수 있다.
 *
 * 개인정보(이름/번호)는 담지 않는다 — 발생 횟수와 최초/최근 시각만 기록한다.
 */

export type OnboardingEvent =
  | 'onboarding_started'
  | 'location_permission_granted'
  | 'location_permission_denied'
  | 'location_permission_skipped'
  | 'guardian_registered'
  | 'guardian_skipped'
  | 'onboarding_completed';

const ONBOARDING_EVENTS: readonly OnboardingEvent[] = [
  'onboarding_started',
  'location_permission_granted',
  'location_permission_denied',
  'location_permission_skipped',
  'guardian_registered',
  'guardian_skipped',
  'onboarding_completed',
];

export interface OnboardingMetrics {
  counts: Record<OnboardingEvent, number>;
  firstAt: number | null;
  lastAt: number | null;
}

const METRICS_KEY = 'bueongi-onboarding-metrics-v1';

function emptyCounts(): Record<OnboardingEvent, number> {
  return ONBOARDING_EVENTS.reduce(
    (acc, e) => {
      acc[e] = 0;
      return acc;
    },
    {} as Record<OnboardingEvent, number>,
  );
}

function emptyMetrics(): OnboardingMetrics {
  return { counts: emptyCounts(), firstAt: null, lastAt: null };
}

/** 저장된 계측을 읽는다. 파싱 실패/미저장/비영속 환경은 빈 계측으로 안전 폴백. */
export function getOnboardingMetrics(): OnboardingMetrics {
  try {
    const raw = localStorage.getItem(METRICS_KEY);
    if (!raw) return emptyMetrics();
    const parsed = JSON.parse(raw) as Partial<OnboardingMetrics>;
    const counts = emptyCounts();
    const saved = (parsed.counts ?? {}) as Partial<Record<OnboardingEvent, unknown>>;
    for (const e of ONBOARDING_EVENTS) {
      const v = saved[e];
      counts[e] = typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : 0;
    }
    return {
      counts,
      firstAt: typeof parsed.firstAt === 'number' ? parsed.firstAt : null,
      lastAt: typeof parsed.lastAt === 'number' ? parsed.lastAt : null,
    };
  } catch {
    return emptyMetrics();
  }
}

/**
 * 온보딩 이벤트 1건을 계측에 누적한다(저장 실패는 무해 — 계측은 부가 기능이라 흐름을 막지 않는다).
 * now 는 테스트에서 시계를 고정하려고 주입 가능(기본 Date.now()).
 */
export function recordOnboardingEvent(event: OnboardingEvent, now: number = Date.now()): void {
  try {
    const metrics = getOnboardingMetrics();
    metrics.counts[event] = (metrics.counts[event] ?? 0) + 1;
    metrics.firstAt = metrics.firstAt ?? now;
    metrics.lastAt = now;
    localStorage.setItem(METRICS_KEY, JSON.stringify(metrics));
  } catch {
    /* 비영속 무해 */
  }
}

/**
 * 보호자 등록률 = guardian_registered / onboarding_completed (0~1). 완료 이벤트가 없으면 null.
 * "온보딩을 마친 사용자 중 보호자를 1명 이상 등록한 비율"을 뜻한다.
 */
export function guardianRegistrationRate(metrics: OnboardingMetrics = getOnboardingMetrics()): number | null {
  const completed = metrics.counts.onboarding_completed;
  if (!completed) return null;
  return metrics.counts.guardian_registered / completed;
}
