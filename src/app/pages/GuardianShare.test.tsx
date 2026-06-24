import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router';
import { GuardianShare, deriveState, formatUpdatedAt, headerSubtitle, isLocationStale } from './GuardianShare';

describe('deriveState', () => {
  it('만료면 expired', () => {
    expect(deriveState({ lat: 37.5, lng: 127, updatedAt: 'x', expired: true })).toBe('expired');
  });

  it('위치 없으면 waiting', () => {
    expect(deriveState({ lat: null, lng: null, updatedAt: null, expired: false })).toBe('waiting');
  });

  it('좌표 있으면 live', () => {
    expect(deriveState({ lat: 37.5, lng: 127, updatedAt: 'x', expired: false })).toBe('live');
  });
});

describe('formatUpdatedAt', () => {
  const now = Date.parse('2026-06-19T09:00:00Z');

  it('위치 없으면 안내 문구', () => {
    expect(formatUpdatedAt(null, now)).toBe('아직 위치 없음');
  });

  it('10초 이내는 방금 전', () => {
    expect(formatUpdatedAt('2026-06-19T08:59:55Z', now)).toBe('방금 전');
  });

  it('10~60초는 초 단위 경과', () => {
    expect(formatUpdatedAt('2026-06-19T08:59:30Z', now)).toBe('30초 전');
  });

  it('분 단위 경과', () => {
    expect(formatUpdatedAt('2026-06-19T08:57:00Z', now)).toBe('3분 전');
  });

  it('시간 단위 경과', () => {
    expect(formatUpdatedAt('2026-06-19T07:00:00Z', now)).toBe('2시간 전');
  });

  it('미래 시각(기기 시계 차이)은 0으로 클램프 → 방금 전', () => {
    expect(formatUpdatedAt('2026-06-19T09:00:05Z', now)).toBe('방금 전');
  });

  it('파싱 불가 시각은 안전 폴백', () => {
    expect(formatUpdatedAt('not-a-date', now)).toBe('갱신 시각 미상');
  });
});

describe('isLocationStale', () => {
  const now = Date.parse('2026-06-19T09:00:00Z');

  it('좌표는 왔으나 갱신 시각이 없으면(=신선도 검증 불가) 보수적으로 stale', () => {
    // deriveState는 좌표만 있으면 updatedAt 없이도 live로 본다 → waiting이 아니다.
    // 타임스탬프가 없으면 위치가 최신인지 확인할 길이 없으므로, 멈췄을 수도 있는 위치를
    // 보호자에게 '실시간'으로 거짓 표기하지 않도록 stale로 내린다(파싱 불가와 동일한 보수 규칙).
    expect(isLocationStale(null, now)).toBe(true);
  });

  it('임계값 이내(최근 갱신)면 stale 아님 → live 유지', () => {
    // 10초 전: 5초 폴링 주기 안에서 정상.
    expect(isLocationStale('2026-06-19T08:59:50Z', now)).toBe(false);
  });

  it('임계값 초과(오래된 갱신)면 stale → live로 거짓표기 금지', () => {
    // 60초 전: 갱신이 끊긴 것으로 보고 실시간 표기를 내린다.
    expect(isLocationStale('2026-06-19T08:59:00Z', now)).toBe(true);
  });

  it('미래 시각(기기 시계 차이)은 stale 아님', () => {
    expect(isLocationStale('2026-06-19T09:00:10Z', now)).toBe(false);
  });

  it('파싱 불가 시각은 신선도 확인 불가 → 보수적으로 stale', () => {
    expect(isLocationStale('not-a-date', now)).toBe(true);
  });

  it('live 응답(좌표 있음)이라도 타임스탬프가 없으면 stale로 내려 거짓 실시간 금지', () => {
    // 거짓-실시간 회귀 가드: deriveState=live + updatedAt=null 조합은 보호자 지도에서
    // active 마커로 떠 '실시간'을 약속하지만, 신선도 근거가 전혀 없다 → stale로 강등돼야 한다.
    const live = deriveState({ lat: 37.5, lng: 127, updatedAt: null, expired: false });
    expect(live).toBe('live');
    expect(isLocationStale(null, now)).toBe(true);
  });
});

describe('headerSubtitle', () => {
  it('live일 때만 "5초마다 갱신"을 약속한다', () => {
    expect(headerSubtitle('live')).toContain('5초마다 갱신');
  });

  it('stale(갱신 끊김)에는 "5초마다 갱신" 거짓 약속을 하지 않는다', () => {
    const sub = headerSubtitle('stale');
    expect(sub).not.toContain('5초마다 갱신');
    expect(sub).toContain('마지막');
  });

  it('expired(종료)에는 갱신 약속 대신 종료를 알린다', () => {
    const sub = headerSubtitle('expired');
    expect(sub).not.toContain('5초마다 갱신');
    expect(sub).toContain('종료');
  });

  it('error(끊김)에는 "5초마다 갱신" 단정 대신 재시도 안내를 한다', () => {
    const sub = headerSubtitle('error');
    expect(sub).not.toContain('5초마다 갱신');
  });

  it('waiting/loading에도 아직 받지 못한 갱신을 단정하지 않는다', () => {
    expect(headerSubtitle('waiting')).not.toContain('5초마다 갱신');
    expect(headerSubtitle('loading')).not.toContain('5초마다 갱신');
  });
});

describe('GuardianShare SSR', () => {
  it('로그인 없이 초기 렌더는 로딩 상태(깨진 지도 대신 안내)', () => {
    const html = renderToString(
      <MemoryRouter initialEntries={['/share/abc123']}>
        <Routes>
          <Route path="/share/:token" element={<GuardianShare />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(html).toContain('guardian-share');
    expect(html).toContain('guardian-loading');
    expect(html).toContain('실시간 위치 공유');
  });
});
