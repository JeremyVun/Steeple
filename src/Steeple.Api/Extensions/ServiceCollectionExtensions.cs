using Microsoft.EntityFrameworkCore;

namespace Steeple.Api.Extensions;

/// <summary>
/// Composition root for the API: binds the geofence options and registers the use-case services
/// and the outbound adapters (EF persistence, geocoding stub, analytics sink).
/// </summary>
public static class ServiceCollectionExtensions
{
    /// <summary>
    /// Registers all Steeple API services and binds the geofence options (the "Geofence" section
    /// and the "SteepleDb" connection string).
    /// </summary>
    public static IServiceCollection AddSteepleApi(this IServiceCollection services, IConfiguration configuration)
    {
        services.Configure<GeofenceOptions>(configuration.GetSection(GeofenceOptions.SectionName));

        // Geofence is configuration-derived and stateless -> singleton.
        services.AddSingleton<IGeofencePolicy, GeofencePolicy>();

        // Listing service depends on a scoped repository (EF DbContext) -> scoped.
        services.AddScoped<IListingService, ListingService>();

        // Persistence + outbound adapters. Schema is owned by Liquibase — the API never migrates.
        services.AddDbContext<SteepleDbContext>(options =>
            options.UseNpgsql(configuration.GetConnectionString("SteepleDb")));

        services.AddScoped<IRoomRepository, RoomRepository>();
        services.AddScoped<IGeocodingGateway, StubGeocodingGateway>();

        // Stateless over ILogger (writes one JSON line per event to stdout for Promtail/Loki,
        // see docs/ANALYTICS.md) -> singleton.
        services.AddSingleton<IAnalyticsSink, StdoutLogAnalyticsSink>();

        return services;
    }
}
