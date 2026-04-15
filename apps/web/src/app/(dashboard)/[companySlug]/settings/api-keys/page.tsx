'use client';

import { useParams } from 'next/navigation';
import { useState } from 'react';
import { Key, Plus, Copy, Check, X, Clock } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import {
  SettingsShell,
  SettingsSection,
  SettingsCard,
} from '@/components/settings/settings-shell';
import { ConfirmDialog } from '@/components/settings/confirm-dialog';

function formatDate(date: string | Date | null): string {
  if (!date) return 'Never';
  return new Date(date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      onClick={handleCopy}
      className="inline-flex items-center gap-1 rounded-md border border-neutral-700 bg-neutral-800 px-2 py-1 text-xs text-neutral-300 hover:bg-neutral-700"
    >
      {copied ? (
        <>
          <Check className="h-3 w-3 text-green-400" />
          Copied
        </>
      ) : (
        <>
          <Copy className="h-3 w-3" />
          Copy
        </>
      )}
    </button>
  );
}

export default function ApiKeysSettingsPage() {
  const params = useParams<{ companySlug: string }>();
  const [generateOpen, setGenerateOpen] = useState(false);
  const [keyName, setKeyName] = useState('');
  const [newKeyValue, setNewKeyValue] = useState<string | null>(null);

  const { data: company } = trpc.company.getBySlug.useQuery({
    slug: params.companySlug,
  });

  const {
    data: apiKeys,
    isLoading,
    refetch: refetchKeys,
  } = trpc.apiKey.list.useQuery(
    { companyId: company?.id ?? '' },
    { enabled: !!company?.id },
  );

  const generateMutation = trpc.apiKey.generate.useMutation({
    onSuccess: (data) => {
      setNewKeyValue(data.key);
      setKeyName('');
      refetchKeys();
    },
  });

  const revokeMutation = trpc.apiKey.revoke.useMutation({
    onSuccess: () => {
      refetchKeys();
    },
  });

  const isOwnerOrAdmin =
    company?.currentUserRole === 'OWNER' || company?.currentUserRole === 'ADMIN';

  return (
    <SettingsShell
      title="API Keys"
      description="Manage API keys for programmatic access and MCP integration"
    >
      {/* Generate Button */}
      {isOwnerOrAdmin && (
        <div className="flex justify-end">
          <Button size="sm" onClick={() => setGenerateOpen(true)}>
            <Plus className="mr-1 h-4 w-4" />
            Generate New Key
          </Button>
        </div>
      )}

      {/* Generate Modal */}
      {generateOpen && !newKeyValue && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="w-full max-w-md rounded-lg border border-neutral-800 bg-neutral-900 p-6 shadow-xl">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-white">
                Generate API Key
              </h3>
              <button
                onClick={() => setGenerateOpen(false)}
                className="text-neutral-500 hover:text-neutral-300"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="mt-4 space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-neutral-300">
                  Key Name
                </label>
                <input
                  type="text"
                  value={keyName}
                  onChange={(e) => setKeyName(e.target.value)}
                  placeholder="e.g., Production MCP Server"
                  className="h-9 w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 text-sm text-white placeholder-neutral-500 focus:border-neutral-500 focus:outline-none"
                />
              </div>
              {generateMutation.isError && (
                <p className="text-sm text-red-400">
                  {generateMutation.error.message}
                </p>
              )}
              <div className="flex justify-end gap-3">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setGenerateOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={() => {
                    if (!company) return;
                    generateMutation.mutate({
                      companyId: company.id,
                      name: keyName,
                    });
                  }}
                  disabled={!keyName.trim() || generateMutation.isPending}
                >
                  {generateMutation.isPending
                    ? 'Generating...'
                    : 'Generate Key'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* New Key Display Modal */}
      {newKeyValue && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="w-full max-w-lg rounded-lg border border-neutral-800 bg-neutral-900 p-6 shadow-xl">
            <div className="flex items-center gap-2">
              <Key className="h-5 w-5 text-green-400" />
              <h3 className="text-lg font-semibold text-white">
                API Key Generated
              </h3>
            </div>
            <div className="mt-4 space-y-4">
              <div className="rounded-lg border border-amber-900/50 bg-amber-950/20 px-4 py-3">
                <p className="text-sm text-amber-400">
                  Copy this key now. You will not be able to see it again.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <code className="flex-1 overflow-x-auto rounded-md border border-neutral-700 bg-neutral-800 px-3 py-2 font-mono text-sm text-green-400">
                  {newKeyValue}
                </code>
                <CopyButton text={newKeyValue} />
              </div>
              <div className="flex justify-end">
                <Button
                  size="sm"
                  onClick={() => {
                    setNewKeyValue(null);
                    setGenerateOpen(false);
                  }}
                >
                  Done
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* API Keys List */}
      <SettingsSection title="Active Keys">
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-16 w-full rounded-lg" />
            ))}
          </div>
        ) : (apiKeys?.length ?? 0) === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-neutral-700 py-12">
            <Key className="mb-3 h-10 w-10 text-neutral-600" />
            <p className="text-sm text-neutral-500">No API keys yet</p>
            <p className="mt-1 text-xs text-neutral-600">
              Generate a key to use with the MCP server or REST API
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {apiKeys?.map((key) => (
              <div
                key={key.id}
                className="flex items-center justify-between rounded-lg border border-neutral-800 bg-neutral-900/50 px-4 py-3"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-neutral-800">
                    <Key className="h-4 w-4 text-neutral-400" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-white">{key.name}</p>
                    <div className="flex items-center gap-3 text-xs text-neutral-500">
                      <code className="rounded bg-neutral-800 px-1.5 py-0.5 font-mono text-neutral-400">
                        nb_key_****...
                      </code>
                      <span>Created {formatDate(key.created_at)}</span>
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        Last used: {formatDate(key.last_used_at)}
                      </span>
                    </div>
                  </div>
                </div>
                {isOwnerOrAdmin && (
                  <ConfirmDialog
                    trigger={
                      <Button variant="ghost" size="sm" className="text-red-400 hover:text-red-300">
                        Revoke
                      </Button>
                    }
                    title="Revoke API Key"
                    description={`Revoke the API key "${key.name}"? Any services using this key will immediately lose access. This action cannot be undone.`}
                    confirmText="Revoke Key"
                    onConfirm={() => {
                      if (!company) return;
                      revokeMutation.mutate({
                        companyId: company.id,
                        keyId: key.id,
                      });
                    }}
                    isLoading={revokeMutation.isPending}
                  />
                )}
              </div>
            ))}
          </div>
        )}
      </SettingsSection>

      <Separator />

      {/* Usage Info */}
      <SettingsSection title="Usage">
        <SettingsCard>
          <div className="space-y-3 text-sm text-neutral-400">
            <p>
              API keys are used for programmatic access to the BugDetector API and MCP
              server integration.
            </p>
            <div className="space-y-2">
              <p className="font-medium text-neutral-300">MCP Server Configuration</p>
              <code className="block overflow-x-auto rounded-md border border-neutral-700 bg-neutral-800 px-3 py-2 font-mono text-xs text-neutral-300">
                {'{'}&quot;mcpServers&quot;: {'{'}&quot;bugdetector&quot;: {'{'}
                &quot;command&quot;: &quot;npx&quot;, &quot;args&quot;: [&quot;@nobug/mcp-server&quot;],
                &quot;env&quot;: {'{'}&quot;BUGDETECTOR_API_KEY&quot;: &quot;your-api-key&quot;{'}'}{'}'}
                {'}'}
                {'}'}
              </code>
            </div>
            <div className="space-y-2">
              <p className="font-medium text-neutral-300">REST API</p>
              <code className="block overflow-x-auto rounded-md border border-neutral-700 bg-neutral-800 px-3 py-2 font-mono text-xs text-neutral-300">
                curl -H &quot;Authorization: Bearer your-api-key&quot; \<br />
                {'  '}https://api.bugdetector.com/api/v1/bugs
              </code>
            </div>
          </div>
        </SettingsCard>
      </SettingsSection>
    </SettingsShell>
  );
}
