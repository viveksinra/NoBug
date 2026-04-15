'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import {
  Camera,
  Copy,
  Check,
  ArrowUpRight,
  Trash2,
  Eye,
  Clock,
  Lock,
  Share2,
  ExternalLink,
  Loader2,
  Image as ImageIcon,
  Filter,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { trpc } from '@/lib/trpc';
import { ShareDialog } from '@/components/share/ShareDialog';
import { PromoteToIssue } from '@/components/share/PromoteToIssue';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(date: Date | string): string {
  return new Date(date).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatRelative(date: Date | string): string {
  const now = Date.now();
  const d = new Date(date).getTime();
  const diff = now - d;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 30) return `${days}d ago`;
  return formatDate(date);
}

type CaptureFilter = 'all' | 'active' | 'expired';

// ---------------------------------------------------------------------------
// Page Component
// ---------------------------------------------------------------------------

export default function CapturesListPage() {
  const params = useParams<{ companySlug: string }>();
  const [filter, setFilter] = useState<CaptureFilter>('all');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [shareDialogCaptureId, setShareDialogCaptureId] = useState<string | null>(null);
  const [promoteDialogCaptureId, setPromoteDialogCaptureId] = useState<string | null>(null);
  const [promoteCaptureTitle, setPromoteCaptureTitle] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const utils = trpc.useUtils();

  // Fetch company to get the ID
  const { data: companyData } = trpc.company.getBySlug.useQuery({
    slug: params.companySlug,
  });
  const companyId = companyData?.id;

  // Fetch captures
  const {
    data: capturesData,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = trpc.share.listCaptures.useInfiniteQuery(
    { filter, limit: 20 },
    {
      getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
      enabled: true,
    },
  );

  // Share info for dialog
  const { data: shareInfo } = trpc.share.getShareInfo.useQuery(
    { captureId: shareDialogCaptureId! },
    { enabled: !!shareDialogCaptureId },
  );

  // Delete mutation
  const deleteMut = trpc.share.deleteCapture.useMutation({
    onSuccess: () => {
      utils.share.listCaptures.invalidate();
      setDeleteConfirmId(null);
    },
  });

  const allCaptures = capturesData?.pages.flatMap((p) => p.captures) ?? [];

  const copyLink = async (url: string, id: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      // fallback
    }
  };

  const handleDelete = (id: string) => {
    deleteMut.mutate({ captureId: id });
  };

  const FILTERS: { key: CaptureFilter; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'active', label: 'Active' },
    { key: 'expired', label: 'Expired' },
  ];

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-500/10">
            <Camera className="h-5 w-5 text-indigo-400" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-white">Quick Captures</h1>
            <p className="text-xs text-neutral-500">
              Manage your bug captures and shareable links
            </p>
          </div>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex items-center gap-2">
        <Filter className="h-3.5 w-3.5 text-neutral-500" />
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              filter === f.key
                ? 'bg-neutral-800 text-white'
                : 'text-neutral-400 hover:text-neutral-300'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Captures list */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-neutral-500" />
        </div>
      ) : allCaptures.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-neutral-800 bg-neutral-900/50 py-16">
          <Camera className="h-10 w-10 text-neutral-700" />
          <p className="text-sm text-neutral-500">
            {filter === 'expired'
              ? 'No expired captures'
              : filter === 'active'
                ? 'No active captures'
                : 'No captures yet'}
          </p>
          <p className="text-xs text-neutral-600">
            Use the browser extension to create Quick Captures
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {allCaptures.map((capture) => (
            <div
              key={capture.id}
              className={`group rounded-lg border bg-neutral-900/50 p-4 transition-colors hover:bg-neutral-900 ${
                capture.isExpired
                  ? 'border-neutral-800/50 opacity-60'
                  : 'border-neutral-800'
              }`}
            >
              <div className="flex items-start gap-4">
                {/* Thumbnail */}
                <div className="hidden h-16 w-24 shrink-0 overflow-hidden rounded-md border border-neutral-800 bg-neutral-950 sm:block">
                  {capture.screenshotUrl ? (
                    <img
                      src={capture.screenshotUrl}
                      alt=""
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center">
                      <ImageIcon className="h-5 w-5 text-neutral-700" />
                    </div>
                  )}
                </div>

                {/* Content */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="truncate text-sm font-medium text-white">
                        {capture.title || 'Untitled Capture'}
                      </h3>
                      <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-neutral-500">
                        <span>{formatRelative(capture.createdAt)}</span>
                        <span className="flex items-center gap-1">
                          <Eye className="h-3 w-3" />
                          {capture.viewCount}
                        </span>
                        {capture.expiresAt && (
                          <span
                            className={`flex items-center gap-1 ${
                              capture.isExpired ? 'text-red-400' : ''
                            }`}
                          >
                            <Clock className="h-3 w-3" />
                            {capture.isExpired
                              ? 'Expired'
                              : `Expires ${formatDate(capture.expiresAt)}`}
                          </span>
                        )}
                        {capture.passwordProtected && (
                          <span className="flex items-center gap-1 text-amber-400">
                            <Lock className="h-3 w-3" />
                            Protected
                          </span>
                        )}
                        {capture.convertedToIssueId && (
                          <span className="flex items-center gap-1 text-green-400">
                            <ArrowUpRight className="h-3 w-3" />
                            Promoted
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                      <button
                        onClick={() => copyLink(capture.shareUrl, capture.id)}
                        className="rounded-md p-1.5 text-neutral-400 hover:bg-neutral-800 hover:text-white"
                        title="Copy link"
                      >
                        {copiedId === capture.id ? (
                          <Check className="h-3.5 w-3.5 text-green-400" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
                      </button>
                      <button
                        onClick={() => setShareDialogCaptureId(capture.id)}
                        className="rounded-md p-1.5 text-neutral-400 hover:bg-neutral-800 hover:text-white"
                        title="Share settings"
                      >
                        <Share2 className="h-3.5 w-3.5" />
                      </button>
                      <a
                        href={capture.shareUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-md p-1.5 text-neutral-400 hover:bg-neutral-800 hover:text-white"
                        title="Open in new tab"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                      {!capture.convertedToIssueId && companyId && (
                        <button
                          onClick={() => {
                            setPromoteDialogCaptureId(capture.id);
                            setPromoteCaptureTitle(capture.title);
                          }}
                          className="rounded-md p-1.5 text-neutral-400 hover:bg-neutral-800 hover:text-indigo-400"
                          title="Promote to issue"
                        >
                          <ArrowUpRight className="h-3.5 w-3.5" />
                        </button>
                      )}
                      {deleteConfirmId === capture.id ? (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handleDelete(capture.id)}
                            className="rounded-md bg-red-500/10 px-2 py-1 text-xs text-red-400 hover:bg-red-500/20"
                            disabled={deleteMut.isPending}
                          >
                            {deleteMut.isPending ? '...' : 'Delete'}
                          </button>
                          <button
                            onClick={() => setDeleteConfirmId(null)}
                            className="rounded-md px-2 py-1 text-xs text-neutral-400 hover:text-white"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setDeleteConfirmId(capture.id)}
                          className="rounded-md p-1.5 text-neutral-400 hover:bg-neutral-800 hover:text-red-400"
                          title="Delete"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}

          {/* Load more */}
          {hasNextPage && (
            <div className="flex justify-center pt-4">
              <Button
                variant="outline"
                onClick={() => fetchNextPage()}
                disabled={isFetchingNextPage}
                className="border-neutral-700 bg-neutral-800 text-neutral-300 hover:bg-neutral-700"
              >
                {isFetchingNextPage ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : null}
                Load More
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Share Dialog */}
      {shareDialogCaptureId && shareInfo && (
        <ShareDialog
          captureId={shareInfo.id}
          shareUrl={shareInfo.shareUrl}
          embedCode={shareInfo.embedCode}
          passwordProtected={shareInfo.passwordProtected}
          expiresAt={shareInfo.expiresAt}
          viewCount={shareInfo.viewCount}
          onClose={() => setShareDialogCaptureId(null)}
        />
      )}

      {/* Promote to Issue Dialog */}
      {promoteDialogCaptureId && companyId && (
        <PromoteToIssue
          captureId={promoteDialogCaptureId}
          captureTitle={promoteCaptureTitle}
          companyId={companyId}
          companySlug={params.companySlug}
          onClose={() => setPromoteDialogCaptureId(null)}
          onPromoted={() => {
            utils.share.listCaptures.invalidate();
            setPromoteDialogCaptureId(null);
          }}
        />
      )}
    </div>
  );
}
