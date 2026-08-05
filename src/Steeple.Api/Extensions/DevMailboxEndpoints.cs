using System.Net;
using System.Text;
using System.Text.RegularExpressions;
using Steeple.Api.Services.Notifications;

namespace Steeple.Api.Extensions;

/// <summary>
/// The dev mailbox surface: a plain page listing every email this API "sent" and a detail view
/// with the body's links made clickable, so the local loop can follow a real CTA into the SPA.
/// Mapped only when <see cref="EmailOptions.DevMailboxEnabled"/> is set — deployed environments
/// never register the routes, so they 404 by construction (same shape as <c>Auth:DevLoginEnabled</c>).
/// </summary>
public static partial class DevMailboxEndpoints
{
    /// <summary>Maps <c>/dev/mailbox</c> (HTML + <c>.json</c> for harnesses) and its detail views.</summary>
    public static IEndpointRouteBuilder MapDevMailbox(this IEndpointRouteBuilder endpoints)
    {
        endpoints.MapGet("/dev/mailbox", (IDevMailbox mailbox) =>
            Results.Content(RenderList(mailbox.List()), "text/html; charset=utf-8"));

        // The machine-readable twin: web/mobile E2E loops assert on a real send without scraping.
        endpoints.MapGet("/dev/mailbox.json", (IDevMailbox mailbox, string? to) =>
            Results.Ok(mailbox.List()
                .Where(m => to is null || string.Equals(m.To, to, StringComparison.OrdinalIgnoreCase))
                .ToList()));

        endpoints.MapGet("/dev/mailbox/{id:guid}", (Guid id, IDevMailbox mailbox) =>
            mailbox.Get(id) is { } mail
                ? Results.Content(RenderDetail(mail), "text/html; charset=utf-8")
                : Results.NotFound());

        endpoints.MapGet("/dev/mailbox/{id:guid}.json", (Guid id, IDevMailbox mailbox) =>
            mailbox.Get(id) is { } mail ? Results.Ok(mail) : Results.NotFound());

        return endpoints;
    }

    private const string Style = """
        <style>
          :root { color-scheme: light; }
          body { margin: 0; padding: 2.5rem clamp(1rem, 6vw, 5rem);
                 font: 15px/1.6 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
                 color: #1f2421; background: #f6f4ef; }
          h1 { font-size: 1.25rem; letter-spacing: .02em; font-weight: 600; margin: 0 0 .25rem; }
          p.lede { margin: 0 0 2rem; color: #6b6f6a; }
          ol { list-style: none; margin: 0; padding: 0; }
          li { border-top: 1px solid #e2ded4; }
          li a.row { display: grid; grid-template-columns: 1fr auto; gap: .25rem 1rem;
                     padding: .9rem .25rem; text-decoration: none; color: inherit; }
          li a.row:hover { background: #efece4; }
          .subject { font-weight: 600; }
          .meta, time { color: #6b6f6a; font-size: .875rem; }
          pre { white-space: pre-wrap; word-break: break-word; background: #fff; border: 1px solid #e2ded4;
                border-radius: 6px; padding: 1.25rem; font: inherit; }
          a { color: #2f5d50; }
          .back { display: inline-block; margin-bottom: 1.5rem; font-size: .875rem; }
          .empty { color: #6b6f6a; font-style: italic; }
        </style>
        """;

    private static string RenderList(IReadOnlyList<CapturedEmail> mail)
    {
        var body = new StringBuilder();
        body.Append("<h1>Dev mailbox</h1><p class=\"lede\">Every email this API sent in development. ")
            .Append("Open one to follow its links.</p>");

        if (mail.Count == 0)
        {
            body.Append("<p class=\"empty\">Nothing sent yet.</p>");
            return Page("Dev mailbox", body.ToString());
        }

        body.Append("<ol>");
        foreach (var item in mail)
        {
            body.Append("<li><a class=\"row\" href=\"/dev/mailbox/").Append(item.Id).Append("\">")
                .Append("<span class=\"subject\">").Append(Escape(item.Subject)).Append("</span>")
                .Append("<time>").Append(item.SentAtUtc.ToString("MMM d, HH:mm:ss")).Append(" UTC</time>")
                .Append("<span class=\"meta\">").Append(Escape(item.To)).Append("</span>")
                .Append("</a></li>");
        }

        body.Append("</ol>");
        return Page("Dev mailbox", body.ToString());
    }

    private static string RenderDetail(CapturedEmail mail)
    {
        var body = new StringBuilder();
        body.Append("<a class=\"back\" href=\"/dev/mailbox\">&larr; All mail</a>")
            .Append("<h1>").Append(Escape(mail.Subject)).Append("</h1>")
            .Append("<p class=\"lede\">To ").Append(Escape(mail.To)).Append(" &middot; ")
            .Append(mail.SentAtUtc.ToString("MMM d, yyyy HH:mm:ss")).Append(" UTC</p>")
            .Append("<pre>").Append(Linkify(mail.TextBody)).Append("</pre>");

        if (!string.IsNullOrEmpty(mail.HtmlBody))
        {
            // The alternative part, rendered as the recipient's client would — dev-only surface,
            // and the content is our own composition, never user-supplied HTML.
            body.Append("<h1>HTML part</h1>").Append(mail.HtmlBody);
        }

        return Page(mail.Subject, body.ToString());
    }

    private static string Page(string title, string body) =>
        $"""
         <!doctype html><html lang="en"><head><meta charset="utf-8">
         <meta name="viewport" content="width=device-width, initial-scale=1">
         <title>{Escape(title)} · Steeple dev mailbox</title>{Style}</head><body>{body}</body></html>
         """;

    /// <summary>Escapes the body, then turns its bare URLs into anchors — CTAs must be clickable.</summary>
    private static string Linkify(string text) =>
        UrlPattern().Replace(Escape(text), m => $"<a href=\"{m.Value}\">{m.Value}</a>");

    private static string Escape(string value) => WebUtility.HtmlEncode(value);

    // Runs after HTML-escaping, so a trailing "&amp;…" query still belongs to the URL; only
    // whitespace and angle brackets end it.
    [GeneratedRegex(@"https?://[^\s<>""]+")]
    private static partial Regex UrlPattern();
}
