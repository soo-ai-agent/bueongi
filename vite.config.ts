/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import { configDefaults } from 'vitest/config'
import path from 'path'
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

export default defineConfig({
  // 클라이언트 번들에 노출될 수 있는 env는 'VITE_' 접두만(명시 고정). 가드와 짝을 이룬다.
  envPrefix: 'VITE_',
  plugins: [
    clientEnvBuildGuard(),
    figmaAssetResolver(),
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
})
