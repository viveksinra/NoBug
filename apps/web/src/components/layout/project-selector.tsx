'use client';

import { useRouter } from 'next/navigation';
import { FolderOpen, ChevronDown, Plus } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

interface ProjectSelectorProps {
  companySlug: string;
  companyId: string;
  currentProjectKey?: string;
}

export function ProjectSelector({ companySlug, companyId, currentProjectKey }: ProjectSelectorProps) {
  const router = useRouter();
  const { data, isLoading } = trpc.project.list.useQuery({ companyId });

  const projects = data?.data ?? [];
  const currentProject = projects.find((p) => p.key === currentProjectKey);

  if (isLoading) {
    return <Skeleton className="h-8 w-48" />;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <FolderOpen className="h-4 w-4" />
          <span className="max-w-[120px] truncate">{currentProject?.name ?? 'Select Project'}</span>
          <ChevronDown className="h-3 w-3 text-neutral-500" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuLabel>Projects</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {projects.length === 0 ? (
          <DropdownMenuItem disabled className="text-neutral-500">
            No projects yet
          </DropdownMenuItem>
        ) : (
          projects.map((project) => (
            <DropdownMenuItem
              key={project.id}
              onClick={() => router.push(`/${companySlug}/${project.key}/issues`)}
              className={project.key === currentProjectKey ? 'bg-neutral-800' : ''}
            >
              <span className="mr-2 rounded bg-neutral-700 px-1.5 py-0.5 text-xs font-mono">
                {project.key}
              </span>
              <span className="truncate">{project.name}</span>
            </DropdownMenuItem>
          ))
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => router.push(`/${companySlug}/settings/projects/new`)}>
          <Plus className="mr-2 h-4 w-4" />
          Create Project
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
