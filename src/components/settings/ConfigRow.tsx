'use client';

import { useActionState, useState } from 'react';
import {
  updateConfigAction,
  type ConfigFormState,
} from '@/app/(staff)/settings/assumptions/actions';
import type { ConfigValueKind } from '@/modules/platform/config.service';

/**
 * One configuration row, editable in place.
 *
 * Edit opens on demand rather than rendering every row as a form. This page
 * lists twenty-eight values, most of which nobody is here to change, and a
 * screen of open inputs invites a stray keystroke into the inspection fee.
 *
 * The editor offered follows the type already stored: a number stays a number,
 * a switch is a switch, and anything structured gets a JSON box that refuses
 * to save until it parses. The alternative — one free-text field for
 * everything — lets `inspection.fee.default` quietly become the string "500",
 * which does not fail here but inside whatever arithmetic reads it later.
 */

const input =
  'w-full border border-[var(--color-line)] rounded-[3px] px-3 py-2 text-sm bg-white ' +
  'focus:outline-none focus:border-[var(--color-brand-blue)]';

function format(value: unknown): string {
  return typeof value === 'string' ? value : JSON.stringify(value, null, 2);
}

export function ConfigRow({
  configKey,
  value,
  description,
  isAssumption,
  kind,
}: {
  configKey: string;
  value: unknown;
  description: string | null;
  isAssumption: boolean;
  kind: ConfigValueKind;
}) {
  const [state, action, pending] = useActionState<ConfigFormState, FormData>(
    updateConfigAction,
    {},
  );
  const [open, setOpen] = useState(false);

  // The row re-renders from the server after a save, so closing on success
  // shows the new value rather than the box that produced it.
  const justSaved = state.saved && state.key === configKey;
  if (justSaved && open) setOpen(false);

  return (
    <tr className="border-b border-[var(--color-line)] align-top">
      <td className="py-3 pl-4 pr-3">
        <code className="text-[12px] text-[var(--color-brand-blue-600)]">{configKey}</code>
        {isAssumption && (
          <span className="block mt-1 text-[10px] text-[var(--color-brand-orange-600)]">
            ค่าสมมติ
          </span>
        )}
      </td>

      <td className="py-3 pr-3 min-w-[220px]">
        {open ? (
          <form action={action} className="space-y-2">
            <input type="hidden" name="key" value={configKey} />
            {kind === 'boolean' ? (
              <select name="value" defaultValue={String(value)} className={input}>
                <option value="true">true — เปิด</option>
                <option value="false">false — ปิด</option>
              </select>
            ) : kind === 'json' ? (
              <textarea
                name="value"
                defaultValue={format(value)}
                rows={6}
                className={input + ' font-mono text-[12px]'}
              />
            ) : (
              <input
                name="value"
                defaultValue={String(value)}
                inputMode={kind === 'number' ? 'decimal' : undefined}
                className={input}
              />
            )}
            <div className="flex items-center gap-2">
              <button
                disabled={pending}
                className="bg-[var(--color-brand-orange)] text-white rounded-[3px] px-4 py-1.5 text-sm font-semibold disabled:opacity-60"
              >
                {pending ? 'กำลังบันทึก…' : 'บันทึก'}
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-[12px] text-[var(--color-muted)]"
              >
                ยกเลิก
              </button>
            </div>
          </form>
        ) : (
          <pre className="text-[13px] whitespace-pre-wrap break-words font-mono">
            {format(value)}
          </pre>
        )}

        {state.key === configKey && state.error && (
          <p className="text-[12px] text-[var(--color-status-cancelled)] mt-1">{state.error}</p>
        )}
        {state.key === configKey && state.unchanged && (
          <p className="text-[12px] text-[var(--color-muted)] mt-1">ค่าเดิม ไม่มีอะไรเปลี่ยน</p>
        )}
      </td>

      <td className="py-3 pr-3 text-[13px] text-[var(--color-muted)]">{description}</td>

      <td className="py-3 pr-4 text-right whitespace-nowrap">
        {!open && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="text-[13px] text-[var(--color-brand-blue-600)]"
          >
            แก้ไข
          </button>
        )}
      </td>
    </tr>
  );
}

/**
 * A feature's presence in this build, stated — not a control.
 *
 * These were rendered as toggles and nothing in the application ever consulted
 * them, so pressing one changed a row and no behaviour. The giveaway was LINE
 * notifications showing "off" while they had been delivering real messages for
 * a week. A switch nobody obeys is worse than a label, because somebody
 * eventually trusts it and turns something "off" that keeps running.
 *
 * The list still earns its place — invoicing and parts stock are genuinely out
 * of scope and the client asks about both — so it says what is in the build
 * and offers nothing to press.
 */
export function FlagRow({
  flagKey,
  enabled,
  description,
}: {
  flagKey: string;
  enabled: boolean;
  description: string | null;
}) {
  return (
    <tr className="border-b border-[var(--color-line)] last:border-0 align-top">
      <td className="py-3 pl-4 pr-3">
        <code className="text-[12px] text-[var(--color-brand-blue-600)]">{flagKey}</code>
      </td>
      <td className="py-3 pr-3 w-40">
        <span
          className={
            'inline-block rounded-[3px] px-2 py-0.5 text-[12px] ' +
            (enabled
              ? 'bg-[#e8f6ee] text-[#16a34a]'
              : 'bg-[#f1f5f9] text-[#64748b]')
          }
        >
          {enabled ? 'มีในระบบแล้ว' : 'ไม่รวมในขอบเขต'}
        </span>
      </td>
      <td className="py-3 pr-4 text-[13px] text-[var(--color-muted)]">{description}</td>
    </tr>
  );
}
