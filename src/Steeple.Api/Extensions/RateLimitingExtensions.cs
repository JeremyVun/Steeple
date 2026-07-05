using System.Threading.RateLimiting;
using Microsoft.AspNetCore.RateLimiting;

namespace Steeple.Api.Extensions;

/// <summary>Names of the API's rate-limiting policies (referenced by controllers).</summary>
public static class RateLimitPolicies
{
    /// <summary>Per-IP limiter for the public writable auth endpoints (SYSTEM_DESIGN §6).</summary>
    public const string Auth = "auth";

    /// <summary>
    /// Limiter for application submits + thread messages: per-account when authenticated
    /// (the endpoints require auth, so this is the per-account limit CONTRACTS §5 asks for),
    /// falling back to per-IP.
    /// </summary>
    public const string Apply = "apply";

    /// <summary>Per-IP limiter for the anonymous-friendly analytics ingest endpoint (CONTRACTS §7).</summary>
    public const string Events = "events";

    /// <summary>Per-account limiter for provider CRUD writes (Manage module, CONTRACTS §6).</summary>
    public const string Manage = "manage";

    /// <summary>Per-account limiter for photo uploads — the expensive image pipeline (SYSTEM_DESIGN §9).</summary>
    public const string Media = "media";

    /// <summary>Per-IP limiter for the anonymous guest availability reads (CONTRACTS §6).</summary>
    public const string Availability = "availability";
}

/// <summary>
/// ASP.NET rate limiting for public writable endpoints: fixed windows returning 429 + Retry-After
/// with the ProblemDetails <c>rate_limited</c> code (CONTRACTS §2).
/// </summary>
public static class RateLimitingExtensions
{
    private const int AuthPermitLimit = 10;
    private const int ApplyPermitLimit = 5;
    private const int EventsPermitLimit = 60;
    private const int ManagePermitLimit = 30;
    private const int MediaPermitLimit = 12;
    private const int AvailabilityPermitLimit = 30;

    // Both policies share a 1-minute window, which keeps the single OnRejected Retry-After honest.
    private static readonly TimeSpan Window = TimeSpan.FromMinutes(1);

    /// <summary>Registers the limiter policies and the coded-ProblemDetails rejection response.</summary>
    public static IServiceCollection AddSteepleRateLimiting(this IServiceCollection services)
    {
        services.AddRateLimiter(options =>
        {
            options.AddPolicy(RateLimitPolicies.Auth, context =>
                RateLimitPartition.GetFixedWindowLimiter(
                    // The forwarded-headers middleware has already rewritten RemoteIpAddress to
                    // the original client behind the edge proxy.
                    partitionKey: ClientIp(context),
                    _ => new FixedWindowRateLimiterOptions
                    {
                        PermitLimit = AuthPermitLimit,
                        Window = Window,
                        QueueLimit = 0,
                    }));

            options.AddPolicy(RateLimitPolicies.Apply, context =>
                RateLimitPartition.GetFixedWindowLimiter(
                    // Authenticated caller → per-account bucket (a shared church wifi shouldn't
                    // starve everyone); no principal → per-IP.
                    partitionKey: context.User.FindFirst("sub")?.Value ?? ClientIp(context),
                    _ => new FixedWindowRateLimiterOptions
                    {
                        PermitLimit = ApplyPermitLimit,
                        Window = Window,
                        QueueLimit = 0,
                    }));

            options.AddPolicy(RateLimitPolicies.Events, context =>
                RateLimitPartition.GetFixedWindowLimiter(
                    // Anonymous-friendly — always per-IP, never per-account.
                    partitionKey: ClientIp(context),
                    _ => new FixedWindowRateLimiterOptions
                    {
                        PermitLimit = EventsPermitLimit,
                        Window = Window,
                        QueueLimit = 0,
                    }));

            options.AddPolicy(RateLimitPolicies.Manage, context =>
                RateLimitPartition.GetFixedWindowLimiter(
                    // Manage endpoints require auth — per-account, IP only as a safety net.
                    partitionKey: context.User.FindFirst("sub")?.Value ?? ClientIp(context),
                    _ => new FixedWindowRateLimiterOptions
                    {
                        PermitLimit = ManagePermitLimit,
                        Window = Window,
                        QueueLimit = 0,
                    }));

            options.AddPolicy(RateLimitPolicies.Media, context =>
                RateLimitPartition.GetFixedWindowLimiter(
                    partitionKey: context.User.FindFirst("sub")?.Value ?? ClientIp(context),
                    _ => new FixedWindowRateLimiterOptions
                    {
                        PermitLimit = MediaPermitLimit,
                        Window = Window,
                        QueueLimit = 0,
                    }));

            options.AddPolicy(RateLimitPolicies.Availability, context =>
                RateLimitPartition.GetFixedWindowLimiter(
                    // Anonymous public reads — always per-IP.
                    partitionKey: ClientIp(context),
                    _ => new FixedWindowRateLimiterOptions
                    {
                        PermitLimit = AvailabilityPermitLimit,
                        Window = Window,
                        QueueLimit = 0,
                    }));

            options.OnRejected = async (context, ct) =>
            {
                context.HttpContext.Response.StatusCode = StatusCodes.Status429TooManyRequests;
                context.HttpContext.Response.Headers.RetryAfter =
                    ((int)Window.TotalSeconds).ToString();

                await context.HttpContext.Response.WriteAsJsonAsync(
                    new
                    {
                        type = "https://tools.ietf.org/html/rfc6585#section-4",
                        title = "Too many requests.",
                        status = StatusCodes.Status429TooManyRequests,
                        code = "rate_limited",
                    },
                    ct);
            };
        });

        return services;
    }

    private static string ClientIp(HttpContext context) =>
        context.Connection.RemoteIpAddress?.ToString() ?? "unknown";
}
