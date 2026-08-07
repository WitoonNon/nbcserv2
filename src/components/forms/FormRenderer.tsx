'use client';

import { useState } from 'react';
import type { FormField, FormSchema } from '@/lib/forms/types';

/**
 * Renders any FormTemplate schema.
 *
 * Nothing here knows about ใบซ่อม, ใบล้าง or ใบตรวจเช็ค specifically — the
 * three forms are rows of data. Publishing a new version of a form changes
 * what this renders without touching this file.
 */

function Label({ field }: { field: FormField }) {
  return (
    <span className="block text-[13px] text-[var(--color-ink)] mb-1">
      {field.labelTh}
      {field.labelEn && <span className="text-[var(--color-muted)] text-[11px] ml-1.5">({field.labelEn})</span>}
      {field.required && <span className="text-[var(--color-status-cancelled)] ml-1">*</span>}
      {field.helpTh && (
        <span className="assumption-badge ml-2 !text-[10px]">{field.helpTh}</span>
      )}
    </span>
  );
}

const inputCls =
  'w-full border border-[var(--color-line)] rounded-[3px] px-2.5 py-1.5 text-sm bg-white ' +
  'focus:outline-none focus:border-[var(--color-brand-blue)] focus:ring-1 focus:ring-[var(--color-brand-blue)] ' +
  'disabled:bg-[var(--color-surface-alt)] disabled:text-[var(--color-muted)]';

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <span className="block text-[11px] text-[var(--color-status-cancelled)] mt-0.5">{message}</span>
  );
}

interface FieldProps {
  field: FormField;
  values: Record<string, unknown>;
  setValue: (k: string, v: unknown) => void;
  errors: Record<string, string>;
  readOnly: boolean;
}

