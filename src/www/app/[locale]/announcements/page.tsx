import { setRequestLocale } from 'next-intl/server';
import { SiteNav } from '@/components/site-nav';
import { Footer } from '@/components/landing/footer';
import { AnnouncementList } from './announcement-list';

type Props = {
  params: Promise<{ locale: string }>;
};

type Announcement = {
  id: string;
  title: string;
  subtitle: string | null;
  content: string;
  tag: string | null;
  publishedAt: string | null;
};

async function getAnnouncements(): Promise<Announcement[]> {
  const apiUrl = process.env.API_URL;
  if (!apiUrl) return [];

  try {
    const res = await fetch(`${apiUrl}/announcements?limit=50`, {
      next: { revalidate: 60 },
    });
    if (!res.ok) return [];
    const json = await res.json();
    return json.data ?? [];
  } catch {
    return [];
  }
}

export default async function AnnouncementsPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  const announcements = await getAnnouncements();

  return (
    <div>
      <SiteNav />
      <main className="mx-auto max-w-5xl px-4 py-12">
        <h1 className="text-3xl font-bold tracking-tight mb-2">Announcements</h1>
        <p className="text-muted-foreground mb-8">
          Product updates, new features, and improvements.
        </p>

        {announcements.length === 0 ? (
          <p className="text-muted-foreground text-center py-16">
            No announcements yet. Check back soon!
          </p>
        ) : (
          <AnnouncementList announcements={announcements} />
        )}
      </main>
      <Footer />
    </div>
  );
}
