import { defineConfig, devices } from '@playwright/test'
import path from 'path'
import dotenv from 'dotenv'

dotenv.config({ path: path.resolve(__dirname, '.env') })

const TEST_DB_NAME = process.env.POSTGRES_DB_NAME ?? 'ledgerapp_test'

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [['html'], ['list']],

  globalSetup: './global-setup.ts',

  use: {
    baseURL: process.env.FRONTEND_URL ?? 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'on-first-retry',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'mobile-safari',
      use: { ...devices['iPhone 13'] },
    },
    {
      name: 'tablet',
      use: { ...devices['iPad Pro 11'] },
    },
  ],

  webServer: [
    {
      // QA-only backend on :8001 against ledgerapp_test. Never reuses the dev
      // backend on :8000 — that would contaminate the dev DB.
      command: `cd ${path.resolve(__dirname, '../backend')} && POSTGRES_DB_NAME=${TEST_DB_NAME} DEBUG=True uv run python manage.py runserver 127.0.0.1:8001`,
      url: 'http://127.0.0.1:8001/api/auth/me/',
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      // QA-only frontend on :5174, pointed at the QA backend on :8001.
      // --strictPort makes Vite fail loudly if :5174 is taken instead of
      // silently falling back to a random port (which would break baseURL).
      command: `cd ${path.resolve(__dirname, '../frontend')} && PUBLIC_API_BASE_URL=http://localhost:8001 npm run dev -- --port 5174 --strictPort`,
      url: 'http://localhost:5174',
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
})
