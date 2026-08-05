namespace Steeple.Api.Services.Manage;
/// <summary>
/// Persisted <c>Scope</c> values for the idempotency ledger. A scope partitions the key space per
/// create endpoint, so one client key accidentally reused across two endpoints can never answer
/// with the wrong resource type. These strings are stored in the database — never rename one
/// without a data migration.
/// </summary>
public static class IdempotencyScopes
{
    /// <summary><c>POST /manage/venues</c>.</summary>
    public const string ManageVenueCreate = "manage.venue.create";

    /// <summary><c>POST /manage/venues/{id}/rooms</c>.</summary>
    public const string ManageRoomCreate = "manage.room.create";
}
