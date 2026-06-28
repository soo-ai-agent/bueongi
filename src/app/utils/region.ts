import type { LatLng } from './routeCompare';
import { loadKakaoServices } from './kakaoMaps';

/** 현재 위치를 행정구역으로 해석한 결과(시군구 코드 + 서울 여부). */
export interface RegionInfo {
  sigunguCode: string;
  isSeoul: boolean;
}

/**
 * 현재 위치 → 시군구코드/서울 여부 해석기(안심 경로 추천의 서울/비서울 분기 입력).
 *
 * 설계 원칙 "앱 직접 호출 우선":
 * - Kakao Maps SDK services Geocoder.coord2RegionCode를 앱에서 직접 호출해 좌표를
 *   행정구역으로 역지오코딩한다(서버 프록시 없음).
 * - 결과의 법정동(region_type 'B') 코드 앞 5자리가 시군구 코드(행정표준코드 SIG_CD와 동형).
 *   서울특별시 시군구 코드는 '11'로 시작한다 → A-1 안심귀갓길 보너스 분기.
 * - Kakao 키 미설정/SDK 로드 실패/응답 이상 시 null을 반환해, 호출부(routeSource)가
 *   CDN 시설 없이 Tmap 단독 점수로 추천을 이어가도록 한다(점진적 향상).
 *
 * 순수 파싱(pickSigunguCode/regionInfoFromResult)과 SDK 호출(resolveRegionViaKakao)을
 * 분리해 네트워크 없이 단위 검증이 가능하다.
 */

const SIGUNGU_CODE_LENGTH = 5;

/** 10자리 지역코드(법정동/행정동) → 시군구 코드(앞 5자리). 유효하지 않으면 null. */
export function sigunguFromRegionCode(code: unknown): string | null {
  if (typeof code !== 'string') return null;
  const digits = code.replace(/\D/g, '');
  if (digits.length < SIGUNGU_CODE_LENGTH) return null;
  return digits.slice(0, SIGUNGU_CODE_LENGTH);
}

/** 서울특별시 시군구 코드는 '11'로 시작한다(11110 종로 … 11740 강동). */
export function isSeoulSigungu(sigunguCode: string): boolean {
  return /^11\d{3}$/.test(sigunguCode);
}

/** 시군구 코드 → RegionInfo. null/빈 코드는 null. */
export function toRegionInfo(sigunguCode: string | null): RegionInfo | null {
  if (!sigunguCode) return null;
  return { sigunguCode, isSeoul: isSeoulSigungu(sigunguCode) };
}

interface RegionCodeDoc {
  region_type?: unknown;
  code?: unknown;
}

/**
 * coord2RegionCode 결과 배열에서 시군구 코드를 고른다.
 * 법정동(region_type 'B') 코드를 우선하고(행정동 H와 시군구 5자리는 동형이지만
 * 법정동 코드를 정본으로 사용), 없으면 첫 유효 코드로 폴백한다.
 */
export function pickSigunguCode(result: unknown): string | null {
  if (!Array.isArray(result)) return null;
  const docs = result.filter((d): d is RegionCodeDoc => typeof d === 'object' && d !== null);
  const legal = docs.find((d) => d.region_type === 'B' && sigunguFromRegionCode(d.code));
  if (legal) return sigunguFromRegionCode(legal.code);
  for (const d of docs) {
    const code = sigunguFromRegionCode(d.code);
    if (code) return code;
  }
  return null;
}

/** coord2RegionCode 결과 → RegionInfo(시군구코드 + 서울 여부). 해석 불가 시 null. */
export function regionInfoFromResult(result: unknown): RegionInfo | null {
  return toRegionInfo(pickSigunguCode(result));
}

/**
 * 현재 좌표를 Kakao 역지오코딩으로 시군구/서울 여부로 해석한다.
 * SDK 미준비·응답 이상·예외는 모두 null로 수렴(추천 끊김 방지).
 */
export async function resolveRegionViaKakao(point: LatLng): Promise<RegionInfo | null> {
  const services = await loadKakaoServices();
  if (!services) return null;
  return new Promise<RegionInfo | null>((resolve) => {
    try {
      const geocoder = new services.Geocoder();
      // coord2RegionCode는 (x=경도, y=위도) 순서.
      geocoder.coord2RegionCode(point.lng, point.lat, (res, status) => {
        resolve(status === services.Status.OK ? regionInfoFromResult(res) : null);
      });
    } catch {
      resolve(null);
    }
  });
}
