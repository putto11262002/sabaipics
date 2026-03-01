import { useState, useCallback } from 'react';
import { toast } from 'sonner';
import { Button } from '@/shared/components/ui/button';
import { Spinner } from '@/shared/components/ui/spinner';
import { type SearchResult } from '../lib/api';
import { th } from '../lib/i18n';
import { useLineAuthUrl } from '@/shared/hooks/rq/line/use-line-auth-url';
import { usePendingLineDelivery } from '@/shared/hooks/rq/line/use-pending-line-delivery';

interface LineDeliveryButtonProps {
  eventId: string;
  searchId: string;
  searchResult: SearchResult;
  selectedIds: Set<string>;
}

const LINE_GREEN = '#06C755';

function LineIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M19.365 9.863c.349 0 .63.285.63.631 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63h2.386c.346 0 .627.285.627.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zm-3.855 3.016c0 .27-.174.51-.432.596-.064.021-.133.031-.199.031-.211 0-.391-.09-.51-.25l-2.443-3.317v2.94c0 .344-.279.629-.631.629-.346 0-.626-.285-.626-.629V8.108c0-.27.173-.51.43-.595.06-.023.136-.033.194-.033.195 0 .375.104.495.254l2.462 3.33V8.108c0-.345.282-.63.63-.63.345 0 .63.285.63.63v4.771zm-5.741 0c0 .344-.282.629-.631.629-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63.346 0 .628.285.628.63v4.771zm-2.466.629H4.917c-.345 0-.63-.285-.63-.629V8.108c0-.345.285-.63.63-.63.348 0 .63.285.63.63v4.141h1.756c.348 0 .629.283.629.63 0 .344-.282.629-.629.629M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314" />
    </svg>
  );
}

export function LineDeliveryButton({ eventId, searchId, searchResult, selectedIds }: LineDeliveryButtonProps) {
  const [isRedirecting, setIsRedirecting] = useState(false);
  const hasSelection = selectedIds.size > 0;
  const { mutateAsync: getAuthUrl } = useLineAuthUrl();
  const { mutateAsync: createPending } = usePendingLineDelivery();

  const handleClick = useCallback(async () => {
    if (!hasSelection) {
      toast.warning(th.results.lineSelectHint);
      return;
    }

    setIsRedirecting(true);
    try {
      const photoIds = Array.from(selectedIds);

      // 1. Create pending delivery record on server
      await createPending({ eventId, searchId, photoIds });

      // 2. Get auth URL and redirect
      const authUrl = await getAuthUrl({ eventId, searchId });
      window.location.href = authUrl;
    } catch {
      toast.error('ไม่สามารถเชื่อมต่อ LINE ได้', {
        description: 'กรุณาลองอีกครั้ง',
      });
      setIsRedirecting(false);
    }
  }, [eventId, searchId, selectedIds, hasSelection, createPending, getAuthUrl]);

  return (
    <Button
      size="icon"
      className="size-12 rounded-full shadow-lg text-white opacity-100"
      style={{ backgroundColor: LINE_GREEN }}
      onClick={handleClick}
      disabled={isRedirecting || !hasSelection}
    >
      {isRedirecting ? (
        <Spinner className="size-5" />
      ) : (
        <LineIcon className="size-5" />
      )}
    </Button>
  );
}
