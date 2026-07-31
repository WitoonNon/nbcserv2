import { z } from 'zod';

/**
 * Dynamic form engine.
 *
 * The three work-order forms are DATA, not code: a FormTemplate row holds a
 * schema of this shape, the renderer walks it, and a zod validator is derived
 * from it. When the client sends their real paper forms (@client-confirm
 * A1/A2/A3) we publish version 2 — no migration, no redeploy of form code, and
 * every document already issued still renders against its own version.
 */

export const fieldKinds = [
  'section',
  'text',
  'textarea',
  'number',
  'select',
  'multiselect',
  'checkbox',
  'date',
  'time',
  'measurementGroup',
  'photoGroup',
  'partsTable',
  'assetList',
  'signature',
] as const;

export type FieldKind = (typeof fieldKinds)[number];

export interface BaseField {
  key: string;
  kind: FieldKind;
  labelTh: string;
  labelEn?: string;
  required?: boolean;
  helpTh?: string;
  /** Show only when another field has one of these values. */
  visibleWhen?: { key: string; equals: (string | number | boolean)[] };
}

export interface TextField extends BaseField {
  kind: 'text' | 'textarea';
  maxLength?: number;
  placeholderTh?: string;
}

export interface NumberField extends BaseField {
  kind: 'number';
  unit?: string;
  min?: number;
  max?: number;
  step?: number;
}

export interface ChoiceField extends BaseField {
  kind: 'select' | 'multiselect';
  options: { value: string; labelTh: string; labelEn?: string }[];
}

export interface CheckboxField extends BaseField {
  kind: 'checkbox';
}

export interface DateTimeField extends BaseField {
  kind: 'date' | 'time';
}

export interface SectionField extends BaseField {
  kind: 'section';
  fields: FormField[];
  /** Repeat this section once per AC unit on the job. */
  repeatPerAsset?: boolean;
}

/**
 * Mirrors Step 4 of NBC's own published work process, which already requires
 * recording voltage, amperage, refrigerant pressure and evaporator inlet
 * temperature. Using their existing fields is what makes the digital form
 * recognisable to technicians on day one.
 */
export interface MeasurementGroupField extends BaseField {
  kind: 'measurementGroup';
  measurements: { key: string; labelTh: string; unit: string; min?: number; max?: number }[];
}

export interface PhotoGroupField extends BaseField {
  kind: 'photoGroup';
  attachmentKind: 'BEFORE' | 'AFTER' | 'DEFECT' | 'NAMEPLATE' | 'SERIAL' | 'OTHER';
  minCount?: number;
  maxCount?: number;
}

export interface PartsTableField extends BaseField {
  kind: 'partsTable';
  /** Columns as printed on the paper form. NBC's ใบซ่อม shows no price column
   *  — the customer copy lists items and quantities only. */
  columns?: { key: string; labelTh: string; width?: string }[];
  /** Pre-drawn blank rows on the paper form, kept so the PDF matches. */
  minRows?: number;
}

export interface AssetListField extends BaseField {
  kind: 'assetList';
}

export interface SignatureField extends BaseField {
  kind: 'signature';
  signerRole: 'CUSTOMER' | 'TECHNICIAN' | 'SUPERVISOR';
}

export type FormField =
  | TextField
  | NumberField
  | ChoiceField
  | CheckboxField
  | DateTimeField
  | SectionField
  | MeasurementGroupField
  | PhotoGroupField
  | PartsTableField
  | AssetListField
  | SignatureField;

export interface FormSchema {
  /** Bumped whenever the field set changes; stored on every work order. */
  version: number;
  titleTh: string;
  titleEn?: string;
  fields: FormField[];
}

// ---------------------------------------------------------------------------
// Validator derivation
// ---------------------------------------------------------------------------

function fieldValidator(field: FormField): z.ZodTypeAny {
  switch (field.kind) {
    case 'section':
      return z.object(Object.fromEntries(field.fields.map((f) => [f.key, fieldValidator(f)])));
    case 'number': {
      let s = z.number();
      if (field.min !== undefined) s = s.min(field.min);
      if (field.max !== undefined) s = s.max(field.max);
      return field.required ? s : s.nullish();
    }
    case 'checkbox':
      return field.required ? z.boolean() : z.boolean().nullish();
    case 'multiselect':
      return z.array(z.string());
    case 'measurementGroup':
      return z.record(z.string(), z.number().nullish());
    case 'photoGroup': {
      const s = z.array(z.string());
      return field.minCount ? s.min(field.minCount) : s;
    }
    case 'partsTable':
      return z.array(
        z.object({
          partId: z.string().nullish(),
          name: z.string(),
          qty: z.number(),
          unitPrice: z.number(),
          serialNo: z.string().nullish(),
        }),
      );
    case 'assetList':
      return z.array(z.string());
    case 'signature':
      return field.required ? z.string().min(1) : z.string().nullish();
    default: {
      const s = z.string();
      return field.required ? s.min(1) : s.nullish();
    }
  }
}

/** Build a zod schema for a template's payload. */
export function buildValidator(schema: FormSchema): z.ZodTypeAny {
  return z.object(Object.fromEntries(schema.fields.map((f) => [f.key, fieldValidator(f)])));
}

/** Flatten nested sections — used by the PDF renderer and the CSV export. */
export function flattenFields(schema: FormSchema): FormField[] {
  const out: FormField[] = [];
  const walk = (fields: FormField[]) => {
    for (const f of fields) {
      out.push(f);
      if (f.kind === 'section') walk(f.fields);
    }
  };
  walk(schema.fields);
  return out;
}
