import { AlertCircle, RefreshCw, Package } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/shared/components/ui/alert';
import { Badge } from '@/shared/components/ui/badge';
import { Button } from '@/shared/components/ui/button';
import { Skeleton } from '@/shared/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/shared/components/ui/table';
import { SidebarPageHeader } from '../../components/shell/sidebar-page-header';
import { useCreditPackages } from '../../hooks/credit-packages/use-credit-packages';

function LoadingSkeleton() {
  return (
    <TableBody>
      {Array.from({ length: 4 }).map((_, i) => (
        <TableRow key={i}>
          <TableCell><Skeleton className="h-4 w-32" /></TableCell>
          <TableCell><Skeleton className="h-4 w-16" /></TableCell>
          <TableCell><Skeleton className="h-4 w-20" /></TableCell>
          <TableCell><Skeleton className="h-5 w-14" /></TableCell>
          <TableCell><Skeleton className="h-4 w-8" /></TableCell>
        </TableRow>
      ))}
    </TableBody>
  );
}

function CreditPackagesPage() {
  const { data, isLoading, error, refetch } = useCreditPackages();
  const packages = data?.data;

  return (
    <>
      <SidebarPageHeader breadcrumbs={[{ label: 'Credit Packages' }]} />

      <div className="p-4">
        {error && (
          <Alert variant="destructive" className="mb-4">
            <AlertCircle className="size-4" />
            <AlertTitle>Failed to load credit packages</AlertTitle>
            <AlertDescription>{error.message}</AlertDescription>
            <Button
              variant="destructive"
              size="sm"
              className="mt-2"
              onClick={() => refetch()}
            >
              <RefreshCw className="mr-1 size-4" />
              Retry
            </Button>
          </Alert>
        )}

        {!isLoading && !error && packages?.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Package className="size-8 text-muted-foreground" />
            <p className="mt-2 text-sm text-muted-foreground">No credit packages yet</p>
          </div>
        )}

        {(isLoading || (packages && packages.length > 0)) && (
          <div className="overflow-x-auto">
            <Table className="min-w-[600px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Credits</TableHead>
                  <TableHead>Price (THB)</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Sort Order</TableHead>
                </TableRow>
              </TableHeader>
              {isLoading ? (
                <LoadingSkeleton />
              ) : (
                <TableBody>
                  {packages?.map((pkg) => (
                    <TableRow key={pkg.id}>
                      <TableCell className="font-medium">{pkg.name}</TableCell>
                      <TableCell>{pkg.credits.toLocaleString()}</TableCell>
                      <TableCell>{pkg.priceThb.toLocaleString()}</TableCell>
                      <TableCell>
                        <Badge variant={pkg.active ? 'success' : 'secondary'}>
                          {pkg.active ? 'Active' : 'Inactive'}
                        </Badge>
                      </TableCell>
                      <TableCell>{pkg.sortOrder}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              )}
            </Table>
          </div>
        )}
      </div>
    </>
  );
}

export { CreditPackagesPage as Component };
