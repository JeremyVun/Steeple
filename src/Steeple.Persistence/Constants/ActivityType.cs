namespace Steeple.Persistence.Constants;
/// <summary>
/// Bitwise set of activity categories a room will accept (and that organizers filter by).
/// </summary>
[Flags]
public enum ActivityType : int
{
    /// <summary>No activity types specified.</summary>
    None = 0,
    Children = 1,
    Sports = 2,
    Community = 4,
    Religious = 8,
    Arts = 16,
    Education = 32,
    Music = 64
}
