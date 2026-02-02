import { BentoFeatures } from '@/components/landing/v1/sections/bento-features';
import { FlowMap } from '@/components/landing/v1/sections/flow-map';
import { PageAnchors } from '@/components/landing/shared/page-anchors';
import { UploadWays } from '@/components/landing/shared/upload-ways';

export function LandingV1() {
  return (
    <>
      <FlowMap />
      <BentoFeatures />
      <UploadWays />
      <PageAnchors />
    </>
  );
}
