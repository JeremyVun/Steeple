namespace Steeple.Persistence.Constants;
/// <summary>
/// Shape of a <see cref="Models.Booking"/>'s term (wire tokens <c>oneOff</c> / <c>recurring</c>,
/// CONTRACTS §5). Distinct from <see cref="ScheduleFrequency"/>: a booking is <c>Recurring</c>
/// whatever the cadence — weekly today, maybe fortnightly later — so the token never has to change.
/// </summary>
public enum BookingType
{
    /// <summary>A single occurrence on one date.</summary>
    OneOff = 0,

    /// <summary>A bounded series of occurrences (EndDate is always set).</summary>
    Recurring = 1,
}
