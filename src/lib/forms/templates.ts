import type { FormSchema } from './types';

/**
 * v1 drafts of the three work-order forms.
 *
 * These are placeholders built from what NBC already publishes: their
 * work-process page specifies the measurements a technician records (voltage,
 * amperage, refrigerant pressure, evaporator inlet temperature) and their
 * troubleshooting page lists the standard first checks. That makes the drafts
 * recognisable rather than invented.
 *
 * @client-confirm A1/A2/A3 — replace with version 2 built field-for-field from
 * the client's real paper forms. Publishing v2 is inserting a FormTemplate row;
 * every work order already issued keeps rendering against v1.
 */

const standardMeasurements = {
  key: 'measurements',
  kind: 'measurementGroup' as const,
  labelTh: 'ค่าที่วัดได้',
  labelEn: 'Measurements',
  measurements: [
    { key: 'volts', labelTh: 'แรงดันไฟฟ้า', unit: 'V' },
    { key: 'amps', labelTh: 'กระแสไฟฟ้า', unit: 'A' },
    { key: 'refrigerantPressurePsi', labelTh: 'แรงดันน้ำยา', unit: 'psi' },
    { key: 'evapInletTempC', labelTh: 'อุณหภูมิลมเข้าคอยล์เย็น', unit: '°C' },
    { key: 'supplyTempC', labelTh: 'อุณหภูมิลมจ่าย', unit: '°C' },
    { key: 'returnTempC', labelTh: 'อุณหภูมิลมกลับ', unit: '°C' },
  ],
};

const customerSignature = {
  key: 'customerSignature',
  kind: 'signature' as const,
  labelTh: 'ลายเซ็นลูกค้า',
  labelEn: 'Customer signature',
  signerRole: 'CUSTOMER' as const,
  required: true,
};

const technicianSignature = {
  key: 'technicianSignature',
  kind: 'signature' as const,
  labelTh: 'ลายเซ็นช่างผู้ปฏิบัติงาน',
  labelEn: 'Technician signature',
  signerRole: 'TECHNICIAN' as const,
  required: true,
};

// ---------------------------------------------------------------------------
// Form 1 — ใบตรวจเช็ค/แจ้งซ่อม
// ---------------------------------------------------------------------------

export const INSPECTION_REQUEST_V1: FormSchema = {
  version: 1,
  titleTh: 'ใบตรวจเช็ค / แจ้งซ่อม',
  titleEn: 'Inspection / Repair Request Form',
  fields: [
    {
      key: 'problem',
      kind: 'section',
      labelTh: 'อาการที่แจ้ง',
      fields: [
        {
          key: 'reportedSymptom',
          kind: 'select',
          labelTh: 'อาการเบื้องต้น',
          required: true,
          options: [
            { value: 'NOT_COLD', labelTh: 'แอร์ไม่เย็น' },
            { value: 'NOT_START', labelTh: 'แอร์เปิดไม่ติด' },
            { value: 'WATER_LEAK', labelTh: 'มีน้ำหยด/รั่ว' },
            { value: 'NOISE', labelTh: 'มีเสียงผิดปกติ' },
            { value: 'ODOUR', labelTh: 'มีกลิ่น' },
            { value: 'OTHER', labelTh: 'อื่น ๆ' },
          ],
        },
        { key: 'symptomDetail', kind: 'textarea', labelTh: 'รายละเอียดเพิ่มเติม', maxLength: 1000 },
      ],
    },
    {
      key: 'firstChecks',
      kind: 'section',
      labelTh: 'การตรวจสอบเบื้องต้น',
      helpTh: 'ตามขั้นตอนมาตรฐานที่ NBC ใช้อยู่',
      fields: [
        { key: 'breakerOn', kind: 'checkbox', labelTh: 'ตรวจสอบเบรกเกอร์อยู่ในสถานะ ON' },
        { key: 'remoteMode', kind: 'checkbox', labelTh: 'ตรวจสอบ MODE ที่รีโมท' },
        { key: 'wiringOk', kind: 'checkbox', labelTh: 'ตรวจสอบระบบไฟและสายสัญญาณ' },
        { key: 'connectionsOk', kind: 'checkbox', labelTh: 'ตรวจสอบจุดเชื่อมต่อ' },
        { key: 'coilDirty', kind: 'checkbox', labelTh: 'พบความสกปรกที่คอยล์เย็น/คอยล์ร้อน' },
      ],
    },
    { key: 'assets', kind: 'assetList', labelTh: 'เครื่องที่ตรวจเช็ค' },
    { ...standardMeasurements },
    {
      key: 'findings',
      kind: 'section',
      labelTh: 'ผลการตรวจเช็ค',
      fields: [
        { key: 'findingsText', kind: 'textarea', labelTh: 'สิ่งที่ตรวจพบ', required: true },
        { key: 'rootCause', kind: 'textarea', labelTh: 'สาเหตุ' },
        { key: 'recommendation', kind: 'textarea', labelTh: 'ข้อเสนอแนะ / งานที่ควรทำต่อ' },
        {
          key: 'requiresRepair',
          kind: 'select',
          labelTh: 'ต้องซ่อมต่อหรือไม่',
          required: true,
          options: [
            { value: 'YES', labelTh: 'ต้องซ่อม — เสนอราคา' },
            { value: 'NO', labelTh: 'ไม่ต้องซ่อม' },
          ],
        },
      ],
    },
    {
      key: 'photosBefore',
      kind: 'photoGroup',
      labelTh: 'รูปก่อนดำเนินการ',
      attachmentKind: 'BEFORE',
      minCount: 1,
      required: true,
    },
    { key: 'photosDefect', kind: 'photoGroup', labelTh: 'รูปจุดที่พบปัญหา', attachmentKind: 'DEFECT' },
    { ...technicianSignature },
    { ...customerSignature },
  ],
};

