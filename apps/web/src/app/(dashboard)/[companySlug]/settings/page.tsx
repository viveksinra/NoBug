'use client';

import { useParams, useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import { Building2, Crown, Shield, Code2, Eye, TestTube } from 'lucide-react';
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

const PLAN_COLORS: Record<string, string> = {
  FREE: 'bg-neutral-800 text-neutral-300',
  PRO: 'bg-blue-900/50 text-blue-400',
  BUSINESS: 'bg-purple-900/50 text-purple-400',
  ENTERPRISE: 'bg-amber-900/50 text-amber-400',
};

export default function CompanySettingsPage() {
  const params = useParams<{ companySlug: string }>();
  const router = useRouter();

  const { data: company, isLoading } = trpc.company.getBySlug.useQuery({
    slug: params.companySlug,
  });

  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    if (company) {
      setName(company.name);
      setSlug(company.slug);
    }
  }, [company]);

  const updateMutation = trpc.company.update.useMutation({
    onSuccess: (updated) => {
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
      if (updated.slug !== params.companySlug) {
        router.push(`/${updated.slug}/settings`);
      }
    },
  });

  const isOwnerOrAdmin =
    company?.currentUserRole === 'OWNER' || company?.currentUserRole === 'ADMIN';

  const handleSave = () => {
    if (!company) return;
    updateMutation.mutate({
      companyId: company.id,
      data: { name, slug },
    });
  };

  const plan = (company as any)?.plan ?? 'FREE';

  if (isLoading) {
    return (
      <SettingsShell title="Company Settings">
        <div className="space-y-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      </SettingsShell>
    );
  }

  return (
    <SettingsShell
      title="Company Settings"
      description="Manage your company profile and plan"
    >
      {/* General Info */}
      <SettingsSection title="General" description="Company name and URL slug">
        <SettingsCard>
          <div className="space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-neutral-300">
                Company Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={!isOwnerOrAdmin}
                className="h-9 w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 text-sm text-white placeholder-neutral-500 focus:border-neutral-500 focus:outline-none disabled:opacity-50"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-neutral-300">
                URL Slug
              </label>
              <div className="flex items-center gap-2">
                <span className="text-sm text-neutral-500">bugdetector.com/</span>
                <input
                  type="text"
                  value={slug}
                  onChange={(e) =>
                    setSlug(
                      e.target.value
                        .toLowerCase()
                        .replace(/[^a-z0-9-]/g, '')
                    )
                  }
                  disabled={!isOwnerOrAdmin}
                  className="h-9 flex-1 rounded-md border border-neutral-700 bg-neutral-900 px-3 text-sm text-white placeholder-neutral-500 focus:border-neutral-500 focus:outline-none disabled:opacity-50"
                />
              </div>
            </div>
            {isOwnerOrAdmin && (
              <div className="flex items-center gap-3">
                <Button
                  size="sm"
                  onClick={handleSave}
                  disabled={
                    updateMutation.isPending ||
                    (name === company?.name && slug === company?.slug)
                  }
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
            )}
          </div>
        </SettingsCard>
      </SettingsSection>

      <Separator />

      {/* Logo Upload Placeholder */}
      <SettingsSection title="Logo" description="Upload your company logo">
        <SettingsCard>
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-lg border border-dashed border-neutral-700 bg-neutral-800">
              <Building2 className="h-8 w-8 text-neutral-500" />
            </div>
            <div>
              <Button variant="outline" size="sm" disabled>
                Upload Logo
              </Button>
              <p className="mt-1 text-xs text-neutral-500">
                PNG, JPG up to 2MB. Logo upload coming soon.
              </p>
            </div>
          </div>
        </SettingsCard>
      </SettingsSection>

      <Separator />

      {/* Plan Display */}
      <SettingsSection title="Plan" description="Your current subscription plan">
        <SettingsCard>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span
                className={`rounded-full px-3 py-1 text-sm font-medium ${
                  PLAN_COLORS[plan] ?? PLAN_COLORS.FREE
                }`}
              >
                {plan}
              </span>
              <div>
                <p className="text-sm text-neutral-300">
                  {plan === 'FREE' && 'Free plan — up to 3 projects, 5 team members'}
                  {plan === 'PRO' && 'Pro plan — unlimited projects, 25 team members'}
                  {plan === 'BUSINESS' &&
                    'Business plan — unlimited everything, priority support'}
                  {plan === 'ENTERPRISE' &&
                    'Enterprise plan — custom limits, SLA, dedicated support'}
                </p>
              </div>
            </div>
            {plan === 'FREE' && (
              <Button size="sm" variant="outline" disabled>
                Upgrade
              </Button>
            )}
          </div>
        </SettingsCard>
      </SettingsSection>

      <Separator />

      {/* Members Summary */}
      <SettingsSection title="Team" description="Quick overview of your team">
        <SettingsCard>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm text-neutral-400">
              <span className="font-medium text-white">
                {company?._count?.members ?? 0}
              </span>{' '}
              members
              <span className="mx-2 text-neutral-700">|</span>
              <span className="font-medium text-white">
                {company?._count?.projects ?? 0}
              </span>{' '}
              projects
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => router.push(`/${params.companySlug}/settings/members`)}
            >
              Manage Members
            </Button>
          </div>
        </SettingsCard>
      </SettingsSection>

      <Separator />

      {/* Danger Zone */}
      {company?.currentUserRole === 'OWNER' && (
        <DangerZone>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-neutral-300">Delete Company</p>
              <p className="text-xs text-neutral-500">
                Permanently delete this company and all its data. This action cannot be
                undone.
              </p>
            </div>
            <ConfirmDialog
              trigger={
                <Button variant="destructive" size="sm">
                  Delete Company
                </Button>
              }
              title="Delete Company"
              description={`Are you sure you want to delete "${company?.name}"? This will permanently remove all projects, issues, recordings, and team data. This action cannot be undone.`}
              confirmText="Delete Forever"
              onConfirm={() => {
                // Delete mutation would go here — not yet implemented in the tRPC router
              }}
            />
          </div>
        </DangerZone>
      )}
    </SettingsShell>
  );
}
