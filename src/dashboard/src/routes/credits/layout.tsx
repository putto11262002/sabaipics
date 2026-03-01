import { useState, useEffect } from 'react';
import { Outlet, NavLink, useSearchParams } from 'react-router';
import { Button } from '@/shared/components/ui/button';
import {
  Card,
  CardHeader,
  CardTitle,
  CardFooter,
  CardDescription,
} from '@/shared/components/ui/card';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { CreditCard, Gift, Wallet, Clock, TrendingDown } from 'lucide-react';
import { cn } from '@/shared/utils/ui';
import { SidebarPageHeader } from '../../components/shell/sidebar-page-header';
import { CreditTopUpDialog } from '../../components/credits/CreditTopUpDialog';
import { GiftCodeDialog } from '../../components/credits/GiftCodeDialog';
import { useCreditHistory } from '../../hooks/credits/useCreditHistory';

const tabs = [
  { name: 'Purchase History', path: 'purchases' },
  { name: 'Usage', path: 'usage' },
];

export default function CreditsLayout() {
  const [topUpOpen, setTopUpOpen] = useState(false);
  const [giftOpen, setGiftOpen] = useState(false);
  const [giftCode, setGiftCode] = useState('');
  const [searchParams, setSearchParams] = useSearchParams();
  // Fetch just for summary stats (page 0, limit 1 to minimize data)
  const { data, isLoading } = useCreditHistory(0, 1);
  const summary = data?.data?.summary;

  // Handle ?code=GIFT-XXX from URL
  useEffect(() => {
    const code = searchParams.get('code');
    if (code) {
      setGiftCode(code.toUpperCase());
      setGiftOpen(true);
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  return (
    <div className="flex h-full flex-col">
      <SidebarPageHeader
        breadcrumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Credits' }]}
      >
        <Button size="sm" variant="outline" onClick={() => setGiftOpen(true)}>
          <Gift className="mr-1 size-4" />
          Redeem Gift Code
        </Button>
        <Button size="sm" onClick={() => setTopUpOpen(true)}>
          <CreditCard className="mr-1 size-4" />
          Buy Credits
        </Button>
      </SidebarPageHeader>

      {/* Summary Cards */}
      <div className="grid auto-rows-min gap-4 px-4 py-4 md:grid-cols-3">
        <Card className="@container/card">
          <CardHeader>
            <CardDescription>Balance</CardDescription>
            <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
              {isLoading ? (
                <Skeleton className="h-8 w-20" />
              ) : (
                (summary?.balance ?? 0).toLocaleString()
              )}
            </CardTitle>
          </CardHeader>
          <CardFooter className="text-sm text-muted-foreground">
            <Wallet className="mr-1 size-4" />
            Available credits
          </CardFooter>
        </Card>

        <Card className="@container/card">
          <CardHeader>
            <CardDescription>Expiring Soon</CardDescription>
            <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
              {isLoading ? (
                <Skeleton className="h-8 w-20" />
              ) : (
                (summary?.expiringSoon ?? 0).toLocaleString()
              )}
            </CardTitle>
          </CardHeader>
          <CardFooter
            className={`text-sm ${(summary?.expiringSoon ?? 0) > 0 ? 'text-warning' : 'text-muted-foreground'}`}
          >
            <Clock className="mr-1 size-4" />
            Credits expiring in 30 days
          </CardFooter>
        </Card>

        <Card className="@container/card">
          <CardHeader>
            <CardDescription>Used This Month</CardDescription>
            <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
              {isLoading ? (
                <Skeleton className="h-8 w-20" />
              ) : (
                (summary?.usedThisMonth ?? 0).toLocaleString()
              )}
            </CardTitle>
          </CardHeader>
          <CardFooter className="text-sm text-destructive">
            <TrendingDown className="mr-1 size-4" />
            Credits used this month
          </CardFooter>
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
                    : 'border-transparent text-muted-foreground hover:text-foreground',
                )
              }
            >
              {tab.name}
            </NavLink>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      <div className="min-w-0 flex-1 px-4">
        <Outlet />
      </div>

      <CreditTopUpDialog open={topUpOpen} onOpenChange={setTopUpOpen} />
      <GiftCodeDialog open={giftOpen} onOpenChange={setGiftOpen} initialCode={giftCode} />
    </div>
  );
}
