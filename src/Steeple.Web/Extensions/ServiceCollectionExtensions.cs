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

        return services;
    }
}
