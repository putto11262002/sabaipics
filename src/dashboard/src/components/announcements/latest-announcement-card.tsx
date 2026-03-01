import { useState } from 'react';
import { Megaphone, X } from 'lucide-react';
import { useLatestAnnouncement } from '../../hooks/announcements/use-latest-announcement';

const STORAGE_KEY = 'dismissed-announcement-id';

const TAG_COLORS: Record<string, string> = {
  feature: 'text-info',
  improvement: 'text-success',
  fix: 'text-warning',
  maintenance: 'text-destructive',
};

export function LatestAnnouncementBanner() {
  const { data } = useLatestAnnouncement();
  const announcement = data?.data;
  const [dismissedId, setDismissedId] = useState<string | null>(null);

  if (!announcement) return null;

  // Check localStorage reactively on every render when announcement changes
  const isPersistedDismissed = localStorage.getItem(STORAGE_KEY) === announcement.id;
  if (isPersistedDismissed || dismissedId === announcement.id) return null;

  const wwwUrl = import.meta.env.VITE_WWW_URL || 'https://framefast.io';

  const handleDismiss = () => {
    localStorage.setItem(STORAGE_KEY, announcement.id);
    setDismissedId(announcement.id);
  };

  return (
    <div className="flex items-center gap-2 rounded-md border-primary/30 bg-primary/10 px-3 py-2 text-sm text-primary backdrop-blur-md">
      <Megaphone className="size-3.5 shrink-0" />
      {announcement.tag && (
        <span className="text-xs font-medium opacity-80">
          {announcement.tag}
        </span>
      )}
      <a
        href={`${wwwUrl}/announcements`}
        target="_blank"
        rel="noopener noreferrer"
        className="truncate font-medium underline underline-offset-2 hover:opacity-80"
      >
        {announcement.title}
      </a>
      {announcement.subtitle && (
        <span className="hidden truncate opacity-70 sm:inline">
          — {announcement.subtitle}
        </span>
      )}
      <button
        type="button"
        onClick={handleDismiss}
        className="ml-auto shrink-0 rounded p-0.5 opacity-60 hover:opacity-100"
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}
