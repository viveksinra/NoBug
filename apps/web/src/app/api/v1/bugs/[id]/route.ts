import { NextRequest, NextResponse } from 'next/server';
import { db } from '@nobug/db';
import { validateApiKey } from '@/server/routers/api-key';

async function authenticate(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return null;
  }
  return validateApiKey(db, authHeader.slice(7));
}

// GET /api/v1/bugs/:id — Get bug details
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await authenticate(req);
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const { apiKey } = auth;

  const issue = await db.issue.findFirst({
    where: {
      id,
      project: { company_id: apiKey.company_id },
      ...(apiKey.project_id ? { project_id: apiKey.project_id } : {}),
    },
    include: {
      project: { select: { key: true } },
      labels: { include: { label: true } },
      comments: {
        orderBy: { created_at: 'asc' },
        take: 50,
      },
      recordings: {
        orderBy: { created_at: 'desc' },
      },
      screenshots: {
        orderBy: { created_at: 'desc' },
      },
    },
  });

  if (!issue) {
    return NextResponse.json({ error: 'Bug not found' }, { status: 404 });
  }

  return NextResponse.json({
    ...issue,
    key: `${issue.project.key}-${issue.number}`,
  });
}

// PATCH /api/v1/bugs/:id — Update a bug
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await authenticate(req);
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const { apiKey } = auth;

  // Check write permission
  const permissions = apiKey.permissions as { read?: boolean; write?: boolean } | null;
  if (!permissions?.write) {
    return NextResponse.json({ error: 'API key does not have write permission' }, { status: 401 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  // Verify bug exists and belongs to the company
  const existing = await db.issue.findFirst({
    where: {
      id,
      project: { company_id: apiKey.company_id },
      ...(apiKey.project_id ? { project_id: apiKey.project_id } : {}),
    },
    include: { project: { select: { key: true } } },
  });

  if (!existing) {
    return NextResponse.json({ error: 'Bug not found' }, { status: 404 });
  }

  // Build update data from allowed fields
  const data: any = {};
  if (body.title !== undefined) data.title = body.title;
  if (body.description !== undefined) data.description = body.description;
  if (body.status !== undefined) {
    data.status = body.status;
    if (body.status === 'CLOSED') data.closed_at = new Date();
    if (body.status === 'REOPENED') data.closed_at = null;
  }
  if (body.priority !== undefined) data.priority = body.priority;
  if (body.assigneeId !== undefined) data.assignee_id = body.assigneeId;
  if (body.assigneeType !== undefined) data.assignee_type = body.assigneeType;

  const updated = await db.issue.update({
    where: { id },
    data,
  });

  return NextResponse.json({
    ...updated,
    key: `${existing.project.key}-${updated.number}`,
  });
}
