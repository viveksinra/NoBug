# BugDetector V1 — Launch Checklist

## Current Status: 52/55 Tasks Completed (95%)

### Remaining Code Tasks (3)
These are sequential — T-037 → T-038 → T-055:

- [ ] **T-037** — Dev Testing Flow with Recording Attachment (deps met, ready now)
- [ ] **T-038** — QA Testing Flow with Pass/Fail and Reopen (blocked by T-037)
- [ ] **T-055** — End-to-End Smoke Test Suite (blocked by T-038)

> These can be deferred to post-launch if needed — the core platform works without them.

---

## Pre-Launch Setup (Your Action Required)

### 1. Environment Variables
Set these in your deployment environment (`.env` or hosting provider):

**Required:**
```env
# Database
DATABASE_URL=postgresql://user:pass@host:5432/bugdetector

# Auth
BETTER_AUTH_SECRET=<generate: openssl rand -hex 32>
NEXT_PUBLIC_APP_URL=https://yourdomain.com

# Email (Resend)
RESEND_API_KEY=re_xxxxxxxxxxxx
EMAIL_FROM=noreply@yourdomain.com
```

**Optional (features degrade gracefully without these):**
```env
# AWS S3 (recordings, screenshots — falls back to DB-only without)
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=...
S3_BUCKET_NAME=bugdetector-uploads

# Sentry (error tracking — no-ops without)
NEXT_PUBLIC_SENTRY_DSN=https://xxx@sentry.io/xxx
SENTRY_AUTH_TOKEN=sntrys_xxx

# Extension origin (for cross-origin cookie auth)
EXTENSION_ORIGIN=chrome-extension://your-extension-id
```

### 2. Database Setup
```bash
# Run Prisma migrations
cd apps/web
pnpm prisma migrate deploy

# (Optional) Seed initial data
pnpm prisma db seed
```

### 3. AWS S3 Bucket
- [ ] Create S3 bucket with name matching `S3_BUCKET_NAME`
- [ ] Configure CORS for extension uploads:
  ```json
  {
    "CORSRules": [{
      "AllowedOrigins": ["chrome-extension://*", "https://yourdomain.com"],
      "AllowedMethods": ["GET", "PUT"],
      "AllowedHeaders": ["*"],
      "MaxAgeSeconds": 3600
    }]
  }
  ```
- [ ] IAM user with `s3:PutObject`, `s3:GetObject`, `s3:DeleteObject` permissions
- [ ] (Optional) CloudFront CDN for read access

### 4. Browser Extension
- [ ] Update `apps/extension/src/lib/constants.ts` — change `APP_URL` to production URL
- [ ] Update `apps/extension/wxt.config.ts` — change `host_permissions` to production domain
- [ ] Build for production: `pnpm --filter @nobug/extension build`
- [ ] Load in Chrome: `chrome://extensions` → Load unpacked → select `.output/chrome-mv3/`
- [ ] (For distribution) Create Chrome Web Store developer account ($5 one-time fee)
- [ ] (For distribution) Package and submit to Chrome Web Store

### 5. Resend Email
- [ ] Create Resend account at resend.com
- [ ] Verify your domain for email sending
- [ ] Get API key and set `RESEND_API_KEY`

### 6. Deployment
- [ ] Deploy web app to your hosting (EC2, Vercel, Railway, etc.)
- [ ] Point domain to deployment
- [ ] Enable HTTPS (required for auth cookies and extension)
- [ ] Set all environment variables in hosting provider

---

## Manual Testing Checklist

### Auth Flow
- [ ] Register a new account with email/password
- [ ] Verify email verification email is sent (check Resend dashboard or console)
- [ ] Login with email/password
- [ ] Password reset flow (request → email → reset)
- [ ] Session persists across browser restart (7-day expiry)

### Company & Team
- [ ] Create a company with name and slug
- [ ] Company dashboard loads with stats
- [ ] Invite a team member via email
- [ ] Accept invitation (creates membership)
- [ ] Role-based access: OWNER can manage settings, VIEWER can only view

### Projects & Issues
- [ ] Create a project with name and key
- [ ] Create an issue with title, description, priority, assignee
- [ ] Issue list page loads with filtering
- [ ] Kanban board view works
- [ ] Issue detail page with comments
- [ ] Bulk status update on multiple issues
- [ ] Issue linking (RELATED, BLOCKS, etc.)

### Browser Extension
- [ ] Extension popup opens in Chrome
- [ ] GDPR consent dialog shows on first use
- [ ] Sign in via web app (open login tab → detect completion)
- [ ] API key auth fallback works
- [ ] 3 popup modes render correctly (not logged in / no company / full)
- [ ] Quick Capture: click → capturing → form → share link
- [ ] Full Capture: project/priority/assignee selectors load, issue created
- [ ] Screenshot capture works (captureVisibleTab)
- [ ] Annotation editor opens and tools work (arrow, rect, blur, etc.)
- [ ] Recording indicator badge shows on extension icon

### Replay Viewer
- [ ] Quick Capture viewer at `/b/{slug}` loads
- [ ] Password-protected captures prompt for password
- [ ] rrweb replay plays back correctly
- [ ] Timeline markers show for errors/network failures
- [ ] Console panel shows log entries with filtering
- [ ] Network panel shows requests with status codes
- [ ] Clicking a log/request entry seeks the replay
- [ ] Environment info panel shows browser, OS, viewport
- [ ] Screenshot gallery with lightbox works

### Integrations (if configured)
- [ ] GitHub: connect with PAT, push issue, sync status
- [ ] Jira: connect with credentials, push issue
- [ ] Slack: connect with bot token, notification sent to channel
- [ ] Webhooks: create endpoint, receive test payload
- [ ] Deploy hook: POST triggers regression run

### API & MCP
- [ ] Generate API key from settings page
- [ ] REST API: `GET /api/v1/bugs` with Bearer token returns issues
- [ ] MCP server starts: `npx @nobug/mcp-server`
- [ ] MCP tool `list_bugs` returns results

### Settings Pages
- [ ] Company settings: edit name/slug
- [ ] Members settings: list members, invite, change role
- [ ] API keys settings: generate, copy, revoke
- [ ] Project settings: edit name/description, archive

### Security
- [ ] Rate limiting: auth endpoints block after 5 rapid requests (429)
- [ ] Security headers present (check with browser dev tools)
- [ ] PII redaction: emails/credit cards masked in captured console logs
- [ ] API key auth rejects invalid keys (401)

---

## Post-Launch Priorities

### Quick Wins
1. **T-037/T-038** — Dev/QA testing flows (if not done pre-launch)
2. **T-055** — E2E smoke test suite with Playwright
3. Landing page at `/` (currently placeholder "Coming soon")
4. Onboarding flow at `/onboarding` for new users

### V1.1 Improvements
- Redis rate limiting (replace in-memory with Upstash)
- CloudFront CDN signed URLs for private recordings
- AI-generated issue descriptions via Claude API
- Chrome Web Store submission
- Firefox extension build (`pnpm --filter @nobug/extension build:firefox`)

### V2 (AI Automation Testing)
- AI-powered test generation from rrweb recordings
- Automated regression test execution via Playwright
- AI failure analysis on test results
- Smart test prioritization based on code changes
