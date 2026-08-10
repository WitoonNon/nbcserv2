import { z } from 'zod';

/**
 * Environment contract. Anything the client has not decided yet (storage
 * target, notification channel) is a *driver name* here — swapping it is an
 * env change, never a code change.
 */
const schema = z.object({
  DATABASE_URL: z.string().min(1),
  APP_URL: z.string().default('http://localhost:3000'),
  APP_TIMEZONE: z.string().default('Asia/Bangkok'),
  DEFAULT_LOCALE: z.enum(['th', 'en']).default('th'),

  STORAGE_DRIVER: z.enum(['local', 's3', 'supabase']).default('local'),
  STORAGE_LOCAL_DIR: z.string().default('./.storage'),
  S3_ENDPOINT: z.string().optional(),
  S3_REGION: z.string().default('ap-southeast-1'),
  S3_BUCKET: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),

  // Supabase Storage — the same project that already hosts the database, so
  // there is no second account to provision. The bucket must be PRIVATE:
  // storage keys are guessable, and these are photographs of customers' homes.
  SUPABASE_URL: z.string().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  SUPABASE_STORAGE_BUCKET: z.string().default('work-orders'),
  /** How long a signed view URL stays valid. Long enough to load a form. */
  SUPABASE_SIGNED_URL_TTL: z.coerce.number().int().positive().default(3600),

  NOTIFY_DRIVER: z.enum(['console', 'line', 'email']).default('console'),
  LINE_CHANNEL_ACCESS_TOKEN: z.string().optional(),

  AUTH_SECRET: z.string().default('dev-secret-change-me'),
})
  // Fail at boot, not at the moment a technician tries to attach a photo from
  // a rooftop. A missing key is a deployment mistake and should read like one.
  .superRefine((e, ctx) => {
    if (e.STORAGE_DRIVER !== 'supabase') return;
    for (const key of ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'] as const) {
      if (!e[key]) {
        ctx.addIssue({
          code: 'custom',
          path: [key],
          message: 'required when STORAGE_DRIVER=supabase',
        });
      }
    }
  });

export type Env = z.infer<typeof schema>;

let cached: Env | null = null;

export function env(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  cached = parsed.data;
  return cached;
}