function Field({ field, values, setValue, errors, readOnly }: FieldProps) {
  if (field.visibleWhen) {
    const current = values[field.visibleWhen.key];
    if (!field.visibleWhen.equals.includes(current as string)) return null;
  }

  const error = errors[field.key];
  const errorRing = error ? ' !border-[var(--color-status-cancelled)]' : '';

  switch (field.kind) {
    case 'section':
      return (
        <fieldset className="card overflow-hidden">
          <legend className="sr-only">{field.labelTh}</legend>
          <div className="bg-[var(--color-brand-navy)] text-white px-3 py-2 flex items-baseline gap-2">
            <span className="font-[family-name:var(--font-heading)] text-[15px]">{field.labelTh}</span>
            {field.labelEn && <span className="text-[11px] text-white/60">({field.labelEn})</span>}
          </div>
          <div className="p-3 grid gap-3 sm:grid-cols-2">
            {field.fields.map((f) => (
              <div key={f.key} className={f.kind === 'textarea' || f.kind === 'multiselect' ? 'sm:col-span-2' : ''}>
                <Field field={f} values={values} setValue={setValue} errors={errors} readOnly={readOnly} />
              </div>
            ))}
          </div>
        </fieldset>
      );

    case 'textarea':
      return (
        <label className="block">
          <Label field={field} />
          <textarea rows={2} className={inputCls + errorRing} disabled={readOnly}
            value={(values[field.key] as string) ?? ''}
            onChange={(e) => setValue(field.key, e.target.value)} />
          <FieldError message={error} />
        </label>
      );

    case 'number':
      return (
        <label className="block">
          <Label field={field} />
          <span className="flex items-center gap-2">
            <input type="number" className={inputCls + errorRing} disabled={readOnly}
              value={(values[field.key] as number) ?? ''}
              onChange={(e) =>
                setValue(field.key, Number.isNaN(e.target.valueAsNumber) ? null : e.target.valueAsNumber)} />
            {field.unit && <span className="text-sm text-[var(--color-muted)] shrink-0">{field.unit}</span>}
          </span>
          <FieldError message={error} />
        </label>
      );

    case 'select':
      return (
        <div>
          <Label field={field} />
          <div className="flex flex-wrap gap-x-5 gap-y-2 pt-0.5">
            {field.options.map((o) => (
              <label key={o.value} className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="radio" name={field.key} value={o.value} disabled={readOnly}
                  checked={values[field.key] === o.value}
                  onChange={() => setValue(field.key, o.value)}
                  className="size-4 accent-[var(--color-brand-orange)]" />
                {o.labelTh}
                {o.labelEn && <span className="text-[11px] text-[var(--color-muted)]">({o.labelEn})</span>}
              </label>
            ))}
          </div>
          <FieldError message={error} />
        </div>
      );

    case 'multiselect': {
      const selected = (values[field.key] as string[]) ?? [];
      return (
        <div>
          <Label field={field} />
          <div className="grid gap-y-2 gap-x-4 sm:grid-cols-3">
            {field.options.map((o) => (
              <label key={o.value} className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={selected.includes(o.value)} disabled={readOnly}
                  onChange={(e) =>
                    setValue(field.key, e.target.checked
                      ? [...selected, o.value]
                      : selected.filter((v) => v !== o.value))}
                  className="size-4 accent-[var(--color-brand-orange)]" />
                {o.labelTh}
              </label>
            ))}
          </div>
          <FieldError message={error} />
        </div>
      );
    }

    case 'checkbox':
      return (
        <label className="flex items-center gap-2 text-sm cursor-pointer py-1">
          <input type="checkbox" checked={Boolean(values[field.key])} disabled={readOnly}
            onChange={(e) => setValue(field.key, e.target.checked)}
            className="size-4 accent-[var(--color-brand-orange)]" />
          {field.labelTh}
        </label>
      );

    case 'partsTable': {
      const cols = field.columns ?? [
        { key: 'description', labelTh: 'รายการ' },
        { key: 'qty', labelTh: 'จำนวน' },
      ];
      const stored = Array.isArray(values[field.key])
        ? (values[field.key] as Record<string, unknown>[])
        : [];
      // The paper form has pre-drawn blank rows; keep them so the printed PDF
      // matches, but never render fewer rows than the technician has filled.
      const rowCount = Math.max(field.minRows ?? 5, stored.length);

      const setCell = (rowIndex: number, colKey: string, cellValue: string) => {
        const next = Array.from({ length: rowCount }, (_, i) => ({ ...(stored[i] ?? {}) }));
        next[rowIndex]![colKey] = cellValue;
        // Blank trailing rows are layout, not data — storing them would put
        // empty objects in the payload and into the PDF's parts list.
        const lastFilled = next.reduce(
          (last, row, i) => (Object.values(row).some((v) => String(v ?? '').trim()) ? i : last),
          -1,
        );
        setValue(field.key, next.slice(0, lastFilled + 1));
      };

      return (
        <fieldset className="card overflow-hidden">
          <div className="bg-[var(--color-brand-navy)] text-white px-3 py-2 flex items-baseline gap-2">
            <span className="font-[family-name:var(--font-heading)] text-[15px]">{field.labelTh}</span>
            {field.labelEn && <span className="text-[11px] text-white/60">({field.labelEn})</span>}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse min-w-[520px]">
              <thead>
                <tr className="bg-[var(--color-brand-blue)] text-white">
                  {cols.map((c) => (
                    <th key={c.key} style={{ width: c.width }}
                      className="px-2 py-1.5 font-normal text-[13px] border border-[var(--color-brand-blue-600)]">
                      {c.labelTh}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: rowCount }, (_, i) => (
                  <tr key={i}>
                    {cols.map((c) => (
                      <td key={c.key} className="border border-[var(--color-line)] p-0">
                        {c.key === 'no' ? (
                          <span className="block text-center py-1.5 text-[var(--color-muted)]">{i + 1}</span>
                        ) : (
                          <input
                            disabled={readOnly}
                            value={String(stored[i]?.[c.key] ?? '')}
                            onChange={(e) => setCell(i, c.key, e.target.value)}
                            className="w-full px-2 py-1.5 text-sm bg-transparent focus:outline-none focus:bg-[var(--color-brand-sky-50)] disabled:text-[var(--color-muted)]"
                          />
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <FieldError message={error} />
        </fieldset>
      );
    }

    // Photo upload and signature capture land in 2.2 and 2.3. Until the storage
    // adapter is real these render as placeholders, but the payload keys they
    // will write are already validated, so nothing about saving changes then.
    case 'photoGroup':
      return (
        <div>
          <Label field={field} />
          <div className="flex gap-2 flex-wrap">
            {[0, 1, 2].map((i) => (
              <div key={i}
                className="size-20 border-2 border-dashed border-[var(--color-line)] rounded grid place-items-center text-[var(--color-muted)] text-2xl">
                +
              </div>
            ))}
          </div>
          <p className="text-[11px] text-[var(--color-muted)] mt-1">
            แนบรูปได้ในเวอร์ชันถัดไป
            {field.minCount ? ` · ต้องมีอย่างน้อย ${field.minCount} รูป` : ''}
          </p>
          <FieldError message={error} />
        </div>
      );

    case 'signature':
      return (
        <div>
          <Label field={field} />
          <div className="h-20 border border-dashed border-[var(--color-line)] rounded bg-white grid place-items-center text-[var(--color-muted)] text-xs">
            เซ็นที่นี่
          </div>
        </div>
      );

    case 'assetList':
      return (
        <div>
          <Label field={field} />
          <div className="border border-[var(--color-line)] rounded p-3 text-sm text-[var(--color-muted)] bg-white">
            เลือกเครื่องจากทะเบียนของหน้างาน
          </div>
        </div>
      );

    case 'measurementGroup': {
      const readings = (values[field.key] ?? {}) as Record<string, number | null>;
      return (
        <fieldset className="card overflow-hidden sm:col-span-2">
          <div className="bg-[var(--color-brand-navy)] text-white px-3 py-2 font-[family-name:var(--font-heading)] text-[15px]">
            {field.labelTh}
          </div>
          <div className="p-3 grid gap-3 sm:grid-cols-3">
            {field.measurements.map((m) => (
              <label key={m.key} className="block">
                <span className="block text-[13px] mb-1">{m.labelTh}</span>
                <span className="flex items-center gap-2">
                  <input type="number" className={inputCls} disabled={readOnly}
                    min={m.min} max={m.max}
                    value={readings[m.key] ?? ''}
                    onChange={(e) =>
                      setValue(field.key, {
                        ...readings,
                        [m.key]: Number.isNaN(e.target.valueAsNumber) ? null : e.target.valueAsNumber,
                      })} />
                  <span className="text-sm text-[var(--color-muted)] shrink-0">{m.unit}</span>
                </span>
              </label>
            ))}
          </div>
          <FieldError message={error} />
        </fieldset>
      );
    }

    default:
      return (
        <label className="block">
          <Label field={field} />
          <input className={inputCls + errorRing} disabled={readOnly}
            value={(values[field.key] as string) ?? ''}
            onChange={(e) => setValue(field.key, e.target.value)} />
          <FieldError message={error} />
        </label>
      );
  }
}

/**
 * Controlled when `values` is supplied — the work-order editor owns the payload
 * so it can save it. Falls back to internal state for the template preview
 * screen, which has nothing to save it to.
 */
export function FormRenderer({
  schema,
  values: controlled,
  onChange,
  errors = {},
  readOnly = false,
}: {
  schema: FormSchema;
  values?: Record<string, unknown>;
  onChange?: (next: Record<string, unknown>) => void;
  errors?: Record<string, string>;
  readOnly?: boolean;
}) {
  const [internal, setInternal] = useState<Record<string, unknown>>({});
  const values = controlled ?? internal;

  const setValue = (k: string, v: unknown) => {
    const next = { ...values, [k]: v };
    if (onChange) onChange(next);
    else setInternal(next);
  };

  return (
    <div className="space-y-3">
      {schema.fields.map((f) => (
        <Field key={f.key} field={f} values={values} setValue={setValue}
          errors={errors} readOnly={readOnly} />
      ))}
    </div>
  );
}
