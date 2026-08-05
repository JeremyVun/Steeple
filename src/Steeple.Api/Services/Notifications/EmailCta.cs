using System.Net;

namespace Steeple.Api.Services.Notifications;
/// <summary>
/// The one call-to-action line every transactional email ends with. The web SPA ships no
/// server-side routes (nginx soft-404s unknown paths), so deep links travel as a query param —
/// <c>{Email:WebBaseUrl}/?goto=&lt;url-encoded deepLink&gt;</c>, the grammar in
/// <c>docs/contracts/web.md</c>. The notification payload's own <c>deepLink</c> is the single
/// source of where a mail points, so email, push and the inbox row can never disagree.
/// </summary>
public static class EmailCta
{
    /// <summary>Where a mail points when its payload carries no deep link of its own.</summary>
    private const string InboxDeepLink = "/inbox";

    /// <summary>
    /// The absolute goto URL for a deep link, or null when no public web origin is configured
    /// (log-only/dev-provider environments: emails then carry no links, as they did before).
    /// </summary>
    public static string? BuildUrl(string? webBaseUrl, string? deepLink)
    {
        if (string.IsNullOrWhiteSpace(webBaseUrl))
        {
            return null;
        }

        var target = string.IsNullOrWhiteSpace(deepLink) ? InboxDeepLink : deepLink!.Trim();
        return $"{webBaseUrl.TrimEnd('/')}/?goto={Uri.EscapeDataString(target)}";
    }

    /// <summary>The CTA's plain-text line, e.g. <c>Open the booking: https://…/?goto=%2Fbookings%2F…</c>.</summary>
    public static string TextLine(NotificationType type, string url) => $"{Label(type)}: {url}";

    /// <summary>The CTA as an anchor, for the optional HTML alternative part.</summary>
    public static string HtmlLine(NotificationType type, string url) =>
        $"<p><a href=\"{WebUtility.HtmlEncode(url)}\">{WebUtility.HtmlEncode(Label(type))}</a></p>";

    /// <summary>What the link says it opens — the recipient's own view of the thing that changed.</summary>
    private static string Label(NotificationType type) => type switch
    {
        NotificationType.ApplicationReceived
            or NotificationType.ApplicationMessage
            or NotificationType.ApplicationApproved
            or NotificationType.ApplicationDeclined
            or NotificationType.CounterOfferReceived
            or NotificationType.CounterOfferAccepted
            or NotificationType.CounterOfferDeclined => "Open the request",
        NotificationType.BookingCancelled
            or NotificationType.RenewalDue
            or NotificationType.RatingReceived
            or NotificationType.BookingReminder => "Open the booking",
        NotificationType.ListingApproved or NotificationType.ListingDeclined => "Open your space",
        _ => "Open Steeple",
    };
}
