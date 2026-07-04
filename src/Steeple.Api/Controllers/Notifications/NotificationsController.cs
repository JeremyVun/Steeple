using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Steeple.Api.Contracts.Notifications;
using Steeple.Api.Services.Notifications;

namespace Steeple.Api.Controllers.Notifications;
/// <summary>
/// The signed-in user's notification inbox (CONTRACTS §5 — the inbox is the record of truth;
/// email/push only ever point here).
/// </summary>
[ApiController]
[Authorize]
[Route("api/v1/me/notifications")]
public sealed class NotificationsController : ControllerBase
{
    private readonly INotificationService _notifications;

    public NotificationsController(INotificationService notifications) => _notifications = notifications;

    /// <summary>A cursor page of inbox rows, newest first (<c>?after=</c> continues a previous page).</summary>
    [HttpGet]
    public async Task<ActionResult<NotificationListResult>> Get(
        [FromQuery] string? after, [FromQuery] int pageSize = 24, CancellationToken ct = default) =>
        Ok(await _notifications.GetPageAsync(User.GetUserId(), after, pageSize, ct));

    /// <summary>Marks rows read. Ids not belonging to the caller are ignored.</summary>
    [HttpPost("read")]
    public async Task<IActionResult> MarkRead([FromBody] MarkNotificationsReadRequest request, CancellationToken ct)
    {
        await _notifications.MarkReadAsync(User.GetUserId(), request.Ids ?? [], ct);
        return NoContent();
    }
}
