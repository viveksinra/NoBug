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

// POST /api/v1/bugs/:id/comments — Add a comment to a bug
export async function POST(
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

  const { content } = body;
  if (!content || typeof content !== 'string' || !content.trim()) {
    return NextResponse.json({ error: 'content is required' }, { status: 400 });
  }

  // Verify bug exists and belongs to the company
  const issue = await db.issue.findFirst({
    where: {
      id,
      project: { company_id: apiKey.company_id },
      ...(apiKey.project_id ? { project_id: apiKey.project_id } : {}),
    },
  });

  if (!issue) {
    return NextResponse.json({ error: 'Bug not found' }, { status: 404 });
  }

  const comment = await db.issueComment.create({
    data: {
      issue_id: id,
      author_id: apiKey.id,
      author_type: 'AGENT',
      content: content.trim(),
      type: 'COMMENT',
    },
  });

  return NextResponse.json(comment, { status: 201 });
}
