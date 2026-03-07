import { useState, useEffect } from 'react';
import { Outlet, NavLink, useSearchParams } from 'react-router';
import { Button } from '@/shared/components/ui/button';
import { CreditCard, Gift } from 'lucide-react';
import { cn } from '@/shared/utils/ui';
import { SidebarPageHeader } from '../../components/shell/sidebar-page-header';
import { CreditTopUpDialog } from '../../components/credits/CreditTopUpDialog';
import { GiftCodeDialog } from '../../components/credits/GiftCodeDialog';

const tabs = [
  { name: 'Purchase History', path: 'purchases' },
  { name: 'Usage', path: 'usage' },
];

export default function CreditsLayout() {
  const [topUpOpen, setTopUpOpen] = useState(false);
  const [giftOpen, setGiftOpen] = useState(false);
  const [giftCode, setGiftCode] = useState('');
  const [searchParams, setSearchParams] = useSearchParams();

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
