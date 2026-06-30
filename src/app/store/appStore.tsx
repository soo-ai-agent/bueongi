import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { persistAppState } from './persist';
import type { LatLng, RouteOption } from '../utils/routeCompare';

export interface Destination {
  name: string;
  address: string;
  /** 백엔드 PlaceItem 계약과 동일한 WGS84 위도 */
  lat: number;
  /** 백엔드 PlaceItem 계약과 동일한 WGS84 경도 */
  lng: number;
}

export interface SavedPlace {
  /** 선택한 장소명. 구버전 저장값이면 null일 수 있음 */
  name: string | null;
  /** 미설정이면 null */
  address: string | null;
  /** 미설정/구버전 저장값이면 null */
  lat: number | null;
  /** 미설정/구버전 저장값이면 null */
  lng: number | null;
}

export interface EmergencyContact {
  id: number;
  name: string;
  phone: string;
}

export type SavedPlaceKey = 'home' | 'school' | 'work';

export interface AppState {
  /** 현재 선택한 목적지(경로 안내 대상) */
  destination: Destination | null;
  /** 홈/검색의 "최근 목적지" 목록 (최신순) */
  recentDestinations: Destination[];
  /** 자주 가는 장소 */
  savedPlaces: Record<SavedPlaceKey, SavedPlace>;
  /** 긴급 연락처 (최대 3명) */
  contacts: EmergencyContact[];
}

const STORAGE_KEY = 'bueongi-app-state-v1';
const MAX_RECENTS = 5;
export const MAX_CONTACTS = 3;

const initialState: AppState = {
  destination: null,
  recentDestinations: [
    { name: '강남역 2번 출구', address: '서울 강남구 강남대로', lat: 37.4979, lng: 127.0276 },
    { name: '스타벅스 신사점', address: '서울 강남구 도산대로', lat: 37.5228, lng: 127.0219 },
  ],
  savedPlaces: {
    home: { name: '집', address: '서울 강남구 역삼로', lat: 37.5003, lng: 127.0365 },
    school: { name: null, address: null, lat: null, lng: null },
    work: { name: null, address: null, lat: null, lng: null },
  },
  contacts: [{ id: 1, name: '아빠', phone: '010-1234-5678' }],
};

function normalizeSavedPlace(place: Partial<SavedPlace> | null | undefined): SavedPlace {
  if (!place) return { name: null, address: null, lat: null, lng: null };
  return {
    name: typeof place.name === 'string' ? place.name : null,
    address: typeof place.address === 'string' ? place.address : null,
    lat: typeof place.lat === 'number' && Number.isFinite(place.lat) ? place.lat : null,
    lng: typeof place.lng === 'number' && Number.isFinite(place.lng) ? place.lng : null,
  };
}

function savedPlaceFromDestination(place: Destination | null): SavedPlace {
  if (!place) return { name: null, address: null, lat: null, lng: null };
  return { name: place.name, address: place.address, lat: place.lat, lng: place.lng };
}

function loadState(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return initialState;
    const parsed = JSON.parse(raw) as Partial<AppState>;
    const savedPlaces = (parsed.savedPlaces ?? {}) as Partial<Record<SavedPlaceKey, Partial<SavedPlace>>>;
    return {
      destination: parsed.destination ?? null,
      recentDestinations: parsed.recentDestinations ?? initialState.recentDestinations,
      savedPlaces: {
        home: normalizeSavedPlace(savedPlaces.home ?? initialState.savedPlaces.home),
        school: normalizeSavedPlace(savedPlaces.school ?? initialState.savedPlaces.school),
        work: normalizeSavedPlace(savedPlaces.work ?? initialState.savedPlaces.work),
      },
      contacts: parsed.contacts ?? initialState.contacts,
    };
  } catch {
    return initialState;
  }
}

/**
 * 연락처를 삭제한 다음 상태를 만들고 영속을 시도한다(순수 — provider 밖에서 테스트 가능).
 * 영속 실패(persisted=false) 시 호출부가 거짓 "삭제됨" 대신 정직 안내를 하도록 표면화한다.
 * (삭제는 payload 축소라 quota 초과는 드물지만, Safari 프라이빗 모드는 setItem이 무조건
 *  throw → 삭제 미영속 → 새로고침 시 삭제한 연락처 재출현. 안전앱 거짓확신을 막아야 한다.)
 */
export function removeContactFromState(
  state: AppState,
  id: number,
): { next: AppState; persisted: boolean } {
  const next: AppState = {
    ...state,
    contacts: state.contacts.filter((c) => c.id !== id),
  };
  return { next, persisted: persistAppState(STORAGE_KEY, next) };
}

/** 진행 중인 위치 공유의 식별/제어 정보(세션 전용). token=읽기(공유 URL), ownerSecret=쓰기·종료 비밀. */
export interface ActiveShare {
  token: string;
  ownerSecret: string;
}

