namespace Steeple.Api.Extensions;
/// <summary>
/// Helpers for projecting enums into stable camelCase wire tokens (CONTRACTS.md §2: "Enums").
/// Display formatting (spacing/casing for humans) is a client concern — clients humanize these
/// tokens for presentation.
/// </summary>
public static class FlagEnumExtensions
{
    /// <summary>
    /// Returns the set flag names of a flags enum, excluding the zero/<c>None</c> member, as
    /// stable camelCase tokens (e.g. <c>StepFreeAccess</c> -&gt; <c>"stepFreeAccess"</c>).
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
                result.Add(ToCamelCaseToken(flag.ToString()));
            }
        }

        return result;
    }

    /// <summary>
    /// Converts a PascalCase enum member name into a stable camelCase wire token by lowercasing
    /// only the leading character, e.g. <c>PublicSpace</c> -&gt; <c>"publicSpace"</c>.
    /// </summary>
    /// <param name="name">The PascalCase enum member name.</param>
    public static string ToCamelCaseToken(string name)
    {
        if (string.IsNullOrEmpty(name))
        {
            return name;
        }

        return char.ToLowerInvariant(name[0]) + name[1..];
    }
}
