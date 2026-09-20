using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Globalization;
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
    private const int MaxReadIds = 100;
    private const long MaxReadBodyBytes = 8 * 1024;

    private readonly INotificationService _notifications;
    private readonly INotificationStream _stream;
    private readonly INotificationSseWriter _writer;
    private readonly TimeProvider _clock;

    public NotificationsController(
        INotificationService notifications,
        INotificationStream stream,
        INotificationSseWriter writer,
        TimeProvider clock)
    {
        _notifications = notifications;
        _stream = stream;
        _writer = writer;
        _clock = clock;
    }

    /// <summary>A cursor page of inbox rows, newest first (<c>?after=</c> continues a previous page).</summary>
    [HttpGet]
    public async Task<ActionResult<NotificationListResult>> Get(
        [FromQuery] string? after, [FromQuery] int pageSize = 24, CancellationToken ct = default) =>
        Ok(await _notifications.GetPageAsync(User.GetUserId(), after, pageSize, ct));

    [HttpGet("stream")]
    public async Task<IActionResult> Stream(CancellationToken ct)
    {
        if (!TryGetTokenExpiry(out var expiresAt) || expiresAt <= _clock.GetUtcNow())
        {
            return Unauthorized();
        }

        var admission = _stream.TrySubscribe(User.GetUserId());
        if (admission.Status == NotificationStreamAdmissionStatus.Unavailable)
        {
            Response.Headers.RetryAfter = "5";
            return Problem(
                statusCode: StatusCodes.Status503ServiceUnavailable,
                extensions: new Dictionary<string, object?> { ["code"] = "notification_stream_unavailable" });
        }

        if (admission.Status is NotificationStreamAdmissionStatus.UserLimitReached
            or NotificationStreamAdmissionStatus.ProcessLimitReached)
        {
            Response.Headers.RetryAfter = "60";
            return Problem(
                statusCode: StatusCodes.Status429TooManyRequests,
                extensions: new Dictionary<string, object?> { ["code"] = "rate_limited" });
        }

        using (admission.Subscription!)
        {
            await _writer.WriteAsync(HttpContext, admission.Subscription!, expiresAt, ct).ConfigureAwait(false);
        }

        return new EmptyResult();
    }

    /// <summary>Marks rows read. Ids not belonging to the caller are ignored.</summary>
    [HttpPost("read")]
    [RequestSizeLimit(MaxReadBodyBytes)]
    public async Task<IActionResult> MarkRead([FromBody] MarkNotificationsReadRequest request, CancellationToken ct)
    {
        var ids = request.Ids ?? [];
        if (ids.Count > MaxReadIds)
        {
            return Problem(
                detail: $"At most {MaxReadIds} notification ids may be marked read at once.",
                statusCode: StatusCodes.Status400BadRequest,
                extensions: new Dictionary<string, object?> { ["code"] = "too_many_notification_ids" });
        }

        await _notifications.MarkReadAsync(User.GetUserId(), ids, ct);
        return NoContent();
    }

    private bool TryGetTokenExpiry(out DateTimeOffset expiresAt)
    {
        expiresAt = default;
        var raw = User.FindFirst("exp")?.Value;
        if (!long.TryParse(raw, NumberStyles.None, CultureInfo.InvariantCulture, out var seconds))
        {
            return false;
        }

        try
        {
            expiresAt = DateTimeOffset.FromUnixTimeSeconds(seconds);
            return true;
        }
        catch (ArgumentOutOfRangeException)
        {
            return false;
        }
    }
}
