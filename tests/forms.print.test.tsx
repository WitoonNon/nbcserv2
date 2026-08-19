/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { FormPrint, type PrintSignature } from '@/components/forms/FormPrint';
import { FORM_TEMPLATES_CURRENT } from '@/lib/forms/templates';
import type { FormSchema } from '@/lib/forms/types';

/**
 * What the paper says.
 *
 * Print bugs are the ones nobody catches by looking at the application: the
 * screen is correct in every case below and the paper is wrong. So these
 * assertions are about the printed artefact — is the blank line still there to
 * write on, does the unticked option survive, does the warning that a
 * signature no longer matches make it onto a page somebody hands to a
 * customer.
 *
 * Rendered in jsdom rather than against a real browser because what is being
 * checked is the DOM the print stylesheet is given. The stylesheet itself —
 * page breaks, mm sizing, whether Chrome honours print-color-adjust — is not
 * testable here and is verified by printing the page.
 */

const REPAIR = FORM_TEMPLATES_CURRENT.REPAIR;

afterEach(cleanup);

function print(schema: FormSchema, payload: Record<string, unknown> = {}, signatures = {}) {
  const { container } = render(
    <FormPrint schema={schema} payload={payload} signatures={signatures} />,
  );
  return container;
}

describe('a blank form is still a usable form', () => {
  it('prints a ruled line for every unanswered field', () => {
    const container = print(REPAIR);

    const values = container.querySelectorAll('.fld__value');
    expect(values.length).toBeGreaterThan(0);
    // Empty, but present. A field that collapses to nothing when unanswered
    // gives the technician nowhere to write when the tablet is flat, which is
    // the situation a printed work order exists for.
    for (const v of values) {
      // A unit label ("วัน", "°C") is printed furniture that belongs to the
      // blank line, not an answer written on it.
      const unit = v.querySelector('.fld__unit')?.textContent ?? '';
      expect(v.textContent?.replace(unit, '')).toBe('');
    }
  });

  it('keeps the pre-drawn blank rows of a parts table', () => {
    const schema: FormSchema = {
      version: 1,
      titleTh: 'ทดสอบ',
      fields: [
        {
          key: 'parts',
          kind: 'partsTable',
          labelTh: 'รายการอะไหล่',
          minRows: 5,
          columns: [
            { key: 'no', labelTh: 'ลำดับ' },
            { key: 'description', labelTh: 'รายการ' },
          ],
        },
      ],
    };

    const container = print(schema, { parts: [{ no: 1, description: 'คอมเพรสเซอร์' }] });

    // One row filled, four still blank — not one row total.
    expect(container.querySelectorAll('tbody tr')).toHaveLength(5);
    expect(screen.getByText('คอมเพรสเซอร์')).toBeTruthy();
  });
});

describe('choices print as boxes, not as the answer alone', () => {
  const schema: FormSchema = {
    version: 1,
    titleTh: 'ทดสอบ',
    fields: [
      {
        key: 'result',
        kind: 'select',
        labelTh: 'ผลการตรวจ',
        options: [
          { value: 'ok', labelTh: 'ปกติ' },
          { value: 'fix', labelTh: 'ต้องซ่อม' },
          { value: 'replace', labelTh: 'ต้องเปลี่ยน' },
        ],
      },
    ],
  };

  it('shows every option that was on offer, with one ticked', () => {
    const container = print(schema, { result: 'fix' });

    // All three, because what the alternatives were is half of what a paper
    // checklist records — printing only "ต้องซ่อม" loses that.
    expect(container.querySelectorAll('.box')).toHaveLength(3);
    expect(container.querySelectorAll('.box--on')).toHaveLength(1);
    expect(screen.getByText('ต้องเปลี่ยน')).toBeTruthy();
  });

  it('ticks nothing when the question was left unanswered', () => {
    const container = print(schema);
    expect(container.querySelectorAll('.box--on')).toHaveLength(0);
  });
});

