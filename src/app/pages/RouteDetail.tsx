
import { ArrowLeft, ShieldAlert, Navigation2, MapPin, LocateFixed, LoaderCircle, Video, Bell, Store, Shield, Home, Info } from 'lucide-react';
import { useNavigate, useParams } from 'react-router';
import { RouteMap, type RouteMapPoi } from '../components/map/RouteMap';
import { BottomSheet } from '../components/ui/BottomSheet';
import { Button } from '../components/ui/Button';
import { Tag } from '../components/ui/Tag';
import { getRouteTagIcon, mockRoutes } from './RouteComparison';
import { resolveRoute, getRouteDestinationContext } from '../utils/routeSelection';
import { summarizeSafetyFacilities, toSafetyFacilityItems, type SafetyFacilityType } from '../utils/safetyFacilities';
import { useApp } from '../store/appStore';
import { useEffect, useState, type ReactNode } from 'react';
import { getBrowserCurrentLocation, getCurrentLocationErrorMessage } from '../utils/currentLocation';
import { fetchRouteFacilities, type FacilitiesResponse, type FacilityPoi, type FacilitySummary } from '../utils/routeFacilities';
import { getApiErrorUserMessage, reportApiError } from '../utils/apiError';

// x/y는 MapMock 폴백용, lat/lng는 실지도 투영용(API POI에만 존재).
type RouteDetailPoi = Pick<FacilityPoi, 'type' | 'x' | 'y'> & Partial<Pick<FacilityPoi, 'lat' | 'lng' | 'name'>>;

export const fallbackDetailPois: RouteDetailPoi[] = [
  { type: 'start', x: 20, y: 80 },
  { type: 'end', x: 80, y: 20 },
  { type: 'cctv', x: 35, y: 70 },
  { type: 'cctv', x: 50, y: 60 },
  { type: 'bell', x: 45, y: 65 },
  { type: 'safehouse', x: 55, y: 50 },
  { type: 'store', x: 65, y: 40 },
  { type: 'police', x: 75, y: 30 },
];

export const fallbackFacilitySummary: FacilitySummary = {
  cctv: 2,
  bell: 1,
  store: 1,
  police: 1,
  safehouse: 1,
  total: 5,
};

/**
 * 안심집(B-2) 수. summary에 있으면 그 값을, 없으면(구버전 백엔드) 표시 중인 POI에서 직접 센다.
 * "보이는 것만 센다" 원칙 — 지도 마커와 항상 일치한다.
 */
export function getSafehouseCount(
  facilities: FacilitiesResponse | null,
  // 레거시 facilities preview(RouteDetailPoi)와 백엔드 안심 라우팅 markers(RouteMapPoi, lamp 등 포함) 모두 받는다.
  visiblePois: ReadonlyArray<RouteDetailPoi | RouteMapPoi>,
): number {
  if (facilities?.pois.length && typeof facilities.summary.safehouse === 'number') {
    return facilities.summary.safehouse;
  }
  return visiblePois.filter((poi) => poi.type === 'safehouse').length;
}

export function getVisibleRouteDetailPois(hasOrigin: boolean, facilities: FacilitiesResponse | null): RouteDetailPoi[] {
  const pois = facilities?.pois.length ? facilities.pois : fallbackDetailPois;
  return hasOrigin ? pois : pois.filter((poi) => poi.type === 'end');
}

export function getRouteDetailFacilitySummary(facilities: FacilitiesResponse | null): FacilitySummary {
  return facilities?.pois.length ? facilities.summary : fallbackFacilitySummary;
}

/**
 * 백엔드 안심 라우팅 markers(회랑 내 시설 + 출발/도착)에서 시설 카운트를 집계한다.
 * start/end는 시설이 아니므로 제외한다 — "보이는 것만 센다" 원칙(지도 마커와 항상 일치).
 */
