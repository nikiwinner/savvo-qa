import { execSync } from 'child_process'
import path from 'path'
import dotenv from 'dotenv'

dotenv.config({ path: path.resolve(__dirname, '.env') })

const TEST_DB_NAME = process.env.POSTGRES_DB_NAME ?? 'savvo_test'
const DB_USER = process.env.POSTGRES_USERNAME ?? 'postgres'
const DB_PASSWORD = process.env.POSTGRES_PASSWORD ?? 'password321'
const DB_HOST = process.env.POSTGRES_HOST ?? '127.0.0.1'
const DB_PORT = process.env.POSTGRES_PORT ?? '5432'

export const testDbEnv: Record<string, string> = {
  POSTGRES_DB_NAME: TEST_DB_NAME,
  POSTGRES_USERNAME: DB_USER,
  POSTGRES_PASSWORD: DB_PASSWORD,
  POSTGRES_HOST: DB_HOST,
  POSTGRES_PORT: DB_PORT,
}

export default async function globalSetup(): Promise<void> {
  const backendDir = path.resolve(__dirname, '../backend')
  const pgEnv = { ...process.env, PGPASSWORD: DB_PASSWORD }

  // 1. Create the test database if it doesn't exist
  console.log(`\n🗄️  Ensuring test database "${TEST_DB_NAME}" exists...`)
  try {
    execSync(
      `psql -h ${DB_HOST} -p ${DB_PORT} -U ${DB_USER} -tc "SELECT 1 FROM pg_database WHERE datname = '${TEST_DB_NAME}'" | grep -q 1 || psql -h ${DB_HOST} -p ${DB_PORT} -U ${DB_USER} -c "CREATE DATABASE ${TEST_DB_NAME}"`,
      { env: pgEnv, stdio: 'inherit', timeout: 15_000 }
    )
    console.log(`✅ Test database "${TEST_DB_NAME}" is ready.`)
  } catch (err) {
    console.error(`\n❌ Failed to create test database "${TEST_DB_NAME}".`)
    console.error('Make sure Docker (PostgreSQL) is running: docker-compose up -d')
    console.error('And that psql is installed (brew install libpq)')
    throw err
  }

  // 2. Run migrations against the test database
  console.log('\n🔄 Running migrations on test database...')
  try {
    execSync('uv run python manage.py migrate --no-input', {
      cwd: backendDir,
      env: { ...process.env, ...testDbEnv },
      stdio: 'inherit',
      timeout: 60_000,
    })
    console.log('✅ Migrations applied.\n')
  } catch (err) {
    console.error('\n❌ Migration failed on test database.')
    throw err
  }

  // 3. Flush the test database
  console.log('🗑️  Flushing test database before test run...')
  try {
    execSync('uv run python manage.py flush --no-input', {
      cwd: backendDir,
      env: { ...process.env, ...testDbEnv },
      stdio: 'inherit',
      timeout: 30_000,
    })
    console.log('✅ Test database flushed.\n')
  } catch (err) {
    console.error('\n❌ Database flush failed.')
    throw err
  }
}
