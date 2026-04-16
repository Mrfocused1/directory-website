import * as Sentry from "@sentry/nextjs";

export function captureError(error: unknown, context?: Record<string, unknown>) {
  console.error(error);
  try {
    if (context) Sentry.setContext("extra", context);
    Sentry.captureException(error instanceof Error ? error : new Error(String(error)));
  } catch {
    // Sentry itself failed — don't crash the app
  }
}
