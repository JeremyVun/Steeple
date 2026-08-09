using System.Security.Claims;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Steeple.Api.Controllers.Notifications;

namespace Steeple.Api.Tests.Controllers;

public class NotificationsControllerTests
{
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

    private static NotificationsController CreateController(INotificationService service, Guid userId)
    {
        var http = new DefaultHttpContext
        {
            User = new ClaimsPrincipal(new ClaimsIdentity([new Claim("sub", userId.ToString())], "test")),
        };
        return new NotificationsController(service)
        {
            ControllerContext = new ControllerContext { HttpContext = http },
        };
    }

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
