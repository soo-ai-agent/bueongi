import { hasValidLatLng, type LatLng } from './routeCompare';

export type CurrentLocationFailureCode =
  | 'unsupported'
  | 'permission_denied'
  | 'unavailable'
  | 'timeout'
  | 'invalid_coordinates';

export class CurrentLocationError extends Error {
  readonly code: CurrentLocationFailureCode;

  constructor(code: CurrentLocationFailureCode, message: string) {
    super(message);
    this.name = 'CurrentLocationError';
    this.code = code;
  }
}

export interface GeolocationProvider {
  getCurrentPosition: (
    success: (position: { coords: { latitude: number; longitude: number } }) => void,
    error?: (error: { code?: number; message?: string }) => void,
    options?: PositionOptions,
  ) => void;
}

export interface CurrentLocationOptions {
  geolocation?: GeolocationProvider | null;
  timeoutMs?: number;
  maximumAgeMs?: number;
  enableHighAccuracy?: boolean;
}

function getDefaultGeolocation(): GeolocationProvider | undefined {
  if (typeof navigator === 'undefined') return undefined;
  return navigator.geolocation as GeolocationProvider | undefined;
}

function toCurrentLocationError(error: { code?: number; message?: string }): CurrentLocationError {
  if (error.code === 1) {
    return new CurrentLocationError('permission_denied', 'Location permission was denied');
  }
  if (error.code === 3) {
    return new CurrentLocationError('timeout', 'Location request timed out');
  }
  return new CurrentLocationError('unavailable', error.message || 'Location is unavailable');
}

export function getCurrentLocationErrorMessage(error: unknown): string {
  const code = error instanceof CurrentLocationError ? error.code : 'unavailable';
  switch (code) {
    case 'unsupported':
      return '이 브라우저에서는 현재 위치를 사용할 수 없어요.';
    case 'permission_denied':
      return '위치 권한이 거부되었어요. 브라우저 설정에서 위치 권한을 허용해 주세요.';
    case 'timeout':
      return '현재 위치 확인 시간이 초과되었어요. 잠시 후 다시 시도해 주세요.';
    case 'invalid_coordinates':
      return '현재 위치 좌표가 올바르지 않아요. 다시 시도해 주세요.';
    case 'unavailable':
    default:
      return '현재 위치를 확인하지 못했어요. 잠시 후 다시 시도해 주세요.';
  }
}

export function getBrowserCurrentLocation(options: CurrentLocationOptions = {}): Promise<LatLng> {
  const geolocation = 'geolocation' in options ? options.geolocation ?? undefined : getDefaultGeolocation();
  if (!geolocation) {
    return Promise.reject(new CurrentLocationError('unsupported', 'Geolocation is not supported'));
  }

  return new Promise((resolve, reject) => {
    geolocation.getCurrentPosition(
      (position) => {
        const origin = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };

        if (!hasValidLatLng(origin)) {
          reject(new CurrentLocationError('invalid_coordinates', 'Geolocation returned invalid coordinates'));
          return;
        }

        resolve(origin);
      },
      (error) => reject(toCurrentLocationError(error)),
      {
        enableHighAccuracy: options.enableHighAccuracy ?? true,
        timeout: options.timeoutMs ?? 10_000,
        maximumAge: options.maximumAgeMs ?? 30_000,
      },
    );
  });
}
