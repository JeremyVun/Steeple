using System.Security.Claims;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Steeple.Api.Controllers.Identity;
using Steeple.Integration.Tests.Fixtures;

namespace Steeple.Integration.Tests.Proxies;
/// <summary>
/// The refresh-rotation proofs against a real Postgres: the two-tab race that used to revoke a
/// whole session family, the replay that still must, and the browser's httpOnly-cookie transport
/// end to end (docs/contracts/identity.md, SYSTEM_DESIGN §17 — "Refresh rotation grace + cookie
/// transport").
///
/// The grace cache is a singleton in the running API, so these tests share one instance across the
/// concurrent stacks exactly as the process does; each stack gets its own <see cref="SteepleDbContext"/>,
/// which is what makes the concurrency real rather than a change-tracker illusion.
/// </summary>
[Collection(PostgresCollection.Name)]
public class RefreshRotationIntegrationTests
{
    private readonly PostgresDatabaseFixture _fixture;

    public RefreshRotationIntegrationTests(PostgresDatabaseFixture fixture) => _fixture = fixture;

    [Fact]
    public async Task ConcurrentRefreshOfTheSameToken_BothCallersEndUpWithAWorkingPair()
    {
        var grace = NewGrace();
        var (userId, familyId, token) = await SeedSessionAsync();

        using var gate = new Barrier(2);
        var results = await Task.WhenAll(Enumerable.Range(0, 2).Select(_ => Task.Run(async () =>
        {
            await using var db = CreateContext();
            var identity = CreateService(db, grace);
            gate.SignalAndWait();
            return await identity.RefreshAsync(token);
        })));

        Assert.All(results, r => Assert.Null(r.Error));
        // One session, one continuation: both tabs are handed the same pair rather than one of them
        // being told it is a thief.
        Assert.Equal(results[0].Value!.RefreshToken, results[1].Value!.RefreshToken);

        await using var verifyDb = CreateContext();
        var family = await verifyDb.RefreshTokens.Where(t => t.FamilyId == familyId).ToListAsync();
        Assert.Equal(2, family.Count); // the original plus exactly one successor
        var live = Assert.Single(family, t => t.RevokedAtUtc is null);
        Assert.Equal(RefreshTokenCrypto.HashToken(results[0].Value!.RefreshToken!), live.TokenHash);

        // And the pair really works: it rotates again, from a fresh stack.
        await using var nextDb = CreateContext();
        var again = await CreateService(nextDb, grace).RefreshAsync(results[1].Value!.RefreshToken!);
        Assert.Null(again.Error);
        Assert.Equal(userId, (await verifyDb.RefreshTokens.FirstAsync(t => t.Id == live.Id)).UserId);
    }

    [Fact]
    public async Task ReplayAfterTheGraceWindow_RevokesTheWholeFamily()
    {
        var clock = new SteppableTimeProvider(DateTimeOffset.UtcNow);
        var grace = NewGrace(clock);
        var (_, familyId, token) = await SeedSessionAsync();

        await using var db = CreateContext();
        var identity = CreateService(db, grace, clock);
        var rotated = await identity.RefreshAsync(token);
        Assert.Null(rotated.Error);

        clock.Advance(TimeSpan.FromMinutes(5));
        var replay = await identity.RefreshAsync(token);

        Assert.Equal(IdentityErrorCodes.TokenReuse, replay.Error!.Code);

        await using var verifyDb = CreateContext();
        var family = await verifyDb.RefreshTokens.Where(t => t.FamilyId == familyId).ToListAsync();
        Assert.All(family, t => Assert.NotNull(t.RevokedAtUtc));

        // The successor the honest client held dies with the rest of the family.
        await using var afterDb = CreateContext();
        var afterReuse = await CreateService(afterDb, grace, clock).RefreshAsync(rotated.Value!.RefreshToken!);
        Assert.NotNull(afterReuse.Error);
    }

