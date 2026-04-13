import { execSync } from 'child_process'
import path from 'path'

export default async function globalSetup(): Promise<void> {
  const backendDir = path.resolve(__dirname, '../backend')

  console.log('\n🗑️  Flushing database before test run...')
  try {
    execSync('uv run python manage.py flush --no-input', {
      cwd: backendDir,
      stdio: 'inherit',
      timeout: 30_000,
    })
    console.log('✅ Database flushed.\n')
  } catch (err) {
    console.error('\n❌ Database flush failed.')
    console.error('Make sure Docker (PostgreSQL) is running: docker-compose up -d')
    throw err
  }
}
