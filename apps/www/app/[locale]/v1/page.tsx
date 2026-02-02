import { LandingHero } from '@/components/landing/hero';
import { LandingV1 } from '@/components/landing/v1/landing-v1';
import { SiteNav } from '@/components/site-nav';

export default function Page() {
  return (
    <div>
      <SiteNav />
      <main>
        <LandingHero />
        <LandingV1 />
      </main>
    </div>
  );
}
