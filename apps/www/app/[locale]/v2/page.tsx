import { LandingHero } from '@/components/landing/hero';
import { LandingV2 } from '@/components/landing/v2/landing-v2';
import { SiteNav } from '@/components/site-nav';

export default function Page() {
  return (
    <div>
      <SiteNav />
      <main>
        <LandingHero />
        <LandingV2 />
      </main>
    </div>
  );
}
