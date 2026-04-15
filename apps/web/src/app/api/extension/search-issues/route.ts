import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@nobug/db';
import { validateApiKey } from '@/server/routers/api-key';

/**
 * GET /api/extension/search-issues
 *
 * Search issues by query string for the "attach to issue" picker in the extension.
 * Query params: q (search), companyId, projectId (optional), limit (optional, default 10)
 * Auth: session cookie or API key Bearer token.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const query = searchParams.get('q') ?? '';
  const companyId = searchParams.get('companyId');
  const projectId = searchParams.get('projectId');
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '10', 10), 50);

  // Auth: API key or session
  const authHeader = req.headers.get('authorization');
  const resolvedCompanyId = await resolveCompanyId(req, authHeader, companyId);

  async function resolveCompanyId(
    req: NextRequest,
    authHeader: string | null,
    companyId: string | null,
  ): Promise<string | null> {
    if (authHeader?.startsWith('Bearer nb_key_')) {
      const rawKey = authHeader.slice(7);
      const result = await validateApiKey(db, rawKey);
      if (!result) return null;
      return result.apiKey.company_id;
    }

    const session = await auth.api.getSession({ headers: req.headers });
    if (!session?.user) return null;

    if (companyId) {
      const member = await db.member.findFirst({
        where: { user_id: session.user.id, company_id: companyId },
      });
      return member ? companyId : null;
    }

    const firstMember = await db.member.findFirst({
      where: { user_id: session.user.id },
      select: { company_id: true },
    });
    return firstMember?.company_id ?? null;
  }

  if (!resolvedCompanyId) {
    return NextResponse.json({ error: 'No company context' }, { status: 400 });
  }

  // Build the where clause
  const where: any = {
    project: { company_id: resolvedCompanyId },
  };

  if (projectId) {
    where.project_id = projectId;
  }

  if (query.trim()) {
    // Check if query looks like a number (issue number search)
    const numberMatch = query.match(/^#?(\d+)$/);
    if (numberMatch) {
      where.number = parseInt(numberMatch[1], 10);
    } else {
      where.OR = [
        { title: { contains: query, mode: 'insensitive' as const } },
        { description: { contains: query, mode: 'insensitive' as const } },
      ];
    }
  }

  const issues = await db.issue.findMany({
    where,
    include: {
      project: {
        select: { key: true },
      },
    },
    orderBy: { updated_at: 'desc' },
    take: limit,
  });

  return NextResponse.json({
    issues: issues.map((issue) => ({
      id: issue.id,
      number: issue.number,
      title: issue.title,
      status: issue.status,
      projectKey: issue.project.key,
      key: `${issue.project.key}-${issue.number}`,
    })),
  });
}
