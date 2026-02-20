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

export default async function CanonEosUtilityGuidePage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <div>
      <SiteNav />

      <main className="mx-auto max-w-4xl px-4 py-12">
        <header className="space-y-3">
          <p className="text-sm text-muted-foreground">Guide</p>
          <h1 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
            เชื่อมต่อกล้อง Canon กับ FrameFast iOS ผ่าน EOS Utility
          </h1>
          <p className="text-pretty text-sm leading-6 text-muted-foreground">
            ใช้กับ Canon EOS R-series “Group 1” ที่ในเมนูกล้องมีคำว่า{' '}
            <InlineCode>Connect to EOS Utility</InlineCode> และ{' '}
            <InlineCode>Add a device to connect to</InlineCode>.
          </p>
          <p className="text-sm text-muted-foreground">
            ไม่แน่ใจว่ารุ่นไหน?{' '}
            <Link
              href="/guides"
              className="text-foreground underline underline-offset-4 decoration-border hover:decoration-foreground"
            >
              เริ่มจากหน้าเลือกกล้อง
            </Link>
          </p>
          <p className="text-sm text-muted-foreground">
            ถ้าในเมนูกล้องเห็นคำว่า <InlineCode>Remote control (EOS Utility)</InlineCode> ให้ใช้{' '}
            <Link
              href="/guides/canon-remote-control-eos-utility"
              className="text-foreground underline underline-offset-4 decoration-border hover:decoration-foreground"
            >
              คู่มือ Group 2
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
                href="https://cam.start.canon/en/C018/manual/html/index.html"
                target="_blank"
                rel="noreferrer"
                className="underline underline-offset-4 decoration-border hover:text-foreground hover:decoration-foreground"
              >
                EOS R1
              </a>
            </li>
            <li>
              <a
                href="https://cam.start.canon/en/C017/manual/html/index.html"
                target="_blank"
                rel="noreferrer"
                className="underline underline-offset-4 decoration-border hover:text-foreground hover:decoration-foreground"
              >
                EOS R5 Mark II
              </a>
            </li>
            <li>
              <a
                href="https://cam.start.canon/en/C012/manual/html/index.html"
                target="_blank"
                rel="noreferrer"
                className="underline underline-offset-4 decoration-border hover:text-foreground hover:decoration-foreground"
              >
                EOS R6 Mark II
              </a>
            </li>
            <li>
              <a
                href="https://cam.start.canon/en/C022/manual/html/index.html"
                target="_blank"
                rel="noreferrer"
                className="underline underline-offset-4 decoration-border hover:text-foreground hover:decoration-foreground"
              >
                EOS R6 Mark III
              </a>
            </li>
            <li>
              <a
                href="https://cam.start.canon/en/C013/manual/html/index.html"
                target="_blank"
                rel="noreferrer"
                className="underline underline-offset-4 decoration-border hover:text-foreground hover:decoration-foreground"
              >
                EOS R8
              </a>
            </li>
            <li>
              <a
                href="https://cam.start.canon/en/C011/manual/html/index.html"
                target="_blank"
                rel="noreferrer"
                className="underline underline-offset-4 decoration-border hover:text-foreground hover:decoration-foreground"
              >
                EOS R50
              </a>
            </li>
            <li>
              <a
                href="https://cam.start.canon/en/C021/manual/html/index.html"
                target="_blank"
                rel="noreferrer"
                className="underline underline-offset-4 decoration-border hover:text-foreground hover:decoration-foreground"
              >
                EOS R50 V
              </a>
            </li>
          </ul>
          <p className="text-sm text-muted-foreground">
            ภาพประกอบในหน้านี้เป็นภาพวาดจำลอง (original) เพื่อให้ทำตามได้ง่าย (ไม่ใช่ภาพจาก Canon manual)
          </p>
        </section>

        <Separator className="my-8" />

        <section className="space-y-6">
          <h2 className="text-xl font-semibold">สิ่งที่ต้องเตรียม</h2>
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            <li>ติดตั้งแอป FrameFast iOS บน iPhone/iPad</li>
            <li>ชาร์จแบตเตอรี่กล้องให้พอ</li>
            <li>เตรียม iPhone/iPad ไว้ใกล้กล้อง (จะต้องสลับดู SSID และ Password)</li>
          </ul>
        </section>

        <Separator className="my-8" />

        <section className="space-y-8">
          <h2 className="text-xl font-semibold">ขั้นตอนการเชื่อมต่อ</h2>

          <div className="space-y-3">
            <h3 className="text-base font-semibold">1) ทำบนกล้อง Canon</h3>
            <p className="text-sm text-muted-foreground">
              เมนูชื่อหมวดอาจต่างกันตามรุ่น แต่คำสั่งหลักจะเหมือนกัน
            </p>
            <ol className="list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
              <li>เปิดเมนู Communication/Network (ชื่อหมวดอาจต่างกันตามรุ่น)</li>
              <li>
                เลือก <InlineCode>[: Connect to EOS Utility]</InlineCode>
              </li>
            </ol>
            <GuideImage
              alt="Canon menu: Connect to EOS Utility (illustration)"
              src="/guides/canon-eos-utility/camera-menu-connect-to-eos-utility.svg"
            />
            <ol start={3} className="list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
              <li>
                เลือก <InlineCode>Add a device to connect to</InlineCode>
              </li>
              <li>
                จด/จำ <InlineCode>SSID (network name)</InlineCode> และ <InlineCode>Password</InlineCode> ที่กล้องแสดง
              </li>
            </ol>
            <GuideImage
              alt="Canon Wi-Fi: SSID + Password (illustration)"
              src="/guides/canon-eos-utility/camera-ssid-password.svg"
            />
            <p className="text-xs text-muted-foreground">
              Canon manual source:{' '}
              <a
                className="text-foreground underline underline-offset-4 decoration-border hover:decoration-foreground"
                href="https://cam.start.canon/en/C017/manual/html/UG-06_Network_0070.html"
                target="_blank"
                rel="noreferrer"
              >
                EOS R5 Mark II: Connecting to EOS Utility
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
              <li>ใส่ Password ตามที่กล้องแสดง</li>
            </ol>
            <GuideImage
              alt="iOS Wi-Fi join camera SSID (illustration)"
              src="/guides/canon-eos-utility/ios-wifi-join.svg"
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
          <h2 className="text-xl font-semibold">เช็คว่าเชื่อมต่อสำเร็จ</h2>
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            <li>iOS ต่ออยู่กับ SSID ของกล้อง</li>
            <li>กล้องแสดงสถานะเชื่อมต่อ/อุปกรณ์ถูกเพิ่มแล้ว (คำอาจต่างกันเล็กน้อย)</li>
            <li>แอป FrameFast iOS แสดงว่าพบกล้องและพร้อมใช้งาน</li>
          </ul>
        </section>

        <Separator className="my-8" />

        <section className="space-y-4">
          <h2 className="text-xl font-semibold">แก้ปัญหาเบื้องต้น</h2>
          <div className="space-y-4 text-sm text-muted-foreground">
            <div>
              <p className="font-medium text-foreground">หา SSID ไม่เจอ</p>
              <ul className="mt-1 list-disc space-y-1 pl-5">
                <li>รอ 10–20 วินาทีแล้วสแกนใหม่</li>
                <li>ตรวจว่ากล้องยังอยู่ในหน้าจอเชื่อมต่อ Connect to EOS Utility</li>
              </ul>
            </div>
            <div>
              <p className="font-medium text-foreground">ใส่รหัสแล้วต่อไม่ได้</p>
              <ul className="mt-1 list-disc space-y-1 pl-5">
                <li>ตรวจว่าพิมพ์ Password ตรงตามที่กล้องแสดง (ตัวใหญ่/เล็ก)</li>
                <li>ลอง “Forget This Network” บน iOS แล้วเชื่อมใหม่</li>
              </ul>
            </div>
            <div>
              <p className="font-medium text-foreground">เคยจับคู่อุปกรณ์ไว้แล้ว</p>
              <ul className="mt-1 list-disc space-y-1 pl-5">
                <li>ในกล้อง มองหาหน้าจอแนว “Editing/Deleting Devices for Connections” หรือรีเซ็ตการตั้งค่า Communication/Wi‑Fi แล้วเริ่มใหม่</li>
              </ul>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
