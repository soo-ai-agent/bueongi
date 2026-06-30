import { describe, expect, it, vi } from 'vitest';
import {
  CurrentLocationError,
  getBrowserCurrentLocation,
  getCurrentLocationErrorMessage,
  type GeolocationProvider,
} from './currentLocation';

describe('getBrowserCurrentLocation', () => {
  it('브라우저 geolocation 좌표를 RouteRequest origin 좌표로 변환한다', async () => {
    const geolocation: GeolocationProvider = {
      getCurrentPosition: vi.fn((success) => {
        success({ coords: { latitude: 37.4979, longitude: 127.0276 } });
      }),
    };

    await expect(getBrowserCurrentLocation({ geolocation })).resolves.toEqual({
      lat: 37.4979,
      lng: 127.0276,
    });
    expect(geolocation.getCurrentPosition).toHaveBeenCalledWith(
      expect.any(Function),
      expect.any(Function),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 },
    );
  });

  it('호출부가 geolocation 정확도/timeout/cache 옵션을 조정할 수 있다', async () => {
    const geolocation: GeolocationProvider = {
      getCurrentPosition: vi.fn((success) => {
        success({ coords: { latitude: 37.501, longitude: 127.039 } });
      }),
    };

    await expect(
      getBrowserCurrentLocation({
        geolocation,
        enableHighAccuracy: false,
        timeoutMs: 2500,
        maximumAgeMs: 0,
      }),
    ).resolves.toEqual({
      lat: 37.501,
      lng: 127.039,
    });
    expect(geolocation.getCurrentPosition).toHaveBeenCalledWith(
      expect.any(Function),
      expect.any(Function),
      { enableHighAccuracy: false, timeout: 2500, maximumAge: 0 },
    );
  });

  it('geolocation 미지원 브라우저는 unsupported 오류로 reject 한다', async () => {
    await expect(getBrowserCurrentLocation({ geolocation: undefined })).rejects.toMatchObject({
      code: 'unsupported',
    });
  });

  it('권한 거부는 permission_denied 오류로 매핑한다', async () => {
    const geolocation: GeolocationProvider = {
      getCurrentPosition: vi.fn((_success, error) => {
        error?.({ code: 1, message: 'denied' });
      }),
    };

    await expect(getBrowserCurrentLocation({ geolocation })).rejects.toMatchObject({
      code: 'permission_denied',
    });
  });

  it('timeout 오류는 timeout 코드로 매핑한다', async () => {
    const geolocation: GeolocationProvider = {
      getCurrentPosition: vi.fn((_success, error) => {
        error?.({ code: 3, message: 'timeout' });
      }),
    };

    await expect(getBrowserCurrentLocation({ geolocation })).rejects.toMatchObject({
      code: 'timeout',
    });
  });

  it('브라우저 위치 실패 기본값은 unavailable 코드로 매핑한다', async () => {
    const geolocation: GeolocationProvider = {
      getCurrentPosition: vi.fn((_success, error) => {
        error?.({ code: 2, message: 'position unavailable' });
      }),
    };

    await expect(getBrowserCurrentLocation({ geolocation })).rejects.toMatchObject({
      code: 'unavailable',
    });
  });

  it('RouteRequest 범위를 벗어난 좌표는 invalid_coordinates로 차단한다', async () => {
    const geolocation: GeolocationProvider = {
      getCurrentPosition: vi.fn((success) => {
        success({ coords: { latitude: 91, longitude: 127.0276 } });
      }),
    };

    await expect(getBrowserCurrentLocation({ geolocation })).rejects.toMatchObject({
      code: 'invalid_coordinates',
    });
  });
});

describe('getCurrentLocationErrorMessage', () => {
  it('권한 거부 오류를 사용자 안내 문구로 변환한다', () => {
    expect(getCurrentLocationErrorMessage(new CurrentLocationError('permission_denied', 'denied'))).toContain(
      '위치 권한이 거부',
    );
  });

  it('timeout 오류를 재시도 안내 문구로 변환한다', () => {
    expect(getCurrentLocationErrorMessage(new CurrentLocationError('timeout', 'timeout'))).toContain(
      '시간이 초과',
    );
  });
});
