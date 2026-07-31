# ระบบบริหารงานซ่อมและบริการ NBC Group
# เอกสารรวบรวมข้อมูลจากลูกค้า (Client Data Collection Checklist)

**วัตถุประสงค์ / Purpose**
เอกสารนี้รวบรวมข้อมูล เอกสาร และกฎเกณฑ์ทั้งหมดที่ทีมพัฒนาต้องการจาก บริษัท เอ็นบีซี กรุ๊ป จำกัด
เพื่อนำไปแทนที่ค่าสมมติฐานมาตรฐานที่ใช้อยู่ในระบบต้นแบบ
*Everything the development team needs from NBC Group to convert the working skeleton into the
client's real system. Development is already proceeding on standard assumptions — these answers
replace those assumptions with reality.*

**ระดับความสำคัญ / Priority key**
- 🔴 **P0** — จำเป็นเร่งด่วน มีผลต่อโครงสร้างฐานข้อมูล ต้องการภายใน ~1 สัปดาห์
  *blocks final database schema*
- 🟠 **P1** — จำเป็นก่อนเริ่มพัฒนาส่วนของช่างภาคสนาม ต้องการภายใน ~3 สัปดาห์
  *blocks the field-technician phase*
- 🟡 **P2** — ต้องการก่อนเปิดใช้งานจริง ยังไม่เร่งด่วน
  *needed before launch, not urgent*

> **หมายเหตุถึงลูกค้า**
> ถ่ายรูปแบบฟอร์มกระดาษที่ใช้อยู่ด้วยมือถือก็เพียงพอแล้ว ไม่จำเป็นต้องสแกน
> หากมีไฟล์ Excel อยู่แล้ว ขอเป็นไฟล์ต้นฉบับโดยไม่ต้องแก้ไขหรือจัดระเบียบใหม่
> **ไม่ต้องเสียเวลาจัดทำให้สวยงาม — ต้นฉบับที่ใช้งานจริงมีประโยชน์กับเรามากกว่าเอกสารที่สรุปใหม่**
>
> *Photos of existing paper forms taken on a phone are perfectly acceptable. Existing Excel files
> are ideal — please send them as-is, unedited. The messy original is more useful to us than a
> cleaned-up summary.*

---

## หมวด A — เอกสารและตัวอย่างแบบฟอร์ม
## SECTION A — Documents & Form Samples 🔴 P0

> **หมวดนี้สำคัญที่สุด** หมวดอื่นเราพอหาทางเลี่ยงไปก่อนได้ แต่หมวดนี้ไม่ได้
> *This is the single most important section. Everything else can be worked around; these cannot.*

| # | รายการ / Item | รูปแบบที่ต้องการ / Format | เหตุผล / Why |
|---|---|---|---|
| A1 | **ใบตรวจเช็ค/แจ้งซ่อม**<br>*Inspection / Repair Request Form* | รูปถ่าย สแกน Excel หรือ Word<br>ขอทั้ง **แบบเปล่า** และ **ตัวอย่างที่กรอกจริงแล้ว 2–3 ใบ** (ปิดบังข้อมูลลูกค้าได้)<br>*blank **and** 2–3 completed real examples* | เพื่อสร้างฟอร์มดิจิทัลให้ตรงทุกช่อง และให้ไฟล์ PDF ที่ออกมาหน้าตาเหมือนเอกสารที่ลูกค้าได้รับอยู่ทุกวันนี้<br>*Field-for-field digital rebuild* |
| A2 | **ใบล้าง/PM**<br>*Cleaning & Preventive Maintenance Form* | เช่นเดียวกับ A1 | เช่นเดียวกับ A1 |
| A3 | **ใบซ่อม**<br>*Standard Repair Job Form* | เช่นเดียวกับ A1 | เช่นเดียวกับ A1 |
| A4 | **ใบเสนอราคา** (แบบฟอร์มที่ใช้อยู่)<br>*Quotation template* | Excel / Word / PDF | ใช้ทำระบบใบเสนอราคา และการเสนองานเพิ่มหน้างาน |
| A5 | สมุด/ไฟล์บันทึกการรับงานที่ใช้อยู่ปัจจุบัน<br>*Current job/booking log* | Excel, Google Sheets หรือรูปถ่ายสมุด | ทำให้เห็นว่าจริง ๆ แล้วหน้างานใช้ข้อมูลช่องไหนบ้าง |
| A6 | หัวจดหมายและท้ายกระดาษของบริษัท<br>*Company letterhead & document footer* | ไฟล์ต้นฉบับถ้ามี | ใช้ทำหัว-ท้ายเอกสาร PDF |
| A7 | **โลโก้ไฟล์ต้นฉบับ (เวกเตอร์)**<br>*Logo in original vector form* | `.ai` `.eps` `.svg` หรือ PNG ความละเอียดสูง | โลโก้บนเว็บไซต์ความละเอียดต่ำเกินไป พิมพ์ออกมาจะไม่คมชัด |
| A8 | รูปตราประทับบริษัท<br>*Company seal / rubber stamp* | PNG พื้นหลังโปร่งใส | เอกสารใบงานของไทยมักต้องมีตราประทับ |

