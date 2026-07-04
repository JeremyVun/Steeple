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

    /// <summary>
    /// Parses one camelCase wire token back to its enum member (the inverse of
    /// <see cref="ToCamelCaseToken"/>); <c>null</c> when the token is unknown.
    /// </summary>
    public static TEnum? ParseToken<TEnum>(string? token) where TEnum : struct, Enum
    {
        if (string.IsNullOrWhiteSpace(token))
        {
            return null;
        }

        foreach (var member in Enum.GetValues<TEnum>())
        {
            if (string.Equals(ToCamelCaseToken(member.ToString()), token.Trim(), StringComparison.Ordinal))
            {
                return member;
            }
        }

        return null;
    }

    /// <summary>
    /// Combines a list of camelCase wire tokens into a flags value (manage write inputs).
    /// Unknown tokens land in <paramref name="unknown"/> so callers can reject them —
    /// silently dropping a provider's amenity would corrupt the listing.
    /// </summary>
    public static TEnum CombineTokens<TEnum>(IEnumerable<string> tokens, out List<string> unknown)
        where TEnum : struct, Enum
    {
        long acc = 0;
        unknown = [];

        foreach (var token in tokens)
        {
            if (ParseToken<TEnum>(token) is { } member)
            {
                acc |= Convert.ToInt64(member);
            }
            else if (!string.IsNullOrWhiteSpace(token))
            {
                unknown.Add(token);
            }
        }

        return (TEnum)Enum.ToObject(typeof(TEnum), acc);
    }
}
