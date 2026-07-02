namespace Steeple.Persistence.Constants;
/// <summary>
/// Publication state of a room listing. Only <see cref="Published"/> rooms are discoverable.
/// </summary>
public enum RoomStatus
{
    /// <summary>Work in progress; not visible to organizers.</summary>
    Draft,

    /// <summary>Live and discoverable in search and detail views.</summary>
    Published,

    /// <summary>Previously published but temporarily withdrawn from discovery.</summary>
    Unlisted
}
