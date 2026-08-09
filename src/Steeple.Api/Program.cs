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

builder.Services.AddControllers(options =>
    options.Conventions.Add(new Steeple.Api.Extensions.DevelopmentOnlyActionConvention(
        builder.Environment.IsDevelopment())));
builder.Services.AddSteepleApi(builder.Configuration, builder.Environment);
// RFC 9457 ProblemDetails for error responses, including bare status-code results (e.g. NotFound()).
builder.Services.AddProblemDetails();

// Trust only the loopback development proxies and Docker's private address space. nginx replaces
// X-Forwarded-For with one canonical client address before the request reaches this process.
builder.Services.Configure<Microsoft.AspNetCore.Builder.ForwardedHeadersOptions>(options =>
{
    options.ForwardedHeaders =
        Microsoft.AspNetCore.HttpOverrides.ForwardedHeaders.XForwardedFor
        | Microsoft.AspNetCore.HttpOverrides.ForwardedHeaders.XForwardedProto;
    options.ForwardLimit = 1;
    options.KnownIPNetworks.Add(System.Net.IPNetwork.Parse("172.16.0.0/12"));
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

// Canonicals, og:url, document <base> and sitemap locs all come from Seo:PublicBaseUrl. Unset, the
// API falls back to whatever origin each request arrives on — fine locally, wrong for a crawler.
app.Services.GetRequiredService<IPublicBaseResolver>().WarnIfUnconfigured();

app.UseForwardedHeaders();

// Turns empty status-code responses (e.g. a controller's NotFound()) into ProblemDetails JSON.
app.UseStatusCodePages();

app.UseAuthentication();
// After authentication, on purpose: the per-account policies partition on the `sub`
// claim, and before this line `context.User` is still anonymous — every one of them
// silently fell back to per-IP, so everyone behind one NAT shared a single bucket,
// which is precisely what those policies were written to avoid.
app.UseRateLimiter();
app.UseAuthorization();

// Liveness/readiness probe for the container healthcheck.
app.MapGet("/health", () => Results.Ok(new { status = "ok" }));

// Dev mailbox: local sends are otherwise only a log line, and a log line's CTA can't be clicked.
// The routes exist only where Email:DevMailboxEnabled is set (appsettings.Development.json).
if (app.Environment.IsDevelopment()
    && app.Configuration.GetValue<bool>($"{Steeple.Api.Configuration.EmailOptions.SectionName}:DevMailboxEnabled"))
{
    app.MapDevMailbox();
}

app.MapControllers();

app.Run();
