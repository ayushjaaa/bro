import 'server-only';

// Guarded re-export for Next.js app code (Route Handlers, Server Components, Server Actions) —
// import from here, not from `./admin-client.core`, so a Client Component accidentally importing
// this fails the build (BUILD_PLAN §4's Admin-token security rule). Standalone scripts
// (scripts/shopify/*.ts) import the core file directly since `server-only` can't run outside
// Next.js's webpack bundling.
export * from './admin-client.core';
