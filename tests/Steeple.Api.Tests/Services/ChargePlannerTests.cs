namespace Steeple.Api.Tests.Services;
/// <summary>
/// Unit tests for <see cref="ChargePlanner"/> — the pure charge-window/failure-ladder policy
/// (booking-modes.md charge timing; payments.md §5): occurrences charge when they enter the
/// T−48h window, failed attempts back off by the retry interval, and an occurrence still unpaid
/// at T−24h with a failure on record auto-cancels.
/// </summary>
public class ChargePlannerTests
{
    private static readonly DateTimeOffset Now = new(2026, 8, 5, 12, 0, 0, TimeSpan.Zero);
    private static readonly TimeSpan Window = TimeSpan.FromHours(48);
    private static readonly TimeSpan Deadline = TimeSpan.FromHours(24);
    private static readonly TimeSpan Retry = TimeSpan.FromHours(1);

    [Theory]
    [InlineData(49, ChargePlanner.Action.Wait)]    // outside the window
    [InlineData(48, ChargePlanner.Action.Charge)]  // window edge is inclusive
    [InlineData(30, ChargePlanner.Action.Charge)]  // inside the window
    [InlineData(20, ChargePlanner.Action.Charge)]  // inside the deadline but never attempted → charge
    [InlineData(0, ChargePlanner.Action.Wait)]     // already started — no-show rules own it
    [InlineData(-2, ChargePlanner.Action.Wait)]    // in the past
    public void Plan_NoPriorFailures_SelectsByWindow(double hoursUntilStart, ChargePlanner.Action expected)
    {
        var candidate = Candidate(hoursUntilStart, failedAttempts: 0, lastFailureAgo: null);

        Assert.Equal(expected, ChargePlanner.Plan(candidate, Now, Window, Deadline, Retry));
    }

    [Fact]
    public void Plan_RecentFailureInsideWindow_BacksOff()
    {
        var candidate = Candidate(hoursUntilStart: 40, failedAttempts: 1, lastFailureAgo: TimeSpan.FromMinutes(5));

        Assert.Equal(ChargePlanner.Action.Wait, ChargePlanner.Plan(candidate, Now, Window, Deadline, Retry));
    }

    [Fact]
    public void Plan_StaleFailureInsideWindow_RetriesTheCharge()
    {
        var candidate = Candidate(hoursUntilStart: 40, failedAttempts: 2, lastFailureAgo: TimeSpan.FromHours(2));

        Assert.Equal(ChargePlanner.Action.Charge, ChargePlanner.Plan(candidate, Now, Window, Deadline, Retry));
    }

    [Fact]
    public void Plan_PastDeadlineWithFailure_AutoCancels()
    {
        var candidate = Candidate(hoursUntilStart: 20, failedAttempts: 1, lastFailureAgo: TimeSpan.FromHours(3));

        Assert.Equal(ChargePlanner.Action.AutoCancel, ChargePlanner.Plan(candidate, Now, Window, Deadline, Retry));
    }

    [Fact]
    public void Plan_DeadlineEdge_IsTheCancelBoundary()
    {
        // Exactly T−24h counts as past the deadline (<=), one minute earlier does not.
        var atEdge = Candidate(hoursUntilStart: 24, failedAttempts: 1, lastFailureAgo: TimeSpan.FromHours(2));
        var beforeEdge = Candidate(hoursUntilStart: 24.02, failedAttempts: 1, lastFailureAgo: TimeSpan.FromHours(2));

        Assert.Equal(ChargePlanner.Action.AutoCancel, ChargePlanner.Plan(atEdge, Now, Window, Deadline, Retry));
        Assert.Equal(ChargePlanner.Action.Charge, ChargePlanner.Plan(beforeEdge, Now, Window, Deadline, Retry));
    }

    [Fact]
    public void NextChargeAtUtc_IsWindowEntry_ClampedToNow()
    {
        var farOut = Now.AddHours(100);
        Assert.Equal(farOut - Window, ChargePlanner.NextChargeAtUtc(farOut, Now, Window));

        var alreadyDue = Now.AddHours(10);
        Assert.Equal(Now, ChargePlanner.NextChargeAtUtc(alreadyDue, Now, Window));
    }

    private static ChargeCandidate Candidate(double hoursUntilStart, int failedAttempts, TimeSpan? lastFailureAgo)
    {
        var start = Now.AddHours(hoursUntilStart);
        var occurrence = new BookingOccurrence
        {
            Id = Guid.NewGuid(),
            BookingId = Guid.NewGuid(),
            RoomId = Guid.NewGuid(),
            StartUtc = start,
            EndUtc = start.AddHours(2),
            LocalDate = DateOnly.FromDateTime(start.UtcDateTime),
            Status = OccurrenceStatus.Scheduled,
        };
        return new ChargeCandidate(occurrence, failedAttempts, lastFailureAgo is { } ago ? Now - ago : null);
    }
}
