import { NextRequest, NextResponse } from 'next/server';
import { randomBytes, createHash } from 'crypto';
import { auth } from '@/lib/auth';
import { db } from '@nobug/db';
import {
  QUICK_CAPTURE_ANON_EXPIRY_HOURS,
  QUICK_CAPTURE_FREE_EXPIRY_DAYS,
} from '@nobug/shared';

function generateSlug(): string {
  return randomBytes(6).toString('base64url');
}

function hashPassword(password: string): string {
  return createHash('sha256').update(password).digest('hex');
}

/**
 * POST /api/extension/quick-capture
 *
 * Create a Quick Capture from the browser extension.
 * Anonymous allowed (no auth required).
 */
export async function POST(req: NextRequest) {
  const body = await req.json();

  // Optional auth — anonymous captures are allowed
  let userId: string | null = null;
  try {
    const session = await auth.api.getSession({ headers: req.headers });
    userId = session?.user?.id ?? null;
  } catch {
    // No session — anonymous capture
  }

  // Determine expiry
  const expiresAt = !userId
    ? new Date(Date.now() + QUICK_CAPTURE_ANON_EXPIRY_HOURS * 60 * 60 * 1000)
    : new Date(Date.now() + QUICK_CAPTURE_FREE_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

  const slug = generateSlug();
  const passwordHash = body.password ? hashPassword(body.password) : null;

  const capture = await db.quickCapture.create({
    data: {
      slug,
      user_id: userId,
      title: body.title || null,
      description: body.description || null,
      environment_json: (body.environment_json as any) ?? undefined,
      password_hash: passwordHash,
      expires_at: expiresAt,
      // S3 URLs — null for now, populated after S3 upload (T-031)
      recording_url: null,
      console_logs_url: null,
      network_logs_url: null,
      screenshot_url: null,
    },
  });

  return NextResponse.json({
    id: capture.id,
    slug: capture.slug,
    expires_at: capture.expires_at?.toISOString() ?? null,
    share_url: `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/b/${slug}`,
  });
}