**คำถามเพิ่มเติมเกี่ยวกับแบบฟอร์ม / Specific questions on the forms**

| # | คำถาม / Question |
|---|---|
| A9 🔴 | มีรูปแบบ **เลขที่เอกสาร** ที่กำหนดไว้หรือไม่ (เช่น `NBC-PM-2569-0001`) เลขรันใหม่ทุกปีหรือไม่ และแต่ละฟอร์มใช้เลขรันแยกกันหรือไม่<br>*Required document number format? Does numbering reset annually? Separate sequence per form?* |
| A10 🔴 | เอกสารใช้ **ปี พ.ศ. (2569)** หรือ **ค.ศ. (2026)**<br>*Buddhist Era or Christian Era?* |
| A11 🟠 | แต่ละฟอร์มต้องมีลายเซ็นกี่จุด และเป็นลายเซ็นของใครบ้าง (ลูกค้า / ช่าง / หัวหน้าช่าง / วิศวกร)<br>*How many signatures per form, and from whom?* |
| A12 🟠 | มี **ข้อความเงื่อนไขมาตรฐาน** ที่ต้องปรากฏบนเอกสารทุกใบหรือไม่<br>*Fixed terms & conditions text blocks?* |
| A13 🟡 | ต้องปริ้นเอกสารให้ลูกค้าที่หน้างานเลยหรือไม่ หรือส่งไฟล์ PDF ให้ภายหลังเพียงพอ<br>*Printed on-site, or is sending a PDF sufficient?* |

---

## หมวด B — ค่าบริการ ค่าตรวจเช็ค และกฎการให้ส่วนลด
## SECTION B — Money, Fees & Discount Rules 🔴 P0

