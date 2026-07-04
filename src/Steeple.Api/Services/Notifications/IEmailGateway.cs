
namespace Steeple.Api.Services.Notifications;
/// <summary>
/// Port: transactional email delivery (SYSTEM_DESIGN §8 — a managed sender's HTTP API, never SMTP
/// from the droplet). Implementations must be safe to fire-and-forget: they throw only for
/// programming errors, and report delivery failures by logging.
/// </summary>
public interface IEmailGateway
{
    /// <summary>Sends one plain-text transactional email, best-effort.</summary>
    Task SendAsync(string toEmail, string subject, string textBody, CancellationToken ct = default);
}
