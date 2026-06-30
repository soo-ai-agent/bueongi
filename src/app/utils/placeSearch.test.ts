import { describe, it, expect, vi } from 'vitest';
import { getApiErrorUserMessage } from './apiError';
import { fetchPlaces, filterPlaces, kakaoPlaceToDestination, searchPlacesWithFallback } from './placeSearch';
import type { Destination } from '../store/appStore';

const catalog: Destination[] = [
  { name: '강남역 2번 출구', address: '서울 강남구 강남대로 396', lat: 37.4979, lng: 127.0276 },
  { name: '역삼역 3번 출구', address: '서울 강남구 테헤란로', lat: 37.5008, lng: 127.0369 },
  { name: 'Starbucks 신사점', address: '서울 강남구 도산대로', lat: 37.5228, lng: 127.0219 },
];

describe('filterPlaces', () => {
  it('빈 검색어는 빈 배열 (최근 검색 노출을 호출부에 위임)', () => {
    expect(filterPlaces(catalog, '')).toEqual([]);
    expect(filterPlaces(catalog, '   ')).toEqual([]);
  });

  it('이름 부분일치', () => {
    const r = filterPlaces(catalog, '강남역');
    expect(r).toHaveLength(1);
    expect(r[0].name).toBe('강남역 2번 출구');
  });

  it('주소 부분일치', () => {
    const r = filterPlaces(catalog, '테헤란로');
    expect(r.map((p) => p.name)).toEqual(['역삼역 3번 출구']);
  });

  it('앞뒤 공백을 트림한 뒤 매칭', () => {
    expect(filterPlaces(catalog, '  역삼  ')).toHaveLength(1);
  });

  it('라틴 대소문자를 무시', () => {
    expect(filterPlaces(catalog, 'starbucks')).toHaveLength(1);
  });

  it('미일치는 빈 배열', () => {
    expect(filterPlaces(catalog, '부산')).toEqual([]);
  });

  it('검색 결과는 백엔드 PlaceItem 좌표를 보존한다', () => {
    const [result] = filterPlaces(catalog, '강남역');
    expect(result).toMatchObject({ lat: 37.4979, lng: 127.0276 });
  });
});

describe('fetchPlaces', () => {
  it('백엔드 PlaceItem 응답을 Destination으로 변환하며 좌표를 보존한다', async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify([
          { name: '선릉역 1번 출구', address: '서울 강남구 선릉로', lat: 37.5045, lng: 127.049 },
        ]),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    const results = await fetchPlaces('  선릉  ', { fetchImpl, endpoint: '/api/places/search' });

    expect(fetchImpl).toHaveBeenCalledWith('/api/places/search?keyword=%EC%84%A0%EB%A6%89', {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: undefined,
    });
    expect(results).toEqual([
      { name: '선릉역 1번 출구', address: '서울 강남구 선릉로', lat: 37.5045, lng: 127.049 },
    ]);
  });

  it('빈 검색어는 네트워크 호출 없이 빈 배열', async () => {
    const fetchImpl = vi.fn();
    await expect(fetchPlaces('   ', { fetchImpl })).resolves.toEqual([]);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('잘못된 item shape이나 좌표 범위 밖 PlaceItem은 버리고 유효한 PlaceItem만 유지한다', async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify([
          { name: '강남역', address: '서울 강남구', lat: 37.4979, lng: 127.0276 },
          { name: '좌표 없음', address: '서울 강남구' },
          { name: '문자 좌표', address: '서울 강남구', lat: '37.5', lng: 127.03 },
          { name: '위도 범위 밖', address: '서울 강남구', lat: 91, lng: 127.03 },
          { name: '경도 범위 밖', address: '서울 강남구', lat: 37.5, lng: 180.1 },
        ]),
      ),
    );

    await expect(fetchPlaces('강남', { fetchImpl })).resolves.toEqual([
      { name: '강남역', address: '서울 강남구', lat: 37.4979, lng: 127.0276 },
    ]);
  });

  it('비배열 응답은 계약 오류로 reject 한다', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ name: '강남역' }), { status: 200 }));

    await expect(fetchPlaces('강남', { fetchImpl })).rejects.toThrow('Place search response must be an array');
  });

  it('서버 오류는 호출부가 폴백할 수 있도록 reject 한다', async () => {
    const fetchImpl = vi.fn(async () => new Response('fail', { status: 500 }));
    await expect(fetchPlaces('강남', { fetchImpl })).rejects.toThrow('Place search failed: 500');
  });

  it('잘못된 요청 응답은 표준 사용자 안내로 매핑할 수 있다', async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ code: 'MALFORMED_REQUEST' }), { status: 400 }),
    );

    const error = await fetchPlaces('강남', { fetchImpl }).catch((caught: unknown) => caught);

    expect(error).toMatchObject({
      name: 'ApiError',
      status: 400,
      code: 'MALFORMED_REQUEST',
    });
    expect(getApiErrorUserMessage(error, '장소 검색에 실패했어요.')).toBe(
      '요청 형식이 올바르지 않아요. 다시 시도해 주세요.',
    );
  });
});

describe('searchPlacesWithFallback', () => {
  it('Kakao SDK 미가용(테스트 env) + API 실패 시 mock 카탈로그로 폴백한다', async () => {
    // 테스트 env에는 Kakao 지도 SDK가 없어 searchPlacesViaKakao 가 null → 백엔드 → 카탈로그 순.
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('network down');
    });

    await expect(searchPlacesWithFallback('강남역', catalog, { fetchImpl })).resolves.toEqual([
      { name: '강남역 2번 출구', address: '서울 강남구 강남대로 396', lat: 37.4979, lng: 127.0276 },
    ]);
  });

  it('Kakao SDK 미가용 시 백엔드 결과를 우선 반환한다', async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify([{ name: '백엔드결과', address: '서울 어딘가', lat: 37.5, lng: 127.0 }]),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    await expect(searchPlacesWithFallback('강남', catalog, { fetchImpl })).resolves.toEqual([
      { name: '백엔드결과', address: '서울 어딘가', lat: 37.5, lng: 127.0 },
    ]);
  });
});

describe('kakaoPlaceToDestination', () => {
  it('Kakao Local 장소를 Destination으로 변환(도로명 우선, x=lng/y=lat)', () => {
    expect(
      kakaoPlaceToDestination({
        place_name: '스타벅스 강남대로점',
        road_address_name: '서울 강남구 강남대로 123',
        address_name: '서울 강남구 역삼동 1',
        x: '127.0276',
        y: '37.4979',
      }),
    ).toEqual({
      name: '스타벅스 강남대로점',
      address: '서울 강남구 강남대로 123',
      lat: 37.4979,
      lng: 127.0276,
    });
  });

  it('도로명 없으면 지번 주소로 폴백', () => {
    const d = kakaoPlaceToDestination({
      place_name: '어떤가게',
      address_name: '서울 강남구 역삼동 7',
      x: '127.03',
      y: '37.50',
    });
    expect(d?.address).toBe('서울 강남구 역삼동 7');
  });

  it('이름 없거나 좌표 비정상이면 null', () => {
    expect(kakaoPlaceToDestination({ place_name: '', x: '127', y: '37' })).toBeNull();
    expect(kakaoPlaceToDestination({ place_name: 'x', x: 'NaN', y: '37' })).toBeNull();
    expect(kakaoPlaceToDestination({ place_name: 'x', x: '999', y: '37' })).toBeNull();
  });
});
