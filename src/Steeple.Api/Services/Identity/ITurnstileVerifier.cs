
namespace Steeple.Api.Services.Identity;
/// <summary>
/// Port: server-side verification of a Cloudflare Turnstile response token (the abuse gate on
/// public writable endpoints — SYSTEM_DESIGN §6). Implementations return true when the check is
/// disabled by configuration so environments without Cloudflare still work.
/// </summary>
public interface ITurnstileVerifier
{
    /// <summary>Verifies the client-supplied token; <paramref name="remoteIp"/> tightens the check when known.</summary>
    Task<bool> VerifyAsync(string? token, string? remoteIp, CancellationToken ct = default);
}