    [Fact]
    public async Task ReplayInsideTheGraceWindow_AnswersWithTheSuccessorAndKeepsTheFamilyAlive()
    {
        var grace = NewGrace();
        var (_, familyId, token) = await SeedSessionAsync();

        await using var db = CreateContext();
        var identity = CreateService(db, grace);
        var first = await identity.RefreshAsync(token);
        var second = await identity.RefreshAsync(token);

        Assert.Null(second.Error);
        Assert.Equal(first.Value!.RefreshToken, second.Value!.RefreshToken);

        await using var verifyDb = CreateContext();
        var family = await verifyDb.RefreshTokens.Where(t => t.FamilyId == familyId).ToListAsync();
        Assert.Single(family, t => t.RevokedAtUtc is null);
    }

    [Fact]
    public async Task CookieTransport_CreateRefreshDelete_RoundTripsWithoutATokenInTheBody()
    {
        var grace = NewGrace();
        await using var db = CreateContext();
        var identity = CreateService(db, grace);
        var options = Options.Create(new AuthOptions { RefreshTokenDays = 90, RefreshReuseGraceSeconds = 30 });
        var email = $"cookie-{Guid.NewGuid():N}@example.com";

        // 1. Sign in asking for cookie transport: the JSON carries no refresh token at all.
        var signIn = new AuthController(identity, options) { ControllerContext = Context() };
        var created = await signIn.CreateSession(
            new CreateSessionRequest("dev", email, null, null, "Cookie Person", null, RefreshTransports.Cookie),
            CancellationToken.None);
        var session = Assert.IsType<SessionResponse>(Assert.IsType<OkObjectResult>(created.Result).Value);
        Assert.Null(session.RefreshToken);
        var cookie = SetCookieValue(signIn.Response, options.Value.RefreshCookieName);
        Assert.NotNull(cookie);
        Assert.Contains("httponly", SetCookieHeader(signIn.Response, options.Value.RefreshCookieName)!, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("samesite=strict", SetCookieHeader(signIn.Response, options.Value.RefreshCookieName)!, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("path=/", SetCookieHeader(signIn.Response, options.Value.RefreshCookieName)!, StringComparison.OrdinalIgnoreCase);

        // 2. Refresh presenting nothing but the cookie: the successor comes back the same way.
        var refresh = new AuthController(identity, options) { ControllerContext = Context(cookie: (options.Value.RefreshCookieName, cookie!)) };
        var refreshed = await refresh.Refresh(request: null, CancellationToken.None);
        var pair = Assert.IsType<RefreshResponse>(Assert.IsType<OkObjectResult>(refreshed.Result).Value);
        Assert.Null(pair.RefreshToken);
        var rotatedCookie = SetCookieValue(refresh.Response, options.Value.RefreshCookieName);
        Assert.NotNull(rotatedCookie);
        Assert.NotEqual(cookie, rotatedCookie);
        Assert.NotEmpty(pair.AccessToken);

        // 3. Sign out with no access token at all — the stale-bearer case the cookie now covers.
        var signOut = new AuthController(identity, options) { ControllerContext = Context(cookie: (options.Value.RefreshCookieName, rotatedCookie!)) };
        Assert.IsType<NoContentResult>(await signOut.RevokeSession(CancellationToken.None));
        Assert.Contains("max-age=0", SetCookieHeader(signOut.Response, options.Value.RefreshCookieName)!, StringComparison.OrdinalIgnoreCase);

        await using var verifyDb = CreateContext();
        var family = await verifyDb.RefreshTokens.Where(t => t.UserId == session.User.Id).ToListAsync();
        Assert.NotEmpty(family);
        Assert.All(family, t => Assert.NotNull(t.RevokedAtUtc));
    }

    [Fact]
    public async Task CookieTransport_MigratesABodyTokenOntoTheCookieInOneRotation()
    {
        var grace = NewGrace();
        var (_, _, token) = await SeedSessionAsync();
        var options = Options.Create(new AuthOptions { RefreshTokenDays = 90, RefreshReuseGraceSeconds = 30 });

        await using var db = CreateContext();
        var controller = new AuthController(CreateService(db, grace), options) { ControllerContext = Context() };
        var refreshed = await controller.Refresh(
            new RefreshRequest(token, RefreshTransports.Cookie), CancellationToken.None);

        var pair = Assert.IsType<RefreshResponse>(Assert.IsType<OkObjectResult>(refreshed.Result).Value);
        Assert.Null(pair.RefreshToken);
        Assert.NotNull(SetCookieValue(controller.Response, options.Value.RefreshCookieName));
    }

    [Fact]
    public async Task BodyTransport_IsUnchanged_AndSetsNoCookie()
    {
        // Mobile's contract: ask for nothing, get the token in the JSON, get no cookie.
        var grace = NewGrace();
        var (_, _, token) = await SeedSessionAsync();
        var options = Options.Create(new AuthOptions { RefreshTokenDays = 90, RefreshReuseGraceSeconds = 30 });

        await using var db = CreateContext();
        var controller = new AuthController(CreateService(db, grace), options) { ControllerContext = Context() };
        var refreshed = await controller.Refresh(new RefreshRequest(token), CancellationToken.None);

        var pair = Assert.IsType<RefreshResponse>(Assert.IsType<OkObjectResult>(refreshed.Result).Value);
        Assert.NotNull(pair.RefreshToken);
        Assert.Null(SetCookieHeader(controller.Response, options.Value.RefreshCookieName));
    }

    [Fact]
    public async Task RevokeSession_WithABearerToken_StillRevokesTheFamily()
    {
        var grace = NewGrace();
        var (userId, familyId, _) = await SeedSessionAsync();
        var options = Options.Create(new AuthOptions { RefreshTokenDays = 90, RefreshReuseGraceSeconds = 30 });

        await using var db = CreateContext();
        var controller = new AuthController(CreateService(db, grace), options)
        {
            ControllerContext = Context(principal: Bearer(userId, familyId)),
        };

        Assert.IsType<NoContentResult>(await controller.RevokeSession(CancellationToken.None));

        await using var verifyDb = CreateContext();
        Assert.All(
            await verifyDb.RefreshTokens.Where(t => t.FamilyId == familyId).ToListAsync(),
            t => Assert.NotNull(t.RevokedAtUtc));
    }

    [Fact]
    public async Task RevokeSession_WithNeitherCredential_IsUnauthorized()
    {
        var grace = NewGrace();
        await using var db = CreateContext();
        var controller = new AuthController(
            CreateService(db, grace),
            Options.Create(new AuthOptions())) { ControllerContext = Context() };

        Assert.IsType<UnauthorizedResult>(await controller.RevokeSession(CancellationToken.None));
    }

    // ---- harness -------------------------------------------------------------------------

    private SteepleDbContext CreateContext() =>
        new(new DbContextOptionsBuilder<SteepleDbContext>().UseNpgsql(_fixture.ConnectionString).Options);

    private static MemoryRefreshRotationGrace NewGrace(TimeProvider? clock = null) =>
        new(Options.Create(new AuthOptions { RefreshTokenDays = 90, RefreshReuseGraceSeconds = 30 }),
            clock ?? TimeProvider.System);

    private IdentityService CreateService(SteepleDbContext db, IRefreshRotationGrace grace, TimeProvider? clock = null)
    {
        var time = clock ?? TimeProvider.System;
        var options = Options.Create(new AuthOptions { RefreshTokenDays = 90, RefreshReuseGraceSeconds = 30 });
        return new IdentityService(
            new EfIdentityRepository(db, time),
            [new EmailIsTheIdentity()],
            new StubAccessTokenIssuer(),
            new AlwaysPassesTurnstile(),
            grace,
            new NullAnalyticsSink(),
            options,
            time);
    }

    /// <summary>Writes a user with one live refresh-token family straight to Postgres.</summary>
    private async Task<(Guid UserId, Guid FamilyId, string RefreshToken)> SeedSessionAsync()
    {
        var now = DateTimeOffset.UtcNow;
        var user = new User
        {
            Id = Guid.NewGuid(),
            DisplayName = "Rotation Person",
            Email = $"rotate-{Guid.NewGuid():N}@example.com",
            CreatedAtUtc = now,
        };
        var familyId = Guid.NewGuid();
        var raw = RefreshTokenCrypto.GenerateToken();

        await using var db = CreateContext();
        db.Users.Add(user);
        db.RefreshTokens.Add(new RefreshToken
        {
            Id = Guid.NewGuid(),
            UserId = user.Id,
            FamilyId = familyId,
            TokenHash = RefreshTokenCrypto.HashToken(raw),
            Platform = "web",
            CreatedAtUtc = now,
            ExpiresAtUtc = now.AddDays(90),
        });
        await db.SaveChangesAsync();

        return (user.Id, familyId, raw);
    }

    private static ControllerContext Context(
        (string Name, string Value)? cookie = null, ClaimsPrincipal? principal = null)
    {
        var http = new DefaultHttpContext();
        if (cookie is { } present)
        {
            http.Request.Headers.Cookie = $"{present.Name}={present.Value}";
        }

        if (principal is not null)
        {
            http.User = principal;
        }

        return new ControllerContext { HttpContext = http };
    }

    private static ClaimsPrincipal Bearer(Guid userId, Guid sessionId) =>
        new(new ClaimsIdentity(
            [new Claim("sub", userId.ToString()), new Claim("sid", sessionId.ToString())],
            authenticationType: "TestBearer"));

    private static string? SetCookieHeader(HttpResponse response, string name) =>
        response.Headers.SetCookie.FirstOrDefault(h => h?.StartsWith($"{name}=", StringComparison.Ordinal) == true);

    /// <summary>The cookie's value, or null when the header sets it to empty (an expiry).</summary>
    private static string? SetCookieValue(HttpResponse response, string name)
    {
        var header = SetCookieHeader(response, name);
        if (header is null)
        {
            return null;
        }

        var value = header[(name.Length + 1)..].Split(';')[0];
        return value.Length > 0 ? Uri.UnescapeDataString(value) : null;
    }

    /// <summary>The dev provider in miniature: the "ID token" is the email, which is the subject.</summary>
    private sealed class EmailIsTheIdentity : IIdTokenVerifier
    {
        public AuthProvider Provider => AuthProvider.Dev;

        public Task<VerifiedIdentity?> VerifyAsync(string idToken, string? nonce, CancellationToken ct = default) =>
            Task.FromResult<VerifiedIdentity?>(new VerifiedIdentity(idToken, idToken, null));
    }

    private sealed class StubAccessTokenIssuer : IAccessTokenIssuer
    {
        public string IssueAccessToken(User user, Guid sessionId) => $"access:{user.Id}:{sessionId}:{Guid.NewGuid():N}";
    }

    private sealed class AlwaysPassesTurnstile : ITurnstileVerifier
    {
        public Task<bool> VerifyAsync(string? token, string? remoteIp, CancellationToken ct = default) =>
            Task.FromResult(true);
    }

    private sealed class NullAnalyticsSink : IAnalyticsSink
    {
        public Task TrackAsync(string eventType, object? payload = null, string? sessionId = null, CancellationToken ct = default) =>
            Task.CompletedTask;
    }

    /// <summary>A clock that stands still until a test moves it, so the grace window is exact.</summary>
    private sealed class SteppableTimeProvider : TimeProvider
    {
        private DateTimeOffset _now;

        public SteppableTimeProvider(DateTimeOffset now) => _now = now;

        public override DateTimeOffset GetUtcNow() => _now;

        public void Advance(TimeSpan by) => _now = _now.Add(by);
    }
}