// ---------------------------------------------------------------------------
// Form 2 — ใบล้าง/PM
// ---------------------------------------------------------------------------

export const CLEANING_PM_V1: FormSchema = {
  version: 1,
  titleTh: 'ใบล้างแอร์ / บำรุงรักษาเชิงป้องกัน (PM)',
  titleEn: 'Cleaning & Preventive Maintenance Form',
  fields: [
    { key: 'assets', kind: 'assetList', labelTh: 'รายการเครื่องที่ให้บริการ', required: true },
    {
      key: 'checklist',
      kind: 'section',
      labelTh: 'ขั้นตอนการปฏิบัติงาน',
      helpTh: 'ตามขั้นตอน 4 ขั้นมาตรฐานของบริษัท',
      repeatPerAsset: true,
      fields: [
        { key: 'preCheckDone', kind: 'checkbox', labelTh: 'ตรวจสอบการทำงานก่อนล้าง' },
        { key: 'powerIsolated', kind: 'checkbox', labelTh: 'ตัดระบบไฟฟ้าก่อนปฏิบัติงาน' },
        { key: 'coverInstalled', kind: 'checkbox', labelTh: 'ติดตั้งผ้าคลุมป้องกันความเสียหาย' },
        { key: 'coilWashed', kind: 'checkbox', labelTh: 'ล้างคอยล์เย็นด้วยปั๊มแรงดันสูง' },
        { key: 'condenserWashed', kind: 'checkbox', labelTh: 'ล้างคอยล์ร้อน (คอนเดนเซอร์)' },
        { key: 'drainCleared', kind: 'checkbox', labelTh: 'ทำความสะอาดท่อน้ำทิ้ง' },
        { key: 'filterCleaned', kind: 'checkbox', labelTh: 'ทำความสะอาดแผ่นกรองอากาศ' },
        { key: 'blowerCleaned', kind: 'checkbox', labelTh: 'ทำความสะอาดโบลเวอร์/ใบพัด' },
        { key: 'electricalChecked', kind: 'checkbox', labelTh: 'ตรวจสอบจุดต่อทางไฟฟ้า' },
        { key: 'reassembled', kind: 'checkbox', labelTh: 'ประกอบกลับและตรวจสอบความเรียบร้อย' },
        { key: 'testRun', kind: 'checkbox', labelTh: 'ทดสอบการทำงานหลังล้าง' },
      ],
    },
    { ...standardMeasurements },
    {
      key: 'result',
      kind: 'section',
      labelTh: 'สรุปผลงาน',
      fields: [
        {
          key: 'condition',
          kind: 'select',
          labelTh: 'สภาพเครื่องหลังบำรุงรักษา',
          required: true,
          options: [
            { value: 'NORMAL', labelTh: 'ปกติ ใช้งานได้ดี' },
            { value: 'WATCH', labelTh: 'ใช้งานได้ แต่ควรเฝ้าระวัง' },
            { value: 'NEEDS_REPAIR', labelTh: 'ต้องซ่อม/เปลี่ยนอะไหล่' },
          ],
        },
        { key: 'recommendation', kind: 'textarea', labelTh: 'ข้อเสนอแนะ' },
        { key: 'nextPmDate', kind: 'date', labelTh: 'กำหนดล้างครั้งถัดไป' },
      ],
    },
    {
      key: 'photosBefore',
      kind: 'photoGroup',
      labelTh: 'รูปก่อนล้าง',
      attachmentKind: 'BEFORE',
      minCount: 1,
      required: true,
    },
    {
      key: 'photosAfter',
      kind: 'photoGroup',
      labelTh: 'รูปหลังล้าง',
      attachmentKind: 'AFTER',
      minCount: 1,
      required: true,
    },
    { ...technicianSignature },
    { ...customerSignature },
  ],
};

