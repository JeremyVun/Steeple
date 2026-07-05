
namespace Steeple.Api.Contracts.Applications;
/// <summary>
/// A host's counter-proposal on an application's schedule ("this time instead"). At most one is
/// ever <c>open</c>; posting a new one supersedes the previous. The application keeps the
/// organizer's original ask — accepting books the counter schedule instead.
/// </summary>
/// <param name="Status">Wire token: <c>open | accepted | declinedByOrganizer | superseded | lapsed</c>.</param>
public record CounterOfferDto(
    Guid Id,
    ScheduleDto Schedule,
    string? Message,
    string Status,
    DateTimeOffset CreatedAtUtc,
    DateTimeOffset? RespondedAtUtc);

/// <summary><c>POST /api/v1/applications/{id}/counter-offer</c> body (venue manager).</summary>
public record CounterOfferRequest(ScheduleDto? Schedule, string? Message);

/// <summary><c>POST /api/v1/applications/{id}/counter-offer/respond</c> body (organizer). <c>decision</c>: <c>accept | decline</c>.</summary>
public record CounterOfferResponseRequest(string? Decision);
