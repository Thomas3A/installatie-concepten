/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// De base-URL wordt door de deploy-workflow gezet (VITE_BASE=/<reponaam>/).
export default defineConfig({
  base: process.env.VITE_BASE ?? '/',
  plugins: [react()],
  // module-worker (ES-module). De werkelijke klimaatjaren (knmi-debilt-1991-2025, 1,1 MB, gzip ≈ 0,34 MB) zijn geen
  // JS-chunk maar een los JSON-bestand dat de rekenmotor pas met fetch laadt als een werkelijk jaar gekozen is.
  worker: { format: 'es' },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx', 'src/**/*.test.ts'],
    testTimeout: 60000,
  },
});
