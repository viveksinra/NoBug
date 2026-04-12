'use client';

import { useParams } from 'next/navigation';
import { trpc } from '@/lib/trpc';
import { ProjectSelector } from '@/components/layout/project-selector';
import { Skeleton } from '@/components/ui/skeleton';

export default function ProjectLayout({ children }: { children: React.ReactNode }) {
  const params = useParams<{ companySlug: string; projectKey: string }>();

  const { data: company } = trpc.company.getBySlug.useQuery({
    slug: params.companySlug,
  });

  return (
    <div className="flex h-full flex-col">
      {/* Project header bar */}
      <div className="flex h-12 items-center gap-4 border-b border-neutral-800 px-6">
        {company ? (
          <ProjectSelector
            companySlug={params.companySlug}
            companyId={company.id}
            currentProjectKey={params.projectKey}
          />
        ) : (
          <Skeleton className="h-8 w-48" />
        )}
      </div>
      <div className="flex-1 overflow-y-auto">{children}</div>
    </div>
  );
}
