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
    public static IServiceCollection AddSteepleApi(
        this IServiceCollection services,
        IConfiguration configuration,
        IHostEnvironment environment)
    {
        ProductionConfigurationValidator.Validate(configuration, environment);

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

        services.AddSteepleIdentity(configuration, environment);
        services.AddSteepleApplications(configuration, environment);
        services.AddSteeplePayments(configuration);
        services.AddSteepleManage(configuration);
        services.AddSteepleAvailability();
        services.AddSteepleMedia(configuration);
        services.AddSteepleFlags(configuration);
        services.AddSteepleAnalyticsIngest();
        services.AddSteepleReminders(configuration);
        services.AddSteepleRetention(configuration);
        services.AddSteepleSeo(configuration);
        services.AddSteepleRateLimiting();

        return services;
    }

    /// <summary>
    /// The crawler surface (docs/backlog/seo/design.md): the one canonical-public-base resolver
    /// that the sitemap and the listing documents share, and the document renderer. Both are
    /// stateless over configuration and contracts -> singletons.
    /// </summary>
    private static IServiceCollection AddSteepleSeo(this IServiceCollection services, IConfiguration configuration)
    {
        services.Configure<SeoOptions>(configuration.GetSection(SeoOptions.SectionName));

        services.AddSingleton<IPublicBaseResolver, PublicBaseResolver>();
        services.AddSingleton<IWebDocumentRenderer, WebDocumentRenderer>();

        return services;
    }

    /// <summary>
    /// Payments module (docs/contracts/payments.md): the mock gateway era of the payments.md
    /// design — method-on-file, per-occurrence charge machinery, refunds, payout-onboarding stub,
    /// and the <see cref="PaymentSweeper"/> (the first background worker; SYSTEM_DESIGN §17).
    /// Swapping <see cref="MockPaymentGateway"/> for the Stripe adapter is the whole Stripe cost.
    /// </summary>
    private static IServiceCollection AddSteeplePayments(
        this IServiceCollection services,
        IConfiguration configuration)
    {
        services.Configure<PaymentsOptions>(configuration.GetSection(PaymentsOptions.SectionName));

        var payments = configuration.GetSection(PaymentsOptions.SectionName).Get<PaymentsOptions>() ?? new PaymentsOptions();
        var paymentsEnabled = configuration.GetValue<bool>("Flags:payments.enabled");
        if (!string.Equals(payments.Gateway, PaymentsOptions.MockGateway, StringComparison.OrdinalIgnoreCase))
        {
            throw new InvalidOperationException($"Unsupported payment gateway '{payments.Gateway}'.");
        }

        services.AddScoped<IPaymentService, PaymentService>();
        services.AddScoped<IPaymentRepository, EfPaymentRepository>();

        // Stateless and synchronous -> singleton; the Stripe adapter later becomes a typed
        // HttpClient registration behind the same port.
        services.AddSingleton<IPaymentGateway, MockPaymentGateway>();

        if (paymentsEnabled)
        {
            services.AddHostedService<PaymentSweeper>();
        }

        return services;
    }

    /// <summary>
    /// Manage module (SYSTEM_DESIGN §4, ROADMAP Phase 5): provider venue/room CRUD with
    /// server-side geocoding and address autocomplete. Complete Apple Maps credentials select the
    /// Apple adapter (geocoding + autocomplete); a Google key selects the Google adapter
    /// (geocoding only); without either the dev stub resolves every address to the beachhead
    /// center and answers canned suggestions.
    /// </summary>
    private static IServiceCollection AddSteepleManage(this IServiceCollection services, IConfiguration configuration)
    {
        services.Configure<GeocodingOptions>(configuration.GetSection(GeocodingOptions.SectionName));

        services.AddScoped<IManageService, ManageService>();
        services.AddScoped<IManageRepository, EfManageRepository>();

        var geocoding = configuration.GetSection(GeocodingOptions.SectionName).Get<GeocodingOptions>() ?? new GeocodingOptions();
        if (geocoding.UseApple)
        {
            services.AddSingleton<AppleMapsTokenProvider>();
            services.AddHttpClient<IGeocodingGateway, AppleMapsGeocodingGateway>();
        }
        else if (geocoding.UseGoogle)
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

    /// <summary>
    /// Upcoming-booking reminders: the sweep (scoped, over the DbContext) plus its background
    /// timer. Disabling the worker leaves the sweep resolvable, so tests and the dev loop can still
    /// drive it directly.
    /// </summary>
    private static IServiceCollection AddSteepleReminders(this IServiceCollection services, IConfiguration configuration)
    {
        services.Configure<ReminderOptions>(configuration.GetSection(ReminderOptions.SectionName));

        services.AddScoped<IBookingReminderService, BookingReminderService>();
        services.AddScoped<IBookingReminderRepository, EfBookingReminderRepository>();

        var reminders = configuration.GetSection(ReminderOptions.SectionName).Get<ReminderOptions>() ?? new ReminderOptions();
        if (reminders.Enabled)
        {
            services.AddHostedService<BookingReminderWorker>();
        }

        return services;
    }

    /// <summary>
    /// Owner-approved data retention: one scoped bounded sweep and one optional daily worker.
    /// Disabling scheduling leaves the sweep resolvable for manual and integration-test passes.
    /// </summary>
    private static IServiceCollection AddSteepleRetention(this IServiceCollection services, IConfiguration configuration)
    {
        services.Configure<DataRetentionOptions>(configuration.GetSection(DataRetentionOptions.SectionName));
        services.AddScoped<IDataRetentionService, DataRetentionService>();

        var retention = configuration.GetSection(DataRetentionOptions.SectionName)
            .Get<DataRetentionOptions>() ?? new DataRetentionOptions();
        if (retention.Enabled)
        {
            services.AddHostedService<DataRetentionWorker>();
        }

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
    private static IServiceCollection AddSteepleApplications(
        this IServiceCollection services,
        IConfiguration configuration,
        IHostEnvironment environment)
    {
        services.Configure<EmailOptions>(configuration.GetSection(EmailOptions.SectionName));
        services.Configure<NotificationOutboxOptions>(
            configuration.GetSection(NotificationOutboxOptions.SectionName));

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

        // Stateless over HttpClient + options. The outbox worker resolves this inside the fresh
        // scope it owns for each bounded batch.
        services.AddHttpClient<ResendEmailGateway>();

        var email = configuration.GetSection(EmailOptions.SectionName).Get<EmailOptions>() ?? new EmailOptions();
        if (environment.IsDevelopment() && email.DevMailboxEnabled)
        {
            // Development only (the flag lives in appsettings.Development.json): the real gateway
            // still runs, with every send also captured for /dev/mailbox to render.
            services.AddSingleton<IDevMailbox, FileDevMailbox>();
            services.AddTransient<IEmailGateway>(sp => new DevMailboxEmailGateway(
                sp.GetRequiredService<ResendEmailGateway>(),
                sp.GetRequiredService<IDevMailbox>(),
                sp.GetRequiredService<TimeProvider>()));
        }
        else
        {
            services.AddTransient<IEmailGateway>(sp => sp.GetRequiredService<ResendEmailGateway>());
        }

        services.AddSteeplePush(configuration);

        var outbox = configuration.GetSection(NotificationOutboxOptions.SectionName)
            .Get<NotificationOutboxOptions>() ?? new NotificationOutboxOptions();
        if (outbox.Enabled)
        {
            services.AddHostedService<NotificationOutboxWorker>();
        }

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
        if (push.IsEnabled)
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
            // FirebaseApp is process-wide; the gateway opens its own scope for dead-token cleanup.
            services.AddSingleton<IPushGateway, FcmPushGateway>();
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
    private static IServiceCollection AddSteepleIdentity(
        this IServiceCollection services,
        IConfiguration configuration,
        IHostEnvironment environment)
    {
        services.Configure<AuthOptions>(configuration.GetSection(AuthOptions.SectionName));
        services.Configure<TurnstileOptions>(configuration.GetSection(TurnstileOptions.SectionName));

        // Validate eagerly during composition so a missing/known Production key prevents the
        // process from starting, rather than waiting for the first authenticated request.
        var auth = configuration.GetSection(AuthOptions.SectionName).Get<AuthOptions>() ?? new AuthOptions();
        _ = JwtAccessTokenIssuer.CreateSigningKey(auth.Jwt, environment.IsProduction());

        services.AddSingleton(TimeProvider.System);

        services.AddScoped<IIdentityService, IdentityService>();
        services.AddScoped<IIdentityRepository, EfIdentityRepository>();

        // Singleton on purpose: the grace window's whole job is to outlive the request scope that
        // wrote it, so a sibling browser tab's refresh a few milliseconds later finds it.
        services.AddSingleton<IRefreshRotationGrace, MemoryRefreshRotationGrace>();

        // Verifiers hold a JWKS cache (ConfigurationManager) -> singletons, one HttpClient each.
        services.AddHttpClient<GoogleIdTokenVerifier>();
        services.AddHttpClient<AppleIdTokenVerifier>();
        services.AddSingleton<IIdTokenVerifier>(sp => sp.GetRequiredService<GoogleIdTokenVerifier>());
        services.AddSingleton<IIdTokenVerifier>(sp => sp.GetRequiredService<AppleIdTokenVerifier>());

        // Dev sign-in (local loop + automated playtests): the flag lives only in
        // appsettings.Development.json, so deployed environments never register the verifier
        // and provider "dev" fails closed.
        if (configuration.GetValue<bool>("Auth:DevLoginEnabled"))
        {
            services.AddSingleton<IIdTokenVerifier, DevIdTokenVerifier>();
        }

        services.AddSingleton<IAccessTokenIssuer, JwtAccessTokenIssuer>();
        services.AddHttpClient<ITurnstileVerifier, CloudflareTurnstileVerifier>();

        // Validate our own access tokens. MapInboundClaims=false keeps the raw `sub`/`sid`
        // claim names (see ClaimsPrincipalExtensions).
        services
            .AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
            .AddJwtBearer(_ => { }); // configured below, where AuthOptions can be resolved

        services
            .AddOptions<JwtBearerOptions>(JwtBearerDefaults.AuthenticationScheme)
            .Configure<IOptions<AuthOptions>, IHostEnvironment>((bearer, auth, environment) =>
            {
                var jwt = auth.Value.Jwt;
                bearer.MapInboundClaims = false;
                bearer.TokenValidationParameters = new Microsoft.IdentityModel.Tokens.TokenValidationParameters
                {
                    ValidIssuer = jwt.Issuer,
                    ValidAudience = jwt.Audience,
                    IssuerSigningKey = JwtAccessTokenIssuer.CreateSigningKey(jwt, environment.IsProduction()),
                    ValidateIssuerSigningKey = true,
                    ValidateLifetime = true,
                };
            });

        services.AddAuthorization();

        return services;
    }
}
