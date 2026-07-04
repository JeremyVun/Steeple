
namespace Steeple.Api.Services.Identity;
/// <summary>
/// Use-cases of the Identity module: SSO sign-in (verify → find-or-create → issue tokens),
/// refresh rotation with reuse detection, revocation, profile, agreements, and account deletion
/// (CONTRACTS §4, SYSTEM_DESIGN §6).
/// </summary>
public interface IIdentityService
{
    /// <summary>Exchanges a verified provider ID token for a Steeple session.</summary>
    Task<IdentityResult<SessionResponse>> CreateSessionAsync(CreateSessionRequest request, string? remoteIp, CancellationToken ct = default);

    /// <summary>Rotates a refresh token; reuse of a rotated token revokes its whole family.</summary>
    Task<IdentityResult<RefreshResponse>> RefreshAsync(string refreshToken, CancellationToken ct = default);

    /// <summary>Revokes the session (refresh-token family) identified by the access token's <c>sid</c>.</summary>
    Task RevokeSessionAsync(Guid sessionId, CancellationToken ct = default);

    /// <summary>Revokes every session the user holds ("sign out everywhere").</summary>
    Task RevokeAllSessionsAsync(Guid userId, CancellationToken ct = default);

    /// <summary>Profile + agreements. Null when the user is unknown or deleted.</summary>
    Task<MeResponse?> GetMeAsync(Guid userId, CancellationToken ct = default);

    /// <summary>Records acceptance of a legal document version. False when the doc type is unknown.</summary>
    Task<bool> RecordAgreementAsync(Guid userId, AcceptAgreementRequest request, CancellationToken ct = default);

    /// <summary>Deletes (anonymizes) the account and revokes all sessions.</summary>
    Task DeleteMeAsync(Guid userId, CancellationToken ct = default);
}

/// <summary>
/// Outcome of an identity use-case: either a value or a stable error code the controller maps to
/// ProblemDetails (CONTRACTS §2 error convention).
/// </summary>
public sealed record IdentityResult<T>(T? Value, IdentityError? Error) where T : class
{
    /// <summary>Successful outcome.</summary>
    public static IdentityResult<T> Ok(T value) => new(value, null);

    /// <summary>Failed outcome carrying the wire error code.</summary>
    public static IdentityResult<T> Fail(string code, string detail) => new(null, new IdentityError(code, detail));
}

/// <summary>A stable wire error code (e.g. <c>invalid_id_token</c>) plus a human-readable detail.</summary>
public sealed record IdentityError(string Code, string Detail);

/// <summary>The stable identity error codes documented in CONTRACTS §4.</summary>
public static class IdentityErrorCodes
{
    /// <summary>The provider ID token failed verification (signature, audience, expiry, nonce).</summary>
    public const string InvalidIdToken = "invalid_id_token";

    /// <summary>Turnstile verification failed or the token was missing while enabled.</summary>
    public const string TurnstileFailed = "turnstile_failed";

    /// <summary>The refresh token is unknown or expired.</summary>
    public const string InvalidRefreshToken = "invalid_refresh_token";

    /// <summary>A rotated refresh token was presented again — the family has been revoked.</summary>
    public const string TokenReuse = "token_reuse";

    /// <summary>The email already belongs to an account created with a different provider.</summary>
    public const string UseOriginalProvider = "use_original_provider";
}
