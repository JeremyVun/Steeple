namespace Steeple.Api.Utils;

/// <summary>Shared paging defaults for application and booking inboxes.</summary>
internal static class Paging
{
    internal static (int Page, int PageSize) Normalize(int page, int pageSize) =>
        (Math.Max(1, page), Math.Clamp(pageSize is 0 ? 24 : pageSize, 1, 100));
}
