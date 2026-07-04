using Microsoft.Extensions.Options;

namespace Steeple.Api.Tests.Services;
/// <summary>
/// Unit tests for <see cref="IdentityService"/>: SSO sign-in (find-or-create), refresh-token
/// rotation with reuse detection, and the profile/agreement/deletion use-cases (SYSTEM_DESIGN
/// §6). Repository, ID-token verifier, access-token issuer, turnstile verifier and clock are all
/// hand-rolled in-memory fakes, matching the no-mocking-library idiom used elsewhere in this
/// test project (see <c>ListingServiceTests</c>).
/// </summary>
public class IdentityServiceTests
{
    private static readonly DateTimeOffset FixedNow = new(2026, 7, 4, 12, 0, 0, TimeSpan.Zero);

    [Fact]
    public async Task CreateSessionAsync_NewIdentity_UsesVerifiedTokenDisplayName()
    {
        var repo = new FakeIdentityRepository(FixedNow);
        var service = CreateService(repo, out _, out _,
            resolve: _ => new VerifiedIdentity("google-sub-1", "person@example.com", "Alex Person"));

        var result = await service.CreateSessionAsync(
            Request(displayName: "Ignored Hint"), remoteIp: "1.2.3.4");

        Assert.Null(result.Error);
        Assert.NotNull(result.Value);
        Assert.True(result.Value!.IsNewUser);
        Assert.Equal("Alex Person", result.Value.User.DisplayName);
        Assert.Equal("person@example.com", result.Value.User.Email);
        Assert.NotEmpty(result.Value.AccessToken);
        Assert.NotEmpty(result.Value.RefreshToken);
        Assert.Single(repo.Users);
        Assert.Single(repo.Logins);
    }

    [Fact]
    public async Task CreateSessionAsync_NoTokenName_FallsBackToRequestDisplayNameHint()
    {
        // Apple never carries a name in the ID token — only the request-supplied hint from the
        // authorization response, honored on first sign-in only.
        var repo = new FakeIdentityRepository(FixedNow);
        var service = CreateService(repo, out _, out _,
            resolve: _ => new VerifiedIdentity("apple-sub-1", "private@relay.appleid.com", null),
            provider: AuthProvider.Apple);

        var result = await service.CreateSessionAsync(
            Request(provider: "apple", displayName: "Jordan Hint"), remoteIp: null);

        Assert.Equal("Jordan Hint", result.Value!.User.DisplayName);
    }

    [Fact]
    public async Task CreateSessionAsync_NoNameOrHint_FallsBackToEmailLocalPart()
    {
        var repo = new FakeIdentityRepository(FixedNow);
        var service = CreateService(repo, out _, out _,
            resolve: _ => new VerifiedIdentity("google-sub-2", "sam.taylor@example.com", null));

        var result = await service.CreateSessionAsync(Request(), remoteIp: null);

        Assert.Equal("sam.taylor", result.Value!.User.DisplayName);
    }

    [Fact]
    public async Task CreateSessionAsync_NoNameHintOrEmail_FallsBackToNeighbor()
    {
        var repo = new FakeIdentityRepository(FixedNow);
        var service = CreateService(repo, out _, out _,
            resolve: _ => new VerifiedIdentity("apple-sub-2", null, null),
            provider: AuthProvider.Apple);

        var result = await service.CreateSessionAsync(Request(provider: "apple"), remoteIp: null);

        Assert.Equal("Neighbor", result.Value!.User.DisplayName);
    }

    [Fact]
    public async Task CreateSessionAsync_ExistingLogin_ReturnsExistingUserAndIsNewUserFalse()
    {
        var repo = new FakeIdentityRepository(FixedNow);
        var existing = new User { Id = Guid.NewGuid(), DisplayName = "Returning Person", CreatedAtUtc = FixedNow };
        repo.Users.Add(existing);
        repo.Logins.Add(new UserLogin
        {
            Id = Guid.NewGuid(),
            UserId = existing.Id,
            Provider = AuthProvider.Google,
            Subject = "google-sub-3",
            CreatedAtUtc = FixedNow,
            User = existing,
        });
        var service = CreateService(repo, out _, out _,
            resolve: _ => new VerifiedIdentity("google-sub-3", "person@example.com", "Alex Person"));

        var result = await service.CreateSessionAsync(Request(), remoteIp: null);

        Assert.Null(result.Error);
        Assert.False(result.Value!.IsNewUser);
        Assert.Equal(existing.Id, result.Value.User.Id);
        Assert.Single(repo.Users); // no doppelganger created
    }

