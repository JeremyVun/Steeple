
namespace Steeple.Api.Services.Notifications;
/// <summary>
/// Port: transactional email delivery (SYSTEM_DESIGN §8 — a managed sender's HTTP API, never SMTP
/// from the droplet). Implementations return only when the provider accepts the message and throw
/// on retryable rejection/transport failure so the outbox worker can persist retry state.
/// </summary>
public interface IEmailGateway
{
    /// <summary>
    /// Sends one transactional email. The content arrives fully composed (CTA line included) — a
    /// gateway is transport only and never edits a body.
    /// </summary>
    Task SendAsync(string toEmail, EmailContent content, CancellationToken ct = default);
}
