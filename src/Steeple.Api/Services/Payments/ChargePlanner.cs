
namespace Steeple.Api.Services.Payments;
/// <summary>
/// The pure charge-timing policy (docs/backlog/booking-modes.md "Charge timing", payments.md §5
/// failure ladder), separated from I/O so the window/deadline rules are unit-testable:
/// each occurrence charges when it enters the T−<c>ChargeWindowHours</c> window (the first
/// occurrence of a booking charges at confirmation, which callers express by planning it
/// directly); still unpaid at T−<c>CancelDeadlineHours</c> with at least one failed attempt →
/// auto-cancel through the Bookings service.
/// </summary>
public static class ChargePlanner
{
    /// <summary>What the sweeper should do with a charge candidate right now.</summary>
    public enum Action
    {
        /// <summary>Nothing this sweep (outside the window, or backing off after a recent failure).</summary>
        Wait = 0,

        /// <summary>Attempt (or re-attempt) the charge.</summary>
        Charge = 1,

        /// <summary>Past the deadline with a failed attempt on record — auto-cancel the occurrence.</summary>
        AutoCancel = 2,
    }

    /// <summary>
    /// Plans one candidate. <paramref name="retryInterval"/> paces re-attempts after a failure;
    /// the deadline outranks pacing (a last-chance charge is attempted by the caller before it
    /// cancels — see <see cref="PaymentService"/>).
    /// </summary>
    public static Action Plan(ChargeCandidate candidate, DateTimeOffset nowUtc, TimeSpan chargeWindow, TimeSpan cancelDeadline, TimeSpan retryInterval)
    {
        var start = candidate.Occurrence.StartUtc;
        if (start <= nowUtc)
        {
            return Action.Wait; // already started — nothing to charge or cancel (no-show rules own it)
        }

        if (start - nowUtc > chargeWindow)
        {
            return Action.Wait; // not yet inside the charge window
        }

        var pastDeadline = start - nowUtc <= cancelDeadline;
        if (pastDeadline && candidate.FailedAttempts > 0)
        {
            return Action.AutoCancel;
        }

        // Inside the window: first attempt immediately; after a failure, back off by the retry
        // interval — except at the deadline edge, where the caller gets one last attempt before
        // the AutoCancel branch above wins on the next sweep.
        if (candidate.FailedAttempts == 0 || candidate.LastFailureAtUtc is null)
        {
            return Action.Charge;
        }

        return nowUtc - candidate.LastFailureAtUtc.Value >= retryInterval ? Action.Charge : Action.Wait;
    }

    /// <summary>The instant an occurrence is due to charge (its window entry), never in the past.</summary>
    public static DateTimeOffset NextChargeAtUtc(DateTimeOffset occurrenceStartUtc, DateTimeOffset nowUtc, TimeSpan chargeWindow)
    {
        var due = occurrenceStartUtc - chargeWindow;
        return due < nowUtc ? nowUtc : due;
    }
}
