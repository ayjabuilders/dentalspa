import { defineConfig } from '@playwright/test';
export default defineConfig({testDir:'.',testMatch:'patient-document-library-local.spec.ts',workers:1,timeout:90000,expect:{timeout:15000},outputDir:'../../.local/qa/document-library-browser',use:{trace:'off',video:'off',screenshot:'only-on-failure',reducedMotion:'reduce'}});
