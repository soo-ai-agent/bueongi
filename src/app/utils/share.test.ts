import { describe, it, expect, vi, afterEach } from 'vitest';
import { isUserCancelledShare, shareOrCopyText, buildEmergencyShareText } from './share';

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
