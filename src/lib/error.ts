import * as Sentry from "@sentry/nextjs";

export function redactEmail(email: string | null | undefined): string {
  if (!email) return "";
  const [local, domain] = email.split("@");
  if (!domain) return email.length > 3 ? `${email[0]}***` : "***";
  const l = local.length > 1 ? `${local[0]}***` : "***";
  const dparts = domain.split(".");
  const d = dparts[0].length > 1 ? `${dparts[0][0]}***` : "***";
  return `${l}@${d}.${dparts.slice(1).join(".")}`;
}

export function captureError(error: unknown, context?: Record<string, unknown>) {
  console.error(error);
  try {
    if (context) Sentry.setContext("extra", context);
    Sentry.captureException(error instanceof Error ? error : new Error(String(error)));
  } catch {
    // Sentry itself failed — don't crash the app
  }
}
