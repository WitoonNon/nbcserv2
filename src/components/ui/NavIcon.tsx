/**
 * The sidebar icons.
 *
 * Drawn here rather than pulled from an icon pack for two reasons. The first
 * is weight: eleven glyphs do not justify a dependency that ships a thousand.
 * The second is that no pack has the one icon that matters most here — an air
 * conditioner. The register is the screen this company lives in, and a generic
 * box would say nothing about it.
 *
 * Style: monoline, even 2px stroke, geometry built from rounded rectangles and
 * circles, no fills and no detail finer than the stroke itself. That last rule
 * is what keeps them legible at 20px — a shape thinner than its own outline
 * turns to mud, which is why Settings is a plain eight-tooth gear rather than
 * a realistic one.
 *
 * Everything is `currentColor`, so an icon takes the colour of the link it
 * sits in and changes with it on hover, and nothing needs a dark variant.
 */

export type NavIconName =
  | 'dashboard'
  | 'jobs'
  | 'dispatch'
  | 'schedule'
  | 'customers'
  | 'assets'
  | 'workOrders'
  | 'employees'
  | 'requests'
  | 'clock'
  | 'me'
  | 'camera'
  | 'offline'
  | 'empty'
  | 'locked'
  | 'success'
  | 'warning'
  | 'timesheet'
  | 'payroll'
  | 'reports'
  | 'settings';

