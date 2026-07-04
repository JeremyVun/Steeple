var builder = WebApplication.CreateBuilder(args);

// Production containers log one JSON object per line to stdout (UTC timestamps, scopes
// included) so Promtail can ship them to Loki unparsed, see docs/ANALYTICS.md. Development
// keeps the default human-readable console.
if (builder.Environment.IsProduction())
{
    builder.Logging.AddJsonConsole(options =>
    {
        options.UseUtcTimestamp = true;
        options.IncludeScopes = true;
    });
}

builder.Services.AddControllers();
builder.Services.AddSteepleApi(builder.Configuration);
// RFC 9457 ProblemDetails for error responses, including bare status-code results (e.g. NotFound()).
builder.Services.AddProblemDetails();

// Behind caddy in the deployed environment: honour X-Forwarded-For so the per-IP rate limiter
// and Turnstile see the real client address, not the proxy's.
builder.Services.Configure<Microsoft.AspNetCore.Builder.ForwardedHeadersOptions>(options =>
{
    options.ForwardedHeaders = Microsoft.AspNetCore.HttpOverrides.ForwardedHeaders.XForwardedFor;
    options.KnownIPNetworks.Clear();
    options.KnownProxies.Clear();
});

var app = builder.Build();

// Dev-loop media serving: without Spaces config the media store writes to local disk and the
// API serves the files itself at /media. Production uses the Spaces CDN and never hits this.
var mediaOptions = app.Configuration.GetSection(Steeple.Api.Configuration.MediaOptions.SectionName)
    .Get<Steeple.Api.Configuration.MediaOptions>() ?? new Steeple.Api.Configuration.MediaOptions();
if (!mediaOptions.UseObjectStorage)
{
    var mediaRoot = Path.Combine(app.Environment.ContentRootPath, mediaOptions.LocalRoot);
    Directory.CreateDirectory(mediaRoot);
    app.UseStaticFiles(new StaticFileOptions
    {
        RequestPath = "/media",
        FileProvider = new Microsoft.Extensions.FileProviders.PhysicalFileProvider(mediaRoot),
    });
}

// Schema + seed are owned by the one-shot Liquibase "migrate" service — the API never migrates.

app.UseForwardedHeaders();

// Turns empty status-code responses (e.g. a controller's NotFound()) into ProblemDetails JSON.
app.UseStatusCodePages();

app.UseRateLimiter();
app.UseAuthentication();
app.UseAuthorization();

// Liveness/readiness probe for the container healthcheck.
app.MapGet("/health", () => Results.Ok(new { status = "ok" }));

app.MapControllers();

app.Run();
