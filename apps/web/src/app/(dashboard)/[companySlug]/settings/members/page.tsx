'use client';

import { useParams } from 'next/navigation';
import { useState } from 'react';
import {
  Users,
  Mail,
  Plus,
  X,
  Clock,
  RefreshCw,
  Shield,
  Crown,
  Code2,
  TestTube,
  Eye,
} from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  SettingsShell,
  SettingsSection,
  SettingsCard,
} from '@/components/settings/settings-shell';
import { ConfirmDialog } from '@/components/settings/confirm-dialog';

const ROLES = ['ADMIN', 'DEVELOPER', 'QA', 'VIEWER'] as const;

const ROLE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  OWNER: Crown,
  ADMIN: Shield,
  DEVELOPER: Code2,
  QA: TestTube,
  VIEWER: Eye,
};

const ROLE_COLORS: Record<string, string> = {
  OWNER: 'text-amber-400',
  ADMIN: 'text-blue-400',
  DEVELOPER: 'text-green-400',
  QA: 'text-purple-400',
  VIEWER: 'text-neutral-400',
};

function formatDate(date: string | Date): string {
  return new Date(date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export default function MembersSettingsPage() {
  const params = useParams<{ companySlug: string }>();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<string>('DEVELOPER');

  const { data: company } = trpc.company.getBySlug.useQuery({
    slug: params.companySlug,
  });

  const {
    data: members,
    isLoading: membersLoading,
    refetch: refetchMembers,
  } = trpc.company.getBySlug.useQuery(
    { slug: params.companySlug },
    { select: (data) => data },
  );

  // We need to fetch full member list — use company.getById which includes members
  // Actually, company.getBySlug only returns current user's membership
  // We'll list invitations and use the members count from company
  const {
    data: invitations,
    isLoading: invitationsLoading,
    refetch: refetchInvitations,
  } = trpc.invitation.list.useQuery(
    { companyId: company?.id ?? '' },
    { enabled: !!company?.id },
  );

  const utils = trpc.useUtils();

  const inviteMutation = trpc.invitation.create.useMutation({
    onSuccess: () => {
      setInviteOpen(false);
      setInviteEmail('');
      setInviteRole('DEVELOPER');
      refetchInvitations();
    },
  });

  const revokeMutation = trpc.invitation.revoke.useMutation({
    onSuccess: () => {
      refetchInvitations();
    },
  });

  const resendMutation = trpc.invitation.resend.useMutation();

  const isOwnerOrAdmin =
    company?.currentUserRole === 'OWNER' || company?.currentUserRole === 'ADMIN';

  const pendingInvitations = invitations?.filter(
    (inv) => !inv.accepted_at && new Date(inv.expires_at) > new Date(),
  );

  const expiredInvitations = invitations?.filter(
    (inv) => !inv.accepted_at && new Date(inv.expires_at) <= new Date(),
  );

  return (
    <SettingsShell
      title="Members"
      description="Manage team members and invitations"
    >
      {/* Invite Button */}
      {isOwnerOrAdmin && (
        <div className="flex justify-end">
          <Button size="sm" onClick={() => setInviteOpen(true)}>
            <Plus className="mr-1 h-4 w-4" />
            Invite Member
          </Button>
        </div>
      )}

      {/* Invite Modal */}
      {inviteOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="w-full max-w-md rounded-lg border border-neutral-800 bg-neutral-900 p-6 shadow-xl">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-white">Invite Member</h3>
              <button
                onClick={() => setInviteOpen(false)}
                className="text-neutral-500 hover:text-neutral-300"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="mt-4 space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-neutral-300">
                  Email Address
                </label>
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="colleague@example.com"
                  className="h-9 w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 text-sm text-white placeholder-neutral-500 focus:border-neutral-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-neutral-300">
                  Role
                </label>
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value)}
                  className="h-9 w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 text-sm text-white focus:border-neutral-500 focus:outline-none"
                >
                  {ROLES.map((role) => (
                    <option key={role} value={role}>
                      {role}
                    </option>
                  ))}
                </select>
              </div>
              {inviteMutation.isError && (
                <p className="text-sm text-red-400">
                  {inviteMutation.error.message}
                </p>
              )}
              <div className="flex justify-end gap-3">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setInviteOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={() => {
                    if (!company) return;
                    inviteMutation.mutate({
                      companyId: company.id,
                      email: inviteEmail,
                      role: inviteRole as any,
                    });
                  }}
                  disabled={
                    !inviteEmail || inviteMutation.isPending
                  }
                >
                  {inviteMutation.isPending ? 'Sending...' : 'Send Invitation'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Team Members Count */}
      <SettingsSection
        title="Current Members"
        description={`${company?._count?.members ?? 0} members in ${company?.name ?? 'this company'}`}
      >
        <SettingsCard>
          {membersLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : (
            <div className="text-sm text-neutral-400">
              <div className="flex items-center gap-3 rounded-md bg-neutral-800/50 px-4 py-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-neutral-700">
                  <Users className="h-4 w-4 text-neutral-400" />
                </div>
                <div className="flex-1">
                  <p className="text-sm text-neutral-300">
                    Your role:{' '}
                    <span className={ROLE_COLORS[company?.currentUserRole ?? ''] ?? ''}>
                      {company?.currentUserRole}
                    </span>
                  </p>
                  <p className="text-xs text-neutral-500">
                    {company?._count?.members ?? 0} total members across all roles
                  </p>
                </div>
              </div>
              <p className="mt-3 text-xs text-neutral-600">
                Full member list with role management requires an admin view expansion.
                Use invitations below to add new members.
              </p>
            </div>
          )}
        </SettingsCard>
      </SettingsSection>

      <Separator />

      {/* Pending Invitations */}
      <SettingsSection
        title="Pending Invitations"
        description="Invitations waiting to be accepted"
      >
        {invitationsLoading ? (
          <div className="space-y-2">
            {[1, 2].map((i) => (
              <Skeleton key={i} className="h-14 w-full rounded-lg" />
            ))}
          </div>
        ) : (pendingInvitations?.length ?? 0) === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-neutral-700 py-8">
            <Mail className="mb-2 h-8 w-8 text-neutral-600" />
            <p className="text-sm text-neutral-500">No pending invitations</p>
          </div>
        ) : (
          <div className="space-y-2">
            {pendingInvitations?.map((invitation) => (
              <div
                key={invitation.id}
                className="flex items-center justify-between rounded-lg border border-neutral-800 bg-neutral-900/50 px-4 py-3"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-neutral-800">
                    <Mail className="h-4 w-4 text-neutral-400" />
                  </div>
                  <div>
                    <p className="text-sm text-white">{invitation.email}</p>
                    <div className="flex items-center gap-2 text-xs text-neutral-500">
                      <span className={ROLE_COLORS[invitation.role] ?? ''}>
                        {invitation.role}
                      </span>
                      <span>
                        Invited by {invitation.inviter?.name ?? invitation.inviter?.email ?? 'unknown'}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        Expires {formatDate(invitation.expires_at)}
                      </span>
                    </div>
                  </div>
                </div>
                {isOwnerOrAdmin && (
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        if (!company) return;
                        resendMutation.mutate({
                          companyId: company.id,
                          invitationId: invitation.id,
                        });
                      }}
                      disabled={resendMutation.isPending}
                      title="Resend invitation"
                    >
                      <RefreshCw className="h-4 w-4" />
                    </Button>
                    <ConfirmDialog
                      trigger={
                        <Button variant="ghost" size="sm" title="Revoke invitation">
                          <X className="h-4 w-4 text-red-400" />
                        </Button>
                      }
                      title="Revoke Invitation"
                      description={`Revoke the invitation sent to ${invitation.email}? They will no longer be able to join using this invitation.`}
                      confirmText="Revoke"
                      onConfirm={() => {
                        if (!company) return;
                        revokeMutation.mutate({
                          companyId: company.id,
                          invitationId: invitation.id,
                        });
                      }}
                      isLoading={revokeMutation.isPending}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </SettingsSection>

      {/* Expired Invitations */}
      {(expiredInvitations?.length ?? 0) > 0 && (
        <>
          <Separator />
          <SettingsSection
            title="Expired Invitations"
            description="These invitations have expired and can be resent"
          >
            <div className="space-y-2">
              {expiredInvitations?.map((invitation) => (
                <div
                  key={invitation.id}
                  className="flex items-center justify-between rounded-lg border border-neutral-800/50 bg-neutral-900/30 px-4 py-3 opacity-70"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-neutral-800">
                      <Mail className="h-4 w-4 text-neutral-500" />
                    </div>
                    <div>
                      <p className="text-sm text-neutral-400">{invitation.email}</p>
                      <div className="flex items-center gap-2 text-xs text-neutral-600">
                        <span>{invitation.role}</span>
                        <span>Expired {formatDate(invitation.expires_at)}</span>
                      </div>
                    </div>
                  </div>
                  {isOwnerOrAdmin && (
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          if (!company) return;
                          resendMutation.mutate({
                            companyId: company.id,
                            invitationId: invitation.id,
                          });
                        }}
                        disabled={resendMutation.isPending}
                      >
                        <RefreshCw className="mr-1 h-3 w-3" />
                        Resend
                      </Button>
                      <ConfirmDialog
                        trigger={
                          <Button variant="ghost" size="sm">
                            <X className="h-4 w-4 text-red-400" />
                          </Button>
                        }
                        title="Remove Invitation"
                        description={`Remove the expired invitation for ${invitation.email}?`}
                        confirmText="Remove"
                        onConfirm={() => {
                          if (!company) return;
                          revokeMutation.mutate({
                            companyId: company.id,
                            invitationId: invitation.id,
                          });
                        }}
                        isLoading={revokeMutation.isPending}
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </SettingsSection>
        </>
      )}
    </SettingsShell>
  );
}