const PATHS: Record<NavIconName, React.ReactNode> = {
  // Panels of unequal size — the overview, not a uniform grid.
  dashboard: (
    <>
      <rect x="3" y="3" width="8.2" height="8.2" rx="2.2" />
      <rect x="14.8" y="3" width="6.2" height="18" rx="2.2" />
      <rect x="3" y="14.8" width="8.2" height="6.2" rx="2.2" />
    </>
  ),

  // A list of work: a marker and a line for each job.
  jobs: (
    <>
      <rect x="3" y="4.2" width="3.6" height="3.6" rx="1.2" />
      <rect x="3" y="10.2" width="3.6" height="3.6" rx="1.2" />
      <rect x="3" y="16.2" width="3.6" height="3.6" rx="1.2" />
      <path d="M9.8 6h11.2M9.8 12h11.2M9.8 18h7.4" />
    </>
  ),

  // One point sending work out to several — จ่ายงาน, drawn literally.
  dispatch: (
    <>
      <circle cx="5.6" cy="12" r="2.7" />
      <circle cx="18.4" cy="5.8" r="2.7" />
      <circle cx="18.4" cy="18.2" r="2.7" />
      <path d="m8.1 10.8 7.8-3.8M8.1 13.2l7.8 3.8" />
    </>
  ),

  schedule: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="3" />
      <path d="M3 10.2h18M8 3v4M16 3v4" />
    </>
  ),

  customers: (
    <>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M3.2 20a5.8 5.8 0 0 1 11.6 0" />
      <circle cx="17.8" cy="8.8" r="2.7" />
      <path d="M16.6 15.1A5.3 5.3 0 0 1 21 20" />
    </>
  ),

  // A wall-mounted split unit, air blowing down from it.
  assets: (
    <>
      <rect x="2.6" y="4.8" width="18.8" height="7.6" rx="2.4" />
      <path d="M2.6 9.7h18.8" />
      <path d="M8 15.4 6.6 19M13 15.4l-1.4 3.6M18 15.4l-1.4 3.6" />
    </>
  ),

  // A document that has been checked — the approved work order.
  workOrders: (
    <>
      <rect x="4.4" y="2.8" width="15.2" height="18.4" rx="3" />
      <path d="M8.6 7.8h6.8" />
      <path d="m8.6 13.8 2.4 2.4 4.4-4.8" />
    </>
  ),

  // An ID card: a portrait and two lines of detail. Distinct from `customers`
  // — that icon is people, this one is their file.
  employees: (
    <>
      <rect x="2.6" y="4.6" width="18.8" height="14.8" rx="2.6" />
      <circle cx="8.4" cy="10.6" r="2.1" />
      <path d="M5.2 16.2a3.4 3.4 0 0 1 6.4 0" />
      <path d="M14.6 10h4.2M14.6 14h2.8" />
    </>
  ),

  // A form with a tick — a request that has been decided.
  requests: (
    <>
      <rect x="4.4" y="2.8" width="15.2" height="18.4" rx="3" />
      <path d="M8.6 8h6.8M8.6 12h4" />
      <path d="m8.6 16.6 2 2 4-4" />
    </>
  ),

  // A clock face with a hand raised to the hour — punching in.
  clock: (
    <>
      <circle cx="12" cy="12" r="8.6" />
      <path d="M12 6.6V12l4 1.8" />
    </>
  ),

  // A person, singular — this account, as opposed to the customers icon.
  me: (
    <>
      <circle cx="12" cy="8" r="3.6" />
      <path d="M4.8 20.4a7.2 7.2 0 0 1 14.4 0" />
    </>
  ),

  // A camera — "point this at the code on the wall".
  camera: (
    <>
      <path d="M3 8.6a2 2 0 0 1 2-2h2.3l1.3-2.2h6.8l1.3 2.2H19a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
      <circle cx="12" cy="13" r="3.6" />
    </>
  ),

  // A cloud struck through — the server could not be reached. Two arcs meant
  // as a broken chain read as a squiggle at this size; a slash reads instantly.
  offline: (
    <>
      <path d="M7.4 18.4h9.4a4 4 0 0 0 .5-8 5.6 5.6 0 0 0-10.6-1.4A3.9 3.9 0 0 0 7.4 18.4Z" />
      <path d="M4 3.8 20.2 20.4" />
    </>
  ),

  // An empty tray — nothing assigned, rather than something gone wrong.
  empty: (
    <>
      <path d="M3.4 13.6h4.2l1.4 2.4h6l1.4-2.4h4.2" />
      <path d="M3.4 13.6 6 5.2a1.6 1.6 0 0 1 1.5-1.1h9a1.6 1.6 0 0 1 1.5 1.1l2.6 8.4v4.6a1.8 1.8 0 0 1-1.8 1.8H5.2a1.8 1.8 0 0 1-1.8-1.8Z" />
    </>
  ),

  locked: (
    <>
      <rect x="4.4" y="10.4" width="15.2" height="10.4" rx="2.4" />
      <path d="M8 10.4V7.6a4 4 0 0 1 8 0v2.8" />
      <circle cx="12" cy="15.6" r="1.3" />
    </>
  ),

  success: (
    <>
      <circle cx="12" cy="12" r="8.8" />
      <path d="m8 12.2 2.7 2.7L16 9.6" />
    </>
  ),

  warning: (
    <>
      <path d="M12 3.6 21.2 19.2a1.4 1.4 0 0 1-1.2 2.1H4a1.4 1.4 0 0 1-1.2-2.1Z" />
      <path d="M12 9.4v4.4" />
      {/* The dot of the exclamation. A zero-radius circle rendered as a hollow
          ring; a zero-length line with round caps is an actual dot. */}
      <path d="M12 17.5v0.01" />
    </>
  ),

  timesheet: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 6.8V12l3.4 2" />
    </>
  ),

  // A banknote. The upright bars a note icon usually carries at each end were
  // crowding the middle at this size and turning the whole thing into a camera;
  // laid flat they stay out of the way and still read as denominations.
  payroll: (
    <>
      <rect x="2.6" y="5.8" width="18.8" height="12.4" rx="3" />
      <circle cx="12" cy="12" r="2.6" />
      <path d="M5.9 12h1M17.1 12h1" />
    </>
  ),

  reports: (
    <>
      <path d="M3.4 20.6h17.2" />
      <path d="M7.6 17.4v-6.2M12 17.4V5.4M16.4 17.4V9" />
    </>
  ),

  // Eight teeth on a plain hub. A realistic gear has detail finer than the
  // stroke that draws it, which at this size becomes a smudge.
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <circle cx="12" cy="12" r="7.6" />
      <path d="M12 1.6v2.8M12 19.6v2.8M22.4 12h-2.8M4.4 12H1.6" />
      <path d="m19.35 4.65-1.98 1.98M6.63 17.37l-1.98 1.98M19.35 19.35l-1.98-1.98M6.63 6.63 4.65 4.65" />
    </>
  ),
};

export function NavIcon({ name, className }: { name: NavIconName; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      // Decorative: every icon sits beside its own text label, so a screen
      // reader announcing it would only repeat what it is about to read.
      aria-hidden="true"
      focusable="false"
    >
      {PATHS[name]}
    </svg>
  );
}
