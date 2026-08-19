import type { FormField, FormSchema } from '@/lib/forms/types';
import { mediaUrl } from '@/lib/media/key';
import { formatThaiDate } from '@/lib/date/buddhist';

/**
 * The paper form.
 *
 * Walks the same FormSchema as FormRenderer, so a template published tomorrow
 * prints without anything here changing. It is a separate component rather
 * than a `readOnly` mode of the renderer because the two disagree about what a
 * field IS: on screen an unanswered field is a disabled input, and on paper it
 * is a ruled line somebody can write on. Trying to serve both from one tree is
 * what produces printouts covered in grey boxes.
 *
 * A server component — nothing here is interactive, and keeping it off the
 * client means the payload is never shipped to the browser twice.
 */

export interface PrintSignature {
  signerName: string;
  signerPosition: string | null;
  storageKey: string;
  signedAt: string;
  matchesCurrentPayload: boolean;
}

function Label({ field }: { field: FormField }) {
  return (
    <span className="fld__label">
      {field.labelTh}
      {field.labelEn && <i> ({field.labelEn})</i>}
    </span>
  );
}

/**
 * Render one stored answer as text.
 *
 * Dates are split by hand rather than passed through `new Date(string)`:
 * `new Date('2026-08-19')` is parsed as midnight UTC, and the same bug that
 * bites `@db.Date` columns elsewhere in this codebase would print the day
 * before for anyone west of Greenwich.
 */
function asText(field: FormField, raw: unknown): string {
  if (raw === null || raw === undefined || raw === '') return '';

  if (field.kind === 'date') {
    const parts = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(raw));
    if (!parts) return String(raw);
    return formatThaiDate(new Date(Number(parts[1]), Number(parts[2]) - 1, Number(parts[3])));
  }

  if (typeof raw === 'boolean') return raw ? 'ใช่' : 'ไม่ใช่';
  return String(raw);
}

interface FieldProps {
  field: FormField;
  values: Record<string, unknown>;
  signatures: Record<string, PrintSignature>;
}

