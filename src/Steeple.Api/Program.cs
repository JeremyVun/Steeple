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

var app = builder.Build();

// Schema + seed are owned by the one-shot Liquibase "migrate" service — the API never migrates.

// Turns empty status-code responses (e.g. a controller's NotFound()) into ProblemDetails JSON.
app.UseStatusCodePages();

// Liveness/readiness probe for the container healthcheck.
app.MapGet("/health", () => Results.Ok(new { status = "ok" }));

app.MapControllers();

app.Run();
