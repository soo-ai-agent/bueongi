import type { LatLng } from './routeCompare';
import { getShareApiBaseUrl } from './env';

/**
 * 위치 공유 서버 클라이언트(작업 5).
 *
 * 설계 계약(4개 엔드포인트, 1~3시간 TTL):
 * - POST /share/create               { expires_in_hours: 1|2|3 } -> { token, share_url, expires_at }
 * - POST /share/{token}/location     { lat, lng }                -> { updated_at, expires_at }
 * - GET  /share/{token}/location                                 -> { lat, lng, updated_at, expired }
 * - GET  /share/{token}                                          -> 보호자 HTML(여긴 미사용, 웹 라우트가 대체)
 *
 * 앱은 share_url을 받아 OS 공유 시트/외부 메신저로 넘기고, 공유 중 5초마다 위치를 POST 한다.
 * 보호자 등록/페어링/푸시는 만들지 않는다. base URL 미설정 시 호출부가 정적 폴백으로 동작한다.
 */

export type ShareExpiresHours = 1 | 2 | 3;

export interface CreateShareResponse {
  token: string;
  shareUrl: string;
  expiresAt: string;
}

export interface UpdateLocationResponse {
  updatedAt: string;
  expiresAt?: string;
}

export interface ShareLocationResponse {
  lat: number | null;
  lng: number | null;
  updatedAt: string | null;
  expired: boolean;
}

export interface ShareClientOptions {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
}

function isFiniteInRange(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
}

function toShareLocationCoordinates(payload: Record<string, unknown>): Pick<ShareLocationResponse, 'lat' | 'lng'> {
  const lat = isFiniteInRange(payload.lat, -90, 90) ? payload.lat : null;
  const lng = isFiniteInRange(payload.lng, -180, 180) ? payload.lng : null;
  if (lat === null || lng === null) return { lat: null, lng: null };
  return { lat, lng };
}

export function isShareApiConfigured(baseUrl?: string): boolean {
  return Boolean(baseUrl ?? getShareApiBaseUrl());
}

function resolveBase(options: ShareClientOptions): string {
  const base = options.baseUrl ?? getShareApiBaseUrl();
  if (!base) throw new Error('위치 공유 서버 base URL이 없습니다(VITE_SHARE_API_BASE_URL)');
  return base.replace(/\/+$/, '');
}

function resolveToken(token: string): string {
  const trimmed = token.trim();
  if (!trimmed) throw new Error('위치 공유 토큰이 없습니다');
  return trimmed;
}

/** POST /share/create — 공유 토큰/URL 생성. TTL은 1~3시간만 허용(설계 기준). */
export async function createShare(
  expiresInHours: ShareExpiresHours,
  options: ShareClientOptions = {},
): Promise<CreateShareResponse> {
  if (expiresInHours !== 1 && expiresInHours !== 2 && expiresInHours !== 3) {
    throw new Error('공유 만료는 1, 2, 3시간만 허용됩니다');
  }
  const base = resolveBase(options);
  const fetcher = options.fetchImpl ?? fetch;
  const response = await fetcher(`${base}/share/create`, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ expires_in_hours: expiresInHours }),
    signal: options.signal,
  });
  if (!response.ok) throw new Error(`공유 생성 실패: ${response.status}`);
  const payload = (await response.json()) as Record<string, unknown>;
  const token = payload.token;
  const shareUrl = payload.share_url ?? payload.shareUrl;
  const expiresAt = payload.expires_at ?? payload.expiresAt;
  if (typeof token !== 'string' || typeof shareUrl !== 'string' || typeof expiresAt !== 'string') {
    throw new Error('공유 생성 응답에 token/share_url/expires_at이 없습니다');
  }
  return { token, shareUrl, expiresAt };
}

/** POST /share/{token}/location — 사용자 현재 위치 갱신(공유 중 5초마다). */
export async function updateShareLocation(
  token: string,
  location: LatLng,
  options: ShareClientOptions = {},
): Promise<UpdateLocationResponse> {
  const shareToken = resolveToken(token);
  if (!isFiniteInRange(location?.lat, -90, 90) || !isFiniteInRange(location?.lng, -180, 180)) {
    throw new Error('위치 갱신에 유효한 좌표가 필요합니다');
  }
  const base = resolveBase(options);
  const fetcher = options.fetchImpl ?? fetch;
  const response = await fetcher(`${base}/share/${encodeURIComponent(shareToken)}/location`, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ lat: location.lat, lng: location.lng }),
    signal: options.signal,
  });
  // 만료/없는 토큰은 404로 올 수 있다 — 호출부가 공유 중단으로 처리하도록 표면화.
  if (response.status === 404) throw new Error('공유가 만료되었거나 토큰이 없습니다');
  if (!response.ok) throw new Error(`위치 갱신 실패: ${response.status}`);
  const payload = (await response.json()) as Record<string, unknown>;
  const updatedAt = payload.updated_at ?? payload.updatedAt;
  if (typeof updatedAt !== 'string') throw new Error('위치 갱신 응답에 updated_at이 없습니다');
  const expiresAt = payload.expires_at ?? payload.expiresAt;
  return { updatedAt, ...(typeof expiresAt === 'string' ? { expiresAt } : {}) };
}

/** GET /share/{token}/location — 보호자 웹 5초 폴링. 만료/미수신을 정직하게 표면화. */
export async function getShareLocation(
  token: string,
  options: ShareClientOptions = {},
): Promise<ShareLocationResponse> {
  const shareToken = resolveToken(token);
  const base = resolveBase(options);
  const fetcher = options.fetchImpl ?? fetch;
  const response = await fetcher(`${base}/share/${encodeURIComponent(shareToken)}/location`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    signal: options.signal,
  });
  // 설계상 만료도 200+expired:true가 기본이나, 404는 만료로 간주.
  if (response.status === 404) {
    return { lat: null, lng: null, updatedAt: null, expired: true };
  }
  if (!response.ok) throw new Error(`위치 조회 실패: ${response.status}`);
  const payload = (await response.json()) as Record<string, unknown>;
  const expired = payload.expired === true;
  const { lat, lng } = toShareLocationCoordinates(payload);
  const updatedAtRaw = payload.updated_at ?? payload.updatedAt;
  const updatedAt = typeof updatedAtRaw === 'string' ? updatedAtRaw : null;
  return { lat, lng, updatedAt, expired };
}
