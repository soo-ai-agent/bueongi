import { describe, expect, it, vi } from 'vitest';
import { ApiError, getApiErrorUserMessage } from './apiError';
import { buildSafeCompareRequest, fetchSafeCompare, SAFE_COMPARE_ENDPOINT } from './safeCompare';
import type { Destination } from '../store/appStore';

const destination: Destination = {
  name: '홍대입구역',
  address: '서울 마포구 양화로',
  lat: 37.5572,
  lng: 126.9245,
};

const origin = { lat: 37.4979, lng: 127.0276 };

describe('buildSafeCompareRequest', () => {
  it('safetyPreference 미지정 시 키를 보내지 않는다(백엔드 기본값에 위임)', () => {
    expect(buildSafeCompareRequest(destination, origin)).toEqual({
      origin,
      destination: { lat: 37.5572, lng: 126.9245, name: '홍대입구역' },
    });
  });

  it('safetyPreference를 body에 더한다', () => {
    expect(buildSafeCompareRequest(destination, origin, 'safest')).toEqual({
      origin,
      destination: { lat: 37.5572, lng: 126.9245, name: '홍대입구역' },
      safetyPreference: 'safest',
    });
  });
});

describe('fetchSafeCompare', () => {
  it('POST /api/routes/safe-compare로 호출하고 path/steps/score/markers를 파싱한다', async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify([
          {
            id: 'safe-0',
            name: '안심 경로',
            time: '24분',
            dist: '1.2km',
            desc: '안전 점수 88점',
            type: 'safe',
            tags: [{ text: '안심', variant: 'mint' }],
            path: [
              { lat: 37.5, lng: 127.0 },
              { lat: 37.4979, lng: 127.0276 },
            ],
            steps: [
              { index: 0, lat: 37.5, lng: 127.0, description: '출발', turnType: 211, distanceM: 100, timeS: 60, pointType: 'SP' },
            ],
            score: 88,
            markers: [
              { type: 'start', x: 12, y: 88, lat: 37.5, lng: 127.0 },
              { type: 'cctv', x: 40, y: 50, lat: 37.499, lng: 127.01, name: '구청앞 CCTV' },
              { type: 'end', x: 88, y: 12, lat: 37.4979, lng: 127.0276 },
            ],
          },
        ]),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    const routes = await fetchSafeCompare(destination, origin, { fetchImpl, safetyPreference: 'safe' });

    expect(routes).toHaveLength(1);
    expect(routes[0].score).toBe(88);
    expect(routes[0].path).toEqual([
      { lat: 37.5, lng: 127.0 },
      { lat: 37.4979, lng: 127.0276 },
    ]);
    expect(routes[0].steps?.[0]).toMatchObject({ index: 0, turnType: 211, pointType: 'SP' });
    expect(routes[0].markers).toHaveLength(3);
    expect(routes[0].markers?.[1]).toEqual({ type: 'cctv', x: 40, y: 50, lat: 37.499, lng: 127.01, name: '구청앞 CCTV' });

    expect(fetchImpl).toHaveBeenCalledWith(SAFE_COMPARE_ENDPOINT, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        origin,
        destination: { lat: 37.5572, lng: 126.9245, name: '홍대입구역' },
        safetyPreference: 'safe',
      }),
      signal: undefined,
    });
  });

  it('계약 밖 필드(잘못된 score/marker/step)는 버리고 유효 항목만 남긴다', async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify([
          {
            id: 'safe-0',
            name: '안심 경로',
            time: '24분',
            dist: '1.2km',
            desc: 'd',
            type: 'safe',
            tags: [],
            score: 250, // 0~100 밖 → 무시
            path: 'not-an-array', // 무시
            steps: [{ index: 0 }], // 필수 필드 부족 → 제거되어 steps 자체가 빈 배열 → undefined
            markers: [
              { type: 'bogus', x: 1, y: 1 }, // 잘못된 type → 제거
              { type: 'cctv', x: 2, y: 2 }, // 유효(좌표 없음 허용)
            ],
          },
        ]),
        { status: 200 },
      ),
    );

    const routes = await fetchSafeCompare(destination, origin, { fetchImpl });
    expect(routes[0].score).toBeUndefined();
    expect(routes[0].path).toBeUndefined();
    expect(routes[0].steps).toBeUndefined();
    expect(routes[0].markers).toEqual([{ type: 'cctv', x: 2, y: 2 }]);
  });

  it('빈 배열 응답은 빈 RouteOption[]을 반환한다', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify([]), { status: 200 }));
    await expect(fetchSafeCompare(destination, origin, { fetchImpl })).resolves.toEqual([]);
  });

  it('표준 오류 응답(RFC7807 + code)은 ApiError로 reject 한다', async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ code: 'ORIGIN_REQUIRED', detail: 'origin is required' }), { status: 422 }),
    );

    await expect(fetchSafeCompare(destination, origin, { fetchImpl })).rejects.toMatchObject({
      name: 'ApiError',
      status: 422,
      code: 'ORIGIN_REQUIRED',
    });

    const error = await fetchSafeCompare(destination, origin, { fetchImpl }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ApiError);
    expect(getApiErrorUserMessage(error, '실시간 경로를 불러오지 못해 기본 경로로 안내합니다.')).toBe(
      '현재 위치를 확인한 뒤 다시 시도해 주세요.',
    );
  });

  it('비배열 응답은 계약 오류로 reject 한다', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ id: 'safe' }), { status: 200 }));
    await expect(fetchSafeCompare(destination, origin, { fetchImpl })).rejects.toThrow(
      'Safe route compare response must be an array',
    );
  });

  it('서버 5xx는 fallback 메시지로 reject 한다', async () => {
    const fetchImpl = vi.fn(async () => new Response('fail', { status: 500 }));
    await expect(fetchSafeCompare(destination, origin, { fetchImpl })).rejects.toThrow('Safe route compare failed: 500');
  });
});
