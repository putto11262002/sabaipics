import { useState } from 'react';
import { Outlet, NavLink } from 'react-router';
import { Button } from '@/shared/components/ui/button';
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardDescription,
} from '@/shared/components/ui/card';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { Wallet, Clock, TrendingDown } from 'lucide-react';
import { cn } from '@/shared/utils/ui';
import { SidebarPageHeader } from '../../components/shell/sidebar-page-header';
import { CreditTopUpDialog } from '../../components/credits/CreditTopUpDialog';
import { useCreditHistory } from '../../hooks/credits/useCreditHistory';

const tabs = [
  { name: 'Purchase History', path: 'purchases' },
  { name: 'Usage', path: 'usage' },
];

export default function CreditsLayout() {
  const [topUpOpen, setTopUpOpen] = useState(false);
  // Fetch just for summary stats (page 0, limit 1 to minimize data)
  const { data, isLoading } = useCreditHistory(0, 1);
  const summary = data?.data?.summary;

  return (
    <div className="flex h-full flex-col">
      <SidebarPageHeader
        breadcrumbs={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'Credits' },
        ]}
      >
        <Button onClick={() => setTopUpOpen(true)}>Buy Credits</Button>
      </SidebarPageHeader>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 gap-4 px-4 py-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <Wallet className="size-4" />
              Balance
            </CardDescription>
            <CardTitle className="text-2xl font-semibold tabular-nums">
              {isLoading ? (
                <Skeleton className="h-8 w-20" />
              ) : (
                (summary?.balance ?? 0).toLocaleString()
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">Available credits</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <Clock className="size-4" />
              Expiring Soon
            </CardDescription>
            <CardTitle className="text-2xl font-semibold tabular-nums">
              {isLoading ? (
                <Skeleton className="h-8 w-20" />
              ) : (
                (summary?.expiringSoon ?? 0).toLocaleString()
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">Credits expiring in 30 days</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <TrendingDown className="size-4" />
              Used This Month
            </CardDescription>
            <CardTitle className="text-2xl font-semibold tabular-nums">
              {isLoading ? (
                <Skeleton className="h-8 w-20" />
              ) : (
                (summary?.usedThisMonth ?? 0).toLocaleString()
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">Credits used this month</p>
          </CardContent>
        </Card>
      </div>

      {/* Tab Navigation */}
      <div className="flex-shrink-0 border-b px-4">
        <div className="-mb-px flex gap-6">
          {tabs.map((tab) => (
            <NavLink
              key={tab.path}
              to={`/credits/${tab.path}`}
              className={({ isActive }) =>
                cn(
                  'border-b-2 pb-3 text-sm font-medium transition-colors',
                  isActive
                    ? 'border-primary text-foreground'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                )
              }
            >
              {tab.name}
            </NavLink>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      <div className="min-w-0 flex-1 overflow-auto px-4">
        <Outlet />
      </div>

      <CreditTopUpDialog open={topUpOpen} onOpenChange={setTopUpOpen} />
    </div>
  );
}
