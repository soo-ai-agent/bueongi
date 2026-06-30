export type StandardApiErrorCode =
  | 'ORIGIN_REQUIRED'
  | 'VALIDATION_FAILED'
  | 'MALFORMED_REQUEST'
  | 'SAME_ORIGIN_DESTINATION'
  | 'TRIP_TOO_FAR'
  | 'INVALID_KEYWORD';

export interface ApiProblemDetail {
  title?: string;
  detail?: string;
  code?: string;
  errors?: unknown[];
}

export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly title?: string;
  readonly detail?: string;
  readonly errors?: unknown[];
  readonly userMessage: string;

  constructor(message: string, options: {
    status: number;
    code?: string;
    title?: string;
    detail?: string;
    errors?: unknown[];
    userMessage: string;
  }) {
    super(message);
    this.name = 'ApiError';
    this.status = options.status;
    this.code = options.code;
    this.title = options.title;
    this.detail = options.detail;
    this.errors = options.errors;
    this.userMessage = options.userMessage;
  }
}

export interface ApiErrorLogEntry {
  context: string;
  kind: 'api' | 'error' | 'unknown';
  status?: number;
  code?: string;
  title?: string;
  name?: string;
}

const STANDARD_API_ERROR_MESSAGES: Record<StandardApiErrorCode, string> = {
  ORIGIN_REQUIRED: '현재 위치를 확인한 뒤 다시 시도해 주세요.',
  VALIDATION_FAILED: '위치 정보가 올바르지 않아요. 목적지를 다시 선택해 주세요.',
  MALFORMED_REQUEST: '요청 형식이 올바르지 않아요. 다시 시도해 주세요.',
  SAME_ORIGIN_DESTINATION: '출발지와 도착지가 너무 가까워요. 다른 목적지를 선택해 주세요.',
  TRIP_TOO_FAR: '현재 위치에서 너무 먼 목적지예요. 가까운 목적지를 다시 선택해 주세요.',
  INVALID_KEYWORD: '검색어가 올바르지 않아요. 장소 이름을 다시 입력해 주세요.',
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function extractErrorCode(payload: Record<string, unknown>): string | undefined {
  if (typeof payload.code === 'string') return payload.code;
  if (typeof payload.errorCode === 'string') return payload.errorCode;

  const firstError = Array.isArray(payload.errors) ? payload.errors[0] : undefined;
  if (isRecord(firstError) && typeof firstError.code === 'string') return firstError.code;

  return undefined;
}

function toProblemDetail(payload: unknown): ApiProblemDetail {
  if (!isRecord(payload)) return {};
  return {
    ...(typeof payload.title === 'string' ? { title: payload.title } : {}),
    ...(typeof payload.detail === 'string' ? { detail: payload.detail } : {}),
    ...(extractErrorCode(payload) ? { code: extractErrorCode(payload) } : {}),
    ...(Array.isArray(payload.errors) ? { errors: payload.errors } : {}),
  };
}

async function readProblemDetail(response: Response): Promise<ApiProblemDetail> {
  const text = await response.text().catch(() => '');
  if (!text.trim()) return {};

  try {
    return toProblemDetail(JSON.parse(text));
  } catch {
    return {};
  }
}

export function getApiErrorUserMessage(error: unknown, fallbackMessage: string): string {
  if (
    error instanceof ApiError &&
    error.code &&
    error.code in STANDARD_API_ERROR_MESSAGES
  ) {
    return error.userMessage;
  }
  return fallbackMessage;
}

export function toApiErrorLogEntry(context: string, error: unknown): ApiErrorLogEntry {
  if (error instanceof ApiError) {
    return {
      context,
      kind: 'api',
      status: error.status,
      ...(error.code ? { code: error.code } : {}),
      ...(error.title ? { title: error.title } : {}),
    };
  }

  if (error instanceof Error) {
    return {
      context,
      kind: 'error',
      name: error.name,
    };
  }

  return {
    context,
    kind: 'unknown',
  };
}

function shouldReportApiError(): boolean {
  if (typeof globalThis.location === 'undefined') return false;
  return globalThis.location.hostname === 'localhost' || globalThis.location.hostname === '127.0.0.1';
}

export function reportApiError(
  context: string,
  error: unknown,
  options: {
    enabled?: boolean;
    logger?: (message: string, entry: ApiErrorLogEntry) => void;
  } = {},
): void {
  if (!(options.enabled ?? shouldReportApiError())) return;

  const logger = options.logger ?? console.warn;
  logger('[bueongi-api-error]', toApiErrorLogEntry(context, error));
}

export async function createApiError(response: Response, fallbackMessage: string): Promise<ApiError> {
  const problem = await readProblemDetail(response);
  const standardMessage =
    problem.code && problem.code in STANDARD_API_ERROR_MESSAGES
      ? STANDARD_API_ERROR_MESSAGES[problem.code as StandardApiErrorCode]
      : undefined;
  const message = `${fallbackMessage}: ${response.status}${problem.code ? ` (${problem.code})` : ''}`;

  return new ApiError(message, {
    status: response.status,
    code: problem.code,
    title: problem.title,
    detail: problem.detail,
    errors: problem.errors,
    userMessage: standardMessage ?? fallbackMessage,
  });
}
