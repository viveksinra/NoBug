import { NextRequest, NextResponse } from 'next/server';
import { getSessionCookie } from 'better-auth/cookies';
import { getSecurityHeaders } from '@/lib/security-headers';
import { rateLimit, authLimiter, quickCaptureLimiter } from '@/lib/rate-limit';

const PUBLIC_PATHS = ['/login', '/register', '/forgot-password', '/reset-password', '/verify-email'];
const AUTH_PATHS = ['/login', '/register'];

function getClientIp(request: NextRequest): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    '127.0.0.1'
  );
}

function rateLimitResponse(retryAfter: number): NextResponse {
  return new NextResponse(
    JSON.stringify({ error: 'Too Many Requests', retryAfter }),
    {
      status: 429,
      headers: {
        'Content-Type': 'application/json',
        'Retry-After': String(retryAfter),
      },
    },
  );
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isProduction = process.env.NODE_ENV === 'production';

  // --- Rate limiting for auth routes ---
  if (pathname.startsWith('/api/auth')) {
    const ip = getClientIp(request);
    const result = await rateLimit(authLimiter, `auth:${ip}`);
    if (!result.success) {
      const resp = rateLimitResponse(result.retryAfter);
      applySecurityHeaders(resp, isProduction);
      return resp;
    }
    const response = NextResponse.next();
    applySecurityHeaders(response, isProduction);
    return response;
  }

  // --- Rate limiting for quick capture ---
  if (pathname.startsWith('/api/extension/quick-capture')) {
    const ip = getClientIp(request);
    const result = await rateLimit(quickCaptureLimiter, `qc:${ip}`);
    if (!result.success) {
      const resp = rateLimitResponse(result.retryAfter);
      applySecurityHeaders(resp, isProduction);
      return resp;
    }
    const response = NextResponse.next();
    applySecurityHeaders(response, isProduction);
    return response;
  }

  // Skip internal Next.js routes
  if (pathname.startsWith('/_next')) {
    return NextResponse.next();
  }

  const sessionCookie = getSessionCookie(request);

  // Redirect authenticated users away from auth pages
  if (sessionCookie && AUTH_PATHS.includes(pathname)) {
    const response = NextResponse.redirect(new URL('/dashboard', request.url));
    applySecurityHeaders(response, isProduction);
    return response;
  }

  // Redirect unauthenticated users to login (except public paths, root, and API routes)
  if (!sessionCookie && !PUBLIC_PATHS.includes(pathname) && pathname !== '/' && !pathname.startsWith('/api/')) {
    const response = NextResponse.redirect(new URL('/login', request.url));
    applySecurityHeaders(response, isProduction);
    return response;
  }

  const response = NextResponse.next();
  applySecurityHeaders(response, isProduction);
  return response;
}

function applySecurityHeaders(response: NextResponse, isProduction: boolean): void {
  const headers = getSecurityHeaders(isProduction);
  for (const [key, value] of Object.entries(headers)) {
    response.headers.set(key, value);
  }
}

export const config = {
  matcher: [
    /*
     * Match all paths except:
     * - _next/static (static assets)
     * - _next/image (image optimization)
     * - favicon.ico
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
