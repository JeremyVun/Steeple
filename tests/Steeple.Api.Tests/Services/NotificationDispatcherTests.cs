using System.Text.Json;
using Microsoft.Extensions.Options;

namespace Steeple.Api.Tests.Services;

/// <summary>
/// Unit tests for notification composition: inbox and channel envelopes are handed to one
/// repository call, push points at each recipient's own inbox row, and email CTAs are composed
/// before persistence. Provider delivery belongs to NotificationOutboxWorker integration tests.
/// </summary>
public class NotificationDispatcherTests
{
    private static readonly DateTimeOffset FixedNow = new(2026, 7, 4, 12, 0, 0, TimeSpan.Zero);
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    [Fact]
    public async Task NotifyAsync_PushEnvelopePointsAtTheRecipientsOwnInboxRowId()
    {
        var (dispatcher, repository, _) = CreateDispatcher();
        var userId = Guid.NewGuid();

        await dispatcher.NotifyAsync(
            [new NotificationRecipient(userId, "person@example.com")],
            NotificationType.ApplicationReceived,
            new { applicationId = Guid.NewGuid(), deepLink = "/inbox/applications/123" },
            email: null);

        var inbox = Assert.Single(repository.Added);
        var delivery = Assert.Single(repository.Deliveries);
        Assert.Equal(NotificationOutboxChannel.Push, delivery.Channel);
        Assert.Equal(NotificationType.ApplicationReceived, delivery.Kind);

        var payload = Deserialize<PushOutboxPayload>(delivery);
        Assert.Equal(userId, payload.UserId);
        Assert.Equal(inbox.Id.ToString(), payload.NotificationId);
        Assert.Equal("applicationReceived", payload.Type);
        Assert.Equal("/inbox/applications/123", payload.DeepLink);
    }

    [Fact]
    public async Task NotifyAsync_AlwaysEnqueuesPushSoWorkerCanResolveCurrentDevices()
    {
        var (dispatcher, repository, _) = CreateDispatcher();

        await dispatcher.NotifyAsync(
            [new NotificationRecipient(Guid.NewGuid(), null)],
            NotificationType.ApplicationReceived,
            new { deepLink = "/inbox" },
            email: null);

        Assert.Equal(NotificationOutboxChannel.Push, Assert.Single(repository.Deliveries).Channel);
    }

    [Fact]
    public async Task NotifyAsync_PayloadWithoutDeepLink_PersistsAnEmptyPushDeepLink()
    {
        var (dispatcher, repository, _) = CreateDispatcher();

        await dispatcher.NotifyAsync(
            [new NotificationRecipient(Guid.NewGuid(), null)],
            NotificationType.BookingCancelled,
            new { bookingId = Guid.NewGuid() },
            email: null);

        Assert.Equal("", Deserialize<PushOutboxPayload>(Assert.Single(repository.Deliveries)).DeepLink);
    }

    [Fact]
    public async Task NotifyAsync_WithEmailContent_EnqueuesEmailAndPushAndTracksTheirChannels()
    {
        var (dispatcher, repository, analytics) = CreateDispatcher();

        await dispatcher.NotifyAsync(
            [new NotificationRecipient(Guid.NewGuid(), "person@example.com")],
            NotificationType.ApplicationReceived,
            new { deepLink = "/inbox" },
            new EmailContent("Subject", "Body"));

        Assert.Equal(
            [NotificationOutboxChannel.Email, NotificationOutboxChannel.Push],
            repository.Deliveries.Select(row => row.Channel).ToArray());
        Assert.Equal("inbox+email+push", GetProp(Assert.Single(analytics.Events).Payload, "channel"));
    }

    [Fact]
    public async Task NotifyAsync_WithoutEmailContent_ChannelIsInboxPush()
    {
        var (dispatcher, _, analytics) = CreateDispatcher();

        await dispatcher.NotifyAsync(
            [new NotificationRecipient(Guid.NewGuid(), null)],
            NotificationType.ApplicationReceived,
            new { deepLink = "/inbox" },
            email: null);

        Assert.Equal("inbox+push", GetProp(Assert.Single(analytics.Events).Payload, "channel"));
    }

    [Fact]
    public async Task NotifyAsync_WithWebBaseUrl_AppendsAGotoCtaToThePersistedEmail()
    {
        var (dispatcher, repository, _) = CreateDispatcher("http://localhost:5173/");

        await dispatcher.NotifyAsync(
            [new NotificationRecipient(Guid.NewGuid(), "person@example.com")],
            NotificationType.BookingReminder,
            new { deepLink = "/bookings/9f1c1b2e-0000-4000-8000-000000000001" },
            new EmailContent("Subject", "Body"));

        var sent = EmailPayload(repository);
        Assert.Equal(
            "Body\n\nOpen the booking: http://localhost:5173/?goto=%2Fbookings%2F9f1c1b2e-0000-4000-8000-000000000001",
            sent.TextBody);
    }