export function summarizeRouteMarkers(markers: RouteMapPoi[]): FacilitySummary {
  const count = (type: RouteMapPoi['type']) => markers.filter((m) => m.type === type).length;
  const cctv = count('cctv');
  const bell = count('bell');
  const store = count('store');
  const police = count('police');
  const safehouse = count('safehouse');
  return { cctv, bell, store, police, safehouse, total: cctv + bell + store + police + safehouse };
}

/** origin 확인 전에는 목적지(end) 마커만, 이후에는 전체 markers를 지도에 표시한다. */
export function getVisibleRouteMarkers(hasOrigin: boolean, markers: RouteMapPoi[]): RouteMapPoi[] {
  return hasOrigin ? markers : markers.filter((m) => m.type === 'end');
}

// 지도 POI 타입과 동일한 아이콘/색으로 요약을 표시(MapMock 과 시각 일치).
const FACILITY_ICON: Record<SafetyFacilityType, { Icon: typeof Video; color: string }> = {
  cctv: { Icon: Video, color: 'text-emerald-400' },
  bell: { Icon: Bell, color: 'text-red-400' },
  store: { Icon: Store, color: 'text-blue-400' },
  police: { Icon: Shield, color: 'text-blue-400' },
};

export function RouteDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { destination, routeOrigin, setRouteOrigin, apiRouteOptions } = useApp();
  const { canRequestRoute, hasDestination, destinationName } = getRouteDestinationContext(destination);
  const availableRoutes = apiRouteOptions.length > 0 ? apiRouteOptions : mockRoutes;
  const route = resolveRoute(availableRoutes, id) ?? mockRoutes[0];
  const [sheetOpen, setSheetOpen] = useState(true);
  const [originLoading, setOriginLoading] = useState(false);
  const [originError, setOriginError] = useState<string | null>(null);
  const [facilities, setFacilities] = useState<FacilitiesResponse | null>(null);
  const [facilitiesLoading, setFacilitiesLoading] = useState(false);
  const [facilitiesError, setFacilitiesError] = useState<string | null>(null);
  const hasOrigin = routeOrigin !== null;
  // 백엔드 안심 라우팅이 준 거점 마커. 있으면 facilities preview 호출을 생략하고 이 마커를 쓴다.
  const routeMarkers = 'markers' in route && route.markers && route.markers.length > 0 ? route.markers : undefined;

  useEffect(() => {
    // 백엔드 markers가 있으면 레거시 facilities preview 호출을 생략한다(점수/마커 일관성).
    if (!canRequestRoute || !destination || !routeOrigin || routeMarkers) {
      setFacilities(null);
      setFacilitiesLoading(false);
      setFacilitiesError(null);
      return;
    }

    const controller = new AbortController();
    setFacilities(null);
    setFacilitiesLoading(true);
    setFacilitiesError(null);

    fetchRouteFacilities(destination, routeOrigin, route.type, { signal: controller.signal })
      .then((response) => {
        setFacilities(response);
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        reportApiError('route detail facilities', error);
        setFacilities(null);
        setFacilitiesError(getApiErrorUserMessage(error, '시설 정보를 불러오지 못해 기본 시설로 표시합니다.'));
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setFacilitiesLoading(false);
        }
      });

    return () => controller.abort();
  }, [canRequestRoute, destination, route.type, routeOrigin, routeMarkers]);

  const requestOrigin = async () => {
    setOriginLoading(true);
    setOriginError(null);
    try {
      setRouteOrigin(await getBrowserCurrentLocation());
    } catch (error) {
      setOriginError(getCurrentLocationErrorMessage(error));
    } finally {
      setOriginLoading(false);
    }
  };

  // 목적지/좌표가 없으면(직접 진입·새로고침·잘못된 링크·구버전 저장데이터) 어디로 가는지 모르는 경로를
  // "안심귀가 시작"으로 노출하지 않는다 — 검색으로 유도(RouteComparison/ConfirmLocation 가드와 동일).
  if (!canRequestRoute) {
    return (
      <div data-testid="no-destination-guard" className="flex flex-col h-full bg-slate-800 items-center justify-center text-center px-8 gap-4">
        <div className="w-14 h-14 rounded-full bg-slate-700 border border-slate-600 flex items-center justify-center text-slate-400">
          <MapPin className="w-6 h-6" />
        </div>
        <p className="text-slate-300 font-medium">
          {hasDestination ? '목적지 위치를 다시 확인해 주세요' : '선택된 목적지가 없어요'}
        </p>
        <p className="text-slate-400 text-sm">목적지를 검색하면 안심 경로를 안내해 드려요.</p>
        <Button onClick={() => navigate('/place-search')} className="rounded-[20px]">
          목적지 검색하기
        </Button>
      </div>
    );
  }

  // 백엔드 markers가 있으면 그 마커로 시설 카운트/지도 마커를 구성하고, 없으면 레거시 facilities preview로 폴백.
  const facilitySummary = routeMarkers ? summarizeRouteMarkers(routeMarkers) : getRouteDetailFacilitySummary(facilities);
  const detailPois = routeMarkers ? getVisibleRouteMarkers(hasOrigin, routeMarkers) : getVisibleRouteDetailPois(hasOrigin, facilities);
  const safehouseCount = routeMarkers ? (facilitySummary.safehouse ?? 0) : getSafehouseCount(facilities, detailPois);

  // 지도에 표시된 안심 시설 POI를 그대로 집계해 요약(보이는 것과 항상 일치).
  const facilityItems = toSafetyFacilityItems(summarizeSafetyFacilities(detailPois));

  return (
    <div className="flex flex-col h-full bg-slate-800 relative">
      <header className="absolute top-0 inset-x-0 z-30 px-4 pt-8 mt-4">
        <button onClick={() => navigate(-1)} className="p-3 text-slate-200 bg-slate-700/90 backdrop-blur-md rounded-full shadow-lg border border-slate-600 active:scale-95 transition-transform">
          <ArrowLeft className="w-6 h-6" />
        </button>
      </header>

      <div className="flex-1 w-full h-full">
        <RouteMap
          origin={hasOrigin ? routeOrigin : null}
          destination={destination}
          showRoute={hasOrigin}
          routeType={route.type}
          pois={detailPois}
          zoom={1.5}
          path={'path' in route ? route.path : undefined}
        />
      </div>

      <BottomSheet isOpen={sheetOpen} onClose={() => {}} hideClose>
        <div className="pb-2">
          {/* 목적지 컨텍스트 — 어떤 목적지로 가는 경로인지 명시(실데이터). */}
          <div className="flex items-center gap-2 mb-4 bg-slate-700 border border-slate-600 rounded-[16px] px-3.5 py-2.5">
            <div className="w-2.5 h-2.5 rounded-full bg-blue-400 shrink-0" />
            <span className="text-slate-300 text-sm font-medium whitespace-nowrap">
              {hasOrigin ? '현재 위치' : '현재 위치 확인 필요'}
            </span>
            <span className="text-slate-500 mx-0.5 shrink-0">→</span>
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 shrink-0" />
            <span className="text-slate-50 text-sm font-bold flex-1 truncate">{destinationName}</span>
          </div>
          <div className="flex justify-between items-end mb-4">
            <div>
              <h2 className="text-2xl font-bold text-slate-50 mb-2">{route.name}</h2>
              <div className="flex gap-3 text-slate-300 text-lg font-medium">
                <span className="text-blue-400">{route.time}</span>
                <span className="text-slate-500">|</span>
                <span>{route.dist}</span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 mb-6">
            {route.tags.map((tag, i) => (
              <Tag key={i} variant={tag.variant} icon={getRouteTagIcon(tag)}>
                {tag.text}
              </Tag>
            ))}
          </div>

          {hasOrigin && (
            <div className="rounded-[20px] border border-slate-600 bg-slate-700 px-4 py-4 mb-5">
              <div className="flex items-center justify-between gap-3 mb-3">
                <p className="text-slate-50 font-bold">경로 주변 안심 시설</p>
                <span className="text-slate-400 text-sm">
                  {facilitiesLoading ? '확인 중' : `총 ${facilitySummary.total}개`}
                </span>
              </div>
              <div className="grid grid-cols-5 gap-2">
                <FacilityCount icon={<Video />} label="CCTV" count={facilitySummary.cctv} accent="text-emerald-300" />
                <FacilityCount icon={<Bell />} label="비상벨" count={facilitySummary.bell} accent="text-red-300" />
                <FacilityCount icon={<Home />} label="안심집" count={safehouseCount} accent="text-violet-300" />
                <FacilityCount icon={<Store />} label="편의점" count={facilitySummary.store} accent="text-blue-300" />
                <FacilityCount icon={<Shield />} label="지구대" count={facilitySummary.police} accent="text-blue-300" />
              </div>
              {/* B-2 검증: 여성안심지킴이집은 '지정 상태'일 뿐 영업시간 정보가 없음을 명시. */}
              {safehouseCount > 0 && (
                <p data-testid="safehouse-hours-note" className="mt-3 flex items-start gap-1.5 text-slate-400 text-xs leading-relaxed">
                  <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-violet-300" />
                  여성안심지킴이집은 지정된 거점일 뿐 영업시간 정보가 없어요. 방문 전 운영 여부를 확인해 주세요.
                </p>
              )}
              {facilitiesError && <p className="text-amber-300 text-sm leading-relaxed mt-3">{facilitiesError}</p>}
            </div>
          )}

          <div className="flex flex-col gap-3">
            {!hasOrigin && (
              <div className="rounded-[20px] border border-slate-600 bg-slate-700 px-4 py-4">
                <div className="flex gap-3">
                  <div className="w-10 h-10 rounded-full bg-blue-500/15 border border-blue-400/30 flex items-center justify-center text-blue-300 shrink-0">
                    <LocateFixed className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-slate-50 font-bold mb-1">출발 위치가 필요해요</p>
                    <p className="text-slate-300 text-sm leading-relaxed">현재 위치를 확인해야 안심귀가를 시작할 수 있어요.</p>
                    {originError && <p className="text-red-300 text-sm leading-relaxed mt-2">{originError}</p>}
                  </div>
                </div>
              </div>
            )}
            <Button
              data-testid="start-navigation-btn"
              size="lg"
              className="h-16 text-xl shadow-[0_8px_20px_rgba(37,99,235,0.2)] rounded-[24px]"
              onClick={hasOrigin ? () => navigate('/navigate', { state: { routeId: route.id } }) : requestOrigin}
              disabled={originLoading}
            >
              {hasOrigin ? <Navigation2 className="w-6 h-6 mr-2" /> : originLoading ? <LoaderCircle className="w-6 h-6 mr-2 animate-spin" /> : <LocateFixed className="w-6 h-6 mr-2" />}
              {hasOrigin ? '안심귀가 시작' : '현재 위치 확인'}
            </Button>
            
            <div className="flex gap-3 mt-2">
              <Button variant="secondary" className="flex-1 rounded-[20px] bg-slate-600 text-slate-200 hover:bg-slate-500" onClick={() => navigate('/share')}>
                보호자에게 공유
              </Button>
              <Button variant="outline" className="flex-1 flex gap-2 rounded-[20px]" onClick={() => window.open('https://www.sexoffender.go.kr', '_blank')}>
                <ShieldAlert className="w-4 h-4 text-slate-300" />
                알림e 확인
              </Button>
            </div>
          </div>
        </div>
      </BottomSheet>
    </div>
  );
}

function FacilityCount({ icon, label, count, accent = 'text-blue-300' }: { icon: ReactNode; label: string; count: number; accent?: string }) {
  return (
    <div className="min-w-0 rounded-[14px] border border-slate-600 bg-slate-800/60 px-2 py-3 text-center">
      <div className={`mx-auto mb-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-slate-700 ${accent} [&>svg]:h-4 [&>svg]:w-4`}>
        {icon}
      </div>
      <p className="truncate text-[11px] font-medium text-slate-400">{label}</p>
      <p className="text-sm font-bold text-slate-100">{count}</p>
    </div>
  );
}
