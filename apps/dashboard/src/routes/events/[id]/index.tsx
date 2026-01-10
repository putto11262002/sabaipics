import { useParams, useNavigate } from "react-router";
import { Button } from "@sabaipics/ui/components/button";
import { Alert } from "@sabaipics/ui/components/alert";
import { Skeleton } from "@sabaipics/ui/components/skeleton";
import { Card, CardHeader, CardTitle, CardContent } from "@sabaipics/ui/components/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@sabaipics/ui/components/tabs";
import { ArrowLeft, Calendar } from "lucide-react";
import { formatDistanceToNow, parseISO, differenceInDays } from "date-fns";
import { useEvent } from "../../../hooks/events/useEvent";
import { EventQRDisplay } from "../../../components/events/EventQRDisplay";

export default function EventDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data, isLoading, error, refetch } = useEvent(id);

  if (isLoading) {
    return (
      <div className="container mx-auto p-6">
        <Skeleton className="mb-6 h-10 w-32" />
        <Skeleton className="mb-6 h-64 w-full rounded-xl" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto p-6">
        <Button
          onClick={() => navigate("/events")}
          variant="ghost"
          className="mb-6"
        >
          <ArrowLeft className="mr-2 size-4" />
          Back to Events
        </Button>

        <Alert variant="destructive">
          <p className="mb-3">{error.message}</p>
          <div className="flex gap-2">
            <Button onClick={() => refetch()} variant="outline" size="sm">
              Try Again
            </Button>
            <Button onClick={() => navigate("/events")} variant="outline" size="sm">
              Back to Events
            </Button>
          </div>
        </Alert>
      </div>
    );
  }

  if (!data?.data) {
    return null;
  }

  const event = data.data;
  const daysUntilExpiry = differenceInDays(parseISO(event.expiresAt), new Date());
  const isExpiringSoon = daysUntilExpiry <= 7 && daysUntilExpiry > 0;

  return (
    <div className="container mx-auto p-6">
      {/* Header */}
      <div className="mb-6">
        <Button
          onClick={() => navigate("/events")}
          variant="ghost"
          size="sm"
          className="mb-4"
        >
          <ArrowLeft className="mr-2 size-4" />
          Back to Events
        </Button>

        <h1 className="text-3xl font-bold">{event.name}</h1>
        <p className="text-muted-foreground">
          Created {formatDistanceToNow(parseISO(event.createdAt))} ago
        </p>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="details">
        <TabsList>
          <TabsTrigger value="details">Details</TabsTrigger>
          <TabsTrigger value="photos" disabled>
            Photos
          </TabsTrigger>
          <TabsTrigger value="faces" disabled>
            Faces
          </TabsTrigger>
        </TabsList>

        {/* Details Tab */}
        <TabsContent value="details" className="space-y-6">
          {/* Event Information */}
          <Card>
            <CardHeader>
              <CardTitle>Event Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Start Date */}
              {event.startDate && (
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Start Date</label>
                  <p>{new Date(event.startDate).toLocaleString()}</p>
                </div>
              )}

              {/* End Date */}
              {event.endDate && (
                <div>
                  <label className="text-sm font-medium text-muted-foreground">End Date</label>
                  <p>{new Date(event.endDate).toLocaleString()}</p>
                </div>
              )}

              {/* Expiry */}
              <div>
                <label className="text-sm font-medium text-muted-foreground">Expires</label>
                <p>
                  {formatDistanceToNow(parseISO(event.expiresAt))} from now
                  {isExpiringSoon && (
                    <span className="ml-2 text-sm text-destructive">
                      (⚠️ Expiring in {daysUntilExpiry} days)
                    </span>
                  )}
                </p>
              </div>
            </CardContent>
          </Card>

          {/* QR Code & Links */}
          <EventQRDisplay event={event} />
        </TabsContent>

        {/* Photos Tab (Placeholder) */}
        <TabsContent value="photos">
          <Card>
            <CardContent className="py-12">
              <div className="flex flex-col items-center gap-4 text-center">
                <Calendar className="size-12 text-muted-foreground" />
                <div>
                  <h3 className="text-lg font-semibold">Photos Coming Soon</h3>
                  <p className="text-sm text-muted-foreground">
                    This feature will be available in a future update
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Faces Tab (Placeholder) */}
        <TabsContent value="faces">
          <Card>
            <CardContent className="py-12">
              <div className="flex flex-col items-center gap-4 text-center">
                <Calendar className="size-12 text-muted-foreground" />
                <div>
                  <h3 className="text-lg font-semibold">Face Recognition Coming Soon</h3>
                  <p className="text-sm text-muted-foreground">
                    This feature will be available in a future update
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
