
namespace Steeple.Persistence.Constants;
/// <summary>
/// How a venue accepts booking requests (docs/backlog/booking-modes.md, adopted 2026-08-05).
/// Stored as int on <see cref="Models.Venue"/>; emitted as camelCase tokens on the wire.
/// </summary>
public enum BookingMode
{
    /// <summary>
    /// A valid request (schedule fits, payment method saved) confirms immediately under the same
    /// exclusion constraint as approval — first valid request wins. The host keeps a rescind
    /// lever (cancel any time → full refund of anything charged). The product default.
    /// </summary>
    Instant = 0,

    /// <summary>The request→approve flow: approve / decline / message / counter-offer.</summary>
    Manual = 1,
}
