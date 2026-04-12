'use client';

import { useParams } from 'next/navigation';
import { trpc } from '@/lib/trpc';
import { Skeleton } from '@/components/ui/skeleton';
import { ISSUE_STATUS_DISPLAY_ORDER, PRIORITY_COLORS } from '@nobug/shared';
import Link from 'next/link';

const STATUS_LABELS: Record<string, string> = {
  OPEN: 'Open',
  IN_PROGRESS: 'In Progress',
  DEV_TESTING: 'Dev Testing',
  QA_TESTING: 'QA Testing',
  CLOSED: 'Closed',
  REOPENED: 'Reopened',
};

const STATUS_DOT_COLORS: Record<string, string> = {
  OPEN: 'bg-blue-400',
  IN_PROGRESS: 'bg-yellow-400',
  DEV_TESTING: 'bg-purple-400',
  QA_TESTING: 'bg-orange-400',
  CLOSED: 'bg-green-400',
  REOPENED: 'bg-red-400',
};

export default function BoardPage() {
  const params = useParams<{ companySlug: string; projectKey: string }>();

  const { data: company } = trpc.company.getBySlug.useQuery({ slug: params.companySlug });
  const { data: project } = trpc.project.getByKey.useQuery(
    { companyId: company?.id ?? '', key: params.projectKey },
    { enabled: !!company?.id },
  );

  const { data: statusCounts, isLoading: countsLoading } = trpc.issue.statusCounts.useQuery(
    { companyId: company?.id ?? '', projectId: project?.id ?? '' },
    { enabled: !!project?.id },
  );

  // Fetch issues per status column
  const columns = ISSUE_STATUS_DISPLAY_ORDER.filter((s) => s !== 'CLOSED');

  return (
    <div className="flex h-full flex-col p-6">
      <h1 className="mb-4 text-xl font-bold text-white">Board</h1>

      <div className="flex flex-1 gap-4 overflow-x-auto pb-4">
        {columns.map((status) => (
          <BoardColumn
            key={status}
            status={status}
            label={STATUS_LABELS[status] ?? status}
            dotColor={STATUS_DOT_COLORS[status] ?? 'bg-neutral-400'}
            count={statusCounts?.[status] ?? 0}
            companySlug={params.companySlug}
            companyId={company?.id}
            projectId={project?.id}
            projectKey={params.projectKey}
            loading={countsLoading}
          />
        ))}
      </div>
    </div>
  );
}

function BoardColumn({
  status,
  label,
  dotColor,
  count,
  companySlug,
  companyId,
  projectId,
  projectKey,
  loading,
}: {
  status: string;
  label: string;
  dotColor: string;
  count: number;
  companySlug: string;
  companyId?: string;
  projectId?: string;
  projectKey: string;
  loading: boolean;
}) {
  const { data: issues, isLoading } = trpc.issue.list.useQuery(
    {
      companyId: companyId ?? '',
      projectId: projectId ?? '',
      status: status as any,
      limit: 50,
      sortBy: 'updated_at',
      sortOrder: 'desc',
    },
    { enabled: !!projectId },
  );

  return (
    <div className="flex w-72 shrink-0 flex-col rounded-lg border border-neutral-800 bg-neutral-900/30">
      {/* Column header */}
      <div className="flex items-center gap-2 border-b border-neutral-800 px-3 py-2">
        <span className={`h-2 w-2 rounded-full ${dotColor}`} />
        <span className="text-sm font-medium text-neutral-300">{label}</span>
        <span className="ml-auto rounded bg-neutral-800 px-1.5 py-0.5 text-xs text-neutral-500">
          {loading ? '...' : count}
        </span>
      </div>

      {/* Cards */}
      <div className="flex-1 space-y-2 overflow-y-auto p-2">
        {isLoading ? (
          <>
            <Skeleton className="h-20 w-full rounded" />
            <Skeleton className="h-20 w-full rounded" />
          </>
        ) : (
          issues?.data?.map((issue) => (
            <Link
              key={issue.id}
              href={`/${companySlug}/${projectKey}/issues/${issue.number}`}
              className="block rounded border border-neutral-800 bg-neutral-900 p-3 transition-colors hover:border-neutral-600"
            >
              <div className="flex items-start gap-2">
                <span
                  className="mt-1 h-2 w-2 shrink-0 rounded-full"
                  style={{
                    backgroundColor:
                      PRIORITY_COLORS[issue.priority as keyof typeof PRIORITY_COLORS],
                  }}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-white">{issue.title}</p>
                  <p className="mt-1 font-mono text-xs text-neutral-500">{issue.key}</p>
                </div>
              </div>
              {issue.labels?.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {issue.labels.slice(0, 3).map((il: any) => (
                    <span
                      key={il.label.id}
                      className="rounded px-1.5 py-0.5 text-xs"
                      style={{
                        backgroundColor: il.label.color + '20',
                        color: il.label.color,
                      }}
                    >
                      {il.label.name}
                    </span>
                  ))}
                </div>
              )}
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
