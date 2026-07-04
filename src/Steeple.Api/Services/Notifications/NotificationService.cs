using System.Globalization;
using System.Text;
using System.Text.Json;
using Steeple.Api.Contracts.Notifications;

namespace Steeple.Api.Services.Notifications;
/// <summary>
/// Default <see cref="INotificationService"/>: cursor-paginated inbox reads (newest first) and
/// mark-as-read. The cursor is an opaque base64url token encoding the last row's
/// (CreatedAtUtc, Id) position — stable under concurrent inserts, unlike offset paging.
/// </summary>
public sealed class NotificationService : INotificationService
{
    private const int MaxPageSize = 100;
    private const int DefaultPageSize = 24;

    private readonly INotificationRepository _repository;

    /// <summary>Creates the service over its repository port.</summary>
    public NotificationService(INotificationRepository repository) => _repository = repository;

    /// <inheritdoc />
    public async Task<NotificationListResult> GetPageAsync(Guid userId, string? after, int pageSize, CancellationToken ct = default)
    {
        pageSize = Math.Clamp(pageSize is 0 ? DefaultPageSize : pageSize, 1, MaxPageSize);

        // An unreadable cursor (tampered / from a future format) just reads from the top.
        var (beforeCreatedAt, beforeId) = DecodeCursor(after);

        // Fetch one extra row to learn whether another page exists without a count query.
        var rows = await _repository
            .GetPageAsync(userId, beforeCreatedAt, beforeId, pageSize + 1, ct)
            .ConfigureAwait(false);

        var page = rows.Take(pageSize).ToList();
        var items = page.Select(ToDto).ToList();
        var nextCursor = rows.Count > pageSize && page.Count > 0
            ? EncodeCursor(page[^1].CreatedAtUtc, page[^1].Id)
            : null;

        return new NotificationListResult(items, nextCursor);
    }

    /// <inheritdoc />
    public Task MarkReadAsync(Guid userId, IReadOnlyList<Guid> ids, CancellationToken ct = default) =>
        ids.Count == 0 ? Task.CompletedTask : _repository.MarkReadAsync(userId, ids, ct);

    private static NotificationDto ToDto(Notification row)
    {
        JsonElement payload;
        try
        {
            using var doc = JsonDocument.Parse(row.PayloadJson);
            payload = doc.RootElement.Clone();
        }
        catch (JsonException)
        {
            // A corrupt payload must not take the whole inbox down — degrade to an empty object.
            using var empty = JsonDocument.Parse("{}");
            payload = empty.RootElement.Clone();
        }

        return new NotificationDto(
            row.Id,
            FlagEnumExtensions.ToCamelCaseToken(row.Type.ToString()),
            row.CreatedAtUtc,
            row.ReadAtUtc,
            payload);
    }

    private static string EncodeCursor(DateTimeOffset createdAtUtc, Guid id)
    {
        var raw = $"{createdAtUtc.UtcTicks.ToString(CultureInfo.InvariantCulture)}|{id:N}";
        return Convert.ToBase64String(Encoding.ASCII.GetBytes(raw))
            .TrimEnd('=').Replace('+', '-').Replace('/', '_');
    }

    private static (DateTimeOffset? BeforeCreatedAt, Guid? BeforeId) DecodeCursor(string? cursor)
    {
        if (string.IsNullOrEmpty(cursor))
        {
            return (null, null);
        }

        try
        {
            var padded = cursor.Replace('-', '+').Replace('_', '/');
            padded += new string('=', (4 - padded.Length % 4) % 4);
            var raw = Encoding.ASCII.GetString(Convert.FromBase64String(padded));
            var parts = raw.Split('|');
            if (parts.Length == 2
                && long.TryParse(parts[0], NumberStyles.None, CultureInfo.InvariantCulture, out var ticks)
                && Guid.TryParseExact(parts[1], "N", out var id))
            {
                return (new DateTimeOffset(ticks, TimeSpan.Zero), id);
            }
        }
        catch (FormatException)
        {
            // Fall through — unreadable cursors read from the top.
        }

        return (null, null);
    }
}
