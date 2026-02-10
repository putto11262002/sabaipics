export function PrivacyPage() {
  return (
    <div className="min-h-screen px-6 py-12">
      <div className="mx-auto w-full max-w-2xl space-y-6">
        <header className="space-y-2">
          <h1 className="text-2xl font-bold tracking-tight">นโยบายความเป็นส่วนตัว</h1>
          <p className="text-sm text-muted-foreground">อัปเดตล่าสุด: 10 กุมภาพันธ์ 2026</p>
        </header>

        <section className="space-y-3 text-sm leading-relaxed text-muted-foreground">
          <p>
            FrameFast เป็นแพลตฟอร์มกระจายรูปถ่ายงานอีเวนต์ และอาจมีการประมวลผลข้อมูลชีวภาพ
            (การจดจำใบหน้า) เมื่อคุณอัปโหลดรูปเซลฟี่เพื่อค้นหารูปของคุณ
            เราจะขอความยินยอมอย่างชัดแจ้งก่อนการประมวลผลดังกล่าว
          </p>
          <p>เราไม่ได้นำรูปเซลฟี่หรือข้อมูลการจดจำใบหน้าไปใช้เพื่อฝึกสอนโมเดลแมชชีนเลิร์นนิง</p>
          <p>
            ผู้ควบคุมข้อมูลส่วนบุคคล:{' '}
            <span className="text-foreground">FrameFast ดำเนินการโดย Put Suthisrisinlpa</span>
            <br />
            ติดต่อ: <span className="text-foreground">support@framefast.io</span>
          </p>
        </section>

        <section className="space-y-3 text-sm leading-relaxed">
          <h2 className="text-base font-semibold text-foreground">ข้อมูลที่เราเก็บและใช้</h2>
          <ul className="list-disc space-y-2 pl-5 text-muted-foreground">
            <li>
              รูปเซลฟี่ที่คุณอัปโหลดเพื่อค้นหารูป และบันทึกการค้นหา (เช่น เวลาให้ความยินยอม และ IP
              หากมี)
            </li>
            <li>การประมวลผลลักษณะใบหน้าเพื่อจับคู่รูปภายในอีเวนต์ที่เกี่ยวข้องเท่านั้น</li>
            <li>
              ข้อมูลการดาวน์โหลด/การใช้งานที่จำเป็นเพื่อความปลอดภัยและป้องกันการใช้งานในทางที่ผิด
            </li>
          </ul>
        </section>

        <section className="space-y-3 text-sm leading-relaxed">
          <h2 className="text-base font-semibold text-foreground">การแบ่งปันข้อมูล</h2>
          <p className="text-muted-foreground">
            เราอาจแบ่งปันข้อมูลกับผู้ให้บริการที่จำเป็นต่อการให้บริการ เช่น ที่จัดเก็บ/ส่งมอบรูปถ่าย
            และผู้ให้บริการจดจำใบหน้า
            (ผู้ให้บริการจดจำใบหน้าซึ่งอาจดำเนินการโดยเราเองหรือบุคคลที่สาม)
          </p>
        </section>

        <section className="space-y-3 text-sm leading-relaxed">
          <h2 className="text-base font-semibold text-foreground">สิทธิของคุณ (PDPA)</h2>
          <p className="text-muted-foreground">
            คุณอาจมีสิทธิตาม PDPA เช่น ขอเข้าถึง ขอแก้ไข ขอให้ลบ/ทำลาย ขอจำกัดการประมวลผล คัดค้าน
            หรือถอนความยินยอม โดยติดต่อเราได้ที่
            <span className="text-foreground"> support@framefast.io</span>
          </p>
        </section>

        <section className="space-y-3 text-sm leading-relaxed">
          <p className="text-muted-foreground">
            เอกสารฉบับเต็ม (รวมรายละเอียดผู้ให้บริการภายนอก ระยะเวลาการเก็บรักษา
            และการโอนข้อมูลไปต่างประเทศ) โปรดดูที่{' '}
            <a
              className="text-primary underline underline-offset-2"
              href="https://framefast.io/privacy"
              target="_blank"
              rel="noreferrer"
            >
              https://framefast.io/privacy
            </a>
            .
          </p>
        </section>
      </div>
    </div>
  );
}
