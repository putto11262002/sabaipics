import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@sabaipics/ui/components/card";
import { formatDistanceToNow, parseISO } from "date-fns";
import type { Event } from "../../hooks/events/useEvents";

interface EventCardProps {
  event: Event;
  onClick?: () => void;
}

export function EventCard({ event, onClick }: EventCardProps) {
  return (
    <Card
      className="cursor-pointer transition-colors hover:bg-muted/50"
      onClick={onClick}
    >
      <CardHeader>
        <CardDescription className="text-xs">
          Created {formatDistanceToNow(parseISO(event.createdAt))} ago
        </CardDescription>
        <CardTitle className="text-xl">{event.name}</CardTitle>
      </CardHeader>

      {event.qrCodeUrl && (
        <CardContent className="flex justify-center">
          <img
            src={event.qrCodeUrl}
            alt={`QR code for ${event.name}`}
            className="size-20 object-contain"
            onError={(e) => {
              // Fallback if QR image fails to load
              e.currentTarget.style.display = "none";
            }}
          />
        </CardContent>
      )}

      <CardFooter className="flex-col items-start gap-1.5 text-sm">
        {event.startDate && (
          <div className="text-muted-foreground">
            Starts: {new Date(event.startDate).toLocaleDateString()}
          </div>
        )}
        <div className="text-muted-foreground">
          Expires {formatDistanceToNow(parseISO(event.expiresAt))} from now
        </div>
        <div className="flex gap-3 text-sm">
          <span className="text-muted-foreground">
            Access Code: <span className="font-mono font-semibold text-foreground">{event.accessCode}</span>
          </span>
        </div>
      </CardFooter>
    </Card>
  );
}