    [Fact]
    public async Task CreateSessionAsync_UnknownProvider_ReturnsInvalidIdToken()
    {
        var repo = new FakeIdentityRepository(FixedNow);
        var service = CreateService(repo, out _, out _, resolve: _ => new VerifiedIdentity("s", null, null));

        var result = await service.CreateSessionAsync(Request(provider: "facebook"), remoteIp: null);

        Assert.Null(result.Value);
        Assert.Equal(IdentityErrorCodes.InvalidIdToken, result.Error!.Code);
    }

    [Fact]
    public async Task CreateSessionAsync_VerifierRejectsToken_ReturnsInvalidIdToken()
    {
        var repo = new FakeIdentityRepository(FixedNow);
        var service = CreateService(repo, out _, out _, resolve: _ => null);

        var result = await service.CreateSessionAsync(Request(), remoteIp: null);

        Assert.Null(result.Value);
        Assert.Equal(IdentityErrorCodes.InvalidIdToken, result.Error!.Code);
    }

    [Fact]
    public async Task CreateSessionAsync_TurnstileFails_ReturnsTurnstileFailed()
    {
        var repo = new FakeIdentityRepository(FixedNow);
        var service = CreateService(repo, out _, out var turnstile,
            resolve: _ => new VerifiedIdentity("google-sub-4", "person@example.com", "Alex"));
        turnstile.ShouldPass = false;

        var result = await service.CreateSessionAsync(Request(), remoteIp: null);

        Assert.Null(result.Value);
        Assert.Equal(IdentityErrorCodes.TurnstileFailed, result.Error!.Code);
        Assert.Empty(repo.Users);
    }

    [Fact]
    public async Task CreateSessionAsync_EmailAlreadyBoundToAnotherUser_ReturnsUseOriginalProvider()
    {
        var repo = new FakeIdentityRepository(FixedNow);
        repo.Users.Add(new User
        {
            Id = Guid.NewGuid(),
            DisplayName = "Original Signup",
            Email = "shared@example.com",
            CreatedAtUtc = FixedNow,
        });
        // No login recorded for the new provider, so this hits the doppelganger-avoidance gate.
        var service = CreateService(repo, out _, out _,
            resolve: _ => new VerifiedIdentity("google-sub-5", "shared@example.com", "Someone"));

        var result = await service.CreateSessionAsync(Request(), remoteIp: null);

        Assert.Null(result.Value);
        Assert.Equal(IdentityErrorCodes.UseOriginalProvider, result.Error!.Code);
        Assert.Single(repo.Users); // no second account created
    }

    [Fact]
    public async Task RefreshAsync_ValidToken_RotatesAndNewTokenKeepsWorking()
    {
        var repo = new FakeIdentityRepository(FixedNow);
        var service = CreateService(repo, out _, out _,
            resolve: _ => new VerifiedIdentity("google-sub-6", "person@example.com", "Alex"));
        var session = await service.CreateSessionAsync(Request(), remoteIp: null);
        var token1 = session.Value!.RefreshToken;

        var refreshed1 = await service.RefreshAsync(token1);
        Assert.Null(refreshed1.Error);
        var token2 = refreshed1.Value!.RefreshToken;
        Assert.NotEqual(token1, token2);

        var refreshed2 = await service.RefreshAsync(token2);

        Assert.Null(refreshed2.Error);
        Assert.NotNull(refreshed2.Value);
        Assert.NotEmpty(refreshed2.Value!.AccessToken);
    }

