using Microsoft.Extensions.Logging.Abstractions;

namespace Steeple.Api.Tests.Services;
/// <summary>
/// Unit tests for <see cref="NotificationDispatcher"/>'s push wiring (Phase 4): the fan-out sends
/// one push per recipient's own inbox row, the payload's <c>deepLink</c> is read back out of the
/// serialized JSON, and the <c>notification_sent</c> channel label reflects push. Repository,
/// email/push gateways, device registry, and analytics sink are all hand-rolled in-memory fakes,
/// matching the no-mocking-library idiom used elsewhere in this test project (see
/// <c>ApplicationServiceTests</c>).
/// </summary>
public class NotificationDispatcherTests
{
    private static readonly DateTimeOffset FixedNow = new(2026, 7, 4, 12, 0, 0, TimeSpan.Zero);

    [Fact]
    public async Task NotifyAsync_RecipientWithDevices_PushesTheRecipientsOwnInboxRowId()
    {
        var (dispatcher, repo, _, devices, push, _) = CreateDispatcher();
        var userId = Guid.NewGuid();
        devices.Tokens[userId] = ["token-1", "token-2"];

        await dispatcher.NotifyAsync(
            [new NotificationRecipient(userId, "person@example.com")],
            NotificationType.ApplicationReceived,
            new { applicationId = Guid.NewGuid(), deepLink = "/inbox/applications/123" },
            email: null);

        var row = Assert.Single(repo.Added);
        var call = Assert.Single(push.Calls);
        Assert.Equal(new[] { "token-1", "token-2" }, call.Tokens);
        Assert.Equal(row.Id.ToString(), call.Message.NotificationId);
        Assert.Equal("applicationReceived", call.Message.Type);
        Assert.Equal("/inbox/applications/123", call.Message.DeepLink);
    }

    [Fact]
    public async Task NotifyAsync_RecipientWithNoDevices_NeverCallsThePushGateway()
    {
        var (dispatcher, _, _, _, push, _) = CreateDispatcher();

        await dispatcher.NotifyAsync(
            [new NotificationRecipient(Guid.NewGuid(), null)],
            NotificationType.ApplicationReceived,
            new { deepLink = "/inbox" },
            email: null);

        Assert.Empty(push.Calls);
    }

    [Fact]
    public async Task NotifyAsync_PayloadWithoutDeepLink_PushesAnEmptyDeepLink()
    {
        var (dispatcher, _, _, devices, push, _) = CreateDispatcher();
        var userId = Guid.NewGuid();
        devices.Tokens[userId] = ["token-1"];

        await dispatcher.NotifyAsync(
            [new NotificationRecipient(userId, null)],
            NotificationType.BookingCancelled,
            new { bookingId = Guid.NewGuid() },
            email: null);

        Assert.Equal("", Assert.Single(push.Calls).Message.DeepLink);
    }

    [Fact]
    public async Task NotifyAsync_WithEmailContent_ChannelIsInboxEmailPush()
    {
        var (dispatcher, _, _, _, _, analytics) = CreateDispatcher();

        await dispatcher.NotifyAsync(
            [new NotificationRecipient(Guid.NewGuid(), "person@example.com")],
            NotificationType.ApplicationReceived,
            new { deepLink = "/inbox" },
            new EmailContent("Subject", "Body"));

        var tracked = Assert.Single(analytics.Events);
        Assert.Equal("inbox+email+push", GetProp(tracked.Payload, "channel"));
    }

    [Fact]
    public async Task NotifyAsync_WithoutEmailContent_ChannelIsInboxPush()
    {
        var (dispatcher, _, _, _, _, analytics) = CreateDispatcher();

        await dispatcher.NotifyAsync(
            [new NotificationRecipient(Guid.NewGuid(), null)],
            NotificationType.ApplicationReceived,
            new { deepLink = "/inbox" },
            email: null);

        var tracked = Assert.Single(analytics.Events);
        Assert.Equal("inbox+push", GetProp(tracked.Payload, "channel"));
    }

