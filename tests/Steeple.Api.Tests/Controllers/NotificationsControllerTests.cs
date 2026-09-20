using System.Security.Claims;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Steeple.Api.Controllers.Notifications;
using Steeple.Api.Proxies.Notifications;
using Microsoft.Extensions.Options;

namespace Steeple.Api.Tests.Controllers;

public class NotificationsControllerTests
{
    private static readonly DateTimeOffset Now = new(2026, 9, 5, 10, 0, 0, TimeSpan.Zero);

    [Fact]
    public async Task MarkRead_OneHundredIds_PassesTheWholePageToTheService()
    {
        var service = new RecordingNotificationService();
        var userId = Guid.NewGuid();
        var controller = CreateController(service, userId);
        var ids = Enumerable.Range(0, 100).Select(_ => Guid.NewGuid()).ToList();

        Assert.IsType<NoContentResult>(await controller.MarkRead(new MarkNotificationsReadRequest(ids), default));
        Assert.Equal(userId, service.UserId);
        Assert.Equal(ids, service.Ids);
    }

    [Fact]
    public async Task MarkRead_OneHundredAndOneIds_ReturnsClearValidationProblemWithoutCallingService()
    {
        var service = new RecordingNotificationService();
        var controller = CreateController(service, Guid.NewGuid());
        var ids = Enumerable.Range(0, 101).Select(_ => Guid.NewGuid()).ToList();

        var result = Assert.IsType<ObjectResult>(
            await controller.MarkRead(new MarkNotificationsReadRequest(ids), default));
        var problem = Assert.IsType<ProblemDetails>(result.Value);

        Assert.Equal(StatusCodes.Status400BadRequest, result.StatusCode);
        Assert.Equal("too_many_notification_ids", problem.Extensions["code"]);
        Assert.Contains("100", problem.Detail);
        Assert.Empty(service.Ids);
    }

    [Fact]
    public void MarkRead_HasSmallRequestBodyLimit()
    {
        var method = typeof(NotificationsController).GetMethod(nameof(NotificationsController.MarkRead))!;
        var limit = Assert.Single(method.CustomAttributes,
            attribute => attribute.AttributeType == typeof(RequestSizeLimitAttribute));
        var bytes = Assert.IsType<long>(Assert.Single(limit.ConstructorArguments).Value);

        Assert.InRange(bytes, 4 * 1024, 16 * 1024);
    }

    [Fact]
    public async Task Stream_RequiresPresentStrictlyFutureExpClaim()
    {
        var missing = CreateStreamController(expiry: null);
        var expired = CreateStreamController(expiry: Now);

        Assert.IsType<UnauthorizedResult>(await missing.Controller.Stream(default));
        Assert.IsType<UnauthorizedResult>(await expired.Controller.Stream(default));
        Assert.Equal(0, missing.Writer.Calls);
        Assert.Equal(0, expired.Writer.Calls);
    }

    [Fact]
    public async Task Stream_UnreadyReturnsCoded503AndRetryAfter()
    {
        var rig = CreateStreamController(Now.AddMinutes(1), ready: false);

        var result = Assert.IsType<ObjectResult>(await rig.Controller.Stream(default));
        var problem = Assert.IsType<ProblemDetails>(result.Value);

        Assert.Equal(StatusCodes.Status503ServiceUnavailable, result.StatusCode);
        Assert.Equal("notification_stream_unavailable", problem.Extensions["code"]);
        Assert.Equal("5", rig.Controller.Response.Headers.RetryAfter);
        Assert.Equal(0, rig.Writer.Calls);
    }

