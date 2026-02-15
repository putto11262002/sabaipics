import { setRequestLocale } from 'next-intl/server';
import { SiteNav } from '@/components/site-nav';
import { Footer } from '@/components/landing/footer';

type Props = {
  params: Promise<{ locale: string }>;
};

function TermsEn() {
  return (
    <article className="prose prose-neutral max-w-none prose-headings:scroll-mt-24 prose-a:text-primary prose-p:leading-relaxed prose-li:leading-relaxed prose-h2:mt-10 prose-h2:mb-3">
      <h1>Terms of Service</h1>
      <p>
        <strong>Last updated:</strong> February 10, 2026
      </p>

      <p>
        These Terms of Service (“Terms”) govern your access to and use of FrameFast and the
        FrameFast Studio iOS app (collectively, the “Service”). By using the Service, you agree to
        these Terms.
      </p>

      <h2>1) Who we are</h2>
      <p>
        <strong>Service provider:</strong> <em>FrameFast operated by Put Suthisrisinlpa</em>
        <br />
        <strong>Contact:</strong> <em>support@framefast.io</em>
      </p>

      <h2>2) The Service</h2>
      <p>
        FrameFast provides event photo upload, processing, hosting, and distribution, including
        optional face-recognition search for event participants (where enabled).
      </p>

      <h2>3) Accounts</h2>
      <ul>
        <li>
          You are responsible for your account credentials and any activity under your account.
        </li>
        <li>You must provide accurate information and keep it up to date.</li>
      </ul>

      <h2>4) Participant face search and consent</h2>
      <p>
        If you enable face-recognition features for an event, you represent and warrant that you
        have the appropriate rights and permissions to upload and process event photos and that you
        will obtain any required notices and consents from event participants (including explicit
        consent where required by law).
      </p>
      <p>
        Participants must provide consent before uploading a selfie for face matching. Face matching
        results are limited to the specific event.
      </p>

      <h2>5) Content and licenses</h2>
      <p>
        <strong>Your content.</strong> You retain ownership of content you upload (such as event
        photos). You grant us a limited license to host, store, process, and deliver your content
        solely to provide and improve the Service.
      </p>
      <p>
        <strong>Participant content.</strong> Participants may upload selfies for face search.
        Participants grant us a limited license to process the selfie for the purpose of searching
        for matching photos within the relevant event.
      </p>

      <h2>6) Payments, credits, and purchases</h2>
      <ul>
        <li>
          The Service may use a credit-based model. Purchased credits may expire as described in the
          product UI or checkout flow.
        </li>
        <li>
          Payments are processed by third-party payment providers (currently, Stripe for web
          payments).
        </li>
        <li>
          Refunds are handled according to applicable law and the policies of the payment provider.
        </li>
      </ul>

      <h2>7) Acceptable use</h2>
      <p>You agree not to:</p>
      <ul>
        <li>use the Service in violation of any applicable law;</li>
        <li>upload unlawful, infringing, or harmful content;</li>
        <li>attempt to bypass security or rate limits;</li>
        <li>reverse engineer or interfere with the Service except as permitted by law.</li>
      </ul>

      <h2>8) Event lifecycle and deletion</h2>
      <p>
        Events and associated content are intended to be retained for a limited period. We may
        delete or disable access to event data after the event retention period and/or expiration,
        subject to our operational requirements and legal obligations.
      </p>

      <h2>9) Third-party services</h2>
      <p>
        The Service relies on third-party services (such as hosting/storage, authentication,
        payments, and face recognition). Your use of those services may be subject to their terms
        and policies.
      </p>

      <h2>10) Disclaimers</h2>
      <p>
        The Service is provided “as is” and “as available”. We do not guarantee uninterrupted or
        error-free operation and do not guarantee that face recognition will find all photos.
      </p>

      <h2>11) Limitation of liability</h2>
      <p>
        To the maximum extent permitted by law, we are not liable for indirect, incidental, special,
        consequential, or punitive damages, or any loss of profits or data.
      </p>

      <h2>12) Indemnification</h2>
      <p>
        You agree to indemnify and hold us harmless from claims arising out of your content, your
        events, or your use of the Service in violation of these Terms or applicable law.
      </p>

      <h2>13) Termination</h2>
      <p>
        We may suspend or terminate access to the Service if you violate these Terms or if necessary
        to protect the Service, users, or third parties.
      </p>

      <h2>14) Changes to these Terms</h2>
      <p>
        We may update these Terms from time to time. We will post the updated Terms and update the
        “Last updated” date.
      </p>

      <h2>15) Governing law</h2>
      <p>Thailand.</p>

      <h2>16) Contact</h2>
      <p>
        Questions about these Terms: <em>support@framefast.io</em>
      </p>
    </article>
  );
}

