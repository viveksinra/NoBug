# NoBug

AI-native bug tracking, test management, and developer collaboration platform.

**Record bugs with a browser extension (video, console, network, screenshots) → Track in a modern issue tracker → AI agents fix via MCP → QA verifies → Regression tested.**

## Tech Stack

- **Monorepo:** Turborepo + pnpm
- **Web App:** Next.js 15 (App Router) + Tailwind CSS + shadcn/ui
- **Extension:** WXT (Manifest V3) + React + rrweb
- **Database:** PostgreSQL (Neon) + Prisma
- **MCP Server:** TypeScript SDK for AI agent integration
- **Auth:** Better Auth (custom, no third-party)

## Structure

```
apps/
  web/          → Next.js frontend + API
  extension/    → Chrome/Firefox/Edge extension (WXT)
packages/
  shared/       → Zod schemas, types, constants
  db/           → Prisma schema + client
  mcp-server/   → @nobug/mcp-server (npm package)
  ui/           → Shared UI components
```

## Getting Started

```bash
pnpm install
pnpm dev:web     # Start Next.js dev server
pnpm dev:ext     # Start extension dev server
```

## License

Proprietary. All rights reserved.
