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
      command: `cd ${path.resolve(__dirname, '../backend')} && POSTGRES_DB_NAME=${TEST_DB_NAME} uv run python manage.py runserver`,
      url: 'http://127.0.0.1:8000/api/auth/me/',
      reuseExistingServer: true,
      timeout: 30_000,
    },
    {
      command: `cd ${path.resolve(__dirname, '../frontend')} && npm run dev`,
      url: 'http://localhost:5173',
      reuseExistingServer: true,
      timeout: 60_000,
    },
  ],
})
