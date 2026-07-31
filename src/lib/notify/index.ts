import { env } from '@/lib/env';

/**
 * Notification port.
 *
 * LINE is the intended primary channel (they already run @nbcservice), but
 * channel credentials are @client-confirm G3 — so development runs on the
 * console adapter and swapping is an env change.
 */
export interface NotifyMessage {
  /** LINE userId, email address or phone number. */
  recipient: string;
  templateCode?: string;
  subject?: string;
  body: string;
  jobId?: string;
  data?: Record<string, unknown>;
}

export interface NotificationChannelAdapter {
  readonly name: string;
  send(message: NotifyMessage): Promise<{ ok: boolean; error?: string }>;
}

class ConsoleAdapter implements NotificationChannelAdapter {
  readonly name = 'console';
  async send(message: NotifyMessage) {
    // eslint-disable-next-line no-console
    console.info('[notify:console]', {
      to: message.recipient,
      template: message.templateCode,
      body: message.body,
    });
    return { ok: true };
  }
}

class LineAdapter implements NotificationChannelAdapter {
  readonly name = 'line';
  async send(): Promise<{ ok: boolean; error?: string }> {
    return {
      ok: false,
      error:
        'LINE Messaging API not wired yet — pending @client-confirm G3 ' +
        '(channel access token for @nbcservice).',
    };
  }
}

class EmailAdapter implements NotificationChannelAdapter {
  readonly name = 'email';
  async send(): Promise<{ ok: boolean; error?: string }> {
    return { ok: false, error: 'SMTP adapter not wired yet — pending @client-confirm G5.' };
  }
}

let cached: NotificationChannelAdapter | null = null;

export function notifier(): NotificationChannelAdapter {
  if (cached) return cached;
  switch (env().NOTIFY_DRIVER) {
    case 'line':
      cached = new LineAdapter();
      break;
    case 'email':
      cached = new EmailAdapter();
      break;
    default:
      cached = new ConsoleAdapter();
  }
  return cached;
}
