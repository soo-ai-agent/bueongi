/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import { configDefaults } from 'vitest/config'
import path from 'path'
import fs from 'fs'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { clientEnvBuildGuard } from './src/app/utils/clientEnvBuildGuard'

function figmaAssetResolver() {
  return {
    name: 'figma-asset-resolver',
    resolveId(id: string) {
      if (id.startsWith('figma:asset/')) {
        const filename = id.replace('figma:asset/', '')
        return path.resolve(__dirname, 'src/assets', filename)
      }
    },
  }
}

/**
 * 로컬 CDN 서버 — 형제 디렉터리 `../cdn`(파이프라인 산출 정적 JSON: CCTV/파출소/안심집/조명/
 * 비상벨/안심길 + manifest)을 dev/preview 서버의 `/cdn` 경로로 서빙한다.
 *
 * 배경: 운영에서는 이 데이터가 실제 CDN(VITE_CDN_BASE_URL)에 배포되지만, 로컬에서는 배포본이
 * 없어 안심시설 점수/마커가 폴백으로만 떴다. 같은 dev 서버가 정적 산출물을 동일 출처(same-origin)로
 * 서빙하면 VITE_CDN_BASE_URL=http://localhost:3619/cdn 로 실제 데이터가 화면에 표시된다.
 * 경로 탈출(../) 차단으로 cdn 디렉터리 밖 파일 접근을 막는다.
 */
function localCdnServer() {
  const CDN_ROOT = path.resolve(__dirname, '..', 'cdn')
  const serve = (req: any, res: any, next: any) => {
    const urlPath = decodeURIComponent((req.url ?? '').split('?')[0])
    const target = path.resolve(CDN_ROOT, '.' + urlPath)
    // 경로 탈출 방지: 반드시 CDN_ROOT 하위여야 함.
    if (target !== CDN_ROOT && !target.startsWith(CDN_ROOT + path.sep)) {
      res.statusCode = 403
      res.end('Forbidden')
      return
    }
    fs.stat(target, (err, stat) => {
      if (err || !stat.isFile()) {
        next()
        return
      }
      res.setHeader('Content-Type', 'application/json; charset=utf-8')
      res.setHeader('Access-Control-Allow-Origin', '*')
      res.setHeader('Cache-Control', 'no-cache')
      fs.createReadStream(target).pipe(res)
    })
  }
  return {
    name: 'local-cdn-server',
    configureServer(server: any) {
      server.middlewares.use('/cdn', serve)
    },
    configurePreviewServer(server: any) {
      server.middlewares.use('/cdn', serve)
    },
  }
}

// 테스트 모드에서 .env.local 의 실제 키(VITE_TMAP_APP_KEY 등)가 import.meta.env 로 인라인되어
// "키 없음 → 백엔드 폴백" 분기 테스트를 깨뜨리는 것을 막는다. 인라인과 같은 레이어(define)에서
// 클라이언트 키를 빈 문자열로 덮어 테스트 러너를 hermetic 하게 만든다(각 테스트가 stub 으로 주입).
const TEST_ENV_KEYS = [
  'VITE_KAKAO_JS_KEY',
  'VITE_TMAP_APP_KEY',
  'VITE_CDN_BASE_URL',
  'VITE_SEOUL_OPENAPI_KEY',
  'VITE_SHARE_API_BASE_URL',
]
const testEnvDefine = Object.fromEntries(
  TEST_ENV_KEYS.map((k) => [`import.meta.env.${k}`, '""']),
)

export default defineConfig(({ mode }) => ({
  // 클라이언트 번들에 노출될 수 있는 env는 'VITE_' 접두만(명시 고정). 가드와 짝을 이룬다.
  envPrefix: 'VITE_',
  ...(mode === 'test' ? { define: testEnvDefine } : {}),
  plugins: [
    clientEnvBuildGuard(),
    figmaAssetResolver(),
    localCdnServer(),
    // The React and Tailwind plugins are both required for Make, even if
    // Tailwind is not being actively used – do not remove them
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      // Alias @ to the src directory
      '@': path.resolve(__dirname, './src'),
    },
  },

  // File types to support raw imports. Never add .css, .tsx, or .ts files to this.
  assetsInclude: ['**/*.svg', '**/*.csv'],

  // 격리 포트 고정(3619). strictPort로 점유 시 임의 폴백 방지, host로 LAN/컨테이너 노출 허용.
  server: {
    port: 3619,
    strictPort: true,
    host: true,
    proxy: {
      '/api': 'http://localhost:8119',
    },
  },
  preview: {
    port: 3619,
    strictPort: true,
    host: true,
  },

  // 단위 테스트(vitest)는 src의 *.test.ts만 — Playwright E2E(tests/e2e)는 별 러너이므로 제외.
  test: {
    exclude: [...configDefaults.exclude, 'tests/e2e/**'],
  },
}))