| # | คำถาม / Question | หมายเหตุ / Notes |
|---|---|---|
| B1 🔴 | **ค่าเข้าตรวจเช็คหน้างาน** มาตรฐานเท่าไร<br>*Standard on-site inspection fee?* | ขณะนี้ระบบตั้งสมมติฐานไว้ที่ **฿500** |
| B2 🔴 | ค่าตรวจเช็คแตกต่างกันตาม **พื้นที่/ระยะทาง**, **ประเภทงาน**, หรือ **ประเภทระบบ** (แอร์แยกส่วน vs Chiller) หรือไม่<br>*Does the fee vary by area, job type, or system type?* | |
| B3 🔴 | เมื่อลูกค้าตกลงซ่อม จะนำค่าตรวจเช็คมาหักเป็นส่วนลด **เต็มจำนวน 100%**, **จำนวนคงที่**, หรือ **เป็นเปอร์เซ็นต์**<br>*Credited 100%, a fixed amount, or a percentage?* | ขณะนี้สมมติไว้ที่ **100%** |
| B4 🔴 | มี **มูลค่างานขั้นต่ำ** ก่อนจึงจะได้ส่วนลดนี้หรือไม่ (เช่น เฉพาะงานซ่อมเกิน ฿2,000)<br>*Minimum job value before the credit applies?* | ป้องกันกรณีหักส่วนลด ฿500 จากงานมูลค่า ฿600 |
| B5 🔴 | ยืนยัน: **ยกเว้นค่าตรวจเช็คทั้งหมด** สำหรับลูกค้าที่มีสัญญารายปีใช่หรือไม่<br>*Fee fully waived for annual-contract customers?* | เว็บไซต์ของบริษัทระบุว่า *"ตรวจเช็คฟรีสำหรับลูกค้าในสัญญา"* |
| B6 🔴 | เก็บค่าตรวจเช็ค **ณ วันที่เข้าหน้างาน** หรือ **วางบิลภายหลัง**<br>*Collected on the day, or invoiced later?* | มีผลต่อการออกแบบสถานะการชำระเงิน |
| B7 🟠 | ราคาที่แจ้งลูกค้า **รวม VAT 7% แล้ว** หรือ **ยังไม่รวม**<br>*Prices including or excluding VAT?* | ขณะนี้สมมติว่า **ยังไม่รวม** |
| B8 🟠 | มี **ค่าเดินทาง/ค่าบริการนอกพื้นที่** หรือไม่ และกำหนดขอบเขตพื้นที่อย่างไร<br>*Travel charge outside the service area? How is the boundary defined?* | |
| B9 🟠 | มี **จำนวนเครื่องขั้นต่ำ** ต่อการเข้าบริการหนึ่งครั้งหรือไม่ (เช่น ขั้นต่ำ 3 เครื่อง)<br>*Minimum quantity per visit?* | |
| B10 🟠 | มี **ค่าบริการนอกเวลา / วันหยุด / กลางคืน** เพิ่มเติมหรือไม่<br>*After-hours, weekend or holiday surcharge?* | บริษัทโฆษณาบริการ 24 ชั่วโมง |
| B11 🟡 | ช่องทางการชำระเงินที่รับ — เงินสด / โอน / เครดิตเทอม<br>*Accepted payment methods?* | |
| B12 🟡 | การจัดการ **ภาษีหัก ณ ที่จ่าย 3%** สำหรับลูกค้านิติบุคคล<br>*Withholding tax handling for corporate customers?* | |

---

## หมวด C — โควตารายวันและกฎการจัดคิวงาน
## SECTION C — Daily Quota & Scheduling Rules 🔴 P0

| # | คำถาม / Question | หมายเหตุ / Notes |
|---|---|---|
| C1 🔴 | ต้องการกำหนด **เพดานงานต่อวัน** ด้วยอะไร — **จำนวนงาน**, **จำนวนเครื่องแอร์**, หรือ **จำนวนชั่วโมงช่างรวม**<br>*Daily cap defined by job count, unit count, or total technician hours?* | เราแนะนำให้ใช้ **ทั้งสามแบบพร้อมกัน** เพราะงาน 30 นาที กับงาน 90 นาที ไม่เท่ากัน |
| C2 🔴 | ปัจจุบันรับงานได้วันละเท่าไร แยกตามประเภทงาน<br>*Actual daily limits today, per job type?* | เช่น "งานล้างไม่เกิน 8 งาน/วัน, งานซ่อมไม่เกิน 3 งาน/วัน" |
| C3 🔴 | ต้องการแยกโควตาตาม **เขตพื้นที่ให้บริการ** หรือไม่ ถ้าใช่ มีกี่เขต อะไรบ้าง<br>*Should quotas be split by service zone? List them.* | ระยะเวลาเดินทางทำให้น่าจะจำเป็น |
| C4 🔴 | นิยาม **"ขนาดงาน"** ของบริษัท (S/M/L/XL หรือคำที่บริษัทใช้เอง) และเกณฑ์แบ่งคืออะไร<br>*Define your job sizes and the criteria for each.* | ข้อกำหนดโครงการระบุถึง "ขนาดงาน" แต่มีเพียงบริษัทเท่านั้นที่นิยามได้ |
| C5 🔴 | **เวลาทำงานและวันทำงานปกติ** ทำงานวันเสาร์หรือไม่ วันอาทิตย์หรือไม่<br>*Normal working hours and days? Saturdays? Sundays?* | ขณะนี้สมมติ **จันทร์–เสาร์ 08:00–17:00** |
| C6 🟠 | ลูกค้าต้อง **จองล่วงหน้าอย่างน้อยกี่วัน**<br>*Minimum advance booking notice?* | เว็บไซต์ระบุ 3–7 วัน |
| C7 🟠 | เปิดให้จองล่วงหน้าได้ไกลสุดกี่วัน (30 / 60 / 90 วัน)<br>*How far ahead may a customer book?* | |
| C8 🟠 | หยุด **วันหยุดนักขัตฤกษ์** วันไหนบ้าง ขอรายการของปีนี้<br>*Which public holidays do you close? Please send this year's list.* | |
| C9 🟠 | ผู้ดูแลระบบสามารถ **แทรกงานเกินโควตา** ได้หรือไม่ ใครมีสิทธิ์อนุมัติ<br>*May admin override a full day? Who has that authority?* | ระบบจะบันทึกประวัติการแทรกงานทุกครั้ง |
| C10 🟠 | ต้องกัน **โควตาสำรองสำหรับงานด่วน/ฉุกเฉิน** ไว้หรือไม่ เท่าไร<br>*Reserve capacity for emergency jobs? How much?* | บริษัทโฆษณาบริการตอบสนองภายใน 24 ชม. |
| C11 🟡 | เผื่อ **เวลาเดินทาง** ระหว่างงานโดยเฉลี่ยเท่าไร<br>*Typical travel time allowance between jobs?* | ขณะนี้สมมติ 30 นาที |

