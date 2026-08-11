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
      // A section is a container, not an answer. The renderer only writes keys
      // the technician actually touches, so an untouched section is absent
      // rather than empty — validating it as a required object rejected the
      // form with errors naming whole sections, which tells nobody what to fix.
      // Treating absent as {} keeps the required fields INSIDE it enforced,
      // and reports them at section.field where the renderer can mark them.
      return z.preprocess(
        (v) => v ?? {},
        z.object(Object.fromEntries(field.fields.map((f) => [f.key, fieldValidator(f)]))),
      );
    case 'number': {
      let s = z.number();
      if (field.min !== undefined) s = s.min(field.min);
      if (field.max !== undefined) s = s.max(field.max);
      return field.required ? s : s.nullish();
    }
    case 'checkbox':
      return field.required ? z.boolean() : z.boolean().nullish();
    // List-valued fields are absent, not empty, until the technician touches
    // them. Requiring them unconditionally made every optional checklist and
    // photo group block submission — `required` has to mean something here for
    // the same reason it does on a text field.
    case 'multiselect':
      return field.required ? z.array(z.string()).min(1) : z.array(z.string()).nullish();
    case 'assetList':
      return field.required ? z.array(z.string()).min(1) : z.array(z.string()).nullish();
    case 'measurementGroup':
      return z.record(z.string(), z.number().nullish()).nullish();
    case 'photoGroup': {
      // minCount describes how many photos a filled-in group needs; it does
      // not by itself make the group mandatory.
      if (!field.required) return z.array(z.string()).nullish();
      return z.array(z.string()).min(field.minCount ?? 1);
    }
    case 'partsTable':
      // Derived from the declared columns rather than a fixed shape. NBC's
      // ใบซ่อม prints ลำดับ / รายการ / จำนวน / หน่วย and deliberately no price
      // column, so a validator hardcoding {name, qty, unitPrice} rejects every
      // row the renderer produces. The table is part of the form definition,
      // so its row shape has to come from the definition too.
      return z.array(z.record(z.string(), z.union([z.string(), z.number(), z.null()]))).nullish();
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

/**
 * Write a signature's storage key into the payload at wherever the schema puts
 * that signer.
 *
 * Signing needs the payload INCLUDING the new key, because that is what gets
 * hashed — and React state has not flushed at the moment the handler runs. The
 * schema is the only thing that knows the field sits at `technicianSign
 * .technicianSignature` rather than at the top level, so the path is derived
 * from it rather than assumed.
 */
export function writeSignatureKey(
  schema: FormSchema,
  payload: Record<string, unknown>,
  signerRole: SignatureField['signerRole'],
  storageKey: string,
): Record<string, unknown> {
  const walk = (fields: FormField[], current: Record<string, unknown>): Record<string, unknown> => {
    let next = current;
    for (const f of fields) {
      if (f.kind === 'signature' && f.signerRole === signerRole) {
        next = { ...next, [f.key]: storageKey };
      } else if (f.kind === 'section') {
        const inner = (next[f.key] as Record<string, unknown>) ?? {};
        const updated = walk(f.fields, inner);
        // Untouched sections stay absent — the same rule the validator relies
        // on everywhere else.
        if (updated !== inner) next = { ...next, [f.key]: updated };
      }
    }
    return next;
  };

  return walk(schema.fields, payload);
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
