'use client';

import { useState } from 'react';
import { signIn } from '@/lib/auth-client';
import { useRouter, useSearchParams } from 'next/navigation';

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const result = await signIn.email({ email, password });
      if (result.error) {
        setError(result.error.message || 'Invalid credentials');
      } else {
        // If ext=1 param, this is from the extension login flow
        const isExtLogin = searchParams.get('ext') === '1';
        if (isExtLogin) {
          // Stay on this page so the extension can detect login completion
          window.document.title = 'NoBug — Logged In';
        } else {
          router.push('/');
        }
      }
    } catch {
      setError('Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0a0a0a]">
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

        <p className="text-sm text-gray-500 text-center mt-4">
          Don&apos;t have an account?{' '}
          <a href="/auth/register" className="text-indigo-400 hover:text-indigo-300">Sign up</a>
        </p>
      </div>
    </div>
  );
}
