'use client';

import { useParams, useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import { FolderOpen } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import {
  SettingsShell,
  SettingsSection,
  SettingsCard,
  DangerZone,
} from '@/components/settings/settings-shell';
import { ConfirmDialog } from '@/components/settings/confirm-dialog';

export default function ProjectSettingsPage() {
  const params = useParams<{ companySlug: string; projectKey: string }>();
  const router = useRouter();

  const { data: company } = trpc.company.getBySlug.useQuery({
    slug: params.companySlug,
  });

  const {
    data: project,
    isLoading,
    refetch: refetchProject,
  } = trpc.project.getByKey.useQuery(
    { companyId: company?.id ?? '', key: params.projectKey },
    { enabled: !!company?.id },
  );

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [settingsJson, setSettingsJson] = useState('');
  const [jsonError, setJsonError] = useState('');
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    if (project) {
      setName(project.name);
      setDescription(project.description ?? '');
      setSettingsJson(
        JSON.stringify(project.settings_json ?? {}, null, 2),
      );
    }
  }, [project]);

  const updateMutation = trpc.project.update.useMutation({
    onSuccess: () => {
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
      refetchProject();
    },
  });

  const archiveMutation = trpc.project.delete.useMutation({
    onSuccess: () => {
      router.push(`/${params.companySlug}/dashboard`);
    },
  });

  const isOwnerOrAdmin =
    company?.currentUserRole === 'OWNER' || company?.currentUserRole === 'ADMIN';

  const handleSave = () => {
    if (!company || !project) return;

    // Validate JSON if modified
    let parsedSettings: Record<string, unknown> | undefined;
    if (settingsJson !== JSON.stringify(project.settings_json ?? {}, null, 2)) {
      try {
        parsedSettings = JSON.parse(settingsJson);
        setJsonError('');
      } catch {
        setJsonError('Invalid JSON');
        return;
      }
    }

    updateMutation.mutate({
      companyId: company.id,
      projectId: project.id,
      data: {
        name: name !== project.name ? name : undefined,
        description: description !== (project.description ?? '') ? description : undefined,
        settings_json: parsedSettings,
      },
    });
  };

  const isArchived = (project?.settings_json as any)?.archived === true;

  if (isLoading) {
    return (
      <SettingsShell title="Project Settings">
        <div className="space-y-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      </SettingsShell>
    );
  }

  if (!project) {
    return (
      <SettingsShell title="Project Settings">
        <div className="flex flex-col items-center justify-center py-16">
          <FolderOpen className="mb-3 h-10 w-10 text-neutral-600" />
          <p className="text-sm text-neutral-500">Project not found</p>
        </div>
      </SettingsShell>
    );
  }

  return (
    <SettingsShell
      title="Project Settings"
      description={`Manage settings for ${project.name}`}
    >
      {isArchived && (
        <div className="rounded-lg border border-amber-900/50 bg-amber-950/20 px-4 py-3">
          <p className="text-sm font-medium text-amber-400">
            This project is archived. It is read-only.
          </p>
        </div>
      )}

      {/* General Info */}
      <SettingsSection title="General" description="Project name and identifier">
        <SettingsCard>
          <div className="space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-neutral-300">
                Project Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={!isOwnerOrAdmin || isArchived}
                className="h-9 w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 text-sm text-white placeholder-neutral-500 focus:border-neutral-500 focus:outline-none disabled:opacity-50"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-neutral-300">
                Project Key
              </label>
              <input
                type="text"
                value={project.key}
                disabled
                className="h-9 w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 text-sm text-neutral-500 focus:outline-none disabled:opacity-50"
              />
              <p className="mt-1 text-xs text-neutral-600">
                Project key cannot be changed after creation. Used in issue IDs (e.g.,{' '}
                {project.key}-123).
              </p>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-neutral-300">
                Description
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                disabled={!isOwnerOrAdmin || isArchived}
                placeholder="Brief description of this project..."
                className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-white placeholder-neutral-500 focus:border-neutral-500 focus:outline-none disabled:opacity-50"
              />
            </div>
          </div>
        </SettingsCard>
      </SettingsSection>

      <Separator />

      {/* Project Settings JSON */}
      <SettingsSection
        title="Advanced Settings"
        description="Project-specific configuration (JSON)"
      >
        <SettingsCard>
          <div>
            <textarea
              value={settingsJson}
              onChange={(e) => {
                setSettingsJson(e.target.value);
                setJsonError('');
              }}
              rows={8}
              disabled={!isOwnerOrAdmin || isArchived}
              className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 font-mono text-sm text-white placeholder-neutral-500 focus:border-neutral-500 focus:outline-none disabled:opacity-50"
            />
            {jsonError && (
              <p className="mt-1 text-sm text-red-400">{jsonError}</p>
            )}
            <p className="mt-1 text-xs text-neutral-600">
              Edit project settings as JSON. Be careful — invalid values may cause
              unexpected behavior.
            </p>
          </div>
        </SettingsCard>
      </SettingsSection>

      {/* Save Button */}
      {isOwnerOrAdmin && !isArchived && (
        <>
          <div className="flex items-center gap-3">
            <Button
              size="sm"
              onClick={handleSave}
              disabled={updateMutation.isPending}
            >
              {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
            </Button>
            {saveSuccess && (
              <span className="text-sm text-green-400">Saved successfully</span>
            )}
            {updateMutation.isError && (
              <span className="text-sm text-red-400">
                {updateMutation.error.message}
              </span>
            )}
          </div>

          <Separator />

          {/* Project Stats */}
          <SettingsSection title="Statistics">
            <SettingsCard>
              <div className="flex items-center gap-6 text-sm">
                <div>
                  <span className="text-2xl font-bold text-white">
                    {project._count?.issues ?? 0}
                  </span>
                  <p className="text-xs text-neutral-500">Total Issues</p>
                </div>
                <div>
                  <span className="text-2xl font-bold text-white">
                    {project.key}
                  </span>
                  <p className="text-xs text-neutral-500">Project Key</p>
                </div>
                <div>
                  <span className="text-sm text-neutral-300">
                    Created{' '}
                    {new Date(project.created_at).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </span>
                  <p className="text-xs text-neutral-500">Creation Date</p>
                </div>
              </div>
            </SettingsCard>
          </SettingsSection>

          <Separator />

          {/* Danger Zone */}
          <DangerZone>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-neutral-300">
                  Archive Project
                </p>
                <p className="text-xs text-neutral-500">
                  Archiving hides the project from navigation and makes it read-only.
                  Issues are preserved.
                </p>
              </div>
              <ConfirmDialog
                trigger={
                  <Button variant="destructive" size="sm">
                    Archive Project
                  </Button>
                }
                title="Archive Project"
                description={`Are you sure you want to archive "${project.name}"? The project will become read-only and hidden from navigation. Existing issues will be preserved.`}
                confirmText="Archive"
                onConfirm={() => {
                  if (!company) return;
                  archiveMutation.mutate({
                    companyId: company.id,
                    projectId: project.id,
                  });
                }}
                isLoading={archiveMutation.isPending}
              />
            </div>
          </DangerZone>
        </>
      )}
    </SettingsShell>
  );
}
