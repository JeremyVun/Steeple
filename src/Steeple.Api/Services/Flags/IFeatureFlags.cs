
namespace Steeple.Api.Services.Flags;
/// <summary>
/// Feature-flag lookup. Currently config-backed (the "Flags" section, keys like
/// <c>mobile.apply_enabled</c>) because the flags SDK's source lives outside this repo — swap the
/// implementation for the SDK client when it lands (ROADMAP Phase 0 leftover; mirrors
/// <c>Steeple.Web.Services.IFeatureFlags</c>). Evaluation must stay local/in-memory either way:
/// never a blocking network call on the request path.
/// </summary>
public interface IFeatureFlags
{
    /// <summary>True when the flag exists and is enabled. Unknown flags are off (fail closed).</summary>
    bool IsEnabled(string key);
}

/// <summary>Configuration-backed <see cref="IFeatureFlags"/> ("Flags" section).</summary>
public sealed class ConfigFeatureFlags : IFeatureFlags
{
    private readonly IConfiguration _configuration;

    /// <summary>Creates the provider over the app configuration (re-reads, so appsettings reloads apply).</summary>
    public ConfigFeatureFlags(IConfiguration configuration) => _configuration = configuration;

    /// <inheritdoc />
    public bool IsEnabled(string key) => _configuration.GetValue($"Flags:{key}", false);
}