    [Fact]
    public async Task NotifyAsync_PayloadWithoutDeepLink_CtaFallsBackToTheInbox()
    {
        var (dispatcher, repository, _) = CreateDispatcher("https://steeple.example/steeple");

        await dispatcher.NotifyAsync(
            [new NotificationRecipient(Guid.NewGuid(), "person@example.com")],
            NotificationType.ApplicationReceived,
            new { applicationId = Guid.NewGuid() },
            new EmailContent("Subject", "Body"));

        Assert.EndsWith(
            "Open the request: https://steeple.example/steeple/?goto=%2Finbox",
            EmailPayload(repository).TextBody,
            StringComparison.Ordinal);
    }

    [Fact]
    public async Task NotifyAsync_WithoutWebBaseUrl_LeavesTheBodyUntouched()
    {
        var (dispatcher, repository, _) = CreateDispatcher();

        await dispatcher.NotifyAsync(
            [new NotificationRecipient(Guid.NewGuid(), "person@example.com")],
            NotificationType.ApplicationReceived,
            new { deepLink = "/inbox/applications/123" },
            new EmailContent("Subject", "Body"));

        Assert.Equal("Body", EmailPayload(repository).TextBody);
    }

    [Fact]
    public async Task NotifyAsync_WithHtmlBody_AppendsTheCtaToBothPersistedParts()
    {
        var (dispatcher, repository, _) = CreateDispatcher("http://localhost:5173");

        await dispatcher.NotifyAsync(
            [new NotificationRecipient(Guid.NewGuid(), "person@example.com")],
            NotificationType.ApplicationApproved,
            new { deepLink = "/inbox/applications/abc" },
            new EmailContent("Subject", "Body", "<p>Body</p>"));

        var sent = EmailPayload(repository);
        Assert.Contains("/?goto=%2Finbox%2Fapplications%2Fabc", sent.TextBody, StringComparison.Ordinal);
        Assert.Contains(
            "<a href=\"http://localhost:5173/?goto=%2Finbox%2Fapplications%2Fabc\">Open the request</a>",
            sent.HtmlBody!,
            StringComparison.Ordinal);
    }

    private static (
        NotificationDispatcher Dispatcher,
        FakeNotificationRepository Repository,
        FakeAnalyticsSink Analytics) CreateDispatcher(string webBaseUrl = "")
    {
        var repository = new FakeNotificationRepository();
        var analytics = new FakeAnalyticsSink();
        var dispatcher = new NotificationDispatcher(
            repository,
            analytics,
            new FixedTimeProvider(FixedNow),
            Options.Create(new EmailOptions { WebBaseUrl = webBaseUrl }));
        return (dispatcher, repository, analytics);
    }

    private static EmailOutboxPayload EmailPayload(FakeNotificationRepository repository) =>
        Deserialize<EmailOutboxPayload>(Assert.Single(
            repository.Deliveries,
            row => row.Channel == NotificationOutboxChannel.Email));

    private static T Deserialize<T>(NotificationOutbox row) where T : class =>
        JsonSerializer.Deserialize<T>(row.PayloadJson, JsonOptions)!;

    private static object? GetProp(object? payload, string name) =>
        payload?.GetType().GetProperty(name)?.GetValue(payload);

    private sealed class FixedTimeProvider(DateTimeOffset now) : TimeProvider
    {
        public override DateTimeOffset GetUtcNow() => now;
    }

    private sealed class FakeNotificationRepository : INotificationRepository
    {
        public List<Notification> Added { get; } = [];
        public List<NotificationOutbox> Deliveries { get; } = [];

        public Task AddRangeAsync(
            IReadOnlyList<Notification> notifications,
            IReadOnlyList<NotificationOutbox> deliveries,
            CancellationToken ct = default)
        {
            Added.AddRange(notifications);
            Deliveries.AddRange(deliveries);
            return Task.CompletedTask;
        }

        public Task<IReadOnlyList<NotificationOutbox>> ClaimDueAsync(
            DateTimeOffset nowUtc, int limit, TimeSpan lease, CancellationToken ct = default) =>
            Task.FromResult<IReadOnlyList<NotificationOutbox>>([]);

        public Task MarkDeliveredAsync(Guid id, DateTimeOffset deliveredAtUtc, CancellationToken ct = default) =>
            Task.CompletedTask;

        public Task RecordFailureAsync(
            Guid id,
            string error,
            DateTimeOffset nextAttemptAtUtc,
            DateTimeOffset? failedAtUtc,
            CancellationToken ct = default) => Task.CompletedTask;

        public Task<IReadOnlyList<Notification>> GetPageAsync(
            Guid userId, DateTimeOffset? beforeCreatedAtUtc, Guid? beforeId, int limit, CancellationToken ct = default) =>
            Task.FromResult<IReadOnlyList<Notification>>([]);

        public Task MarkReadAsync(Guid userId, IReadOnlyList<Guid> ids, CancellationToken ct = default) =>
            Task.CompletedTask;
    }

    private sealed class FakeAnalyticsSink : IAnalyticsSink
    {
        public List<(string EventType, object? Payload)> Events { get; } = [];

        public Task TrackAsync(
            string eventType,
            object? payload = null,
            string? sessionId = null,
            CancellationToken ct = default)
        {
            Events.Add((eventType, payload));
            return Task.CompletedTask;
        }
    }
}
