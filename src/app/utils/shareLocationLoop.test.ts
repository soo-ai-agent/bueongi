import { describe, it, expect, vi } from 'vitest';
import { sendShareLocationOnce, startShareLocationLoop } from './shareLocationLoop';
import { ShareExpiredError } from './shareSession';

const BASE = 'https://share.example';
const LOC = { lat: 37.5, lng: 127.0 };

/** 즉시 tick의 비동기 체인(getLocation→fetch→json)을 끝까지 비운다. */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function okFetch() {
  return vi.fn(async () => new Response(JSON.stringify({ updated_at: '2026-06-19T09:00:00Z' }), { status: 200 }));
}

describe('sendShareLocationOnce', () => {
  it('유효 좌표를 받으면 서버로 전송하고 sent를 반환', async () => {
    const fetchImpl = okFetch();
    const res = await sendShareLocationOnce('tok', { baseUrl: BASE, fetchImpl, getLocation: () => LOC });
    expect(res).toEqual({ status: 'sent', location: LOC });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(String((fetchImpl.mock.calls as unknown as unknown[][])[0][0])).toContain('/share/tok/location');
  });

  it('위치를 못 얻으면(null) 전송하지 않고 skip', async () => {
    const fetchImpl = okFetch();
    const res = await sendShareLocationOnce('tok', { baseUrl: BASE, fetchImpl, getLocation: () => null });
    expect(res).toEqual({ status: 'skipped', reason: 'no-location' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('getLocation이 throw하면(권한 거부 등) 루프를 끊지 않고 skip', async () => {
    const fetchImpl = okFetch();
    const res = await sendShareLocationOnce('tok', {
      baseUrl: BASE,
      fetchImpl,
      getLocation: () => Promise.reject(new Error('permission denied')),
    });
    expect(res).toEqual({ status: 'skipped', reason: 'no-location' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('무효 좌표는 invalid-location으로 skip', async () => {
    const fetchImpl = okFetch();
    const res = await sendShareLocationOnce('tok', {
      baseUrl: BASE,
      fetchImpl,
      getLocation: () => ({ lat: 999, lng: 127 }),
    });
    expect(res).toEqual({ status: 'skipped', reason: 'invalid-location' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('서버 만료(404→ShareExpiredError)는 expired로 분류', async () => {
    const fetchImpl = vi.fn(async () => new Response('', { status: 404 }));
    const res = await sendShareLocationOnce('tok', { baseUrl: BASE, fetchImpl, getLocation: () => LOC });
    expect(res).toEqual({ status: 'expired' });
  });

  it('일시적 네트워크 오류는 error로 분류(루프는 계속)', async () => {
    const fetchImpl = vi.fn(async () => new Response('', { status: 503 }));
    const res = await sendShareLocationOnce('tok', { baseUrl: BASE, fetchImpl, getLocation: () => LOC });
    expect(res.status).toBe('error');
  });
});

describe('startShareLocationLoop', () => {
  it('진입 즉시 1회 전송하고 onSent 콜백을 호출', async () => {
    const fetchImpl = okFetch();
    const onSent = vi.fn();
    const handle = startShareLocationLoop('tok', { baseUrl: BASE, fetchImpl, getLocation: () => LOC, onSent });
    await flush();
    handle.stop();
    expect(onSent).toHaveBeenCalledWith(LOC);
    expect(handle.isRunning()).toBe(false);
  });

  it('만료를 받으면 onExpired 호출 후 스스로 멈춘다', async () => {
    const fetchImpl = vi.fn(async () => new Response('', { status: 404 }));
    const onExpired = vi.fn();
    const handle = startShareLocationLoop('tok', { baseUrl: BASE, fetchImpl, getLocation: () => LOC, onExpired });
    await flush();
    expect(onExpired).toHaveBeenCalledTimes(1);
    expect(handle.isRunning()).toBe(false);
    handle.stop(); // 멱등
  });

  it('stop() 후에는 추가 전송이 일어나지 않는다(멱등)', () => {
    const fetchImpl = okFetch();
    const handle = startShareLocationLoop('tok', { baseUrl: BASE, fetchImpl, getLocation: () => LOC, intervalMs: 10 });
    handle.stop();
    handle.stop();
    expect(handle.isRunning()).toBe(false);
  });
});
