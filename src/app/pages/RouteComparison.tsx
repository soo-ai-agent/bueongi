import { ArrowLeft, Video, Lightbulb, TrendingUp, AlertTriangle, Search, MapPin, LocateFixed, LoaderCircle, Navigation2 } from 'lucide-react';
import { type ReactNode, useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { RouteMap, type RouteMapPoi } from '../components/map/RouteMap';
import { Tag, type TagVariant } from '../components/ui/Tag';
import { Button } from '../components/ui/button';
import { useApp } from '../store/appStore';
import { getRouteDestinationContext } from '../utils/routeSelection';
import { getBrowserCurrentLocation, getCurrentLocationErrorMessage } from '../utils/currentLocation';
import { type RouteOption, type RouteOptionTag } from '../utils/routeCompare';
import { loadComparisonRouteResult } from '../utils/routeSource';
import { resolveRegionViaKakao } from '../utils/region';
import { fetchRouteFacilities, type FacilitiesResponse, type FacilityPoi } from '../utils/routeFacilities';
import { getApiErrorUserMessage, reportApiError } from '../utils/apiError';

export type RouteType = 'safe' | 'main' | 'fast';

export interface RouteTag {
  text: string;
  icon?: ReactNode;
  variant: TagVariant;
}

export interface MockRoute {
  id: string;
  name: string;
  time: string;
  dist: string;
  desc: string;
  tags: RouteTag[];
  type: RouteType;
}

type DisplayRoute = MockRoute | RouteOption;
type DisplayRouteTag = RouteTag | RouteOptionTag;
// x/y는 MapMock 폴백용, lat/lng는 실지도 투영용(API POI에만 존재).
type RouteComparisonPoi = Pick<FacilityPoi, 'type' | 'x' | 'y'> & Partial<Pick<FacilityPoi, 'lat' | 'lng' | 'name'>>;

export const fallbackComparisonPois: RouteComparisonPoi[] = [
  { type: 'start', x: 20, y: 80 },
  { type: 'end', x: 80, y: 20 },
];

export function getVisibleRouteComparisonPois(hasOrigin: boolean, facilities: FacilitiesResponse | null): RouteComparisonPoi[] {
  const pois = facilities?.pois.length ? facilities.pois : fallbackComparisonPois;
  return hasOrigin ? pois : pois.filter((poi) => poi.type === 'end');
}

/**
 * 비교 지도에 그릴 POI를 고른다. 직접 호출(Tmap+CDN) 마커가 있으면 점수와 일관된 그 마커를,
 * 없으면 레거시 백엔드 facilities preview(또는 폴백 POI)를 쓴다.
 */
export function getRouteComparisonMapPois(
  hasOrigin: boolean,
  directMarkers: RouteMapPoi[] | undefined,
  facilities: FacilitiesResponse | null,
): Array<RouteComparisonPoi | RouteMapPoi> {
  if (hasOrigin && directMarkers && directMarkers.length > 0) return directMarkers;
  return getVisibleRouteComparisonPois(hasOrigin, facilities);
}

export function getRouteComparisonPreviewType(
  routes: Array<{ type: RouteType }>,
  activeType: RouteType,
): RouteType {
  return routes.find((route) => route.type === activeType)?.type ?? routes[0]?.type ?? 'safe';
}

export function getRouteTagIcon(tag: DisplayRouteTag): ReactNode | undefined {
  return 'icon' in tag ? tag.icon : undefined;
}

export const mockRoutes: MockRoute[] = [
  {
    id: '1',
    name: '추천 경로',
    time: '24분',
    dist: '1.2km',
    desc: '가장 밝고 안심 시설이 잘 갖춰진 길입니다.',
    tags: [
      { text: 'CCTV 많음', icon: <Video />, variant: 'mint' },
      { text: '밝은 길', icon: <Lightbulb />, variant: 'yellow' },
    ],
    type: 'safe'
  },
  {
    id: '2',
    name: '큰길 위주',
    time: '28분',
    dist: '1.4km',
    desc: '시간은 조금 더 걸리지만 넓고 트인 큰길로 안내합니다.',
    tags: [
      { text: '큰길 위주', icon: <TrendingUp />, variant: 'blue' },
      { text: '골목길 적음', icon: <AlertTriangle />, variant: 'default' },
    ],
    type: 'main'
  },
  {
    id: '3',
    name: '빠른 경로',
    time: '18분',
    dist: '1.0km',
    desc: '가장 빠르게 도착할 수 있는 최단 거리 경로입니다.',
    tags: [
      { text: '최단 거리', variant: 'outline' },
    ],
    type: 'fast'
  }
];

export function RouteComparison() {
  const navigate = useNavigate();
  const { destination, routeOrigin, setRouteOrigin, setApiRouteOptions } = useApp();
  const { canRequestRoute, hasDestination, destinationName } = getRouteDestinationContext(destination);
  const [originLoading, setOriginLoading] = useState(false);
  const [originError, setOriginError] = useState<string | null>(null);
  const [routeOptions, setRouteOptions] = useState<RouteOption[]>([]);
  const [routeOptionsLoading, setRouteOptionsLoading] = useState(false);
  const [routeOptionsError, setRouteOptionsError] = useState<string | null>(null);
  const [previewFacilities, setPreviewFacilities] = useState<FacilitiesResponse | null>(null);
  // 직접 호출(Tmap+CDN) 경로의 거점 마커 — 점수와 일관된 CCTV/안심집/비상벨. 있으면 레거시 백엔드 facilities보다 우선.
  const [directMarkersByType, setDirectMarkersByType] = useState<Partial<Record<RouteType, RouteMapPoi[]>>>({});
  const [activePreviewRouteType, setActivePreviewRouteType] = useState<RouteType>('safe');
  const hasOrigin = routeOrigin !== null;
  const displayRoutes: DisplayRoute[] = routeOptions.length > 0 ? routeOptions : mockRoutes;
  const previewRouteType = getRouteComparisonPreviewType(displayRoutes, activePreviewRouteType);

  useEffect(() => {
    if (!hasOrigin || !destination || !canRequestRoute) {
      setRouteOptions([]);
      setApiRouteOptions([]);
      setDirectMarkersByType({});
      setRouteOptionsLoading(false);
      setRouteOptionsError(null);
      return;
    }

    const controller = new AbortController();
    setRouteOptions([]);
    setApiRouteOptions([]);
    setDirectMarkersByType({});
    setRouteOptionsLoading(true);
    setRouteOptionsError(null);

    // 앱 직접 호출 우선: Tmap AppKey가 있으면 Tmap+CDN 점수, 없으면 백엔드 폴백.
    // resolveRegion으로 현재 위치를 시군구/서울 여부로 해석 → CDN 시설 점수 + 서울 A-1 보너스 분기.
    loadComparisonRouteResult(destination, routeOrigin, {
      signal: controller.signal,
      resolveRegion: resolveRegionViaKakao,
    })
      .then(({ routes, markersByType }) => {
        setRouteOptions(routes);
        setApiRouteOptions(routes);
        setDirectMarkersByType(markersByType);
        if (routes.length === 0) {
          setRouteOptionsError('실시간 경로가 없어 기본 경로로 안내합니다.');
        }
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        reportApiError('route compare', error);
        setRouteOptions([]);
        setApiRouteOptions([]);
        setDirectMarkersByType({});
        setRouteOptionsError(getApiErrorUserMessage(error, '실시간 경로를 불러오지 못해 기본 경로로 안내합니다.'));
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setRouteOptionsLoading(false);
        }
      });

    return () => controller.abort();
  }, [canRequestRoute, destination, hasOrigin, routeOrigin]);

  useEffect(() => {
    if (!hasOrigin || !destination || !canRequestRoute) {
      setPreviewFacilities(null);
      return;
    }
    // 직접 호출 경로의 거점 마커가 있으면 그걸 쓰고 레거시 백엔드 facilities 호출은 생략한다.
    if ((directMarkersByType[previewRouteType]?.length ?? 0) > 0) {
      setPreviewFacilities(null);
      return;
    }

    const controller = new AbortController();
    setPreviewFacilities(null);

    fetchRouteFacilities(destination, routeOrigin, previewRouteType, { signal: controller.signal })
      .then(setPreviewFacilities)
      .catch((error) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        reportApiError('route comparison facilities preview', error);
        setPreviewFacilities(null);
      });

    return () => controller.abort();
  }, [canRequestRoute, destination, directMarkersByType, hasOrigin, previewRouteType, routeOrigin]);

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

  // 목적지/좌표가 없으면(직접 진입·목적지 미선택·구버전 저장데이터) 가짜 경로 노출 대신 검색으로 유도
  // (ConfirmLocation 과 동일한 목적지 컨텍스트 가드).
  if (!canRequestRoute) {
    return (
      <div className="flex flex-col h-full bg-slate-800 items-center justify-center text-center px-8 gap-4">
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

  return (
    <div className="flex flex-col h-full bg-slate-800">
      {/* Header */}
      <header className="px-4 py-3 pt-4 flex items-center gap-3 bg-slate-800 z-20 shadow-sm border-b border-slate-700">
        <button onClick={() => navigate(-1)} className="p-2 text-slate-300 hover:text-slate-50 rounded-full hover:bg-slate-700 transition-colors">
          <ArrowLeft className="w-6 h-6" />
        </button>
        
        {/* Editable Destination Header */}
        <div 
          onClick={() => navigate('/place-search')}
          className="flex-1 flex items-center gap-2 bg-slate-700 px-4 py-3 rounded-[20px] border border-slate-600 cursor-pointer hover:bg-slate-600 transition-colors group"
        >
          <div className="w-2.5 h-2.5 rounded-full bg-blue-400 shadow-sm shrink-0" />
          <span className="text-slate-200 text-sm font-medium whitespace-nowrap">
            {hasOrigin ? '현재 위치' : '현재 위치 확인 필요'}
          </span>
          <span className="text-slate-400 mx-1 shrink-0">→</span>
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 shadow-sm shrink-0" />
          <span className="text-slate-50 text-sm font-bold flex-1 truncate">{destinationName}</span>
          <Search className="w-4 h-4 text-slate-400 group-hover:text-slate-200 shrink-0 transition-colors" />
        </div>
      </header>

      {/* Map half */}
      <div className="flex-[0.8] relative bg-slate-700">
        <RouteMap
          origin={hasOrigin ? routeOrigin : null}
          destination={destination}
          showRoute={hasOrigin}
          routeType={hasOrigin ? previewRouteType : 'safe'}
          pois={getRouteComparisonMapPois(hasOrigin, directMarkersByType[previewRouteType], previewFacilities)}
        />
      </div>

      {/* Bottom Routes List */}
      <div className="bg-slate-800 rounded-t-[32px] shadow-[0_-8px_30px_rgba(0,0,0,0.2)] z-20 flex flex-col flex-1 mt-[-20px]">
        <div className="flex justify-center pt-3 pb-2">
          <div className="w-12 h-1.5 bg-slate-600 rounded-full" />
        </div>
        <div className="px-6 pb-3 pt-2">
          <h2 className="text-xl font-bold text-slate-50">경로 선택</h2>
        </div>
        
        <div className="flex-1 overflow-y-auto px-4 pb-6 space-y-3">
          {!hasOrigin && (
            <div className="p-5 rounded-[24px] border border-slate-600 bg-slate-700 shadow-sm">
              <div className="flex items-start gap-3">
                <div className="w-11 h-11 rounded-full bg-blue-500/15 border border-blue-400/30 flex items-center justify-center text-blue-300 shrink-0">
                  <LocateFixed className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-bold text-slate-50 mb-1">현재 위치 확인이 필요해요</h3>
                  <p className="text-slate-300 text-sm leading-relaxed">
                    위치 권한을 허용하면 선택한 목적지까지의 안심 경로를 요청할 수 있어요.
                  </p>
                  {originError && <p className="text-red-300 text-sm leading-relaxed mt-3">{originError}</p>}
                  <Button
                    type="button"
                    onClick={requestOrigin}
                    disabled={originLoading}
                    className="mt-4 rounded-[20px]"
                    fullWidth
                  >
                    {originLoading ? <LoaderCircle className="w-5 h-5 mr-2 animate-spin" /> : <LocateFixed className="w-5 h-5 mr-2" />}
                    현재 위치 확인
                  </Button>
                </div>
              </div>
            </div>
          )}
          {hasOrigin && (
            <div className="px-1 text-sm text-slate-400 min-h-5">
              {routeOptionsLoading && '실시간 경로를 불러오는 중입니다.'}
              {!routeOptionsLoading && routeOptionsError}
            </div>
          )}
          {hasOrigin && displayRoutes.map((route) => (
            <div
              key={route.id}
              data-testid="route-option"
              onPointerEnter={() => setActivePreviewRouteType(route.type)}
              className={`p-5 rounded-[24px] border transition-all ${
                route.type === previewRouteType
                  ? 'bg-slate-700 border-blue-400/50 shadow-sm' 
                  : 'bg-slate-700 border-slate-600 hover:bg-slate-600 shadow-sm'
              }`}
            >
              <button
                type="button"
                data-testid="route-preview-option"
                aria-pressed={route.type === previewRouteType}
                onClick={() => setActivePreviewRouteType(route.type)}
                onFocus={() => setActivePreviewRouteType(route.type)}
                onPointerEnter={() => setActivePreviewRouteType(route.type)}
                className="block w-full rounded-[18px] text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-700"
              >
                <div className="flex justify-between items-start mb-2.5">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <h3 className={`font-bold text-lg ${route.type === previewRouteType ? 'text-blue-300' : 'text-slate-100'}`}>
                      {route.name}
                    </h3>
                    <div className="flex gap-2 text-slate-300 text-sm font-medium">
                      <span className={route.type === previewRouteType ? 'text-blue-300' : ''}>{route.time}</span>
                      <span className="text-slate-500">·</span>
                      <span>{route.dist}</span>
                    </div>
                  </div>
                </div>

                <p className="text-slate-300 text-sm mb-4 leading-relaxed">{route.desc}</p>

                <div className="flex flex-wrap gap-2">
                  {route.tags.map((tag, i) => (
                    <Tag key={i} variant={tag.variant} icon={getRouteTagIcon(tag)}>
                      {tag.text}
                    </Tag>
                  ))}
                </div>
              </button>

              <div className="mt-4 flex justify-end">
                <Button
                  type="button"
                  size="sm"
                  data-testid="route-detail-link"
                  aria-label={`${route.name} 경로 보기`}
                  onClick={() => navigate(`/route/${route.type}`)}
                  className="rounded-[18px]"
                >
                  <Navigation2 className="w-4 h-4 mr-1.5" />
                  경로 보기
                </Button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
