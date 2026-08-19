import { env } from '@/lib/env';
import { LineError, pushText } from './line';

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

export interface SendResult {
  ok: boolean;
  error?: string;
  /**
   * Whether trying again could succeed. The caller needs this to tell a
   * customer who blocked the account — never send again — apart from a rate
   * limit, which is the same message a few minutes later.
   */
  retryable?: boolean;
}

export interface NotificationChannelAdapter {
  readonly name: string;
  send(message: NotifyMessage): Promise<SendResult>;
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

  async send(message: NotifyMessage): Promise<{ ok: boolean; error?: string; retryable?: boolean }> {
    // `recipient` has to be a LINE userId. A phone number cannot be turned
    // into one — no API does that — so a caller that has not resolved the
    // customer's identity yet is a bug, and it is caught here rather than
    // spending a message on a request LINE will reject.
    if (!/^U[0-9a-f]{32}$/.test(message.recipient)) {
      return {
        ok: false,
        retryable: false,
        error: `ผู้รับไม่ใช่ LINE userId (${message.recipient.slice(0, 12)}…) — ยังไม่ได้ผูกบัญชี`,
      };
    }

    try {
      await pushText(message.recipient, message.body, message.data?.retryKey as string | undefined);
      return { ok: true };
    } catch (error) {
      if (error instanceof LineError) {
        return { ok: false, error: error.message, retryable: error.retryable };
      }
      // A network failure is not a rejected message. Treated as retryable so
      // a flaky connection does not discard the notification.
      return { ok: false, retryable: true, error: String(error) };
    }
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