---

## หมวด D — บริการ ราคา และอะไหล่
## SECTION D — Services, Pricing & Spare Parts 🟠 P1

| # | รายการ / Item | หมายเหตุ / Notes |
|---|---|---|
| D1 🔴 | **ตารางราคาปัจจุบันฉบับที่ใช้จริงภายใน** (ไม่ใช่ฉบับที่แสดงบนเว็บไซต์)<br>*Current official internal price list* | ขณะนี้เราใช้ราคาจากเว็บไซต์เป็นค่าตั้งต้นชั่วคราว |
| D2 🔴 | ยืนยันว่ายังใช้ราคา **2 ระดับ (ลูกค้าในสัญญา / ลูกค้าทั่วไป)** อยู่หรือไม่<br>*Confirm the two-tier contract vs non-contract pricing is current* | อ้างอิงจากเว็บไซต์ของบริษัท |
| D3 🟠 | ยืนยัน **ระยะเวลาทำงานมาตรฐาน** ต่อเครื่องแต่ละประเภท (30/40/60/90 นาที)<br>*Confirm standard service duration per AC type* | อ้างอิงจากเว็บไซต์ — ใช้เป็นฐานคำนวณกำลังการรับงาน |
| D4 🟠 | ราคางาน **AHU, Chiller, VRV/VRF**<br>*Pricing for AHU, Chiller, VRV/VRF work* | เว็บไซต์ระบุบริการไว้แต่ไม่ได้ลงราคา |
| D5 🟠 | **รายการอะไหล่** — ชื่ออะไหล่, รหัส, หน่วยนับ, ราคามาตรฐาน<br>*Spare parts catalogue* | ไฟล์ Excel จะดีที่สุด |
| D6 🟠 | อะไหล่ที่ **เปลี่ยนบ่อยที่สุด 15–20 รายการ**<br>*15–20 most commonly replaced parts* | ใช้จัดลำดับรายการให้ช่างเลือกได้เร็ว |
| D7 🟠 | **ระยะเวลารับประกัน** แยกตามประเภทงานและประเภทอะไหล่<br>*Warranty periods per work type and part type* | |
| D8 🟡 | โครงสร้างราคางานติดตั้ง (ค่าท่อน้ำยาส่วนเกิน, ขายึด ฯลฯ)<br>*Installation pricing structure* | |

---

## หมวด E — ลูกค้า สัญญา และข้อมูลเดิมที่มีอยู่
## SECTION E — Customers, Contracts & Existing Data 🔴 P0

