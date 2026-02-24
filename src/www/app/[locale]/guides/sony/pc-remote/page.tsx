import type { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';

import { Footer } from '@/components/landing/footer';
import { SiteNav } from '@/components/site-nav';
import { Link } from '@/i18n/navigation';
import { Separator } from '@/shared/components/ui/separator';

const PAGE_METADATA = {
  en: {
    title: 'Sony PC Remote (Imaging Edge) Setup | FrameFast',
    description:
      'Configure Sony PC Remote in Imaging Edge Desktop for tethered shooting and wireless photo transfer to FrameFast.',
  },
  th: {
    title: 'ตั้งค่า Sony PC Remote (Imaging Edge) | FrameFast',
    description:
      'กำหนดค่า Sony PC Remote ใน Imaging Edge Desktop สำหรับการถ่ายภาพแบบ tethered และถ่ายโอนภาพไร้สายไปยัง FrameFast',
  },
} as const;

type Props = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const meta = PAGE_METADATA[locale as keyof typeof PAGE_METADATA] ?? PAGE_METADATA.en;

  return {
    title: meta.title,
    description: meta.description,
    openGraph: {
      title: meta.title,
      description: meta.description,
    },
  };
}

function InlineCode({ children }: { children: string }) {
  return (
    <span className="rounded-md bg-muted px-1.5 py-0.5 text-[0.9em] font-medium text-foreground">
      {children}
    </span>
  );
}

function GuideImage({ alt, src }: { alt: string; src: string }) {
  return (
    <img
      alt={alt}
      src={src}
      className="mt-3 w-full rounded-xl border border-border"
      loading="lazy"
    />
  );
}