interface AppStore extends AppState {
  /** 이번 세션에서 명시적으로 확인한 출발지(현재 위치). 개인정보라 localStorage에 영속하지 않는다. */
  routeOrigin: LatLng | null;
  /** 이번 세션에서 백엔드 compare API로 받은 경로 후보. 새로고침 시 mock route 폴백을 유지한다. */
  apiRouteOptions: RouteOption[];
  /**
   * 진행 중인 위치 공유(없으면 null). 공유 화면(/share)에서 발급한 읽기 토큰 + 쓰기 비밀(ownerSecret)을 담는다.
   * 귀가완료(도착) 시 길안내 화면이 이 비밀로 공유를 종료한다. 개인정보라 영속하지 않는다(세션 전용).
   */
  activeShare: ActiveShare | null;
  /** 진행 중 공유 설정/해제. 공유 시작 시 {token, ownerSecret}, 종료 시 null. */
  setActiveShare: (share: ActiveShare | null) => void;
  /** 목적지 선택 + 최근 목적지에 반영 */
  selectDestination: (dest: Destination) => void;
  /** 현재 위치 기반 경로 요청 origin 설정(비영속) */
  setRouteOrigin: (origin: LatLng | null) => void;
  /** compare API 결과를 상세 화면까지 넘기기 위한 세션 전용 경로 후보 설정 */
  setApiRouteOptions: (routes: RouteOption[]) => void;
  /** @returns 영속(localStorage 저장) 성공 여부 — false면 비영속(in-memory만) */
  setSavedPlace: (key: SavedPlaceKey, place: Destination | null) => boolean;
  /** added: 등록 여부(정원 초과 시 false), persisted: 영속 성공 여부(false면 비영속) */
  addContact: (name: string, phone: string) => { added: boolean; persisted: boolean };
  /** @returns 영속(localStorage 저장) 성공 여부 — false면 비영속(새로고침 시 삭제가 되돌아갈 수 있음) */
  removeContact: (id: number) => boolean;
  /** 1순위 긴급 연락처(없으면 null) */
  primaryContact: EmergencyContact | null;
}

const AppContext = createContext<AppStore | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState>(loadState);
  const [routeOrigin, setRouteOriginState] = useState<LatLng | null>(null);
  const [apiRouteOptions, setApiRouteOptionsState] = useState<RouteOption[]>([]);
  const [activeShare, setActiveShare] = useState<ActiveShare | null>(null);

  // 전체 상태 영속(폴백). 안전 데이터 setter는 아래에서 동기 persist 결과를 직접 반환한다.
  useEffect(() => {
    persistAppState(STORAGE_KEY, state);
  }, [state]);

  const selectDestination = (dest: Destination) => {
    setApiRouteOptionsState([]);
    setState((prev) => {
      const recents = [dest, ...prev.recentDestinations.filter((d) => d.name !== dest.name)].slice(
        0,
        MAX_RECENTS,
      );
      return { ...prev, destination: dest, recentDestinations: recents };
    });
  };

  const setRouteOrigin = (origin: LatLng | null) => {
    setApiRouteOptionsState([]);
    setRouteOriginState(origin);
  };

  const setApiRouteOptions = (routes: RouteOption[]) => {
    setApiRouteOptionsState(routes);
  };

  const setSavedPlace = (key: SavedPlaceKey, place: Destination | null): boolean => {
    const next: AppState = {
      ...state,
      savedPlaces: { ...state.savedPlaces, [key]: savedPlaceFromDestination(place) },
    };
    const persisted = persistAppState(STORAGE_KEY, next);
    setState(next);
    return persisted;
  };

  const addContact = (name: string, phone: string): { added: boolean; persisted: boolean } => {
    if (state.contacts.length >= MAX_CONTACTS) return { added: false, persisted: true };
    const nextId = state.contacts.reduce((max, c) => Math.max(max, c.id), 0) + 1;
    const next: AppState = {
      ...state,
      contacts: [...state.contacts, { id: nextId, name, phone }],
    };
    const persisted = persistAppState(STORAGE_KEY, next);
    setState(next);
    return { added: true, persisted };
  };

  const removeContact = (id: number): boolean => {
    // setSavedPlace/addContact와 동일하게 동기 persist로 영속 성공여부를 표면화한다.
    // 비영속(Safari 프라이빗 모드 등)인데 "삭제됨"으로 단언하면 새로고침 시 삭제한
    // 연락처가 되살아나 위급 시 의도치 않은 사람에게 알림이 갈 수 있다(안전 거짓확신).
    const { next, persisted } = removeContactFromState(state, id);
    setState(next);
    return persisted;
  };

  const value: AppStore = {
    ...state,
    routeOrigin,
    apiRouteOptions,
    activeShare,
    setActiveShare,
    selectDestination,
    setRouteOrigin,
    setApiRouteOptions,
    setSavedPlace,
    addContact,
    removeContact,
    primaryContact: state.contacts[0] ?? null,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppStore {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