    [Fact]
    public async Task RefreshAsync_UnknownToken_ReturnsInvalidRefreshToken()
    {
        var repo = new FakeIdentityRepository(FixedNow);
        var service = CreateService(repo, out _, out _, resolve: _ => null);

        var result = await service.RefreshAsync("never-issued-token");

        Assert.Null(result.Value);
        Assert.Equal(IdentityErrorCodes.InvalidRefreshToken, result.Error!.Code);
    }

    [Fact]
    public async Task RefreshAsync_ReplayOfRotatedToken_ReturnsTokenReuseAndRevokesWholeFamily()
    {
        var repo = new FakeIdentityRepository(FixedNow);
        var service = CreateService(repo, out _, out _,
            resolve: _ => new VerifiedIdentity("google-sub-7", "person@example.com", "Alex"));
        var session = await service.CreateSessionAsync(Request(), remoteIp: null);
        var token1 = session.Value!.RefreshToken;
        var rotated = await service.RefreshAsync(token1);
        var token2 = rotated.Value!.RefreshToken;

        // Replaying the already-rotated token1 is theft evidence.
        var reuse = await service.RefreshAsync(token1);

        Assert.Null(reuse.Value);
        Assert.Equal(IdentityErrorCodes.TokenReuse, reuse.Error!.Code);

        // The whole family — including the newest, otherwise-valid token2 — is now dead.
        var afterReuse = await service.RefreshAsync(token2);
        Assert.Null(afterReuse.Value);
        Assert.NotNull(afterReuse.Error);
    }

    [Fact]
    public async Task RefreshAsync_ExpiredToken_ReturnsInvalidRefreshToken()
    {
        var repo = new FakeIdentityRepository(FixedNow);
        var user = new User { Id = Guid.NewGuid(), DisplayName = "Alex", CreatedAtUtc = FixedNow.AddDays(-100) };
        repo.Users.Add(user);
        var raw = RefreshTokenCrypto.GenerateToken();
        repo.RefreshTokens.Add(new RefreshToken
        {
            Id = Guid.NewGuid(),
            UserId = user.Id,
            FamilyId = Guid.NewGuid(),
            TokenHash = RefreshTokenCrypto.HashToken(raw),
            CreatedAtUtc = FixedNow.AddDays(-91),
            ExpiresAtUtc = FixedNow.AddDays(-1), // expired relative to the fixed clock
        });
        var service = CreateService(repo, out _, out _, resolve: _ => null);

        var result = await service.RefreshAsync(raw);

        Assert.Null(result.Value);
        Assert.Equal(IdentityErrorCodes.InvalidRefreshToken, result.Error!.Code);
    }

    [Fact]
    public async Task GetMeAsync_DeletedUser_ReturnsNull()
    {
        var repo = new FakeIdentityRepository(FixedNow);
        var user = new User
        {
            Id = Guid.NewGuid(),
            DisplayName = "Deleted account",
            CreatedAtUtc = FixedNow,
            DeletedAtUtc = FixedNow,
        };
        repo.Users.Add(user);
        var service = CreateService(repo, out _, out _, resolve: _ => null);

        var me = await service.GetMeAsync(user.Id);

        Assert.Null(me);
    }

    [Fact]
    public async Task GetMeAsync_ProjectsAgreementsAsCamelCaseDocTypeTokens()
    {
        var repo = new FakeIdentityRepository(FixedNow);
        var user = new User { Id = Guid.NewGuid(), DisplayName = "Alex", Email = "a@x.com", CreatedAtUtc = FixedNow };
        user.Agreements.Add(new UserAgreement
        {
            Id = Guid.NewGuid(),
            UserId = user.Id,
            DocType = AgreementDocType.Tos,
            Version = "2026-01-01",
            AcceptedAtUtc = FixedNow,
        });
        user.Agreements.Add(new UserAgreement
        {
            Id = Guid.NewGuid(),
            UserId = user.Id,
            DocType = AgreementDocType.Privacy,
            Version = "2026-01-01",
            AcceptedAtUtc = FixedNow,
        });
        repo.Users.Add(user);
        var service = CreateService(repo, out _, out _, resolve: _ => null);

        var me = await service.GetMeAsync(user.Id);

        Assert.NotNull(me);
        Assert.Equal(2, me!.Agreements.Count);
        Assert.Contains(me.Agreements, a => a.DocType == "tos");
        Assert.Contains(me.Agreements, a => a.DocType == "privacy");
    }

