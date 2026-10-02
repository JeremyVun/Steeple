import { el } from './dom.js';

export function quoteSessionAmount(quote, schedule) {
  if (!quote || !schedule) return null;
  const minutes = (time) => /^\d{2}:\d{2}/.test(time ?? '') ? Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5)) : NaN;
  const duration = minutes(schedule.endTime) - minutes(schedule.startTime);
  if (!Number.isFinite(duration) || duration <= 0) return null;
  const numerator = Math.round(quote.pricePerHour * 100) * duration;
  const cents = Math.floor(numerator / 60);
  const remainder = numerator % 60;
  return (cents + (remainder > 30 || remainder === 30 && cents % 2 === 1 ? 1 : 0)) / 100;
}

export function bookingTerms(quote, schedule, { payment = null, host = false, legacyRequest = true } = {}) {
  const money = (value, currency) => new Intl.NumberFormat('en-US', { style: 'currency', currency, currencyDisplay: 'code' }).format(value);
  const perSession = quoteSessionAmount(quote, schedule);
  return el('section', { class: 'booking-terms', 'aria-label': 'Saved booking terms' }, [
    el('h2', { class: 'eyebrow', text: 'Price and house rules' }),
    payment?.perOccurrenceAmount != null && el('p', { text: `${money(payment.perOccurrenceAmount, payment.currency)} per session` }),
    quote ? el('p', { text: `${money(quote.pricePerHour, quote.currency)} / hour${!payment && perSession !== null ? ` · ${money(perSession, quote.currency)} per session` : ''}` }) : null,
    el('p', { text: quote ? (quote.houseRules || 'No house rules were listed when this request was sent.') : 'This older request has no saved price or house rules.' }),
    !quote && legacyRequest && el('p', { text: host ? 'The guest must withdraw this request, review the current price and house rules, and send a new request before you can approve it.' : 'Withdraw this request and review the current price and house rules before sending it again.' }),
  ].filter(Boolean));
}

export function supportLink(kind, id) {
  const subject = `Steeple ${kind} help — ${id}`;
  const body = `${kind === 'booking' ? 'Booking' : 'Request'} ID: ${id}\n\nPlease describe the problem, including any dates affected:\n`;
  return el('a', { class: 'linkish booking-support', href: `mailto:jvun@steepleapp.co?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`, text: `Email support about this ${kind}` });
}
