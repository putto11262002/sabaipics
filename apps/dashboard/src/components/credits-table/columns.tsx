import type { ColumnDef } from '@tanstack/react-table';
import { format, parseISO } from 'date-fns';
import { ExternalLink } from 'lucide-react';
import { Badge } from '@sabaipics/uiv3/components/badge';
import { Button } from '@sabaipics/uiv3/components/button';
import type { CreditPurchaseEntry } from '../../hooks/credits/useCreditPurchases';
import type { CreditUsageEntry } from '../../hooks/credits/useCreditUsage';

// Source label mapping for purchases
const purchaseSourceLabels: Record<CreditPurchaseEntry['source'], string> = {
  purchase: 'Purchase',
  gift: 'Gift',
  discount: 'Discount',
  refund: 'Refund',
  admin_adjustment: 'Admin',
  apple_purchase: 'Apple',
};

// Source badge variant for purchases
const purchaseSourceVariants: Record<CreditPurchaseEntry['source'], 'default' | 'secondary' | 'outline' | 'destructive'> = {
  purchase: 'default',
  gift: 'secondary',
  discount: 'secondary',
  refund: 'outline',
  admin_adjustment: 'outline',
  apple_purchase: 'default',
};

// Source label mapping for usage
const usageSourceLabels: Record<CreditUsageEntry['source'], string> = {
  upload: 'Upload',
  refund: 'Refund',
  admin_adjustment: 'Admin',
};

// Source badge variant for usage
const usageSourceVariants: Record<CreditUsageEntry['source'], 'default' | 'secondary' | 'outline' | 'destructive'> = {
  upload: 'default',
  refund: 'outline',
  admin_adjustment: 'outline',
};

export function createPurchaseColumns(): ColumnDef<CreditPurchaseEntry>[] {
  return [
    {
      accessorKey: 'createdAt',
      header: 'Date',
      cell: ({ row }) => {
        return (
          <span className="text-sm text-muted-foreground">
            {format(parseISO(row.original.createdAt), 'MMM d, yyyy')}
          </span>
        );
      },
    },
    {
      accessorKey: 'source',
      header: 'Source',
      cell: ({ row }) => {
        const source = row.original.source;
        return (
          <Badge variant={purchaseSourceVariants[source]}>
            {purchaseSourceLabels[source]}
          </Badge>
        );
      },
    },
    {
      accessorKey: 'amount',
      header: 'Credits',
      cell: ({ row }) => {
        return (
          <span className="font-medium text-green-600">
            +{row.original.amount.toLocaleString()}
          </span>
        );
      },
    },
    {
      accessorKey: 'expiresAt',
      header: 'Expires',
      cell: ({ row }) => {
        return (
          <span className="text-sm text-muted-foreground">
            {format(parseISO(row.original.expiresAt), 'MMM d, yyyy')}
          </span>
        );
      },
    },
    {
      accessorKey: 'stripeReceiptUrl',
      header: 'Receipt',
      cell: ({ row }) => {
        const receiptUrl = row.original.stripeReceiptUrl;
        if (!receiptUrl) {
          return <span className="text-muted-foreground">-</span>;
        }
        return (
          <Button
            variant="ghost"
            size="sm"
            asChild
            className="h-8 px-2"
          >
            <a
              href={receiptUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              <ExternalLink className="size-4" />
              <span className="sr-only">View receipt</span>
            </a>
          </Button>
        );
      },
    },
  ];
}

export function createUsageColumns(): ColumnDef<CreditUsageEntry>[] {
  return [
    {
      accessorKey: 'createdAt',
      header: 'Date',
      cell: ({ row }) => {
        return (
          <span className="text-sm text-muted-foreground">
            {format(parseISO(row.original.createdAt), 'MMM d, yyyy')}
          </span>
        );
      },
    },
    {
      accessorKey: 'source',
      header: 'Source',
      cell: ({ row }) => {
        const source = row.original.source;
        return (
          <Badge variant={usageSourceVariants[source]}>
            {usageSourceLabels[source]}
          </Badge>
        );
      },
    },
    {
      accessorKey: 'amount',
      header: 'Credits',
      cell: ({ row }) => {
        const amount = Math.abs(row.original.amount);
        return (
          <span className="font-medium text-red-600">
            -{amount.toLocaleString()}
          </span>
        );
      },
    },
  ];
}
