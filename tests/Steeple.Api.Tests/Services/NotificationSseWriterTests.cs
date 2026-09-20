using Microsoft.AspNetCore.Http.Features;
using Microsoft.AspNetCore.Http;
using System.IO.Pipelines;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Options;
using Steeple.Api.Proxies.Notifications;

namespace Steeple.Api.Tests.Services;

public sealed class NotificationSseWriterTests
{
    [Fact]
    public async Task WritesExactInitialFrameAndStreamingHeaders()
    {
        var stream = CreateStream();
        using var subscription = stream.TrySubscribe(Guid.NewGuid()).Subscription!;
        var context = new DefaultHttpContext();
        context.Response.Body = new MemoryStream();
        using var stop = new CancellationTokenSource();
        var clock = new ManualTimeProvider();
        var writer = CreateWriter(clock: clock);

        var writing = writer.WriteAsync(context, subscription, clock.GetUtcNow().AddMinutes(1), stop.Token);
        await UntilAsync(() => clock.HasTimer(TimeSpan.FromSeconds(30)));
        stop.Cancel();
        await writing.WaitAsync(TimeSpan.FromSeconds(10));

        Assert.Equal("text/event-stream; charset=utf-8", context.Response.ContentType);
        Assert.Equal("no-store, no-transform", context.Response.Headers.CacheControl);
        Assert.Equal("no", context.Response.Headers["X-Accel-Buffering"]);
        Assert.Equal("event: invalidate\ndata: {}\n\n", ReadBody(context));
    }

    [Fact]
    public async Task WritesHeartbeatOnlyAfterIdleInterval()
    {
        var stream = CreateStream();
        using var subscription = stream.TrySubscribe(Guid.NewGuid()).Subscription!;
        var context = new DefaultHttpContext();
        context.Response.Body = new MemoryStream();
        using var stop = new CancellationTokenSource();
        var clock = new ManualTimeProvider();
        var writer = CreateWriter(heartbeat: TimeSpan.FromSeconds(30), clock: clock);

        var writing = writer.WriteAsync(context, subscription, clock.GetUtcNow().AddMinutes(10), stop.Token);
        await UntilAsync(() => clock.HasTimer(TimeSpan.FromSeconds(30)));
        Assert.Equal("event: invalidate\ndata: {}\n\n", ReadBody(context));
        clock.Advance(TimeSpan.FromSeconds(29));
        Assert.Equal("event: invalidate\ndata: {}\n\n", ReadBody(context));
        clock.Advance(TimeSpan.FromSeconds(1));
        await UntilAsync(() => clock.HasTimer(TimeSpan.FromSeconds(30)));
        stop.Cancel();
        await writing.WaitAsync(TimeSpan.FromSeconds(10));

        Assert.StartsWith("event: invalidate\ndata: {}\n\n: heartbeat\n\n", ReadBody(context));
    }

    [Fact]
    public async Task ClosesAtTokenExpiryEvenWhenMiddlewareClockSkewWouldAdmitIt()
    {
        var stream = CreateStream();
        using var subscription = stream.TrySubscribe(Guid.NewGuid()).Subscription!;
        var context = new DefaultHttpContext();
        context.Response.Body = new MemoryStream();
        var clock = new ManualTimeProvider();
        var writer = CreateWriter(clock: clock);
        var writing = writer.WriteAsync(context, subscription, clock.GetUtcNow().AddSeconds(5), CancellationToken.None);
        await UntilAsync(() => clock.HasTimer(TimeSpan.FromSeconds(30)));
        clock.Advance(TimeSpan.FromSeconds(4));
        Assert.False(writing.IsCompleted);
        clock.Advance(TimeSpan.FromSeconds(1));
        await writing.WaitAsync(TimeSpan.FromSeconds(10));
        Assert.Equal("event: invalidate\ndata: {}\n\n", ReadBody(context));
    }

