import { logoutAction } from '@/app/login/actions';

const ROLE_LABEL: Record<string, string> = {
  SUPER_ADMIN: 'ผู้ดูแลระบบสูงสุด',
  ADMIN: 'ธุรการ',
  DISPATCHER: 'ผู้จ่ายงาน',
  SUPERVISOR: 'หัวหน้างาน',
  TECHNICIAN: 'ช่างเทคนิค',
  ACCOUNTING: 'บัญชี',
  CUSTOMER: 'ลูกค้า',
};

/**
 * First grapheme of the given name.
 *
 * Thai must be split by grapheme cluster, not by code unit: slicing "ผู้"
 * at 2 UTF-16 units yields "ผู" and drops the tone mark. Names here are also
 * "<role/title> <given name>" (e.g. "ผู้จ่ายงาน สมชาย"), so the last token is
 * the part a person actually recognises.
 */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  const given = parts[parts.length - 1] ?? name;
  const segmenter = new Intl.Segmenter('th', { granularity: 'grapheme' });
  const graphemes = [...segmenter.segment(given)].map((s) => s.segment);
  return graphemes.slice(0, 2).join('') || 'NB';
}

export function UserMenu({ name, roles }: { name: string; roles: string[] }) {
  return (
    <div className="flex items-center gap-3 text-xs">
      <span className="hidden md:flex flex-col items-end leading-tight">
        <span className="text-white">{name}</span>
        <span className="text-white/60">
          {roles.map((r) => ROLE_LABEL[r] ?? r).join(' · ') || 'ไม่มีบทบาท'}
        </span>
      </span>
      <span className="size-8 rounded-full bg-white/20 grid place-items-center text-[11px] font-semibold shrink-0">
        {initials(name)}
      </span>
      <form action={logoutAction}>
        <button
          type="submit"
          className="text-white/70 hover:text-white border border-white/25 rounded-[3px] px-2.5 py-1"
        >
          ออกจากระบบ
        </button>
      </form>
    </div>
  );
}
