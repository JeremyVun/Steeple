
namespace Steeple.Api.Configuration;
/// <summary>
/// Client-flags proxy configuration ("Flags" section, CONTRACTS §8). The plain boolean flags
/// (<c>mobile.apply_enabled</c> etc.) are read straight off <see cref="IConfiguration"/> by key
/// (dotted names aren't valid C# properties); <see cref="MobileMinSupportedBuild"/> is the one
/// value-shaped setting, feeding the <c>mobile.force_upgrade</c> rule.
/// </summary>
public sealed class FlagsOptions
{
    /// <summary>Configuration section name.</summary>
    public const string SectionName = "Flags";

    /// <summary>
    /// The lowest mobile build still supported. <c>mobile.force_upgrade</c> evaluates true when
    /// the caller's <c>build</c> is present and below this. Default 0 = never force (no build is
    /// ever &lt; 0).
    /// </summary>
    public int MobileMinSupportedBuild { get; set; }
}