function Field({ field, values, signatures }: FieldProps) {
  // The same visibility rule the screen applies. A question the technician was
  // never shown must not appear on the printout as an unanswered one.
  if (field.visibleWhen) {
    const current = values[field.visibleWhen.key];
    if (!field.visibleWhen.equals.includes(current as string)) return null;
  }

  const raw = values[field.key];

  switch (field.kind) {
    case 'section': {
      const inner = (raw as Record<string, unknown>) ?? {};
      return (
        <fieldset className="sec">
          <div className="sec__head">
            {field.labelTh}
            {field.labelEn && <span>({field.labelEn})</span>}
          </div>
          <div className="sec__body">
            {field.fields.map((f) => (
              <Field key={f.key} field={f} values={inner} signatures={signatures} />
            ))}
          </div>
        </fieldset>
      );
    }

    case 'textarea':
      return (
        <div className="fld wide">
          <Label field={field} />
          <span className="fld__value fld__value--multiline">{asText(field, raw)}</span>
        </div>
      );

    case 'number':
      return (
        <div className="fld">
          <Label field={field} />
          <span className="fld__value">
            {asText(field, raw)}
            {field.unit && <span className="fld__unit">{field.unit}</span>}
          </span>
        </div>
      );

    case 'select':
      // Every option is printed with its box, and the chosen one is filled.
      // Printing only the answer would lose what the alternatives were, which
      // is half of what a paper checklist records.
      return (
        <div className="fld">
          <Label field={field} />
          <div className="opts">
            {field.options.map((o) => (
              <span key={o.value} className="opt">
                <span className={'box' + (raw === o.value ? ' box--on' : '')} />
                {o.labelTh}
              </span>
            ))}
          </div>
        </div>
      );

    case 'multiselect': {
      const chosen = Array.isArray(raw) ? (raw as string[]) : [];
      return (
        <div className="fld wide">
          <Label field={field} />
          <div className="opts opts--grid">
            {field.options.map((o) => (
              <span key={o.value} className="opt">
                <span className={'box' + (chosen.includes(o.value) ? ' box--on' : '')} />
                {o.labelTh}
              </span>
            ))}
          </div>
        </div>
      );
    }

    case 'checkbox':
      return (
        <div className="fld">
          <span className="opt">
            <span className={'box' + (raw ? ' box--on' : '')} />
            {field.labelTh}
          </span>
        </div>
      );

    case 'measurementGroup': {
      const readings = (raw ?? {}) as Record<string, number | null>;
      return (
        <div className="tbl-wrap">
          <table className="tbl">
            <caption>{field.labelTh}</caption>
            <thead>
              <tr>
                {field.measurements.map((m) => (
                  <th key={m.key}>
                    {m.labelTh} ({m.unit})
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                {field.measurements.map((m) => (
                  <td key={m.key}>{readings[m.key] ?? ''}</td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      );
    }

    case 'partsTable': {
      const cols = field.columns ?? [
        { key: 'description', labelTh: 'รายการ' },
        { key: 'qty', labelTh: 'จำนวน' },
      ];
      const rows = Array.isArray(raw) ? (raw as Record<string, unknown>[]) : [];
      // The paper form has pre-drawn blank rows. Keeping them means a printout
      // can be added to by hand on site, which is the whole reason the parts
      // list is on paper at all.
      const count = Math.max(field.minRows ?? 5, rows.length);

      return (
        <div className="tbl-wrap">
          <table className="tbl">
            <caption>{field.labelTh}</caption>
            <thead>
              <tr>
                {cols.map((c) => (
                  <th key={c.key} style={{ width: c.width }}>
                    {c.labelTh}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: count }, (_, i) => (
                <tr key={i}>
                  {cols.map((c) => (
                    <td key={c.key} className={c.key === 'no' ? 'num' : undefined}>
                      {c.key === 'no' ? i + 1 : String(rows[i]?.[c.key] ?? '')}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }

    case 'photoGroup': {
      const keys = Array.isArray(raw) ? (raw as string[]) : [];
      if (keys.length === 0) return null;
      return (
        <div className="photos">
          <Label field={field} />
          <div className="photos__grid">
            {keys.map((key, i) => (
              <figure key={key} className="photo">
                {/* A plain <img>, not a CSS background and not next/image.
                    Backgrounds are dropped by default when printing, and the
                    optimiser's srcset would have the printer pick a screen-
                    sized variant. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={mediaUrl(key)} alt={`${field.labelTh} ${i + 1}`} />
                <figcaption>
                  {field.labelTh} {i + 1}
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      );
    }

    case 'signature': {
      const recorded = signatures[field.signerRole];
      return (
        <div className="sign">
          <Label field={field} />
          <div className="sign__pad">
            {recorded && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={mediaUrl(recorded.storageKey)} alt={`ลายเซ็น ${recorded.signerName}`} />
            )}
          </div>
          <div className="sign__name">
            {recorded ? `( ${recorded.signerName} )` : '(                              )'}
            <small>
              {recorded?.signerPosition ?? field.labelTh}
              {recorded && ` · ${formatThaiDate(new Date(recorded.signedAt))}`}
            </small>
          </div>
          {recorded && !recorded.matchesCurrentPayload && (
            <span className="sign__stale">
              เซ็นไม่ตรงกับเนื้อหาปัจจุบัน — ใบงานถูกแก้ไขหลังลงลายเซ็น
            </span>
          )}
        </div>
      );
    }

    case 'assetList': {
      const items = Array.isArray(raw) ? (raw as string[]) : [];
      return (
        <div className="fld wide">
          <Label field={field} />
          <span className="fld__value">{items.join(' · ')}</span>
        </div>
      );
    }

    default:
      return (
        <div className="fld">
          <Label field={field} />
          <span className="fld__value">{asText(field, raw)}</span>
        </div>
      );
  }
}

export function FormPrint({
  schema,
  payload,
  signatures,
}: {
  schema: FormSchema;
  payload: Record<string, unknown>;
  /** Keyed by signer role — CUSTOMER, TECHNICIAN, SUPERVISOR. */
  signatures: Record<string, PrintSignature>;
}) {
  return (
    <>
      {schema.fields.map((f) => (
        <Field key={f.key} field={f} values={payload} signatures={signatures} />
      ))}
    </>
  );
}
