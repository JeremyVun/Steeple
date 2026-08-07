namespace Steeple.Api.Services;
/// <summary>
/// A save lost an optimistic-concurrency race: the row was changed by another request after this
/// one loaded it. Thrown by persistence adapters (translated from the provider's concurrency
/// failure) so services can answer with a domain error instead of overwriting the other caller's
/// transition (lost update).
/// </summary>
public sealed class ConcurrentUpdateException : Exception
{
    /// <summary>Creates the domain-level concurrency conflict, keeping the provider failure as cause.</summary>
    public ConcurrentUpdateException(Exception inner)
        : base("The row was changed by another request while this one was deciding.", inner)
    {
    }
}
