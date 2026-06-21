import type { LatLng } from './routeCompare';
import type { SafePath } from './cdnAssets';
import { getSeoulOpenApiKey } from './env';
import { MONTH_MS, readCache, shouldRefresh, writeCache } from './localCache';

/**
 * 서울 안심귀갓길 A-1/A-2/A-3 — 앱 직접 호출 후 로컬 캐시.
 *
 * 설계 기준:
 * - 첫 실행 1회 다운로드 후 월1회 갱신, 서울 진입 시 우선 갱신.
 * - A-1 경로(tbSafeReturnPath)는 보너스 겹침 계산용 좌표열, A-2(tbSafeReturnItem)는
 *   안심벨/CCTV 포인트, A-3(tbSafeReturnSvc)는 지킴이집/안심택배함 포인트.
 * - 인증키는 빌드 시 주입, 호출부에서 로그에 남기지 않는다.
 * - 캐시(로컬)는 설계의 SQLite 테이블(safe_return_path/item/svc)을 웹 빌드에서 대신한다.
 *
 * NOTE: 서울 열린데이터광장 원천 컬럼명은 데이터셋 버전에 따라 다를 수 있어, 좌표/지오메트리
 * 추출은 여러 후보 컬럼을 fallback으로 시도한다. 라이브 스키마 확정 시 키 목록만 좁히면 된다.
 */

export const SEOUL_OPENAPI_BASE = 'http://openapi.seoul.go.kr:8088';

export type SeoulDataset = 'tbSafeReturnPath' | 'tbSafeReturnItem' | 'tbSafeReturnSvc';

export interface SeoulSafeReturnOptions {
  apiKey?: string;
  base?: string;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
  /** 1-기반 시작/끝 인덱스(서울 API 페이지네이션). 기본 1~1000. */
  startIndex?: number;
  endIndex?: number;
}

const SCHEMA = 1;

function isFiniteInRange(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
}

function toNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

/** yyyy-mm 월 버전. 월1회 갱신 + 버전 불일치 무효화 키. */
export function currentMonthVersion(now: number = Date.now()): string {
  const d = new Date(now);
  const month = `${d.getUTCMonth() + 1}`.padStart(2, '0');
  return `${d.getUTCFullYear()}-${month}`;
}

function buildUrl(base: string, key: string, dataset: SeoulDataset, start: number, end: number): string {
  return `${base.replace(/\/+$/, '')}/${key}/json/${dataset}/${start}/${end}/`;
}

/** 서울 API JSON 응답에서 row 배열을 꺼낸다. RESULT 코드가 정상(INFO-000)이 아니면 throw. */
export function extractSeoulRows(payload: unknown, dataset: SeoulDataset): Record<string, unknown>[] {
  if (typeof payload !== 'object' || payload === null) {
    throw new Error('서울 안심귀갓길 응답이 객체가 아닙니다');
  }
  const block = (payload as Record<string, unknown>)[dataset];
  if (typeof block !== 'object' || block === null) {
    throw new Error(`서울 안심귀갓길 응답에 ${dataset} 블록이 없습니다`);
  }
  const result = (block as { RESULT?: { CODE?: unknown } }).RESULT;
  const code = result?.CODE;
  if (typeof code === 'string' && code !== 'INFO-000') {
    throw new Error(`서울 안심귀갓길 API 오류: ${code}`);
  }
  const rows = (block as { row?: unknown }).row;
  return Array.isArray(rows) ? (rows as Record<string, unknown>[]) : [];
}

/** WKT LINESTRING/MULTILINESTRING 문자열에서 좌표열을 파싱한다. */
export function parseWktLineString(wkt: string): LatLng[] {
  // 좌표 쌍 'lng lat' 추출(서울 데이터는 경도 위도 순 WKT가 일반적).
  const coords: LatLng[] = [];
  const matches = wkt.match(/-?\d+\.\d+\s+-?\d+\.\d+/g);
  if (!matches) return coords;
  for (const pair of matches) {
    const [lngStr, latStr] = pair.trim().split(/\s+/);
    const lng = Number(lngStr);
    const lat = Number(latStr);
    if (isFiniteInRange(lat, -90, 90) && isFiniteInRange(lng, -180, 180)) {
      coords.push({ lat, lng });
    }
  }
  return coords;
}

function firstString(row: Record<string, unknown>, keys: string[]): string | undefined {
  for (const k of keys) {
    const v = row[k];
    if (typeof v === 'string' && v.trim() !== '') return v;
  }
  return undefined;
}

