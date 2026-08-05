using Steeple.Api.Services.Notifications;

namespace Steeple.Api.Proxies.Notifications;
/// <summary>
/// Development-only decorator over the real <see cref="IEmailGateway"/>: captures the send into
/// the dev mailbox, then delegates unchanged (log-only locally, since dev has no Resend key).
/// Delivery semantics are the inner gateway's — this only makes local mail readable and its CTAs
/// clickable. Never registered outside Development.
/// </summary>
public sealed class DevMailboxEmailGateway : IEmailGateway
{
    private readonly IEmailGateway _inner;
    private readonly IDevMailbox _mailbox;
    private readonly TimeProvider _clock;

    /// <summary>Wraps the real gateway with mailbox capture.</summary>
    public DevMailboxEmailGateway(IEmailGateway inner, IDevMailbox mailbox, TimeProvider clock)
    {
        _inner = inner;
        _mailbox = mailbox;
        _clock = clock;
    }

    /// <inheritdoc />
    public Task SendAsync(string toEmail, EmailContent content, CancellationToken ct = default)
    {
        _mailbox.Capture(toEmail, content, _clock.GetUtcNow());
        return _inner.SendAsync(toEmail, content, ct);
    }
}
