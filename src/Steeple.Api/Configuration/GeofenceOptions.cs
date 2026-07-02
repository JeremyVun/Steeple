namespace Steeple.Api.Configuration;
/// <summary>
/// Strongly-typed configuration for the beachhead geofence, bound from the "Geofence" section.
/// </summary>
public class GeofenceOptions
{
    /// <summary>Configuration section name.</summary>
    public const string SectionName = "Geofence";

    /// <summary>Human-readable name of the served area.</summary>
    public string AreaName { get; set; } = "";

    /// <summary>Southern edge of the beachhead (decimal degrees).</summary>
    public double MinLatitude { get; set; }

    /// <summary>Northern edge of the beachhead (decimal degrees).</summary>
    public double MaxLatitude { get; set; }

    /// <summary>Western edge of the beachhead (decimal degrees).</summary>
    public double MinLongitude { get; set; }

    /// <summary>Eastern edge of the beachhead (decimal degrees).</summary>
    public double MaxLongitude { get; set; }

    /// <summary>Default map center latitude (decimal degrees).</summary>
    public double CenterLatitude { get; set; }

    /// <summary>Default map center longitude (decimal degrees).</summary>
    public double CenterLongitude { get; set; }
}
