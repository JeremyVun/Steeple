using System.Globalization;
using System.Text;

namespace Steeple.Api.Services.Seo;

/// <summary>
/// The formatting rules a route document shares with the product surface: wire tokens made
/// readable, host prose made safe for a meta description, and money written the way the app
/// writes it. Kept public and small so the P4 client metadata owner has one tested reference to
/// match rather than a second set of rules (design SEO-D7).
/// </summary>
public static class SeoText
{
    /// <summary>
    /// Wire tokens as the words a person reads. This is web v2's
    /// <c>src/data/vocabulary.js</c>, token for token: the document a crawler reads and the sheet
    /// the app opens describe the same room, so "Wi-Fi" must not become "Wifi" because one of them
    /// was rendered by a different process. <see cref="Humanize"/> is the answer for a token that
    /// is in neither registry — steeple is allowed to learn a word after a client shipped.
    /// Pinned on both sides by <c>tests/fixtures/seo-formats.json</c>.
    /// </summary>
    private static readonly IReadOnlyDictionary<string, string> Labels = new Dictionary<string, string>(StringComparer.Ordinal)
    {
        // activities
        ["children"] = "Children",
        ["sports"] = "Sports",
        ["community"] = "Community",
        ["religious"] = "Religious",
        ["arts"] = "Arts",
        ["education"] = "Education",
        ["music"] = "Music",
        // amenities
        ["parking"] = "Parking",
        ["kitchen"] = "Kitchen",
        ["restrooms"] = "Restrooms",
        ["wifi"] = "Wi-Fi",
        ["audioVisual"] = "Audio/visual",
        ["tables"] = "Tables",
        ["chairs"] = "Chairs",
        ["heating"] = "Heating",
        ["airConditioning"] = "Air conditioning",
        ["stage"] = "Stage",
        ["piano"] = "Piano",
        // accessibility
        ["stepFreeAccess"] = "Step-free access",
        ["accessibleRestroom"] = "Accessible restroom",
        ["accessibleParking"] = "Accessible parking",
        ["hearingLoop"] = "Hearing loop",
        ["liftAccess"] = "Lift access",
    };

    /// <summary>The printed label for a wire token, humanized when nobody has named it.</summary>
    public static string Label(string token) =>
        Labels.TryGetValue(token, out var label) ? label : Humanize(token);

    /// <summary>
    /// Turns a stable camelCase wire token into a sentence-cased label: <c>"stepFreeAccess"</c> →
    /// <c>"Step free access"</c>, <c>"airConditioning"</c> → <c>"Air conditioning"</c>. Ported from
    /// web v1's retired <c>DiscoveryViewModel.Humanize</c>; a raw token is never shown or emitted.
    /// </summary>
    public static string Humanize(string token)
    {
        if (string.IsNullOrEmpty(token))
        {
            return token;
        }

        var builder = new StringBuilder(token.Length + 4);
        for (var i = 0; i < token.Length; i++)
        {
            var c = token[i];
            if (i == 0)
            {
                builder.Append(char.ToUpperInvariant(c));
            }
            else if (char.IsUpper(c)
                && (!char.IsUpper(token[i - 1]) || (i + 1 < token.Length && !char.IsUpper(token[i + 1]))))
            {
                builder.Append(' ');
                builder.Append(char.ToLowerInvariant(c));
            }
            else
            {
                builder.Append(char.ToLowerInvariant(c));
            }
        }

        return builder.ToString();
    }

    /// <summary>
    /// Collapses every run of whitespace (including the newlines host prose is full of) into one
    /// space and trims. A meta description is one line whatever the host typed.
    /// </summary>
    public static string Squash(string? text)
    {
        if (string.IsNullOrWhiteSpace(text))
        {
            return string.Empty;
        }

        var builder = new StringBuilder(text.Length);
        var lastWasSpace = true;
        foreach (var c in text)
        {
            if (char.IsWhiteSpace(c))
            {
                if (!lastWasSpace)
                {
                    builder.Append(' ');
                    lastWasSpace = true;
                }
            }
            else
            {
                builder.Append(c);
                lastWasSpace = false;
            }
        }

        return builder.ToString().TrimEnd();
    }

    /// <summary>
    /// Bounds an already-squashed string to <paramref name="max"/> characters, cutting at a word
    /// boundary and ending in an ellipsis. Never returns a mid-word stump.
    /// </summary>
    public static string Clip(string text, int max)
    {
        if (text.Length <= max)
        {
            return text;
        }

        var cut = text.LastIndexOf(' ', Math.Min(max - 1, text.Length - 1));
        var head = (cut > max / 2 ? text[..cut] : text[..(max - 1)]).TrimEnd(' ', ',', ';', ':', '.', '—', '-');
        return head + "…";
    }

    /// <summary>
    /// Money as the product writes it: <c>$45</c> for USD, <c>45 AUD</c> for anything else, with
    /// whole amounts written whole. Mirrors web v2's <c>ui/copy.js</c>.
    /// </summary>
    public static string Money(decimal amount, string currency)
    {
        var figure = amount.ToString("0.##", CultureInfo.InvariantCulture);
        return string.Equals(currency, "USD", StringComparison.OrdinalIgnoreCase)
            ? "$" + figure
            : $"{figure} {currency.ToUpperInvariant()}";
    }

    /// <summary>
    /// The hourly rate as a phrase: <c>$45/hr</c>, or <c>Free</c> when a legacy row still carries
    /// no price (free listings were removed from the product, but old rows outlive decisions).
    /// </summary>
    public static string Rate(decimal pricePerHour, string currency) =>
        pricePerHour <= 0m ? "Free" : Money(pricePerHour, currency) + "/hr";
}
