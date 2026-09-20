using System.Diagnostics;
using System.Net;
using System.Net.Http.Headers;
using System.Security.Cryptography;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Tokens;
using Steeple.Api.Controllers.Notifications;
using Steeple.Integration.Tests.Fixtures;

namespace Steeple.Integration.Tests.Proxies;

[Collection(PostgresCollection.Name)]
public sealed class NotificationStreamHttpTests(PostgresDatabaseFixture database)
{
    [Fact]
    public async Task RealBearerMiddleware_RejectsAnonymousMissingExpiryAndExpiredWithinSkew()
    {
        await using var host = await SocketHost.Start(database.ConnectionString);
        foreach (var token in new[] { null, host.Token(includeExpiry: false), host.Token(expires: DateTimeOffset.UtcNow.AddSeconds(-1)) })
        {
            using var response = await host.Get("stream", token);
            Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        }
        Assert.Equal(0, host.Hub.SubscriptionCount);
    }

    [Fact]
    public async Task AdmissionErrors_AreProblemDetails_AndJwtExpiryEndsOpenResponse()
    {
        await using var host = await SocketHost.Start(database.ConnectionString);
        host.Hub.MarkUnavailable();
        using (var unavailable = await host.Get("stream", host.Token()))
        {
            Assert.Equal(HttpStatusCode.ServiceUnavailable, unavailable.StatusCode);
            Assert.Equal(TimeSpan.FromSeconds(5), unavailable.Headers.RetryAfter?.Delta);
            Assert.Contains("notification_stream_unavailable", await unavailable.Content.ReadAsStringAsync());
        }
        host.Hub.MarkReady();
        var started = Stopwatch.StartNew();
        using var response = await host.Get("stream", host.Token(expires: DateTimeOffset.UtcNow.AddSeconds(3)));
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("text/event-stream", response.Content.Headers.ContentType?.MediaType);
        Assert.Equal("utf-8", response.Content.Headers.ContentType?.CharSet);
        Assert.Contains("no-store", response.Headers.CacheControl!.ToString());
        Assert.Contains("no-transform", response.Headers.CacheControl.ToString());
        Assert.Equal("no", response.Headers.GetValues("X-Accel-Buffering").Single());
        using var deadline = new CancellationTokenSource(TimeSpan.FromSeconds(8));
        using var reader = new StreamReader(await response.Content.ReadAsStreamAsync(deadline.Token));
        Assert.Equal("event: invalidate\ndata: {}\n\n", await Frame(reader, deadline.Token));
        Assert.Null(await reader.ReadLineAsync(deadline.Token));
        Assert.InRange(started.Elapsed.TotalSeconds, 1, 6);
        await Until(() => host.Hub.SubscriptionCount == 0);
    }

    [Fact]
    public async Task RealSockets_EnforceFourPerUserAnd256PerProcess_ReleaseEveryPermit()
    {
        await using var host = await SocketHost.Start(database.ConnectionString);
        var responses = new List<HttpResponseMessage>();
        try
        {
            var firstToken = host.Token();
            for (var user = 0; user < 64; user++)
            {
                var token = user == 0 ? firstToken : host.Token();
                for (var tab = 0; tab < 4; tab++)
                {
                    var response = await host.Get("stream", token);
                    Assert.Equal(HttpStatusCode.OK, response.StatusCode);
                    responses.Add(response);
                }
                if (user == 0)
                {
                    using var denied = await host.Get("stream", token);
                    Assert.Equal(HttpStatusCode.TooManyRequests, denied.StatusCode);
                    Assert.Equal(TimeSpan.FromSeconds(60), denied.Headers.RetryAfter?.Delta);
                }
            }
            Assert.Equal(256, host.Hub.SubscriptionCount);
            using (var denied = await host.Get("stream", host.Token()))
            {
                Assert.Equal(HttpStatusCode.TooManyRequests, denied.StatusCode);
                Assert.Contains("rate_limited", await denied.Content.ReadAsStringAsync());
            }
            responses[0].Dispose();
            await Until(() => host.Hub.SubscriptionCount == 255);
            var recovered = await host.Get("stream", host.Token());
            Assert.Equal(HttpStatusCode.OK, recovered.StatusCode);
            responses.Add(recovered);
        }
        finally
        {
            foreach (var response in responses) response.Dispose();
        }
        await Until(() => host.Hub.SubscriptionCount == 0);
    }

    [Fact]
    public async Task ActualGlobalLimiter_AppliesToBothStreamsAndSnapshots_AndIsolatesUsers()
    {
        await using var host = await SocketHost.Start(database.ConnectionString);
        var token = host.Token();
        for (var index = 0; index < 300; index++)
        {
            using var response = await host.Get("", token);
            Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        }
        foreach (var route in new[] { "stream", "" })
        {
            using var response = await host.Get(route, token);
            Assert.Equal(HttpStatusCode.TooManyRequests, response.StatusCode);
            Assert.Equal(TimeSpan.FromSeconds(60), response.Headers.RetryAfter?.Delta);
            Assert.Contains("rate_limited", await response.Content.ReadAsStringAsync());
        }
        using var other = await host.Get("", host.Token());
        Assert.Equal(HttpStatusCode.OK, other.StatusCode);
        Assert.Equal(0, host.Hub.SubscriptionCount);
    }

