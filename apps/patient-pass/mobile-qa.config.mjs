import {defineConfig} from '@playwright/test';
export default defineConfig({testDir:'../../tests/e2e',testMatch:'patient-message-draft-lifecycle.spec.ts',workers:1,timeout:30000,use:{viewport:{width:390,height:844},reducedMotion:'reduce'},reporter:'line',outputDir:'../../.local/qa/pass-lifecycle'});
