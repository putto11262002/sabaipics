import { useMemo, useState } from 'react';
import { useReactTable, getCoreRowModel, createColumnHelper } from '@tanstack/react-table';
import { Badge } from '@/shared/components/ui/badge';
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardDescription,
} from '@/shared/components/ui/card';
import { Skeleton } from '@/shared/components/ui/skeleton';
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from '@/shared/components/ui/empty';
import { TrendingDown } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/components/ui/select';
import { ToggleGroup, ToggleGroupItem } from '@/shared/components/ui/toggle-group';
import { Bar, BarChart, CartesianGrid, XAxis, YAxis, Legend } from 'recharts';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/shared/components/ui/chart';
import { format, parseISO, subDays, eachDayOfInterval } from 'date-fns';
import { DataTable } from '../../components/events-table/data-table';
import { DataTablePagination } from '../../components/events-table/data-table-pagination';
import { useCreditHistory, type CreditEntry } from '../../hooks/credits/useCreditHistory';
import { useUsageBySource } from '../../hooks/credits/useUsageBySource';

const SOURCE_COLORS: Record<string, string> = {
  upload: 'var(--color-chart-1)',
  image_enhancement: 'var(--color-chart-2)',
  line_delivery: 'var(--color-chart-3)',
  admin_adjustment: 'var(--color-chart-4)',
};

const SOURCE_LABELS: Record<string, string> = {
  upload: 'Photo Upload',
  image_enhancement: 'Image Enhancement',
  line_delivery: 'LINE Delivery',
  admin_adjustment: 'Admin',
};

const chartConfig = {
  upload: {
    label: 'Photo Upload',
    color: 'var(--color-chart-1)',
  },
  image_enhancement: {
    label: 'Image Enhancement',
    color: 'var(--color-chart-2)',
  },
  line_delivery: {
    label: 'LINE Delivery',
    color: 'var(--color-chart-3)',
  },
  admin_adjustment: {
    label: 'Admin',
    color: 'var(--color-chart-4)',
  },
} satisfies ChartConfig;

type TimeRange = '7' | '30' | '90';

const columnHelper = createColumnHelper<CreditEntry>();

const columns = [
  columnHelper.accessor('createdAt', {
    header: 'Date',
    cell: (info) => format(parseISO(info.getValue()), 'MMM d, yyyy'),
  }),
  columnHelper.accessor('source', {
    header: 'Source',
    cell: (info) => {
      const source = info.getValue();
      return <Badge variant="secondary">{SOURCE_LABELS[source] ?? source}</Badge>;
    },
  }),
  columnHelper.accessor('amount', {
    header: 'Amount',
    cell: (info) => (
      <span className="font-medium tabular-nums text-destructive">
        {info.getValue().toLocaleString()}
      </span>
    ),
  }),
];

export default function CreditUsageTab() {
  const [timeRange, setTimeRange] = useState<TimeRange>('30');
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(20);

  const days = parseInt(timeRange, 10);
  const { data: sourceData, isLoading: chartLoading } = useUsageBySource(days);
  const { data: tableData, isLoading: tableLoading } = useCreditHistory(page, pageSize, 'debit');

  // Transform source data into stacked bar format with all days filled
  const stackedChartData = useMemo(() => {
    if (!sourceData) return [];

    // Group by date
    const byDate = new Map<string, Record<string, number>>();
    for (const row of sourceData) {
      const existing = byDate.get(row.date) ?? {};
      byDate.set(row.date, { ...existing, [row.source]: row.credits });
    }

    // Fill all days in range
    const today = new Date();
    const allDays = eachDayOfInterval({
      start: subDays(today, days - 1),
      end: today,
    });

    return allDays.map((d) => {
      const dateStr = format(d, 'yyyy-MM-dd');
      const sources = byDate.get(dateStr) ?? {};
      return { date: dateStr, ...sources };
    });
  }, [sourceData, days]);

  // Get unique sources present in data for rendering bars
  const activeSources = useMemo(() => {
    if (!sourceData) return [];
    const sources = new Set(sourceData.map((d) => d.source));
    return Array.from(sources);
  }, [sourceData]);

  const entries = tableData?.data?.entries ?? [];
  const pagination = tableData?.data?.pagination;

  const table = useReactTable({
    data: entries,
    columns,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    pageCount: pagination?.totalPages ?? 0,
    state: {
      pagination: { pageIndex: page, pageSize },
    },
    onPaginationChange: (updater) => {
      const next = typeof updater === 'function' ? updater({ pageIndex: page, pageSize }) : updater;
      setPage(next.pageIndex);
      setPageSize(next.pageSize);
    },
  });

  return (
    <div className="space-y-6 py-4">
      {/* Bar Chart */}
      <Card>
        <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>Credit Usage</CardTitle>
            <CardDescription>Daily credits used over the last {timeRange} days</CardDescription>
          </div>

          {/* Time Range - Desktop */}
          <ToggleGroup
            type="single"
            value={timeRange}
            onValueChange={(value) => value && setTimeRange(value as TimeRange)}
            className="hidden sm:flex"
          >
            <ToggleGroupItem value="7" variant="outline">
              7 days
            </ToggleGroupItem>
            <ToggleGroupItem value="30" variant="outline">
              30 days
            </ToggleGroupItem>
            <ToggleGroupItem value="90" variant="outline">
              90 days
            </ToggleGroupItem>
          </ToggleGroup>

          {/* Time Range - Mobile */}
          <Select value={timeRange} onValueChange={(value) => setTimeRange(value as TimeRange)}>
            <SelectTrigger className="w-[140px] sm:hidden">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">7 days</SelectItem>
              <SelectItem value="30">30 days</SelectItem>
              <SelectItem value="90">90 days</SelectItem>
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent>
          {chartLoading ? (
            <Skeleton className="h-[300px] w-full" />
          ) : (
            <ChartContainer config={chartConfig} className="h-[300px] w-full">
              <BarChart data={stackedChartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="date"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  minTickGap={32}
                  tickFormatter={(value: string) => {
                    const date = new Date(value);
                    return format(date, 'MMM d');
                  }}
                />
                <YAxis tickLine={false} axisLine={false} tickMargin={8} />
                <ChartTooltip cursor={false} content={<ChartTooltipContent indicator="line" />} />
                <Legend />
                {activeSources.map((source) => (
                  <Bar
                    key={source}
                    dataKey={source}
                    fill={SOURCE_COLORS[source] ?? 'var(--color-chart-5)'}
                    stackId="a"
                    radius={[0, 0, 0, 0]}
                  />
                ))}
              </BarChart>
            </ChartContainer>
          )}
        </CardContent>
      </Card>

      {/* Usage Table */}
      {tableLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-4 py-3">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-5 w-20 rounded-full" />
              <Skeleton className="ml-auto h-4 w-16" />
            </div>
          ))}
        </div>
      ) : entries.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <TrendingDown />
            </EmptyMedia>
            <EmptyTitle>No usage yet</EmptyTitle>
            <EmptyDescription>Credits are deducted when you upload photos.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <>
          <DataTable table={table} />
          {(pagination?.totalPages ?? 0) > 1 && (
            <DataTablePagination table={table} showSelectedCount={false} />
          )}
        </>
      )}
    </div>
  );
}
