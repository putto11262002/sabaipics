import { setRequestLocale } from 'next-intl/server';
import { SiteNav } from '@/components/site-nav';
import { Footer } from '@/components/landing/footer';

type Props = {
  params: Promise<{ locale: string }>;
};

function PrivacyPolicyEn() {
  return (
    <article className="prose prose-neutral max-w-none prose-headings:scroll-mt-24 prose-a:text-primary prose-p:leading-relaxed prose-li:leading-relaxed prose-h2:mt-10 prose-h2:mb-3 prose-h3:mt-6 prose-h3:mb-2">
      <h1>Privacy Policy</h1>
      <p>
        <strong>Last updated:</strong> February 10, 2026
      </p>

      <p>
        This Privacy Policy explains how FrameFast (including the FrameFast Studio iOS app and all
        FrameFast websites and services, collectively, the “Service”) collects, uses, discloses, and
        protects personal data.
      </p>

      <p>
        <strong>Important:</strong> FrameFast is built for event photography distribution and may
        process biometric data (face recognition) when event participants upload a selfie to find
        their photos. We require explicit consent for this processing.
      </p>

      <h2 id="who-we-are">1) Who we are (Data Controller)</h2>
      <p>
        <strong>Data Controller:</strong> <em>FrameFast operated by Put Suthisrisinlpa</em>
        <br />
        <strong>Contact:</strong> <em>contact@framefast.io</em>
      </p>

      <h2 id="data-we-collect">2) Personal data we collect</h2>
      <h3>Photographers (Studio/Dashboard users)</h3>
      <ul>
        <li>
          <strong>Account data:</strong> name, email, account identifiers (e.g., Clerk user ID).
        </li>
        <li>
          <strong>Event data:</strong> event name, dates, settings, and related identifiers.
        </li>
        <li>
          <strong>Uploaded content:</strong> event photos you upload to the Service and related
          metadata we derive for processing (e.g., image dimensions, file size, and limited
          EXIF-derived metadata).
        </li>
        <li>
          <strong>Consent records:</strong> timestamps and IP address (if available) for certain
          consent actions.
        </li>
        <li>
          <strong>Payments:</strong> purchase records and payment-related identifiers (e.g., Stripe
          customer ID, Stripe session ID). We do not store full card numbers; payment processing is
          handled by payment providers.
        </li>
        <li>
          <strong>Device/app permissions (FrameFast Studio):</strong> local network access and
          camera access are requested by the iOS app to connect to and download photos from cameras
          via USB/WiFi and to support related workflows.
        </li>
      </ul>

      <h3>Event participants (public event pages)</h3>
      <ul>
        <li>
          <strong>Selfie image:</strong> when you use “find my photos”, you may upload a selfie
          image.
        </li>
        <li>
          <strong>Biometric data:</strong> we (or our face-recognition service provider) process
          facial features extracted from the uploaded selfie to match photos within a specific
          event.
        </li>
        <li>
          <strong>Search records:</strong> event ID, consent timestamp, your IP address (if
          available), and the resulting matched photo IDs.
        </li>
        <li>
          <strong>Downloads:</strong> we may log download requests for abuse prevention and rate
          limiting.
        </li>
      </ul>

      <h2 id="how-we-use">3) How we use personal data</h2>
      <ul>
        <li>
          Provide and operate the Service (upload, processing, hosting, and delivery of photos).
        </li>
        <li>
          Perform face recognition searches within a specific event when a participant uploads a
          selfie and provides consent.
        </li>
        <li>Process payments and maintain credit balances (where applicable).</li>
        <li>Maintain security, prevent fraud/abuse, and enforce rate limits.</li>
        <li>Monitor reliability and fix bugs (e.g., error monitoring).</li>
        <li>Comply with legal obligations and respond to lawful requests.</li>
      </ul>

      <h2 id="legal-bases">4) Legal bases (Thailand PDPA)</h2>
      <p>
        Where Thailand’s Personal Data Protection Act B.E. 2562 (PDPA) applies, we process personal
        data on one or more of the following bases:
      </p>
      <ul>
        <li>
          <strong>Contract:</strong> to provide the Service to photographers.
        </li>
        <li>
          <strong>Consent:</strong> for face recognition searches (biometric data) and other cases
          where consent is required.
        </li>
        <li>
          <strong>Legitimate interests:</strong> to secure and improve the Service (e.g., abuse
          prevention).
        </li>
        <li>
          <strong>Legal obligation:</strong> where we must comply with applicable laws.
        </li>
      </ul>

      <h2 id="sensitive-data">5) Sensitive personal data (biometrics)</h2>
      <p>
        Face recognition involves biometric data, which may be considered sensitive personal data
        under the PDPA. We require explicit consent from participants before processing a selfie for
        face recognition, and we limit processing to the purpose of finding matching photos for the
        relevant event.
      </p>
      <p>
        We do <strong>not</strong> use participant selfies or face recognition data to train
        machine-learning models.
      </p>

      <h2 id="sharing">6) How we share personal data</h2>
      <p>We share personal data only as needed to operate the Service, including with:</p>
      <ul>
        <li>
          <strong>Cloud infrastructure and storage:</strong> to store and deliver photos and selfies
          (e.g., object storage/CDN).
        </li>
        <li>
          <strong>Face recognition providers:</strong> to perform face detection/search for a
          specific event (a face-recognition service provider, which may be operated by us or a
          third party).
        </li>
        <li>
          <strong>Authentication:</strong> to manage user login and identity (e.g., Clerk).
        </li>
        <li>
          <strong>Payments:</strong> to process payments (e.g., Stripe, Apple In-App Purchase where
          used).
        </li>
        <li>
          <strong>Error monitoring:</strong> to detect and fix reliability issues (e.g., Sentry).
        </li>
      </ul>
      <p>We do not sell personal data.</p>

      <h2 id="transfers">7) International transfers</h2>
      <p>
        Our service providers and infrastructure may process or store personal data outside
        Thailand. For example, our primary database is hosted on Neon (Singapore), and
        photos/selfies are stored in Cloudflare R2 (Singapore). Face-recognition processing (if
        used) may be performed by a face-recognition service provider in the regions used to operate
        that service. Where applicable, we take steps intended to ensure an appropriate level of
        protection for cross-border transfers in line with the PDPA.
      </p>

      <h2 id="retention">8) Retention</h2>
      <p>
        We retain personal data only as long as necessary for the purposes described above,
        including for security and compliance. By default, events and associated content are
        designed to expire after a limited retention period (for example, events are configured to
        expire after approximately 30 days, and deletion workflows may include an additional grace
        period for operational cleanup).
      </p>
      <p>
        Exact retention may vary based on configuration, event lifecycle, and legal requirements. If
        you need urgent deletion, contact us at <em>contact@framefast.io</em> and include any
        relevant details (such as the event name/link and what you want deleted). We will handle
        urgent deletion requests as soon as reasonably possible.
      </p>

      <h2 id="security">9) Security</h2>
      <p>
        We implement reasonable technical and organizational measures to protect personal data,
        including access controls, encryption in transit, and restricted access to systems.
      </p>

      <h2 id="rights">10) Your rights (PDPA)</h2>
      <p>Subject to applicable law, you may have rights to:</p>
      <ul>
        <li>access and obtain a copy of your personal data;</li>
        <li>request correction of inaccurate data;</li>
        <li>request deletion/erasure or destruction of data;</li>
        <li>request restriction of processing;</li>
        <li>object to processing in certain circumstances;</li>
        <li>withdraw consent (where processing is based on consent); and</li>
        <li>data portability (where applicable).</li>
      </ul>
      <p>
        To exercise these rights, contact us at <em>contact@framefast.io</em>. We may need to verify
        your identity before responding.
      </p>

      <h2 id="cookies">11) Cookies and similar technologies</h2>
      <p>
        Our websites use cookies or similar technologies that are necessary to operate the Service
        (for example, security and basic site functionality). We may also use analytics cookies to
        understand usage and improve the Service. As of February 10, 2026, we have not finalized
        which analytics providers (if any) we use; if enabled, we will disclose them via our cookie
        banner/settings and update this policy. Where required, we will request consent for
        non-essential cookies and provide choices/controls.
      </p>

      <h2>12) Children</h2>
      <p>
        The Service is not intended for children. If you believe a child has provided personal data,
        please contact us.
      </p>

      <h2>13) Changes</h2>
      <p>
        We may update this Privacy Policy from time to time. We will post the updated version and
        update the “Last updated” date.
      </p>

      <h2 id="contact">14) Contact</h2>
      <p>
        For privacy questions or requests, contact: <em>contact@framefast.io</em>
      </p>
    </article>
  );
}

