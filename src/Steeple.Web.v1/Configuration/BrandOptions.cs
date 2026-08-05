namespace Steeple.Web.Configuration;

/// <summary>
/// Swappable branding content, bound from the "Brand" section. Keeps the product name and
/// taglines out of views/controllers so the (still-in-flux) name can be changed in one place —
/// edit the "Brand" section, or override at demo time via the <c>Brand__Name</c> env var.
/// </summary>
public class BrandOptions
{
    /// <summary>Configuration section name.</summary>
    public const string SectionName = "Brand";

    /// <summary>Product / wordmark name shown throughout the UI (e.g. "Steeple").</summary>
    public string Name { get; set; } = "Steeple";

    /// <summary>Short tagline shown beside the wordmark and in the home-page title.</summary>
    public string Tagline { get; set; } = "Community space, near you";

    /// <summary>One-line description shown under the footer wordmark.</summary>
    public string FooterTagline { get; set; } = "A neighbourly noticeboard for spare community halls.";
}