// ---------------------------------------------------------------------------
// Form 3 — ใบซ่อม
// ---------------------------------------------------------------------------

export const REPAIR_V1: FormSchema = {
  version: 1,
  titleTh: 'ใบซ่อม',
  titleEn: 'Repair Job Form',
  fields: [
    { key: 'assets', kind: 'assetList', labelTh: 'เครื่องที่ซ่อม', required: true },
    {
      key: 'diagnosis',
      kind: 'section',
      labelTh: 'การวิเคราะห์และแก้ไข',
      fields: [
        { key: 'findingsText', kind: 'textarea', labelTh: 'สิ่งที่ตรวจพบ', required: true },
        { key: 'rootCause', kind: 'textarea', labelTh: 'สาเหตุของปัญหา', required: true },
        { key: 'actionTaken', kind: 'textarea', labelTh: 'วิธีการแก้ไข', required: true },
        {
          key: 'repairResult',
          kind: 'select',
          labelTh: 'ผลการซ่อม',
          required: true,
          options: [
            { value: 'FIXED', labelTh: 'ซ่อมเสร็จ ใช้งานได้ปกติ' },
            { value: 'TEMPORARY', labelTh: 'แก้ไขชั่วคราว ต้องตามงานต่อ' },
            { value: 'PENDING_PARTS', labelTh: 'รออะไหล่' },
            { value: 'UNRESOLVED', labelTh: 'ยังแก้ไขไม่ได้' },
          ],
        },
      ],
    },
    { key: 'parts', kind: 'partsTable', labelTh: 'อะไหล่ที่เปลี่ยน' },
    { ...standardMeasurements },
    {
      key: 'warranty',
      kind: 'section',
      labelTh: 'การรับประกัน',
      fields: [
        { key: 'warrantyMonths', kind: 'number', labelTh: 'ระยะเวลารับประกันงานซ่อม', unit: 'เดือน' },
        { key: 'warrantyNote', kind: 'textarea', labelTh: 'เงื่อนไขการรับประกัน' },
      ],
    },
    {
      key: 'photosBefore',
      kind: 'photoGroup',
      labelTh: 'รูปก่อนซ่อม',
      attachmentKind: 'BEFORE',
      minCount: 1,
      required: true,
    },
    {
      key: 'photosAfter',
      kind: 'photoGroup',
      labelTh: 'รูปหลังซ่อม',
      attachmentKind: 'AFTER',
      minCount: 1,
      required: true,
    },
    { key: 'photosNameplate', kind: 'photoGroup', labelTh: 'รูปเนมเพลท/อะไหล่', attachmentKind: 'NAMEPLATE' },
    { ...technicianSignature },
    { ...customerSignature },
  ],
};

