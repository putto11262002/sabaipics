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
  // Using <img> for SVGs is simple and avoids Next Image SVG quirks.
  return (
    <img
      alt={alt}
      src={src}
      className="mt-3 w-full rounded-xl border border-border"
      loading="lazy"
    />
  );
}

export default async function CanonRemoteControlEosUtilityGuidePage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <div>
      <SiteNav />

      <main className="mx-auto max-w-4xl px-4 py-12">
        <header className="space-y-3">
          <p className="text-sm text-muted-foreground">Guide</p>
          <h1 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
            เชื่อมต่อกล้อง Canon กับ FrameFast iOS ผ่าน Remote control (EOS Utility)
          </h1>
          <p className="text-pretty text-sm leading-6 text-muted-foreground">
            ใช้กับ Canon ที่ในเมนู Wireless/Wi‑Fi มีคำว่า <InlineCode>Wi-Fi/Bluetooth connection</InlineCode>{' '}
            และ <InlineCode>Remote control (EOS Utility)</InlineCode>.
          </p>
          <p className="text-sm text-muted-foreground">
            ถ้าเมนูกล้องเป็น <InlineCode>Connect to EOS Utility</InlineCode> ให้ใช้{' '}
            <Link
              href="/guides/canon-eos-utility"
              className="text-foreground underline underline-offset-4 decoration-border hover:decoration-foreground"
            >
              คู่มือ Group 1
            </Link>
            .
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
                href="https://cam.start.canon/en/C003/manual/html/index.html"
                target="_blank"
                rel="noreferrer"
                className="underline underline-offset-4 decoration-border hover:text-foreground hover:decoration-foreground"
              >
                EOS R5
              </a>
            </li>
            <li>
              <a
                href="https://cam.start.canon/en/C004/manual/html/index.html"
                target="_blank"
                rel="noreferrer"
                className="underline underline-offset-4 decoration-border hover:text-foreground hover:decoration-foreground"
              >
                EOS R6
              </a>
            </li>
            <li>
              <a
                href="https://cam.start.canon/en/C005/manual/html/index.html"
                target="_blank"
                rel="noreferrer"
                className="underline underline-offset-4 decoration-border hover:text-foreground hover:decoration-foreground"
              >
                EOS R7
              </a>
            </li>
            <li>
              <a
                href="https://cam.start.canon/en/C006/manual/html/index.html"
                target="_blank"
                rel="noreferrer"
                className="underline underline-offset-4 decoration-border hover:text-foreground hover:decoration-foreground"
              >
                EOS R10
              </a>
            </li>
            <li>
              <a
                href="https://cam.start.canon/en/C015/manual/html/index.html"
                target="_blank"
                rel="noreferrer"
                className="underline underline-offset-4 decoration-border hover:text-foreground hover:decoration-foreground"
              >
                EOS R100
              </a>
            </li>
            <li>
              <a
                href="https://cam.start.canon/en/C002/manual/html/index.html"
                target="_blank"
                rel="noreferrer"
                className="underline underline-offset-4 decoration-border hover:text-foreground hover:decoration-foreground"
              >
                EOS Rebel T8i / 850D
              </a>
            </li>
            <li>
              <a
                href="https://cam.start.canon/en/C007/manual/html/index.html"
                target="_blank"
                rel="noreferrer"
                className="underline underline-offset-4 decoration-border hover:text-foreground hover:decoration-foreground"
              >
                EOS M50 Mark II
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
            <li>เตรียม iPhone/iPad ไว้ใกล้กล้อง (ต้องดู SSID และ Password จากหน้าจอกล้อง)</li>
          </ul>
        </section>

        <Separator className="my-8" />

        <section className="space-y-8">
          <h2 className="text-xl font-semibold">ขั้นตอนการเชื่อมต่อ</h2>

          <div className="space-y-3">
            <h3 className="text-base font-semibold">1) ทำบนกล้อง Canon</h3>
            <ol className="list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
              <li>
                ไปที่เมนู Wireless/Wi‑Fi แล้วเลือก <InlineCode>Wi-Fi/Bluetooth connection</InlineCode>
              </li>
            </ol>
            <GuideImage
              alt="Placeholder: Wi-Fi/Bluetooth connection menu"
              src="/guides/canon-remote-control-eos-utility/camera-menu-wifi-bluetooth-connection.svg"
            />
            <ol start={2} className="list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
              <li>
                เลือก <InlineCode>Remote control (EOS Utility)</InlineCode>
              </li>
            </ol>
            <GuideImage
              alt="Placeholder: Remote control (EOS Utility) selection"
              src="/guides/canon-remote-control-eos-utility/camera-menu-remote-control-eos-utility.svg"
            />
            <ol start={3} className="list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
              <li>
                เลือก <InlineCode>Add a device to connect to</InlineCode>
              </li>
              <li>
                จด/จำ <InlineCode>SSID (network name)</InlineCode> และ <InlineCode>Password</InlineCode>
              </li>
            </ol>
            <GuideImage
              alt="Placeholder: SSID (network name) and Password"
              src="/guides/canon-remote-control-eos-utility/camera-ssid-password.svg"
            />
            <p className="text-xs text-muted-foreground">
              Canon manual source:{' '}
              <a
                className="text-foreground underline underline-offset-4 decoration-border hover:decoration-foreground"
                href="https://cam.start.canon/en/C003/manual/html/UG-06_Network_0050.html#Network_0050_1"
                target="_blank"
                rel="noreferrer"
              >
                EOS R5: Connecting to a Computer via Wi-Fi → Operating the Camera Using EOS Utility
              </a>
            </p>
          </div>

          <Separator />

          <div className="space-y-3">
            <h3 className="text-base font-semibold">2) ทำบน iPhone/iPad</h3>
            <p className="text-sm text-muted-foreground">เชื่อม Wi‑Fi เข้ากับ SSID ที่กล้องแสดง</p>
            <ol className="list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
              <li>เปิด Settings ของ iOS → Wi‑Fi</li>
              <li>เลือก Wi‑Fi ที่ชื่อเดียวกับ SSID ที่แสดงบนกล้อง</li>
              <li>ใส่ Password ตามที่กล้องแสดง (ถ้าไม่ขอรหัส ให้ข้ามได้)</li>
            </ol>
            <GuideImage
              alt="Placeholder: iOS Wi-Fi join camera SSID"
              src="/guides/canon-remote-control-eos-utility/ios-wifi-join.svg"
            />
          </div>

          <Separator />

          <div className="space-y-3">
            <h3 className="text-base font-semibold">3) ทำในแอป FrameFast iOS</h3>
            <p className="text-sm text-muted-foreground">กลับเข้าแอปแล้วเริ่มขั้นตอนเชื่อมต่อกล้อง</p>
            <ol className="list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
              <li>กลับเข้าแอป FrameFast iOS</li>
              <li>เริ่มขั้นตอน “Connect Camera” (หรือขั้นตอนเชื่อมต่อกล้อง)</li>
            </ol>
          </div>
        </section>

        <Separator className="my-8" />

        <section className="space-y-4">
          <h2 className="text-xl font-semibold">แก้ปัญหาเบื้องต้น</h2>
          <div className="space-y-4 text-sm text-muted-foreground">
            <div>
              <p className="font-medium text-foreground">เจอหน้าจอประวัติ (history) แทนเมนูเลือกใหม่</p>
              <ul className="mt-1 list-disc space-y-1 pl-5">
                <li>ลองสลับหน้าจอด้วยปุ่ม/วงล้อของกล้อง แล้วเลือกเพิ่มอุปกรณ์ใหม่</li>
              </ul>
            </div>
            <div>
              <p className="font-medium text-foreground">iOS ไม่ขอ Password</p>
              <ul className="mt-1 list-disc space-y-1 pl-5">
                <li>บางรุ่นสามารถตั้งค่า Password เป็น None ได้ใน Wi‑Fi settings</li>
                <li>ถ้าต่อได้ปกติ ให้ข้ามขั้นตอนใส่รหัสได้เลย</li>
              </ul>
            </div>
            <div>
              <p className="font-medium text-foreground">หา SSID ไม่เจอ</p>
              <ul className="mt-1 list-disc space-y-1 pl-5">
                <li>รอ 10–20 วินาทีแล้วสแกนใหม่</li>
                <li>ตรวจว่ากล้องยังอยู่ในหน้า Remote control (EOS Utility)</li>
              </ul>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
