'use client';

import { useParams } from 'next/navigation';
import { Bug, FolderOpen, Users, Bot, Plus, ArrowRight } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import Link from 'next/link';

function StatCard({
  label,
  value,
  icon: Icon,
  loading,
}: {
  label: string;
  value: number | string;
  icon: React.ComponentType<{ className?: string }>;
  loading?: boolean;
}) {
  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-4">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-md bg-neutral-800">
          <Icon className="h-5 w-5 text-neutral-400" />
        </div>
        <div>
          {loading ? (
            <Skeleton className="h-7 w-16" />
          ) : (
            <p className="text-2xl font-bold text-white">{value}</p>
          )}
          <p className="text-xs text-neutral-500">{label}</p>
        </div>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const params = useParams<{ companySlug: string }>();
  const companySlug = params.companySlug;

  const { data: company, isLoading: companyLoading } = trpc.company.getBySlug.useQuery({
    slug: companySlug,
  });

  const { data: projects, isLoading: projectsLoading } = trpc.project.list.useQuery(
    { companyId: company?.id ?? '' },
    { enabled: !!company?.id },
  );

  const { data: agents, isLoading: agentsLoading } = trpc.agent.list.useQuery(
    { companyId: company?.id ?? '' },
    { enabled: !!company?.id },
  );

  const isLoading = companyLoading || projectsLoading;

  return (
    <div className="mx-auto max-w-6xl space-y-8 p-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">
            {companyLoading ? <Skeleton className="h-8 w-48" /> : company?.name}
          </h1>
          <p className="mt-1 text-sm text-neutral-500">Dashboard overview</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link href={`/${companySlug}/settings/projects/new`}>
              <Plus className="mr-1 h-4 w-4" />
              New Project
            </Link>
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Projects"
          value={projects?.pagination?.total ?? 0}
          icon={FolderOpen}
          loading={isLoading}
        />
        <StatCard label="Open Issues" value="—" icon={Bug} loading={isLoading} />
        <StatCard label="Team Members" value="—" icon={Users} loading={isLoading} />
        <StatCard
          label="AI Agents"
          value={agents?.length ?? 0}
          icon={Bot}
          loading={agentsLoading}
        />
      </div>

      {/* Projects List */}
      <div>
        <h2 className="mb-4 text-lg font-semibold text-white">Projects</h2>
        {projectsLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-16 w-full rounded-lg" />
            ))}
          </div>
        ) : (projects?.data?.length ?? 0) === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-neutral-700 py-12">
            <FolderOpen className="mb-3 h-10 w-10 text-neutral-600" />
            <p className="text-sm text-neutral-500">No projects yet</p>
            <Button variant="outline" size="sm" className="mt-4" asChild>
              <Link href={`/${companySlug}/settings/projects/new`}>
                <Plus className="mr-1 h-4 w-4" />
                Create your first project
              </Link>
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            {projects?.data?.map((project) => (
              <Link
                key={project.id}
                href={`/${companySlug}/${project.key}/issues`}
                className="flex items-center justify-between rounded-lg border border-neutral-800 bg-neutral-900/50 p-4 transition-colors hover:border-neutral-700 hover:bg-neutral-900"
              >
                <div className="flex items-center gap-3">
                  <span className="rounded bg-neutral-800 px-2 py-1 font-mono text-xs text-neutral-300">
                    {project.key}
                  </span>
                  <div>
                    <p className="font-medium text-white">{project.name}</p>
                    {project.description && (
                      <p className="mt-0.5 text-xs text-neutral-500">{project.description}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-3 text-neutral-500">
                  <span className="text-sm">{project._count?.issues ?? 0} issues</span>
                  <ArrowRight className="h-4 w-4" />
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Agents */}
      {(agents?.length ?? 0) > 0 && (
        <div>
          <h2 className="mb-4 text-lg font-semibold text-white">AI Agents</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {agents?.map((agent) => (
              <div
                key={agent.id}
                className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-4"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-900/50">
                    <Bot className="h-4 w-4 text-blue-400" />
                  </div>
                  <div>
                    <p className="font-medium text-white">{agent.name}</p>
                    <p className="text-xs text-neutral-500">{agent.type.replace('_', ' ')}</p>
                  </div>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs ${
                      agent.status === 'ACTIVE'
                        ? 'bg-green-900/50 text-green-400'
                        : 'bg-neutral-800 text-neutral-500'
                    }`}
                  >
                    {agent.status}
                  </span>
                  <span className="text-xs text-neutral-600">
                    {(agent as any)._count?.tasks ?? 0} tasks queued
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