function PrivacyPolicyTh() {
  return (
    <article className="prose prose-neutral max-w-none prose-headings:scroll-mt-24 prose-a:text-primary prose-p:leading-relaxed prose-li:leading-relaxed prose-h2:mt-10 prose-h2:mb-3 prose-h3:mt-6 prose-h3:mb-2">
      <h1>นโยบายความเป็นส่วนตัว</h1>
      <p>
        <strong>อัปเดตล่าสุด:</strong> 10 กุมภาพันธ์ 2026
      </p>

      <p>
        นโยบายความเป็นส่วนตัวฉบับนี้อธิบายว่า FrameFast (รวมถึงแอป iOS FrameFast Studio
        และเว็บไซต์/บริการของ FrameFast ทั้งหมด ซึ่งเรียกรวมกันว่า “บริการ”) เก็บรวบรวม ใช้ เปิดเผย
        และคุ้มครองข้อมูลส่วนบุคคลอย่างไร
      </p>

      <p>
        <strong>สำคัญ:</strong> FrameFast ออกแบบมาเพื่อการกระจายรูปถ่ายงานอีเวนต์
        และอาจมีการประมวลผลข้อมูลชีวภาพ (การจดจำใบหน้า)
        เมื่อผู้เข้าร่วมงานอัปโหลดรูปเซลฟี่เพื่อค้นหารูปของตน
        โดยเราจะขอความยินยอมอย่างชัดแจ้งก่อนเสมอ
      </p>

      <h2 id="th-who-we-are">1) เราคือใคร (ผู้ควบคุมข้อมูลส่วนบุคคล)</h2>
      <p>
        <strong>ผู้ควบคุมข้อมูลส่วนบุคคล:</strong>{' '}
        <em>FrameFast ดำเนินการโดย Put Suthisrisinlpa</em>
        <br />
        <strong>ติดต่อ:</strong> <em>contact@framefast.io</em>
      </p>

      <h2 id="th-data-we-collect">2) ข้อมูลส่วนบุคคลที่เราเก็บรวบรวม</h2>
      <h3>ช่างภาพ (ผู้ใช้ Studio/Dashboard)</h3>
      <ul>
        <li>
          <strong>ข้อมูลบัญชี:</strong> ชื่อ อีเมล และรหัสระบุตัวตนบัญชี (เช่น Clerk user ID)
        </li>
        <li>
          <strong>ข้อมูลอีเวนต์:</strong> ชื่ออีเวนต์ วันเวลา การตั้งค่า และรหัสที่เกี่ยวข้อง
        </li>
        <li>
          <strong>เนื้อหาที่อัปโหลด:</strong> รูปถ่ายที่อัปโหลดและข้อมูลเมตาที่จำเป็นต่อการประมวลผล
          (เช่น ขนาดภาพ ขนาดไฟล์ และข้อมูล EXIF บางส่วน)
        </li>
        <li>
          <strong>บันทึกความยินยอม:</strong> เวลาและ IP (หากมี) สำหรับการยินยอมบางประเภท
        </li>
        <li>
          <strong>การชำระเงิน:</strong> บันทึกการซื้อและรหัสที่เกี่ยวข้อง (เช่น Stripe customer ID,
          Stripe session ID) โดยเราไม่เก็บหมายเลขบัตรเครดิตเต็มรูปแบบ
        </li>
        <li>
          <strong>สิทธิ์อุปกรณ์/แอป (FrameFast Studio):</strong> แอป iOS อาจขอสิทธิ์ Local Network
          และ Camera เพื่อเชื่อมต่อและดาวน์โหลดรูปจากกล้องผ่าน USB/WiFi
          และสนับสนุนการทำงานที่เกี่ยวข้อง
        </li>
      </ul>

      <h3>ผู้เข้าร่วมงาน (หน้าอีเวนต์แบบสาธารณะ)</h3>
      <ul>
        <li>
          <strong>รูปเซลฟี่:</strong> เมื่อใช้ฟังก์ชัน “ค้นหารูปของฉัน” คุณอาจอัปโหลดรูปเซลฟี่
        </li>
        <li>
          <strong>ข้อมูลชีวภาพ:</strong> เรา (หรือผู้ให้บริการจดจำใบหน้าของเรา)
          ประมวลผลลักษณะใบหน้าจากรูปเซลฟี่เพื่อจับคู่กับรูปในอีเวนต์เดียวกัน
        </li>
        <li>
          <strong>บันทึกการค้นหา:</strong> event ID เวลาให้ความยินยอม IP (หากมี)
          และรายการรหัสรูปที่จับคู่ได้
        </li>
        <li>
          <strong>การดาวน์โหลด:</strong>{' '}
          อาจมีการบันทึกคำขอดาวน์โหลดเพื่อป้องกันการใช้งานในทางที่ผิดและกำหนดอัตราการใช้งาน
        </li>
      </ul>

      <h2 id="th-how-we-use">3) วัตถุประสงค์ในการใช้ข้อมูลส่วนบุคคล</h2>
      <ul>
        <li>เพื่อให้บริการ (อัปโหลด ประมวลผล จัดเก็บ และส่งมอบรูปถ่าย)</li>
        <li>
          เพื่อค้นหารูปด้วยการจดจำใบหน้า ภายในอีเวนต์ที่เกี่ยวข้อง เมื่อผู้เข้าร่วมให้ความยินยอม
        </li>
        <li>เพื่อดำเนินการชำระเงินและจัดการเครดิต (หากมี)</li>
        <li>เพื่อความปลอดภัย ป้องกันการทุจริต/การใช้งานในทางที่ผิด และกำหนดอัตราการใช้งาน</li>
        <li>เพื่อดูแลความเสถียรและแก้ไขข้อผิดพลาด (เช่น การติดตามข้อผิดพลาดของระบบ)</li>
        <li>เพื่อปฏิบัติตามกฎหมายและคำสั่งที่ชอบด้วยกฎหมาย</li>
      </ul>

      <h2 id="th-legal-bases">4) ฐานทางกฎหมาย (PDPA)</h2>
      <p>
        เมื่อกฎหมายคุ้มครองข้อมูลส่วนบุคคลของไทย (PDPA) มีผลบังคับใช้
        เราอาจประมวลผลข้อมูลบนฐานใดฐานหนึ่งหรือหลายฐานดังนี้:
      </p>
      <ul>
        <li>
          <strong>สัญญา:</strong> เพื่อให้บริการแก่ช่างภาพ
        </li>
        <li>
          <strong>ความยินยอม:</strong> สำหรับการค้นหาด้วยการจดจำใบหน้า (ข้อมูลชีวภาพ)
          และกรณีอื่นที่กฎหมายกำหนดให้ต้องขอความยินยอม
        </li>
        <li>
          <strong>ประโยชน์โดยชอบด้วยกฎหมาย:</strong> เพื่อความปลอดภัยและพัฒนาบริการ (เช่น
          ป้องกันการใช้งานในทางที่ผิด)
        </li>
        <li>
          <strong>หน้าที่ตามกฎหมาย:</strong> เพื่อปฏิบัติตามกฎหมายที่เกี่ยวข้อง
        </li>
      </ul>

      <h2 id="th-sensitive-data">5) ข้อมูลอ่อนไหว (ข้อมูลชีวภาพ)</h2>
      <p>
        การจดจำใบหน้าเกี่ยวข้องกับข้อมูลชีวภาพ ซึ่งอาจถือเป็นข้อมูลส่วนบุคคลอ่อนไหวตาม PDPA
        เราจะขอความยินยอมอย่างชัดแจ้งก่อนประมวลผลรูปเซลฟี่เพื่อการจดจำใบหน้า
        และจำกัดการประมวลผลเพื่อวัตถุประสงค์ในการค้นหารูปของอีเวนต์นั้นเท่านั้น
      </p>
      <p>
        เรา<strong>ไม่</strong>
        นำรูปเซลฟี่หรือข้อมูลที่ใช้ในการจดจำใบหน้าไปใช้เพื่อฝึกสอนโมเดลแมชชีนเลิร์นนิง
      </p>

      <h2 id="th-sharing">6) การเปิดเผย/แบ่งปันข้อมูล</h2>
      <p>เราเปิดเผยข้อมูลเท่าที่จำเป็นเพื่อให้บริการ เช่น ให้กับ:</p>
      <ul>
        <li>
          <strong>โครงสร้างพื้นฐานและที่จัดเก็บ:</strong> เพื่อจัดเก็บและส่งมอบรูปถ่าย/รูปเซลฟี่
          (เช่น object storage/CDN)
        </li>
        <li>
          <strong>ผู้ให้บริการจดจำใบหน้า:</strong>{' '}
          เพื่อทำการตรวจจับ/ค้นหาใบหน้าสำหรับอีเวนต์ที่เกี่ยวข้อง
          (ผู้ให้บริการจดจำใบหน้าซึ่งอาจดำเนินการโดยเราเองหรือบุคคลที่สาม)
        </li>
        <li>
          <strong>ผู้ให้บริการยืนยันตัวตน:</strong> เพื่อจัดการการเข้าสู่ระบบและตัวตนผู้ใช้ (เช่น
          Clerk)
        </li>
        <li>
          <strong>ผู้ให้บริการชำระเงิน:</strong> เพื่อดำเนินการชำระเงิน (เช่น Stripe หรือ Apple
          In-App Purchase หากมี)
        </li>
        <li>
          <strong>การติดตามข้อผิดพลาด:</strong> เพื่อดูแลความเสถียรของระบบ (เช่น Sentry)
        </li>
      </ul>
      <p>เราไม่ขายข้อมูลส่วนบุคคล</p>

      <h2 id="th-transfers">7) การโอนข้อมูลไปต่างประเทศ</h2>
      <p>
        ผู้ให้บริการและโครงสร้างพื้นฐานของเราอาจจัดเก็บหรือประมวลผลข้อมูลนอกประเทศไทย ตัวอย่างเช่น
        ฐานข้อมูลหลักของเราโฮสต์บน Neon (สิงคโปร์) และรูปถ่าย/รูปเซลฟี่จัดเก็บใน Cloudflare R2
        (สิงคโปร์) และการประมวลผลจดจำใบหน้า (หากมีการใช้งาน)
        อาจดำเนินการโดยผู้ให้บริการจดจำใบหน้าในภูมิภาคที่ใช้ให้บริการนั้น
        โดยเราจะดำเนินการตามสมควรเพื่อให้การโอนข้อมูลข้ามพรมแดนเป็นไปตาม PDPA
      </p>

      <h2 id="th-retention">8) ระยะเวลาการเก็บรักษาข้อมูล</h2>
      <p>
        เราจะเก็บรักษาข้อมูลเท่าที่จำเป็นตามวัตถุประสงค์ที่ระบุไว้
        รวมถึงเพื่อความปลอดภัยและการปฏิบัติตามกฎหมาย
        โดยระบบของเรามีวงจรอายุอีเวนต์และข้อมูลที่ออกแบบให้หมดอายุภายในระยะเวลาหนึ่ง (ตัวอย่างเช่น
        อีเวนต์มักตั้งค่าให้หมดอายุประมาณ 30 วัน และอาจมีช่วงผ่อนผันเพื่อการลบข้อมูลเชิงปฏิบัติการ)
      </p>
      <p>
        หากต้องการให้ลบข้อมูลแบบเร่งด่วน โปรดติดต่อ <em>contact@framefast.io</em>{' '}
        พร้อมรายละเอียดที่เกี่ยวข้อง (เช่น ชื่ออีเวนต์/ลิงก์ และข้อมูลที่ต้องการให้ลบ)
        เราจะดำเนินการคำขอลบแบบเร่งด่วนโดยเร็วที่สุดเท่าที่สมควร
      </p>

      <h2>9) ความมั่นคงปลอดภัย</h2>
      <p>
        เรามีมาตรการทางเทคนิคและการจัดการที่เหมาะสมเพื่อคุ้มครองข้อมูล เช่น การควบคุมการเข้าถึง
        การเข้ารหัสระหว่างส่งผ่านเครือข่าย และการจำกัดสิทธิ์เข้าถึงระบบ
      </p>

      <h2 id="th-rights">10) สิทธิของเจ้าของข้อมูล (PDPA)</h2>
      <p>ภายใต้กฎหมายที่เกี่ยวข้อง คุณอาจมีสิทธิ เช่น:</p>
      <ul>
        <li>ขอเข้าถึงและขอสำเนาข้อมูล</li>
        <li>ขอแก้ไขข้อมูลให้ถูกต้อง</li>
        <li>ขอให้ลบ/ทำลายข้อมูล</li>
        <li>ขอให้จำกัดการประมวลผล</li>
        <li>คัดค้านการประมวลผลในบางกรณี</li>
        <li>ถอนความยินยอม (กรณีที่อาศัยความยินยอมเป็นฐาน)</li>
        <li>ขอรับหรือโอนย้ายข้อมูล (ตามที่กฎหมายกำหนด)</li>
      </ul>
      <p>
        หากต้องการใช้สิทธิ โปรดติดต่อ <em>contact@framefast.io</em>{' '}
        โดยเราอาจขอข้อมูลเพิ่มเติมเพื่อยืนยันตัวตนก่อนดำเนินการ
      </p>

      <h2 id="th-cookies">11) คุกกี้และเทคโนโลยีที่คล้ายกัน</h2>
      <p>
        เว็บไซต์ของเราใช้คุกกี้หรือเทคโนโลยีที่คล้ายกันที่จำเป็นต่อการทำงาน (เช่น
        ความปลอดภัยและการทำงานพื้นฐานของเว็บไซต์)
        และอาจใช้คุกกี้สำหรับการวิเคราะห์การใช้งานเพื่อปรับปรุงบริการ ทั้งนี้ ณ วันที่ 10 กุมภาพันธ์
        2026 เรายังไม่ได้สรุปว่าจะใช้ผู้ให้บริการวิเคราะห์ใด (ถ้ามี) หากมีการเปิดใช้งาน
        เราจะแสดงรายละเอียดผ่านแบนเนอร์/การตั้งค่าคุกกี้ และอัปเดตนโยบายนี้ ในกรณีที่กฎหมายกำหนด
        เราจะขอความยินยอมสำหรับคุกกี้ที่ไม่จำเป็น และให้ตัวเลือก/การควบคุมที่เหมาะสม
      </p>

      <h2>12) เด็ก</h2>
      <p>
        บริการนี้ไม่ได้มีเจตนาให้ใช้งานโดยเด็ก หากคุณเชื่อว่าเด็กได้ให้ข้อมูลส่วนบุคคล โปรดติดต่อเรา
      </p>

      <h2>13) การเปลี่ยนแปลงนโยบาย</h2>
      <p>เราอาจปรับปรุงนโยบายนี้เป็นครั้งคราว โดยจะแสดงฉบับปรับปรุงและวันที่ “อัปเดตล่าสุด”</p>

      <h2 id="th-contact">14) ติดต่อเรา</h2>
      <p>
        สำหรับคำถามหรือคำขอเกี่ยวกับความเป็นส่วนตัว โปรดติดต่อ: <em>contact@framefast.io</em>
      </p>
    </article>
  );
}

export default async function PrivacyPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <div>
      <SiteNav />
      <main className="mx-auto max-w-4xl px-4 py-12">
        {locale === 'th' ? <PrivacyPolicyTh /> : <PrivacyPolicyEn />}
      </main>
      <Footer />
    </div>
  );
}
