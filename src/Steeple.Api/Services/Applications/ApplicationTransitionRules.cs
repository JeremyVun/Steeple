namespace Steeple.Api.Services.Applications;

/// <summary>
/// Pure application state-machine rules. Use cases still own persistence and side effects; this
/// type answers which transitions are legal and what the next status is.
/// </summary>
internal static class ApplicationTransitionRules
{
    internal static bool CanCorrespond(ApplicationStatus status) =>
        ApplicationExpiryPolicy.IsUndecided(status)
        || status is ApplicationStatus.CounterOffered or ApplicationStatus.Approved;

    internal static ApplicationStatus AfterMessage(ApplicationStatus status, bool callerIsOrganizer) =>
        status switch
        {
            ApplicationStatus.NeedsInfo when callerIsOrganizer => ApplicationStatus.Pending,
            ApplicationStatus.Pending when !callerIsOrganizer => ApplicationStatus.NeedsInfo,
            _ => status,
        };

    internal static bool CanHostDecide(ApplicationStatus status, bool approve) =>
        approve
            ? ApplicationExpiryPolicy.IsUndecided(status)
            : ApplicationExpiryPolicy.IsUndecided(status) || status == ApplicationStatus.CounterOffered;

    internal static bool CanWithdraw(ApplicationStatus status) =>
        ApplicationExpiryPolicy.IsUndecided(status) || status == ApplicationStatus.CounterOffered;

    internal static bool CanCounterOffer(ApplicationStatus status) => CanWithdraw(status);

    internal static ApplicationStatus AfterCounterResponse(bool accepted) =>
        accepted ? ApplicationStatus.Approved : ApplicationStatus.Pending;

    internal static ApplicationCounterOffer? OpenCounter(Application application) =>
        application.CounterOffers.FirstOrDefault(c => c.Status == CounterOfferStatus.Open);
}