// ---------------------------------------------------------------------------
// Form 3 v2 — ใบซ่อม, rebuilt field-for-field from the client's real paper form
// ("SERVICE WORK ORDER", received 2026-07-28).
//
// Differences from our v1 guess, all now corrected:
//   · warranty is quoted in DAYS (วัน), not months
//   · the parts table has NO price column — the customer copy shows
//     รายการ / จำนวน / หน่วย only, 8 pre-drawn rows
//   · one AC unit per form (brand/model/serial/BTU are single fields),
//     not a multi-asset list
//   · AC types on the form are only 3 + อื่นๆ, not our 10-value enum
//   · signature roles are ผู้ตรวจรับ and ผู้ซ่อมบำรุง, each with
//     ชื่อ / ตำแหน่ง / วันที่
//   · no measurement fields on this form (those came from the website's
//     work-process page and belong on the PM form instead)
//
// Photo fields are marked as digital-only additions — they do not exist on
// the paper original.
// ---------------------------------------------------------------------------

export const REPAIR_V2: FormSchema = {
  version: 2,
  titleTh: 'ใบซ่อม',
  titleEn: 'Service Work Order',
  fields: [
    {
      key: 'customer',
      kind: 'section',
      labelTh: '1. ข้อมูลลูกค้า',
      labelEn: 'Customer Information',
      fields: [
        { key: 'customerName', kind: 'text', labelTh: 'ชื่อลูกค้า', labelEn: 'Customer Name', required: true },
        { key: 'tel', kind: 'text', labelTh: 'เบอร์โทร', labelEn: 'Tel', required: true },
        { key: 'address', kind: 'textarea', labelTh: 'ที่อยู่', labelEn: 'Address' },
        { key: 'email', kind: 'text', labelTh: 'E-mail' },
        { key: 'contactTel', kind: 'text', labelTh: 'เบอร์โทรติดต่อ' },
      ],
    },
    {
      key: 'acUnit',
      kind: 'section',
      labelTh: '2. ข้อมูลเครื่องปรับอากาศ',
      labelEn: 'Air Conditioner Information',
      fields: [
        { key: 'brand', kind: 'text', labelTh: 'ยี่ห้อ', labelEn: 'Brand' },
        { key: 'model', kind: 'text', labelTh: 'รุ่น', labelEn: 'Model' },
        { key: 'btu', kind: 'text', labelTh: 'ขนาด (BTU)' },
        { key: 'serialNo', kind: 'text', labelTh: 'Serial No.' },
        { key: 'location', kind: 'text', labelTh: 'ตำแหน่งติดตั้ง', labelEn: 'Location' },
        {
          key: 'acType',
          kind: 'select',
          labelTh: 'ประเภทเครื่อง',
          options: [
            { value: 'WALL', labelTh: 'แบบติดผนัง', labelEn: 'Wall Type' },
            { value: 'CASSETTE', labelTh: 'แบบฝังฝ้า', labelEn: 'Cassette' },
            { value: 'FLOOR_CEILING', labelTh: 'แบบตั้งพื้น/แขวน', labelEn: 'Floor/Ceiling' },
            { value: 'OTHER', labelTh: 'อื่นๆ' },
          ],
        },
        {
          key: 'acTypeOther',
          kind: 'text',
          labelTh: 'ระบุประเภทอื่นๆ',
          visibleWhen: { key: 'acType', equals: ['OTHER'] },
        },
      ],
    },
    {
      key: 'symptoms',
      kind: 'section',
      labelTh: '3. อาการเสีย',
      labelEn: 'Symptoms',
      fields: [
        {
          key: 'symptomList',
          kind: 'multiselect',
          labelTh: 'อาการที่พบ',
          options: [
            { value: 'NOT_COLD', labelTh: 'ไม่เย็น' },
            { value: 'NOT_START', labelTh: 'เปิดไม่ติด' },
            { value: 'NOISE', labelTh: 'เสียงดัง' },
            { value: 'WATER_LEAK', labelTh: 'น้ำหยด / น้ำรั่ว' },
            { value: 'WEAK_AIRFLOW', labelTh: 'ลมไม่ออก / ลมอ่อน' },
            { value: 'ODOUR', labelTh: 'มีกลิ่นอับ / กลิ่นไม่พึงประสงค์' },
            { value: 'REMOTE_FAIL', labelTh: 'รีโมทใช้ไม่ได้' },
            { value: 'ERROR_CODE', labelTh: 'ไฟกระพริบ / โชว์ Error' },
          ],
        },
        { key: 'symptomOther', kind: 'text', labelTh: 'อื่นๆ' },
      ],
    },
    {
      key: 'parts',
      kind: 'partsTable',
      labelTh: '4. รายการซ่อม / เปลี่ยนอะไหล่',
      labelEn: 'Repair / Spare Parts',
      minRows: 8,
      columns: [
        { key: 'no', labelTh: 'ลำดับ', width: '60px' },
        { key: 'description', labelTh: 'รายการ' },
        { key: 'qty', labelTh: 'จำนวน', width: '110px' },
        { key: 'unit', labelTh: 'หน่วย', width: '110px' },
      ],
    },
    {
      key: 'note',
      kind: 'section',
      labelTh: '5. หมายเหตุ',
      labelEn: 'Note',
      fields: [{ key: 'noteText', kind: 'textarea', labelTh: 'หมายเหตุ' }],
    },
    {
      key: 'warranty',
      kind: 'section',
      labelTh: '6. การรับประกัน',
      labelEn: 'Warranty',
      fields: [
        { key: 'warrantyRepairDays', kind: 'number', labelTh: 'รับประกันงานซ่อม', unit: 'วัน', min: 0 },
        { key: 'warrantyPartsDays', kind: 'number', labelTh: 'รับประกันอะไหล่', unit: 'วัน', min: 0 },
      ],
    },

    // --- digital-only additions (not on the paper form) --------------------
    {
      key: 'photosBefore',
      kind: 'photoGroup',
      labelTh: 'รูปก่อนซ่อม',
      helpTh: 'เพิ่มจากฉบับกระดาษ',
      attachmentKind: 'BEFORE',
      minCount: 1,
    },
    {
      key: 'photosAfter',
      kind: 'photoGroup',
      labelTh: 'รูปหลังซ่อม',
      helpTh: 'เพิ่มจากฉบับกระดาษ',
      attachmentKind: 'AFTER',
      minCount: 1,
    },

    {
      key: 'inspectorSign',
      kind: 'section',
      labelTh: 'ลงชื่อผู้ตรวจรับ',
      fields: [
        { key: 'inspectorName', kind: 'text', labelTh: 'ชื่อ' },
        { key: 'inspectorPosition', kind: 'text', labelTh: 'ตำแหน่ง' },
        { key: 'inspectorDate', kind: 'date', labelTh: 'วันที่' },
        {
          key: 'inspectorSignature',
          kind: 'signature',
          labelTh: 'ลายเซ็น',
          signerRole: 'CUSTOMER',
          required: true,
        },
      ],
    },
    {
      key: 'technicianSign',
      kind: 'section',
      labelTh: 'ลงชื่อผู้ซ่อมบำรุง',
      fields: [
        { key: 'technicianName', kind: 'text', labelTh: 'ชื่อ' },
        { key: 'technicianPosition', kind: 'text', labelTh: 'ตำแหน่ง' },
        { key: 'technicianDate', kind: 'date', labelTh: 'วันที่' },
        {
          key: 'technicianSignature',
          kind: 'signature',
          labelTh: 'ลายเซ็น',
          signerRole: 'TECHNICIAN',
          required: true,
        },
      ],
    },
  ],
};

export const FORM_TEMPLATES_V1 = {
  INSPECTION_REQUEST: INSPECTION_REQUEST_V1,
  CLEANING_PM: CLEANING_PM_V1,
  REPAIR: REPAIR_V1,
} as const;

/** Latest published version per form code. */
export const FORM_TEMPLATES_CURRENT = {
  INSPECTION_REQUEST: INSPECTION_REQUEST_V1,
  CLEANING_PM: CLEANING_PM_V1,
  REPAIR: REPAIR_V2,
} as const;
