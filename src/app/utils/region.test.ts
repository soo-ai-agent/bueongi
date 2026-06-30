import { afterEach, describe, expect, it, vi } from 'vitest';
import { __resetKakaoMapsLoaderForTest } from './kakaoMaps';
import {
  isSeoulSigungu,
  pickSigunguCode,
  regionInfoFromResult,
  resolveRegionViaKakao,
  sigunguFromRegionCode,
  toRegionInfo,
} from './region';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  __resetKakaoMapsLoaderForTest();
});

describe('sigunguFromRegionCode', () => {
  it('10자리 법정동 코드의 앞 5자리를 시군구 코드로 추출한다', () => {
    expect(sigunguFromRegionCode('1168010100')).toBe('11680');
    expect(sigunguFromRegionCode('2611010200')).toBe('26110');
  });

  it('숫자가 아닌 문자가 섞여 있어도 숫자만 모아 앞 5자리를 쓴다', () => {
    expect(sigunguFromRegionCode('11-680-101')).toBe('11680');
  });

  it('5자리 미만/문자열 아님은 null', () => {
    expect(sigunguFromRegionCode('1168')).toBeNull();
    expect(sigunguFromRegionCode(1168010100 as unknown)).toBeNull();
    expect(sigunguFromRegionCode(undefined)).toBeNull();
  });
});

describe('isSeoulSigungu', () => {
  it("'11'로 시작하는 5자리만 서울", () => {
    expect(isSeoulSigungu('11680')).toBe(true);
    expect(isSeoulSigungu('11110')).toBe(true);
    expect(isSeoulSigungu('26110')).toBe(false);
    expect(isSeoulSigungu('41135')).toBe(false);
    // 11로 시작해도 5자리가 아니면 거부.
    expect(isSeoulSigungu('1168')).toBe(false);
  });
});

describe('toRegionInfo', () => {
  it('서울 코드는 isSeoul=true', () => {
    expect(toRegionInfo('11680')).toEqual({ sigunguCode: '11680', isSeoul: true });
  });
  it('비서울 코드는 isSeoul=false', () => {
    expect(toRegionInfo('26110')).toEqual({ sigunguCode: '26110', isSeoul: false });
  });
  it('null/빈 코드는 null', () => {
    expect(toRegionInfo(null)).toBeNull();
    expect(toRegionInfo('')).toBeNull();
  });
});

describe('pickSigunguCode', () => {
  it('법정동(B) 코드를 행정동(H)보다 우선한다', () => {
    const result = [
      { region_type: 'H', code: '1168051000' },
      { region_type: 'B', code: '1168010100' },
    ];
    expect(pickSigunguCode(result)).toBe('11680');
  });

  it('법정동이 없으면 첫 유효 코드로 폴백', () => {
    expect(pickSigunguCode([{ region_type: 'H', code: '2611010200' }])).toBe('26110');
  });

  it('배열이 아니거나 유효 코드가 없으면 null', () => {
    expect(pickSigunguCode(null)).toBeNull();
    expect(pickSigunguCode([])).toBeNull();
    expect(pickSigunguCode([{ region_type: 'B', code: 'oops' }])).toBeNull();
  });
});

describe('regionInfoFromResult', () => {
  it('서울 법정동 결과 → 서울 RegionInfo', () => {
    expect(regionInfoFromResult([{ region_type: 'B', code: '1111010100' }])).toEqual({
      sigunguCode: '11110',
      isSeoul: true,
    });
  });
});

describe('resolveRegionViaKakao', () => {
  function stubKakaoServices(options: {
    status?: KakaoServicesStatus;
    result?: KakaoRegionCodeResult[];
  }) {
    const coord2RegionCode = vi.fn(
      (_x: number, _y: number, cb: (r: KakaoRegionCodeResult[], s: KakaoServicesStatus) => void) => {
        cb(options.result ?? [], options.status ?? 'OK');
      },
    );
    class Geocoder {
      coord2RegionCode = coord2RegionCode;
    }
    const services = {
      Geocoder,
      Status: { OK: 'OK', ZERO_RESULT: 'ZERO_RESULT', ERROR: 'ERROR' },
    };
    vi.stubGlobal('window', { kakao: { maps: { Map: vi.fn(), services } } });
    vi.stubGlobal('document', { querySelector: vi.fn(() => null) });
    return { coord2RegionCode, services };
  }

  it('역지오코딩 성공 시 서울 RegionInfo를 반환하고 (경도, 위도) 순으로 호출한다', async () => {
    const { coord2RegionCode } = stubKakaoServices({
      result: [{ region_type: 'B', code: '1168010100' }],
    });
    const region = await resolveRegionViaKakao({ lat: 37.5, lng: 127.05 });
    expect(region).toEqual({ sigunguCode: '11680', isSeoul: true });
    expect(coord2RegionCode).toHaveBeenCalledWith(127.05, 37.5, expect.any(Function));
  });

  it('status가 OK가 아니면 null', async () => {
    stubKakaoServices({ status: 'ZERO_RESULT', result: [{ region_type: 'B', code: '1168010100' }] });
    await expect(resolveRegionViaKakao({ lat: 0, lng: 0 })).resolves.toBeNull();
  });

  it('Kakao SDK/키가 없으면(services 미준비) null', async () => {
    // window.kakao 없음 → loadKakaoMaps가 false → services null.
    await expect(resolveRegionViaKakao({ lat: 37.5, lng: 127.05 })).resolves.toBeNull();
  });
});
