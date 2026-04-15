import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@nobug/db';
import { validateApiKey } from '@/server/routers/api-key';
import { RECORDING_TYPES } from '@nobug/shared';

/**
 * POST /api/extension/attach-recording
 *
 * Attach a recording to an existing issue (used for dev/QA testing workflow).
 * Input: issueId, recordingType (DEV_TEST/QA_TEST), captureData, environmentJson
 * Creates Recording record, IssueComment (RECORDING_ATTACHED), and ActivityLog.
 * Auth: session cookie or API key Bearer token.
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

  // Validate input
  const { issueId, recordingType, captureData, environmentJson } = body;

  if (!issueId) {
    return NextResponse.json({ error: 'issueId is required' }, { status: 400 });
  }

  const validRecordingTypes = ['DEV_TEST', 'QA_TEST'];
  if (!recordingType || !validRecordingTypes.includes(recordingType)) {
    return NextResponse.json(
      { error: `recordingType must be one of: ${validRecordingTypes.join(', ')}` },
      { status: 400 },
    );
  }

  // Fetch the issue and verify access
  const issue = await db.issue.findUnique({
    where: { id: issueId },
    include: {
      project: { select: { id: true, key: true, company_id: true } },
    },
  });

  if (!issue) {
    return NextResponse.json({ error: 'Issue not found' }, { status: 404 });
  }

  // Verify membership / API key access
  let memberId: string;

  if (userId) {
    const member = await db.member.findFirst({
      where: { user_id: userId, company_id: issue.project.company_id },
    });
    if (!member) {
      return NextResponse.json(
        { error: "Not a member of this issue's company" },
        { status: 403 },
      );
    }
    memberId = member.id;
  } else if (apiKeyCompanyId) {
    if (apiKeyCompanyId !== issue.project.company_id) {
      return NextResponse.json(
        { error: 'API key does not belong to this company' },
        { status: 403 },
      );
    }
    const adminMember = await db.member.findFirst({
      where: { company_id: issue.project.company_id, role: 'OWNER' },
    });
    memberId = adminMember?.id ?? 'system';
  } else {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  // Create recording, comment, and activity log in a transaction
  const result = await db.$transaction(async (tx) => {
    // Create Recording record
    const recording = await tx.recording.create({
      data: {
        issue_id: issueId,
        uploader_id: memberId,
        uploader_type: 'MEMBER',
        type: recordingType as any,
        storage_url: '', // Placeholder — actual S3 URL set after upload via /api/extension/upload
        environment_json: environmentJson ?? undefined,
        duration_ms: captureData?.durationMs ?? null,
      },
    });

    // Create IssueComment with type RECORDING_ATTACHED
    const typeLabel = recordingType === 'DEV_TEST' ? 'Dev Test' : 'QA Test';
    await tx.issueComment.create({
      data: {
        issue_id: issueId,
        author_id: memberId,
        author_type: 'MEMBER',
        content: `${typeLabel} recording attached${captureData?.eventCount ? ` (${captureData.eventCount} events)` : ''}`,
        type: 'RECORDING_ATTACHED',
      },
    });

    // Create ActivityLog entry
    await tx.activityLog.create({
      data: {
        entity_type: 'ISSUE',
        entity_id: issueId,
        actor_id: memberId,
        actor_type: 'MEMBER',
        action: 'RECORDING_ATTACHED',
        metadata_json: {
          recording_id: recording.id,
          recording_type: recordingType,
          issue_number: issue.number,
          project_key: issue.project.key,
          source: 'extension',
          captureData: captureData ?? null,
        } as any,
      },
    });

    return recording;
  });

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const company = await db.company.findUnique({
    where: { id: issue.project.company_id },
    select: { slug: true },
  });

  const issueUrl = `${appUrl}/${company?.slug}/projects/${issue.project.key}/issues/${issue.number}`;

  return NextResponse.json({
    recordingId: result.id,
    issueId: issue.id,
    issueNumber: issue.number,
    issueKey: `${issue.project.key}-${issue.number}`,
    issueUrl,
  });
}
