import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e', fullyParallel:false, workers:1, timeout:30000,
  use: { ...devices['Desktop Chrome'], trace:'retain-on-failure', screenshot:'only-on-failure' },
  webServer: [
    { command:'pnpm --filter @dental/clinic-os start',url:'http://localhost:4200',reuseExistingServer:!process.env.CI,timeout:60000 },
    { command:'pnpm --filter @dental/patient-pass start',url:'http://localhost:4201',reuseExistingServer:!process.env.CI,timeout:60000 },
    { command:'pnpm --filter @dental/public-booking start',url:'http://localhost:4202',reuseExistingServer:!process.env.CI,timeout:60000 }
  ]
});
