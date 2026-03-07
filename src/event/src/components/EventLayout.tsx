import { useState } from 'react';
import { Outlet, useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { getEventPublic } from '../lib/api';

export type EventLayoutContext = {
  setHideBanner: (hide: boolean) => void;
};

export function EventLayout() {
  const { eventId } = useParams<{ eventId: string }>();
  const [hideBanner, setHideBanner] = useState(false);

  const { data: event } = useQuery({
    queryKey: ['event', eventId, 'public'],
    queryFn: () => getEventPublic(eventId!),
    enabled: !!eventId,
    staleTime: 5 * 60_000,
  });

  return (
    <div className="flex h-dvh flex-col bg-background">
      {!hideBanner && event?.name && (
        <div className="shrink-0 px-4 py-2 text-center">
          <p className="text-base font-medium text-primary">{event.name}</p>
        </div>
      )}
      <Outlet context={{ setHideBanner } satisfies EventLayoutContext} />
    </div>
  );
}
