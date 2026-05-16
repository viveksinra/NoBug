import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { auth } from '@/lib/auth';
import { db } from '@snagbug/db';

/**
 * After login, middleware sends users to /dashboard. This page picks the
 * user's first company and redirects to /{companySlug}/dashboard.
 * If the user has no company yet, send them to onboarding (placeholder: /).
 */
export default async function DashboardRedirectPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) redirect('/auth/login');

  const membership = await db.member.findFirst({
    where: { user_id: session.user.id },
    include: { company: { select: { slug: true } } },
    orderBy: { joined_at: 'asc' },
  });

  if (!membership) redirect('/');
  redirect(`/${membership.company.slug}/dashboard`);
}
