using System.Text.Json;
using Microsoft.Extensions.Logging.Abstractions;
using Steeple.Api.Contracts.Analytics;
using Steeple.Api.Services.Analytics;

namespace Steeple.Api.Tests.Services;
/// <summary>
/// Unit tests for <see cref="EventIngestService"/> (CONTRACTS §7): the silent drop rules (unknown
/// names, oversized batches/names/props) and the enrichment merged into accepted events. The
/// analytics sink is a hand-rolled in-memory fake, matching the no-mocking-library idiom used
/// elsewhere in this test project (see <c>ApplicationServiceTests</c>).
/// </summary>
public class EventIngestServiceTests
{
    private static readonly DateTimeOffset FixedNow = new(2026, 7, 4, 12, 0, 0, TimeSpan.Zero);

    [Fact]
    public async Task IngestAsync_AllowlistedEvent_IsTracked()
    {
        var (service, sink) = CreateService();

        await service.IngestAsync(Request(Event("map_interacted")), userId: null, userAgent: null);

        Assert.Single(sink.Events);
        Assert.Equal("map_interacted", sink.Events[0].EventType);
    }

    [Theory]
    [InlineData("search_performed")] // server-authoritative — must never be client-acceptable
    [InlineData("application_submitted")]
    [InlineData("not_a_real_event")]
    [InlineData("")]
    [InlineData(null)]
    public async Task IngestAsync_UnknownOrMissingName_IsDropped(string? name)
    {
        var (service, sink) = CreateService();

        await service.IngestAsync(Request(Event(name)), userId: null, userAgent: null);

        Assert.Empty(sink.Events);
    }

    [Fact]
    public async Task IngestAsync_NameOver64Chars_IsDropped()
    {
        var (service, sink) = CreateService();
        var longName = "map_interacted" + new string('x', 60); // > 64 chars total, and not on the allowlist anyway

        await service.IngestAsync(Request(Event(longName)), userId: null, userAgent: null);

        Assert.Empty(sink.Events);
    }

    [Fact]
    public async Task IngestAsync_PropsOverTwoKilobytes_IsDropped()
    {
        var (service, sink) = CreateService();
        var hugeProps = JsonSerializer.SerializeToElement(new { blob = new string('x', 3000) });

        await service.IngestAsync(Request(Event("map_interacted", hugeProps)), userId: null, userAgent: null);

        Assert.Empty(sink.Events);
    }

    [Fact]
    public async Task IngestAsync_BatchOverFiftyEvents_DropsTheWholeBatch()
    {
        var (service, sink) = CreateService();
        var events = Enumerable.Range(0, 51).Select(_ => Event("map_interacted")).ToList();

        await service.IngestAsync(new IngestEventsRequest("session-1", events), userId: null, userAgent: null);

        Assert.Empty(sink.Events);
    }

    [Fact]
    public async Task IngestAsync_BatchOfExactlyFiftyEvents_IsAccepted()
    {
        var (service, sink) = CreateService();
        var events = Enumerable.Range(0, 50).Select(_ => Event("map_interacted")).ToList();

        await service.IngestAsync(new IngestEventsRequest("session-1", events), userId: null, userAgent: null);

        Assert.Equal(50, sink.Events.Count);
    }

    [Fact]
    public async Task IngestAsync_NullOrEmptyBatch_TracksNothing()
    {
        var (service, sink) = CreateService();

        await service.IngestAsync(new IngestEventsRequest("session-1", null), userId: null, userAgent: null);
        await service.IngestAsync(new IngestEventsRequest("session-1", []), userId: null, userAgent: null);
        await service.IngestAsync(null, userId: null, userAgent: null);

        Assert.Empty(sink.Events);
    }

    [Fact]
    public async Task IngestAsync_AuthenticatedCaller_EnrichesWithUserId()
    {
        var (service, sink) = CreateService();
        var userId = Guid.NewGuid();

        await service.IngestAsync(Request(Event("sso_started")), userId, userAgent: null);

        var payload = AsDictionary(sink.Events[0].Payload);
        Assert.Equal(userId, payload["userId"]);
    }

    [Fact]
    public async Task IngestAsync_AnonymousCaller_EnrichesWithNullUserId()
    {
        var (service, sink) = CreateService();

        await service.IngestAsync(Request(Event("sso_started")), userId: null, userAgent: null);

        var payload = AsDictionary(sink.Events[0].Payload);
        Assert.Null(payload["userId"]);
    }

    [Theory]
    [InlineData("Mozilla/5.0 (iPhone; CPU iPhone OS) AppleWebKit", "mobile")]
    [InlineData("Mozilla/5.0 (Linux; Android 14)", "mobile")]
    [InlineData("Mozilla/5.0 (Windows NT 10.0; Win64; x64)", "desktop")]
    [InlineData("Googlebot/2.1 (+http://www.google.com/bot.html)", "bot")]
    [InlineData(null, "desktop")]
    public async Task IngestAsync_ClassifiesUserAgentCheaply(string? userAgent, string expectedClass)
    {
        var (service, sink) = CreateService();

        await service.IngestAsync(Request(Event("map_interacted")), userId: null, userAgent);

        var payload = AsDictionary(sink.Events[0].Payload);
        Assert.Equal(expectedClass, payload["uaClass"]);
    }

    [Fact]
    public async Task IngestAsync_MergesClientPropsWithEnrichment()
    {
        var (service, sink) = CreateService();
        var clientProps = JsonSerializer.SerializeToElement(new { kind = "pan" });

        await service.IngestAsync(Request(Event("map_interacted", clientProps)), userId: null, userAgent: null);

        var payload = AsDictionary(sink.Events[0].Payload);
        Assert.True(payload.ContainsKey("kind"));
        Assert.True(payload.ContainsKey("uaClass"));
        Assert.True(payload.ContainsKey("sessionId"));
        Assert.True(payload.ContainsKey("occurredAt"));
        Assert.True(payload.ContainsKey("receivedAt"));
    }

    private static (EventIngestService Service, FakeAnalyticsSink Sink) CreateService()
    {
        var sink = new FakeAnalyticsSink();
        return (new EventIngestService(sink, new FixedTimeProvider(FixedNow), NullLogger<EventIngestService>.Instance), sink);
    }

    private static IngestEventsRequest Request(IngestEventItem item) => new("session-1", [item]);

    private static IngestEventItem Event(string? name, JsonElement? props = null) =>
        new(name, FixedNow, props);

    private static Dictionary<string, object?> AsDictionary(object? payload)
    {
        Assert.NotNull(payload);
        return Assert.IsType<Dictionary<string, object?>>(payload);
    }

    private sealed class FixedTimeProvider : TimeProvider
    {
        private readonly DateTimeOffset _now;

        public FixedTimeProvider(DateTimeOffset now) => _now = now;

        public override DateTimeOffset GetUtcNow() => _now;
    }

    private sealed class FakeAnalyticsSink : IAnalyticsSink
    {
        public List<(string EventType, object? Payload, string? SessionId)> Events { get; } = [];

        public Task TrackAsync(string eventType, object? payload = null, string? sessionId = null, CancellationToken ct = default)
        {
            Events.Add((eventType, payload, sessionId));
            return Task.CompletedTask;
        }
    }
}