export default async function SonyPcRemoteGuidePage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <div>
      <SiteNav />

      <main className="mx-auto max-w-4xl px-4 py-12">
        <header className="space-y-3">
          <p className="text-sm text-muted-foreground">Guide</p>
          <h1 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
            เชื่อมต่อกล้อง Sony กับ FrameFast iOS ผ่าน PC Remote
          </h1>
          <p className="text-pretty text-sm leading-6 text-muted-foreground">
            โฟลว์นี้อิงจากคู่มือ Sony “การสั่งงานกล้องจากคอมพิวเตอร์ (ฟังก์ชั่นถ่ายแบบรีโมท)”
            และตั้งค่า <InlineCode>ตรวจสอบสิทธิ์เข้าถึง</InlineCode> เป็น{' '}
            <InlineCode>ปิด</InlineCode> เพื่อให้แอปเชื่อมต่อได้ง่ายขึ้น
            (ไม่มีการเข้ารหัส/ตรวจสอบสิทธิ์ SSH).
          </p>
          <p className="text-sm text-muted-foreground">
            ไม่แน่ใจว่ารุ่นไหน?{' '}
            <Link
              href="/guides"
              className="text-foreground underline underline-offset-4 decoration-border hover:decoration-foreground"
            >
              เริ่มจากหน้าเลือกกล้อง
            </Link>
            .
          </p>
        </header>

        <Separator className="my-8" />

        <section className="space-y-4">
          <h2 className="text-xl font-semibold">รุ่นที่ครอบคลุม</h2>
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            <li>
              <a
                href="https://helpguide.sony.net/ilc/2110/v1/th/index.html"
                target="_blank"
                rel="noreferrer"
                className="underline underline-offset-4 decoration-border hover:text-foreground hover:decoration-foreground"
              >
                Sony Alpha 7 IV (ILCE-7M4)
              </a>
            </li>
            <li>
              <a
                href="https://helpguide.sony.net/ilc/2230/v1/th/index.html"
                target="_blank"
                rel="noreferrer"
                className="underline underline-offset-4 decoration-border hover:text-foreground hover:decoration-foreground"
              >
                Sony Alpha 7R V (ILCE-7RM5)
              </a>
            </li>
          </ul>
          <p className="text-sm text-muted-foreground">
            ภาพประกอบในหน้านี้เป็น placeholder เพื่อให้วางภาพจริงทีหลัง
          </p>
        </section>

        <Separator className="my-8" />

        <section className="space-y-6">
          <h2 className="text-xl font-semibold">สิ่งที่ต้องเตรียม</h2>
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            <li>ติดตั้งแอป FrameFast iOS บน iPhone/iPad</li>
            <li>ชาร์จแบตเตอรี่กล้องให้พอ</li>
            <li>
              ให้กล้อง “ไม่เชื่อมต่อ” กับสมาร์ทโฟนอยู่ก่อน (Sony ระบุว่าถ้าเชื่อมต่ออยู่
              จะสั่งงานจากคอมพิวเตอร์ไม่ได้)
            </li>
          </ul>
        </section>

        <Separator className="my-8" />

        <section className="space-y-8">
          <h2 className="text-xl font-semibold">ขั้นตอนการเชื่อมต่อ</h2>

          <div className="space-y-3">
            <h3 className="text-base font-semibold">1) ปิด “ตรวจสอบสิทธิ์เข้าถึง” บนกล้อง</h3>
            <ol className="list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
              <li>
                ไปที่{' '}
                <InlineCode>
                  MENU → (เครือข่าย) → [ตัวเลือกเครือข่าย] → [ตั้งค่าตรวจสอบเข้าถึง]
                </InlineCode>
              </li>
              <li>
                ตั้ง <InlineCode>ตรวจสอบสิทธิ์เข้าถึง</InlineCode> เป็น <InlineCode>ปิด</InlineCode>
              </li>
            </ol>
            <GuideImage
              alt="Placeholder: Sony access authentication settings"
              src="/guides/sony/pc-remote/access-auth-off.svg"
            />
            <p className="text-xs text-muted-foreground">
              Sony manual source:{' '}
              <a
                className="text-foreground underline underline-offset-4 decoration-border hover:decoration-foreground"
                href="https://helpguide.sony.net/ilc/2110/v1/th/contents/TP1001106268.html"
                target="_blank"
                rel="noreferrer"
              >
                ILCE-7M4: ตั้งค่าตรวจสอบเข้าถึง
              </a>
            </p>
          </div>

          <Separator />

          <div className="space-y-3">
            <h3 className="text-base font-semibold">2) เปิด “ถ่ายภาพแบบรีโมท” (PC Remote)</h3>
            <ol className="list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
              <li>
                ตั้ง Wi‑Fi ให้พร้อมใช้งาน:{' '}
                <InlineCode>MENU →(เครือข่าย) → [Wi-Fi] → [เชื่อมต่อ Wi-Fi] → [เปิด]</InlineCode>
              </li>
              <li>
                เปิดโหมดรีโมท:{' '}
                <InlineCode>
                  MENU →(เครือข่าย) → [ต่อ/ถ่ายรีโมท] → [ฟังก์ชั่นถ่ายแบบรีโมท] → [ถ่ายภาพแบบรีโมท]
                  → [เปิด]
                </InlineCode>
              </li>
              <li>
                เปิดข้อมูล Wi‑Fi Direct เพื่อดู <InlineCode>SSID</InlineCode> และ{' '}
                <InlineCode>รหัสผ่าน</InlineCode>:{' '}
                <InlineCode>
                  MENU → (เครือข่าย) → [ต่อ/ถ่ายรีโมท] → [ฟังก์ชั่นถ่ายแบบรีโมท] → [ข้อมูล Wi-Fi
                  Direct]
                </InlineCode>
              </li>
            </ol>
            <GuideImage
              alt="Placeholder: Sony PC Remote enable + Wi-Fi Direct info"
              src="/guides/sony/pc-remote/pc-remote-wifi-direct.svg"
            />
            <p className="text-xs text-muted-foreground">
              Sony manual source:{' '}
              <a
                className="text-foreground underline underline-offset-4 decoration-border hover:decoration-foreground"
                href="https://helpguide.sony.net/ilc/2110/v1/th/contents/TP1000657376.html"
                target="_blank"
                rel="noreferrer"
              >
                ILCE-7M4: การสั่งงานกล้องจากคอมพิวเตอร์ (ฟังก์ชั่นถ่ายแบบรีโมท)
              </a>
            </p>
          </div>

          <Separator />

          <div className="space-y-3">
            <h3 className="text-base font-semibold">3) ทำบน iPhone/iPad</h3>
            <p className="text-sm text-muted-foreground">
              เชื่อม Wi‑Fi เข้ากับ SSID ที่กล้องแสดง (Wi‑Fi Direct)
            </p>
            <ol className="list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
              <li>เปิด Settings ของ iOS → Wi‑Fi</li>
              <li>เลือก Wi‑Fi ตาม SSID ที่กล้องแสดง</li>
              <li>ใส่รหัสผ่านตามที่กล้องแสดง</li>
            </ol>
            <GuideImage
              alt="Placeholder: iOS join Sony Wi-Fi Direct SSID"
              src="/guides/sony/pc-remote/ios-wifi-join.svg"
            />
          </div>

          <Separator />

          <div className="space-y-3">
            <h3 className="text-base font-semibold">4) ทำในแอป FrameFast iOS</h3>
            <ol className="list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
              <li>กลับเข้าแอป FrameFast iOS</li>
              <li>เริ่มขั้นตอน “Connect Camera”</li>
            </ol>
          </div>
        </section>

        <Separator className="my-8" />

        <section className="space-y-4">
          <h2 className="text-xl font-semibold">ข้อควรระวังเรื่องความปลอดภัย</h2>
          <p className="text-sm text-muted-foreground">
            การตั้งค่า <InlineCode>ตรวจสอบสิทธิ์เข้าถึง</InlineCode> เป็น{' '}
            <InlineCode>ปิด</InlineCode> หมายถึงการสื่อสารจะไม่ทำ access authentication / SSH
            encryption (Sony ระบุว่าอาจเสี่ยงถูกดักข้อมูลหรือเข้าถึงโดยบุคคลอื่นได้)
            ให้ใช้ในสถานที่ที่ควบคุมได้ และเปลี่ยนกลับเป็น <InlineCode>เปิด</InlineCode>{' '}
            เมื่อไม่ใช้งาน
          </p>
        </section>

        <Separator className="my-8" />

        <section className="space-y-4">
          <h2 className="text-xl font-semibold">แก้ปัญหาเบื้องต้น</h2>
          <div className="space-y-4 text-sm text-muted-foreground">
            <div>
              <p className="font-medium text-foreground">แอปขึ้น auth error</p>
              <ul className="mt-1 list-disc space-y-1 pl-5">
                <li>
                  เช็คว่า <InlineCode>ตรวจสอบสิทธิ์เข้าถึง</InlineCode> ตั้งเป็น{' '}
                  <InlineCode>ปิด</InlineCode> แล้ว
                </li>
                <li>ลองปิด/เปิด “ถ่ายภาพแบบรีโมท” ใหม่ แล้วเชื่อม Wi‑Fi ใหม่</li>
              </ul>
            </div>
            <div>
              <p className="font-medium text-foreground">หา SSID ไม่เจอ</p>
              <ul className="mt-1 list-disc space-y-1 pl-5">
                <li>
                  เปิดหน้า <InlineCode>ข้อมูล Wi‑Fi Direct</InlineCode> บนกล้องค้างไว้ แล้วสแกน
                  Wi‑Fi บน iOS ใหม่
                </li>
              </ul>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