function TermsTh() {
  return (
    <article className="prose prose-neutral max-w-none prose-headings:scroll-mt-24 prose-a:text-primary prose-p:leading-relaxed prose-li:leading-relaxed prose-h2:mt-10 prose-h2:mb-3">
      <h1>ข้อกำหนดการให้บริการ</h1>
      <p>
        <strong>อัปเดตล่าสุด:</strong> 10 กุมภาพันธ์ 2026
      </p>

      <p>
        ข้อกำหนดการให้บริการฉบับนี้ (“ข้อกำหนด”) ควบคุมการเข้าถึงและการใช้ FrameFast และแอป iOS
        FrameFast Studio (รวมเรียกว่า “บริการ”) เมื่อคุณใช้บริการ ถือว่าคุณยอมรับข้อกำหนดนี้
      </p>

      <h2>1) ผู้ให้บริการ</h2>
      <p>
        <strong>ผู้ให้บริการ:</strong> <em>FrameFast ดำเนินการโดย Put Suthisrisinlpa</em>
        <br />
        <strong>ติดต่อ:</strong> <em>support@framefast.io</em>
      </p>

      <h2>2) คำอธิบายบริการ</h2>
      <p>
        FrameFast ให้บริการอัปโหลด ประมวลผล จัดเก็บ และกระจายรูปถ่ายงานอีเวนต์ รวมถึง (หากเปิดใช้)
        ฟังก์ชันค้นหารูปด้วยการจดจำใบหน้าสำหรับผู้เข้าร่วมงาน
      </p>

      <h2>3) บัญชีผู้ใช้</h2>
      <ul>
        <li>คุณรับผิดชอบต่อการรักษาความปลอดภัยของบัญชีและการใช้งานภายใต้บัญชีของคุณ</li>
        <li>คุณต้องให้ข้อมูลที่ถูกต้องและเป็นปัจจุบัน</li>
      </ul>

      <h2>4) การค้นหาด้วยใบหน้าและความยินยอม</h2>
      <p>
        หากคุณเปิดใช้ฟังก์ชันจดจำใบหน้าสำหรับอีเวนต์
        คุณรับรองว่าคุณมีสิทธิ์และการอนุญาตที่เหมาะสมในการอัปโหลดและประมวลผลรูปถ่ายของอีเวนต์
        และจะจัดให้มีการแจ้งและขอความยินยอมจากผู้เข้าร่วมงานตามที่กฎหมายกำหนด
        (รวมถึงความยินยอมอย่างชัดแจ้งในกรณีที่จำเป็น)
      </p>
      <p>
        ผู้เข้าร่วมงานต้องให้ความยินยอมก่อนอัปโหลดรูปเซลฟี่เพื่อค้นหาด้วยใบหน้า
        และผลการจับคู่จำกัดอยู่ภายในอีเวนต์ที่เกี่ยวข้องเท่านั้น
      </p>

      <h2>5) เนื้อหาและสิทธิ์ใช้งาน</h2>
      <p>
        <strong>เนื้อหาของคุณ:</strong> คุณยังคงเป็นเจ้าของเนื้อหาที่คุณอัปโหลด (เช่น
        รูปถ่ายอีเวนต์) และให้สิทธิ์แก่เราในขอบเขตที่จำเป็นเพื่อจัดเก็บ โฮสต์ ประมวลผล
        และส่งมอบเนื้อหาเพื่อให้บริการ
      </p>
      <p>
        <strong>เนื้อหาของผู้เข้าร่วมงาน:</strong> ผู้เข้าร่วมงานอาจอัปโหลดรูปเซลฟี่เพื่อค้นหารูป
        โดยให้สิทธิ์แก่เราในการประมวลผลรูปเซลฟี่เพื่อวัตถุประสงค์ในการค้นหาภายในอีเวนต์นั้น
      </p>

      <h2>6) การชำระเงิน เครดิต และการซื้อ</h2>
      <ul>
        <li>
          บริการอาจใช้ระบบเครดิต
          เครดิตที่ซื้ออาจหมดอายุตามที่แสดงในหน้าจอผลิตภัณฑ์หรือขั้นตอนชำระเงิน
        </li>
        <li>
          การชำระเงินดำเนินการผ่านผู้ให้บริการชำระเงินภายนอก (ปัจจุบันใช้ Stripe
          สำหรับการชำระเงินผ่านเว็บ)
        </li>
        <li>การคืนเงินเป็นไปตามกฎหมายที่ใช้บังคับและนโยบายของผู้ให้บริการชำระเงิน</li>
      </ul>

      <h2>7) การใช้งานที่ยอมรับได้</h2>
      <p>คุณตกลงว่าจะไม่:</p>
      <ul>
        <li>ใช้บริการโดยฝ่าฝืนกฎหมายที่เกี่ยวข้อง</li>
        <li>อัปโหลดเนื้อหาที่ผิดกฎหมาย ละเมิดสิทธิ หรือเป็นอันตราย</li>
        <li>พยายามหลีกเลี่ยงมาตรการความปลอดภัยหรือการจำกัดอัตราการใช้งาน</li>
        <li>วิศวกรรมย้อนกลับหรือรบกวนการทำงานของบริการ เว้นแต่กฎหมายอนุญาต</li>
      </ul>

      <h2>8) วงจรอายุอีเวนต์และการลบข้อมูล</h2>
      <p>
        อีเวนต์และข้อมูลที่เกี่ยวข้องมีเจตนาให้ถูกเก็บไว้เป็นระยะเวลาจำกัด
        เราอาจลบหรือปิดการเข้าถึงข้อมูลหลังครบระยะเวลาการเก็บรักษา/หมดอายุอีเวนต์
        ทั้งนี้ขึ้นกับข้อกำหนดเชิงปฏิบัติการและข้อผูกพันตามกฎหมาย
      </p>

      <h2>9) บริการของบุคคลที่สาม</h2>
      <p>
        บริการอาศัยผู้ให้บริการภายนอก (เช่น โฮสต์/ที่จัดเก็บ การยืนยันตัวตน การชำระเงิน
        และการจดจำใบหน้า) การใช้งานบริการเหล่านั้นอาจอยู่ภายใต้ข้อกำหนดและนโยบายของผู้ให้บริการนั้น
      </p>

      <h2>10) ข้อจำกัดและข้อสงวนสิทธิ์</h2>
      <p>
        บริการให้ “ตามสภาพ” และ “เท่าที่มี” เราไม่รับประกันว่าบริการจะไม่สะดุดหรือปราศจากข้อผิดพลาด
        และไม่รับประกันว่าการจดจำใบหน้าจะค้นพบรูปได้ครบถ้วน
      </p>

      <h2>11) การจำกัดความรับผิด</h2>
      <p>
        ภายใต้ขอบเขตสูงสุดที่กฎหมายอนุญาต เราไม่รับผิดต่อความเสียหายทางอ้อม ความเสียหายพิเศษ
        ความเสียหายต่อเนื่อง หรือความเสียหายเชิงลงโทษ รวมถึงการสูญเสียกำไรหรือข้อมูล
      </p>

      <h2>12) การชดใช้ค่าเสียหาย</h2>
      <p>
        คุณตกลงจะชดใช้ค่าเสียหายและทำให้เราไม่ต้องรับผิดจากข้อเรียกร้องที่เกิดจากเนื้อหาของคุณ
        อีเวนต์ของคุณ หรือการใช้บริการโดยฝ่าฝืนข้อกำหนดหรือกฎหมายที่เกี่ยวข้อง
      </p>

      <h2>13) การระงับหรือยุติการให้บริการ</h2>
      <p>
        เราอาจระงับหรือยุติการเข้าถึงบริการ หากคุณฝ่าฝืนข้อกำหนด หรือจำเป็นเพื่อคุ้มครองบริการ
        ผู้ใช้ หรือบุคคลที่สาม
      </p>

      <h2>14) การเปลี่ยนแปลงข้อกำหนด</h2>
      <p>เราอาจปรับปรุงข้อกำหนดนี้เป็นครั้งคราว โดยจะแสดงฉบับปรับปรุงและวันที่ “อัปเดตล่าสุด”</p>

      <h2>15) กฎหมายที่ใช้บังคับ</h2>
      <p>ประเทศไทย</p>

      <h2>16) ติดต่อเรา</h2>
      <p>
        คำถามเกี่ยวกับข้อกำหนดนี้: <em>support@framefast.io</em>
      </p>
    </article>
  );
}

export default async function TermsPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <div>
      <SiteNav />
      <main className="mx-auto max-w-4xl px-4 py-12">
        {locale === 'th' ? <TermsTh /> : <TermsEn />}
      </main>
      <Footer />
    </div>
  );
}
