import type { LatLng } from './routeCompare';
import { getCdnBaseUrl } from './env';
import { MONTH_MS, readCache, shouldRefresh, writeCache } from './localCache';

/**
 * 정적 안심 데이터 CDN 로더.
 *
 * 설계 기준:
 * - 자치구 변경/`manifest.json` 버전 변경 시에만 재다운로드하고, 그 외엔 로컬 캐시를 쓴다.
 * - 좌표는 WGS84 {lat,lng}. 범위 밖/손상 아이템은 버려 점수·마커 계산에 넣지 않는다.
 * - 파일은 현재 위치의 시군구코드로 결정적으로 선택한다(cctv/{시군구코드}.json 등).
 */

export type SafetyAssetType =
  | 'cctv'
  | 'safehouse'
  | 'police'
  | 'lamp'
  | 'emergency_bell'
  | 'safepath';

/** CDN 표준 아이템(점 데이터). */
export interface SafetyPoint {
  id: string;
  type: SafetyAssetType;
  name?: string;
  address?: string;
  lat: number;
  lng: number;
  sigunguCode?: string;
  properties?: Record<string, unknown>;
}

/** 파출소/지구대: 전화 연결을 위한 tel을 properties에서 끌어올린 점. */
export interface PolicePoint extends SafetyPoint {
  tel?: string;
}

/** 안심귀갓길(A-4) 경로 라인. 좌표열로 보너스 겹침을 계산한다. */
export interface SafePath {
  id: string;
  coords: LatLng[];
  sigunguCode?: string;
}

export interface CdnManifest {
  version: string;
  generatedAt?: string;
  /** 파일별 버전/건수. 파일 단위 무효화에 쓴다. */
  files?: Record<string, { version?: string; count?: number } | undefined>;
}

const SCHEMA = 1;

export interface CdnClientOptions {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
  /** 신선도 상한(ms). 기본 월1회. manifest 버전이 바뀌면 즉시 무효화된다. */
  maxAgeMs?: number;
  now?: number;
}

function isFiniteInRange(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
}

function isValidLatLng(lat: unknown, lng: unknown): boolean {
  return isFiniteInRange(lat, -90, 90) && isFiniteInRange(lng, -180, 180);
}

function resolveBaseUrl(options: CdnClientOptions): string {
  const base = options.baseUrl ?? getCdnBaseUrl();
  if (!base) throw new Error('CDN base URL이 설정되지 않았습니다(VITE_CDN_BASE_URL).');
  return base.replace(/\/+$/, '');
}

async function fetchJson(url: string, options: CdnClientOptions): Promise<unknown> {
  const fetcher = options.fetchImpl ?? fetch;
  const response = await fetcher(url, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    signal: options.signal,
  });
  if (!response.ok) {
    throw new Error(`CDN fetch failed: ${response.status} ${url}`);
  }
  return response.json();
}

export function toSafetyPoint(value: unknown, fallbackType: SafetyAssetType): SafetyPoint | null {
  if (typeof value !== 'object' || value === null) return null;
  const item = value as Record<string, unknown>;
  if (!isValidLatLng(item.lat, item.lng)) return null;
  const type = typeof item.type === 'string' ? (item.type as SafetyAssetType) : fallbackType;
  return {
    id: typeof item.id === 'string' ? item.id : `${type}-${item.lat},${item.lng}`,
    type,
    ...(typeof item.name === 'string' ? { name: item.name } : {}),
    ...(typeof item.address === 'string' ? { address: item.address } : {}),
    lat: item.lat as number,
    lng: item.lng as number,
    ...(typeof item.sigunguCode === 'string' ? { sigunguCode: item.sigunguCode } : {}),
    ...(typeof item.properties === 'object' && item.properties !== null
      ? { properties: item.properties as Record<string, unknown> }
      : {}),
  };
}

function toPolicePoint(value: unknown): PolicePoint | null {
  const base = toSafetyPoint(value, 'police');
  if (!base) return null;
  const props = base.properties ?? {};
  const telRaw = props.tel ?? props.phone ?? props.telephone;
  return {
    ...base,
    ...(typeof telRaw === 'string' && telRaw.trim() ? { tel: telRaw.trim() } : {}),
  };
}

function toSafePath(value: unknown): SafePath | null {
  if (typeof value !== 'object' || value === null) return null;
  const item = value as Record<string, unknown>;
  const rawCoords = item.coords ?? item.path ?? item.line;
  if (!Array.isArray(rawCoords)) return null;
  const coords: LatLng[] = [];
  for (const c of rawCoords) {
    if (Array.isArray(c) && isValidLatLng(c[1], c[0])) {
      // GeoJSON 관례: [lng, lat]
      coords.push({ lat: c[1] as number, lng: c[0] as number });
    } else if (typeof c === 'object' && c !== null) {
      const p = c as Record<string, unknown>;
      if (isValidLatLng(p.lat, p.lng)) coords.push({ lat: p.lat as number, lng: p.lng as number });
    }
  }
  if (coords.length < 2) return null;
  return {
    id: typeof item.id === 'string' ? item.id : `safepath-${coords[0].lat},${coords[0].lng}`,
    coords,
    ...(typeof item.sigunguCode === 'string' ? { sigunguCode: item.sigunguCode } : {}),
  };
}

