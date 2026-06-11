/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import { configDefaults } from 'vitest/config'
import path from 'path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'


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
  plugins: [
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
