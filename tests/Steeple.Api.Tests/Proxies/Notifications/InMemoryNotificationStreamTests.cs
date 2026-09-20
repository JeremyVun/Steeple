using Microsoft.Extensions.Options;
using Steeple.Api.Proxies.Notifications;

namespace Steeple.Api.Tests.Proxies.Notifications;

public sealed class InMemoryNotificationStreamTests
{
    [Fact]
    public void AdmissionRequiresReadiness()
    {
        var stream = Create();

        var admission = stream.TrySubscribe(Guid.NewGuid());

        Assert.Equal(NotificationStreamAdmissionStatus.Unavailable, admission.Status);
        Assert.Equal(0, stream.SubscriptionCount);
    }

    [Fact]
    public void AdmissionRegistersBeforeItsInitialInvalidation()
    {
        var stream = Create();
        stream.MarkReady();

        using var subscription = stream.TrySubscribe(Guid.NewGuid()).Subscription!;

        Assert.True(subscription.Signals.TryRead(out _));
        Assert.Equal(1, stream.SubscriptionCount);
    }

    [Fact]
    public void PublishIsRecipientScopedAndCoalescesPendingSignals()
    {
        var stream = Create();
        stream.MarkReady();
        var firstUser = Guid.NewGuid();
        using var first = stream.TrySubscribe(firstUser).Subscription!;
        using var second = stream.TrySubscribe(Guid.NewGuid()).Subscription!;
        Assert.True(first.Signals.TryRead(out _));
        Assert.True(second.Signals.TryRead(out _));

        stream.Publish(firstUser);
        stream.Publish(firstUser);

        Assert.True(first.Signals.TryRead(out _));
        Assert.False(first.Signals.TryRead(out _));
        Assert.False(second.Signals.TryRead(out _));
    }

    [Fact]
    public void PerUserAndProcessCapsAreAtomicAndPermitsReturnOnDispose()
    {
        var stream = Create(maxPerUser: 2, maxTotal: 3);
        stream.MarkReady();
        var user = Guid.NewGuid();
        using var first = stream.TrySubscribe(user).Subscription!;
        var second = stream.TrySubscribe(user).Subscription!;

        Assert.Equal(NotificationStreamAdmissionStatus.UserLimitReached, stream.TrySubscribe(user).Status);
        using var third = stream.TrySubscribe(Guid.NewGuid()).Subscription!;
        Assert.Equal(NotificationStreamAdmissionStatus.ProcessLimitReached, stream.TrySubscribe(Guid.NewGuid()).Status);

        second.Dispose();
        using var replacement = stream.TrySubscribe(user).Subscription!;
        Assert.Equal(3, stream.SubscriptionCount);
    }

    [Fact]
    public void DefaultCapsAreFourPerUserAndTwoHundredFiftySixPerProcess()
    {
        var stream = Create();
        stream.MarkReady();
        var oneUser = Guid.NewGuid();
        var userSubscriptions = Enumerable.Range(0, 4)
            .Select(_ => stream.TrySubscribe(oneUser).Subscription!)
            .ToArray();
        Assert.Equal(NotificationStreamAdmissionStatus.UserLimitReached, stream.TrySubscribe(oneUser).Status);
        foreach (var subscription in userSubscriptions)
        {
            subscription.Dispose();
        }

        var processSubscriptions = Enumerable.Range(0, 256)
            .Select(_ => stream.TrySubscribe(Guid.NewGuid()).Subscription!)
            .ToArray();
        Assert.Equal(NotificationStreamAdmissionStatus.ProcessLimitReached, stream.TrySubscribe(Guid.NewGuid()).Status);
        foreach (var subscription in processSubscriptions)
        {
            subscription.Dispose();
        }
        Assert.Equal(0, stream.SubscriptionCount);
    }

    [Fact]
    public void ListenerLossClosesAllSubscriptionsAndRemovesRecipientState()
    {
        var stream = Create();
        stream.MarkReady();
        using var first = stream.TrySubscribe(Guid.NewGuid()).Subscription!;
        using var second = stream.TrySubscribe(Guid.NewGuid()).Subscription!;

        stream.MarkUnavailable();

        Assert.True(first.Cancellation.IsCancellationRequested);
        Assert.True(second.Cancellation.IsCancellationRequested);
        Assert.Equal(0, stream.SubscriptionCount);
        Assert.Equal(NotificationStreamAdmissionStatus.Unavailable, stream.TrySubscribe(Guid.NewGuid()).Status);
    }

    [Fact]
    public async Task PublishDisposeAndListenerLossRaceWithoutLeakingPermits()
    {
        var stream = Create(maxPerUser: 32, maxTotal: 256);
        stream.MarkReady();
        var user = Guid.NewGuid();
        var subscriptions = Enumerable.Range(0, 32)
            .Select(_ => stream.TrySubscribe(user).Subscription!)
            .ToArray();

        await Task.WhenAll(
            Task.Run(() => Parallel.For(0, 500, _ => stream.Publish(user))),
            Task.Run(() => Parallel.ForEach(subscriptions, subscription => subscription.Dispose())),
            Task.Run(stream.MarkUnavailable));

        Assert.Equal(0, stream.SubscriptionCount);
        Assert.False(stream.IsReady);
    }

    private static InMemoryNotificationStream Create(int maxPerUser = 4, int maxTotal = 256) =>
        new(Options.Create(new NotificationStreamOptions
        {
            MaxSubscriptionsPerUser = maxPerUser,
            MaxSubscriptionsPerProcess = maxTotal,
        }));
}