    [Fact]
    public async Task RecordAgreementAsync_UnknownDocType_ReturnsFalseWithoutTouchingRepository()
    {
        var repo = new FakeIdentityRepository(FixedNow);
        var service = CreateService(repo, out _, out _, resolve: _ => null);

        var ok = await service.RecordAgreementAsync(Guid.NewGuid(), new AcceptAgreementRequest("cookies", "2026-01-01"));

        Assert.False(ok);
        Assert.Empty(repo.RecordedAgreements);
    }

    [Fact]
    public async Task RecordAgreementAsync_ValidDocType_ForwardsToRepository()
    {
        var repo = new FakeIdentityRepository(FixedNow);
        var service = CreateService(repo, out _, out _, resolve: _ => null);
        var userId = Guid.NewGuid();

        var ok = await service.RecordAgreementAsync(userId, new AcceptAgreementRequest("tos", "2026-01-01"));

        Assert.True(ok);
        var recorded = Assert.Single(repo.RecordedAgreements);
        Assert.Equal(userId, recorded.UserId);
        Assert.Equal(AgreementDocType.Tos, recorded.DocType);
        Assert.Equal("2026-01-01", recorded.Version);
    }

    private static CreateSessionRequest Request(string provider = "google", string? displayName = null) =>
        new(provider, "raw-id-token", Nonce: null, TurnstileToken: "turnstile-token", DisplayName: displayName, Device: null);

    private static IdentityService CreateService(
        FakeIdentityRepository repo,
        out FakeAccessTokenIssuer accessTokens,
        out FakeTurnstileVerifier turnstile,
        Func<string, VerifiedIdentity?> resolve,
        AuthProvider provider = AuthProvider.Google)
    {
        accessTokens = new FakeAccessTokenIssuer();
        turnstile = new FakeTurnstileVerifier();
        var verifiers = new IIdTokenVerifier[] { new FakeIdTokenVerifier(provider, resolve) };
        return new IdentityService(
            repo,
            verifiers,
            accessTokens,
            turnstile,
            new NullAnalyticsSink(),
            Options.Create(new AuthOptions { RefreshTokenDays = 90 }),
            new FixedTimeProvider(FixedNow));
    }

    /// <summary>A clock frozen at a fixed instant, so tests can pin exact expiry/creation math.</summary>
    private sealed class FixedTimeProvider : TimeProvider
    {
        private readonly DateTimeOffset _now;

        public FixedTimeProvider(DateTimeOffset now) => _now = now;

        public override DateTimeOffset GetUtcNow() => _now;
    }

    private sealed class FakeIdTokenVerifier : IIdTokenVerifier
    {
        private readonly Func<string, VerifiedIdentity?> _resolve;

        public FakeIdTokenVerifier(AuthProvider provider, Func<string, VerifiedIdentity?> resolve)
        {
            Provider = provider;
            _resolve = resolve;
        }

        public AuthProvider Provider { get; }

        public Task<VerifiedIdentity?> VerifyAsync(string idToken, string? nonce, CancellationToken ct = default) =>
            Task.FromResult(_resolve(idToken));
    }

    private sealed class FakeAccessTokenIssuer : IAccessTokenIssuer
    {
        public string IssueAccessToken(User user, Guid sessionId) => $"access:{user.Id}:{sessionId}";
    }

    private sealed class FakeTurnstileVerifier : ITurnstileVerifier
    {
        public bool ShouldPass { get; set; } = true;

        public Task<bool> VerifyAsync(string? token, string? remoteIp, CancellationToken ct = default) =>
            Task.FromResult(ShouldPass);
    }

    private sealed class NullAnalyticsSink : IAnalyticsSink
    {
        public Task TrackAsync(string eventType, object? payload = null, string? sessionId = null, CancellationToken ct = default) =>
            Task.CompletedTask;
    }

