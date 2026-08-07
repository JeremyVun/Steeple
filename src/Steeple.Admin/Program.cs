using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);

var mvc = builder.Services.AddControllersWithViews();
if (builder.Environment.IsDevelopment())
{
    mvc.AddRazorRuntimeCompilation();
}

builder.Services.AddHttpContextAccessor();

// Behind caddy/authelia (TLS terminated at the proxy): honour X-Forwarded-* so Secure cookies
// and Request.Scheme reflect the original request. XForwardedPrefix maps the proxy's path prefix
// (e.g. /steeple) into Request.PathBase so the dashboard can be hosted under a sub-path.
builder.Services.Configure<ForwardedHeadersOptions>(options =>
{
    options.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto
        | ForwardedHeaders.XForwardedPrefix;
    options.KnownIPNetworks.Clear();
    options.KnownProxies.Clear();
});

// Reads the shared Postgres (same tables as the web funnel). The Liquibase migrate service owns
// the schema — Admin never migrates. The workspace is a singleton that resolves the scoped
// DbContext per operation, so every screen stays live and coherent with the web app.
builder.Services.AddDbContext<SteepleDbContext>(options =>
    options.UseNpgsql(builder.Configuration.GetConnectionString("SteepleDb")));
builder.Services.AddSingleton<IAdminWorkspace, PostgresAdminWorkspace>();
builder.Services.AddHttpClient("media", client =>
{
    client.BaseAddress = new Uri(builder.Configuration["Admin:MediaProxyOrigin"] ?? "http://api:8080");
    client.Timeout = TimeSpan.FromSeconds(10);
});

var app = builder.Build();

app.UseForwardedHeaders();

if (!app.Environment.IsDevelopment())
{
    // Production: return a minimal error response instead of the developer exception page.
    app.UseExceptionHandler(errorApp => errorApp.Run(async context =>
    {
        context.Response.StatusCode = StatusCodes.Status500InternalServerError;
        await context.Response.WriteAsync("An unexpected error occurred.");
    }));
    app.UseHsts();
}

// Listing photos are served by the media origin (the API or a CDN), never by Admin — and a review
// queue whose photos are blocked is a decision made blind. Pin the origin per environment;
// the dev loop's API may sit on either of the two local ports.
var mediaImageOrigins = builder.Configuration["Admin:MediaImageOrigins"] ?? "https:";

app.Use(async (context, next) =>
{
    var headers = context.Response.Headers;
    headers["X-Content-Type-Options"] = "nosniff";
    headers["X-Frame-Options"] = "DENY";
    headers["Referrer-Policy"] = "no-referrer";
    headers["Content-Security-Policy"] =
        "default-src 'self'; " +
        $"img-src 'self' data: {mediaImageOrigins}; " +
        "style-src 'self' 'unsafe-inline'; " +
        "script-src 'self'; " +
        "connect-src 'self'; " +
        "frame-ancestors 'none'";
    await next();
});

app.UseStaticFiles();
app.UseRouting();

// Lightweight liveness probe (matches api/flags); independent of the DB-backed dashboard page.
app.MapGet("/health", () => Results.Ok(new { status = "ok" }));

// Local-disk photo rows carry a relative media/... path. Admin reads those rows directly from
// Postgres, so give its browser the same first-party path and fetch the bytes from the API.
// CDN-backed rows remain absolute and never hit this endpoint.
app.MapGet("/media/{**mediaPath}", async (
    string mediaPath,
    IHttpClientFactory clients,
    CancellationToken ct) =>
{
    if (string.IsNullOrWhiteSpace(mediaPath) || mediaPath.Contains("..", StringComparison.Ordinal))
    {
        return Results.BadRequest();
    }

    using var response = await clients.CreateClient("media")
        .GetAsync($"media/{mediaPath}", HttpCompletionOption.ResponseHeadersRead, ct);
    if (!response.IsSuccessStatusCode)
    {
        return Results.StatusCode((int)response.StatusCode);
    }

    var bytes = await response.Content.ReadAsByteArrayAsync(ct);
    var contentType = response.Content.Headers.ContentType?.MediaType ?? "application/octet-stream";
    return Results.File(bytes, contentType);
});

app.MapControllerRoute(
    name: "default",
    pattern: "{controller=Admin}/{action=Index}/{id?}");

app.Run();
