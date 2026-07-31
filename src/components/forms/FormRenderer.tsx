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
  'focus:outline-none focus:border-[var(--color-brand-blue)] focus:ring-1 focus:ring-[var(--color-brand-blue)]';

function Field({ field, values, setValue }: {
  field: FormField;
  values: Record<string, unknown>;
  setValue: (k: string, v: unknown) => void;
}) {
  if (field.visibleWhen) {
    const current = values[field.visibleWhen.key];
    if (!field.visibleWhen.equals.includes(current as string)) return null;
  }

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
                <Field field={f} values={values} setValue={setValue} />
              </div>
            ))}
          </div>
        </fieldset>
      );

    case 'textarea':
      return (
        <label className="block">
          <Label field={field} />
          <textarea rows={2} className={inputCls} value={(values[field.key] as string) ?? ''}
            onChange={(e) => setValue(field.key, e.target.value)} />
        </label>
      );

    case 'number':
      return (
        <label className="block">
          <Label field={field} />
          <span className="flex items-center gap-2">
            <input type="number" className={inputCls} value={(values[field.key] as number) ?? ''}
              onChange={(e) => setValue(field.key, e.target.valueAsNumber)} />
            {field.unit && <span className="text-sm text-[var(--color-muted)] shrink-0">{field.unit}</span>}
          </span>
        </label>
      );

    case 'select':
      return (
        <div>
          <Label field={field} />
          <div className="flex flex-wrap gap-x-5 gap-y-2 pt-0.5">
            {field.options.map((o) => (
              <label key={o.value} className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="radio" name={field.key} value={o.value}
                  checked={values[field.key] === o.value}
                  onChange={() => setValue(field.key, o.value)}
                  className="size-4 accent-[var(--color-brand-orange)]" />
                {o.labelTh}
                {o.labelEn && <span className="text-[11px] text-[var(--color-muted)]">({o.labelEn})</span>}
              </label>
            ))}
          </div>
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
                <input type="checkbox" checked={selected.includes(o.value)}
                  onChange={(e) =>
                    setValue(field.key, e.target.checked
                      ? [...selected, o.value]
                      : selected.filter((v) => v !== o.value))}
                  className="size-4 accent-[var(--color-brand-orange)]" />
                {o.labelTh}
              </label>
            ))}
          </div>
        </div>
      );
    }

    case 'checkbox':
      return (
        <label className="flex items-center gap-2 text-sm cursor-pointer py-1">
          <input type="checkbox" checked={Boolean(values[field.key])}
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
      const rows = Array.from({ length: field.minRows ?? 5 });
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
                {rows.map((_, i) => (
                  <tr key={i}>
                    {cols.map((c) => (
                      <td key={c.key} className="border border-[var(--color-line)] p-0">
                        {c.key === 'no' ? (
                          <span className="block text-center py-1.5 text-[var(--color-muted)]">{i + 1}</span>
                        ) : (
                          <input className="w-full px-2 py-1.5 text-sm bg-transparent focus:outline-none focus:bg-[var(--color-brand-sky-50)]" />
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </fieldset>
      );
    }

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
          {field.minCount && (
            <p className="text-[11px] text-[var(--color-muted)] mt-1">
              ต้องมีอย่างน้อย {field.minCount} รูป
            </p>
          )}
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

    case 'measurementGroup':
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
                  <input type="number" className={inputCls} />
                  <span className="text-sm text-[var(--color-muted)] shrink-0">{m.unit}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      );

    default:
      return (
        <label className="block">
          <Label field={field} />
          <input className={inputCls} value={(values[field.key] as string) ?? ''}
            onChange={(e) => setValue(field.key, e.target.value)} />
        </label>
      );
  }
}

export function FormRenderer({ schema }: { schema: FormSchema }) {
  const [values, setValues] = useState<Record<string, unknown>>({});
  const setValue = (k: string, v: unknown) => setValues((s) => ({ ...s, [k]: v }));

  return (
    <div className="space-y-3">
      {schema.fields.map((f) => (
        <Field key={f.key} field={f} values={values} setValue={setValue} />
      ))}
    </div>
  );
}
