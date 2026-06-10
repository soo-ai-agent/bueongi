import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

export interface Destination {
  name: string;
  address: string;
}

export interface SavedPlace {
  /** 미설정이면 null */
  address: string | null;
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
    { name: '강남역 2번 출구', address: '서울 강남구 강남대로' },
    { name: '스타벅스 신사점', address: '서울 강남구 도산대로' },
  ],
  savedPlaces: {
    home: { address: '서울 강남구 역삼로' },
    school: { address: null },
    work: { address: null },
  },
  contacts: [{ id: 1, name: '아빠', phone: '010-1234-5678' }],
};

function loadState(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return initialState;
    const parsed = JSON.parse(raw) as Partial<AppState>;
    return {
      destination: parsed.destination ?? null,
      recentDestinations: parsed.recentDestinations ?? initialState.recentDestinations,
      savedPlaces: { ...initialState.savedPlaces, ...(parsed.savedPlaces ?? {}) },
      contacts: parsed.contacts ?? initialState.contacts,
    };
  } catch {
    return initialState;
  }
}

interface AppStore extends AppState {
  /** 목적지 선택 + 최근 목적지에 반영 */
  selectDestination: (dest: Destination) => void;
  setSavedPlace: (key: SavedPlaceKey, address: string | null) => void;
  addContact: (name: string, phone: string) => boolean;
  removeContact: (id: number) => void;
  /** 1순위 긴급 연락처(없으면 null) */
  primaryContact: EmergencyContact | null;
}

const AppContext = createContext<AppStore | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState>(loadState);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      /* 저장 실패는 무시(프라이빗 모드 등) */
    }
  }, [state]);

  const selectDestination = (dest: Destination) => {
    setState((prev) => {
      const recents = [dest, ...prev.recentDestinations.filter((d) => d.name !== dest.name)].slice(
        0,
        MAX_RECENTS,
      );
      return { ...prev, destination: dest, recentDestinations: recents };
    });
  };

  const setSavedPlace = (key: SavedPlaceKey, address: string | null) => {
    setState((prev) => ({
      ...prev,
      savedPlaces: { ...prev.savedPlaces, [key]: { address } },
    }));
  };

  const addContact = (name: string, phone: string): boolean => {
    let added = false;
    setState((prev) => {
      if (prev.contacts.length >= MAX_CONTACTS) return prev;
      const nextId = prev.contacts.reduce((max, c) => Math.max(max, c.id), 0) + 1;
      added = true;
      return { ...prev, contacts: [...prev.contacts, { id: nextId, name, phone }] };
    });
    return added;
  };

  const removeContact = (id: number) => {
    setState((prev) => ({ ...prev, contacts: prev.contacts.filter((c) => c.id !== id) }));
  };

  const value: AppStore = {
    ...state,
    selectDestination,
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
