import { useState, useEffect } from 'react';
import { Link, NavLink, Outlet, useSearchParams } from 'react-router';
import { ArrowLeft, BarChart3, CreditCard, Gift, User, Wallet } from 'lucide-react';
import { cn } from '@/shared/utils/ui';
import { Button } from '@/shared/components/ui/button';
import { ScrollArea, ScrollBar } from '@/shared/components/ui/scroll-area';
import { CreditTopUpDialog } from '../../components/credits/CreditTopUpDialog';
import { GiftCodeDialog } from '../../components/credits/GiftCodeDialog';

const navItems = [
  { label: 'Profile', path: 'profile', icon: User },
  { label: 'Credits', path: 'credits', icon: Wallet },
  { label: 'Usage', path: 'usage', icon: BarChart3 },
];

export default function SettingsLayout() {
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

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    cn(
      'flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors',
      isActive
        ? 'bg-accent text-accent-foreground'
        : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
    );

  const mobileLinkClass = ({ isActive }: { isActive: boolean }) =>
    cn(
      'flex items-center gap-1.5 whitespace-nowrap px-3 py-1.5 text-sm font-medium transition-colors border-b-2',
      isActive
        ? 'border-primary text-foreground'
        : 'border-transparent text-muted-foreground hover:text-foreground',
    );

  return (
    <div className="flex h-svh flex-col overflow-hidden">
      {/* Header */}
      <header className="sticky top-0 z-50 flex h-14 shrink-0 items-center gap-3 bg-background px-4">
        <Button variant="ghost" size="icon-xs" asChild>
          <Link to="/dashboard">
            <ArrowLeft className="size-4" />
          </Link>
        </Button>
        <span className="text-sm font-medium">Settings</span>
        <div className="ml-auto flex items-center gap-2">
          <Button size="icon-xs" variant="outline" onClick={() => setGiftOpen(true)} className="md:size-auto md:px-3 md:py-1.5">
            <Gift className="size-4 md:mr-1" />
            <span className="hidden md:inline">Redeem</span>
          </Button>
          <Button size="icon-xs" onClick={() => setTopUpOpen(true)} className="md:size-auto md:px-3 md:py-1.5">
            <CreditCard className="size-4 md:mr-1" />
            <span className="hidden md:inline">Buy</span>
          </Button>
        </div>
      </header>

      {/* Mobile top nav */}
      <div className="md:hidden">
        <ScrollArea className="w-full">
          <div className="flex px-4">
            {navItems.map((item) => (
              <NavLink key={item.path} to={`/settings/${item.path}`} className={mobileLinkClass}>
                <item.icon className="size-3.5" />
                {item.label}
              </NavLink>
            ))}
          </div>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
      </div>

      <div className="mx-auto flex w-full max-w-6xl min-h-0 flex-1 overflow-hidden">
        {/* Desktop sidebar */}
        <aside className="hidden w-56 shrink-0 md:block">
          <div className="flex flex-col gap-1 p-4">
            {navItems.map((item) => (
              <NavLink key={item.path} to={`/settings/${item.path}`} className={linkClass}>
                <item.icon className="size-4" />
                {item.label}
              </NavLink>
            ))}
          </div>
        </aside>

        {/* Content */}
        <ScrollArea className="min-w-0 flex-1 [&>[data-slot=scroll-area-viewport]>div]:!min-w-0 [&>[data-slot=scroll-area-viewport]>div]:!block">
          <main className="min-w-0">
            <Outlet />
          </main>
        </ScrollArea>
      </div>

      <CreditTopUpDialog open={topUpOpen} onOpenChange={setTopUpOpen} />
      <GiftCodeDialog open={giftOpen} onOpenChange={setGiftOpen} initialCode={giftCode} />
    </div>
  );
}
