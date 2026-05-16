/**
 * SnagBug — Demo Seed Script
 *
 * Wipes the entire database and re-seeds a rich demo dataset for screen-sharing
 * the product. Idempotent: safe to re-run.
 *
 * Run: pnpm db:seed   (from repo root)
 *
 * Login credentials (all users share the same password):
 *   demo@snagbug.com      — Demo Owner (Vivek)        — OWNER
 *   viveksinra@gmail.com  — Vivek Sinra (real email)  — OWNER
 *   sarah@acme.test       — Sarah Chen                — ADMIN
 *   mike@acme.test        — Mike Rodriguez            — DEVELOPER
 *   priya@acme.test       — Priya Patel               — QA
 *   alex@acme.test        — Alex Kim                  — VIEWER
 *
 *   Password (all): Demo1234!
 */

import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

// Load apps/web/.env regardless of cwd, before anything else imports Prisma/Auth
const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.loadEnvFile(path.join(__dirname, '..', '.env'));

const { db } = await import('@snagbug/db');
const { auth } = await import('../src/lib/auth');

const PASSWORD = 'Demo1234!';

const USERS = [
  { email: 'demo@snagbug.com',     name: 'Demo Owner',     role: 'OWNER' as const },
  { email: 'viveksinra@gmail.com', name: 'Vivek Sinra',    role: 'OWNER' as const },
  { email: 'sarah@acme.test',      name: 'Sarah Chen',     role: 'ADMIN' as const },
  { email: 'mike@acme.test',       name: 'Mike Rodriguez', role: 'DEVELOPER' as const },
  { email: 'priya@acme.test',      name: 'Priya Patel',    role: 'QA' as const },
  { email: 'alex@acme.test',       name: 'Alex Kim',       role: 'VIEWER' as const },
];

async function wipeDatabase() {
  console.log('🧹 Wiping all tables...');

  // Order doesn't matter with CASCADE; list every table from schema.prisma @@map
  const tables = [
    'test_results',
    'test_case_assignments',
    'test_case_bug_links',
    'regression_runs',
    'test_cases',
    'regression_suites',
    'external_refs',
    'integrations',
    'agent_tasks',
    'agents',
    'api_keys',
    'notifications',
    'activity_logs',
    'quick_captures',
    'screenshots',
    'recordings',
    'issue_links',
    'issue_labels',
    'labels',
    'issue_comments',
    'issues',
    'projects',
    'invitations',
    'members',
    'companies',
    'verifications',
    'accounts',
    'sessions',
    'users',
  ];

  await db.$executeRawUnsafe(
    `TRUNCATE TABLE ${tables.map((t) => `"${t}"`).join(', ')} RESTART IDENTITY CASCADE`,
  );
  console.log('   done.');
}

async function createUsers() {
  console.log('👤 Creating users via Better Auth...');
  const users: Record<string, { id: string; memberId: string }> = {};

  for (const u of USERS) {
    const res = await auth.api.signUpEmail({
      body: { email: u.email, password: PASSWORD, name: u.name },
    });
    if (!res?.user?.id) throw new Error(`Failed to sign up ${u.email}`);

    // Mark email verified so they can login without clicking a link
    await db.user.update({
      where: { id: res.user.id },
      data: { email_verified: true },
    });

    users[u.email] = { id: res.user.id, memberId: '' }; // memberId filled later
    console.log(`   ✓ ${u.email}`);
  }
  return users;
}

