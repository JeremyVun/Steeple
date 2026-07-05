using FirebaseAdmin;
using Google.Apis.Auth.OAuth2;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Steeple.Api.Services.Analytics;
using Steeple.Api.Services.Flags;

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

        // Stateless over ILogger (writes one JSON line per event to stdout for Promtail/Loki,
        // see docs/ANALYTICS.md) -> singleton.
        services.AddSingleton<IAnalyticsSink, StdoutLogAnalyticsSink>();

        services.AddSteepleIdentity(configuration);
        services.AddSteepleApplications(configuration);
        services.AddSteepleManage(configuration);
        services.AddSteepleAvailability();
        services.AddSteepleMedia(configuration);
        services.AddSteepleFlags(configuration);
        services.AddSteepleAnalyticsIngest();
        services.AddSteepleRateLimiting();

        return services;
    }

    /// <summary>
    /// Manage module (SYSTEM_DESIGN §4, ROADMAP Phase 5): provider venue/room CRUD with
    /// server-side geocoding. The Google adapter needs its metered API key; without one the dev
    /// stub resolves every address to the beachhead center.
    /// </summary>
    private static IServiceCollection AddSteepleManage(this IServiceCollection services, IConfiguration configuration)
    {
        services.Configure<GeocodingOptions>(configuration.GetSection(GeocodingOptions.SectionName));

        services.AddScoped<IManageService, ManageService>();
        services.AddScoped<IManageRepository, EfManageRepository>();

        var geocoding = configuration.GetSection(GeocodingOptions.SectionName).Get<GeocodingOptions>() ?? new GeocodingOptions();
        if (!string.IsNullOrEmpty(geocoding.GoogleApiKey))
        {
            services.AddHttpClient<IGeocodingGateway, GoogleGeocodingGateway>();
        }
        else
        {
            services.AddScoped<IGeocodingGateway, StubGeocodingGateway>();
        }

        return services;
    }

    /// <summary>
    /// Availability module (SYSTEM_DESIGN §17, CONTRACTS §6a): a room's weekly open hours and
    /// blackout dates. Manager-scoped rule reads/writes plus the flag-gated publish check and the
    /// public listing-detail read. EF-backed, DbContext-scoped.
    /// </summary>
    private static IServiceCollection AddSteepleAvailability(this IServiceCollection services)
    {
        services.AddScoped<IAvailabilityService, AvailabilityService>();
        services.AddScoped<IAvailabilityRepository, EfAvailabilityRepository>();
        return services;
    }

    /// <summary>
    /// Media module (SYSTEM_DESIGN §9, ROADMAP Phase 5): the photo pipeline. Spaces settings
    /// select the S3 store; without them uploads land on local disk and Program.cs serves them
    /// at <c>/media</c> (dev loop, no cloud config needed).
    /// </summary>
    private static IServiceCollection AddSteepleMedia(this IServiceCollection services, IConfiguration configuration)
    {
        services.Configure<MediaOptions>(configuration.GetSection(MediaOptions.SectionName));

        services.AddScoped<IMediaService, MediaService>();
        services.AddScoped<IMediaRepository, EfMediaRepository>();

        // CPU-bound and stateless -> singleton.
        services.AddSingleton<IImageProcessor, ImageSharpImageProcessor>();

        var media = configuration.GetSection(MediaOptions.SectionName).Get<MediaOptions>() ?? new MediaOptions();
        if (media.UseObjectStorage)
        {
            services.AddSingleton<IMediaStore, S3MediaStore>();
        }
        else
        {
            services.AddSingleton<IMediaStore, LocalDiskMediaStore>();
        }

        return services;
    }

    /// <summary>
    /// The client flags proxy (CONTRACTS §8): config-backed flag reads plus the public allowlist
    /// evaluation behind <c>GET /api/v1/flags</c>.
    /// </summary>
    private static IServiceCollection AddSteepleFlags(this IServiceCollection services, IConfiguration configuration)
    {
        services.Configure<FlagsOptions>(configuration.GetSection(FlagsOptions.SectionName));

        // Config-derived and stateless -> singletons (mirrors Steeple.Web's ConfigFeatureFlags).
        services.AddSingleton<IFeatureFlags, ConfigFeatureFlags>();
        services.AddSingleton<IPublicFlagsService, PublicFlagsService>();

        return services;
    }

    /// <summary>Analytics ingest (CONTRACTS §7): validates/enriches the client batch, no persistence of its own.</summary>
    private static IServiceCollection AddSteepleAnalyticsIngest(this IServiceCollection services)
    {
        services.AddScoped<IEventIngestService, EventIngestService>();
        return services;
    }

    /// <summary>
    /// Applications + Notifications + Manage modules (SYSTEM_DESIGN §4, ROADMAP Phase 2): the
    /// apply → decide state machine, venue-manager authz reads, the inbox, and email fan-out.
    /// </summary>
    private static IServiceCollection AddSteepleApplications(this IServiceCollection services, IConfiguration configuration)
    {
        services.Configure<EmailOptions>(configuration.GetSection(EmailOptions.SectionName));

        services.AddScoped<IApplicationService, ApplicationService>();
        services.AddScoped<IApplicationRepository, EfApplicationRepository>();
        services.AddScoped<IVenueManagerRepository, EfVenueManagerRepository>();

        // Bookings module (ROADMAP Phase 3): approval materialization under the DB exclusion
        // constraint, both parties' lists, cancellation, no-show marking.
        services.AddScoped<IBookingService, BookingService>();
        services.AddScoped<IBookingRepository, EfBookingRepository>();

        // Ratings module (Phase 6 Slice 1): ratings, review comments, double-blind reveal, aggregates.
        services.AddScoped<IRatingService, RatingService>();
        services.AddScoped<IRatingRepository, EfRatingRepository>();

        services.AddScoped<INotificationService, NotificationService>();
        services.AddScoped<INotificationRepository, EfNotificationRepository>();
        services.AddScoped<INotificationDispatcher, NotificationDispatcher>();

        // Stateless over HttpClient + options; sends are fire-and-forget from scoped callers, so
        // the gateway must not capture scoped state -> typed singleton client.
        services.AddHttpClient<IEmailGateway, ResendEmailGateway>();

        services.AddSteeplePush(configuration);

        return services;
    }

    /// <summary>
    /// Push devices + FCM fan-out (CONTRACTS §4 <c>/me/devices</c>, §9): the device registry (EF,
    /// scoped) and the push gateway, which is only the real FCM adapter when a service account is
    /// configured — otherwise a log-only stand-in (ROADMAP Phase 4).
    /// </summary>
    private static IServiceCollection AddSteeplePush(this IServiceCollection services, IConfiguration configuration)
    {
        services.Configure<PushOptions>(configuration.GetSection(PushOptions.SectionName));

        // EF-backed, DbContext-scoped -> scoped.
        services.AddScoped<IDeviceRegistry, EfDeviceRegistry>();

        var push = configuration.GetSection(PushOptions.SectionName).Get<PushOptions>() ?? new PushOptions();
        if (!string.IsNullOrEmpty(push.ServiceAccountJson) || !string.IsNullOrEmpty(push.ServiceAccountJsonPath))
        {
            // One FirebaseApp per process; created lazily so environments without Push
            // configured never touch the SDK.
            services.AddSingleton(_ =>
            {
                var credential = !string.IsNullOrEmpty(push.ServiceAccountJson)
                    ? GoogleCredential.FromJson(push.ServiceAccountJson)
                    : GoogleCredential.FromFile(push.ServiceAccountJsonPath);
                return FirebaseApp.Create(new AppOptions { Credential = credential });
            });
            services.AddScoped<IPushGateway, FcmPushGateway>();
        }
        else
        {
            services.AddSingleton<IPushGateway, LoggingPushGateway>();
        }

        return services;
    }

    /// <summary>
    /// Identity module (SYSTEM_DESIGN §6): SSO ID-token verifiers, the API's own token issuance,
    /// bearer validation of self-issued access tokens, and the Turnstile abuse gate.
    /// </summary>
    private static IServiceCollection AddSteepleIdentity(this IServiceCollection services, IConfiguration configuration)
    {
        services.Configure<AuthOptions>(configuration.GetSection(AuthOptions.SectionName));
        services.Configure<TurnstileOptions>(configuration.GetSection(TurnstileOptions.SectionName));

        services.AddSingleton(TimeProvider.System);

        services.AddScoped<IIdentityService, IdentityService>();
        services.AddScoped<IIdentityRepository, EfIdentityRepository>();

        // Verifiers hold a JWKS cache (ConfigurationManager) -> singletons, one HttpClient each.
        services.AddHttpClient<GoogleIdTokenVerifier>();
        services.AddHttpClient<AppleIdTokenVerifier>();
        services.AddSingleton<IIdTokenVerifier>(sp => sp.GetRequiredService<GoogleIdTokenVerifier>());
        services.AddSingleton<IIdTokenVerifier>(sp => sp.GetRequiredService<AppleIdTokenVerifier>());

        services.AddSingleton<IAccessTokenIssuer, JwtAccessTokenIssuer>();
        services.AddHttpClient<ITurnstileVerifier, CloudflareTurnstileVerifier>();

        // Validate our own access tokens. MapInboundClaims=false keeps the raw `sub`/`sid`
        // claim names (see ClaimsPrincipalExtensions).
        services
            .AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
            .AddJwtBearer(_ => { }); // configured below, where AuthOptions can be resolved

        services
            .AddOptions<JwtBearerOptions>(JwtBearerDefaults.AuthenticationScheme)
            .Configure<IOptions<AuthOptions>>((bearer, auth) =>
            {
                var jwt = auth.Value.Jwt;
                bearer.MapInboundClaims = false;
                bearer.TokenValidationParameters = new Microsoft.IdentityModel.Tokens.TokenValidationParameters
                {
                    ValidIssuer = jwt.Issuer,
                    ValidAudience = jwt.Audience,
                    IssuerSigningKey = JwtAccessTokenIssuer.CreateSigningKey(jwt),
                    ValidateIssuerSigningKey = true,
                    ValidateLifetime = true,
                };
            });

        services.AddAuthorization();

        return services;
    }
}
