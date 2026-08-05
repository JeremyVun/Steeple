namespace Steeple.Persistence.Models;
/// <summary>
/// One spent <c>Idempotency-Key</c>: this user, on this create, with this key, produced this
/// resource. A replay resolves the original resource instead of creating a second one, and the
/// composite primary key (User, Scope, Key) is the race guard — the record is inserted in the
/// same transaction as the resource, so two overlapping creates can only land one
/// (016-idempotency.sql).
/// </summary>
public class IdempotencyRecord
{
    /// <summary>The authenticated user the key belongs to. Keys are never shared across users.</summary>
    public Guid UserId { get; set; }

    /// <summary>Which create the key was spent on (see <c>IdempotencyScopes</c>).</summary>
    public string Scope { get; set; } = "";

    /// <summary>The client-supplied key.</summary>
    public Guid Key { get; set; }

    /// <summary>The id of the resource the original request created.</summary>
    public Guid ResourceId { get; set; }

    /// <summary>When the key was spent (UTC).</summary>
    public DateTimeOffset CreatedAtUtc { get; set; }
}