    [Fact]
    [Trait("Duration", "FiveMinutes")]
    public async Task DefaultFiveMinuteLifetime_FlushesRealHeartbeats_ThenAllowsRenewal()
    {
        await using var host = await SocketHost.Start(database.ConnectionString);
        var token = host.Token();
        var started = Stopwatch.StartNew();
        using var response = await host.Get("stream", token);
        using var deadline = new CancellationTokenSource(TimeSpan.FromSeconds(320));
        using var reader = new StreamReader(await response.Content.ReadAsStreamAsync(deadline.Token));
        Assert.Equal("event: invalidate\ndata: {}\n\n", await Frame(reader, deadline.Token));
        var beats = 0;
        while (await Frame(reader, deadline.Token) is { } frame)
        {
            Assert.Equal(": heartbeat\n\n", frame);
            if (++beats == 1) Assert.InRange(started.Elapsed.TotalSeconds, 29, 40);
        }
        Assert.InRange(started.Elapsed.TotalSeconds, 299, 315);
        Assert.InRange(beats, 9, 10);
        await Until(() => host.Hub.SubscriptionCount == 0);
        using var renewed = await host.Get("stream", token);
        using var renewedReader = new StreamReader(await renewed.Content.ReadAsStreamAsync(deadline.Token));
        Assert.Equal("event: invalidate\ndata: {}\n\n", await Frame(renewedReader, deadline.Token));
    }

    internal static async Task<string?> Frame(StreamReader reader, CancellationToken cancellation)
    {
        var lines = new List<string>();
        while (await reader.ReadLineAsync(cancellation) is { } line)
        {
            lines.Add(line);
            if (line.Length == 0) return string.Join('\n', lines) + "\n";
        }
        return null;
    }

    private static async Task Until(Func<bool> condition)
    {
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(8));
        while (!condition()) await Task.Delay(10, timeout.Token);
    }

    internal sealed class SocketHost : IAsyncDisposable
    {
        private readonly WebApplication _app;
        private readonly byte[] _key;
        private readonly HttpClient _client;
        public InMemoryNotificationStream Hub { get; }
        private SocketHost(WebApplication app, byte[] key, bool listen)
        {
            _app = app;
            _key = key;
            Hub = app.Services.GetRequiredService<InMemoryNotificationStream>();
            if (!listen) Hub.MarkReady();
            _client = new HttpClient(new SocketsHttpHandler { MaxConnectionsPerServer = 300 })
            {
                BaseAddress = new Uri(app.Urls.Single()), Timeout = TimeSpan.FromSeconds(10),
            };
        }
        public static async Task<SocketHost> Start(string connectionString, bool listen = false)
        {
            var key = RandomNumberGenerator.GetBytes(32);
            var builder = WebApplication.CreateBuilder(new WebApplicationOptions { EnvironmentName = "Development" });
            builder.Configuration.Sources.Clear();
            builder.Configuration.AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["ConnectionStrings:SteepleDb"] = connectionString,
                ["Auth:Jwt:SigningKey"] = Convert.ToBase64String(key),
                ["Auth:Jwt:Issuer"] = "sse-socket-tests",
                ["Auth:Jwt:Audience"] = "sse-socket-tests",
            });
            builder.Logging.ClearProviders();
            builder.WebHost.UseKestrel().UseUrls("http://127.0.0.1:0");
            builder.Services.AddControllers().AddApplicationPart(typeof(NotificationsController).Assembly);
            builder.Services.AddSteepleApi(builder.Configuration, builder.Environment);
            builder.Services.AddHealthChecks().AddCheck<DatabaseReadinessCheck>("database");
            // Listener propagation has its own DB tests; this host isolates the real HTTP pipeline.
            foreach (var hosted in builder.Services.Where(service => service.ServiceType == typeof(IHostedService)
                && (!listen || service.ImplementationType != typeof(PostgresNotificationListener))).ToArray())
                builder.Services.Remove(hosted);
            builder.Services.AddProblemDetails();
            var app = builder.Build();
            app.UseStatusCodePages();
            app.UseAuthentication();
            app.UseRateLimiter();
            app.UseAuthorization();
            app.MapControllers();
            app.MapGet("/health", () => Microsoft.AspNetCore.Http.Results.Ok());
            app.MapHealthChecks("/health/ready");
            await app.StartAsync();
            var host = new SocketHost(app, key, listen);
            if (listen) await Until(() => host.Hub.IsReady);
            return host;
        }
        public string Token(DateTimeOffset? expires = null, bool includeExpiry = true, Guid? userId = null)
        {
            var claims = new Dictionary<string, object>
            {
                ["sub"] = (userId ?? Guid.NewGuid()).ToString(),
                ["iss"] = "sse-socket-tests", ["aud"] = "sse-socket-tests",
            };
            if (includeExpiry) claims["exp"] = (expires ?? DateTimeOffset.UtcNow.AddMinutes(10)).ToUnixTimeSeconds();
            return new JsonWebTokenHandler { SetDefaultTimesOnTokenCreation = false }.CreateToken(new SecurityTokenDescriptor
            {
                Claims = claims,
                SigningCredentials = new SigningCredentials(new SymmetricSecurityKey(_key), SecurityAlgorithms.HmacSha256),
            });
        }
        public async Task<HttpResponseMessage> Get(string path, string? token)
        {
            using var request = new HttpRequestMessage(HttpMethod.Get, "/api/v1/me/notifications" + (path.Length == 0 ? "" : "/" + path));
            if (token is not null) request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
            return await _client.SendAsync(request, HttpCompletionOption.ResponseHeadersRead);
        }
        public async Task<HttpResponseMessage> Send(HttpMethod method, string path, string? token = null, object? body = null)
        {
            using var request = new HttpRequestMessage(method, path);
            if (token is not null) request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
            if (body is not null) request.Content = System.Net.Http.Json.JsonContent.Create(body);
            return await _client.SendAsync(request);
        }
        public async ValueTask DisposeAsync()
        {
            Hub.MarkUnavailable();
            _client.Dispose();
            await _app.StopAsync();
            await _app.DisposeAsync();
        }
    }
}
