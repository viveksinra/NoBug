import { Sidebar } from '@/components/layout/sidebar';

export default async function CompanyLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ companySlug: string; projectKey?: string }>;
}) {
  const { companySlug, projectKey } = await params;

  return (
    <div className="flex h-screen bg-neutral-950 text-neutral-100">
      <Sidebar companySlug={companySlug} projectKey={projectKey} />
      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}
