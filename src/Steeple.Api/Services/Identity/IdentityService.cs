using Microsoft.Extensions.Options;

namespace Steeple.Api.Services.Identity;
/// <summary>
/// Default <see cref="IIdentityService"/>: verifies provider ID tokens through the per-provider
/// verifier ports, finds-or-creates the user by (provider, subject), and manages the API's own
/// token pair — short-lived access JWTs plus rotating, hashed refresh tokens with family-wide
/// reuse revocation (SYSTEM_DESIGN §6).
/// </summary>
public sealed class IdentityService : IIdentityService
{
    private readonly IIdentityRepository _repository;
    private readonly IEnumerable<IIdTokenVerifier> _verifiers;
    private readonly IAccessTokenIssuer _accessTokens;
    private readonly ITurnstileVerifier _turnstile;
    private readonly IAnalyticsSink _analytics;
    private readonly AuthOptions _options;
    private readonly TimeProvider _clock;

    /// <summary>Creates the service from its ports.</summary>
    public IdentityService(
        IIdentityRepository repository,
        IEnumerable<IIdTokenVerifier> verifiers,
        IAccessTokenIssuer accessTokens,
        ITurnstileVerifier turnstile,
        IAnalyticsSink analytics,
        IOptions<AuthOptions> options,
        TimeProvider clock)
    {
        _repository = repository;
        _verifiers = verifiers;
        _accessTokens = accessTokens;
        _turnstile = turnstile;
        _analytics = analytics;
        _options = options.Value;
        _clock = clock;
    }

    /// <inheritdoc />
    public async Task<IdentityResult<SessionResponse>> CreateSessionAsync(
        CreateSessionRequest request, string? remoteIp, CancellationToken ct = default)
    {
        if (!TryParseProvider(request.Provider, out var provider))
        {
            return IdentityResult<SessionResponse>.Fail(
                IdentityErrorCodes.InvalidIdToken, $"Unknown provider '{request.Provider}'.");
        }

        if (!await _turnstile.VerifyAsync(request.TurnstileToken, remoteIp, ct).ConfigureAwait(false))
        {
            return IdentityResult<SessionResponse>.Fail(
                IdentityErrorCodes.TurnstileFailed, "Turnstile verification failed.");
        }

        var verifier = _verifiers.FirstOrDefault(v => v.Provider == provider)
            ?? throw new InvalidOperationException($"No ID-token verifier registered for {provider}.");

        var identity = await verifier.VerifyAsync(request.IdToken, request.Nonce, ct).ConfigureAwait(false);
        if (identity is null)
        {
            return IdentityResult<SessionResponse>.Fail(
                IdentityErrorCodes.InvalidIdToken, "The ID token could not be verified.");
        }

        var login = await _repository.FindLoginAsync(provider, identity.Subject, ct).ConfigureAwait(false);
        var isNewUser = login is null;
        User user;

        if (login?.User is { } existing)
        {
            if (existing.DeletedAtUtc is not null)
            {
                // Anonymized accounts keep no logins, so this is a defensive gate only.
                return IdentityResult<SessionResponse>.Fail(
                    IdentityErrorCodes.InvalidIdToken, "This account has been deleted.");
            }

            user = existing;
        }
        else
        {
            // Same verified email on a second provider: point the person at their original
            // provider rather than silently creating a doppelgänger account (SYSTEM_DESIGN §6 —
            // auto-linking is deliberately deferred).
            if (identity.Email is { Length: > 0 } email
                && await _repository.EmailBelongsToAnotherUserAsync(email, ct).ConfigureAwait(false))
            {
                return IdentityResult<SessionResponse>.Fail(
                    IdentityErrorCodes.UseOriginalProvider,
                    "An account with this email already exists — sign in with the provider you first used.");
            }

            var now = _clock.GetUtcNow();
            user = new User
            {
                Id = Guid.NewGuid(),
                // Apple sends the name once in the authorization response (the request hint),
                // never in the ID token — persist whatever we get on first auth (PRD caveat).
                DisplayName = FirstNonEmpty(identity.DisplayName, request.DisplayName, EmailLocalPart(identity.Email)) ?? "Neighbor",
                Email = identity.Email,
                CreatedAtUtc = now,
            };
            var newLogin = new UserLogin
            {
                Id = Guid.NewGuid(),
                UserId = user.Id,
                Provider = provider,
                Subject = identity.Subject,
                CreatedAtUtc = now,
            };
            await _repository.CreateUserWithLoginAsync(user, newLogin, ct).ConfigureAwait(false);
        }

        var (refreshToken, accessToken, familyId) = await IssueTokenPairAsync(user, request.Device, ct).ConfigureAwait(false);

        await TrackSafelyAsync(
            "sso_completed",
            new
            {
                provider = request.Provider,
                surface = request.Device?.Platform,
                isNewUser,
            },
            ct).ConfigureAwait(false);

        return IdentityResult<SessionResponse>.Ok(new SessionResponse(
            AccessToken: accessToken,
            RefreshToken: refreshToken,
            User: ToUserDto(user),
            IsNewUser: isNewUser));
    }

