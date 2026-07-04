using System.Globalization;
using System.Text;

namespace Steeple.Api.Utils;
/// <summary>
/// Slug generation for provider-created venues/rooms. Slugs are the public URL identifier and
/// stay immutable after creation (renames must not break shared listing links or SEO).
/// </summary>
public static class Slugs
{
    /// <summary>Max slug length, matching the venues/rooms column size minus suffix headroom.</summary>
    private const int MaxLength = 150;

    /// <summary>
    /// Lowercases, strips diacritics, and collapses everything non-alphanumeric into single
    /// hyphens: <c>"St. Andrew's Hall"</c> → <c>"st-andrews-hall"</c>. Returns <c>""</c> when
    /// nothing usable survives (caller treats that as a validation failure).
    /// </summary>
    public static string From(string name)
    {
        var normalized = name.Normalize(NormalizationForm.FormD);
        var builder = new StringBuilder(normalized.Length);
        var lastWasHyphen = true; // suppress leading hyphens

        foreach (var ch in normalized)
        {
            var category = CharUnicodeInfo.GetUnicodeCategory(ch);
            if (category == UnicodeCategory.NonSpacingMark)
            {
                continue; // diacritic remnants of FormD
            }

            if (char.IsAsciiLetterOrDigit(ch))
            {
                builder.Append(char.ToLowerInvariant(ch));
                lastWasHyphen = false;
            }
            else if (ch is '\'' or '’' or '‘' or 'ʼ' or '′')
            {
                // Possessives read better dropped than hyphenated ("andrews", not "andrew-s");
                // covers straight/curly/reversed apostrophe and modifier-letter/prime lookalikes.
            }
            else if (!lastWasHyphen)
            {
                builder.Append('-');
                lastWasHyphen = true;
            }
        }

        var slug = builder.ToString().TrimEnd('-');
        return slug.Length <= MaxLength ? slug : slug[..MaxLength].TrimEnd('-');
    }

    /// <summary>
    /// Finds a free slug by probing <c>base, base-2, base-3…</c> against
    /// <paramref name="existsAsync"/> (the caller supplies the uniqueness scope).
    /// </summary>
    public static async Task<string> UniquifyAsync(string baseSlug, Func<string, Task<bool>> existsAsync)
    {
        if (!await existsAsync(baseSlug).ConfigureAwait(false))
        {
            return baseSlug;
        }

        for (var n = 2; ; n++)
        {
            var candidate = $"{baseSlug}-{n}";
            if (!await existsAsync(candidate).ConfigureAwait(false))
            {
                return candidate;
            }
        }
    }
}
