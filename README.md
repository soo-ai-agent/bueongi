
  # 안심귀가 앱 MVP 기획

  This is a code bundle for 안심귀가 앱 MVP 기획. The original project is available at https://www.figma.com/design/qI5DbjKwz1PwzC8ryTnYkM/%EC%95%88%EC%8B%AC%EA%B7%80%EA%B0%80-%EC%95%B1-MVP-%EA%B8%B0%ED%9A%8D.

  ## Running the code

  Run `npm i` to install the dependencies.

  Run `npm run dev` to start the development server.

  ## 지도 (Kakao Maps)

  실제 지도는 Kakao Maps JS SDK를 런타임에 `dapi.kakao.com`에서 동적 로드한다(npm 패키지 아님 —
  triplan과 동일 방식). 환경변수 `VITE_KAKAO_JS_KEY`(Kakao Developers JS 앱키)를 설정하면 켜진다.

  ```sh
  cp .env.example .env.local   # 그리고 VITE_KAKAO_JS_KEY 채우기
  ```

  키가 없거나 SDK 로드에 실패하면 `RouteMap`이 `MapMock`(플레이스홀더 지도)으로 자동 폴백하므로
  화면이 깨지지 않는다. 따라서 테스트/CI(키 미주입)에서도 동작한다.

  ## E2E checks

  Run `npm run test:e2e` to start the local Vite server and execute Playwright tests.

  In environments that cannot listen on local ports, run `npm run test:e2e:list` to validate test discovery and parsing. If a server is already running, use `E2E_BASE_URL=http://host:port npm run test:e2e:external`.
