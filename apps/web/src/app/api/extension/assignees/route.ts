import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@nobug/db';
import { validateApiKey } from '@/server/routers/api-key';

/**
 * GET /api/extension/assignees?companyId=...
 *
 * Returns members + agents for a company. Used by the extension for assignee selector.
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

  // Get members
  const members = await db.member.findMany({
    where: { company_id: companyId },
    include: { user: { select: { id: true, name: true, email: true, avatar_url: true } } },
  });

  // Get agents
  const agents = await db.agent.findMany({
    where: { company_id: companyId, status: 'ACTIVE' },
    select: { id: true, name: true, type: true, avatar_url: true },
  });

  const assignees = [
    ...members.map((m) => ({
      id: m.id,
      type: 'MEMBER' as const,
      name: m.user.name,
      email: m.user.email,
      avatar_url: m.user.avatar_url,
    })),
    ...agents.map((a) => ({
      id: a.id,
      type: 'AGENT' as const,
      name: a.name,
      email: null,
      avatar_url: a.avatar_url,
    })),
  ];

  return NextResponse.json({ assignees });
}
