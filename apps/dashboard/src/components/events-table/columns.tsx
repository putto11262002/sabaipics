import type { ColumnDef } from '@tanstack/react-table';
import { format, parseISO, differenceInDays } from 'date-fns';
import { MoreHorizontal } from 'lucide-react';

import { Button } from '@sabaipics/uiv3/components/button';
import { Checkbox } from '@sabaipics/uiv3/components/checkbox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@sabaipics/uiv3/components/dropdown-menu';

import type { Event } from '../../hooks/events/useEvents';

export interface EventTableActions {
  onViewEvent: (eventId: string) => void;
  onCopySearchLink: (eventId: string) => void;
  onDownloadQR: (eventId: string, eventName: string) => void;
  onDeleteEvent: (eventId: string) => void;
  onHardDeleteEvent?: (eventId: string) => void;
  isCopied?: boolean;
}

function getEventStatus(expiresAt: string) {
  const daysUntilExpiry = differenceInDays(parseISO(expiresAt), new Date());

  if (daysUntilExpiry <= 0) {
    return { label: 'Expired', variant: 'destructive' as const, daysUntilExpiry };
  }
  if (daysUntilExpiry <= 7) {
    return {
      label: `Expires in ${daysUntilExpiry}d`,
      variant: 'expiring' as const,
      daysUntilExpiry,
    };
  }
  return { label: 'Active', variant: 'active' as const, daysUntilExpiry };
}

export function createColumns(actions: EventTableActions): ColumnDef<Event>[] {
  return [
    {
      id: 'select',
      header: ({ table }) => (
        <Checkbox
          checked={
            table.getIsAllPageRowsSelected() ||
            (table.getIsSomePageRowsSelected() && 'indeterminate')
          }
          onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
          aria-label="Select all"
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(value) => row.toggleSelected(!!value)}
          aria-label="Select row"
        />
      ),
      enableSorting: false,
      enableHiding: false,
    },
    {
      accessorKey: 'name',
      header: 'Event Name',
      cell: ({ row }) => {
        return <span className="font-medium">{row.original.name}</span>;
      },
    },

    {
      accessorKey: 'createdAt',
      header: 'Created',
      cell: ({ row }) => {
        return (
          <span className="text-sm text-muted-foreground">
            {format(parseISO(row.original.createdAt), 'MMM d, yyyy')}
          </span>
        );
      },
    },
    {
      accessorKey: 'expiresAt',
      header: 'Expires',
      cell: ({ row }) => {
        const event = row.original;
        const status = getEventStatus(event.expiresAt);
        const isExpired = status.daysUntilExpiry <= 0;

        return (
          <span
            className={`text-sm ${isExpired ? 'text-red-500 font-medium' : 'text-muted-foreground'}`}
          >
            {format(parseISO(event.expiresAt), 'MMM d, yyyy')}
          </span>
        );
      },
    },
    {
      id: 'actions',
      cell: ({ row }) => {
        const event = row.original;

        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="h-8 w-8 p-0 text-muted-foreground">
                <span className="sr-only">Open menu</span>
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[160px]">
              <DropdownMenuLabel>Actions</DropdownMenuLabel>
              <DropdownMenuItem onClick={() => actions.onViewEvent(event.id)}>
                View Event
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => actions.onCopySearchLink(event.id)}>
                {actions.isCopied ? 'Link Copied!' : 'Copy Search Link'}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => actions.onDownloadQR(event.id, event.name)}>
                Download QR Code
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive"
                onClick={() => actions.onDeleteEvent(event.id)}
              >
                Delete Event
              </DropdownMenuItem>
              {import.meta.env.DEV && actions.onHardDeleteEvent && (
                <DropdownMenuItem
                  className="text-destructive font-bold"
                  onClick={() => actions.onHardDeleteEvent!(event.id)}
                >
                  Hard Delete (Dev)
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    },
  ];
}
