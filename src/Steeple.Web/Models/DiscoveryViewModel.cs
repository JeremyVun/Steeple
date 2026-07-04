using System.Text;

namespace Steeple.Web.Models;
/// <summary>
/// A single selectable filter option: the underlying enum value plus a humanized label.
/// </summary>
/// <param name="Value">The enum member name (e.g. <c>"StepFreeAccess"</c>), used as the form value.</param>
/// <param name="Label">A human-friendly label (e.g. <c>"Step free access"</c>).</param>
public readonly record struct FilterOption(string Value, string Label);

/// <summary>
/// View model for the discovery index and its HTMX-swapped results partial.
/// Carries the search outcome, the echoed query (so filters stay sticky), the
/// geographic context for the map, and the filter option lists for the UI.
/// </summary>
public sealed class DiscoveryViewModel
{
    /// <summary>The search outcome (cards, counts, applied bounds).</summary>
    public required ListingSearchResult Result { get; init; }

    /// <summary>The query echoed back so the filter UI can render its current state.</summary>
    public required ListingSearchQuery Query { get; init; }

    /// <summary>Human-readable name of the served area.</summary>
    public required string AreaName { get; init; }

    /// <summary>Default map center for the served area.</summary>
    public required GeoPoint Center { get; init; }

    /// <summary>The fixed beachhead bounds (used to frame the map).</summary>
    public required BoundingBox Beachhead { get; init; }

    /// <summary>Distinct suburbs (alphabetical) offered in the suburb picker.</summary>
    public IReadOnlyList<string> SuburbOptions { get; init; } = [];

    /// <summary>Selectable activity-type filter options (excludes <see cref="ActivityType.None"/>).</summary>
    public IReadOnlyList<FilterOption> ActivityOptions { get; } = BuildOptions<ActivityType>();

    /// <summary>Selectable accessibility filter options (excludes <see cref="AccessibilityFeature.None"/>).</summary>
    public IReadOnlyList<FilterOption> AccessibilityOptions { get; } = BuildOptions<AccessibilityFeature>();

    /// <summary>True when the selected activity flag is set on the current query.</summary>
    public bool IsActivitySelected(string value) =>
        Enum.TryParse<ActivityType>(value, out var v) && (Query.Activities & v) == v && v != ActivityType.None;

    /// <summary>True when the selected accessibility flag is set on the current query.</summary>
    public bool IsAccessibilitySelected(string value) =>
        Enum.TryParse<AccessibilityFeature>(value, out var v) && (Query.Accessibility & v) == v && v != AccessibilityFeature.None;

    /// <summary>Builds the option list for a flags enum, excluding the zero "None" member.</summary>
    private static IReadOnlyList<FilterOption> BuildOptions<TEnum>() where TEnum : struct, Enum
    {
        var list = new List<FilterOption>();
        foreach (var value in Enum.GetValues<TEnum>())
        {
            var name = value.ToString();
            if (name == "None")
            {
                continue;
            }

            list.Add(new FilterOption(name, Humanize(name)));
        }

        return list;
    }

    /// <summary>
    /// Turns a PascalCase or camelCase compound identifier into a spaced, sentence-cased label —
    /// e.g. the funnel's own enum names (<c>"StepFreeAccess"</c>) or the API's stable camelCase
    /// wire tokens (<c>"stepFreeAccess"</c>, <c>"airConditioning"</c>) both become
    /// <c>"Step free access"</c> / <c>"Air conditioning"</c>. Used both to label filter chips
    /// (this view model's own <see cref="ActivityType"/>/<see cref="AccessibilityFeature"/> names)
    /// and to display Activities/Accessibility/Amenities/VenueType values returned by the API.
    /// </summary>
    public static string Humanize(string token)
    {
        if (string.IsNullOrEmpty(token))
        {
            return token;
        }

        var sb = new StringBuilder(token.Length + 4);
        for (var i = 0; i < token.Length; i++)
        {
            var c = token[i];
            if (i > 0 && char.IsUpper(c) && (!char.IsUpper(token[i - 1]) || (i + 1 < token.Length && !char.IsUpper(token[i + 1]))))
            {
                sb.Append(' ');
                sb.Append(char.ToLowerInvariant(c));
            }
            else if (i == 0)
            {
                sb.Append(char.ToUpperInvariant(c));
            }
            else
            {
                sb.Append(char.ToLowerInvariant(c));
            }
        }

        return sb.ToString();
    }
}
