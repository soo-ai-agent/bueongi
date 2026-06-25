import type { Destination } from '../store/appStore';
import type { LatLng, RouteOption, RouteType } from './routeCompare';
import type { RouteMapPoi } from '../components/map/RouteMap';
import { fetchRouteOptions } from './routeCompare';
import { getCdnBaseUrl, getTmapAppKey } from './env';
import { fetchTmapPedestrianRoutes } from './tmap';
import { buildRouteMarkers, scoreAndType, toRouteOptions } from './directRoute';
import type { SafetyFacilities } from './safetyScore';
import {
  fileVersion,
  loadCctv,
  loadEmergencyBell,
  loadLamp,
  loadManifest,
  loadSafehouse,
  loadSafepath,
  type SafetyPoint,
} from './cdnAssets';
import { loadSeoulLinkedPaths, loadSeoulSafeSvc } from './seoulSafeReturn';

/**
 * 경로 후보 소스 선택(작업 3 통합 진입점).
 *
 * 설계 원칙 "앱 직접 호출 우선":
 * - Tmap AppKey가 설정되면 E-1 Tmap을 앱에서 직접 호출하고, CDN/서울 캐시 시설로 안전 점수를 매긴다.
 *   (서버 프록시를 거치지 않는다.)
 * - AppKey가 없으면 전환기 폴백으로 기존 백엔드 경로 비교(/api/routes/compare)를 쓴다.
 *
 * CDN/시군구 해석이 아직 없으면 시설은 비어도 Tmap 실경로는 그대로 추천한다(점진적 향상).
 */

export interface RegionInfo {
  sigunguCode: string;
  isSeoul: boolean;
}

export type RegionResolver = (point: LatLng) => Promise<RegionInfo | null>;

export interface ComparisonRouteOptions {
  signal?: AbortSignal;
  /** 현재 위치 → 시군구코드/서울 여부 해석기. 없으면 CDN 시설 없이 Tmap 점수만. */
  resolveRegion?: RegionResolver;
  now?: number;
}

const EMPTY_FACILITIES: SafetyFacilities = { cctv: [], lamp: [], bell: [], safehouse: [] };

function toLatLngs(points: SafetyPoint[]): LatLng[] {
  return points.map((p) => ({ lat: p.lat, lng: p.lng }));
}

/** Tmap이 설정됐는지 — 호출부가 직접 호출 경로를 쓰는지 판단. */
export function isDirectRouteEnabled(): boolean {
  return Boolean(getTmapAppKey());
}

/**
 * 경로 버퍼 점수에 쓸 시설을 CDN/서울 캐시에서 모은다.
 * 부분 실패는 무시하고 가능한 데이터만 채워, 일부 자치구 파일 누락에도 추천이 끊기지 않게 한다.
 */
async function loadFacilitiesForRegion(region: RegionInfo, options: ComparisonRouteOptions): Promise<{ facilities: SafetyFacilities; safePaths: LatLng[][] }> {
  if (!getCdnBaseUrl()) return { facilities: EMPTY_FACILITIES, safePaths: [] };
  const manifest = await loadManifest({ signal: options.signal });
  const v = (file: string) => fileVersion(manifest, file);
  const lampKey = region.isSeoul ? 'seoul' : region.sigunguCode;

  const [cctv, bell, lamp, safehouse, localSafepaths] = await Promise.all([
    loadCctv(region.sigunguCode, v(`cctv/${region.sigunguCode}.json`), { signal: options.signal, now: options.now }).catch(() => []),
    loadEmergencyBell(region.sigunguCode, v(`emergency_bell/${region.sigunguCode}.json`), { signal: options.signal, now: options.now }).catch(() => []),
    loadLamp(lampKey, v(region.isSeoul ? 'lamp/seoul.json' : `lamp/${region.sigunguCode}.json`), { signal: options.signal, now: options.now }).catch(() => []),
    loadSafehouse(v('safehouse/all.json'), { signal: options.signal, now: options.now }).catch(() => []),
    loadSafepath(v('safepath/all.json'), { signal: options.signal, now: options.now }).catch(() => []),
  ]);

  // 서울이면 A-1 안심귀갓길(직접 호출 캐시), 그 외는 CDN A-4 safepath로 보너스.
  let safePaths: LatLng[][] = localSafepaths.map((sp) => sp.coords);
  const seoulItems: LatLng[] = [];
  const seoulSafehouses: LatLng[] = [];
  if (region.isSeoul) {
    // A-1 경로 + A-2 시설물을 함께 받아 LINK_ID로 연계(서울 정밀 모드).
    const linked = await loadSeoulLinkedPaths({ signal: options.signal, now: options.now }).catch(() => []);
    if (linked.length) {
      safePaths = linked.map((sp) => sp.coords);
      // A-1 링크에 연계된 A-2 안심벨/CCTV 시설물 좌표를 점수 버퍼에 합류시킨다.
      for (const path of linked) seoulItems.push(...path.items);
    }
    // A-3 서울 서비스시설물(지킴이집/안심택배함)을 안심집 버퍼에 합류 — 설계 "모든 API 활용".
    const svc = await loadSeoulSafeSvc({ signal: options.signal, now: options.now }).catch(() => []);
    seoulSafehouses.push(...svc);
  }

  return {
    facilities: {
      cctv: toLatLngs(cctv),
      // 서울은 A-2 시설물(안심벨/CCTV 포인트)을 bell 버퍼에 합쳐 정밀 점수에 반영.
      bell: [...toLatLngs(bell), ...seoulItems],
      lamp: toLatLngs(lamp),
      // CDN B-2 안심집 + 서울 A-3 서비스시설물.
      safehouse: [...toLatLngs(safehouse), ...seoulSafehouses],
    },
    safePaths,
  };
}