| # | คำถาม / Question | หมายเหตุ / Notes |
|---|---|---|
| E1 🔴 | **มีระบบหรือไฟล์ใดที่เก็บข้อมูลลูกค้า/ประวัติงานอยู่แล้วหรือไม่** (Excel, Google Sheets, แชท LINE, โปรแกรมบัญชี) ขอตัวอย่างไฟล์<br>*Any existing system or file holding customers/jobs? Please send a sample export.* | เป็นตัวกำหนดว่าต้องทำระบบย้ายข้อมูลหรือไม่ |
| E2 🔴 | ใช้ **โปรแกรมบัญชี** อะไร (Express, FlowAccount, PEAK, SAP หรืออื่น ๆ)<br>*Which accounting software?* | สำหรับการเชื่อมต่อในอนาคต |
| E3 🟠 | มีลูกค้าที่ยัง active อยู่ประมาณกี่ราย และเป็นลูกค้าในสัญญากี่ราย<br>*Approximately how many active customers? How many are contract customers?* | ใช้กำหนดขนาดของหน้าจอและการค้นหา |
| E4 🟠 | ลูกค้านิติบุคคลรายใหญ่หนึ่งราย โดยทั่วไปมีกี่สาขา/กี่หน้างาน<br>*How many sites does a large corporate customer typically have?* | |
| E5 🟠 | ปัจจุบันบันทึกข้อมูลอะไรของ **เครื่องแอร์แต่ละเครื่อง** บ้าง (ยี่ห้อ รุ่น หมายเลขเครื่อง ตำแหน่งติดตั้ง)<br>*What do you record about each AC unit today?* | ใช้ออกแบบทะเบียนทรัพย์สินเครื่องปรับอากาศ |
| E6 🟠 | ตัวอย่าง **สัญญาบริการ** (รายปี/รายเดือน)<br>*Sample service contract* | |
| E7 🟠 | สัญญารายปีครอบคลุมอะไรบ้าง (ล้างกี่ครั้ง/ปี, ตรวจเช็คฟรี, ส่วนลดค่าอะไหล่)<br>*What's included in an annual contract?* | |
| E8 🟡 | ลูกค้านิติบุคคลต้องการ **บัญชีผู้ใช้ของตัวเอง** เพื่อดูประวัติงานและรายงานหรือไม่<br>*Do corporate customers need their own login?* | |

---

## หมวด F — ทีมช่าง การจ่ายงาน และการปฏิบัติงาน
## SECTION F — Team, Dispatch & Operations 🟠 P1

| # | คำถาม / Question | หมายเหตุ / Notes |
|---|---|---|
| F1 🔴 | มี **ช่างกี่คน** และแบ่งเป็น **กี่ทีม**<br>*How many technicians? How many crews?* | |
| F2 🔴 | งานล้างหนึ่งงานใช้ช่างกี่คน งานซ่อมใช้กี่คน<br>*Technicians per crew for cleaning vs repair?* | ขณะนี้สมมติ 2 คนสำหรับงานล้าง |
| F3 🟠 | ช่างมี **ระดับฝีมือหรือใบรับรอง** ที่จำกัดว่ารับงานประเภทไหนได้บ้างหรือไม่ (เช่น งาน Chiller ต้องช่างที่ผ่านการอบรมเท่านั้น)<br>*Skill levels or certifications restricting job assignment?* | ระบบจะล็อกไม่ให้จ่ายงานผิดคน |
| F4 🟠 | ปัจจุบัน **จ่ายงานอย่างไร** ใครเป็นคนตัดสินใจ และใช้เกณฑ์อะไร<br>*How are jobs assigned today — who decides, on what basis?* | เราจะทำระบบให้ตรงกับวิธีที่ใช้อยู่ก่อน แล้วค่อยปรับปรุง |
| F5 🟠 | ช่างใช้ **มือถือของบริษัทหรือมือถือส่วนตัว** ระบบ Android หรือ iOS<br>*Company or personal phones? Android or iOS?* | มีผลต่อการทดสอบแอป |
| F6 🟠 | **สัญญาณมือถือหน้างาน** โดยทั่วไปดีหรือไม่<br>*How good is mobile signal at typical job sites?* | เป็นเหตุผลที่เราออกแบบให้ใช้งานออฟไลน์ได้ — เราสมมติว่าสัญญาณไม่ดี |
| F7 🟠 | ใคร **อนุมัติใบเสนอราคาหน้างาน** เมื่อเจองานเพิ่ม มีวงเงินที่หัวหน้าช่างอนุมัติเองได้หรือไม่ เท่าไร<br>*Who approves an on-site quotation? Is there a value below which a lead technician can approve alone?* | ขณะนี้สมมติ: หัวหน้างานอนุมัติ / ช่างหัวหน้าทีมอนุมัติเองได้ไม่เกิน ฿2,000 |
| F8 🟠 | ใคร **ตรวจสอบและอนุมัติรายงานของช่าง** ก่อนส่งให้ลูกค้า<br>*Who reviews and approves the field report before the customer sees it?* | |
| F9 🟡 | ปัจจุบันทำงานประมาณกี่งานต่อวัน ช่วง high season กับ low season ต่างกันแค่ไหน<br>*Approximate jobs per day? Peak vs low season?* | |
| F10 🟡 | ช่างต้องลงเวลาเข้า-ออกงานหรือไม่ และต้องการให้ระบบบันทึกด้วยหรือไม่<br>*Do technicians clock in/out? Should the app record it?* | |

