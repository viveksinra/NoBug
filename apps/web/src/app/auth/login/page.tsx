'use client';

import { useState } from 'react';
import { signIn } from '@/lib/auth-client';
import { useRouter, useSearchParams } from 'next/navigation';

const DEMO_PASSWORD = 'Demo1234!';

type DemoRole = 'OWNER' | 'ADMIN' | 'DEVELOPER' | 'QA' | 'VIEWER';

const DEMO_ACCOUNTS: Array<{
  email: string;
  name: string;
  role: DemoRole;
  blurb: string;
}> = [
  {
    email: 'demo@snagbug.com',
    name: 'Demo Owner',
    role: 'OWNER',
    blurb: 'Primary demo account — full access to Acme Corp.',
  },
  {
    email: 'viveksinra@gmail.com',
    name: 'Vivek Sinra',
    role: 'OWNER',
    blurb: 'Founder account — full access to Acme Corp.',
  },
  {
    email: 'sarah@acme.test',
    name: 'Sarah Chen',
    role: 'ADMIN',
    blurb: 'Engineering lead. Manages members & settings.',
  },
  {
    email: 'mike@acme.test',
    name: 'Mike Rodriguez',
    role: 'DEVELOPER',
    blurb: 'Frontend dev. Assigned to several open bugs.',
  },
  {
    email: 'priya@acme.test',
    name: 'Priya Patel',
    role: 'QA',
    blurb: 'QA tester. Runs the checkout regression suite.',
  },
  {
    email: 'alex@acme.test',
    name: 'Alex Kim',
    role: 'VIEWER',
    blurb: 'Read-only stakeholder / PM perspective.',
  },
];

const ROLE_STYLES: Record<DemoRole, string> = {
  OWNER:     'bg-indigo-500/15 text-indigo-300 border-indigo-500/30',
  ADMIN:     'bg-purple-500/15 text-purple-300 border-purple-500/30',
  DEVELOPER: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  QA:        'bg-amber-500/15  text-amber-300  border-amber-500/30',
  VIEWER:    'bg-neutral-500/15 text-neutral-300 border-neutral-500/30',
};

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [demoOpen, setDemoOpen] = useState(false);
  const [demoLoadingEmail, setDemoLoadingEmail] = useState<string | null>(null);

  const finishLogin = () => {
    const isExtLogin = searchParams.get('ext') === '1';
    if (isExtLogin) {
      window.document.title = 'SnagBug — Logged In';
    } else {
      router.push('/');
    }
  };

  const doSignIn = async (e: string, p: string) => {
    const result = await signIn.email({ email: e, password: p });
    if (result.error) {
      throw new Error(result.error.message || 'Invalid credentials');
    }
    finishLogin();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await doSignIn(email, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleDemoLogin = async (demoEmail: string) => {
    setError('');
    setDemoLoadingEmail(demoEmail);
    try {
      await doSignIn(demoEmail, DEMO_PASSWORD);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Demo login failed.');
      setDemoOpen(false);
    } finally {
      setDemoLoadingEmail(null);
    }
  };

  const copyToClipboard = async (text: string) => {
    try { await navigator.clipboard.writeText(text); } catch {}
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0a0a0a] relative overflow-hidden">
      <div className="w-full max-w-sm p-6">
        <h1 className="text-2xl font-bold text-white text-center mb-6">Sign In</h1>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-400 mb-1">Email</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full px-3 py-2 rounded-lg bg-[#141414] border border-[#262626] text-white text-sm focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-400 mb-1">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full px-3 py-2 rounded-lg bg-[#141414] border border-[#262626] text-white text-sm focus:outline-none focus:border-indigo-500"
            />
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 rounded-lg bg-indigo-600 text-white font-medium text-sm hover:bg-indigo-500 disabled:opacity-50 transition-colors"
          >
            {loading ? 'Signing in...' : 'Log In'}
          </button>
        </form>

        {/* Demo accounts trigger */}
        <div className="mt-6 flex items-center gap-3">
          <div className="flex-1 h-px bg-[#262626]" />
          <span className="text-[11px] uppercase tracking-wider text-gray-600">or</span>
          <div className="flex-1 h-px bg-[#262626]" />
        </div>

        <button
          type="button"
          onClick={() => setDemoOpen(true)}
          className="mt-4 w-full py-2.5 rounded-lg border border-indigo-500/40 bg-indigo-500/5 text-indigo-300 font-medium text-sm hover:bg-indigo-500/10 hover:border-indigo-500/60 transition-colors flex items-center justify-center gap-2"
        >
          <span aria-hidden>✨</span>
          Try a demo account
        </button>

        <p className="text-sm text-gray-500 text-center mt-4">
          Don&apos;t have an account?{' '}
          <a href="/auth/register" className="text-indigo-400 hover:text-indigo-300">Sign up</a>
        </p>
      </div>

      {/* Backdrop */}
      <div
        onClick={() => setDemoOpen(false)}
        className={`fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity z-40 ${
          demoOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        aria-hidden
      />

      {/* Slide-out panel */}
      <aside
        role="dialog"
        aria-label="Demo accounts"
        aria-hidden={!demoOpen}
        className={`fixed top-0 right-0 h-full w-full sm:w-[420px] bg-[#0d0d0d] border-l border-[#262626] shadow-2xl z-50 transform transition-transform duration-300 ease-out flex flex-col ${
          demoOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <header className="px-6 py-5 border-b border-[#262626] flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-white">Demo Accounts</h2>
            <p className="text-xs text-gray-500 mt-1">
              One-click sign in. All accounts belong to <span className="text-gray-300">Acme Corp</span>.
              <br />
              Password for all: <code className="text-indigo-300 bg-indigo-500/10 px-1.5 py-0.5 rounded text-[11px]">{DEMO_PASSWORD}</code>
            </p>
          </div>
          <button
            type="button"
            onClick={() => setDemoOpen(false)}
            aria-label="Close"
            className="text-gray-500 hover:text-white transition-colors text-xl leading-none -mt-1"
          >
            ×
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2.5">
          {DEMO_ACCOUNTS.map((acc) => {
            const isLoading = demoLoadingEmail === acc.email;
            const isDisabled = demoLoadingEmail !== null;
            return (
              <div
                key={acc.email}
                className="rounded-lg border border-[#262626] bg-[#141414] p-4 hover:border-[#363636] transition-colors"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-white text-sm">{acc.name}</span>
                      <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border ${ROLE_STYLES[acc.role]}`}>
                        {acc.role}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => copyToClipboard(acc.email)}
                      title="Click to copy"
                      className="text-xs text-gray-400 hover:text-gray-200 mt-0.5 truncate block max-w-full text-left"
                    >
                      {acc.email}
                    </button>
                    <p className="text-xs text-gray-500 mt-1.5 leading-relaxed">{acc.blurb}</p>
                  </div>
                  <button
                    type="button"
                    disabled={isDisabled}
                    onClick={() => handleDemoLogin(acc.email)}
                    className="shrink-0 px-3 py-1.5 rounded-md bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {isLoading ? 'Signing in…' : 'Sign in'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <footer className="px-6 py-4 border-t border-[#262626] text-[11px] text-gray-500">
          Demo data is reset every time the seed runs. Anything you create here is throwaway.
        </footer>
      </aside>
    </div>
  );
}
