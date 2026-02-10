export function TermsPage() {
  return (
    <div className="min-h-screen px-6 py-12">
      <div className="mx-auto w-full max-w-2xl space-y-6">
        <header className="space-y-2">
          <h1 className="text-2xl font-bold tracking-tight">ข้อกำหนดการให้บริการ</h1>
          <p className="text-sm text-muted-foreground">อัปเดตล่าสุด: 10 กุมภาพันธ์ 2026</p>
        </header>

        <section className="space-y-3 text-sm leading-relaxed text-muted-foreground">
          <p>
            การใช้งาน FrameFast ถือว่าคุณยอมรับข้อกำหนดการให้บริการนี้
            โดยบริการของเราช่วยให้ช่างภาพอัปโหลดและกระจายรูปถ่ายงานอีเวนต์
            และอาจมีฟังก์ชันค้นหารูปด้วยการจดจำใบหน้า (เมื่อเปิดใช้)
          </p>
          <p>
            ผู้ให้บริการ:{' '}
            <span className="text-foreground">FrameFast ดำเนินการโดย Put Suthisrisinlpa</span>
            <br />
            ติดต่อ: <span className="text-foreground">support@framefast.io</span>
          </p>
        </section>

        <section className="space-y-3 text-sm leading-relaxed">
          <h2 className="text-base font-semibold text-foreground">
            การค้นหาด้วยใบหน้าและความยินยอม
          </h2>
          <p className="text-muted-foreground">
            ผู้เข้าร่วมงานต้องให้ความยินยอมก่อนอัปโหลดรูปเซลฟี่เพื่อค้นหารูป
            และผลการจับคู่จำกัดอยู่ภายในอีเวนต์ที่เกี่ยวข้องเท่านั้น
          </p>
        </section>

        <section className="space-y-3 text-sm leading-relaxed">
          <h2 className="text-base font-semibold text-foreground">ข้อจำกัด</h2>
          <p className="text-muted-foreground">
            บริการให้ “ตามสภาพ” และ “เท่าที่มี”
            เราไม่รับประกันว่าการทำงานจะไม่สะดุดหรือปราศจากข้อผิดพลาด
            และไม่รับประกันว่าการจดจำใบหน้าจะค้นพบรูปได้ครบถ้วน
          </p>
        </section>

        <section className="space-y-3 text-sm leading-relaxed">
          <p className="text-muted-foreground">
            เอกสารฉบับเต็ม (รวมเรื่องสิทธิ์ในเนื้อหา การชำระเงิน/เครดิต การจำกัดความรับผิด
            และกฎหมายที่ใช้บังคับ) โปรดดูที่{' '}
            <a
              className="text-primary underline underline-offset-2"
              href="https://framefast.io/terms"
              target="_blank"
              rel="noreferrer"
            >
              https://framefast.io/terms
            </a>
            .
          </p>
        </section>
      </div>
    </div>
  );
}