function extractArray(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  if (typeof payload === 'object' && payload !== null) {
    const items = (payload as { items?: unknown }).items;
    if (Array.isArray(items)) return items;
  }
  return [];
}

export async function loadManifest(options: CdnClientOptions = {}): Promise<CdnManifest> {
  const base = resolveBaseUrl(options);
  const payload = await fetchJson(`${base}/manifest.json`, options);
  if (typeof payload !== 'object' || payload === null || typeof (payload as CdnManifest).version !== 'string') {
    throw new Error('manifest.json에 version 문자열이 없습니다.');
  }
  return payload as CdnManifest;
}

/**
 * CDN 파일을 캐시 우선으로 로드한다.
 * - manifest 버전(또는 fileVersion)이 캐시와 같고 신선도 안이면 네트워크 없이 캐시 반환.
 * - 아니면 재다운로드 후 파싱·캐시.
 */
async function loadCachedArray<T>(
  table: string,
  path: string,
  expectedVersion: string,
  parse: (value: unknown) => T | null,
  options: CdnClientOptions,
): Promise<T[]> {
  const maxAge = options.maxAgeMs ?? MONTH_MS;
  const now = options.now ?? Date.now();
  const cached = readCache<T[]>(table, SCHEMA);
  if (!shouldRefresh(cached, expectedVersion, maxAge, now) && cached) {
    return cached.payload;
  }

  const base = resolveBaseUrl(options);
  const payload = await fetchJson(`${base}/${path}`, options);
  const parsed = extractArray(payload)
    .map(parse)
    .filter((x): x is T => x !== null);
  writeCache(table, SCHEMA, expectedVersion, parsed, now);
  return parsed;
}

export function loadCctv(sigunguCode: string, version: string, options: CdnClientOptions = {}): Promise<SafetyPoint[]> {
  return loadCachedArray(`cctv:${sigunguCode}`, `cctv/${sigunguCode}.json`, version, (v) => toSafetyPoint(v, 'cctv'), options);
}

export function loadSafehouse(version: string, options: CdnClientOptions = {}): Promise<SafetyPoint[]> {
  return loadCachedArray('safehouse:all', 'safehouse/all.json', version, (v) => toSafetyPoint(v, 'safehouse'), options);
}

export function loadEmergencyBell(sigunguCode: string, version: string, options: CdnClientOptions = {}): Promise<SafetyPoint[]> {
  return loadCachedArray(
    `emergency_bell:${sigunguCode}`,
    `emergency_bell/${sigunguCode}.json`,
    version,
    (v) => toSafetyPoint(v, 'emergency_bell'),
    options,
  );
}

export function loadLamp(sigunguCode: string, version: string, options: CdnClientOptions = {}): Promise<SafetyPoint[]> {
  // 서울은 정밀 가로등 파일(lamp/seoul.json), 그 외는 보안등 자치구 파일.
  const file = sigunguCode === 'seoul' ? 'lamp/seoul.json' : `lamp/${sigunguCode}.json`;
  return loadCachedArray(`lamp:${sigunguCode}`, file, version, (v) => toSafetyPoint(v, 'lamp'), options);
}

export function loadPolice(version: string, options: CdnClientOptions = {}): Promise<PolicePoint[]> {
  return loadCachedArray('police:all', 'police/all.json', version, toPolicePoint, options);
}

/**
 * 캐시에 있는 파출소 목록을 네트워크 없이 그대로 읽는다(최근접 파출소 오프라인 검색용).
 * 버전/신선도와 무관하게 마지막 캐시를 돌려준다 — 위급 상황은 오래된 좌표라도 없는 것보다 낫다.
 */
export function readCachedPolice(): PolicePoint[] | null {
  return readCache<PolicePoint[]>('police:all', SCHEMA)?.payload ?? null;
}

export function loadSafepath(version: string, options: CdnClientOptions = {}): Promise<SafePath[]> {
  return loadCachedArray('safepath:all', 'safepath/all.json', version, toSafePath, options);
}

/** manifest에서 파일 버전을 끌어온다. 없으면 manifest 전체 버전으로 폴백. */
export function fileVersion(manifest: CdnManifest, file: string): string {
  return manifest.files?.[file]?.version ?? manifest.version;
}
