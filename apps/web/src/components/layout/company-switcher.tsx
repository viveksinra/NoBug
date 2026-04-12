'use client';

import { useRouter } from 'next/navigation';
import { Building2, ChevronDown, Plus } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

interface CompanySwitcherProps {
  currentSlug: string;
}

export function CompanySwitcher({ currentSlug }: CompanySwitcherProps) {
  const router = useRouter();
  const { data: companies, isLoading } = trpc.company.list.useQuery();

  const currentCompany = companies?.find((c) => c.slug === currentSlug);

  if (isLoading) {
    return <Skeleton className="h-8 w-full" />;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="flex h-8 w-full items-center justify-between gap-2 px-2 text-left">
          <div className="flex items-center gap-2 truncate">
            {currentCompany?.logo_url ? (
              <img src={currentCompany.logo_url} alt="" className="h-5 w-5 rounded" />
            ) : (
              <Building2 className="h-4 w-4 shrink-0 text-neutral-400" />
            )}
            <span className="truncate text-sm font-medium">{currentCompany?.name ?? 'Select Company'}</span>
          </div>
          <ChevronDown className="h-3 w-3 shrink-0 text-neutral-500" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuLabel>Companies</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {companies?.map((company) => (
          <DropdownMenuItem
            key={company.id}
            onClick={() => router.push(`/${company.slug}/dashboard`)}
            className={company.slug === currentSlug ? 'bg-neutral-800' : ''}
          >
            <Building2 className="mr-2 h-4 w-4" />
            <span className="truncate">{company.name}</span>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => router.push('/create-company')}>
          <Plus className="mr-2 h-4 w-4" />
          Create Company
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
