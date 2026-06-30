import { describe, expect, it, vi } from 'vitest';
import { createShare, getShareLocation, isShareApiConfigured, updateShareLocation } from './shareSession';

const BASE = 'https://share.test';

describe('createShare', () => {
  it('1~3시간만 허용', async () => {
    await expect(createShare(6 as 1, { baseUrl: BASE, fetchImpl: vi.fn() })).rejects.toThrow('1, 2, 3시간');
  });

  it('expires_in_hours로 POST 하고 snake_case 응답을 camelCase로 변환', async () => {
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      new Response(JSON.stringify({ token: 'tok', owner_secret: 'sek', share_url: 'https://share.test/share/tok', expires_at: '2026-06-19T10:00:00Z' }), { status: 200 }),
    );
    const res = await createShare(2, { baseUrl: BASE, fetchImpl });
    expect(res).toEqual({ token: 'tok', ownerSecret: 'sek', shareUrl: 'https://share.test/share/tok', expiresAt: '2026-06-19T10:00:00Z' });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe(`${BASE}/share/create`);
    expect(JSON.parse((init?.body as string) ?? '{}')).toEqual({ expires_in_hours: 2 });
  });

  it('응답에 token이 없으면 throw', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ share_url: 'x', expires_at: 'y' }), { status: 200 }));
    await expect(createShare(1, { baseUrl: BASE, fetchImpl })).rejects.toThrow('token');
  });
});

describe('updateShareLocation', () => {
  it('유효 좌표를 POST 한다', async () => {
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify({ updated_at: '2026-06-19T09:00:00Z' }), { status: 200 }));
    const res = await updateShareLocation('tok', { lat: 37.5, lng: 127 }, { baseUrl: BASE, fetchImpl });
    expect(res.updatedAt).toBe('2026-06-19T09:00:00Z');
    expect(fetchImpl.mock.calls[0][0]).toBe(`${BASE}/share/tok/location`);
  });

  it('owner_secret(쓰기 비밀)을 본문에 함께 전송', async () => {
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify({ updated_at: '2026-06-19T09:00:00Z' }), { status: 200 }));
    await updateShareLocation('tok', { lat: 37.5, lng: 127 }, { baseUrl: BASE, fetchImpl, ownerSecret: 'sek' });
    const body = JSON.parse((fetchImpl.mock.calls[0][1]?.body as string) ?? '{}');
    expect(body).toEqual({ lat: 37.5, lng: 127, owner_secret: 'sek' });
  });

  it('잘못된 좌표는 호출 전 차단', async () => {
    await expect(updateShareLocation('tok', { lat: 999, lng: 127 }, { baseUrl: BASE, fetchImpl: vi.fn() })).rejects.toThrow('좌표');
  });

  it('빈 토큰은 호출 전 차단', async () => {
    const fetchImpl = vi.fn();
    await expect(updateShareLocation('   ', { lat: 37.5, lng: 127 }, { baseUrl: BASE, fetchImpl })).rejects.toThrow('토큰');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('404(만료/없는 토큰)는 공유 중단 신호로 throw', async () => {
    const fetchImpl = vi.fn(async () => new Response('', { status: 404 }));
    await expect(updateShareLocation('tok', { lat: 37.5, lng: 127 }, { baseUrl: BASE, fetchImpl })).rejects.toThrow('만료');
  });
});

describe('getShareLocation', () => {
  it('정상 위치를 파싱', async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ lat: 37.5, lng: 127, updated_at: '2026-06-19T09:00:00Z', expired: false }), { status: 200 }),
    );
    await expect(getShareLocation('tok', { baseUrl: BASE, fetchImpl })).resolves.toEqual({
      lat: 37.5,
      lng: 127,
      updatedAt: '2026-06-19T09:00:00Z',
      expired: false,
    });
  });

  it('만료 응답(expired:true)을 표면화', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ expired: true, lat: null, lng: null }), { status: 200 }));
    const res = await getShareLocation('tok', { baseUrl: BASE, fetchImpl });
    expect(res.expired).toBe(true);
    expect(res.lat).toBeNull();
  });

  it('위치 미수신(lat null)은 waiting 신호', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ expired: false, lat: null, lng: null, updated_at: null }), { status: 200 }));
    const res = await getShareLocation('tok', { baseUrl: BASE, fetchImpl });
    expect(res.expired).toBe(false);
    expect(res.lat).toBeNull();
  });

  it('lat/lng 중 하나만 유효하면 좌표쌍 전체를 미수신으로 취급', async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ expired: false, lat: 37.5, lng: null, updated_at: '2026-06-19T09:00:00Z' }), { status: 200 }),
    );

    await expect(getShareLocation('tok', { baseUrl: BASE, fetchImpl })).resolves.toEqual({
      lat: null,
      lng: null,
      updatedAt: '2026-06-19T09:00:00Z',
      expired: false,
    });
  });

  it('404는 만료로 간주', async () => {
    const fetchImpl = vi.fn(async () => new Response('', { status: 404 }));
    await expect(getShareLocation('tok', { baseUrl: BASE, fetchImpl })).resolves.toMatchObject({ expired: true });
  });

  it('빈 토큰은 호출 전 차단', async () => {
    const fetchImpl = vi.fn();
    await expect(getShareLocation('', { baseUrl: BASE, fetchImpl })).rejects.toThrow('토큰');
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('isShareApiConfigured', () => {
  it('baseUrl이 있으면 true', () => {
    expect(isShareApiConfigured(BASE)).toBe(true);
  });
});