    [Fact]
    public async Task AbortsConnectionWhenBodyWriteIgnoresItsDeadlineToken()
    {
        var stream = CreateStream();
        using var subscription = stream.TrySubscribe(Guid.NewGuid()).Subscription!;
        var requestLifetime = new RecordingRequestLifetimeFeature();
        var context = new DefaultHttpContext();
        context.Features.Set<IHttpRequestLifetimeFeature>(requestLifetime);
        context.Response.Body = new BlockingStream();
        var clock = new ManualTimeProvider();
        var writer = CreateWriter(writeDeadline: TimeSpan.FromSeconds(1), clock: clock);
        var writing = writer.WriteAsync(context, subscription, clock.GetUtcNow().AddMinutes(1), CancellationToken.None);
        await UntilAsync(() => clock.ActiveTimers == 3 && ((BlockingStream)context.Response.Body).Writes == 1);
        clock.Advance(TimeSpan.FromSeconds(1));
        await writing.WaitAsync(TimeSpan.FromSeconds(10));

        Assert.True(requestLifetime.Aborted);
        Assert.Equal(1, Assert.IsType<BlockingStream>(context.Response.Body).Writes);
    }

    [Fact]
    public async Task AbortsConnectionWhenBodyWriteCooperativelyTimesOut()
    {
        var stream = CreateStream();
        using var subscription = stream.TrySubscribe(Guid.NewGuid()).Subscription!;
        var requestLifetime = new RecordingRequestLifetimeFeature();
        var body = new CooperativeBlockingStream();
        var context = new DefaultHttpContext();
        context.Features.Set<IHttpRequestLifetimeFeature>(requestLifetime);
        context.Response.Body = body;
        var writer = CreateWriter(writeDeadline: TimeSpan.FromMilliseconds(100));

        await writer.WriteAsync(context, subscription, DateTimeOffset.UtcNow.AddMinutes(1), CancellationToken.None);

        Assert.True(requestLifetime.Aborted);
        await UntilAsync(() => body.CancellationObserved);
        Assert.True(body.CancellationObserved);
    }

    [Fact]
    public async Task StartTimeoutAbortsWithoutStartingTheFrameLoop()
    {
        var stream = CreateStream();
        using var subscription = stream.TrySubscribe(Guid.NewGuid()).Subscription!;
        var requestLifetime = new RecordingRequestLifetimeFeature();
        var response = new BlockingResponseBodyFeature();
        var context = new DefaultHttpContext();
        context.Features.Set<IHttpRequestLifetimeFeature>(requestLifetime);
        context.Features.Set<IHttpResponseBodyFeature>(response);
        var writer = CreateWriter(writeDeadline: TimeSpan.FromMilliseconds(30));

        await writer.WriteAsync(context, subscription, DateTimeOffset.UtcNow.AddMinutes(1), CancellationToken.None);

        Assert.True(requestLifetime.Aborted);
        Assert.Equal(0, response.BodyWrites);
    }

    [Fact]
    public async Task NonIoFailureAfterHeadersAbortsWithoutEscapingToProblemDetails()
    {
        var stream = CreateStream();
        using var subscription = stream.TrySubscribe(Guid.NewGuid()).Subscription!;
        var requestLifetime = new RecordingRequestLifetimeFeature();
        var context = new DefaultHttpContext();
        context.Features.Set<IHttpRequestLifetimeFeature>(requestLifetime);
        context.Response.Body = new ThrowingStream();
        var writer = CreateWriter();

        await writer.WriteAsync(context, subscription, DateTimeOffset.UtcNow.AddMinutes(1), CancellationToken.None);

        Assert.True(requestLifetime.Aborted);
    }

    [Fact]
    public async Task SignalBurstsKeepOnlyOneHeartbeatTimerAndReleaseAllTimersOnExit()
    {
        var stream = CreateStream();
        var userId = Guid.NewGuid();
        using var subscription = stream.TrySubscribe(userId).Subscription!;
        var context = new DefaultHttpContext();
        var body = new CountingWriteStream();
        context.Response.Body = body;
        var clock = new CountingTimeProvider();
        var writer = new NotificationSseWriter(
            Options.Create(new NotificationStreamOptions()),
            clock,
            new TestApplicationLifetime());
        using var stop = new CancellationTokenSource();

        var writing = writer.WriteAsync(
            context,
            subscription,
            clock.GetUtcNow().AddMinutes(10),
            stop.Token);
        await UntilAsync(() => body.Writes >= 1);
        for (var expectedWrites = 2; expectedWrites <= 51; expectedWrites++)
        {
            stream.Publish(userId);
            await UntilAsync(() => body.Writes >= expectedWrites);
        }

        Assert.InRange(clock.MaxActiveTimers, 1, 5);
        Assert.InRange(clock.ActiveTimers, 1, 2);
        stop.Cancel();
        await writing;
        Assert.Equal(0, clock.ActiveTimers);
    }

