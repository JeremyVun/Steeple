// MONEY, SAID ONCE — the one place a charge state becomes a sentence.
//
// A booking made while payments are on carries a price snapshot frozen at
// confirmation and a charge state per date (docs/contracts/payments.md). Two
// surfaces print that truth — the guest's opened letter and the host's desk —
// and they must not print it in two different vocabularies, so the vocabulary
// lives here and neither of them owns it.
//
// Nothing in this file decides anything: every status is steeple's own token,
// every amount is the snapshot it sent, and an amount this app cannot read is
// left unsaid rather than guessed at.

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * `$40.00`. The currency travels with every amount steeple sends; anything but
 * USD is printed with its code rather than with a symbol it might not own.
 */
export function money(amount, currency = 'USD') {
  if (amount === null || amount === undefined) return '';
  const figure = Number(amount);
  if (!Number.isFinite(figure)) return '';
  const written = figure.toFixed(2).replace(/\.00$/, '');
  return currency === 'USD' || !currency ? `$${written}` : `${written} ${currency}`;
}

/** A UTC instant as the short local date a person reads. */
export function whenDate(utc) {
  if (!utc) return '';
  const at = new Date(utc);
  if (Number.isNaN(at.getTime())) return '';
  return `${MONTHS[at.getMonth()]} ${at.getDate()}`;
}

/**
 * The word for one occurrence's charge state, in the guest's reading and in the
 * host's. They are the same fact from two sides of the counter: the guest paid,
 * the host was paid; the guest's card failed, the host's date is at risk.
 *
 * `null` — steeple has never charged this date — is deliberately absent from
 * both tables: an uncharged future date says nothing, because nothing has
 * happened to it yet.
 */
export const CHARGE_WORD = {
  guest: {
    succeeded: 'Paid',
    pending: 'Charging',
    requiresAction: 'Needs confirming',
    failed: 'Payment failed',
    refunded: 'Refunded',
    disputed: 'Disputed',
  },
  host: {
    succeeded: 'Paid',
    pending: 'Charging',
    requiresAction: 'Awaiting the card',
    failed: 'Payment failed',
    refunded: 'Refunded',
    disputed: 'Disputed',
  },
};

/** Whether a charge state is one somebody has to do something about. */
export const isTrouble = (status) => status === 'failed' || status === 'requiresAction';

/** Whether money actually moved for this date. */
export const wasCharged = (status) => status === 'succeeded';

export const chargeWord = (status, side = 'guest') => CHARGE_WORD[side]?.[status] ?? null;

/**
 * A booking's payment posture in one line, or null when there is nothing to
 * say. `mode: 'offline'` is a booking confirmed before steeple took payments —
 * it never charges, and saying "free" about it would be a different lie.
 */
export function paymentLine(booking, side = 'guest') {
  const payment = booking?.payment;
  if (!payment) return null;
  if (payment.mode !== 'inApp') {
    return side === 'host'
      ? 'Arranged with the group directly — Steeple takes no payment for this booking.'
      : 'Paid directly to the venue — Steeple takes no payment for this booking.';
  }
  const each = money(payment.perOccurrenceAmount, payment.currency);
  if (!each) return null;
  return side === 'host' ? `${each} a session` : `${each} a session`;
}

/**
 * "Next payment $40 on Sep 12", when one is due. A booking with everything
 * charged, or one that is over, says nothing rather than saying "none".
 */
export function nextChargeLine(booking) {
  const payment = booking?.payment;
  if (!payment || payment.mode !== 'inApp' || !payment.nextChargeAtUtc) return null;
  const each = money(payment.perOccurrenceAmount, payment.currency);
  const day = whenDate(payment.nextChargeAtUtc);
  const due = new Date(payment.nextChargeAtUtc).getTime() <= Date.now();
  if (due) return each ? `Next payment ${each}, being taken now.` : 'The next payment is being taken now.';
  return each ? `Next payment ${each} on ${day}.` : `The next payment is taken on ${day}.`;
}

/**
 * The failure ladder, in the words steeple's own email uses (payments.md §5):
 * the card is retried, and a date still unpaid 24 hours before it starts is
 * released. Said once, calmly, and never as an accusation.
 */
export const FAILURE_LADDER =
  'Update your payment method — this session is released 24 hours before it starts if payment can’t complete. Nothing else about your booking changes in the meantime.';

/** What a host is told about the same date, from their side of it. */
export const FAILURE_LADDER_HOST =
  'The group has been told and their card is being retried. If it still hasn’t gone through 24 hours before the session, that date is released and the time comes back to you.';

/** The whole of the refund rule a host's cancel triggers, in one sentence. */
export const RESCIND_WARNING =
  'Cancelling frees every remaining date on this booking and refunds everything already charged, in full. The group is told straight away, and the time goes back on offer.';
