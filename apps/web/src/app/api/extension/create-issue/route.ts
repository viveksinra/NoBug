import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@nobug/db';
import { validateApiKey } from '@/server/routers/api-key';
import { PRIORITIES } from '@nobug/shared';

/**
 * POST /api/extension/create-issue
 *
 * Creates an Issue from the browser extension with linked recording/screenshot metadata.
 * Auth: session cookie or API key Bearer token (required).
 */
export async function POST(req: NextRequest) {
  const body = await req.json();

  // Auth: API key or session
  const authHeader = req.headers.get('authorization');
  let userId: string | null = null;
  let apiKeyCompanyId: string | null = null;

  if (authHeader?.startsWith('Bearer nb_key_')) {
    const rawKey = authHeader.slice(7);
    const result = await validateApiKey(db, rawKey);
    if (!result) {
      return NextResponse.json({ error: 'Invalid API key' }, { status: 401 });
    }
    apiKeyCompanyId = result.apiKey.company_id;
  } else {
    const session = await auth.api.getSession({ headers: req.headers });
    if (!session?.user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    userId = session.user.id;
  }

  // Validate required fields
  const {
    projectId,
    title,
    description,
    priority,
    assigneeId,
    assigneeType,
    labelIds,
    environmentJson,
    captureData,
  } = body;

  if (!projectId || !title) {
    return NextResponse.json(
      { error: 'projectId and title are required' },
      { status: 400 },
    );
  }

  if (priority && !PRIORITIES.includes(priority)) {
    return NextResponse.json(
      { error: `Invalid priority. Must be one of: ${PRIORITIES.join(', ')}` },
      { status: 400 },
    );
  }

  // Verify project exists and get company
  const project = await db.project.findUnique({
    where: { id: projectId },
    select: { id: true, key: true, company_id: true },
  });

  if (!project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  // Verify membership / API key access
  let memberId: string;

  if (userId) {
    const member = await db.member.findFirst({
      where: { user_id: userId, company_id: project.company_id },
    });
    if (!member) {
      return NextResponse.json(
        { error: 'Not a member of this project\'s company' },
        { status: 403 },
      );
    }
    memberId = member.id;
  } else if (apiKeyCompanyId) {
    if (apiKeyCompanyId !== project.company_id) {
      return NextResponse.json(
        { error: 'API key does not belong to this company' },
        { status: 403 },
      );
    }
    // For API key auth, use a system-level reporter
    // Find the first admin member as the reporter
    const adminMember = await db.member.findFirst({
      where: { company_id: project.company_id, role: 'OWNER' },
    });
    memberId = adminMember?.id ?? 'system';
  } else {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  // Get next issue number
  const lastIssue = await db.issue.aggregate({
    where: { project_id: projectId },
    _max: { number: true },
  });
  const number = (lastIssue._max?.number ?? 0) + 1;

  // Create issue in a transaction
  const issue = await db.$transaction(async (tx) => {
    const newIssue = await tx.issue.create({
      data: {
        project_id: projectId,
        number,
        title,
        description: description ?? '',
        status: 'OPEN',
        priority: priority ?? 'MEDIUM',
        type: 'BUG',
        reporter_id: memberId,
        reporter_type: 'MEMBER',
        assignee_id: assigneeId ?? null,
        assignee_type: assigneeType ?? null,
        environment_json: environmentJson ?? undefined,
      },
    });

    // Attach labels
    if (labelIds?.length) {
      await tx.issueLabel.createMany({
        data: labelIds.map((labelId: string) => ({
          issue_id: newIssue.id,
          label_id: labelId,
        })),
      });
    }

    // Create activity log
    await tx.activityLog.create({
      data: {
        entity_type: 'ISSUE',
        entity_id: newIssue.id,
        actor_id: memberId,
        actor_type: 'MEMBER',
        action: 'CREATED',
        metadata_json: {
          issue_number: number,
          project_key: project.key,
          source: 'extension',
          captureData: captureData ?? null,
        } as any,
      },
    });

    // If assigned to an agent, create AgentTask
    if (assigneeType === 'AGENT' && assigneeId) {
      await tx.agentTask.create({
        data: {
          agent_id: assigneeId,
          company_id: project.company_id,
          task_type: 'FIX_BUG',
          entity_type: 'ISSUE',
          entity_id: newIssue.id,
        },
      });
    }

    // Note: Recording and Screenshot records are created after S3 upload
    // via the /api/extension/upload endpoint (T-031). The captureData metadata
    // (eventCount, consoleLogCount, networkLogCount, hasScreenshot) is stored
    // in the activity log for reference.

    return newIssue;
  });

  const issueKey = `${project.key}-${number}`;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

  // Find the company slug for the URL
  const company = await db.company.findUnique({
    where: { id: project.company_id },
    select: { slug: true },
  });

  const issueUrl = `${appUrl}/${company?.slug}/projects/${project.key}/issues/${number}`;

  return NextResponse.json({
    id: issue.id,
    number,
    key: issueKey,
    url: issueUrl,
    shareUrl: issueUrl,
  });
}
