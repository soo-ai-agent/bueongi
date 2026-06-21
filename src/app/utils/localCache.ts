/**
 * 앱 로컬 데이터 캐시.
 *
 * 설계의 SQLite 테이블(safe_return_path/item/svc, cdn_asset_cache)을 웹 빌드에서
 * localStorage 기반 버전·신선도 캐시로 구현한다. 네이티브 빌드에서는 동일 인터페이스를
 * SQLite 구현으로 교체할 수 있도록 읽기/쓰기/신선도 판정을 한 곳에 모은다.
 *
 * 거짓확신 방지: 저장 실패(Safari 프라이빗/quota)는 false로 표면화하고, 읽기 시
 * 스키마 버전/페이로드 손상은 null로 처리해 깨진 캐시를 점수 계산에 넣지 않는다.
 */

export interface CachedEnvelope<T> {
  /** 캐시 스키마 버전. 코드 변경으로 구조가 바뀌면 올려 기존 캐시를 무효화한다. */
  schema: number;
  /** 원천 데이터 버전(예: manifest version, A-1 갱신월). 불일치 시 갱신. */
  version: string;
  /** 저장 시각(epoch ms). 신선도(월1회 등) 판정용. */
  savedAt: number;
  payload: T;
}

const KEY_PREFIX = 'bueongi-cache:';
export const DAY_MS = 24 * 60 * 60 * 1000;
/** A-1/A-2/A-3 월1회 갱신 기준(30일). */
export const MONTH_MS = 30 * DAY_MS;

function storage(): Storage | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage;
  } catch {
    // 일부 브라우저는 접근 자체가 SecurityError를 던진다.
    return null;
  }
}

function storageKey(table: string): string {
  return `${KEY_PREFIX}${table}`;
}

/** 캐시 봉투를 읽는다. 없음/손상/스키마 불일치는 null. */
export function readCache<T>(table: string, schema: number): CachedEnvelope<T> | null {
  const store = storage();
  if (!store) return null;
  let raw: string | null;
  try {
    raw = store.getItem(storageKey(table));
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<CachedEnvelope<T>>;
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      parsed.schema !== schema ||
      typeof parsed.version !== 'string' ||
      typeof parsed.savedAt !== 'number' ||
      !('payload' in parsed)
    ) {
      return null;
    }
    return parsed as CachedEnvelope<T>;
  } catch {
    return null;
  }
}

/** 캐시 봉투를 저장한다. 저장 성공 여부를 반환(거짓확신 방지). */
export function writeCache<T>(
  table: string,
  schema: number,
  version: string,
  payload: T,
  now: number = Date.now(),
): boolean {
  const store = storage();
  if (!store) return false;
  const envelope: CachedEnvelope<T> = { schema, version, savedAt: now, payload };
  try {
    store.setItem(storageKey(table), JSON.stringify(envelope));
    return true;
  } catch {
    return false;
  }
}

/** 캐시를 비운다(자치구 변경 등으로 재다운로드가 필요할 때). */
export function clearCache(table: string): void {
  const store = storage();
  if (!store) return;
  try {
    store.removeItem(storageKey(table));
  } catch {
    // 삭제 실패는 다음 쓰기가 덮어쓰므로 무시.
  }
}

/**
 * 캐시를 갱신해야 하는지 판정한다.
 * - 캐시 없음 → 갱신
 * - 원천 버전 불일치(manifest/갱신월 변경) → 갱신
 * - 신선도 초과(maxAgeMs, 예: 월1회) → 갱신
 */
export function shouldRefresh(
  cache: CachedEnvelope<unknown> | null,
  expectedVersion: string,
  maxAgeMs: number,
  now: number = Date.now(),
): boolean {
  if (!cache) return true;
  if (cache.version !== expectedVersion) return true;
  return now - cache.savedAt >= maxAgeMs;
}
