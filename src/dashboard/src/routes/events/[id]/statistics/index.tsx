import { useState } from 'react';
import { Badge } from '@/shared/components/ui/badge';
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardDescription,
} from '@/shared/components/ui/card';
import { Calendar, Image as ImageIcon, Clock, BarChart3 } from 'lucide-react';
import { parseISO, differenceInDays, differenceInDays as daysBetween, format } from 'date-fns';
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/shared/components/ui/chart';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/components/ui/select';
import { ToggleGroup, ToggleGroupItem } from '@/shared/components/ui/toggle-group';
import { useParams } from 'react-router';
import { useEvent } from '../../../../hooks/events/useEvent';

// Mock data for photo uploads chart
const generateMockChartData = (days: number) => {
  const data = [];
  const now = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    data.push({
      date: format(date, 'yyyy-MM-dd'),
      uploads: Math.floor(Math.random() * 50) + 10,
    });
  }
  return data;
};

const chartConfig = {
  uploads: {
    label: 'Photos Uploaded',
    color: 'hsl(var(--primary))',
  },
} satisfies ChartConfig;

export default function EventStatisticsTab() {
  const { id } = useParams<{ id: string }>();
  const { data } = useEvent(id);
  const [timeRange, setTimeRange] = useState<'7d' | '30d' | 'all'>('30d');

  if (!data?.data) {
    return null;
  }

  const event = data.data;

  const daysUntilExpiry = differenceInDays(parseISO(event.expiresAt), new Date());
  const isExpired = daysUntilExpiry <= 0;
  const isExpiringSoon = daysUntilExpiry <= 7 && daysUntilExpiry > 0;

  // Calculate days since creation
  const daysSinceCreation = differenceInDays(new Date(), parseISO(event.createdAt));

  // Calculate event duration
  const eventDuration =
    event.startDate && event.endDate
      ? daysBetween(parseISO(event.endDate), parseISO(event.startDate)) + 1
      : null;

  return (
    <div className="space-y-6 py-4">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Total Photos Stat */}
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <ImageIcon className="size-4" />
              Total Photos
            </CardDescription>
            <CardTitle className="text-2xl font-semibold tabular-nums">0</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">No photos uploaded yet</p>
          </CardContent>
        </Card>

        {/* Storage Used Stat */}
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <BarChart3 className="size-4" />
              Storage Used
            </CardDescription>
            <CardTitle className="text-2xl font-semibold tabular-nums">0 MB</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">Of event storage</p>
          </CardContent>
        </Card>

        {/* Days Active Stat */}
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <Clock className="size-4" />
              Days Active
            </CardDescription>
            <CardTitle className="text-2xl font-semibold tabular-nums">
              {daysSinceCreation}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">{daysUntilExpiry} days until expiry</p>
          </CardContent>
        </Card>

        {/* Event Status Stat */}
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <Calendar className="size-4" />
              Status
            </CardDescription>
            <CardTitle className="text-xl">
              {isExpired ? (
                <Badge variant="destructive" className="mt-1">
                  Expired
                </Badge>
              ) : isExpiringSoon ? (
                <Badge variant="outline" className="mt-1 border-orange-500 text-orange-500">
                  Expires in {daysUntilExpiry}d
                </Badge>
              ) : (
                <Badge variant="secondary" className="mt-1 bg-green-100 text-green-800">
                  Active
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              {eventDuration ? `${eventDuration} day event` : 'Duration not set'}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Photo Uploads Chart */}
      <Card>
        <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>Photo Uploads Over Time</CardTitle>
            <CardDescription>
              Daily upload activity for the last{' '}
              {timeRange === '7d' ? '7 days' : timeRange === '30d' ? '30 days' : 'all time'}
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
              data={generateMockChartData(timeRange === '7d' ? 7 : timeRange === '30d' ? 30 : 90)}
              margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
            >
              <defs>
                <linearGradient id="fillUploads" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--color-uploads)" stopOpacity={0.8} />
                  <stop offset="95%" stopColor="var(--color-uploads)" stopOpacity={0.1} />
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
                dataKey="uploads"
                type="natural"
                fill="url(#fillUploads)"
                fillOpacity={0.4}
                stroke="var(--color-uploads)"
                strokeWidth={2}
              />
            </AreaChart>
          </ChartContainer>
        </CardContent>
      </Card>
    </div>
  );
}
