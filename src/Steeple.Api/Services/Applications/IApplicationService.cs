using Steeple.Api.Contracts.Applications;

namespace Steeple.Api.Services.Applications;
/// <summary>
/// Use-cases of the Applications module (CONTRACTS §5, SYSTEM_DESIGN §7): intent-first submission
/// with idempotency, the ask/answer thread, the provider decision, withdrawal, and both parties'
/// inboxes. Owns the application state machine
/// (Pending → NeedsInfo ⇄ → Approved | Declined | Withdrawn | Expired).
/// </summary>
public interface IApplicationService
{
    /// <summary>
    /// Submits an application for a room. A replayed <paramref name="idempotencyKey"/> returns the
    /// originally created application instead of a duplicate.
    /// </summary>
    Task<ApplicationResult<SubmitOutcome>> SubmitAsync(
        Guid roomId, Guid organizerId, SubmitApplicationRequest request, Guid? idempotencyKey, string? remoteIp, CancellationToken ct = default);

    /// <summary>The organizer's applications, newest first, optionally filtered by status token.</summary>
    Task<ApplicationResult<ApplicationListResult>> GetForOrganizerAsync(
        Guid organizerId, string? status, int page, int pageSize, CancellationToken ct = default);

    /// <summary>Applications for every venue the caller manages (the provider inbox).</summary>
    Task<ApplicationResult<ApplicationListResult>> GetForManagerAsync(
        Guid managerId, string? status, int page, int pageSize, CancellationToken ct = default);

    /// <summary>
    /// Full application incl. thread — party-scoped: only the organizer or a manager of the room's
    /// venue may see it; anyone else gets <c>not_found</c> (existence is not leaked).
    /// </summary>
    Task<ApplicationResult<ApplicationDto>> GetAsync(Guid applicationId, Guid callerId, CancellationToken ct = default);

    /// <summary>
    /// Posts a thread message. A provider question moves Pending → NeedsInfo; the organizer's
    /// answer moves NeedsInfo → Pending. Only allowed while undecided.
    /// </summary>
    Task<ApplicationResult<ApplicationDto>> AddMessageAsync(
        Guid applicationId, Guid callerId, ApplicationMessageRequest request, CancellationToken ct = default);

    /// <summary>Approves or declines (venue managers only). Only allowed while undecided.</summary>
    Task<ApplicationResult<ApplicationDto>> DecideAsync(
        Guid applicationId, Guid callerId, ApplicationDecisionRequest request, CancellationToken ct = default);

    /// <summary>Withdraws the application (organizer only). Only allowed while undecided.</summary>
    Task<ApplicationResult<ApplicationDto>> WithdrawAsync(Guid applicationId, Guid organizerId, CancellationToken ct = default);
}

/// <summary>A submit outcome: the application plus whether this call created it (vs. an idempotent replay).</summary>
public sealed record SubmitOutcome(ApplicationDto Application, bool Created);

/// <summary>
/// Outcome of an applications use-case: a value or a stable error code the controller maps onto
/// the ProblemDetails envelope (CONTRACTS §2), mirroring the Identity module's result idiom.
/// </summary>
public sealed record ApplicationResult<T>(T? Value, ApplicationError? Error) where T : class
{
    /// <summary>Successful outcome.</summary>
    public static ApplicationResult<T> Ok(T value) => new(value, null);

    /// <summary>Failed outcome carrying the wire error code.</summary>
    public static ApplicationResult<T> Fail(string code, string detail) => new(null, new ApplicationError(code, detail));
}

/// <summary>A stable wire error code plus a human-readable detail.</summary>
public sealed record ApplicationError(string Code, string Detail);

/// <summary>The stable applications error codes documented in CONTRACTS §5.</summary>
public static class ApplicationErrorCodes
{
    /// <summary>The application (or room) doesn't exist — or the caller isn't a party to it.</summary>
    public const string NotFound = "not_found";

    /// <summary>The room exists but can't take applications (not published).</summary>
    public const string RoomNotBookable = "room_not_bookable";

    /// <summary>The room sits outside the served area (defense in depth — should not happen).</summary>
    public const string GeofenceRejected = "geofence_rejected";

    /// <summary>A request field failed validation (bad token, malformed time, unbounded recurrence…).</summary>
    public const string InvalidApplication = "invalid_application";

    /// <summary>The action isn't valid in the application's current state.</summary>
    public const string InvalidState = "invalid_state";

    /// <summary>The caller is a party but not a manager of the room's venue.</summary>
    public const string NotVenueManager = "not_venue_manager";

    /// <summary>Turnstile verification failed or the token was missing while enabled.</summary>
    public const string TurnstileFailed = "turnstile_failed";

    /// <summary>
    /// Approval lost the race: a live booking already holds an overlapping slot, so the
    /// application was auto-declined (Phase 3 — the exclusion constraint fired).
    /// </summary>
    public const string SlotTaken = "slot_taken";
}
