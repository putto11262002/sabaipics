import { EventStrip } from '@/components/landing/v2/sections/event-strip';
import { UiShowcase } from '@/components/landing/v2/sections/ui-showcase';
import { PageAnchors } from '@/components/landing/shared/page-anchors';
import { UploadWays } from '@/components/landing/shared/upload-ways';

export function LandingV2() {
  return (
    <>
      <EventStrip />
      <UiShowcase />
      <UploadWays />
      <PageAnchors />
    </>
  );
}
