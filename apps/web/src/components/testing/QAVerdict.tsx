'use client';

import { useState } from 'react';
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Loader2,
  RotateCcw,
  PlayCircle,
  FileText,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { trpc } from '@/lib/trpc';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface QAVerdictProps {
  issueId: string;
  companyId: string;
  /** Called after verdict is submitted */
  onVerdictSubmitted?: (verdict: 'PASS' | 'FAIL') => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function QAVerdict({ issueId, companyId, onVerdictSubmitted }: QAVerdictProps) {
  const [verdict, setVerdict] = useState<'PASS' | 'FAIL' | null>(null);
  const [notes, setNotes] = useState('');
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch QA context
  const qaContext = trpc.testingWorkflow.getQAContext.useQuery(
    { companyId, issueId },
    { enabled: !!issueId },
  );

  const reopenCount = qaContext.data?.reopenCount ?? 0;

  const submitVerdict = trpc.testingWorkflow.submitQAVerdict.useMutation({
    onSuccess: () => {
      onVerdictSubmitted?.(verdict!);
    },
    onError: (err) => {
      setError(err.message);
      setShowConfirm(false);
    },
  });

  const handleSubmit = () => {
    if (!verdict) return;

    // FAIL requires notes
    if (verdict === 'FAIL' && notes.trim().length === 0) {
      setError('Please explain what still does not work before reopening.');
      return;
    }

    setError(null);
    submitVerdict.mutate({
      companyId,
      issueId,
      verdict,
      notes: notes.trim() || `QA ${verdict === 'PASS' ? 'approved' : 'rejected'} — ${new Date().toISOString()}`,
    });
  };

  // Loading state
  if (qaContext.isLoading) {
    return (
      <div className="flex items-center justify-center p-8 text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        Loading QA context...
      </div>
    );
  }

  if (qaContext.error) {
    return (
      <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
        Failed to load QA context: {qaContext.error.message}
      </div>
    );
  }

  const data = qaContext.data;
  if (!data) return null;

  const devRecordings = data.recordings.filter(
    (r: any) => r.type === 'DEV_TEST' || r.type === 'BUG',
  );

  return (
    <div className="space-y-6">
      {/* Bug Report Summary */}
      <div className="rounded-lg border bg-card p-4">
        <h3 className="mb-2 text-sm font-semibold text-muted-foreground">Bug Report</h3>
        <h2 className="text-lg font-bold">
          {data.issue.key}: {data.issue.title}
        </h2>
        {data.issue.description && (
          <p className="mt-2 text-sm text-muted-foreground whitespace-pre-wrap">
            {data.issue.description}
          </p>
        )}
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          <span className="rounded bg-muted px-2 py-0.5">Priority: {data.issue.priority}</span>
          <span className="rounded bg-muted px-2 py-0.5">Status: {data.issue.status}</span>
          {data.assignee && (
            <span className="rounded bg-muted px-2 py-0.5">
              Assignee: {data.assignee.name} ({data.assignee.type})
            </span>
          )}
        </div>
      </div>

      {/* Dev Test Recordings */}
      {devRecordings.length > 0 && (
        <div className="rounded-lg border bg-card p-4">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-muted-foreground">
            <PlayCircle className="h-4 w-4" />
            Dev Test Recordings ({devRecordings.length})
          </h3>
          <div className="space-y-2">
            {devRecordings.map((rec: any) => (
              <a
                key={rec.id}
                href={`/recordings/${rec.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-accent transition-colors"
              >
                <PlayCircle className="h-4 w-4 text-blue-500" />
                <span className="font-medium">{rec.type}</span>
                <span className="text-muted-foreground">
                  {new Date(rec.created_at).toLocaleString()}
                </span>
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Reopen Count Warning */}
      {reopenCount > 0 && (
        <div className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300">
          <RotateCcw className="h-4 w-4 flex-shrink-0" />
          <span>
            Reopened <strong>{reopenCount}</strong> time{reopenCount !== 1 ? 's' : ''} previously
          </span>
        </div>
      )}

      {/* Verdict Buttons */}
      {data.issue.status === 'QA_TESTING' && !showConfirm && (
        <div className="space-y-4">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <FileText className="h-4 w-4" />
            QA Verdict
          </h3>

          {/* Notes textarea */}
          <div>
            <label className="mb-1 block text-sm font-medium text-muted-foreground">
              Notes {verdict === 'FAIL' && <span className="text-red-500">*</span>}
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={
                verdict === 'FAIL'
                  ? 'Describe what still does not work...'
                  : 'Optional notes about the verification...'
              }
              className="w-full rounded-md border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring min-h-[80px] resize-y"
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400">
              <AlertTriangle className="h-4 w-4" />
              {error}
            </div>
          )}

          <div className="flex gap-3">
            <Button
              variant="default"
              className="flex-1 bg-green-600 hover:bg-green-700 text-white"
              onClick={() => {
                setVerdict('PASS');
                setShowConfirm(true);
              }}
            >
              <CheckCircle2 className="mr-2 h-4 w-4" />
              Pass — Close Issue
            </Button>
            <Button
              variant="destructive"
              className="flex-1"
              onClick={() => {
                setVerdict('FAIL');
                if (notes.trim().length === 0) {
                  setError('Please explain what still does not work before reopening.');
                  return;
                }
                setShowConfirm(true);
              }}
            >
              <XCircle className="mr-2 h-4 w-4" />
              Fail — Reopen
            </Button>
          </div>
        </div>
      )}

      {/* Confirmation Dialog */}
      {showConfirm && verdict && (
        <div className="rounded-lg border-2 border-dashed p-4 space-y-4">
          <p className="text-sm font-medium">
            {verdict === 'PASS'
              ? 'Are you sure you want to close this issue? This marks the fix as verified.'
              : 'Are you sure you want to reopen this issue? It will be returned to the developer.'}
          </p>
          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={() => {
                setShowConfirm(false);
                setError(null);
              }}
              disabled={submitVerdict.isPending}
            >
              Cancel
            </Button>
            <Button
              variant={verdict === 'PASS' ? 'default' : 'destructive'}
              className={verdict === 'PASS' ? 'bg-green-600 hover:bg-green-700 text-white' : ''}
              onClick={handleSubmit}
              disabled={submitVerdict.isPending}
            >
              {submitVerdict.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Submitting...
                </>
              ) : verdict === 'PASS' ? (
                'Confirm Close'
              ) : (
                'Confirm Reopen'
              )}
            </Button>
          </div>
        </div>
      )}

      {/* Already closed/reopened */}
      {data.issue.status !== 'QA_TESTING' && (
        <div className="rounded-md border bg-muted/50 p-4 text-center text-sm text-muted-foreground">
          This issue is currently <strong>{data.issue.status}</strong>. QA verdict can only be
          submitted when the issue is in QA_TESTING.
        </div>
      )}
    </div>
  );
}
