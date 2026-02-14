import { useMemo, useState } from 'react';
import { format, subDays } from 'date-fns';
import { AlertCircle, RefreshCw, TrendingDown, Calendar, Clock } from 'lucide-react';
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@sabaipics/uiv3/components/chart';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@sabaipics/uiv3/components/select';
import { ToggleGroup, ToggleGroupItem } from '@sabaipics/uiv3/components/toggle-group';
import { SidebarPageHeader } from '../../../components/shell/sidebar-page-header';
import { useCreditUsage } from '../../../hooks/credits/useCreditUsage';
import { DataTable, createUsageColumns } from '../../../components/credits-table';
import { Alert, AlertDescription, AlertTitle } from '@sabaipics/uiv3/components/alert';
import { Button } from '@sabaipics/uiv3/components/button';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@sabaipics/uiv3/components/card';
import { Skeleton } from '@sabaipics/uiv3/components/skeleton';
import { Spinner } from '@sabaipics/uiv3/components/spinner';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@sabaipics/uiv3/components/empty';

const chartConfig = {
  credits: {
    label: 'Credits Used',
    color: 'hsl(var(--primary))',
  },
} satisfies ChartConfig;

export function UsagePage() {
  const [page, setPage] = useState(0);
  const [timeRange, setTimeRange] = useState<'7d' | '30d' | 'all'>('30d');
  const { data, isLoading, error, refetch, isRefetching } = useCreditUsage(page, 20);

  const columns = useMemo(() => createUsageColumns(), []);

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
  };

  // Filter chart data based on time range
  const filteredChartData = useMemo(() => {
    if (!data?.data?.chartData) return [];

    const chartData = data.data.chartData;
    if (timeRange === 'all') return chartData;

    const days = timeRange === '7d' ? 7 : 30;
    const cutoffDate = format(subDays(new Date(), days), 'yyyy-MM-dd');
    return chartData.filter((item) => item.date >= cutoffDate);
  }, [data?.data?.chartData, timeRange]);

  return (
    <>
      <SidebarPageHeader
        breadcrumbs={[
          { label: 'Credits', href: '/credits' },
          { label: 'Usage' },
        ]}
      >
        <Button
          variant="ghost"
          size="sm"
          onClick={() => refetch()}
          disabled={isRefetching}
          title="Refresh"
        >
          <RefreshCw className={`size-4 ${isRefetching ? 'animate-spin' : ''}`} />
        </Button>
      </SidebarPageHeader>

      <div className="flex flex-1 flex-col gap-4 p-4">
        {/* Loading State */}
        {isLoading && (
          <>
            <div className="grid auto-rows-min gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Skeleton className="h-28 w-full rounded-xl" />
              <Skeleton className="h-28 w-full rounded-xl" />
              <Skeleton className="h-28 w-full rounded-xl" />
              <Skeleton className="h-28 w-full rounded-xl" />
            </div>
            <Skeleton className="h-[350px] w-full rounded-xl" />
            <div className="rounded-lg border">
              <div className="flex items-center gap-4 border-b bg-muted/50 px-4 py-3">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-4 w-16 ml-auto" />
              </div>
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4 border-b last:border-0 px-4 py-3">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-4 w-16 ml-auto" />
                </div>
              ))}
            </div>
          </>
        )}

        {/* Error State */}
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="size-4" />
            <AlertTitle>Error loading usage</AlertTitle>
            <AlertDescription className="flex items-center justify-between">
              <span>{error.message}</span>
              <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isRefetching}>
                {isRefetching ? (
                  <Spinner className="mr-1 size-3" />
                ) : (
                  <RefreshCw className="mr-1 size-3" />
                )}
                Retry
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {/* Success State */}
        {data?.data && (
          <>
            {/* Summary Cards Grid */}
            <div className="grid auto-rows-min gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {/* Total Used Stat */}
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription className="flex items-center gap-2">
                    <TrendingDown className="size-4" />
                    Total Used
                  </CardDescription>
                  <CardTitle className="text-2xl font-semibold tabular-nums">
                    {data.data.summary.totalUsed.toLocaleString()}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-xs text-muted-foreground">All time credits used</p>
                </CardContent>
              </Card>

              {/* This Month Stat */}
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription className="flex items-center gap-2">
                    <Calendar className="size-4" />
                    This Month
                  </CardDescription>
                  <CardTitle className="text-2xl font-semibold tabular-nums">
                    {data.data.summary.thisMonth.toLocaleString()}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-xs text-muted-foreground">Credits used this month</p>
                </CardContent>
              </Card>

              {/* This Week Stat */}
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription className="flex items-center gap-2">
                    <Clock className="size-4" />
                    This Week
                  </CardDescription>
                  <CardTitle className="text-2xl font-semibold tabular-nums">
                    {data.data.summary.thisWeek.toLocaleString()}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-xs text-muted-foreground">Credits used in last 7 days</p>
                </CardContent>
              </Card>

              {/* Today Stat */}
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription className="flex items-center gap-2">
                    <Clock className="size-4" />
                    Today
                  </CardDescription>
                  <CardTitle className="text-2xl font-semibold tabular-nums">
                    {data.data.summary.today.toLocaleString()}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-xs text-muted-foreground">Credits used today</p>
                </CardContent>
              </Card>
            </div>

            {/* Usage Chart */}
            {filteredChartData.length > 0 && (
              <Card>
                <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <CardTitle>Usage Over Time</CardTitle>
                    <CardDescription>
                      Daily credit usage for the{' '}
                      {timeRange === '7d' ? 'last 7 days' : timeRange === '30d' ? 'last 30 days' : 'all time'}
                    </CardDescription>
                  </div>

                  {/* Time Range Selector - Desktop */}
                  <ToggleGroup
                    type="single"
                    value={timeRange}
                    onValueChange={(value) => value && setTimeRange(value as '7d' | '30d' | 'all')}
                    className="hidden sm:flex"
                  >
                    <ToggleGroupItem value="7d" variant="outline">
                      7 days
                    </ToggleGroupItem>
                    <ToggleGroupItem value="30d" variant="outline">
                      30 days
                    </ToggleGroupItem>
                    <ToggleGroupItem value="all" variant="outline">
                      All time
                    </ToggleGroupItem>
                  </ToggleGroup>

                  {/* Time Range Selector - Mobile */}
                  <Select
                    value={timeRange}
                    onValueChange={(value) => setTimeRange(value as '7d' | '30d' | 'all')}
                  >
                    <SelectTrigger className="w-[140px] sm:hidden">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="7d">7 days</SelectItem>
                      <SelectItem value="30d">30 days</SelectItem>
                      <SelectItem value="all">All time</SelectItem>
                    </SelectContent>
                  </Select>
                </CardHeader>
                <CardContent>
                  <ChartContainer config={chartConfig} className="h-[300px] w-full">
                    <AreaChart
                      data={filteredChartData}
                      margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
                    >
                      <defs>
                        <linearGradient id="fillCredits" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="var(--color-credits)" stopOpacity={0.8} />
                          <stop offset="95%" stopColor="var(--color-credits)" stopOpacity={0.1} />
                        </linearGradient>
                      </defs>
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
                      <Area
                        dataKey="credits"
                        type="natural"
                        fill="url(#fillCredits)"
                        fillOpacity={0.4}
                        stroke="var(--color-credits)"
                        strokeWidth={2}
                      />
                    </AreaChart>
                  </ChartContainer>
                </CardContent>
              </Card>
            )}

            {/* Usage Table */}
            <div className="space-y-4">
              <h2 className="text-lg font-semibold">Usage History</h2>
              {data.data.entries.length === 0 ? (
                <Empty>
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <TrendingDown className="size-12 text-muted-foreground" />
                    </EmptyMedia>
                    <EmptyTitle>No usage yet</EmptyTitle>
                    <EmptyDescription>
                      Upload photos to your events to start using credits
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              ) : (
                <DataTable
                  data={data.data.entries}
                  columns={columns}
                  emptyMessage="No usage found."
                  pagination={data.data.pagination}
                  onPageChange={handlePageChange}
                />
              )}
            </div>
          </>
        )}
      </div>
    </>
  );
}
