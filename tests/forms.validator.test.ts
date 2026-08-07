import { describe, it, expect } from 'vitest';
import { buildValidator, flattenFields } from '../src/lib/forms/types';
import { FORM_TEMPLATES_CURRENT, FORM_TEMPLATES_V1 } from '../src/lib/forms/templates';

/**
 * The form engine validates payloads against a schema that is DATA, so the
 * validator has to follow whatever that data says — including the parts table,
 * whose columns differ per form. A validator that assumes a fixed row shape
 * rejects every row the renderer produces, which is exactly what happened with
 * NBC's ใบซ่อม: it prints ลำดับ / รายการ / จำนวน / หน่วย and no price column.
 *
 * Pure functions — no database needed.
 */

describe('parts table follows its declared columns', () => {
  const repair = FORM_TEMPLATES_CURRENT.REPAIR;
  const validator = buildValidator(repair);

  // Exactly what FormRenderer sends: only the keys the technician touched.
  // Sections they never opened — acUnit, symptoms, note, warranty — are absent
  // entirely, not present-and-empty.
  const base = {
    customer: { customerName: 'ลูกค้า', tel: '0812345678' },
    photosBefore: ['before.jpg'],
    photosAfter: ['after.jpg'],
    inspectorSign: { inspectorSignature: 'sig-a' },
    technicianSign: { technicianSignature: 'sig-b' },
  };

  it('accepts rows keyed by the columns the form actually prints', () => {
    const result = validator.safeParse({
      ...base,
      parts: [
        { description: 'เปลี่ยนคาปาซิเตอร์', qty: '1', unit: 'ตัว' },
        { description: 'ล้างคอยล์ร้อน', qty: '1', unit: 'เครื่อง' },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('accepts an empty parts table — not every repair replaces a part', () => {
    expect(validator.safeParse({ ...base, parts: [] }).success).toBe(true);
  });

  it('accepts a form whose untouched sections were never sent at all', () => {
    // The bug this pins: sections validated as required objects, so a form the
    // technician filled correctly was rejected with errors naming whole
    // sections — which says nothing about which box to fill.
    const result = validator.safeParse({ ...base, parts: [] });
    expect(result.success).toBe(true);
  });

  it('still rejects a form that is missing a required signature', () => {
    const { technicianSign: _omitted, ...withoutSignature } = base;
    const result = validator.safeParse({ ...withoutSignature, parts: [] });
    expect(result.success).toBe(false);
  });

  it('reports a missing required field at section.field, not at the section', () => {
    const result = validator.safeParse({ ...base, customer: { customerName: 'ไม่ใส่เบอร์' } });
    expect(result.success).toBe(false);

    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join('.'));
      // 'customer.tel' is actionable; a bare 'customer' is not.
      expect(paths).toContain('customer.tel');
    }
  });
});

describe('every published template builds a usable validator', () => {
  // Named tuples, not raw schemas: it.each stringifies its arguments into the
  // test name, and a whole form schema there is unreadable.
  const templates = [
    ...Object.entries(FORM_TEMPLATES_V1),
    ...Object.entries(FORM_TEMPLATES_CURRENT),
  ].map(([code, schema]) => ({ name: `${code} v${schema.version}`, schema }));

  it.each(templates)('$name parses an empty object without throwing', ({ schema }) => {
    // safeParse may legitimately fail on required fields; what must never
    // happen is the validator itself blowing up, which would take the whole
    // work-order screen down rather than showing field errors.
    expect(() => buildValidator(schema).safeParse({})).not.toThrow();
  });

  it.each(templates)('$name has unique field keys', ({ schema }) => {
    // Duplicate keys silently overwrite each other in the payload, so one of
    // the two fields would never be saved.
    const keys = flattenFields(schema)
      .filter((f) => f.kind !== 'section')
      .map((f) => f.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
