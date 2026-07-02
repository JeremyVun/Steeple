using Steeple.Api.Extensions;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddControllers();
builder.Services.AddSteepleApi(builder.Configuration);

var app = builder.Build();

// Schema + seed are owned by the one-shot Liquibase "migrate" service — the API never migrates.

// Liveness/readiness probe for the container healthcheck.
app.MapGet("/health", () => Results.Ok(new { status = "ok" }));

app.MapControllers();

app.Run();
