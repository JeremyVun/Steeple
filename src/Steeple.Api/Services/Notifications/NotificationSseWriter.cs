using System.Text;
using Microsoft.Extensions.Options;

namespace Steeple.Api.Services.Notifications;

public interface INotificationSseWriter
{
    Task WriteAsync(
        HttpContext context,
        INotificationStreamSubscription subscription,
        DateTimeOffset tokenExpiresAt,
        CancellationToken cancellationToken);
}

public sealed class NotificationSseWriter : INotificationSseWriter
{
    internal static readonly byte[] InvalidationFrame = Encoding.UTF8.GetBytes("event: invalidate\ndata: {}\n\n");
    internal static readonly byte[] HeartbeatFrame = Encoding.UTF8.GetBytes(": heartbeat\n\n");

    private readonly NotificationStreamOptions _options;
    private readonly TimeProvider _clock;
    private readonly IHostApplicationLifetime _lifetime;
    private readonly ILogger<NotificationSseWriter>? _logger;

    public NotificationSseWriter(
        IOptions<NotificationStreamOptions> options,
        TimeProvider clock,
        IHostApplicationLifetime lifetime,
        ILogger<NotificationSseWriter>? logger = null)
    {
        _options = options.Value;
        _clock = clock;
        _lifetime = lifetime;
        _logger = logger;
    }

    public async Task WriteAsync(
        HttpContext context,
        INotificationStreamSubscription subscription,
        DateTimeOffset tokenExpiresAt,
        CancellationToken cancellationToken)
    {
        var remainingTokenLifetime = tokenExpiresAt - _clock.GetUtcNow();
        var lifetime = remainingTokenLifetime < _options.MaxLifetime
            ? remainingTokenLifetime
            : _options.MaxLifetime;
        if (lifetime <= TimeSpan.Zero)
        {
            return;
        }

        using var lifetimeLimit = new CancellationTokenSource(lifetime, _clock);
        using var linked = CancellationTokenSource.CreateLinkedTokenSource(
            cancellationToken,
            context.RequestAborted,
            subscription.Cancellation,
            _lifetime.ApplicationStopping,
            lifetimeLimit.Token);
        var ct = linked.Token;

        context.Response.StatusCode = StatusCodes.Status200OK;
        context.Response.ContentType = "text/event-stream; charset=utf-8";
        context.Response.Headers.CacheControl = "no-store, no-transform";
        context.Response.Headers["X-Accel-Buffering"] = "no";

        try
        {
            if (!await RunWithWriteDeadlineAsync(context, token => context.Response.StartAsync(token), ct)
                    .ConfigureAwait(false))
            {
                return;
            }

            while (!ct.IsCancellationRequested)
            {
                using var iteration = CancellationTokenSource.CreateLinkedTokenSource(ct);
                var signal = subscription.Signals.WaitToReadAsync(iteration.Token).AsTask();
                var heartbeat = Task.Delay(_options.HeartbeatInterval, _clock, iteration.Token);
                var completed = await Task.WhenAny(signal, heartbeat).ConfigureAwait(false);
                iteration.Cancel();
                if (completed == signal)
                {
                    var available = await signal.ConfigureAwait(false);
                    await ObserveCancellationAsync(heartbeat).ConfigureAwait(false);
                    if (!available)
                    {
                        break;
                    }

                    subscription.Signals.TryRead(out _);
                    if (!await WriteFrameAsync(context, InvalidationFrame, ct).ConfigureAwait(false))
                    {
                        break;
                    }
                }
                else
                {
                    await heartbeat.ConfigureAwait(false);
                    await ObserveCancellationAsync(signal).ConfigureAwait(false);
                    if (!await WriteFrameAsync(context, HeartbeatFrame, ct).ConfigureAwait(false))
                    {
                        break;
                    }
                }
            }
        }
        catch (OperationCanceledException) when (ct.IsCancellationRequested)
        {
        }
        catch (Exception exception) when (exception is IOException || context.Response.HasStarted)
        {
            _logger?.LogWarning(
                "Notification stream response ended after a write failure ({FailureType}).",
                exception.GetType().Name);
            context.Abort();
        }
    }

    private async Task<bool> WriteFrameAsync(HttpContext context, byte[] frame, CancellationToken cancellationToken)
    {
        try
        {
            return await RunWithWriteDeadlineAsync(
                    context,
                    async token =>
                    {
                        await context.Response.Body.WriteAsync(frame, token).ConfigureAwait(false);
                        await context.Response.Body.FlushAsync(token).ConfigureAwait(false);
                    },
                    cancellationToken).ConfigureAwait(false);
        }
        catch (Exception exception)
        {
            _logger?.LogWarning(
                "Notification stream response ended after a write failure ({FailureType}).",
                exception.GetType().Name);
            context.Abort();
            return false;
        }
    }

    private async Task<bool> RunWithWriteDeadlineAsync(
        HttpContext context,
        Func<CancellationToken, Task> operation,
        CancellationToken cancellationToken)
    {
        var timeout = new CancellationTokenSource(_options.WriteDeadline, _clock);
        var linked = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken, timeout.Token);
        var deferredDisposal = false;
        var pending = operation(linked.Token);
        try
        {
            await pending.WaitAsync(_options.WriteDeadline, _clock, cancellationToken).ConfigureAwait(false);
            return true;
        }
        catch (TimeoutException)
        {
            context.Abort();
            deferredDisposal = true;
            DisposeAfterCancellation(linked.CancelAsync(), linked, timeout);
            ObserveFault(pending);
            return false;
        }
        catch (OperationCanceledException) when (timeout.IsCancellationRequested)
        {
            context.Abort();
            ObserveFault(pending);
            return false;
        }
        catch (OperationCanceledException)
        {
            context.Abort();
            ObserveFault(pending);
            throw;
        }
        finally
        {
            if (!deferredDisposal)
            {
                linked.Dispose();
                timeout.Dispose();
            }
        }
    }

    private static async Task ObserveCancellationAsync(Task task)
    {
        try
        {
            await task.ConfigureAwait(false);
        }
        catch (OperationCanceledException)
        {
        }
    }

    private static void ObserveFault(Task task) =>
        _ = task.ContinueWith(
            completed => _ = completed.Exception,
            CancellationToken.None,
            TaskContinuationOptions.OnlyOnFaulted | TaskContinuationOptions.ExecuteSynchronously,
            TaskScheduler.Default);

    private static void DisposeAfterCancellation(
        Task cancellation,
        CancellationTokenSource linked,
        CancellationTokenSource timeout) =>
        _ = cancellation.ContinueWith(
            completed =>
            {
                _ = completed.Exception;
                linked.Dispose();
                timeout.Dispose();
            },
            CancellationToken.None,
            TaskContinuationOptions.ExecuteSynchronously,
            TaskScheduler.Default);
}
