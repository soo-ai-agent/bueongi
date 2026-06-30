// 경로 상세 지도에 표시되는 안심 시설 POI를 집계해, 사용자가 경로의 안전성을
// 정량적으로 파악하도록 요약을 만든다. 지도에 렌더된 pois 배열을 그대로 세므로
// 화면에 보이는 것과 항상 일치한다(없는 데이터를 지어내지 않음).

export type SafetyFacilityType = 'cctv' | 'bell' | 'store' | 'police';

// MapMock 의 POI 와 구조 호환. start/end 등 안심 시설이 아닌 타입은 집계에서 제외한다.
export interface FacilityPoi {
  type: string;
}

export interface SafetyFacilitySummary {
  cctv: number;
  bell: number;
  store: number;
  police: number;
  /** 안심 시설 합계(start/end 제외) */
  total: number;
}

/**
 * 경로 POI 목록에서 안심 시설(CCTV/비상벨/편의점/파출소) 개수를 집계한다.
 * - 알 수 없는 타입(start/end/오타)은 무시한다.
 * - 빈 목록/누락 입력은 모두 0으로 안전 처리.
 */
export function summarizeSafetyFacilities(
  pois: readonly FacilityPoi[] | null | undefined,
): SafetyFacilitySummary {
  const summary: SafetyFacilitySummary = {
    cctv: 0,
    bell: 0,
    store: 0,
    police: 0,
    total: 0,
  };
  if (!pois) return summary;
  for (const poi of pois) {
    switch (poi?.type) {
      case 'cctv':
        summary.cctv++;
        summary.total++;
        break;
      case 'bell':
        summary.bell++;
        summary.total++;
        break;
      case 'store':
        summary.store++;
        summary.total++;
        break;
      case 'police':
        summary.police++;
        summary.total++;
        break;
      default:
        break;
    }
  }
  return summary;
}

/** 요약 UI 렌더용 항목(개수 0인 시설은 호출부에서 숨김 처리). */
export interface SafetyFacilityItem {
  type: SafetyFacilityType;
  label: string;
  count: number;
}

export function toSafetyFacilityItems(
  summary: SafetyFacilitySummary,
): SafetyFacilityItem[] {
  return [
    { type: 'cctv' as const, label: 'CCTV', count: summary.cctv },
    { type: 'bell' as const, label: '비상벨', count: summary.bell },
    { type: 'store' as const, label: '편의점', count: summary.store },
    { type: 'police' as const, label: '파출소', count: summary.police },
  ].filter((item) => item.count > 0);
}
