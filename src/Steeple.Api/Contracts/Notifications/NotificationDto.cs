using System.Text.Json;

namespace Steeple.Api.Contracts.Notifications;
/// <summary>
/// One inbox row (CONTRACTS §5 — the inbox is the payload of record; push/email only point here).
/// </summary>
/// <param name="Type">Wire token, e.g. <c>applicationReceived</c> — clients route unknown types to a generic row.</param>
/// <param name="Payload">The event's JSON document (ids + display fields for rendering/deep links).</param>
public record NotificationDto(
    Guid Id,
    string Type,
    DateTimeOffset CreatedAtUtc,
    DateTimeOffset? ReadAt,
    JsonElement Payload);

/// <summary>A cursor page of inbox rows, newest first. <c>NextCursor</c> null = no more.</summary>
public record NotificationListResult(IReadOnlyList<NotificationDto> Items, string? NextCursor);

/// <summary><c>POST /api/v1/me/notifications/read</c> body.</summary>
public record MarkNotificationsReadRequest(IReadOnlyList<Guid> Ids);
