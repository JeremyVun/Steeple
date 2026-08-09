using Npgsql;
using Steeple.Api.Proxies.Identity;

namespace Steeple.Api.Configuration;

/// <summary>
/// The single fail-closed Production configuration gate. Development keeps its local adapters;
/// Production must name every external capability's mode and provide the selected adapter's
/// complete credentials before any services are registered.
/// </summary>
public static class ProductionConfigurationValidator
{
    private const string Enabled = "enabled";
    private const string Disabled = "disabled";

    /// <summary>Rejects an incomplete or development-backed Production deployment.</summary>
    public static void Validate(IConfiguration configuration, IHostEnvironment environment)
    {
        if (!environment.IsProduction())
        {
            return;
        }

        var errors = new List<string>();

        ValidateDatabase(configuration, errors);
        ValidateIdentity(configuration, errors);
        ValidateEmail(configuration, errors);
        ValidateGeocoding(configuration, errors);
        ValidateMedia(configuration, errors);
        ValidateSeo(configuration, errors);
        ValidateTurnstile(configuration, errors);
        ValidatePush(configuration, errors);
        ValidatePayments(configuration, errors);

        if (errors.Count > 0)
        {
            throw new InvalidOperationException(
                "Production configuration is invalid:\n - " + string.Join("\n - ", errors));
        }
    }

    private static void ValidateDatabase(IConfiguration configuration, List<string> errors)
    {
        var value = configuration.GetConnectionString("SteepleDb");
        if (string.IsNullOrWhiteSpace(value))
        {
            errors.Add("Database: ConnectionStrings:SteepleDb is required.");
            return;
        }

        try
        {
            var connection = new NpgsqlConnectionStringBuilder(value);
            if (string.IsNullOrWhiteSpace(connection.Password))
            {
                errors.Add("Database: SteepleDb must include a deployment password.");
            }
            else if (string.Equals(connection.Password, "steeple_dev_pw", StringComparison.Ordinal))
            {
                errors.Add("Database: SteepleDb cannot use the repository development password.");
            }
        }
        catch (ArgumentException)
        {
            errors.Add("Database: ConnectionStrings:SteepleDb is not a valid PostgreSQL connection string.");
        }
    }

    private static void ValidateIdentity(IConfiguration configuration, List<string> errors)
    {
        var auth = configuration.GetSection(AuthOptions.SectionName).Get<AuthOptions>() ?? new AuthOptions();
        try
        {
            _ = JwtAccessTokenIssuer.CreateSigningKey(auth.Jwt, rejectKnownDevelopmentKeys: true);
        }
        catch (InvalidOperationException exception)
        {
            errors.Add($"Identity/JWT: {exception.Message}");
        }

        var googleEnabled = ValidateProvider("Google", auth.Google, required: false, errors);
        var appleEnabled = ValidateProvider("Apple", auth.Apple, required: true, errors);
        if (!googleEnabled && !appleEnabled)
        {
            errors.Add("Identity/SSO: at least one provider must be enabled.");
        }

        if (configuration.GetValue<bool>($"{AuthOptions.SectionName}:DevLoginEnabled"))
        {
            errors.Add("Identity/SSO: the Development login provider cannot be enabled.");
        }
    }

    private static bool ValidateProvider(
        string name,
        AuthOptions.ProviderOptions provider,
        bool required,
        List<string> errors)
    {
        var mode = provider.Mode.Trim();
        var ids = provider.ClientIds.Where(id => !string.IsNullOrWhiteSpace(id)).ToList();
        if (!IsOneOf(mode, Enabled, Disabled))
        {
            errors.Add($"Identity/{name}: Mode must be explicitly 'enabled' or 'disabled'.");
            return false;
        }

        var enabled = mode.Equals(Enabled, StringComparison.OrdinalIgnoreCase);
        if (required && !enabled)
        {
            errors.Add($"Identity/{name}: this provider is required in Production.");
        }
        if (enabled && ids.Count == 0)
        {
            errors.Add($"Identity/{name}: enabled mode requires at least one client ID.");
        }
        if (!enabled && ids.Count > 0)
        {
            errors.Add($"Identity/{name}: disabled mode cannot carry client IDs.");
        }

        return enabled && ids.Count > 0;
    }

    private static void ValidateEmail(IConfiguration configuration, List<string> errors)
    {
        var email = configuration.GetSection(EmailOptions.SectionName).Get<EmailOptions>() ?? new EmailOptions();
        if (!email.Mode.Equals("resend", StringComparison.OrdinalIgnoreCase))
        {
            errors.Add("Email: Mode must be explicitly 'resend'.");
        }
        if (string.IsNullOrWhiteSpace(email.ApiKey))
        {
            errors.Add("Email: resend mode requires ApiKey.");
        }
        if (string.IsNullOrWhiteSpace(email.From)
            || email.From.Contains("onboarding@resend.dev", StringComparison.OrdinalIgnoreCase))
        {
            errors.Add("Email: resend mode requires a deployment sender in From.");
        }
        RequireHttpsUrl("Email", "WebBaseUrl", email.WebBaseUrl, errors);
    }

