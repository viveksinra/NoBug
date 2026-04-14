import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@nobug/db';
import { validateApiKey } from '@/server/routers/api-key';

/**
 * GET /api/extension/me
 *
 * Returns user info + companies for the browser extension.
 * Supports two auth methods:
 * 1. Session cookie (same-origin or cross-origin with credentials)
 * 2. API key via Authorization: Bearer nb_key_...
 */
export async function GET(req: NextRequest) {
  // Try API key auth first
  const authHeader = req.headers.get('authorization');
  if (authHeader?.startsWith('Bearer nb_key_')) {
    const rawKey = authHeader.slice(7);
    const result = await validateApiKey(db, rawKey);
    if (!result) {
      return NextResponse.json({ error: 'Invalid API key' }, { status: 401 });
    }

    // API key is company-scoped — return that company's info
    const company = await db.company.findUnique({
      where: { id: result.apiKey.company_id },
    });

    if (!company) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 });
    }

    return NextResponse.json({
      user: null, // API key auth doesn't have a user context
      companies: [
        {
          id: company.id,
          name: company.name,
          slug: company.slug,
          role: 'DEVELOPER', // API keys get developer-level access
        },
      ],
    });
  }

  // Try session-based auth
  const session = await auth.api.getSession({
    headers: req.headers,
  });

  if (!session?.user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  // Get user's company memberships
  const memberships = await db.member.findMany({
    where: { user_id: session.user.id },
    include: { company: true },
  });

  return NextResponse.json({
    user: {
      id: session.user.id,
      name: session.user.name,
      email: session.user.email,
      avatar_url: session.user.image,
    },
    companies: memberships.map((m) => ({
      id: m.company.id,
      name: m.company.name,
      slug: m.company.slug,
      role: m.role,
    })),
  });
}
