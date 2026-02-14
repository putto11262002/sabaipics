import { Link } from 'react-router';
import { CreditCard, TrendingDown, Plus } from 'lucide-react';
import { SidebarPageHeader } from '../../components/shell/sidebar-page-header';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from '@sabaipics/uiv3/components/card';
import { Button } from '@sabaipics/uiv3/components/button';
import { CreditTopUpDialog } from '../../components/credits/CreditTopUpDialog';
import { useState } from 'react';

export function CreditsIndexPage() {
  const [creditDialogOpen, setCreditDialogOpen] = useState(false);

  return (
    <>
      <SidebarPageHeader breadcrumbs={[{ label: 'Credits' }]} />

      <div className="flex flex-1 flex-col gap-4 p-4">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {/* Purchase History Card */}
          <Card className="group cursor-pointer transition-colors hover:border-primary/50">
            <Link to="/credits/purchases">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <CreditCard className="size-5 text-primary" />
                  <CardTitle>Purchase History</CardTitle>
                </div>
                <CardDescription>
                  View all your credit purchases and receipts
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  See all transactions where you received credits, including purchases, gifts, and discounts.
                </p>
              </CardContent>
              <CardFooter>
                <Button variant="secondary" className="w-full group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                  View Purchases
                </Button>
              </CardFooter>
            </Link>
          </Card>

          {/* Usage History Card */}
          <Card className="group cursor-pointer transition-colors hover:border-primary/50">
            <Link to="/credits/usage">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <TrendingDown className="size-5 text-primary" />
                  <CardTitle>Usage History</CardTitle>
                </div>
                <CardDescription>
                  Track how you've spent your credits
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  View detailed usage analytics, including charts and transaction history for photo uploads.
                </p>
              </CardContent>
              <CardFooter>
                <Button variant="secondary" className="w-full group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                  View Usage
                </Button>
              </CardFooter>
            </Link>
          </Card>

          {/* Buy Credits Card */}
          <Card className="group cursor-pointer transition-colors hover:border-primary/50 md:col-span-2 lg:col-span-1">
            <CardHeader onClick={() => setCreditDialogOpen(true)} className="cursor-pointer">
              <div className="flex items-center gap-2">
                <Plus className="size-5 text-primary" />
                <CardTitle>Buy Credits</CardTitle>
              </div>
              <CardDescription>
                Top up your account with more credits
              </CardDescription>
            </CardHeader>
            <CardContent onClick={() => setCreditDialogOpen(true)} className="cursor-pointer">
              <p className="text-sm text-muted-foreground">
                Purchase credits to upload photos to your events. 1 credit = 1 photo upload.
              </p>
            </CardContent>
            <CardFooter>
              <Button
                className="w-full"
                onClick={() => setCreditDialogOpen(true)}
              >
                <CreditCard className="mr-1 size-4" />
                Buy Credits
              </Button>
            </CardFooter>
          </Card>
        </div>
      </div>

      {/* Credit Top-Up Dialog */}
      <CreditTopUpDialog
        open={creditDialogOpen}
        onOpenChange={setCreditDialogOpen}
      />
    </>
  );
}
