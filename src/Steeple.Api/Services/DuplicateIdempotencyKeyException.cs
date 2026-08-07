namespace Steeple.Api.Services;
/// <summary>
/// An insert lost the idempotency race: a concurrent request with the same (owner, key) committed
/// first, and the database's unique index rejected this one. Thrown by persistence adapters so the
/// service can resolve the winner and answer the replay instead of surfacing a 500 — the
/// check-then-insert lookup alone cannot close this window.
/// </summary>
public sealed class DuplicateIdempotencyKeyException : Exception
{
    /// <summary>Creates the domain-level duplicate-key signal, keeping the provider failure as cause.</summary>
    public DuplicateIdempotencyKeyException(Exception inner)
        : base("A concurrent request with the same idempotency key committed first.", inner)
    {
    }
}
