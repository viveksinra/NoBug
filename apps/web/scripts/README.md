# SnagBug — Demo Seed

## Run

```bash
# 1. Install the new tsx devDep (only needed once)
pnpm install

# 2. Make sure DATABASE_URL is set in apps/web/.env and the schema is pushed
pnpm db:generate
pnpm db:push

# 3. Seed
pnpm db:seed
```

`pnpm db:seed` **wipes the entire database** and re-creates a rich demo dataset.
Idempotent — safe to re-run anytime.

## Demo credentials

Password for **every** account: `Demo1234!`

| Email                    | Name            | Role      | What to show |
|--------------------------|-----------------|-----------|--------------|
| `demo@snagbug.com`       | Demo Owner      | OWNER     | Primary demo login (safe for screen-sharing) |
| `viveksinra@gmail.com`   | Vivek Sinra     | OWNER     | Your real email — also Owner |
| `sarah@acme.test`        | Sarah Chen      | ADMIN     | Engineering lead perspective |
| `mike@acme.test`         | Mike Rodriguez  | DEVELOPER | Developer assigned bugs |
| `priya@acme.test`        | Priya Patel     | QA        | QA runs regression suites |
| `alex@acme.test`         | Alex Kim        | VIEWER    | Read-only stakeholder |

## What gets seeded

- **1 company** — `Acme Corp` (slug `acme-corp`, Plan `BUSINESS`)
- **6 users** + memberships across all 5 roles
- **2 AI agents** — `QA Bot` (QA_TESTER), `Code Reviewer Bot` (CODE_REVIEWER)
- **2 projects** — `WEB` (Acme Web App), `API` (Acme Backend API)
- **14 issues** across mixed statuses (OPEN, IN_PROGRESS, DEV_TESTING, QA_TESTING, CLOSED, REOPENED), priorities, and types (BUG/FEATURE/TASK). Some assigned to humans, some to AI agents. Several have `ai_summary` + `ai_root_cause` filled.
- **6 comments** including `AI_ANALYSIS` from agents
- **2 issue links** (BLOCKS, RELATED)
- **10 labels** across both projects
- **2 quick captures** (anonymous shareable links — try `/b/demo-checkout-bug-2641`)
- **1 API key** for the MCP demo
- **1 GitHub integration** (config-only, no live sync)
- **1 regression suite** with 8 test cases + 1 completed run (6 PASS / 1 FAIL / 1 BLOCKED)
- **4 notifications** for the demo owner

## Demo URLs after seeding

- Login: http://localhost:3000/auth/login
- Dashboard: http://localhost:3000/acme-corp/dashboard
- Issues board: http://localhost:3000/acme-corp/WEB/board
- Quick capture share: http://localhost:3000/b/demo-checkout-bug-2641
