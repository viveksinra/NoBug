import { NextRequest, NextResponse } from 'next/server';
import { db } from '@nobug/db';
import { validateApiKey } from '@/server/routers/api-key';

// Helper: extract and validate API key from Authorization header
async function authenticate(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return null;
  }
  const rawKey = authHeader.slice(7);
  return validateApiKey(db, rawKey);
}

// GET /api/v1/bugs — List bugs with filters and pagination
export async function GET(req: NextRequest) {
  const auth = await authenticate(req);
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get('projectId');
  const status = searchParams.get('status');
  const priority = searchParams.get('priority');
  const assigneeId = searchParams.get('assigneeId');
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') ?? '25', 10)));
  const skip = (page - 1) * limit;

  const { apiKey } = auth;

  // Build where clause scoped to the company (and optionally the key's project)
  const where: any = {
    project: { company_id: apiKey.company_id },
  };

  // If the API key is scoped to a specific project, enforce it
  if (apiKey.project_id) {
    where.project_id = apiKey.project_id;
  }

  // Apply optional filters
  if (projectId) {
    where.project_id = projectId;
  }
  if (status) {
    where.status = status;
  }
  if (priority) {
    where.priority = priority;
  }
  if (assigneeId) {
    where.assignee_id = assigneeId;
  }

  const [issues, total] = await Promise.all([
    db.issue.findMany({
      where,
      include: {
        project: { select: { key: true } },
        labels: { include: { label: true } },
        _count: { select: { comments: true } },
      },
      orderBy: { created_at: 'desc' },
      skip,
      take: limit,
    }),
    db.issue.count({ where }),
  ]);

  const data = issues.map((issue) => ({
    ...issue,
    key: `${issue.project.key}-${issue.number}`,
  }));

  return NextResponse.json({
    data,
    pagination: {
      total,
      page,
      limit,
      has_more: skip + issues.length < total,
    },
  });
}

// POST /api/v1/bugs — Create a new bug
export async function POST(req: NextRequest) {
  const auth = await authenticate(req);
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

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

  const { title, description, projectId, priority, assigneeId, assigneeType } = body;

  if (!title || typeof title !== 'string') {
    return NextResponse.json({ error: 'title is required' }, { status: 400 });
  }
  if (!projectId || typeof projectId !== 'string') {
    return NextResponse.json({ error: 'projectId is required' }, { status: 400 });
  }

  // If API key is project-scoped, ensure it matches
  if (apiKey.project_id && apiKey.project_id !== projectId) {
    return NextResponse.json({ error: 'API key is not authorized for this project' }, { status: 401 });
  }

  // Verify project belongs to the company
  const project = await db.project.findFirst({
    where: { id: projectId, company_id: apiKey.company_id },
  });

  if (!project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  // Get next issue number
  const result = await db.issue.aggregate({
    where: { project_id: projectId },
    _max: { number: true },
  });
  const number = (result._max?.number ?? 0) + 1;

  const issue = await db.issue.create({
    data: {
      project_id: projectId,
      number,
      title,
      description: description ?? '',
      status: 'OPEN',
      priority: priority ?? 'MEDIUM',
      type: 'BUG',
      reporter_id: apiKey.id,
      reporter_type: 'AGENT',
      assignee_id: assigneeId ?? null,
      assignee_type: assigneeType ?? null,
    },
  });

  return NextResponse.json(
    { ...issue, key: `${project.key}-${number}` },
    { status: 201 },
  );
}
