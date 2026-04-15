'use client';

import { useState, ReactNode } from 'react';
import { Button } from '@/components/ui/button';

export function ConfirmDialog({
  trigger,
  title,
  description,
  confirmText = 'Confirm',
  confirmVariant = 'destructive',
  onConfirm,
  isLoading,
}: {
  trigger: ReactNode;
  title: string;
  description: string;
  confirmText?: string;
  confirmVariant?: 'destructive' | 'default';
  onConfirm: () => void;
  isLoading?: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <span onClick={() => setOpen(true)}>{trigger}</span>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="w-full max-w-md rounded-lg border border-neutral-800 bg-neutral-900 p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-white">{title}</h3>
            <p className="mt-2 text-sm text-neutral-400">{description}</p>
            <div className="mt-6 flex justify-end gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setOpen(false)}
                disabled={isLoading}
              >
                Cancel
              </Button>
              <Button
                variant={confirmVariant}
                size="sm"
                onClick={() => {
                  onConfirm();
                  setOpen(false);
                }}
                disabled={isLoading}
              >
                {isLoading ? 'Processing...' : confirmText}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
