using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.Extensions.Options;

namespace Steeple.Web.Extensions;

/// <summary>
/// Composition root for the web funnel: binds branding content and registers the typed HTTP client
/// to <c>Steeple.Api</c>. The funnel holds no database or domain services — it renders contract
/// DTOs fetched from the API.
/// </summary>
public static class ServiceCollectionExtensions
{
    /// <summary>
    /// Registers branding options and the API client (base URL from the "Api:BaseUrl" setting).
    /// </summary>
    public static IServiceCollection AddSteeple(this IServiceCollection services, IConfiguration configuration)
    {
        // Branding is static for the app lifetime; expose the resolved value directly so views and
        // controllers can inject BrandOptions without unwrapping IOptions<>.
        services.Configure<BrandOptions>(configuration.GetSection(BrandOptions.SectionName));
        services.AddSingleton(sp => sp.GetRequiredService<IOptions<BrandOptions>>().Value);

        var apiBaseUrl = configuration["Api:BaseUrl"]
            ?? throw new InvalidOperationException("Missing required configuration 'Api:BaseUrl'.");

        services.AddHttpClient<ISteepleApiClient, SteepleApiClient>(client =>
        {
            client.BaseAddress = new Uri(apiBaseUrl);
            // Fail fast rather than hang a funnel request on the default 100s timeout if the API is slow/down.
            client.Timeout = TimeSpan.FromSeconds(10);
        });

        services.AddSteepleAuth(configuration);

        return services;
    }

    /// <summary>
    /// BFF sign-in (SYSTEM_DESIGN §6): the encrypted auth cookie that carries the API token pair
    /// server-side, persisted DataProtection keys so sessions survive deploys, the browser SSO
    /// options, the config-backed feature flags, and the mobile deep-link (Universal/App Links)
    /// well-known file config (CONTRACTS §9).
    /// </summary>
    private static IServiceCollection AddSteepleAuth(this IServiceCollection services, IConfiguration configuration)
    {
        services.Configure<AuthFlowOptions>(configuration.GetSection(AuthFlowOptions.SectionName));
        services.Configure<TurnstileClientOptions>(configuration.GetSection(TurnstileClientOptions.SectionName));
        services.Configure<DeepLinksOptions>(configuration.GetSection(DeepLinksOptions.SectionName));

        services.AddSingleton<IFeatureFlags, ConfigFeatureFlags>();

        // BFF-visible funnel events (apply form opened, SSO gate fired) — same stdout log shape
        // as the API's analytics sink, picked up by the deployed Promtail/Loki pipeline.
        services.AddSingleton<IWebAnalytics, WebAnalytics>();

        // Without persisted keys every deploy would rotate the DataProtection keyring and log
        // everyone out (the auth cookie could no longer be decrypted). In compose the path is a
        // named volume; local `dotnet run` keeps the default user-profile keyring.
        var dataProtection = services.AddDataProtection().SetApplicationName("Steeple.Web");
        if (configuration["DataProtection:KeysPath"] is { Length: > 0 } keysPath)
        {
            dataProtection.PersistKeysToFileSystem(new DirectoryInfo(keysPath));
        }

        services.AddScoped<SteepleCookieEvents>();

        services
            .AddAuthentication(CookieAuthenticationDefaults.AuthenticationScheme)
            .AddCookie(options =>
            {
                options.Cookie.Name = "steeple.auth";
                options.Cookie.HttpOnly = true;
                options.Cookie.SameSite = SameSiteMode.Lax;
                // TLS terminates at the reverse proxy; match the session cookie's policy.
                options.Cookie.SecurePolicy = CookieSecurePolicy.SameAsRequest;
                // The refresh token idles out at ~90 days server-side; renewals during the
                // sliding window keep active users signed in indefinitely.
                options.ExpireTimeSpan = TimeSpan.FromDays(60);
                options.SlidingExpiration = true;
                options.LoginPath = "/login";
                options.AccessDeniedPath = "/login";
                options.EventsType = typeof(SteepleCookieEvents);
            });

        services.AddAuthorization();

        return services;
    }
}
