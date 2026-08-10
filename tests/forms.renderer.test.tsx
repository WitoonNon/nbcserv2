/**
 * @vitest-environment jsdom
 */
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FormRenderer } from '@/components/forms/FormRenderer';
import { buildValidator } from '@/lib/forms/types';
import { FORM_TEMPLATES_CURRENT } from '@/lib/forms/templates';

/**
 * The renderer and the validator have to agree on the SHAPE of the payload,
 * and only a test that drives the real UI can prove they do.
 *
 * tests/forms.validator.test.ts builds its payloads by hand, so it can only
 * ever confirm the validator agrees with itself — which is how the renderer
 * came to write every section's answers flat (`{tel: ...}`) while the
 * validator read them nested (`{customer: {tel: ...}}`). Every field a
 * technician filled inside a section was invisible to submit.
 */

const REPAIR = FORM_TEMPLATES_CURRENT.REPAIR;

afterEach(cleanup);

/** Mirrors WorkOrderEditor: the parent owns the payload so it can save it. */
function Harness({ seen }: { seen: { payload: Record<string, unknown> } }) {
  const [payload, setPayload] = useState<Record<string, unknown>>({});
  seen.payload = payload;
  return <FormRenderer schema={REPAIR} values={payload} onChange={setPayload} />;
}

function renderForm() {
  const seen = { payload: {} as Record<string, unknown> };
  render(<Harness seen={seen} />);
  return { seen, user: userEvent.setup() };
}

describe('what the renderer writes is what the validator reads', () => {
  it('nests a section field under its section key', async () => {
    const { seen, user } = renderForm();

    await user.type(screen.getByLabelText(/ชื่อลูกค้า/), 'บริษัททดสอบ');

    expect(seen.payload).toEqual({ customer: { customerName: 'บริษัททดสอบ' } });
    // The flat spelling is what the validator silently discards.
    expect(seen.payload).not.toHaveProperty('customerName');
  });

  it('leaves sections the technician never opened out of the payload entirely', async () => {
    const { seen, user } = renderForm();

    await user.type(screen.getByLabelText(/ชื่อลูกค้า/), 'ก');

    // Absent, not present-and-empty — the distinction bug #4 turned on.
    expect(Object.keys(seen.payload)).toEqual(['customer']);
  });

  it('satisfies the validator for the fields it filled', async () => {
    const { seen, user } = renderForm();

    await user.type(screen.getByLabelText(/ชื่อลูกค้า/), 'บริษัททดสอบ');
    // The section also has เบอร์โทรติดต่อ, so match the (Tel) suffix.
    await user.type(screen.getByLabelText(/เบอร์โทร\s*\(Tel\)/), '0812345678');

    const issues = buildValidator(REPAIR).safeParse(seen.payload);
    const paths = issues.success ? [] : issues.error.issues.map((i) => i.path.join('.'));

    // Signatures are still missing — 2.3 — so the parse legitimately fails.
    // What must not appear is a complaint about the two boxes just filled in.
    expect(paths).not.toContain('customer.customerName');
    expect(paths).not.toContain('customer.tel');
  });

  it('resolves visibleWhen against the sibling field, not the whole payload', async () => {
    const { user } = renderForm();

    expect(screen.queryByLabelText(/ระบุประเภทอื่นๆ/)).toBeNull();
    // By role, because the symptoms section has a text field labelled อื่นๆ too.
    await user.click(screen.getByRole('radio', { name: 'อื่นๆ' }));

    expect(screen.getByLabelText(/ระบุประเภทอื่นๆ/)).toBeTruthy();
  });

  it('round-trips a saved payload back into the inputs', () => {
    // Reopening a draft has to show what was typed; a renderer reading from a
    // different shape than it writes would come back blank.
    render(
      <FormRenderer
        schema={REPAIR}
        values={{ customer: { customerName: 'ลูกค้าเดิม', tel: '021234567' } }}
        onChange={() => {}}
      />,
    );

    expect(screen.getByLabelText(/ชื่อลูกค้า/)).toHaveProperty('value', 'ลูกค้าเดิม');
  });
});
