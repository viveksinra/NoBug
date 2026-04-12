'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Bug,
  LayoutDashboard,
  FolderKanban,
  TestTubeDiagonal,
  Bot,
  Plug,
  Settings,
  ChevronsLeft,
  ChevronsRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { CompanySwitcher } from './company-switcher';
import { UserMenu } from './user-menu';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { useState } from 'react';

interface SidebarProps {
  companySlug: string;
  projectKey?: string;
}

export function Sidebar({ companySlug, projectKey }: SidebarProps) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  const baseUrl = `/${companySlug}`;
  const projectUrl = projectKey ? `${baseUrl}/${projectKey}` : null;

  const navItems = [
    {
      label: 'Dashboard',
      href: `${baseUrl}/dashboard`,
      icon: LayoutDashboard,
    },
    ...(projectUrl
      ? [
          {
            label: 'Issues',
            href: `${projectUrl}/issues`,
            icon: Bug,
          },
          {
            label: 'Board',
            href: `${projectUrl}/board`,
            icon: FolderKanban,
          },
          {
            label: 'Regression',
            href: `${projectUrl}/regression`,
            icon: TestTubeDiagonal,
          },
        ]
      : []),
  ];

  const bottomItems = [
    { label: 'Agents', href: `${baseUrl}/agents`, icon: Bot },
    { label: 'Integrations', href: `${baseUrl}/integrations`, icon: Plug },
    { label: 'Settings', href: `${baseUrl}/settings`, icon: Settings },
  ];

  return (
    <aside
      className={cn(
        'flex h-screen flex-col border-r border-neutral-800 bg-neutral-950 transition-all duration-200',
        collapsed ? 'w-16' : 'w-60',
      )}
    >
      {/* Company Switcher */}
      <div className="flex h-14 items-center gap-2 border-b border-neutral-800 px-3">
        {!collapsed && <CompanySwitcher currentSlug={companySlug} />}
        <Button
          variant="ghost"
          size="icon"
          className="ml-auto h-8 w-8 shrink-0"
          onClick={() => setCollapsed(!collapsed)}
        >
          {collapsed ? <ChevronsRight className="h-4 w-4" /> : <ChevronsLeft className="h-4 w-4" />}
        </Button>
      </div>

      {/* Main Navigation */}
      <nav className="flex-1 space-y-1 overflow-y-auto p-2">
        {navItems.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-neutral-800 text-white'
                  : 'text-neutral-400 hover:bg-neutral-800/50 hover:text-neutral-200',
                collapsed && 'justify-center px-2',
              )}
              title={collapsed ? item.label : undefined}
            >
              <item.icon className="h-4 w-4 shrink-0" />
              {!collapsed && <span>{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      <Separator />

      {/* Bottom Navigation */}
      <nav className="space-y-1 p-2">
        {bottomItems.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-neutral-800 text-white'
                  : 'text-neutral-400 hover:bg-neutral-800/50 hover:text-neutral-200',
                collapsed && 'justify-center px-2',
              )}
              title={collapsed ? item.label : undefined}
            >
              <item.icon className="h-4 w-4 shrink-0" />
              {!collapsed && <span>{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      <Separator />

      {/* User Menu */}
      <div className="p-2">
        <UserMenu collapsed={collapsed} />
      </div>
    </aside>
  );
}
