
namespace Steeple.Api.Contracts.Applications;
/// <summary>
/// <c>POST /api/v1/listings/{roomId}/applications</c> body (CONTRACTS §5): an intent-first
/// application — what will happen, for how many, when — sent to the room's venue for a decision.
/// </summary>
/// <param name="ActivityType">Single activity wire token (e.g. <c>children</c>).</param>
/// <param name="GroupSize">Expected number of people.</param>
/// <param name="Schedule">Proposed venue-local schedule.</param>
/// <param name="IntentText">The organizer's own words — the application's heart (≤2000 chars).</param>
/// <param name="TurnstileToken">Cloudflare Turnstile response token (required where enabled).</param>
public record SubmitApplicationRequest(
    string ActivityType,
    int GroupSize,
    ScheduleDto Schedule,
    string IntentText,
    string? TurnstileToken);