    private static void ValidateGeocoding(IConfiguration configuration, List<string> errors)
    {
        var geocoding = configuration.GetSection(GeocodingOptions.SectionName).Get<GeocodingOptions>() ?? new GeocodingOptions();
        if (geocoding.Mode.Equals("apple", StringComparison.OrdinalIgnoreCase))
        {
            if (!geocoding.HasAppleCredentials)
            {
                errors.Add("Geocoding: apple mode requires AppleTeamId, AppleKeyId, and ApplePrivateKey.");
            }
            return;
        }
        if (geocoding.Mode.Equals("google", StringComparison.OrdinalIgnoreCase))
        {
            if (string.IsNullOrWhiteSpace(geocoding.GoogleApiKey))
            {
                errors.Add("Geocoding: google mode requires GoogleApiKey.");
            }
            return;
        }

        errors.Add("Geocoding: Mode must explicitly select 'apple' or 'google'; development adapters are forbidden.");
    }

    private static void ValidateMedia(IConfiguration configuration, List<string> errors)
    {
        var media = configuration.GetSection(MediaOptions.SectionName).Get<MediaOptions>() ?? new MediaOptions();
        if (!media.Mode.Equals("objectStorage", StringComparison.OrdinalIgnoreCase))
        {
            errors.Add("Media: Mode must be explicitly 'objectStorage'; local disk is Development-only.");
            return;
        }
        if (!media.HasObjectStorageConfiguration)
        {
            errors.Add("Media: objectStorage mode requires ServiceUrl, Bucket, AccessKey, SecretKey, and PublicBaseUrl.");
        }
        RequireHttpsUrl("Media", "ServiceUrl", media.ServiceUrl, errors);
        RequireHttpsUrl("Media", "PublicBaseUrl", media.PublicBaseUrl, errors);
    }

    private static void ValidateSeo(IConfiguration configuration, List<string> errors)
    {
        var seo = configuration.GetSection(SeoOptions.SectionName).Get<SeoOptions>() ?? new SeoOptions();
        RequireHttpsUrl("SEO", "PublicBaseUrl", seo.PublicBaseUrl, errors);
    }

    private static void ValidateTurnstile(IConfiguration configuration, List<string> errors)
    {
        var turnstile = configuration.GetSection(TurnstileOptions.SectionName).Get<TurnstileOptions>() ?? new TurnstileOptions();
        var mode = turnstile.Mode.Trim();
        if (!IsOneOf(mode, Enabled, Disabled))
        {
            errors.Add("Turnstile: Mode must be explicitly 'enabled' or 'disabled'.");
            return;
        }
        if (mode.Equals(Enabled, StringComparison.OrdinalIgnoreCase) && string.IsNullOrWhiteSpace(turnstile.SecretKey))
        {
            errors.Add("Turnstile: enabled mode requires SecretKey.");
        }
        if (mode.Equals(Disabled, StringComparison.OrdinalIgnoreCase) && !string.IsNullOrWhiteSpace(turnstile.SecretKey))
        {
            errors.Add("Turnstile: disabled mode cannot carry SecretKey.");
        }
    }

    private static void ValidatePush(IConfiguration configuration, List<string> errors)
    {
        var push = configuration.GetSection(PushOptions.SectionName).Get<PushOptions>() ?? new PushOptions();
        var mode = push.Mode.Trim();
        if (!IsOneOf(mode, "fcm", Disabled))
        {
            errors.Add("Push: Mode must be explicitly 'fcm' or 'disabled'.");
            return;
        }

        var inline = !string.IsNullOrWhiteSpace(push.ServiceAccountJson);
        var path = !string.IsNullOrWhiteSpace(push.ServiceAccountJsonPath);
        if (mode.Equals("fcm", StringComparison.OrdinalIgnoreCase) && inline == path)
        {
            errors.Add("Push: fcm mode requires exactly one of ServiceAccountJson or ServiceAccountJsonPath.");
        }
        if (mode.Equals(Disabled, StringComparison.OrdinalIgnoreCase) && (inline || path))
        {
            errors.Add("Push: disabled mode cannot carry FCM credentials.");
        }
    }

    private static void ValidatePayments(IConfiguration configuration, List<string> errors)
    {
        var payments = configuration.GetSection(PaymentsOptions.SectionName).Get<PaymentsOptions>() ?? new PaymentsOptions();
        if (configuration.GetValue<bool>($"Flags:{FeatureFlagKeys.PaymentsEnabled}")
            && payments.Gateway.Equals(PaymentsOptions.MockGateway, StringComparison.OrdinalIgnoreCase))
        {
            errors.Add("Payments: Production cannot enable 'payments.enabled' while Gateway is 'mock'.");
        }
    }

    private static void RequireHttpsUrl(string capability, string key, string? value, List<string> errors)
    {
        if (!Uri.TryCreate(value, UriKind.Absolute, out var uri)
            || !uri.Scheme.Equals(Uri.UriSchemeHttps, StringComparison.OrdinalIgnoreCase)
            || string.IsNullOrWhiteSpace(uri.Host))
        {
            errors.Add($"{capability}: {key} must be an absolute HTTPS URL.");
        }
    }

    private static bool IsOneOf(string value, params string[] choices) =>
        choices.Any(choice => value.Equals(choice, StringComparison.OrdinalIgnoreCase));
}
