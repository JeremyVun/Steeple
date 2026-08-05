
namespace Steeple.Api.Services.Notifications;
/// <summary>
/// Port: transactional email delivery (SYSTEM_DESIGN §8 — a managed sender's HTTP API, never SMTP
/// from the droplet). Implementations must be safe to fire-and-forget: they throw only for
/// programming errors, and report delivery failures by logging.
/// </summary>
public interface IEmailGateway
{
    /// <summary>
    /// Sends one transactional email, best-effort. The content arrives fully composed (CTA line
    /// included) — a gateway is transport only and never edits a body.
    /// </summary>
    Task SendAsync(string toEmail, EmailContent content, CancellationToken ct = default);
}
