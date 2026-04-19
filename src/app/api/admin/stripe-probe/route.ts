import { NextResponse } from "next/server";
import Stripe from "stripe";
import { requireAdmin } from "@/lib/admin";

export async function GET() {
  await requireAdmin();

  const diag: Record<string, unknown> = {
    node: process.version,
    keyPrefix: process.env.STRIPE_SECRET_KEY?.slice(0, 12) ?? "(unset)",
    keyLength: process.env.STRIPE_SECRET_KEY?.length ?? 0,
  };

  if (!process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json({ ...diag, error: "key unset" });
  }

  // Try with the pinned API version first
  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: "2026-03-25.dahlia",
    });
    const account = await stripe.accounts.retrieve();
    diag.accountOk = true;
    diag.accountId = account.id;
    diag.chargesEnabled = account.charges_enabled;

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{
        price_data: {
          currency: "gbp",
          product_data: { name: "Probe" },
          unit_amount: 1999,
          recurring: { interval: "month" },
        },
        quantity: 1,
      }],
      success_url: "https://buildmy.directory/onboarding",
      cancel_url: "https://buildmy.directory",
    });
    diag.sessionId = session.id;
    diag.ok = true;
  } catch (err) {
    const e = err as {
      message?: string;
      type?: string;
      code?: string;
      statusCode?: number;
      cause?: { code?: string; message?: string };
      raw?: { message?: string };
    };
    diag.ok = false;
    diag.errMessage = e.message;
    diag.errType = e.type;
    diag.errCode = e.code;
    diag.errStatus = e.statusCode;
    diag.errCauseCode = e.cause?.code;
    diag.errCauseMessage = e.cause?.message;
    diag.errRawMessage = e.raw?.message;
  }

  return NextResponse.json(diag);
}