    private static (
        NotificationDispatcher Dispatcher,
        FakeNotificationRepository Repository,
        FakeEmailGateway Email,
        FakeDeviceRegistry Devices,
        FakePushGateway Push,
        FakeAnalyticsSink Analytics) CreateDispatcher()
    {
        var repo = new FakeNotificationRepository();
        var email = new FakeEmailGateway();
        var devices = new FakeDeviceRegistry();
        var push = new FakePushGateway();
        var analytics = new FakeAnalyticsSink();
        var dispatcher = new NotificationDispatcher(
            repo, email, devices, push, analytics, new FixedTimeProvider(FixedNow), NullLogger<NotificationDispatcher>.Instance);
        return (dispatcher, repo, email, devices, push, analytics);
    }

    private static object? GetProp(object? payload, string name) =>
        payload?.GetType().GetProperty(name)?.GetValue(payload);

    private sealed class FixedTimeProvider : TimeProvider
    {
        private readonly DateTimeOffset _now;

        public FixedTimeProvider(DateTimeOffset now) => _now = now;

        public override DateTimeOffset GetUtcNow() => _now;
    }

    private sealed class FakeNotificationRepository : INotificationRepository
    {
        public List<Notification> Added { get; } = [];

        public Task AddRangeAsync(IReadOnlyList<Notification> notifications, CancellationToken ct = default)
        {
            Added.AddRange(notifications);
            return Task.CompletedTask;
        }

        public Task<IReadOnlyList<Notification>> GetPageAsync(
            Guid userId, DateTimeOffset? beforeCreatedAtUtc, Guid? beforeId, int limit, CancellationToken ct = default) =>
            Task.FromResult<IReadOnlyList<Notification>>([]);

        public Task MarkReadAsync(Guid userId, IReadOnlyList<Guid> ids, CancellationToken ct = default) =>
            Task.CompletedTask;
    }

    private sealed class FakeEmailGateway : IEmailGateway
    {
        public List<(string ToEmail, string Subject, string TextBody)> Sent { get; } = [];

        public Task SendAsync(string toEmail, string subject, string textBody, CancellationToken ct = default)
        {
            Sent.Add((toEmail, subject, textBody));
            return Task.CompletedTask;
        }
    }

    private sealed class FakeDeviceRegistry : IDeviceRegistry
    {
        public Dictionary<Guid, IReadOnlyList<string>> Tokens { get; } = [];

        public Task<bool> RegisterAsync(Guid userId, string fcmToken, string platform, CancellationToken ct = default) =>
            Task.FromResult(true);

        public Task UnregisterAsync(Guid userId, string fcmToken, CancellationToken ct = default) =>
            Task.CompletedTask;

        public Task<IReadOnlyList<string>> GetTokensAsync(Guid userId, CancellationToken ct = default) =>
            Task.FromResult(Tokens.TryGetValue(userId, out var tokens) ? tokens : []);

        public Task DeleteByTokenAsync(string fcmToken, CancellationToken ct = default) => Task.CompletedTask;
    }

    private sealed class FakePushGateway : IPushGateway
    {
        public List<(IReadOnlyList<string> Tokens, PushMessage Message)> Calls { get; } = [];

        public Task SendAsync(IReadOnlyList<string> fcmTokens, PushMessage message, CancellationToken ct = default)
        {
            Calls.Add((fcmTokens, message));
            return Task.CompletedTask;
        }
    }

    private sealed class FakeAnalyticsSink : IAnalyticsSink
    {
        public List<(string EventType, object? Payload)> Events { get; } = [];

        public Task TrackAsync(string eventType, object? payload = null, string? sessionId = null, CancellationToken ct = default)
        {
            Events.Add((eventType, payload));
            return Task.CompletedTask;
        }
    }
}
