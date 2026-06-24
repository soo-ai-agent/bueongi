import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  isUserCancelledShare,
  shareOrCopyText,
  buildEmergencyShareText,
  buildReturnShareText,
  buildArrivalShareText,
  composeReturnShareMessage,
  composeEmergencyShareMessage,
  composeArrivalShareMessage,
} from './share';

describe('isUserCancelledShare', () => {
  it('사용자 취소(AbortError)는 true → 호출부 조용히 종료', () => {
    expect(isUserCancelledShare(new DOMException('cancelled', 'AbortError'))).toBe(true);
    expect(isUserCancelledShare({ name: 'AbortError' })).toBe(true);
  });

  it('실제 오류는 false → 클립보드 폴백 필요(보호자 미전달 방지)', () => {
    expect(isUserCancelledShare(new DOMException('denied', 'NotAllowedError'))).toBe(false);
    expect(isUserCancelledShare(new DOMException('bad', 'DataError'))).toBe(false);
    expect(isUserCancelledShare(new TypeError('network'))).toBe(false);
    expect(isUserCancelledShare({ name: 'SomethingElse' })).toBe(false);
  });

  it('null/undefined/원시값은 false(안전측: 폴백으로 공유 경로 보장)', () => {
    expect(isUserCancelledShare(null)).toBe(false);
    expect(isUserCancelledShare(undefined)).toBe(false);
    expect(isUserCancelledShare('AbortError')).toBe(false);
    expect(isUserCancelledShare({})).toBe(false);
  });
});

describe('shareOrCopyText', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('Web Share 성공 → shared (클립보드 미사용)', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    const writeText = vi.fn();
    vi.stubGlobal('navigator', { share, clipboard: { writeText } });
    const r = await shareOrCopyText({ title: 't', text: 'msg', url: 'u' });
    expect(r).toBe('shared');
    expect(share).toHaveBeenCalledWith({ title: 't', text: 'msg', url: 'u' });
    expect(writeText).not.toHaveBeenCalled();
  });

  it('사용자 취소(AbortError) → cancelled (폴백 복사 안 함, 거짓 성공 방지)', async () => {
    const share = vi.fn().mockRejectedValue(new DOMException('x', 'AbortError'));
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { share, clipboard: { writeText } });
    const r = await shareOrCopyText({ title: 't', text: 'msg' });
    expect(r).toBe('cancelled');
    expect(writeText).not.toHaveBeenCalled();
  });

  it('실제 오류 → 클립보드 폴백 copied (보호자 전달 경로 보장)', async () => {
    const share = vi.fn().mockRejectedValue(new DOMException('x', 'NotAllowedError'));
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { share, clipboard: { writeText } });
    const r = await shareOrCopyText({ title: 't', text: 'msg', url: 'u' });
    expect(r).toBe('copied');
    expect(writeText).toHaveBeenCalledWith('msg\nu');
  });

  it('Web Share 미지원 → 클립보드 copied', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    const r = await shareOrCopyText({ title: 't', text: 'msg' });
    expect(r).toBe('copied');
    expect(writeText).toHaveBeenCalledWith('msg');
  });

  it('공유·복사 모두 실패 → failed', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('no clipboard'));
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    const r = await shareOrCopyText({ title: 't', text: 'msg' });
    expect(r).toBe('failed');
  });
});

describe('buildEmergencyShareText', () => {
  it('목적지를 반드시 포함한다(수신자가 행선지를 알 수 있도록)', () => {
    const msg = buildEmergencyShareText('강남역 2번 출구');
    expect(msg).toContain('강남역 2번 출구');
    expect(msg).toContain('부엉이 긴급');
    expect(msg).toContain('도움이 필요합니다');
  });

  it('목적지가 비어도 빈 라벨 없이 안전한 기본 문구를 보장', () => {
    expect(buildEmergencyShareText('')).toContain('목적지 미상');
    expect(buildEmergencyShareText('   ')).toContain('목적지 미상');
  });
});

describe('buildReturnShareText', () => {
  it('목적지와 안심귀가 식별 문구를 포함한다', () => {
    const msg = buildReturnShareText('강남역 2번 출구');
    expect(msg).toContain('강남역 2번 출구');
    expect(msg).toContain('부엉이 안심귀가');
  });

  it('목적지가 비면 빈 라벨 없이 기본 라벨로 폴백', () => {
    expect(buildReturnShareText('')).toContain('목적지(으)로 이동 중');
    expect(buildReturnShareText('   ')).toContain('목적지(으)로 이동 중');
  });
});

