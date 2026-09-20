using System.Threading.Channels;
using Microsoft.Extensions.Options;

namespace Steeple.Api.Proxies.Notifications;

public sealed class InMemoryNotificationStream : INotificationStream
{
    private readonly object _gate = new();
    private readonly Dictionary<Guid, HashSet<Subscription>> _subscriptions = [];
    private readonly int _maxPerUser;
    private readonly int _maxTotal;
    private readonly ILogger<InMemoryNotificationStream>? _logger;
    private bool _ready;
    private int _count;

    public InMemoryNotificationStream(
        IOptions<NotificationStreamOptions> options,
        ILogger<InMemoryNotificationStream>? logger = null)
    {
        _maxPerUser = options.Value.MaxSubscriptionsPerUser;
        _maxTotal = options.Value.MaxSubscriptionsPerProcess;
        _logger = logger;
    }

    public bool IsReady
    {
        get { lock (_gate) return _ready; }
    }

    public int SubscriptionCount
    {
        get { lock (_gate) return _count; }
    }

    public NotificationStreamAdmission TrySubscribe(Guid userId)
    {
        lock (_gate)
        {
            if (!_ready)
            {
                return new(NotificationStreamAdmissionStatus.Unavailable);
            }

            if (_count >= _maxTotal)
            {
                _logger?.LogWarning(
                    "Notification stream admission reached the process cap ({ActiveSubscriptions}/{ProcessLimit}).",
                    _count,
                    _maxTotal);
                return new(NotificationStreamAdmissionStatus.ProcessLimitReached);
            }

            if (_subscriptions.TryGetValue(userId, out var existing)
                && existing.Count >= _maxPerUser)
            {
                _logger?.LogWarning(
                    "Notification stream admission reached a recipient cap ({RecipientSubscriptions}/{RecipientLimit}); {ActiveSubscriptions} active.",
                    existing.Count,
                    _maxPerUser,
                    _count);
                return new(NotificationStreamAdmissionStatus.UserLimitReached);
            }

            var subscription = new Subscription(this, userId);
            var recipients = existing ?? [];
            if (existing is null)
            {
                _subscriptions.Add(userId, recipients);
            }

            recipients.Add(subscription);
            _count++;
            subscription.Publish();
            return new(NotificationStreamAdmissionStatus.Accepted, subscription);
        }
    }

    public void Publish(Guid userId)
    {
        lock (_gate)
        {
            if (!_ready || !_subscriptions.TryGetValue(userId, out var subscriptions))
            {
                return;
            }

            foreach (var subscription in subscriptions)
            {
                subscription.Publish();
            }
        }
    }

    public void MarkReady()
    {
        lock (_gate)
        {
            _ready = true;
        }
    }

    public void MarkUnavailable()
    {
        Subscription[] subscriptions;
        bool wasReady;
        lock (_gate)
        {
            wasReady = _ready;
            _ready = false;
            subscriptions = _subscriptions.Values.SelectMany(value => value).ToArray();
            _subscriptions.Clear();
            _count = 0;
            foreach (var subscription in subscriptions)
            {
                subscription.Detach();
            }
        }

        foreach (var subscription in subscriptions)
        {
            subscription.Complete();
        }

        if (wasReady || subscriptions.Length > 0)
        {
            _logger?.LogInformation(
                "Notification stream admission closed; {ClosedSubscriptions} active subscriptions ended.",
                subscriptions.Length);
        }
    }

    private void Remove(Subscription subscription, Guid userId)
    {
        lock (_gate)
        {
            if (!_subscriptions.TryGetValue(userId, out var subscriptions)
                || !subscriptions.Remove(subscription))
            {
                return;
            }

            _count--;
            if (subscriptions.Count == 0)
            {
                _subscriptions.Remove(userId);
            }
        }
    }

    private sealed class Subscription : INotificationStreamSubscription
    {
        private readonly InMemoryNotificationStream _owner;
        private readonly Guid _userId;
        private readonly CancellationTokenSource _completion = new();
        private readonly Channel<NotificationStreamSignal> _signals = Channel.CreateBounded<NotificationStreamSignal>(
            new BoundedChannelOptions(1)
            {
                FullMode = BoundedChannelFullMode.DropOldest,
                SingleReader = true,
                SingleWriter = false,
                AllowSynchronousContinuations = false,
            });
        private int _attached = 1;

        public Subscription(InMemoryNotificationStream owner, Guid userId)
        {
            _owner = owner;
            _userId = userId;
        }

        public ChannelReader<NotificationStreamSignal> Signals => _signals.Reader;
        public CancellationToken Cancellation => _completion.Token;

        public void Publish() => _signals.Writer.TryWrite(default);

        public void Dispose()
        {
            if (Interlocked.Exchange(ref _attached, 0) == 1)
            {
                _owner.Remove(this, _userId);
            }

            Complete();
        }

        public void Detach() => Interlocked.Exchange(ref _attached, 0);

        public void Complete()
        {
            if (!_completion.IsCancellationRequested)
            {
                _completion.Cancel();
            }
            _signals.Writer.TryComplete();
        }
    }
}