    /// <summary>
    /// In-memory stand-in for <see cref="IIdentityRepository"/>. Mutates the same object
    /// references the service holds (rather than cloning), mirroring how EF Core's change
    /// tracker keeps in-flight entities identical across calls within one unit of work.
    /// </summary>
    private sealed class FakeIdentityRepository : IIdentityRepository
    {
        private readonly DateTimeOffset _now;

        public FakeIdentityRepository(DateTimeOffset now) => _now = now;

        public List<User> Users { get; } = [];

        public List<UserLogin> Logins { get; } = [];

        public List<RefreshToken> RefreshTokens { get; } = [];

        public List<(Guid UserId, AgreementDocType DocType, string Version)> RecordedAgreements { get; } = [];

        public Task<UserLogin?> FindLoginAsync(AuthProvider provider, string subject, CancellationToken ct = default) =>
            Task.FromResult(Logins.FirstOrDefault(l => l.Provider == provider && l.Subject == subject));

        public Task<bool> EmailBelongsToAnotherUserAsync(string email, CancellationToken ct = default) =>
            Task.FromResult(Users.Any(u => u.Email == email && u.DeletedAtUtc is null));

        public Task<User> CreateUserWithLoginAsync(User user, UserLogin login, CancellationToken ct = default)
        {
            login.User = user;
            Users.Add(user);
            Logins.Add(login);
            return Task.FromResult(user);
        }

        public Task<User?> GetUserAsync(Guid userId, CancellationToken ct = default) =>
            Task.FromResult(Users.FirstOrDefault(u => u.Id == userId));

        public Task AddRefreshTokenAsync(RefreshToken token, CancellationToken ct = default)
        {
            RefreshTokens.Add(token);
            return Task.CompletedTask;
        }

        public Task<RefreshToken?> FindRefreshTokenAsync(string tokenHash, CancellationToken ct = default)
        {
            var token = RefreshTokens.FirstOrDefault(t => t.TokenHash == tokenHash);
            if (token is not null)
            {
                token.User = Users.FirstOrDefault(u => u.Id == token.UserId);
            }

            return Task.FromResult(token);
        }

        public Task ReplaceRefreshTokenAsync(RefreshToken current, RefreshToken next, CancellationToken ct = default)
        {
            // `current` is the same tracked instance already in the list — its RevokedAtUtc
            // mutation by the caller is already reflected; just append the successor.
            RefreshTokens.Add(next);
            return Task.CompletedTask;
        }

        public Task RevokeFamilyAsync(Guid familyId, CancellationToken ct = default)
        {
            foreach (var token in RefreshTokens.Where(t => t.FamilyId == familyId && t.RevokedAtUtc is null))
            {
                token.RevokedAtUtc = _now;
            }

            return Task.CompletedTask;
        }

        public Task RevokeAllForUserAsync(Guid userId, CancellationToken ct = default)
        {
            foreach (var token in RefreshTokens.Where(t => t.UserId == userId && t.RevokedAtUtc is null))
            {
                token.RevokedAtUtc = _now;
            }

            return Task.CompletedTask;
        }

        public Task RecordAgreementAsync(Guid userId, AgreementDocType docType, string version, CancellationToken ct = default)
        {
            if (!RecordedAgreements.Any(a => a.UserId == userId && a.DocType == docType && a.Version == version))
            {
                RecordedAgreements.Add((userId, docType, version));
            }

            return Task.CompletedTask;
        }

        public Task AnonymizeUserAsync(Guid userId, CancellationToken ct = default)
        {
            var user = Users.FirstOrDefault(u => u.Id == userId);
            if (user is null || user.DeletedAtUtc is not null)
            {
                return Task.CompletedTask;
            }

            user.DisplayName = "Deleted account";
            user.Email = null;
            user.DeletedAtUtc = _now;
            Logins.RemoveAll(l => l.UserId == userId);
            foreach (var token in RefreshTokens.Where(t => t.UserId == userId && t.RevokedAtUtc is null))
            {
                token.RevokedAtUtc = _now;
            }

            return Task.CompletedTask;
        }
    }
}
