import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@nobug/db';
import { validateApiKey } from '@/server/routers/api-key';

/**
 * GET /api/extension/projects?companyId=...
 *
 * Returns projects for a company. Used by the extension for project selector.
 * Auth: session cookie or API key Bearer token.
 */
export async function GET(req: NextRequest) {
  const companyId = req.nextUrl.searchParams.get('companyId');
  if (!companyId) {
    return NextResponse.json({ error: 'companyId is required' }, { status: 400 });
  }

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

  // Verify membership
  if (userId) {
    const member = await db.member.findFirst({
      where: { user_id: userId, company_id: companyId },
    });
    if (!member) {
      return NextResponse.json({ error: 'Not a member of this company' }, { status: 403 });
    }
  } else if (apiKeyCompanyId && apiKeyCompanyId !== companyId) {
    return NextResponse.json({ error: 'API key does not belong to this company' }, { status: 403 });
  }

  const projects = await db.project.findMany({
    where: {
      company_id: companyId,
      // Exclude archived projects
      NOT: {
        settings_json: {
          path: ['archived'],
          equals: true,
        },
      },
    },
    select: {
      id: true,
      name: true,
      key: true,
    },
    orderBy: { name: 'asc' },
  });

  return NextResponse.json({ projects });
}
