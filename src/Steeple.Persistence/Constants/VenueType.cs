namespace Steeple.Persistence.Constants;
/// <summary>
/// The kind of organisation that owns/operates a venue.
/// </summary>
public enum VenueType
{
    /// <summary>A church or faith-based organisation with spare hall capacity.</summary>
    Church,

    /// <summary>A public or municipal space (e.g. community centre, library).</summary>
    PublicSpace,

    /// <summary>Any other venue type not otherwise categorised.</summary>
    Other
}
