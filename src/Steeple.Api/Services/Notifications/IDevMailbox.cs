namespace Steeple.Api.Services.Notifications;
/// <summary>
/// Development-only capture of everything the API "sends". Local environments have no real
/// mailbox, so a send would otherwise only exist as a log line — nobody can click a CTA in a log.
/// Registered exclusively when <see cref="EmailOptions.DevMailboxEnabled"/> is set, which base
/// appsettings omits by construction (same shape as <c>Auth:DevLoginEnabled</c>).
/// </summary>
public interface IDevMailbox
{
    /// <summary>Records one delivered email. Never throws — capture must not break a send.</summary>
    void Capture(string toEmail, EmailContent content, DateTimeOffset sentAtUtc);

    /// <summary>Everything captured, newest first.</summary>
    IReadOnlyList<CapturedEmail> List();

    /// <summary>One captured email, or null when unknown (or aged out of the ring).</summary>
    CapturedEmail? Get(Guid id);
}

/// <summary>One captured send, as the dev mailbox surfaces it.</summary>
/// <param name="Id">Stable id for the detail view.</param>
/// <param name="To">Recipient address.</param>
/// <param name="Subject">Subject line.</param>
/// <param name="TextBody">Plain-text part, CTA line included.</param>
/// <param name="HtmlBody">HTML alternative part when the composition supplied one.</param>
/// <param name="SentAtUtc">When the gateway handed it off.</param>
public sealed record CapturedEmail(
    Guid Id, string To, string Subject, string TextBody, string? HtmlBody, DateTimeOffset SentAtUtc);
