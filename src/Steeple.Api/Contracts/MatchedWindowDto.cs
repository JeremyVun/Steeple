namespace Steeple.Api.Contracts;
/// <summary>
/// The free window that satisfied a time-first ("When") search, carried additively on a
/// <see cref="RoomSummaryDto"/> so the card can show "Free 6–9 PM". Times are venue-local
/// wall-clock <c>HH:mm</c>. <see cref="Date"/> is set for one-off (dated) searches and omitted
/// for recurring ones (the window shown is the one on the first matching date in the horizon).
/// </summary>
/// <param name="Date">The venue-local date the window falls on (one-off searches); null for recurring.</param>
/// <param name="StartTime">Window start, venue-local <c>HH:mm</c>.</param>
/// <param name="EndTime">Window end, venue-local <c>HH:mm</c>.</param>
public record MatchedWindowDto(DateOnly? Date, string StartTime, string EndTime);
