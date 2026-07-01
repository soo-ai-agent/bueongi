import { isRouteErrorResponse, useRouteError } from 'react-router';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';

/**
 * 라우트 렌더 예외·미매칭(404)을 RouterProvider 트리 전체 언마운트(복구 불가 백스크린)
 * 대신 복구 가능한 안내 화면으로 처리한다.
 * 안전 앱 특성상 raw 에러 메시지/스택/위치·연락처 등 민감정보는 화면·콘솔에 노출하지 않고,
 * 개발 분류용 메타(data-error-kind)만 DOM 속성으로 남긴다.
 */
export function RouteErrorBoundary() {
  const error = useRouteError();
  const isNotFound = isRouteErrorResponse(error) && error.status === 404;

  // 분류 메타만 — 메시지 본문/스택은 의도적으로 제외(정보 노출 0)
  const kind = isRouteErrorResponse(error) ? `route-${error.status}` : 'render-exception';

  const goHome = () => {
    // 라우터 상태가 손상됐을 수 있어 hard navigation으로 확실히 복구
    window.location.assign('/home');
  };
  const reload = () => window.location.reload();

  return (
    <div className="flex min-h-screen w-full bg-slate-900 justify-center items-center">
      <div
        data-error-kind={kind}
        className="relative w-full h-[100dvh] max-w-[480px] bg-slate-800 text-slate-200 overflow-hidden shadow-2xl sm:rounded-[40px] sm:h-[850px] sm:border-[8px] sm:border-slate-700 flex flex-col items-center justify-center px-8 text-center"
      >
        <div role="alert" aria-live="assertive" className="flex flex-col items-center w-full">
          <div className="w-20 h-20 rounded-full bg-slate-700 border border-slate-600 flex items-center justify-center mb-6 shadow-lg">
            {isNotFound ? (
              <span className="text-4xl">🦉</span>
            ) : (
              <AlertTriangle className="w-9 h-9 text-amber-400" />
            )}
          </div>

          <h1 className="text-2xl font-bold text-slate-50 mb-3">
            {isNotFound ? '페이지를 찾을 수 없어요' : '문제가 발생했어요'}
          </h1>
          <p className="text-slate-300 leading-relaxed mb-8 whitespace-pre-line">
            {isNotFound
              ? '요청하신 화면이 없거나 주소가 바뀌었어요.\n홈에서 다시 시작해 주세요.'
              : '화면을 불러오는 중 일시적인 오류가 발생했어요.\n새로고침하거나 홈으로 이동해 주세요.'}
          </p>

          <div className="flex flex-col gap-3 w-full max-w-[280px]">
            {!isNotFound && (
              <button
                onClick={reload}
                className="w-full h-14 rounded-2xl bg-blue-500 hover:bg-blue-400 text-white font-bold flex items-center justify-center gap-2 transition-colors active:scale-95 shadow-[0_8px_20px_rgba(37,99,235,0.2)]"
              >
                <RefreshCw className="w-5 h-5" />
                새로고침
              </button>
            )}
            <button
              onClick={goHome}
              className={`w-full h-14 rounded-2xl font-bold flex items-center justify-center gap-2 transition-colors active:scale-95 ${
                isNotFound
                  ? 'bg-blue-500 hover:bg-blue-400 text-white shadow-[0_8px_20px_rgba(37,99,235,0.2)]'
                  : 'bg-slate-700 border border-slate-600 text-slate-200 hover:bg-slate-600'
              }`}
            >
              <Home className="w-5 h-5" />
              홈으로 가기
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