/**
 * 경로 비교 결과: UI 계약 RouteOption 목록과, 경로 유형별 거점 마커.
 * 마커는 직접 호출 경로에서 점수에 쓴 CDN/서울 캐시 시설로부터 만들어, 레거시 백엔드
 * facilities 호출 없이도 지도에 CCTV/안심집/비상벨을 점수와 일관되게 표시한다.
 * 백엔드 폴백 경로에서는 marker 정보가 없어 markersByType가 빈 객체이며, 호출부는
 * 기존 백엔드 facilities preview로 폴백한다.
 */
export interface ComparisonRouteResult {
  routes: RouteOption[];
  markersByType: Partial<Record<RouteType, RouteMapPoi[]>>;
}

/**
 * 경로 비교용 후보 + 거점 마커를 반환한다.
 * Tmap 직접 호출이 가능하면 그 경로/마커를, 아니면 백엔드 폴백(마커 없음)을 쓴다.
 */
export async function loadComparisonRouteResult(
  destination: Destination,
  origin: LatLng,
  options: ComparisonRouteOptions = {},
): Promise<ComparisonRouteResult> {
  if (!isDirectRouteEnabled()) {
    // 전환기 폴백: 기존 백엔드 경로 비교(거부는 호출부가 mock으로 처리). 마커는 백엔드 facilities로.
    const routes = await fetchRouteOptions(destination, origin, { signal: options.signal });
    return { routes, markersByType: {} };
  }

  const tmapRoutes = await fetchTmapPedestrianRoutes(
    origin,
    { lat: destination.lat, lng: destination.lng, ...(destination.name ? { name: destination.name } : {}) },
    undefined,
    { signal: options.signal },
  );

  let facilities = EMPTY_FACILITIES;
  let safePaths: LatLng[][] = [];
  try {
    const region = options.resolveRegion ? await options.resolveRegion(origin) : null;
    if (region) {
      const loaded = await loadFacilitiesForRegion(region, options);
      facilities = loaded.facilities;
      safePaths = loaded.safePaths;
    }
  } catch {
    // CDN/시군구 해석 실패 시 Tmap 단독 점수로 진행(추천 끊김 방지).
  }

  const scored = scoreAndType(tmapRoutes, facilities, safePaths);
  const dest: LatLng = { lat: destination.lat, lng: destination.lng };
  const markersByType: Partial<Record<RouteType, RouteMapPoi[]>> = {};
  for (const s of scored) {
    // 같은 유형이 여러 후보면 안전 점수가 높은(먼저 만난) 후보의 마커를 유지한다.
    if (markersByType[s.type]) continue;
    markersByType[s.type] = buildRouteMarkers({ origin, destination: dest, path: s.route.path, facilities });
  }

  return { routes: toRouteOptions(scored), markersByType };
}

/**
 * 경로 비교용 후보만 반환하는 호환 래퍼(마커가 불필요한 호출부용).
 */
export async function loadComparisonRoutes(
  destination: Destination,
  origin: LatLng,
  options: ComparisonRouteOptions = {},
): Promise<RouteOption[]> {
  return (await loadComparisonRouteResult(destination, origin, options)).routes;
}
