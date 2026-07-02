using System.Text;

namespace Steeple.Api.Extensions;
/// <summary>
/// Helpers for projecting <see cref="FlagsAttribute"/> enums into human-readable token lists for presentation.
/// </summary>
public static class FlagEnumExtensions
{
    /// <summary>
    /// Returns the set flag names of a flags enum, excluding the zero/<c>None</c> member, with each
    /// PascalCase name humanised into spaced words (e.g. <c>StepFreeAccess</c> -&gt; "Step free access").
    /// </summary>
    /// <typeparam name="TEnum">A flags enum type.</typeparam>
    /// <param name="value">The combined flags value.</param>
    public static IReadOnlyList<string> ToNameList<TEnum>(this TEnum value)
        where TEnum : struct, Enum
    {
        var result = new List<string>();

        foreach (var flag in Enum.GetValues<TEnum>())
        {
            // Skip the zero member (None) — it is not a real flag.
            if (Convert.ToInt64(flag) == 0)
            {
                continue;
            }

            if (value.HasFlag(flag))
            {
                result.Add(Humanize(flag.ToString()));
            }
        }

        return result;
    }

    /// <summary>
    /// Converts a PascalCase identifier into spaced words with only the first letter capitalised,
    /// e.g. <c>AccessibleRestroom</c> -&gt; "Accessible restroom".
    /// </summary>
    /// <param name="name">The PascalCase identifier.</param>
    public static string Humanize(string name)
    {
        if (string.IsNullOrEmpty(name))
        {
            return name;
        }

        var sb = new StringBuilder(name.Length + 8);

        for (var i = 0; i < name.Length; i++)
        {
            var c = name[i];

            if (i > 0 && char.IsUpper(c))
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
                sb.Append(c);
            }
        }

        return sb.ToString();
    }
}
