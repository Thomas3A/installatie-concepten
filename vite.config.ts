/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// De base-URL wordt door de deploy-workflow gezet (VITE_BASE=/<reponaam>/).
export default defineConfig({
  base: process.env.VITE_BASE ?? '/',
  plugins: [react()],
  // grens boven de lazy geladen klimaatdata (knmi-debilt-1991-2025, 1,1 MB, gzip ≈ 0,34 MB)
  build: { chunkSizeWarningLimit: 1200 },
  // module-worker: de rekenmotor laadt de werkelijke jaren met een dynamische import
  worker: { format: 'es' },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx', 'src/**/*.test.ts'],
    testTimeout: 60000,
  },
});