    [Fact]
    public async Task Stream_CapReturnsCoded429AndRetryAfter()
    {
        var stream = new InMemoryNotificationStream(Options.Create(new NotificationStreamOptions
        {
            MaxSubscriptionsPerUser = 1,
            MaxSubscriptionsPerProcess = 2,
        }));
        stream.MarkReady();
        var userId = Guid.NewGuid();
        using var occupied = stream.TrySubscribe(userId).Subscription!;
        var rig = CreateStreamController(Now.AddMinutes(1), stream: stream, userId: userId);

        var result = Assert.IsType<ObjectResult>(await rig.Controller.Stream(default));
        var problem = Assert.IsType<ProblemDetails>(result.Value);

        Assert.Equal(StatusCodes.Status429TooManyRequests, result.StatusCode);
        Assert.Equal("rate_limited", problem.Extensions["code"]);
        Assert.Equal("60", rig.Controller.Response.Headers.RetryAfter);
    }

    [Fact]
    public async Task Stream_ForwardsExpiryAndReleasesAdmissionAfterWriterReturns()
    {
        var expiresAt = Now.AddMinutes(1);
        var rig = CreateStreamController(expiresAt);

        Assert.IsType<EmptyResult>(await rig.Controller.Stream(default));

        Assert.Equal(1, rig.Writer.Calls);
        Assert.Equal(expiresAt, rig.Writer.ExpiresAt);
        Assert.Equal(0, rig.Stream.SubscriptionCount);
    }

    private static NotificationsController CreateController(INotificationService service, Guid userId)
    {
        var http = new DefaultHttpContext
        {
            User = new ClaimsPrincipal(new ClaimsIdentity([new Claim("sub", userId.ToString())], "test")),
        };
        var stream = new InMemoryNotificationStream(Options.Create(new NotificationStreamOptions()));
        stream.MarkReady();
        return new NotificationsController(service, stream, new RecordingWriter(), TimeProvider.System)
        {
            ControllerContext = new ControllerContext { HttpContext = http },
        };
    }

    private static StreamRig CreateStreamController(
        DateTimeOffset? expiry,
        bool ready = true,
        InMemoryNotificationStream? stream = null,
        Guid? userId = null)
    {
        var id = userId ?? Guid.NewGuid();
        var claims = new List<Claim> { new("sub", id.ToString()) };
        if (expiry is not null)
        {
            claims.Add(new Claim("exp", expiry.Value.ToUnixTimeSeconds().ToString(System.Globalization.CultureInfo.InvariantCulture)));
        }

        var http = new DefaultHttpContext
        {
            User = new ClaimsPrincipal(new ClaimsIdentity(claims, "test")),
        };
        stream ??= new InMemoryNotificationStream(Options.Create(new NotificationStreamOptions()));
        if (ready)
        {
            stream.MarkReady();
        }
        var writer = new RecordingWriter();
        var controller = new NotificationsController(
            new RecordingNotificationService(), stream, writer, new FixedTimeProvider(Now))
        {
            ControllerContext = new ControllerContext { HttpContext = http },
        };
        return new(controller, writer, stream);
    }

    private sealed class RecordingWriter : INotificationSseWriter
    {
        public int Calls { get; private set; }
        public DateTimeOffset ExpiresAt { get; private set; }

        public Task WriteAsync(
            HttpContext context,
            INotificationStreamSubscription subscription,
            DateTimeOffset tokenExpiresAt,
            CancellationToken cancellationToken)
        {
            Calls++;
            ExpiresAt = tokenExpiresAt;
            return Task.CompletedTask;
        }
    }

    private sealed class FixedTimeProvider(DateTimeOffset now) : TimeProvider
    {
        public override DateTimeOffset GetUtcNow() => now;
    }

    private sealed record StreamRig(
        NotificationsController Controller,
        RecordingWriter Writer,
        InMemoryNotificationStream Stream);

    private sealed class RecordingNotificationService : INotificationService
    {
        public Guid UserId { get; private set; }

        public IReadOnlyList<Guid> Ids { get; private set; } = [];

        public Task<NotificationListResult> GetPageAsync(
            Guid userId, string? after, int pageSize, CancellationToken ct = default) =>
            throw new NotSupportedException();

        public Task MarkReadAsync(Guid userId, IReadOnlyList<Guid> ids, CancellationToken ct = default)
        {
            UserId = userId;
            Ids = ids;
            return Task.CompletedTask;
        }
    }
}
