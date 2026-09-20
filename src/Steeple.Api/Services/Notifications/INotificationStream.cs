using System.Threading.Channels;

namespace Steeple.Api.Services.Notifications;

public interface INotificationStream
{
    NotificationStreamAdmission TrySubscribe(Guid userId);
    void Publish(Guid userId);
    void MarkReady();
    void MarkUnavailable();
}

public enum NotificationStreamAdmissionStatus
{
    Accepted,
    Unavailable,
    UserLimitReached,
    ProcessLimitReached,
}

public readonly record struct NotificationStreamAdmission(
    NotificationStreamAdmissionStatus Status,
    INotificationStreamSubscription? Subscription = null);

public interface INotificationStreamSubscription : IDisposable
{
    ChannelReader<NotificationStreamSignal> Signals { get; }
    CancellationToken Cancellation { get; }
}

public readonly record struct NotificationStreamSignal;
