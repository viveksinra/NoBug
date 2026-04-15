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

// GET /api/v1/bugs/search — Search bugs by query string
export async function GET(req: NextRequest) {
  const auth = await authenticate(req);
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const query = searchParams.get('q') ?? searchParams.get('query') ?? '';
  const projectId = searchParams.get('projectId');
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') ?? '25', 10)));
  const skip = (page - 1) * limit;

  const { apiKey } = auth;

  if (!query.trim()) {
    return NextResponse.json({ error: 'Search query (q) is required' }, { status: 400 });
  }

  const where: any = {
    project: { company_id: apiKey.company_id },
    OR: [
      { title: { contains: query, mode: 'insensitive' as const } },
      { description: { contains: query, mode: 'insensitive' as const } },
    ],
  };

  // Scope to API key's project if applicable
  if (apiKey.project_id) {
    where.project_id = apiKey.project_id;
  }
  if (projectId) {
    where.project_id = projectId;
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
