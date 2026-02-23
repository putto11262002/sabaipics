'use client';

import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

type Announcement = {
  id: string;
  title: string;
  subtitle: string | null;
  content: string;
  tag: string | null;
  publishedAt: string | null;
};

const TAG_COLORS: Record<string, string> = {
  feature: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  improvement: 'bg-green-500/10 text-green-600 dark:text-green-400',
  fix: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  maintenance: 'bg-red-500/10 text-red-600 dark:text-red-400',
};

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export function AnnouncementList({ announcements }: { announcements: Announcement[] }) {
  return (
    <div className="space-y-12">
      {announcements.map((item) => (
        <article key={item.id} className="border-b pb-10 last:border-0">
          <div className="flex items-center gap-3 mb-3">
            {item.tag && (
              <span
                className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${TAG_COLORS[item.tag] ?? 'bg-gray-100 text-gray-700'}`}
              >
                {item.tag}
              </span>
            )}
            {item.publishedAt && (
              <time className="text-sm text-muted-foreground">
                {formatDate(item.publishedAt)}
              </time>
            )}
          </div>

          <h2 className="text-xl font-semibold tracking-tight mb-1">
            {item.title}
          </h2>

          {item.subtitle && (
            <p className="text-muted-foreground mb-4">{item.subtitle}</p>
          )}

          <div className="prose prose-neutral dark:prose-invert max-w-none prose-headings:scroll-mt-24 prose-a:text-primary prose-p:leading-relaxed">
            <Markdown remarkPlugins={[remarkGfm]}>{item.content}</Markdown>
          </div>
        </article>
      ))}
    </div>
  );
}