describe('questions that were never asked are not printed as unanswered ones', () => {
  const schema: FormSchema = {
    version: 1,
    titleTh: 'ทดสอบ',
    fields: [
      {
        key: 'needsParts',
        kind: 'select',
        labelTh: 'ต้องใช้อะไหล่หรือไม่',
        options: [
          { value: 'yes', labelTh: 'ใช่' },
          { value: 'no', labelTh: 'ไม่' },
        ],
      },
      {
        key: 'partName',
        kind: 'text',
        labelTh: 'ชื่ออะไหล่',
        visibleWhen: { key: 'needsParts', equals: ['yes'] },
      },
    ],
  };

  it('omits a conditional field whose condition is unmet', () => {
    print(schema, { needsParts: 'no' });
    // On paper, a blank "ชื่ออะไหล่" line reads as an omission by the
    // technician rather than a question the form never put to them.
    expect(screen.queryByText('ชื่ออะไหล่')).toBeNull();
  });

  it('prints it once the condition is met', () => {
    print(schema, { needsParts: 'yes', partName: 'คาปาซิเตอร์' });
    expect(screen.getByText('คาปาซิเตอร์')).toBeTruthy();
  });
});

describe('signatures', () => {
  const schema: FormSchema = {
    version: 1,
    titleTh: 'ทดสอบ',
    fields: [
      {
        key: 'customerSign',
        kind: 'signature',
        labelTh: 'ลายเซ็นลูกค้า',
        signerRole: 'CUSTOMER',
      },
    ],
  };

  const signed = (matchesCurrentPayload: boolean): Record<string, PrintSignature> => ({
    CUSTOMER: {
      signerName: 'คุณสมชาย ใจดี',
      signerPosition: 'ผู้ตรวจรับ',
      storageKey: '202608/WorkOrder/wo1/SIGNATURE/sig.png',
      signedAt: '2026-08-19T04:00:00.000Z',
      matchesCurrentPayload,
    },
  });

  it('prints the warning when the form was edited after signing', () => {
    print(schema, {}, signed(false));

    // The screen shows this as a badge somebody can weigh up. Printed and
    // handed over, an unmarked stale signature is indistinguishable from a
    // valid one — so it has to survive onto the paper.
    expect(screen.getByText(/เซ็นไม่ตรงกับเนื้อหาปัจจุบัน/)).toBeTruthy();
  });

  it('says nothing when the signature still covers the document', () => {
    print(schema, {}, signed(true));
    expect(screen.queryByText(/เซ็นไม่ตรงกับเนื้อหาปัจจุบัน/)).toBeNull();
    expect(screen.getByText(/คุณสมชาย ใจดี/)).toBeTruthy();
  });

  it('leaves a signing line when nobody has signed yet', () => {
    const container = print(schema, {}, {});
    expect(container.querySelector('.sign__pad')).toBeTruthy();
    expect(container.querySelector('.sign__pad img')).toBeNull();
  });
});

describe('photographs', () => {
  const schema: FormSchema = {
    version: 1,
    titleTh: 'ทดสอบ',
    fields: [
      {
        key: 'before',
        kind: 'photoGroup',
        labelTh: 'ภาพก่อนซ่อม',
        attachmentKind: 'BEFORE',
      },
    ],
  };

  it('renders a real img through the authorised media route', () => {
    const container = print(schema, { before: ['202608/WorkOrder/wo1/BEFORE/a.jpg'] });

    const img = container.querySelector('img');
    // A CSS background would be dropped by the printer's default settings, and
    // the full key must be addressed through /api/media so the access check
    // still runs.
    expect(img?.getAttribute('src')).toBe('/api/media/202608/WorkOrder/wo1/BEFORE/a.jpg');
  });

  it('prints no empty frames when no photograph was taken', () => {
    const container = print(schema, {});
    expect(container.querySelector('.photos')).toBeNull();
  });
});

describe('dates', () => {
  it('prints the Buddhist year, and does not slip a day doing it', () => {
    const schema: FormSchema = {
      version: 1,
      titleTh: 'ทดสอบ',
      fields: [{ key: 'visitedOn', kind: 'date', labelTh: 'วันที่เข้าตรวจ' }],
    };

    print(schema, { visitedOn: '2026-08-19' });

    // 2026 + 543. The date is split by hand rather than parsed as a Date,
    // because `new Date('2026-08-19')` is UTC midnight — the same trap that
    // bites @db.Date columns elsewhere in this codebase.
    expect(screen.getByText('19 ส.ค. 2569')).toBeTruthy();
  });
});

describe('the real repair form', () => {
  it('prints filled answers from inside nested sections', () => {
    print(REPAIR, { customer: { customerName: 'โรงแรมทดสอบ', tel: '021234567' } });

    expect(screen.getByText('โรงแรมทดสอบ')).toBeTruthy();
    expect(screen.getByText('021234567')).toBeTruthy();
  });
});
