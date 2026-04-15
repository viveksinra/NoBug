'use client';

import { useState, useCallback } from 'react';
import {
  Copy,
  Check,
  Lock,
  LockOpen,
  Mail,
  MessageSquare,
  Code,
  QrCode,
  Clock,
  Eye,
  ExternalLink,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { trpc } from '@/lib/trpc';

// ---------------------------------------------------------------------------
// QR Code SVG Generator (simple implementation, no external lib)
// ---------------------------------------------------------------------------

function generateQRMatrix(data: string): boolean[][] {
  // Simplified QR-like matrix for display purposes.
  // For production, use a proper QR library. This generates a visual placeholder
  // that encodes data length as a pattern.
  const size = 21; // QR Version 1 is 21x21
  const matrix: boolean[][] = Array.from({ length: size }, () =>
    Array(size).fill(false),
  );

  // Finder patterns (top-left, top-right, bottom-left)
  const drawFinder = (ox: number, oy: number) => {
    for (let y = 0; y < 7; y++) {
      for (let x = 0; x < 7; x++) {
        const isBorder = y === 0 || y === 6 || x === 0 || x === 6;
        const isInner = y >= 2 && y <= 4 && x >= 2 && x <= 4;
        if (isBorder || isInner) {
          if (oy + y < size && ox + x < size) {
            matrix[oy + y][ox + x] = true;
          }
        }
      }
    }
  };

  drawFinder(0, 0);
  drawFinder(size - 7, 0);
  drawFinder(0, size - 7);

  // Fill data area with a hash-based pattern
  let hash = 0;
  for (let i = 0; i < data.length; i++) {
    hash = ((hash << 5) - hash + data.charCodeAt(i)) | 0;
  }

  for (let y = 8; y < size - 8; y++) {
    for (let x = 8; x < size - 8; x++) {
      const seed = (hash ^ (x * 31 + y * 17)) & 0xffff;
      matrix[y][x] = seed % 3 !== 0;
    }
  }

  // Timing patterns
  for (let i = 8; i < size - 8; i++) {
    matrix[6][i] = i % 2 === 0;
    matrix[i][6] = i % 2 === 0;
  }

  return matrix;
}

function QRCodeSVG({ data, size = 160 }: { data: string; size?: number }) {
  const matrix = generateQRMatrix(data);
  const cellSize = size / matrix.length;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className="rounded-lg bg-white p-2"
    >
      {matrix.map((row, y) =>
        row.map((cell, x) =>
          cell ? (
            <rect
              key={`${x}-${y}`}
              x={x * cellSize}
              y={y * cellSize}
              width={cellSize}
              height={cellSize}
              fill="black"
            />
          ) : null,
        ),
      )}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Share Dialog Props
// ---------------------------------------------------------------------------

interface ShareDialogProps {
  captureId: string;
  shareUrl: string;
  embedCode: string;
  passwordProtected: boolean;
  expiresAt: Date | string | null;
  viewCount: number;
  onClose: () => void;
}

export function ShareDialog({
  captureId,
  shareUrl,
  embedCode,
  passwordProtected: initialPasswordProtected,
  expiresAt,
  viewCount,
  onClose,
}: ShareDialogProps) {
  const [copied, setCopied] = useState<string | null>(null);
  const [showQR, setShowQR] = useState(false);
  const [showEmbed, setShowEmbed] = useState(false);
  const [isPasswordProtected, setIsPasswordProtected] = useState(initialPasswordProtected);
  const [newPassword, setNewPassword] = useState('');
  const [showPasswordInput, setShowPasswordInput] = useState(false);

  const utils = trpc.useUtils();

  const setPasswordMut = trpc.share.setPassword.useMutation({
    onSuccess: () => {
      setIsPasswordProtected(true);
      setShowPasswordInput(false);
      setNewPassword('');
    },
  });

  const removePasswordMut = trpc.share.removePassword.useMutation({
    onSuccess: () => {
      setIsPasswordProtected(false);
    },
  });

  const updateExpiryMut = trpc.share.updateExpiry.useMutation({
    onSuccess: () => {
      utils.share.getShareInfo.invalidate({ captureId });
    },
  });

  const copyToClipboard = useCallback(
    async (text: string, label: string) => {
      try {
        await navigator.clipboard.writeText(text);
        setCopied(label);
        setTimeout(() => setCopied(null), 2000);
      } catch {
        // Fallback
        const ta = document.createElement('textarea');
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        setCopied(label);
        setTimeout(() => setCopied(null), 2000);
      }
    },
    [],
  );

  const handleSetPassword = () => {
    if (newPassword.length >= 4) {
      setPasswordMut.mutate({ captureId, password: newPassword });
    }
  };

  const handleRemovePassword = () => {
    removePasswordMut.mutate({ captureId });
  };

  const handleExtendExpiry = (days: number) => {
    const newExpiry = new Date();
    newExpiry.setDate(newExpiry.getDate() + days);
    updateExpiryMut.mutate({
      captureId,
      expiresAt: newExpiry.toISOString(),
    });
  };

  const mailtoUrl = `mailto:?subject=${encodeURIComponent('Bug Capture')}&body=${encodeURIComponent(`Check out this bug capture: ${shareUrl}`)}`;
  const slackUrl = `slack://open?text=${encodeURIComponent(shareUrl)}`;

  const expiryDate = expiresAt ? new Date(expiresAt) : null;
  const isExpired = expiryDate ? expiryDate < new Date() : false;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-lg rounded-xl border border-neutral-800 bg-neutral-900 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-neutral-800 px-5 py-4">
          <h2 className="text-base font-semibold text-white">Share Capture</h2>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-neutral-400 hover:bg-neutral-800 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-5 px-5 py-4">
          {/* Share URL */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-neutral-400">Shareable Link</label>
            <div className="flex gap-2">
              <input
                type="text"
                readOnly
                value={shareUrl}
                className="h-9 flex-1 rounded-md border border-neutral-700 bg-neutral-800 px-3 text-sm text-white focus:outline-none"
              />
              <Button
                size="sm"
                variant="outline"
                onClick={() => copyToClipboard(shareUrl, 'url')}
                className="shrink-0 border-neutral-700 bg-neutral-800 text-neutral-300 hover:bg-neutral-700 hover:text-white"
              >
                {copied === 'url' ? (
                  <Check className="mr-1.5 h-3.5 w-3.5 text-green-400" />
                ) : (
                  <Copy className="mr-1.5 h-3.5 w-3.5" />
                )}
                {copied === 'url' ? 'Copied!' : 'Copy'}
              </Button>
            </div>
          </div>

          {/* Stats row */}
          <div className="flex items-center gap-4 text-xs text-neutral-500">
            <span className="flex items-center gap-1">
              <Eye className="h-3 w-3" />
              {viewCount} views
            </span>
            {expiryDate && (
              <span className={`flex items-center gap-1 ${isExpired ? 'text-red-400' : ''}`}>
                <Clock className="h-3 w-3" />
                {isExpired ? 'Expired' : `Expires ${expiryDate.toLocaleDateString()}`}
              </span>
            )}
            {isPasswordProtected && (
              <span className="flex items-center gap-1 text-amber-400">
                <Lock className="h-3 w-3" />
                Password protected
              </span>
            )}
          </div>

          {/* Action buttons row */}
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowQR(!showQR)}
              className="border-neutral-700 bg-neutral-800 text-neutral-300 hover:bg-neutral-700 hover:text-white"
            >
              <QrCode className="mr-1.5 h-3.5 w-3.5" />
              QR Code
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowEmbed(!showEmbed)}
              className="border-neutral-700 bg-neutral-800 text-neutral-300 hover:bg-neutral-700 hover:text-white"
            >
              <Code className="mr-1.5 h-3.5 w-3.5" />
              Embed
            </Button>
            <a href={mailtoUrl} target="_blank" rel="noopener noreferrer">
              <Button
                size="sm"
                variant="outline"
                className="border-neutral-700 bg-neutral-800 text-neutral-300 hover:bg-neutral-700 hover:text-white"
              >
                <Mail className="mr-1.5 h-3.5 w-3.5" />
                Email
              </Button>
            </a>
            <a href={slackUrl}>
              <Button
                size="sm"
                variant="outline"
                className="border-neutral-700 bg-neutral-800 text-neutral-300 hover:bg-neutral-700 hover:text-white"
              >
                <MessageSquare className="mr-1.5 h-3.5 w-3.5" />
                Slack
              </Button>
            </a>
            <a href={shareUrl} target="_blank" rel="noopener noreferrer">
              <Button
                size="sm"
                variant="outline"
                className="border-neutral-700 bg-neutral-800 text-neutral-300 hover:bg-neutral-700 hover:text-white"
              >
                <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                Open
              </Button>
            </a>
          </div>

          {/* QR Code section */}
          {showQR && (
            <div className="flex flex-col items-center gap-2 rounded-lg border border-neutral-800 bg-neutral-950 p-4">
              <QRCodeSVG data={shareUrl} size={160} />
              <span className="text-xs text-neutral-500">Scan to open capture</span>
            </div>
          )}

          {/* Embed code section */}
          {showEmbed && (
            <div className="space-y-2">
              <label className="text-xs font-medium text-neutral-400">Embed Code</label>
              <div className="relative">
                <pre className="overflow-x-auto rounded-lg border border-neutral-800 bg-neutral-950 p-3 text-xs text-neutral-300">
                  {embedCode}
                </pre>
                <button
                  onClick={() => copyToClipboard(embedCode, 'embed')}
                  className="absolute right-2 top-2 rounded-md border border-neutral-700 bg-neutral-800 p-1.5 text-neutral-400 hover:text-white"
                >
                  {copied === 'embed' ? (
                    <Check className="h-3 w-3 text-green-400" />
                  ) : (
                    <Copy className="h-3 w-3" />
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Password protection */}
          <div className="space-y-2 rounded-lg border border-neutral-800 bg-neutral-950 p-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {isPasswordProtected ? (
                  <Lock className="h-4 w-4 text-amber-400" />
                ) : (
                  <LockOpen className="h-4 w-4 text-neutral-500" />
                )}
                <span className="text-sm text-neutral-300">Password Protection</span>
              </div>
              {isPasswordProtected ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleRemovePassword}
                  disabled={removePasswordMut.isPending}
                  className="h-7 border-neutral-700 bg-neutral-800 text-xs text-neutral-300 hover:bg-neutral-700"
                >
                  Remove
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setShowPasswordInput(!showPasswordInput)}
                  className="h-7 border-neutral-700 bg-neutral-800 text-xs text-neutral-300 hover:bg-neutral-700"
                >
                  Set Password
                </Button>
              )}
            </div>
            {showPasswordInput && !isPasswordProtected && (
              <div className="flex gap-2 pt-1">
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Min 4 characters"
                  className="h-8 flex-1 rounded-md border border-neutral-700 bg-neutral-800 px-2.5 text-sm text-white placeholder-neutral-500 focus:border-indigo-500 focus:outline-none"
                />
                <Button
                  size="sm"
                  onClick={handleSetPassword}
                  disabled={newPassword.length < 4 || setPasswordMut.isPending}
                  className="h-8"
                >
                  Save
                </Button>
              </div>
            )}
          </div>

          {/* Expiry extension */}
          {expiryDate && !isExpired && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-neutral-500">Extend expiry:</span>
              {[7, 30, 90].map((days) => (
                <button
                  key={days}
                  onClick={() => handleExtendExpiry(days)}
                  disabled={updateExpiryMut.isPending}
                  className="rounded-md border border-neutral-700 bg-neutral-800 px-2 py-1 text-xs text-neutral-400 hover:bg-neutral-700 hover:text-white disabled:opacity-50"
                >
                  +{days}d
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