    /// <inheritdoc />
    public async Task<IdentityResult<RefreshResponse>> RefreshAsync(string refreshToken, CancellationToken ct = default)
    {
        var presented = await _repository
            .FindRefreshTokenAsync(RefreshTokenCrypto.HashToken(refreshToken), ct)
            .ConfigureAwait(false);

        if (presented is null)
        {
            return IdentityResult<RefreshResponse>.Fail(
                IdentityErrorCodes.InvalidRefreshToken, "Unknown refresh token.");
        }

        var now = _clock.GetUtcNow();

        if (presented.RevokedAtUtc is not null)
        {
            // A rotated (or signed-out) token came back: someone is replaying it. Kill every
            // descendant so a stolen token can't keep a session alive.
            await _repository.RevokeFamilyAsync(presented.FamilyId, ct).ConfigureAwait(false);
            return IdentityResult<RefreshResponse>.Fail(
                IdentityErrorCodes.TokenReuse, "Refresh token reuse detected; the session has been revoked.");
        }

        if (presented.ExpiresAtUtc <= now || presented.User is null || presented.User.DeletedAtUtc is not null)
        {
            return IdentityResult<RefreshResponse>.Fail(
                IdentityErrorCodes.InvalidRefreshToken, "The refresh token has expired.");
        }

        var nextToken = RefreshTokenCrypto.GenerateToken();
        var next = new RefreshToken
        {
            Id = Guid.NewGuid(),
            UserId = presented.UserId,
            FamilyId = presented.FamilyId,
            TokenHash = RefreshTokenCrypto.HashToken(nextToken),
            DeviceLabel = presented.DeviceLabel,
            Platform = presented.Platform,
            CreatedAtUtc = now,
            ExpiresAtUtc = now.AddDays(_options.RefreshTokenDays),
        };
        presented.RevokedAtUtc = now;
        await _repository.ReplaceRefreshTokenAsync(presented, next, ct).ConfigureAwait(false);

        var accessToken = _accessTokens.IssueAccessToken(presented.User, presented.FamilyId);
        return IdentityResult<RefreshResponse>.Ok(new RefreshResponse(accessToken, nextToken));
    }

    /// <inheritdoc />
    public Task RevokeSessionAsync(Guid sessionId, CancellationToken ct = default) =>
        _repository.RevokeFamilyAsync(sessionId, ct);

    /// <inheritdoc />
    public Task RevokeAllSessionsAsync(Guid userId, CancellationToken ct = default) =>
        _repository.RevokeAllForUserAsync(userId, ct);

    /// <inheritdoc />
    public async Task<MeResponse?> GetMeAsync(Guid userId, CancellationToken ct = default)
    {
        var user = await _repository.GetUserAsync(userId, ct).ConfigureAwait(false);
        if (user is null || user.DeletedAtUtc is not null)
        {
            return null;
        }

        var agreements = user.Agreements
            .OrderBy(a => a.AcceptedAtUtc)
            .Select(a => new AgreementDto(
                FlagEnumExtensions.ToCamelCaseToken(a.DocType.ToString()),
                a.Version,
                a.AcceptedAtUtc))
            .ToList();

        return new MeResponse(user.Id, user.DisplayName, user.Email, user.CreatedAtUtc, agreements);
    }

    /// <inheritdoc />
    public async Task<bool> RecordAgreementAsync(Guid userId, AcceptAgreementRequest request, CancellationToken ct = default)
    {
        if (!Enum.TryParse<AgreementDocType>(request.DocType, ignoreCase: true, out var docType)
            || string.IsNullOrWhiteSpace(request.Version))
        {
            return false;
        }

        await _repository.RecordAgreementAsync(userId, docType, request.Version.Trim(), ct).ConfigureAwait(false);
        return true;
    }

    /// <inheritdoc />
    public Task DeleteMeAsync(Guid userId, CancellationToken ct = default) =>
        _repository.AnonymizeUserAsync(userId, ct);

    /// <summary>Creates a fresh refresh-token family for a sign-in and issues the paired access token.</summary>
    private async Task<(string RefreshToken, string AccessToken, Guid FamilyId)> IssueTokenPairAsync(
        User user, DeviceInfoDto? device, CancellationToken ct)
    {
        var now = _clock.GetUtcNow();
        var familyId = Guid.NewGuid();
        var refreshToken = RefreshTokenCrypto.GenerateToken();

        await _repository.AddRefreshTokenAsync(
            new RefreshToken
            {
                Id = Guid.NewGuid(),
                UserId = user.Id,
                FamilyId = familyId,
                TokenHash = RefreshTokenCrypto.HashToken(refreshToken),
                DeviceLabel = device?.Label,
                Platform = device?.Platform,
                CreatedAtUtc = now,
                ExpiresAtUtc = now.AddDays(_options.RefreshTokenDays),
            },
            ct).ConfigureAwait(false);

        return (refreshToken, _accessTokens.IssueAccessToken(user, familyId), familyId);
    }

    private static SessionUserDto ToUserDto(User user) =>
        new(user.Id, user.DisplayName, user.Email, user.CreatedAtUtc);

    private static bool TryParseProvider(string? provider, out AuthProvider parsed) =>
        Enum.TryParse(provider, ignoreCase: true, out parsed) && Enum.IsDefined(parsed);

    private static string? FirstNonEmpty(params string?[] candidates) =>
        candidates.FirstOrDefault(c => !string.IsNullOrWhiteSpace(c))?.Trim();

    private static string? EmailLocalPart(string? email)
    {
        var at = email?.IndexOf('@') ?? -1;
        return at > 0 ? email![..at] : null;
    }

    /// <summary>Best-effort analytics — never a reason to fail sign-in.</summary>
    private async Task TrackSafelyAsync(string eventType, object payload, CancellationToken ct)
    {
        try
        {
            await _analytics.TrackAsync(eventType, payload, sessionId: null, ct).ConfigureAwait(false);
        }
        catch
        {
            // Best-effort: never throw from analytics.
        }
    }
}