function firstCoord(row: Record<string, unknown>, latKeys: string[], lngKeys: string[]): LatLng | null {
  let lat: number | null = null;
  let lng: number | null = null;
  for (const k of latKeys) {
    const n = toNumber(row[k]);
    if (n !== null) { lat = n; break; }
  }
  for (const k of lngKeys) {
    const n = toNumber(row[k]);
    if (n !== null) { lng = n; break; }
  }
  if (lat !== null && lng !== null && isFiniteInRange(lat, -90, 90) && isFiniteInRange(lng, -180, 180)) {
    return { lat, lng };
  }
  return null;
}

/** A-1 경로 행 → SafePath(좌표열). 지오메트리 WKT 우선, 없으면 시작/끝 점으로 폴백. */
export function parseSafeReturnPath(row: Record<string, unknown>, index: number): SafePath | null {
  const wkt = firstString(row, ['WKT', 'LINK_GEOM', 'GEOM', 'geometry', 'LINE_GEOM']);
  let coords: LatLng[] = wkt ? parseWktLineString(wkt) : [];
  if (coords.length < 2) {
    const start = firstCoord(row, ['START_Y', 'STARTY', 'YCRD_S'], ['START_X', 'STARTX', 'XCRD_S']);
    const end = firstCoord(row, ['END_Y', 'ENDY', 'YCRD_E'], ['END_X', 'ENDX', 'XCRD_E']);
    if (start && end) coords = [start, end];
  }
  if (coords.length < 2) return null;
  const id = firstString(row, ['LINK_ID', 'ID', 'PATH_ID']) ?? `a1-${index}`;
  return { id, coords };
}

/** A-2/A-3 시설 행 → SafetyPoint 좌표(점). */
export function parseSafeReturnPoint(row: Record<string, unknown>): LatLng | null {
  return firstCoord(
    row,
    ['LAT', 'YCRD', 'Y', 'LA', 'WGS84_Y', 'LATITUDE'],
    ['LNG', 'XCRD', 'X', 'LO', 'WGS84_X', 'LONGITUDE'],
  );
}

async function fetchSeoulRows(dataset: SeoulDataset, options: SeoulSafeReturnOptions): Promise<Record<string, unknown>[]> {
  const key = options.apiKey ?? getSeoulOpenApiKey();
  if (!key) throw new Error('서울 열린데이터 인증키가 없습니다(VITE_SEOUL_OPENAPI_KEY)');
  const base = options.base ?? SEOUL_OPENAPI_BASE;
  const start = options.startIndex ?? 1;
  const end = options.endIndex ?? 1000;
  const fetcher = options.fetchImpl ?? fetch;
  const response = await fetcher(buildUrl(base, key, dataset, start, end), {
    method: 'GET',
    headers: { Accept: 'application/json' },
    signal: options.signal,
  });
  if (!response.ok) throw new Error(`서울 안심귀갓길 ${dataset} 호출 실패: ${response.status}`);
  return extractSeoulRows(await response.json(), dataset);
}

interface CachedLoadOptions extends SeoulSafeReturnOptions {
  /** 서울 진입 우선 갱신: 신선도와 무관하게 강제 재다운로드. */
  forceRefresh?: boolean;
  monthVersion?: string;
  now?: number;
}

async function loadCached<T>(
  table: string,
  dataset: SeoulDataset,
  parse: (rows: Record<string, unknown>[]) => T[],
  options: CachedLoadOptions,
): Promise<T[]> {
  const now = options.now ?? Date.now();
  const version = options.monthVersion ?? currentMonthVersion(now);
  const cached = readCache<T[]>(table, SCHEMA);
  if (!options.forceRefresh && !shouldRefresh(cached, version, MONTH_MS, now) && cached) {
    return cached.payload;
  }
  const rows = await fetchSeoulRows(dataset, options);
  const parsed = parse(rows);
  writeCache(table, SCHEMA, version, parsed, now);
  return parsed;
}

/** A-1 서울 안심귀갓길 경로(보너스 겹침용). */
export function loadSeoulSafePaths(options: CachedLoadOptions = {}): Promise<SafePath[]> {
  return loadCached('a1:paths', 'tbSafeReturnPath', (rows) =>
    rows.map((r, i) => parseSafeReturnPath(r, i)).filter((p): p is SafePath => p !== null),
    options,
  );
}

/** A-2 서울 안전시설물(안심벨/CCTV 포인트). */
export function loadSeoulSafeItems(options: CachedLoadOptions = {}): Promise<LatLng[]> {
  return loadCached('a2:items', 'tbSafeReturnItem', (rows) =>
    rows.map(parseSafeReturnPoint).filter((p): p is LatLng => p !== null),
    options,
  );
}

/** A-3 서울 서비스시설물(지킴이집/안심택배함 포인트). */
export function loadSeoulSafeSvc(options: CachedLoadOptions = {}): Promise<LatLng[]> {
  return loadCached('a3:svc', 'tbSafeReturnSvc', (rows) =>
    rows.map(parseSafeReturnPoint).filter((p): p is LatLng => p !== null),
    options,
  );
}
