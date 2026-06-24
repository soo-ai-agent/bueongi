import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router';
import { GuardianShare, deriveState, formatUpdatedAt } from './GuardianShare';

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
