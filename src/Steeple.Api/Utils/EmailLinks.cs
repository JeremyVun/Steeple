
namespace Steeple.Api.Utils;
/// <summary>
/// Builds the email CTA URL for a notification deep link per the spine contract in
/// <c>docs/contracts/web.md</c>: <c>{Email:WebBaseUrl}/?goto=&lt;url-encoded deepLink&gt;</c> —
/// a query param, not a path, because the SPA ships no server-side routes.
/// </summary>
public static class EmailLinks
{
    /// <summary>
    /// The absolute CTA URL, or null when <paramref name="webBaseUrl"/> is unconfigured
    /// (emails then carry no links — the existing EmailOptions stance).
    /// </summary>
    public static string? Goto(string? webBaseUrl, string deepLink) =>
        string.IsNullOrEmpty(webBaseUrl)
            ? null
            : $"{webBaseUrl.TrimEnd('/')}/?goto={Uri.EscapeDataString(deepLink)}";

    /// <summary>A "\n\nOpen it here: {url}" email body suffix, or empty when links are unconfigured.</summary>
    public static string CtaLine(string? webBaseUrl, string deepLink) =>
        Goto(webBaseUrl, deepLink) is { } url ? $"\n\nOpen it here: {url}" : "";
}
