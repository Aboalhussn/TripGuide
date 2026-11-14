// Payments sit behind one small interface. The rules (src/core/api.ts) decide WHAT money moves and how much;
// the provider only carries it out. Every amount comes from the server, never from the app.
//   charge  – the tourist pays the whole trip once (held by the platform), or a guide buys a subscription / featuring
//   refund  – held money returns to the tourist (declined, lapsed, cancelled, or the state's decision)
//   payout  – the state transfers a booking to the guide, or someone withdraws their wallet to their saved card
import type { Config } from './config';

export interface ChargeRequest { paymentId: number; userId: number; amount: number; purpose: 'booking' | 'subscription' | 'promotion'; refId: number; brand: string; last4: string; card: unknown }
export interface RefundRequest { bookingId: number; touristId: number; amount: number }
export interface PayoutRequest { kind: 'booking' | 'withdrawal'; refId: number; userId: number; amount: number; brand?: string; last4?: string }
export interface PaymentProvider {
  name: string;
  // Each returns the provider's own reference. Throwing stops the call: nothing is saved.
  charge(r: ChargeRequest): Promise<string>;
  refund(r: RefundRequest): Promise<string>;
  payout(r: PayoutRequest): Promise<string>;
}

// Behaves exactly like the demo: the card was already checked by the rules (Luhn, expiry, the test "declined" card),
// no real money moves, and every step simply succeeds.
export function simulatedProvider(): PaymentProvider & { log: { type: string; amount: number; ref: string }[] } {
  const log: { type: string; amount: number; ref: string }[] = [];
  const done = (type: string, amount: number, ref: string) => {
    log.push({ type, amount, ref });
    if (log.length > 500) log.shift();
    return ref;
  };
  return {
    name: 'simulated',
    log,
    charge: async (r) => done('charge', r.amount, `sim_charge_${r.paymentId}`),
    refund: async (r) => done('refund', r.amount, `sim_refund_${r.bookingId}`),
    payout: async (r) => done('payout', r.amount, `sim_payout_${r.kind}_${r.refId}`),
  };
}

// A real Iraqi provider (for example Qi Card, ZainCash or FIB) goes here once it is chosen.
// Nothing below is a real API: every TODO needs the provider's documentation and credentials.
export function iraqiProviderStub(): PaymentProvider {
  const missing = (step: string) => new Error(`The real payment provider is not connected yet (${step}). Set PAYMENT_PROVIDER=simulated.`);
  return {
    name: 'iraqi-provider-stub',
    // TODO(provider): create a payment for r.amount (USD, or IQD at the state's rate) with the provider's hosted card form
    // or token; raw card numbers must not pass through this server. Return the provider's payment id.
    // TODO(provider): the booking is only created after the provider confirms (webhook or redirect), with an idempotency key = r.paymentId.
    charge: async () => { throw missing('charge'); },
    // TODO(provider): refund the tourist's original payment (full or partial) by its provider reference.
    refund: async () => { throw missing('refund'); },
    // TODO(provider): transfer to the guide's account or card. Needs the provider's payout product and the guide's payout details.
    payout: async () => { throw missing('payout'); },
  };
}

export function paymentProviderFor(cfg: Config): PaymentProvider {
  return cfg.PAYMENT_PROVIDER === 'simulated' ? simulatedProvider() : iraqiProviderStub();
}