describe('composeReturnShareMessage', () => {
  it('실시간 위치 링크가 있으면 위치 확인 약속 + 링크를 포함한다', () => {
    const msg = composeReturnShareMessage('강남역', 'https://app.test/share/abc123');
    expect(msg).toContain('강남역(으)로 이동 중');
    expect(msg).toContain('실시간 위치를 확인해 주세요');
    expect(msg).toContain('https://app.test/share/abc123');
  });

  it('링크가 없으면(공유 서버 미설정) 깨진 링크·거짓 위치 약속 없이 이동 사실만 정직하게 전한다', () => {
    const msg = composeReturnShareMessage('강남역', null);
    expect(msg).toContain('강남역(으)로 이동 중');
    // 보낼 수 있는 실시간 위치가 없으므로 거짓 약속/링크를 넣지 않는다.
    expect(msg).not.toContain('실시간 위치를 확인해 주세요');
    expect(msg).not.toContain('http');
    expect(msg).not.toContain('/share');
  });

  it('빈 문자열 링크도 링크 없음으로 취급(깨진 링크 방지)', () => {
    const msg = composeReturnShareMessage('강남역', '   ');
    expect(msg).not.toContain('실시간 위치를 확인해 주세요');
  });

  it('목적지가 비면 기본 라벨로 폴백', () => {
    expect(composeReturnShareMessage('', null)).toContain('목적지(으)로 이동 중');
    expect(composeReturnShareMessage('   ', 'https://app.test/share/x')).toContain('목적지(으)로 이동 중');
  });
});

describe('buildArrivalShareText', () => {
  it('귀가 완료 식별 문구 + 목적지를 포함한다(보호자가 도착지를 알 수 있도록)', () => {
    const msg = buildArrivalShareText('강남역 2번 출구');
    expect(msg).toContain('강남역 2번 출구');
    expect(msg).toContain('부엉이 안심귀가');
    expect(msg).toContain('안전하게 도착');
  });

  it('목적지가 비면 빈 라벨 없이 기본 라벨로 폴백(깨진/거짓 위치 방지)', () => {
    expect(buildArrivalShareText('')).toBe('[부엉이 안심귀가] 목적지에 안전하게 도착했습니다.');
    expect(buildArrivalShareText('   ')).toBe('[부엉이 안심귀가] 목적지에 안전하게 도착했습니다.');
  });
});

describe('composeEmergencyShareMessage', () => {
  it('실시간 위치 링크가 있으면 긴급 메시지 + 링크를 포함한다', () => {
    const msg = composeEmergencyShareMessage('강남역', 'https://app.test/share/abc123');
    expect(msg).toContain('도움이 필요합니다');
    expect(msg).toContain('강남역');
    expect(msg).toContain('https://app.test/share/abc123');
  });

  it('링크가 없으면 깨진 링크 없이 긴급 메시지만 보낸다(토큰 없는 /share 미전송)', () => {
    const msg = composeEmergencyShareMessage('강남역', null);
    expect(msg).toContain('도움이 필요합니다');
    expect(msg).toContain('강남역');
    // 토큰 없는 /share는 발신자 본인 화면으로 라우팅 → 보호자에게 깨진 링크 금지.
    expect(msg).not.toContain('http');
    expect(msg).not.toContain('/share');
  });

  it('빈 문자열 링크도 링크 없음으로 취급(깨진 링크 방지)', () => {
    const msg = composeEmergencyShareMessage('강남역', '   ');
    expect(msg).not.toContain('http');
    expect(msg).not.toContain('/share');
  });

  it('목적지가 비면 기본 라벨로 폴백', () => {
    expect(composeEmergencyShareMessage('', null)).toContain('목적지 미상');
  });
});

describe('composeArrivalShareMessage', () => {
  it('실시간 위치 링크가 있으면 귀가 완료 메시지 + 링크를 포함한다', () => {
    const msg = composeArrivalShareMessage('강남역', 'https://app.test/share/abc123');
    expect(msg).toContain('안전하게 도착');
    expect(msg).toContain('강남역');
    expect(msg).toContain('https://app.test/share/abc123');
  });

  it('링크가 없으면 깨진 링크 없이 귀가 완료 메시지만 보낸다', () => {
    const msg = composeArrivalShareMessage('강남역', null);
    expect(msg).toContain('안전하게 도착');
    expect(msg).toContain('강남역');
    expect(msg).not.toContain('http');
    expect(msg).not.toContain('/share');
  });

  it('목적지가 비면 기본 라벨로 폴백', () => {
    expect(composeArrivalShareMessage('', null)).toBe('[부엉이 안심귀가] 목적지에 안전하게 도착했습니다.');
  });
});
