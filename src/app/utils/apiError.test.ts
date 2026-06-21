import { describe, expect, it } from 'vitest';
import {
  ApiError,
  createApiError,
  getApiErrorUserMessage,
  reportApiError,
  toApiErrorLogEntry,
  type ApiErrorLogEntry,
} from './apiError';

describe('createApiError', () => {
  it('백엔드 ProblemDetail의 표준 오류 코드를 보존하고 사용자 안내로 매핑한다', async () => {
    const error = await createApiError(
      new Response(
        JSON.stringify({
          title: 'Origin required',
          detail: 'origin is required',
          code: 'ORIGIN_REQUIRED',
          errors: [{ field: 'origin', code: 'ORIGIN_REQUIRED' }],
        }),
        { status: 422, headers: { 'Content-Type': 'application/json' } },
      ),
      'Route compare failed',
    );

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 422,
      code: 'ORIGIN_REQUIRED',
      title: 'Origin required',
      detail: 'origin is required',
      userMessage: '현재 위치를 확인한 뒤 다시 시도해 주세요.',
    });
    expect(error.message).toBe('Route compare failed: 422 (ORIGIN_REQUIRED)');
    expect(getApiErrorUserMessage(error, '기본 오류 문구')).toBe('현재 위치를 확인한 뒤 다시 시도해 주세요.');
  });

  it('errors 배열에만 코드가 있어도 표준 오류를 추출한다', async () => {
    const error = await createApiError(
      new Response(
        JSON.stringify({
          title: 'Validation failed',
          errors: [{ field: 'destination.lat', code: 'VALIDATION_FAILED' }],
        }),
        { status: 400 },
      ),
      'Route facilities failed',
    );

    expect(error).toMatchObject({
      status: 400,
      code: 'VALIDATION_FAILED',
      userMessage: '위치 정보가 올바르지 않아요. 목적지를 다시 선택해 주세요.',
    });
  });

  it('errorCode 별칭으로 내려온 표준 오류도 추출한다', async () => {
    const error = await createApiError(
      new Response(JSON.stringify({ errorCode: 'INVALID_KEYWORD' }), { status: 400 }),
      'Place search failed',
    );

    expect(error).toMatchObject({
      status: 400,
      code: 'INVALID_KEYWORD',
      userMessage: '검색어가 올바르지 않아요. 장소 이름을 다시 입력해 주세요.',
    });
    expect(error.message).toBe('Place search failed: 400 (INVALID_KEYWORD)');
  });

  it('복구 가능한 백엔드 도메인 오류를 사용자 행동 안내로 매핑한다', async () => {
    const sameOrigin = await createApiError(
      new Response(JSON.stringify({ code: 'SAME_ORIGIN_DESTINATION' }), { status: 422 }),
      'Route compare failed',
    );
    const tooFar = await createApiError(
      new Response(JSON.stringify({ code: 'TRIP_TOO_FAR' }), { status: 422 }),
      'Route compare failed',
    );
    const invalidKeyword = await createApiError(
      new Response(JSON.stringify({ code: 'INVALID_KEYWORD' }), { status: 400 }),
      'Place search failed',
    );

    expect(getApiErrorUserMessage(sameOrigin, '기본 경로로 안내합니다.')).toBe(
      '출발지와 도착지가 너무 가까워요. 다른 목적지를 선택해 주세요.',
    );
    expect(getApiErrorUserMessage(tooFar, '기본 경로로 안내합니다.')).toBe(
      '현재 위치에서 너무 먼 목적지예요. 가까운 목적지를 다시 선택해 주세요.',
    );
    expect(getApiErrorUserMessage(invalidKeyword, '장소 검색에 실패했어요.')).toBe(
      '검색어가 올바르지 않아요. 장소 이름을 다시 입력해 주세요.',
    );
  });

  it('알 수 없는 오류 코드는 호출 화면의 폴백 문구를 유지하게 한다', async () => {
    const error = await createApiError(
      new Response(JSON.stringify({ code: 'UNKNOWN_BACKEND_ERROR' }), { status: 500 }),
      'Place search failed',
    );

    expect(error).toMatchObject({
      status: 500,
      code: 'UNKNOWN_BACKEND_ERROR',
      userMessage: 'Place search failed',
    });
    expect(getApiErrorUserMessage(error, '장소 검색에 실패했어요.')).toBe('장소 검색에 실패했어요.');
  });

  it('JSON이 아닌 오류 응답도 상태 코드를 포함한 ApiError로 만든다', async () => {
    const error = await createApiError(new Response('fail', { status: 503 }), 'Route compare failed');

    expect(error).toMatchObject({
      status: 503,
      code: undefined,
      userMessage: 'Route compare failed',
    });
    expect(error.message).toBe('Route compare failed: 503');
  });
});

describe('API error reporting', () => {
  it('로그 항목에는 비민감 API 분류 필드만 남긴다', async () => {
    const error = await createApiError(
      new Response(
        JSON.stringify({
          title: 'Validation failed',
          detail: 'destination payload includes raw request data',
          code: 'VALIDATION_FAILED',
          errors: [{ field: 'destination.lat', code: 'VALIDATION_FAILED', rejectedValue: 'secret-ish' }],
        }),
        { status: 400 },
      ),
      'Route compare failed',
    );

    expect(toApiErrorLogEntry('route compare', error)).toEqual({
      context: 'route compare',
      kind: 'api',
      status: 400,
      code: 'VALIDATION_FAILED',
      title: 'Validation failed',
    });
  });

  it('명시적으로 활성화한 logger에 표준 로그 메시지와 항목을 전달한다', async () => {
    const entries: Array<[string, ApiErrorLogEntry]> = [];
    const error = await createApiError(new Response(JSON.stringify({ code: 'ORIGIN_REQUIRED' }), { status: 422 }), 'Route compare failed');

    reportApiError('route compare', error, {
      enabled: true,
      logger: (message, entry) => entries.push([message, entry]),
    });

    expect(entries).toEqual([
      [
        '[bueongi-api-error]',
        {
          context: 'route compare',
          kind: 'api',
          status: 422,
          code: 'ORIGIN_REQUIRED',
        },
      ],
    ]);
  });

  it('로컬 개발 호스트가 아니면 기본 logger 호출을 생략한다', () => {
    const entries: Array<[string, ApiErrorLogEntry]> = [];

    reportApiError('route compare', new Error('network failure'), {
      logger: (message, entry) => entries.push([message, entry]),
    });

    expect(entries).toEqual([]);
  });
});
