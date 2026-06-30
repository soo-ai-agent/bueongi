import { ArrowLeft, ShieldAlert, Navigation2, MapPin, Video, Bell, Store, Shield } from 'lucide-react';
import { useNavigate, useParams } from 'react-router';
import { MapMock } from '../components/map/MapMock';
import { BottomSheet } from '../components/ui/BottomSheet';
import { Button } from '../components/ui/Button';
import { Tag } from '../components/ui/Tag';
import { mockRoutes } from './RouteComparison';
import { resolveRoute, getRouteDestinationContext } from '../utils/routeSelection';
import { summarizeSafetyFacilities, toSafetyFacilityItems, type SafetyFacilityType } from '../utils/safetyFacilities';
import { useApp } from '../store/appStore';
import { useState } from 'react';

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
  const { destination } = useApp();
  const { hasDestination, destinationName } = getRouteDestinationContext(destination);
  const route = resolveRoute(mockRoutes, id) ?? mockRoutes[0];
  const [sheetOpen, setSheetOpen] = useState(true);

  // 목적지가 없으면(직접 진입·새로고침·잘못된 링크) 어디로 가는지 모르는 경로를
  // "안심귀가 시작"으로 노출하지 않는다 — 검색으로 유도(RouteComparison/ConfirmLocation 가드와 동일).
  if (!hasDestination) {
    return (
      <div data-testid="no-destination-guard" className="flex flex-col h-full bg-slate-800 items-center justify-center text-center px-8 gap-4">
        <div className="w-14 h-14 rounded-full bg-slate-700 border border-slate-600 flex items-center justify-center text-slate-400">
          <MapPin className="w-6 h-6" />
        </div>
        <p className="text-slate-300 font-medium">선택된 목적지가 없어요</p>
        <p className="text-slate-400 text-sm">목적지를 검색하면 안심 경로를 안내해 드려요.</p>
        <Button onClick={() => navigate('/place-search')} className="rounded-[20px]">
          목적지 검색하기
        </Button>
      </div>
    );
  }

  // Example POIs specific to route detail
  const detailPois: any[] = [
    { type: 'start', x: 20, y: 80 },
    { type: 'end', x: 80, y: 20 },
    { type: 'cctv', x: 35, y: 70 },
    { type: 'cctv', x: 50, y: 60 },
    { type: 'bell', x: 45, y: 65 },
    { type: 'store', x: 65, y: 40 },
    { type: 'police', x: 75, y: 30 },
  ];

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
        <MapMock showRoute routeType={route.type as any} pois={detailPois} zoom={1.5} />
      </div>

      <BottomSheet isOpen={sheetOpen} onClose={() => {}} hideClose>
        <div className="pb-2">
          {/* 목적지 컨텍스트 — 어떤 목적지로 가는 경로인지 명시(실데이터). */}
          <div className="flex items-center gap-2 mb-4 bg-slate-700 border border-slate-600 rounded-[16px] px-3.5 py-2.5">
            <div className="w-2.5 h-2.5 rounded-full bg-blue-400 shrink-0" />
            <span className="text-slate-300 text-sm font-medium whitespace-nowrap">현재 위치</span>
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
              <Tag key={i} variant={tag.variant as any} icon={tag.icon}>
                {tag.text}
              </Tag>
            ))}
          </div>

          {/* 이 경로의 안심 시설 — 지도에 표시된 POI 개수를 그대로 요약(실표시 일치). */}
          {facilityItems.length > 0 && (
            <div data-testid="safety-facility-summary" className="mb-8 bg-slate-700 border border-slate-600 rounded-[20px] px-4 py-3.5">
              <p className="text-slate-400 text-xs font-medium mb-2.5">이 경로의 안심 시설</p>
              <div className="flex flex-wrap gap-x-5 gap-y-2">
                {facilityItems.map((item) => {
                  const { Icon, color } = FACILITY_ICON[item.type];
                  return (
                    <div key={item.type} className="flex items-center gap-1.5">
                      <Icon className={`w-4 h-4 ${color}`} aria-hidden="true" />
                      <span className="text-slate-200 text-sm font-medium">{item.label}</span>
                      <span className="text-slate-50 text-sm font-bold">{item.count}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="flex flex-col gap-3">
            <Button data-testid="start-navigation-btn" size="lg" className="h-16 text-xl shadow-[0_8px_20px_rgba(37,99,235,0.2)] rounded-[24px]" onClick={() => navigate('/navigate', { state: { routeId: route.id } })}>
              <Navigation2 className="w-6 h-6 mr-2" />
              안심귀가 시작
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
