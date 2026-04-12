'use client';

import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { Bug, Plus, Search, Filter } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ISSUE_STATUSES, PRIORITIES, PRIORITY_COLORS } from '@nobug/shared';
import Link from 'next/link';

const STATUS_COLORS: Record<string, string> = {
  OPEN: 'bg-blue-500/20 text-blue-400',
  IN_PROGRESS: 'bg-yellow-500/20 text-yellow-400',
  DEV_TESTING: 'bg-purple-500/20 text-purple-400',
  QA_TESTING: 'bg-orange-500/20 text-orange-400',
  CLOSED: 'bg-green-500/20 text-green-400',
  REOPENED: 'bg-red-500/20 text-red-400',
};

export default function IssuesListPage() {
  const params = useParams<{ companySlug: string; projectKey: string }>();
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string | undefined>();
  const [priorityFilter, setPriorityFilter] = useState<string | undefined>();
  const [page, setPage] = useState(1);

  const { data: company } = trpc.company.getBySlug.useQuery({ slug: params.companySlug });
  const { data: project } = trpc.project.getByKey.useQuery(
    { companyId: company?.id ?? '', key: params.projectKey },
    { enabled: !!company?.id },
  );

  const { data: issues, isLoading } = trpc.issue.list.useQuery(
    {
      companyId: company?.id ?? '',
      projectId: project?.id ?? '',
      search: search || undefined,
      status: statusFilter as any,
      priority: priorityFilter as any,
      page,
      limit: 25,
    },
    { enabled: !!project?.id },
  );

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-white">Issues</h1>
        <Button
          size="sm"
          onClick={() => router.push(`/${params.companySlug}/${params.projectKey}/issues/new`)}
        >
          <Plus className="mr-1 h-4 w-4" />
          New Issue
        </Button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-500" />
          <input
            type="text"
            placeholder="Search issues..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="h-9 w-full rounded-md border border-neutral-700 bg-neutral-900 pl-9 pr-3 text-sm text-white placeholder-neutral-500 focus:border-neutral-500 focus:outline-none"
          />
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
              <Filter className="mr-1 h-4 w-4" />
              Status{statusFilter ? `: ${statusFilter}` : ''}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem onClick={() => { setStatusFilter(undefined); setPage(1); }}>
              All Statuses
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {ISSUE_STATUSES.map((s) => (
              <DropdownMenuItem key={s} onClick={() => { setStatusFilter(s); setPage(1); }}>
                {s.replace('_', ' ')}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
              Priority{priorityFilter ? `: ${priorityFilter}` : ''}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem onClick={() => { setPriorityFilter(undefined); setPage(1); }}>
              All Priorities
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {PRIORITIES.map((p) => (
              <DropdownMenuItem key={p} onClick={() => { setPriorityFilter(p); setPage(1); }}>
                <span
                  className="mr-2 h-2 w-2 rounded-full"
                  style={{ backgroundColor: PRIORITY_COLORS[p] }}
                />
                {p}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Issue List */}
      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-14 w-full rounded-lg" />
          ))}
        </div>
      ) : (issues?.data?.length ?? 0) === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-neutral-700 py-16">
          <Bug className="mb-3 h-10 w-10 text-neutral-600" />
          <p className="text-sm text-neutral-500">
            {search || statusFilter || priorityFilter ? 'No issues match your filters' : 'No issues yet'}
          </p>
          {!search && !statusFilter && !priorityFilter && (
            <Button
              variant="outline"
              size="sm"
              className="mt-4"
              onClick={() => router.push(`/${params.companySlug}/${params.projectKey}/issues/new`)}
            >
              <Plus className="mr-1 h-4 w-4" />
              Create your first issue
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-1">
          {issues?.data?.map((issue) => (
            <Link
              key={issue.id}
              href={`/${params.companySlug}/${params.projectKey}/issues/${issue.number}`}
              className="flex items-center gap-3 rounded-lg border border-neutral-800 bg-neutral-900/50 px-4 py-3 transition-colors hover:border-neutral-700 hover:bg-neutral-900"
            >
              <span className="shrink-0 font-mono text-xs text-neutral-500">{issue.key}</span>
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: PRIORITY_COLORS[issue.priority as keyof typeof PRIORITY_COLORS] }}
                title={issue.priority}
              />
              <span className="flex-1 truncate text-sm text-white">{issue.title}</span>
              <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_COLORS[issue.status] ?? ''}`}>
                {issue.status.replace('_', ' ')}
              </span>
              {(issue as any)._count?.comments > 0 && (
                <span className="text-xs text-neutral-500">{(issue as any)._count.comments} comments</span>
              )}
            </Link>
          ))}
        </div>
      )}

      {/* Pagination */}
      {issues && issues.pagination.total > issues.pagination.limit && (
        <div className="flex items-center justify-between pt-4">
          <span className="text-sm text-neutral-500">
            Showing {(page - 1) * 25 + 1}-{Math.min(page * 25, issues.pagination.total)} of{' '}
            {issues.pagination.total}
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page === 1}
              onClick={() => setPage(page - 1)}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={!issues.pagination.has_more}
              onClick={() => setPage(page + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
