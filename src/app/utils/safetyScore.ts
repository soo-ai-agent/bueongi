import type { LatLng } from './routeCompare';
import { countWithinCorridor, overlapLengthMeters, pathLengthMeters } from './geo';

/**
 * 안전 점수 산정(앱 로컬, 서버 경유 없음).
 *
 * 설계 의사코드 기준:
 * - 경로 30m 버퍼(corridor) 안의 CCTV/조명/비상벨 밀도(개수/km)와 여성안심지킴이집 개수,
 *   서울이면 A-1, 그 외 A-4 안심귀갓길 겹침 비율을 가중 합산한다.
 * - 밀도는 상한(MVP 캘리브레이션)으로 정규화해 0~1로 만든 뒤 가중치를 적용한다.
 * - 점수는 0~100. 입력 데이터가 비어도(서울 캐시 실패 등) 깨지지 않고 0 점으로 수렴한다.
 */

export const DEFAULT_CORRIDOR_METERS = 30;

/** 각 밀도/개수가 만점(정규화 1.0)에 이르는 기준값(MVP 캘리브레이션). */
export const SATURATION = {
  cctvPerKm: 20,
  lampPerKm: 40,
  bellPerKm: 5,
  safehouseCount: 3,
} as const;

/** 설계 가중치(합 1.0). */
export const WEIGHTS = {
  cctv: 0.35,
  lamp: 0.25,
  bell: 0.2,
  safehouse: 0.05,
  safePath: 0.15,
} as const;

export interface SafetyFacilities {
  cctv: LatLng[];
  lamp: LatLng[];
  bell: LatLng[];
  safehouse: LatLng[];
}

export interface SafetyScoreInput {
  path: LatLng[];
  facilities: SafetyFacilities;
  /** 서울 경로면 A-1, 비서울이면 A-4 안심귀갓길 좌표열 목록을 넘긴다. */
  safePaths?: LatLng[][];
  corridorMeters?: number;
}

export interface SafetyScoreBreakdown {
  routeKm: number;
  cctvDensity: number;
  lampDensity: number;
  bellDensity: number;
  safehouseCount: number;
  safePathOverlap: number;
}

export interface SafetyScore {
  /** 0~100 정수 안전 점수. */
  score: number;
  breakdown: SafetyScoreBreakdown;
}

function saturate(value: number, max: number): number {
  if (max <= 0) return 0;
  return Math.max(0, Math.min(1, value / max));
}

/** 한 경로의 안전 점수를 계산한다. */
export function scoreRoute(input: SafetyScoreInput): SafetyScore {
  const corridor = input.corridorMeters ?? DEFAULT_CORRIDOR_METERS;
  const lengthM = pathLengthMeters(input.path);
  const routeKm = lengthM / 1000;
  // 0 길이 경로 방어: 밀도 분모를 최소 1m로 잡아 폭주를 막는다.
  const km = routeKm > 0 ? routeKm : 0.001;

  const cctvInCorridor = countWithinCorridor(input.facilities.cctv, input.path, corridor);
  const lampInCorridor = countWithinCorridor(input.facilities.lamp, input.path, corridor);
  const bellInCorridor = countWithinCorridor(input.facilities.bell, input.path, corridor);
  const safehouseInCorridor = countWithinCorridor(input.facilities.safehouse, input.path, corridor);

  const cctvDensity = cctvInCorridor / km;
  const lampDensity = lampInCorridor / km;
  const bellDensity = bellInCorridor / km;

  // 안심귀갓길 겹침 비율(0~1): 후보 경로 길이 대비 겹침 길이의 최댓값.
  let safePathOverlap = 0;
  if (lengthM > 0 && input.safePaths?.length) {
    for (const sp of input.safePaths) {
      const overlap = overlapLengthMeters(input.path, sp, corridor);
      const ratio = overlap / lengthM;
      if (ratio > safePathOverlap) safePathOverlap = ratio;
    }
    safePathOverlap = Math.min(1, safePathOverlap);
  }

  const normalized =
    WEIGHTS.cctv * saturate(cctvDensity, SATURATION.cctvPerKm) +
    WEIGHTS.lamp * saturate(lampDensity, SATURATION.lampPerKm) +
    WEIGHTS.bell * saturate(bellDensity, SATURATION.bellPerKm) +
    WEIGHTS.safehouse * saturate(safehouseInCorridor, SATURATION.safehouseCount) +
    WEIGHTS.safePath * safePathOverlap;

  return {
    score: Math.round(normalized * 100),
    breakdown: {
      routeKm: Math.round(routeKm * 1000) / 1000,
      cctvDensity: Math.round(cctvDensity * 100) / 100,
      lampDensity: Math.round(lampDensity * 100) / 100,
      bellDensity: Math.round(bellDensity * 100) / 100,
      safehouseCount: safehouseInCorridor,
      safePathOverlap: Math.round(safePathOverlap * 1000) / 1000,
    },
  };
}
