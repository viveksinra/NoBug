import { NextRequest, NextResponse } from 'next/server';
import { db } from '@nobug/db';
import { dispatchWebhooks } from '@/server/routers/webhook';

// ============================================================================
// POST /api/webhooks/deploy — Inbound deploy hook for CI/CD pipelines
// ============================================================================
//
// Auth: X-Deploy-Secret header matched against a company's deploy hook secret.
// The deploy hook secret is stored in an Integration record with provider=WEBHOOK
// and config_json.deploy_hook_secret set.
//
// Payload: { environment, version, commit_sha, deploy_url, triggered_by }
//
// On receive:
// 1. Validate the deploy secret against company webhook integrations
// 2. Trigger regression runs for suites with DEPLOY_WEBHOOK trigger type
// 3. Create ActivityLog entry for the deploy event
// 4. Dispatch deploy.completed webhook to subscribers

export async function POST(req: NextRequest) {
  try {
    // ─── Auth: validate deploy secret ──────────────────────────
    const deploySecret = req.headers.get('x-deploy-secret');
    if (!deploySecret) {
      return NextResponse.json(
        { error: 'Missing X-Deploy-Secret header' },
        { status: 401 },
      );
    }

    // Find the company that owns this deploy hook secret.
    // Deploy hook secrets are stored in Integration (provider=WEBHOOK) config_json
    // as { ..., deploy_hook_secret: "dh_..." }.
    const integrations = await db.integration.findMany({
      where: { provider: 'WEBHOOK' },
    });

    let matchedCompanyId: string | null = null;
    for (const integration of integrations) {
      const config = integration.config_json as Record<string, unknown>;
      if (config.deploy_hook_secret === deploySecret) {
        matchedCompanyId = integration.company_id;
        break;
      }
    }

    if (!matchedCompanyId) {
      return NextResponse.json(
        { error: 'Invalid deploy secret' },
        { status: 403 },
      );
    }

    // ─── Parse request body ────────────────────────────────────
    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON body' },
        { status: 400 },
      );
    }

    const environment = (body.environment as string) ?? 'unknown';
    const version = (body.version as string) ?? null;
    const commitSha = (body.commit_sha as string) ?? null;
    const deployUrl = (body.deploy_url as string) ?? null;
    const triggeredBy = (body.triggered_by as string) ?? 'ci/cd';

    // ─── Create ActivityLog entry ──────────────────────────────
    await db.activityLog.create({
      data: {
        entity_type: 'company',
        entity_id: matchedCompanyId,
        actor_id: 'system',
        actor_type: 'SYSTEM',
        action: 'deploy.completed',
        metadata_json: {
          environment,
          version,
          commit_sha: commitSha,
          deploy_url: deployUrl,
          triggered_by: triggeredBy,
        },
      },
    });

    // ─── Trigger regression runs for DEPLOY_WEBHOOK suites ─────
    const projects = await db.project.findMany({
      where: { company_id: matchedCompanyId },
      select: { id: true },
    });

    const projectIds = projects.map((p) => p.id);

    const suites = await db.regressionSuite.findMany({
      where: {
        project_id: { in: projectIds },
      },
      include: {
        test_cases: {
          select: { id: true },
        },
      },
    });

    const runsCreated: string[] = [];

    for (const suite of suites) {
      if (suite.test_cases.length === 0) continue;

      const run = await db.regressionRun.create({
        data: {
          suite_id: suite.id,
          release_version: version,
          tier_filter: 'SMOKE', // Deploy hooks trigger smoke tests
          trigger: 'DEPLOY_WEBHOOK',
          executor_type: 'HUMAN',
          status: 'PENDING',
          stats_json: {
            total: suite.test_cases.length,
            passed: 0,
            failed: 0,
            blocked: 0,
            skipped: 0,
            pass_rate: 0,
          },
        },
      });

      runsCreated.push(run.id);
    }

    // ─── Dispatch deploy.completed webhook ─────────────────────
    await dispatchWebhooks(db, matchedCompanyId, 'deploy.completed', {
      environment,
      version,
      commit_sha: commitSha,
      deploy_url: deployUrl,
      triggered_by: triggeredBy,
      regression_runs_created: runsCreated.length,
    });

    return NextResponse.json({
      ok: true,
      message: 'Deploy hook received',
      regression_runs_created: runsCreated.length,
      run_ids: runsCreated,
    });
  } catch (error) {
    console.error('[deploy-hook] Error processing deploy webhook:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
