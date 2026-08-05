
namespace Steeple.Persistence.Models;
/// <summary>
/// A consumer account (organizer and/or venue provider — one table, no role wall). Identity is
/// delegated to SSO providers via <see cref="UserLogin"/>; no credentials are ever stored here.
/// </summary>
public class User
{
    /// <summary>Primary key.</summary>
    public Guid Id { get; set; }

    /// <summary>Display name shown to the other side of an application/booking.</summary>
    public string DisplayName { get; set; } = "";

    /// <summary>
    /// Email from the SSO provider (may be an Apple private-relay address). Null after the
    /// account is anonymized, or when the provider withheld it.
    /// </summary>
    public string? Email { get; set; }

    /// <summary>
    /// The payment provider's customer id (mock: <c>cus_mock_…</c>; Stripe later). Payment
    /// methods live with the provider on this customer — never here.
    /// </summary>
    public string? PaymentCustomerId { get; set; }

    /// <summary>Display cache of the saved default method's brand (e.g. "visa"). Never a PAN.</summary>
    public string? PaymentMethodBrand { get; set; }

    /// <summary>Display cache of the saved default method's last four digits. Never a PAN.</summary>
    public string? PaymentMethodLast4 { get; set; }

    /// <summary>When the current payment method was saved; null = no method on file.</summary>
    public DateTimeOffset? PaymentMethodSetAtUtc { get; set; }

    /// <summary>Creation timestamp (UTC).</summary>
    public DateTimeOffset CreatedAtUtc { get; set; }

    /// <summary>
    /// When the account was deleted (anonymized). The row survives so agreements and (later)
    /// bookings/ratings keep referential integrity; PII fields are cleared instead.
    /// </summary>
    public DateTimeOffset? DeletedAtUtc { get; set; }

    /// <summary>SSO provider identities that resolve to this user.</summary>
    public ICollection<UserLogin> Logins { get; set; } = new List<UserLogin>();

    /// <summary>Per-version ToS/Privacy acceptance records.</summary>
    public ICollection<UserAgreement> Agreements { get; set; } = new List<UserAgreement>();
}