---

## หมวด G — เทคนิค สิทธิ์การเข้าถึง และแบรนด์
## SECTION G — Technical, Access & Branding 🟠 P1

| # | รายการ / Item | หมายเหตุ / Notes |
|---|---|---|
| G1 🔴 | **สิทธิ์จัดการ DNS ของ `nbcgroup.co.th`** — เราต้องเพิ่มโดเมนย่อย `app.nbcgroup.co.th` ใครเป็นผู้ดูแล<br>*Who manages DNS?* | |
| G2 🔴 | **ความต้องการด้านที่ตั้งเซิร์ฟเวอร์** — ข้อมูลต้องอยู่ในไทย/สิงคโปร์หรือไม่ หรือใช้คลาวด์ต่างประเทศได้ มีสัญญา hosting หรือนโยบาย IT เดิมหรือไม่<br>*Hosting and data-residency preference?* | เกี่ยวข้องกับ พ.ร.บ. คุ้มครองข้อมูลส่วนบุคคล (PDPA) |
| G3 🟠 | **LINE Official Account `@nbcservice`** — เราต้องใช้สิทธิ์ Messaging API เพื่อส่งการแจ้งเตือนสถานะงาน ใครเป็นผู้ดูแลบัญชี<br>*Who administers the LINE OA?* | เป็นช่องทางแจ้งเตือนหลัก |
| G4 🟠 | ให้ลูกค้า **เข้าสู่ระบบด้วย LINE** หรือ **เบอร์โทร + รหัส OTP**<br>*LINE login or phone OTP?* | แนะนำ LINE |
| G5 🟠 | ระบบ **อีเมล/SMTP** ของบริษัท สำหรับส่งอีเมลแจ้งเตือน<br>*Company email/SMTP setup* | |
| G6 🟠 | **คู่มือแบรนด์** ถ้ามี — สีมาตรฐาน ฟอนต์ และข้อกำหนดการใช้โลโก้<br>*Brand guidelines document, if one exists* | เราดึงค่าสีและฟอนต์จากเว็บไซต์มาใช้ก่อน ฉบับทางการจะใช้แทนที่ |
| G7 🟠 | **ใครมีอำนาจอนุมัติงานออกแบบ** ฝั่งลูกค้า<br>*Who has authority to approve the design?* | ป้องกันการแก้ไขใหญ่ในช่วงท้ายโครงการ |
| G8 🟡 | ต้องการ **ปุ่ม/ลิงก์บนเว็บไซต์เดิม** เชื่อมเข้าระบบใหม่หรือไม่ ให้อยู่ตำแหน่งไหน<br>*Link/button on the existing website? Where?* | |
| G9 🟡 | ระบบใช้ **ภาษาไทยอย่างเดียว** หรือ **ไทย + อังกฤษ** มีลูกค้าที่ต้องการเอกสารภาษาอังกฤษหรือไม่<br>*Thai-only, or Thai + English?* | สำคัญสำหรับลูกค้าโรงงานและโรงแรมต่างชาติ |

---

## หมวด H — ขอบเขตงาน
## SECTION H — Scope Boundaries 🟡 P2