    private static InMemoryNotificationStream CreateStream()
    {
        var stream = new InMemoryNotificationStream(Options.Create(new NotificationStreamOptions()));
        stream.MarkReady();
        return stream;
    }

    private static NotificationSseWriter CreateWriter(
        TimeSpan? heartbeat = null,
        TimeSpan? writeDeadline = null,
        TimeProvider? clock = null) =>
        new(
            Options.Create(new NotificationStreamOptions
            {
                HeartbeatInterval = heartbeat ?? TimeSpan.FromSeconds(30),
                WriteDeadline = writeDeadline ?? TimeSpan.FromSeconds(1),
            }),
            clock ?? TimeProvider.System,
            new TestApplicationLifetime());

    private static string ReadBody(DefaultHttpContext context)
    {
        var body = Assert.IsType<MemoryStream>(context.Response.Body);
        return System.Text.Encoding.UTF8.GetString(body.ToArray());
    }

    private static async Task UntilAsync(Func<bool> condition)
    {
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(10));
        while (!condition())
        {
            await Task.Delay(1, timeout.Token);
        }
    }

    private sealed class TestApplicationLifetime : IHostApplicationLifetime
    {
        public CancellationToken ApplicationStarted => CancellationToken.None;
        public CancellationToken ApplicationStopping => CancellationToken.None;
        public CancellationToken ApplicationStopped => CancellationToken.None;
        public void StopApplication() { }
    }

    private sealed class RecordingRequestLifetimeFeature : IHttpRequestLifetimeFeature
    {
        public CancellationToken RequestAborted { get; set; }
        public bool Aborted { get; private set; }
        public void Abort() => Aborted = true;
    }

    private class BlockingStream : Stream
    {
        public int Writes { get; private set; }
        public override bool CanRead => false;
        public override bool CanSeek => false;
        public override bool CanWrite => true;
        public override long Length => throw new NotSupportedException();
        public override long Position { get => throw new NotSupportedException(); set => throw new NotSupportedException(); }
        public override void Flush() { }
        public override int Read(byte[] buffer, int offset, int count) => throw new NotSupportedException();
        public override long Seek(long offset, SeekOrigin origin) => throw new NotSupportedException();
        public override void SetLength(long value) => throw new NotSupportedException();
        public override void Write(byte[] buffer, int offset, int count) => throw new NotSupportedException();
        public override ValueTask WriteAsync(ReadOnlyMemory<byte> buffer, CancellationToken cancellationToken = default)
        {
            Writes++;
            return new(new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously).Task);
        }
    }

    private sealed class CooperativeBlockingStream : BlockingStream
    {
        public bool CancellationObserved { get; private set; }

        public override async ValueTask WriteAsync(
            ReadOnlyMemory<byte> buffer,
            CancellationToken cancellationToken = default)
        {
            try
            {
                await Task.Delay(Timeout.InfiniteTimeSpan, cancellationToken);
            }
            catch (OperationCanceledException)
            {
                CancellationObserved = true;
                throw;
            }
        }
    }

    private sealed class ThrowingStream : BlockingStream
    {
        public override ValueTask WriteAsync(
            ReadOnlyMemory<byte> buffer,
            CancellationToken cancellationToken = default) =>
            ValueTask.FromException(new InvalidOperationException("synthetic write failure"));
    }

    private sealed class BlockingResponseBodyFeature : IHttpResponseBodyFeature
    {
        private readonly BlockingStream _stream = new();
        public Stream Stream => _stream;
        public PipeWriter Writer => PipeWriter.Create(_stream);
        public int BodyWrites => _stream.Writes;
        public void DisableBuffering() { }
        public Task StartAsync(CancellationToken cancellationToken = default) =>
            new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously).Task;
        public Task SendFileAsync(
            string path,
            long offset,
            long? count,
            CancellationToken cancellationToken = default) => throw new NotSupportedException();
        public Task CompleteAsync() => Task.CompletedTask;
    }

    private sealed class CountingWriteStream : Stream
    {
        private int _writes;
        public int Writes => Volatile.Read(ref _writes);
        public override bool CanRead => false;
        public override bool CanSeek => false;
        public override bool CanWrite => true;
        public override long Length => throw new NotSupportedException();
        public override long Position { get => throw new NotSupportedException(); set => throw new NotSupportedException(); }
        public override void Flush() { }
        public override int Read(byte[] buffer, int offset, int count) => throw new NotSupportedException();
        public override long Seek(long offset, SeekOrigin origin) => throw new NotSupportedException();
        public override void SetLength(long value) => throw new NotSupportedException();
        public override void Write(byte[] buffer, int offset, int count) => Interlocked.Increment(ref _writes);
        public override ValueTask WriteAsync(
            ReadOnlyMemory<byte> buffer,
            CancellationToken cancellationToken = default)
        {
            Interlocked.Increment(ref _writes);
            return ValueTask.CompletedTask;
        }
    }

    private sealed class ManualTimeProvider : TimeProvider
    {
        private readonly object _sync = new();
        private DateTimeOffset _now = new(2026, 9, 20, 0, 0, 0, TimeSpan.Zero);
        private readonly List<ManualTimer> _timers = [];
        public override DateTimeOffset GetUtcNow() { lock (_sync) return _now; }
        public int ActiveTimers { get { lock (_sync) return _timers.Count; } }
        public bool HasTimer(TimeSpan delay)
        {
            lock (_sync) return _timers.Any(t => t.DueAt == _now + delay);
        }
        public void Advance(TimeSpan duration)
        {
            ManualTimer[] due;
            lock (_sync)
            {
                _now += duration;
                due = _timers.Where(t => t.DueAt <= _now).ToArray();
                foreach (var timer in due) _timers.Remove(timer);
            }
            foreach (var timer in due) timer.Fire();
        }
        public override ITimer CreateTimer(TimerCallback callback, object? state, TimeSpan dueTime, TimeSpan period)
        {
            Assert.Equal(Timeout.InfiniteTimeSpan, period);
            lock (_sync)
            {
                var timer = new ManualTimer(this, callback, state) { DueAt = _now + dueTime };
                _timers.Add(timer);
                return timer;
            }
        }
        private sealed class ManualTimer(ManualTimeProvider owner, TimerCallback callback, object? state) : ITimer
        {
            public DateTimeOffset DueAt { get; set; }
            private bool _disposed;
            public void Fire() { if (!_disposed) callback(state); }
            public bool Change(TimeSpan dueTime, TimeSpan period)
            {
                lock (owner._sync)
                {
                    if (_disposed) return false;
                    DueAt = owner._now + dueTime;
                    return true;
                }
            }
            public void Dispose() { lock (owner._sync) { _disposed = true; owner._timers.Remove(this); } }
            public ValueTask DisposeAsync() { Dispose(); return ValueTask.CompletedTask; }
        }
    }

    private sealed class CountingTimeProvider : TimeProvider
    {
        private int _active;
        private int _maximum;
        public int ActiveTimers => Volatile.Read(ref _active);
        public int MaxActiveTimers => Volatile.Read(ref _maximum);
        public override DateTimeOffset GetUtcNow() => new(2026, 9, 5, 10, 0, 0, TimeSpan.Zero);

        public override ITimer CreateTimer(
            TimerCallback callback,
            object? state,
            TimeSpan dueTime,
            TimeSpan period)
        {
            var active = Interlocked.Increment(ref _active);
            int observed;
            while (active > (observed = Volatile.Read(ref _maximum)))
            {
                if (Interlocked.CompareExchange(ref _maximum, active, observed) == observed)
                {
                    break;
                }
            }
            return new CountingTimer(this);
        }

        private sealed class CountingTimer(CountingTimeProvider owner) : ITimer
        {
            private int _disposed;
            public bool Change(TimeSpan dueTime, TimeSpan period) => Volatile.Read(ref _disposed) == 0;
            public void Dispose()
            {
                if (Interlocked.Exchange(ref _disposed, 1) == 0)
                {
                    Interlocked.Decrement(ref owner._active);
                }
            }
            public ValueTask DisposeAsync()
            {
                Dispose();
                return ValueTask.CompletedTask;
            }
        }
    }
}
