using Microsoft.Extensions.Options;

namespace Steeple.Api.Services.Flags;
/// <summary>
/// Evaluates the public, client-visible flag set for <c>GET /api/v1/flags</c> (CONTRACTS §8): an
/// explicit hardcoded allowlist — anything not on it never leaves the backend, even if it exists
/// in the "Flags" config section. Evaluation is local config reads only, never a network call.
/// </summary>
public interface IPublicFlagsService
{
    /// <summary>
    /// Evaluates every public flag for the caller's context. <paramref name="platform"/> and
    /// <paramref name="build"/> are the rule inputs (CONTRACTS §8) — today only
    /// <c>mobile.force_upgrade</c> reads <paramref name="build"/>.
    /// </summary>
    IReadOnlyDictionary<string, bool> Evaluate(string? platform, int? build);
}

/// <summary>Default <see cref="IPublicFlagsService"/> over <see cref="IFeatureFlags"/> + <see cref="FlagsOptions"/>.</summary>
public sealed class PublicFlagsService : IPublicFlagsService
{
    /// <summary>
    /// The public flag allowlist (CONTRACTS §8). Additive only — adding a key here is the one
    /// place that decides a flag is safe for clients to see.
    /// </summary>
    public static readonly IReadOnlyList<string> PublicFlagKeys =
    [
        "mobile.apply_enabled",
        "mobile.manage_enabled",
        "mobile.force_upgrade",
    ];

    private const string ForceUpgradeKey = "mobile.force_upgrade";

    private readonly IFeatureFlags _flags;
    private readonly FlagsOptions _options;

    /// <summary>Creates the service over its flag reader and bound options.</summary>
    public PublicFlagsService(IFeatureFlags flags, IOptions<FlagsOptions> options)
    {
        _flags = flags;
        _options = options.Value;
    }

    /// <inheritdoc />
    public IReadOnlyDictionary<string, bool> Evaluate(string? platform, int? build)
    {
        var result = new Dictionary<string, bool>(PublicFlagKeys.Count);

        foreach (var key in PublicFlagKeys)
        {
            result[key] = key == ForceUpgradeKey
                ? EvaluateForceUpgrade(build)
                : _flags.IsEnabled(key);
        }

        return result;
    }

    /// <summary>
    /// True when the caller reported a build and it is below the configured minimum
    /// (<see cref="FlagsOptions.MobileMinSupportedBuild"/>). No build present (web, or a mobile
    /// client that hasn't started sending one yet) never forces an upgrade.
    /// </summary>
    private bool EvaluateForceUpgrade(int? build) =>
        build is { } b && b < _options.MobileMinSupportedBuild;
}