async function main() {
  console.log('\n=== SnagBug Demo Seed ===\n');

  await wipeDatabase();
  const users = await createUsers();

  // ── Company ─────────────────────────────────────────────────────────────
  console.log('🏢 Creating company "Acme Corp"...');
  const company = await db.company.create({
    data: {
      name: 'Acme Corp',
      slug: 'acme-corp',
      plan: 'BUSINESS',
    },
  });

  // ── Members ────────────────────────────────────────────────────────────
  console.log('👥 Adding members...');
  for (const u of USERS) {
    const m = await db.member.create({
      data: {
        company_id: company.id,
        user_id: users[u.email].id,
        role: u.role,
        joined_at: new Date(),
      },
    });
    users[u.email].memberId = m.id;
  }

  const ownerUserId = users['demo@snagbug.com'].id;
  const ownerMemberId = users['demo@snagbug.com'].memberId;
  const sarahMemberId = users['sarah@acme.test'].memberId;
  const mikeMemberId = users['mike@acme.test'].memberId;
  const priyaMemberId = users['priya@acme.test'].memberId;

  // ── AI Agents ──────────────────────────────────────────────────────────
  console.log('🤖 Creating AI agents...');
  const qaBot = await db.agent.create({
    data: {
      company_id: company.id,
      name: 'QA Bot',
      type: 'QA_TESTER',
      status: 'ACTIVE',
      created_by: ownerUserId,
      config_json: { model: 'claude-opus-4-7', max_tasks_per_hour: 20 },
    },
  });

  const reviewBot = await db.agent.create({
    data: {
      company_id: company.id,
      name: 'Code Reviewer Bot',
      type: 'CODE_REVIEWER',
      status: 'ACTIVE',
      created_by: ownerUserId,
      config_json: { model: 'claude-opus-4-7', review_depth: 'deep' },
    },
  });

  // ── Projects ───────────────────────────────────────────────────────────
  console.log('📁 Creating projects...');
  const webProject = await db.project.create({
    data: {
      company_id: company.id,
      name: 'Acme Web App',
      key: 'WEB',
      description: 'Customer-facing Next.js application',
      agents: { connect: [{ id: qaBot.id }, { id: reviewBot.id }] },
    },
  });

  const apiProject = await db.project.create({
    data: {
      company_id: company.id,
      name: 'Acme Backend API',
      key: 'API',
      description: 'Internal REST + GraphQL API',
      agents: { connect: [{ id: reviewBot.id }] },
    },
  });

  // ── Labels ─────────────────────────────────────────────────────────────
  console.log('🏷️  Creating labels...');
  const makeLabels = async (projectId: string) => {
    const defs = [
      { name: 'frontend',   color: '#6366f1' },
      { name: 'backend',    color: '#10b981' },
      { name: 'security',   color: '#ef4444' },
      { name: 'ui',         color: '#f59e0b' },
      { name: 'regression', color: '#8b5cf6' },
    ];
    const labels: Record<string, string> = {};
    for (const d of defs) {
      const l = await db.label.create({ data: { project_id: projectId, ...d } });
      labels[d.name] = l.id;
    }
    return labels;
  };
  const webLabels = await makeLabels(webProject.id);
  const apiLabels = await makeLabels(apiProject.id);

  // ── Issues (WEB project) ───────────────────────────────────────────────
  console.log('🐛 Creating issues...');
  let webNum = 0;
  const mkWebIssue = (data: any) => {
    webNum += 1;
    return db.issue.create({ data: { ...data, project_id: webProject.id, number: webNum } });
  };

  const issues: any[] = [];

  issues.push(await mkWebIssue({
    title: 'Checkout button unresponsive on Safari iOS 17',
    description:
      'Multiple customer reports that the "Place Order" button does nothing on Safari iOS 17.x. Works fine on Chrome and on desktop Safari. Repro: add item to cart, proceed to checkout, fill form, tap Place Order — nothing happens, no error.',
    status: 'IN_PROGRESS',
    priority: 'CRITICAL',
    type: 'BUG',
    reporter_id: sarahMemberId,
    reporter_type: 'MEMBER',
    assignee_id: mikeMemberId,
    assignee_type: 'MEMBER',
    environment_json: { browser: 'Safari', os: 'iOS 17.4', viewport: '390x844' },
    ai_summary:
      'Tap event handler is being swallowed by an overlay element. The new GDPR cookie banner z-index conflicts with the checkout CTA.',
    ai_root_cause:
      'Z-index regression introduced in commit a3f9b21 — CookieBanner component uses z-50 which now overlaps the floating checkout bar on viewports <420px.',
  }));

  issues.push(await mkWebIssue({
    title: 'Dark mode toggle resets on page navigation',
    description: 'User preference not persisted across route changes.',
    status: 'OPEN',
    priority: 'MEDIUM',
    type: 'BUG',
    reporter_id: priyaMemberId,
    reporter_type: 'MEMBER',
    assignee_id: qaBot.id,
    assignee_type: 'AGENT',
  }));

  issues.push(await mkWebIssue({
    title: 'Add OAuth login with Google',
    description: 'Customers requesting social login. Implement Google OAuth via Better Auth.',
    status: 'DEV_TESTING',
    priority: 'HIGH',
    type: 'FEATURE',
    reporter_id: ownerMemberId,
    reporter_type: 'MEMBER',
    assignee_id: mikeMemberId,
    assignee_type: 'MEMBER',
  }));

  issues.push(await mkWebIssue({
    title: 'Profile avatar upload returns 413 for files > 2MB',
    description: 'Server rejecting large avatars without a clear error to the user.',
    status: 'QA_TESTING',
    priority: 'MEDIUM',
    type: 'BUG',
    reporter_id: sarahMemberId,
    reporter_type: 'MEMBER',
    assignee_id: priyaMemberId,
    assignee_type: 'MEMBER',
  }));

  issues.push(await mkWebIssue({
    title: 'XSS vulnerability in comment markdown renderer',
    description:
      'Discovered via security audit — comment body allows raw <script> tags through. CVSS 7.4.',
    status: 'CLOSED',
    priority: 'CRITICAL',
    type: 'BUG',
    reporter_id: ownerMemberId,
    reporter_type: 'MEMBER',
    assignee_id: mikeMemberId,
    assignee_type: 'MEMBER',
    closed_at: new Date(Date.now() - 1000 * 60 * 60 * 24 * 3),
  }));

  issues.push(await mkWebIssue({
    title: 'Dashboard charts flicker on initial paint',
    description: 'Brief flash of unstyled content before Recharts hydrates.',
    status: 'REOPENED',
    priority: 'LOW',
    type: 'BUG',
    reporter_id: priyaMemberId,
    reporter_type: 'MEMBER',
    assignee_id: mikeMemberId,
    assignee_type: 'MEMBER',
  }));

  issues.push(await mkWebIssue({
    title: 'Improve LCP on landing page',
    description: 'LCP measured at 3.2s on mobile — target is <2.5s.',
    status: 'OPEN',
    priority: 'HIGH',
    type: 'TASK',
    reporter_id: sarahMemberId,
    reporter_type: 'MEMBER',
    assignee_id: mikeMemberId,
    assignee_type: 'MEMBER',
  }));

  issues.push(await mkWebIssue({
    title: 'Search results show stale data after filter change',
    description: 'Race condition between filter debounce and API response.',
    status: 'IN_PROGRESS',
    priority: 'MEDIUM',
    type: 'BUG',
    reporter_id: priyaMemberId,
    reporter_type: 'MEMBER',
    assignee_id: qaBot.id,
    assignee_type: 'AGENT',
    ai_summary: 'Likely needs AbortController on the search fetch + React Query queryKey fix.',
  }));

  // ── Issues (API project) ───────────────────────────────────────────────
  let apiNum = 0;
  const mkApiIssue = (data: any) => {
    apiNum += 1;
    return db.issue.create({ data: { ...data, project_id: apiProject.id, number: apiNum } });
  };

  issues.push(await mkApiIssue({
    title: 'Rate limiter throws on Redis cluster failover',
    description: 'When primary Redis node fails, our rate-limit middleware throws instead of degrading.',
    status: 'IN_PROGRESS',
    priority: 'HIGH',
    type: 'BUG',
    reporter_id: ownerMemberId,
    reporter_type: 'MEMBER',
    assignee_id: reviewBot.id,
    assignee_type: 'AGENT',
  }));

  issues.push(await mkApiIssue({
    title: 'Add Stripe webhook signature verification',
    description: 'Currently we trust the webhook payload — must verify signature header.',
    status: 'OPEN',
    priority: 'CRITICAL',
    type: 'TASK',
    reporter_id: ownerMemberId,
    reporter_type: 'MEMBER',
    assignee_id: mikeMemberId,
    assignee_type: 'MEMBER',
  }));

  issues.push(await mkApiIssue({
    title: 'GraphQL introspection enabled in production',
    description: 'Security finding — introspection should be disabled in prod.',
    status: 'CLOSED',
    priority: 'HIGH',
    type: 'BUG',
    reporter_id: ownerMemberId,
    reporter_type: 'MEMBER',
    assignee_id: mikeMemberId,
    assignee_type: 'MEMBER',
    closed_at: new Date(Date.now() - 1000 * 60 * 60 * 24 * 10),
  }));

  issues.push(await mkApiIssue({
    title: 'Pagination cursor breaks when sort field has nulls',
    description: 'Cursor pagination returns duplicate rows when sorted by nullable column.',
    status: 'OPEN',
    priority: 'MEDIUM',
    type: 'BUG',
    reporter_id: sarahMemberId,
    reporter_type: 'MEMBER',
  }));

  issues.push(await mkApiIssue({
    title: 'Implement GDPR data export endpoint',
    description: 'Per-user data export as ZIP. Compliance requirement.',
    status: 'DEV_TESTING',
    priority: 'HIGH',
    type: 'FEATURE',
    reporter_id: ownerMemberId,
    reporter_type: 'MEMBER',
    assignee_id: mikeMemberId,
    assignee_type: 'MEMBER',
  }));

  issues.push(await mkApiIssue({
    title: 'Database connection pool exhausted under load',
    description: 'p99 timeouts above 50 RPS — pool size too low for production traffic.',
    status: 'QA_TESTING',
    priority: 'CRITICAL',
    type: 'BUG',
    reporter_id: sarahMemberId,
    reporter_type: 'MEMBER',
    assignee_id: priyaMemberId,
    assignee_type: 'MEMBER',
  }));

  // ── Labels on issues ───────────────────────────────────────────────────
  console.log('🏷️  Tagging issues with labels...');
  const tag = (issueId: string, labelId: string) =>
    db.issueLabel.create({ data: { issue_id: issueId, label_id: labelId } });

  await tag(issues[0].id, webLabels.frontend);
  await tag(issues[0].id, webLabels.ui);
  await tag(issues[1].id, webLabels.frontend);
  await tag(issues[2].id, webLabels.frontend);
  await tag(issues[4].id, webLabels.security);
  await tag(issues[5].id, webLabels.ui);
  await tag(issues[8].id, apiLabels.backend);
  await tag(issues[9].id, apiLabels.security);
  await tag(issues[10].id, apiLabels.security);
  await tag(issues[12].id, apiLabels.backend);
  await tag(issues[13].id, apiLabels.backend);

  // ── Issue links ────────────────────────────────────────────────────────
  await db.issueLink.create({
    data: { source_issue_id: issues[6].id, target_issue_id: issues[0].id, link_type: 'BLOCKS' },
  });
  await db.issueLink.create({
    data: { source_issue_id: issues[5].id, target_issue_id: issues[7].id, link_type: 'RELATED' },
  });

  // ── Comments ───────────────────────────────────────────────────────────
  console.log('💬 Adding comments...');
  await db.issueComment.createMany({
    data: [
      {
        issue_id: issues[0].id,
        author_id: mikeMemberId,
        author_type: 'MEMBER',
        content: 'Reproduced on my iPhone 14. Looks like the CookieBanner is intercepting taps.',
        type: 'COMMENT',
      },
      {
        issue_id: issues[0].id,
        author_id: qaBot.id,
        author_type: 'AGENT',
        content:
          '**AI Analysis**: Tap coordinates land on CookieBanner div (z-50) which has pointer-events:auto. Fix: set pointer-events:none on the banner or lower z-index.',
        type: 'AI_ANALYSIS',
      },
      {
        issue_id: issues[0].id,
        author_id: sarahMemberId,
        author_type: 'MEMBER',
        content: 'Confirmed root cause. Moving to in-progress.',
        type: 'STATUS_CHANGE',
      },
      {
        issue_id: issues[2].id,
        author_id: mikeMemberId,
        author_type: 'MEMBER',
        content: 'Google OAuth wired up, callback URL configured. Ready for QA.',
        type: 'COMMENT',
      },
      {
        issue_id: issues[4].id,
        author_id: reviewBot.id,
        author_type: 'AGENT',
        content:
          '**Code Review**: Patch looks good. Uses DOMPurify on render path. Suggest also adding a CSP `script-src` header as defense-in-depth.',
        type: 'AI_ANALYSIS',
      },
      {
        issue_id: issues[8].id,
        author_id: reviewBot.id,
        author_type: 'AGENT',
        content:
          '**Code Review**: The new fallback uses `ioredis` retry strategy. Consider also adding a circuit breaker with `opossum`.',
        type: 'AI_ANALYSIS',
      },
    ],
  });

  // ── Quick Captures ─────────────────────────────────────────────────────
  console.log('🎬 Creating quick captures...');
  await db.quickCapture.create({
    data: {
      slug: 'demo-checkout-bug-2641',
      user_id: ownerUserId,
      title: 'Checkout flow broken on mobile',
      description: 'Customer can\'t complete purchase — recording attached.',
      environment_json: { browser: 'Safari', os: 'iOS 17.4', url: 'https://acme.shop/checkout' },
      view_count: 12,
    },
  });

  await db.quickCapture.create({
    data: {
      slug: 'pricing-page-typo-a8f3',
      title: 'Typo on pricing page',
      description: '"Buisness" should be "Business" in the pricing tier card.',
      environment_json: { browser: 'Chrome', os: 'macOS 14.4', url: 'https://acme.com/pricing' },
      view_count: 3,
    },
  });

  // ── API Keys ───────────────────────────────────────────────────────────
  console.log('🔑 Creating API key (for MCP demo)...');
  await db.apiKey.create({
    data: {
      company_id: company.id,
      name: 'MCP Server Key',
      key_hash: 'demo_hashed_key_value_not_real',
      prefix: 'nb_live_demo',
      permissions: { issues: ['read', 'write'], recordings: ['read'] },
    },
  });

  // ── Integration ────────────────────────────────────────────────────────
  console.log('🔌 Creating GitHub integration...');
  await db.integration.create({
    data: {
      company_id: company.id,
      project_id: webProject.id,
      provider: 'GITHUB',
      sync_enabled: true,
      created_by: ownerUserId,
      config_json: { repo: 'acme-corp/web-app', sync_labels: ['bug', 'frontend'] },
      auth_json: { encrypted_token: 'demo-encrypted-placeholder' },
    },
  });

  // ── Regression Suite + Test Cases + Run ────────────────────────────────
  console.log('🧪 Creating regression suite + test run...');
  const suite = await db.regressionSuite.create({
    data: {
      project_id: webProject.id,
      name: 'Checkout Flow — Critical Path',
      description: 'End-to-end smoke + core suite for the purchase funnel.',
    },
  });

  const testCases = await Promise.all([
    db.testCase.create({ data: { suite_id: suite.id, title: 'Add item to cart', tier: 'SMOKE',  priority: 'CRITICAL', steps_json: [{ step: 'Click Add to Cart on product page' }, { step: 'Verify cart count increments' }] } }),
    db.testCase.create({ data: { suite_id: suite.id, title: 'Apply discount code', tier: 'CORE',  priority: 'HIGH',  steps_json: [{ step: 'Enter code SAVE10' }, { step: 'Verify 10% deducted' }] } }),
    db.testCase.create({ data: { suite_id: suite.id, title: 'Checkout as guest', tier: 'SMOKE', priority: 'CRITICAL', steps_json: [{ step: 'Fill guest checkout form' }, { step: 'Submit payment' }] } }),
    db.testCase.create({ data: { suite_id: suite.id, title: 'Checkout with saved address', tier: 'CORE', priority: 'HIGH', steps_json: [{ step: 'Login' }, { step: 'Select saved address' }, { step: 'Pay' }] } }),
    db.testCase.create({ data: { suite_id: suite.id, title: 'Refund flow', tier: 'FULL', priority: 'MEDIUM', steps_json: [{ step: 'Open order' }, { step: 'Request refund' }] } }),
    db.testCase.create({ data: { suite_id: suite.id, title: 'Payment failure handling', tier: 'CORE', priority: 'HIGH', steps_json: [{ step: 'Use declined test card' }, { step: 'Verify error message' }] } }),
    db.testCase.create({ data: { suite_id: suite.id, title: 'Multi-currency display', tier: 'FULL', priority: 'LOW', steps_json: [{ step: 'Switch to EUR' }, { step: 'Verify prices update' }] } }),
    db.testCase.create({ data: { suite_id: suite.id, title: 'Cart persistence across sessions', tier: 'CORE', priority: 'MEDIUM', steps_json: [{ step: 'Add to cart, logout' }, { step: 'Login, verify cart' }] } }),
  ]);

  const run = await db.regressionRun.create({
    data: {
      suite_id: suite.id,
      release_version: 'v2.4.0',
      tier_filter: 'CORE',
      trigger: 'MANUAL',
      executor_type: 'MIXED',
      status: 'COMPLETED',
      started_at: new Date(Date.now() - 1000 * 60 * 60 * 2),
      completed_at: new Date(Date.now() - 1000 * 60 * 30),
      stats_json: { total: 8, passed: 6, failed: 1, blocked: 1, skipped: 0, pass_rate: 0.75 },
    },
  });

  const testResults: Array<[number, 'PASS'|'FAIL'|'BLOCKED'|'SKIPPED', string]> = [
    [0, 'PASS',    priyaMemberId],
    [1, 'PASS',    priyaMemberId],
    [2, 'FAIL',    priyaMemberId],
    [3, 'PASS',    qaBot.id],
    [4, 'PASS',    qaBot.id],
    [5, 'BLOCKED', priyaMemberId],
    [6, 'PASS',    qaBot.id],
    [7, 'PASS',    qaBot.id],
  ];

  for (const [idx, result, testerId] of testResults) {
    await db.testResult.create({
      data: {
        run_id: run.id,
        test_case_id: testCases[idx].id,
        tester_id: testerId,
        tester_type: testerId === qaBot.id ? 'AGENT' : 'MEMBER',
        result,
        notes: result === 'FAIL' ? 'Checkout button unresponsive — see issue WEB-1' : result === 'BLOCKED' ? 'Blocked by payment provider sandbox downtime' : 'OK',
      },
    });
  }

  // Link the failing test case to the open issue
  await db.testCaseBugLink.create({
    data: {
      test_case_id: testCases[2].id,
      issue_id: issues[0].id,
      found_in_run_id: run.id,
    },
  });

  // ── Notifications ──────────────────────────────────────────────────────
  console.log('🔔 Creating notifications...');
  await db.notification.createMany({
    data: [
      {
        user_id: ownerUserId,
        type: 'ISSUE_ASSIGNED',
        title: 'You were assigned WEB-5',
        body: 'XSS vulnerability in comment markdown renderer',
        entity_type: 'ISSUE',
        entity_id: issues[4].id,
        read: false,
      },
      {
        user_id: ownerUserId,
        type: 'AI_ANALYSIS_READY',
        title: 'AI root cause ready for WEB-1',
        body: 'QA Bot identified z-index regression as root cause.',
        entity_type: 'ISSUE',
        entity_id: issues[0].id,
        read: false,
      },
      {
        user_id: ownerUserId,
        type: 'REGRESSION_RUN_COMPLETE',
        title: 'Regression run completed: 6/8 passed',
        body: 'Checkout Flow — Critical Path · v2.4.0',
        entity_type: 'REGRESSION_RUN',
        entity_id: run.id,
        read: true,
      },
      {
        user_id: users['viveksinra@gmail.com'].id,
        type: 'ISSUE_ASSIGNED',
        title: 'Welcome to Acme Corp',
        body: 'You joined as Owner.',
        read: false,
      },
    ],
  });

  console.log('\n✅ Seed complete!\n');
  console.log('  Login:    http://localhost:3000/auth/login');
  console.log('  Dashboard: http://localhost:3000/acme-corp/dashboard');
  console.log('');
  console.log('  Demo accounts (password for all: Demo1234!):');
  for (const u of USERS) {
    console.log(`    • ${u.email.padEnd(28)}  ${u.role}`);
  }
  console.log('');
}

main()
  .catch((e) => {
    console.error('\n❌ Seed failed:\n', e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
