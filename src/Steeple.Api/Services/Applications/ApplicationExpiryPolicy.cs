namespace Steeple.Api.Services.Applications;

/// <summary>
/// Owns the effective-status rules shared by application reads, conflict queries, and the lazy
/// expiry sweep. A stored expirable status is only effective while its deadline is in the future.
/// </summary>
internal static class ApplicationExpiryPolicy
{
    /// <summary>Undecided applications and open counters lapse after this long.</summary>
    internal static readonly TimeSpan Window = TimeSpan.FromDays(14);

    /// <summary>The states in which the venue still owns the next decision.</summary>
    internal static readonly ApplicationStatus[] UndecidedStatuses =
        [ApplicationStatus.Pending, ApplicationStatus.NeedsInfo];

    /// <summary>Every state governed by <see cref="Application.ExpiresAtUtc"/>.</summary>
    internal static readonly ApplicationStatus[] ExpirableStatuses =
        [ApplicationStatus.Pending, ApplicationStatus.NeedsInfo, ApplicationStatus.CounterOffered];

    internal static bool IsUndecided(ApplicationStatus status) => UndecidedStatuses.Contains(status);

    internal static bool IsExpirable(ApplicationStatus status) => ExpirableStatuses.Contains(status);

    internal static bool IsEffectivelyUndecided(Application application, DateTimeOffset now) =>
        IsUndecided(application.Status) && application.ExpiresAtUtc > now;

    internal static bool IsEffectivelyExpired(Application application, DateTimeOffset now) =>
        application.Status == ApplicationStatus.Expired
        || (IsExpirable(application.Status) && application.ExpiresAtUtc <= now);
}
