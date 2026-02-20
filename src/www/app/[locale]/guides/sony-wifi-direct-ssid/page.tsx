import { setRequestLocale } from 'next-intl/server';

import { Footer } from '@/components/landing/footer';
import { SiteNav } from '@/components/site-nav';
import { Link } from '@/i18n/navigation';
import { Separator } from '@/shared/components/ui/separator';

type Props = {
  params: Promise<{ locale: string }>;
};

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

export default async function SonyWifiDirectSsidGuidePage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <div>
      <SiteNav />

      <main className="mx-auto max-w-4xl px-4 py-12">
        <header className="space-y-3">
          <p className="text-sm text-muted-foreground">Guide</p>
          <h1 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
            เชื่อมต่อกล้อง Sony กับ FrameFast iOS ผ่าน Wi‑Fi Direct
          </h1>
          <p className="text-pretty text-sm leading-6 text-muted-foreground">
            ใช้กับรุ่นที่ใน iPhone/iPad จะเห็น Wi‑Fi ชื่อขึ้นต้นด้วย <InlineCode>DIRECT-</InlineCode> และกล้องสามารถแสดง{' '}
            <InlineCode>SSID</InlineCode> กับ <InlineCode>รหัสผ่าน</InlineCode> ได้
            (ขั้นตอนอ้างอิงจากคู่มือ Sony “การควบคุมกล้องโดยใช้ iPhone หรือ iPad (SSID)”).
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
                href="https://helpguide.sony.net/ilc/1930/v1/th/index.html"
                target="_blank"
                rel="noreferrer"
                className="underline underline-offset-4 decoration-border hover:text-foreground hover:decoration-foreground"
              >
                Sony Alpha 7R IV (ILCE-7RIV)
              </a>
            </li>
            <li>
              <a
                href="https://helpguide.sony.net/ilc/1720/v1/th/index.html"
                target="_blank"
                rel="noreferrer"
                className="underline underline-offset-4 decoration-border hover:text-foreground hover:decoration-foreground"
              >
                Sony Alpha 7 III (ILCE-7M3)
              </a>
            </li>
            <li>
              <a
                href="https://helpguide.sony.net/ilc/1710/v1/th/index.html"
                target="_blank"
                rel="noreferrer"
                className="underline underline-offset-4 decoration-border hover:text-foreground hover:decoration-foreground"
              >
                Sony Alpha 7R III (ILCE-7RM3)
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
            <li>วาง iPhone/iPad ไว้ใกล้กล้อง (ต้องสลับดู SSID และรหัสผ่านจากหน้าจอกล้อง)</li>
          </ul>
        </section>

        <Separator className="my-8" />

        <section className="space-y-8">
          <h2 className="text-xl font-semibold">ขั้นตอนการเชื่อมต่อ</h2>

          <div className="space-y-3">
            <h3 className="text-base font-semibold">1) ทำบนกล้อง Sony</h3>
            <ol className="list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
              <li>
                เปิดโหมดควบคุมด้วยสมาร์ทโฟน: <InlineCode>MENU → (เครือข่าย) → [ควบคุมด้วยสมาร์ทโฟน]</InlineCode> แล้วตั้งเป็น{' '}
                <InlineCode>เปิด</InlineCode>
              </li>
              <li>
                เลือก <InlineCode>[การเชื่อมต่อ]</InlineCode> เพื่อแสดงหน้าจอเชื่อมต่อ (โดยปกติจะขึ้น QR code)
              </li>
              <li>
                กดปุ่ม <InlineCode>(ลบ)</InlineCode> บนกล้อง เพื่อให้แสดง <InlineCode>SSID</InlineCode> และ <InlineCode>รหัสผ่าน</InlineCode>
              </li>
            </ol>
            <GuideImage
              alt="Placeholder: Sony smartphone control connection screen"
              src="/guides/sony-wifi-direct-ssid/camera-smartphone-control-connection.svg"
            />
            <p className="text-xs text-muted-foreground">
              Sony manual source:{' '}
              <a
                className="text-foreground underline underline-offset-4 decoration-border hover:decoration-foreground"
                href="https://helpguide.sony.net/ilc/1930/v1/th/contents/TP0002723650.html"
                target="_blank"
                rel="noreferrer"
              >
                ILCE-7RM4: การควบคุมกล้องโดยใช้ iPhone หรือ iPad (SSID)
              </a>
              .
            </p>
          </div>

          <Separator />

          <div className="space-y-3">
            <h3 className="text-base font-semibold">2) ทำบน iPhone/iPad</h3>
            <p className="text-sm text-muted-foreground">
              เชื่อม Wi‑Fi ไปที่ SSID ของกล้อง (มักขึ้นต้นด้วย <InlineCode>DIRECT-</InlineCode>)
            </p>
            <ol className="list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
              <li>เปิด Settings ของ iOS → Wi‑Fi</li>
              <li>
                เลือก Wi‑Fi ตามที่กล้องแสดง (ตัวอย่าง: <InlineCode>DIRECT-xxxx: xxxx</InlineCode>)
              </li>
              <li>ใส่รหัสผ่านตามที่กล้องแสดง</li>
            </ol>
            <GuideImage
              alt="Placeholder: iOS join DIRECT- SSID"
              src="/guides/sony-wifi-direct-ssid/ios-wifi-join-direct.svg"
            />
          </div>

          <Separator />

          <div className="space-y-3">
            <h3 className="text-base font-semibold">3) ทำในแอป FrameFast iOS</h3>
            <p className="text-sm text-muted-foreground">
              คู่มือ Sony มักบอกให้เปิด PlayMemories Mobile/Imaging Edge Mobile; สำหรับเราให้กลับมาเปิด FrameFast iOS แทน
            </p>
            <ol className="list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
              <li>กลับเข้าแอป FrameFast iOS</li>
              <li>เริ่มขั้นตอน “Connect Camera”</li>
            </ol>
          </div>
        </section>

        <Separator className="my-8" />

        <section className="space-y-4">
          <h2 className="text-xl font-semibold">แก้ปัญหาเบื้องต้น</h2>
          <div className="space-y-4 text-sm text-muted-foreground">
            <div>
              <p className="font-medium text-foreground">Wi‑Fi ต่อไม่เสถียร</p>
              <ul className="mt-1 list-disc space-y-1 pl-5">
                <li>คู่มือ Sony ระบุว่า Bluetooth และ Wi‑Fi 2.4GHz อาจรบกวนกันได้: ลองปิด Bluetooth บนโทรศัพท์ชั่วคราว</li>
              </ul>
            </div>
            <div>
              <p className="font-medium text-foreground">หา SSID ไม่เจอ</p>
              <ul className="mt-1 list-disc space-y-1 pl-5">
                <li>กลับไปที่หน้าจอเชื่อมต่อบนกล้อง แล้วกดปุ่ม (ลบ) เพื่อแสดง SSID/รหัสผ่านอีกครั้ง</li>
                <li>รอ 10–20 วินาที แล้วลองสแกน Wi‑Fi ใหม่</li>
              </ul>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}

