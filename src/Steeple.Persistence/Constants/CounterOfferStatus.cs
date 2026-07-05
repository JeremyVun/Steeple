namespace Steeple.Persistence.Constants;
/// <summary>
/// Lifecycle of a host counter-offer on an application. At most one <see cref="Open"/> counter
/// exists per application (partial unique index); the rest are history for the thread.
/// </summary>
public enum CounterOfferStatus
{
    /// <summary>Awaiting the organizer's accept/decline.</summary>
    Open = 0,

    /// <summary>Organizer accepted; the booking was created on the counter schedule.</summary>
    Accepted = 1,

    /// <summary>Organizer declined; the application returned to pending.</summary>
    DeclinedByOrganizer = 2,

    /// <summary>Replaced by a newer counter from the host.</summary>
    Superseded = 3,

    /// <summary>The application expired or was decided/withdrawn while the counter was open.</summary>
    Lapsed = 4
}
