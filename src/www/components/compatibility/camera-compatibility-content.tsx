'use client';

import Link from 'next/link';
import { useState } from 'react';

import {
  cameraCompatibilityData,
  sonyCameraCompatibilityData,
  nikonCameraCompatibilityData,
  type BrandCompatibility,
  type CompatibilityStatus,
} from '@/lib/camera-compatibility';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shared/components/ui/tabs';

type BrandState = 'ready' | 'comingSoon';

type BrandTab = {
  id: string;
  name: string;
  state: BrandState;
  description: string;
  details?: string[];
  data?: BrandCompatibility;
};

const STATUS_STYLES: Record<CompatibilityStatus, string> = {
  Verified: 'border-success/35 bg-success/10 text-success',
  Expected: 'border-info/35 bg-info/10 text-info',
  Unverified: 'border-warning/35 bg-warning/10 text-warning',
};

const BRAND_TABS: BrandTab[] = [
  {
    id: 'canon',
    name: 'Canon',
    state: 'ready',
    description:
      'Canon models with WiFi connectivity and known PTP/IP behavior. We separate verified and expected models where evidence differs.',
    data: cameraCompatibilityData,
  },
  {
    id: 'sony',
    name: 'Sony',
    state: 'ready',
    description:
      'Sony compatibility is actively shipping for validated models and expanding across the current ILCE range based on research and field validation.',
    data: sonyCameraCompatibilityData,
  },
  {
    id: 'nikon',
    name: 'Nikon',
    state: 'ready',
    description:
      'Nikon uses Nikon_GetEvent polling in app-side eventing; Z6 is validated and additional models are in expected rollout order.',
    data: nikonCameraCompatibilityData,
  },
];

function parseSourceLinks(source: string) {
  const regex = /\[([^\]]+)\]\(([^)]+)\)/g;
  const nodes: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let linkIndex = 0;

  while ((match = regex.exec(source)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(source.slice(lastIndex, match.index));
    }

    nodes.push(
      <Link
        key={`source-link-${linkIndex++}`}
        href={match[2]}
        target="_blank"
        rel="noopener noreferrer"
        className="text-muted-foreground underline decoration-muted-foreground/40 underline-offset-2 hover:text-foreground/80"
      >
        {match[1]}
      </Link>,
    );

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < source.length) {
    nodes.push(source.slice(lastIndex));
  }

  if (!nodes.length) {
    return source;
  }

  return nodes.map((node, index) => <span key={`source-${index}`}>{node}</span>);
}

export function CameraCompatibilityContent() {
  const [activeBrandId, setActiveBrandId] = useState<string>('canon');
  const activeBrand = BRAND_TABS.find((brand) => brand.id === activeBrandId) ?? BRAND_TABS[0];

  return (
    <main className="mx-auto max-w-7xl px-4 py-14 sm:py-16">
      <section className="space-y-3">
        <h1 className="text-3xl font-semibold tracking-tight">
          FrameFast iOS Mobile Compatibility List
        </h1>
        <p className="max-w-3xl text-muted-foreground">
          Canon, Sony, and Nikon camera compatibility for Studio WiFi/remote capture workflows.
        </p>

        <Tabs
          value={activeBrandId}
          onValueChange={(value) => setActiveBrandId(value)}
          className="mt-6"
          aria-label="Camera brand filter"
        >
          <TabsList variant="line" className="flex flex-wrap gap-2">
            {BRAND_TABS.map((brand) => (
              <TabsTrigger key={brand.id} value={brand.id}>
                {brand.name}
              </TabsTrigger>
            ))}
          </TabsList>
          {BRAND_TABS.map((brand) => (
            <TabsContent key={brand.id} value={brand.id} className="mt-8">
              {brand.state === 'comingSoon' ? (
                <section className="rounded-2xl border border-border bg-muted/30 p-6">
                  <h2 className="text-xl font-semibold">{brand.name} compatibility coming soon</h2>
                  <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-muted-foreground">
                    {(brand.details ?? []).map((detail) => (
                      <li key={detail}>{detail}</li>
                    ))}
                  </ul>
                </section>
              ) : (
                <section className="space-y-8">
                  {brand.data?.sections.map((section) => (
                    <article key={section.title} className="space-y-4">
                      {section.categories.map((category) => (
                        <div key={category.title} className="space-y-3">
                          <h4 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
                            {category.title}
                          </h4>
                          <div className="overflow-x-auto rounded-xl border border-border">
                            <table className="table-fixed min-w-[840px] w-full text-sm">
                              <thead>
                                <tr className="bg-muted/30 text-left text-xs uppercase tracking-wide text-muted-foreground">
                                  <th className="w-[35%] px-4 py-3 font-medium">Model</th>
                                  <th className="w-20 px-4 py-3 font-medium">Year</th>
                                  <th className="w-40 px-4 py-3 font-medium">Processor</th>
                                  <th className="w-44 px-4 py-3 font-medium">Wi-Fi</th>
                                  <th className="w-28 px-4 py-3 font-medium">Status</th>
                                  <th className="w-[31%] px-4 py-3 font-medium">Source</th>
                                </tr>
                              </thead>
                              <tbody>
                                {category.rows.map((row) => (
                                  <tr
                                    key={`${section.title}-${category.title}-${row.model}`}
                                    className="border-t border-border/80"
                                  >
                                    <td className="px-4 py-3 align-top font-medium">{row.model}</td>
                                    <td className="px-4 py-3 align-top text-muted-foreground">
                                      {row.year}
                                    </td>
                                    <td className="px-4 py-3 align-top text-muted-foreground">
                                      {row.processor}
                                    </td>
                                    <td className="px-4 py-3 align-top text-muted-foreground">
                                      {row.wifi}
                                    </td>
                                    <td className="px-4 py-3 align-top">
                                      <span
                                        className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${
                                          STATUS_STYLES[row.status]
                                        }`}
                                      >
                                        {row.status}
                                      </span>
                                    </td>
                                    <td className="px-4 py-3 align-top text-muted-foreground text-xs leading-relaxed">
                                      {parseSourceLinks(row.source)}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      ))}
                    </article>
                  ))}
                </section>
              )}
            </TabsContent>
          ))}
        </Tabs>
      </section>
    </main>
  );
}
