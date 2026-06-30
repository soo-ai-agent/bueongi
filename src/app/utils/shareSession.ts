import type { LatLng } from './routeCompare';
import { getShareApiBaseUrl } from './env';

/**
 * 위치 공유 서버 클라이언트(작업 5).
 *
 * 설계 계약(4개 엔드포인트, 1~3시간 TTL):
 * - POST /share/create               { expires_in_hours: 1|2|3 } -> { token, share_url, expires_at }
 * - POST /share/{token}/location     { lat, lng }                -> { updated_at, expires_at }
 * - GET  /share/{token}/location                                 -> { lat, lng, updated_at, expired }
 * - POST /share/{token}/end                                      -> 공유 종료(도착·중단). 이후 조회는 expired:true.
 * - GET  /share/{token}                                          -> 보호자 HTML(독립 지도 페이지, 공유 URL의 실제 대상)
 *
 * 앱은 share_url을 받아 OS 공유 시트/외부 메신저로 넘기고, 공유 중 5초마다 위치를 POST 한다.
 * 보호자 등록/페어링/푸시는 만들지 않는다. base URL 미설정 시 호출부가 정적 폴백으로 동작한다.
 */

export type ShareExpiresHours = 1 | 2 | 3;

/**
 * 공유 만료/토큰 부재(서버 404) 전용 에러. 위치 전송 루프가 일시적 네트워크 오류와
 * 구분해 "더 보낼 필요 없음 → 루프 종료" 신호로 쓴다(instanceof로 판별).
 */
export class ShareExpiredError extends Error {
  constructor(message = '공유가 만료되었거나 토큰이 없습니다') {
    super(message);
    this.name = 'ShareExpiredError';
  }
}

export interface CreateShareResponse {
  /** 공유 URL에 담기는 읽기 전용 토큰(보호자가 위치를 조회). */
  token: string;
  /** 위치 쓰기/종료에 필요한 비밀(앱만 보관, 공유 URL엔 미포함). 매 전송/종료에 본문으로 보낸다. */
  ownerSecret: string;
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
  /** 쓰기/종료 전용 비밀(앱만 보유). updateShareLocation/endShare 가 본문 owner_secret 으로 보낸다. 조회(read)에선 무시. */
  ownerSecret?: string;
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
  const ownerSecret = payload.owner_secret ?? payload.ownerSecret;
  const shareUrl = payload.share_url ?? payload.shareUrl;
  const expiresAt = payload.expires_at ?? payload.expiresAt;
  if (
    typeof token !== 'string' ||
    typeof ownerSecret !== 'string' ||
    typeof shareUrl !== 'string' ||
    typeof expiresAt !== 'string'
  ) {
    throw new Error('공유 생성 응답에 token/owner_secret/share_url/expires_at이 없습니다');
  }
  return { token, ownerSecret, shareUrl, expiresAt };
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
    // owner_secret(쓰기 비밀)을 함께 보낸다 — 공유 URL(읽기 토큰)만 아는 사람은 위치를 쓸 수 없다.
    body: JSON.stringify({
      lat: location.lat,
      lng: location.lng,
      ...(options.ownerSecret ? { owner_secret: options.ownerSecret } : {}),
    }),
    signal: options.signal,
  });
  // 만료/없는 토큰은 404로 올 수 있다 — 호출부가 공유 중단으로 처리하도록 표면화.
  if (response.status === 404) throw new ShareExpiredError();
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

/**
 * POST /share/{token}/end — 공유 종료(사용자 도착/중단). 호출 후 보호자 페이지는 "공유 종료"로 바뀐다.
 * 멱등 계약: 이미 만료/없는 토큰(404)도 "이미 종료됨"으로 간주해 에러로 보지 않는다.
 */
export async function endShare(token: string, options: ShareClientOptions = {}): Promise<void> {
  const shareToken = resolveToken(token);
  const base = resolveBase(options);
  const fetcher = options.fetchImpl ?? fetch;
  const response = await fetcher(`${base}/share/${encodeURIComponent(shareToken)}/end`, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    // owner_secret(쓰기 비밀)을 보내야 종료된다 — 공유 URL만 아는 사람의 임의 종료를 막는다.
    body: JSON.stringify(options.ownerSecret ? { owner_secret: options.ownerSecret } : {}),
    signal: options.signal,
  });
  if (!response.ok && response.status !== 404) {
    throw new Error(`공유 종료 실패: ${response.status}`);
  }
}