| # | คำถาม / Question | หมายเหตุ / Notes |
|---|---|---|
| H1 🟠 | ระบบจบที่ **ใบงานที่อนุมัติแล้ว** (แล้วส่งต่อให้ฝ่ายบัญชี) หรือต้องออก **ใบแจ้งหนี้ / ใบกำกับภาษีอิเล็กทรอนิกส์ (e-Tax)** ด้วย<br>*Stop at the approved work order, or must it issue invoices / e-Tax invoices?* | มีผลต่อขอบเขตงานอย่างมาก |
| H2 🟠 | ต้องการระบบ **สต๊อกอะไหล่ / อะไหล่ในรถช่าง** หรือแค่บันทึกว่าใช้อะไหล่อะไรไปก็พอ<br>*Spare parts inventory / van stock tracking, or is usage logging enough?* | มีผลต่อขอบเขตงานอย่างมาก |
| H3 🟡 | ต้องการให้ระบบ **นัดหมาย PM ครั้งถัดไปอัตโนมัติ** ตามรอบ 2/3/4 ครั้งต่อปีหรือไม่<br>*Auto-schedule the next PM visit from the 2×/3×/4× per year tiers?* | เป็นระบบอัตโนมัติที่มีมูลค่าสูง และโครงสร้างที่ออกแบบไว้รองรับอยู่แล้ว |
| H4 🟡 | ต้องการให้ลูกค้า **ให้คะแนนความพึงพอใจ** หลังจบงานหรือไม่<br>*Customer satisfaction ratings after each job?* | |
| H5 🟡 | มี **รายงานสำหรับผู้บริหาร** ที่ทำอยู่ทุกวันนี้และอยากให้ระบบทำแทนหรือไม่ ขอตัวอย่าง<br>*Any management reports the dashboard should replicate? Please send samples.* | |
| H6 🟡 | ต้องการ **ติดตามตำแหน่ง GPS ของช่าง** ตลอดวันทำงาน หรือแค่บันทึกตอนเข้า-ออกหน้างาน<br>*GPS tracking during the day, or only site check-in/out?* | มีประเด็นด้านความเป็นส่วนตัวของพนักงานตาม PDPA |

---

## ลำดับการเก็บข้อมูลที่แนะนำ
## Suggested collection order

หากลูกค้าไม่สะดวกตอบทั้งหมดพร้อมกัน แนะนำให้เก็บตามลำดับนี้ เพราะจะปลดล็อกงานพัฒนาได้เร็วที่สุด

| รอบ | รายการ | ปลดล็อกอะไร |
|---|---|---|
| **รอบที่ 1** | **A1, A2, A3** (แบบฟอร์ม 3 ใบ) + **B1–B5** (กฎค่าตรวจเช็ค) + **C1–C5** (กฎโควตา) | ล็อกโครงสร้างฐานข้อมูล — ส่วนที่แก้ทีหลังแล้วแพงที่สุด |
| **รอบที่ 2** | **E1** (ข้อมูลเดิม) + **D1** (ตารางราคา) + **G1, G2** (DNS, hosting) | วางแผนย้ายข้อมูลและเลือกที่ตั้งเซิร์ฟเวอร์ |
| **รอบที่ 3** | **F1–F8** (ทีมช่างและการจ่ายงาน) + **G3, G4** (LINE) | เริ่มพัฒนาส่วนของช่างภาคสนาม |
| **รอบที่ 4** | ที่เหลือทั้งหมด | ก่อนเปิดใช้งานจริง |

---

## ข้อความสั้นสำหรับส่งให้ลูกค้า
## One-line version to send the client

> เพื่อให้เริ่มงานได้ ตอนนี้เราขอข้อมูลหลัก ๆ 3 อย่างก่อนครับ/ค่ะ
>
> **1.** รูปถ่ายหรือไฟล์ **แบบฟอร์มที่ใช้อยู่ทั้ง 3 ใบ** — ใบตรวจเช็ค/แจ้งซ่อม, ใบล้าง/PM, ใบซ่อม
> โดยขอทั้งแบบเปล่าและตัวอย่างที่กรอกจริงแล้วสัก 2–3 ใบ
>
> **2.** **ค่าเข้าตรวจเช็คหน้างานคิดเท่าไร** และถ้าลูกค้าตกลงซ่อม จะหักคืนให้เป็นส่วนลดอย่างไร
> (เต็มจำนวนหรือบางส่วน)
>
> **3.** **รับงานได้วันละกี่งาน** แยกตามประเภทงาน (ล้าง / ซ่อม / ตรวจเช็ค)
>
> ข้อมูลอื่น ๆ ทยอยส่งตามมาทีหลังได้
>
> *We mainly need three things first: (1) photos or files of your three existing work forms,
> blank and completed; (2) your inspection-fee amount and the credit rule when the customer
> proceeds; (3) how many jobs per day you can handle, by job type. Everything else can follow.*
