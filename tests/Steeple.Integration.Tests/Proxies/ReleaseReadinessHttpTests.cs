using System.Net;
using Microsoft.EntityFrameworkCore;
using Steeple.Integration.Tests.Fixtures;
using SocketHost = Steeple.Integration.Tests.Proxies.NotificationStreamHttpTests.SocketHost;

namespace Steeple.Integration.Tests.Proxies;

[Collection(PostgresCollection.Name)]
public sealed class ReleaseReadinessHttpTests(PostgresDatabaseFixture database)
{
    [Fact]
    public async Task RealHttp_CannotSubmitWithoutBothCurrentAgreements_RejectsInventedVersions()
    {
        await using var host = await SocketHost.Start(database.ConnectionString);
        await using var db = new SteepleDbContext(new DbContextOptionsBuilder<SteepleDbContext>()
            .UseNpgsql(database.ConnectionString).Options);
        var user = new User { Id = Guid.NewGuid(), DisplayName = "Consent test", CreatedAtUtc = DateTimeOffset.UtcNow };
        db.Users.Add(user);
        await db.SaveChangesAsync();
        var token = host.Token(userId: user.Id);
        var roomId = Guid.NewGuid(); // Missing room proves whether the protected action was reached.
        var request = new SubmitApplicationRequest("community", 12,
            new ScheduleDto("oneOff", new DateOnly(2027, 9, 21), null, null, "18:00", "20:00"),
            "Community meeting", null);
        var path = $"/api/v1/listings/{roomId}/applications";

        using (var blocked = await host.Send(HttpMethod.Post, path, token, request))
        {
            Assert.Equal(HttpStatusCode.Forbidden, blocked.StatusCode);
            Assert.Contains("agreements_required", await blocked.Content.ReadAsStringAsync());
        }
        foreach (var version in new[] { "2026-08-07", "2099-01-01" })
        {
            using var invalid = await host.Send(HttpMethod.Post, "/api/v1/me/agreements", token, new { docType = "tos", version });
            Assert.Equal(HttpStatusCode.BadRequest, invalid.StatusCode);
        }
        using (var accepted = await host.Send(HttpMethod.Post, "/api/v1/me/agreements", token,
                   new { docType = "tos", version = CurrentAgreements.Version }))
            Assert.Equal(HttpStatusCode.NoContent, accepted.StatusCode);
        using (var stillBlocked = await host.Send(HttpMethod.Post, path, token, request))
            Assert.Equal(HttpStatusCode.Forbidden, stillBlocked.StatusCode);
        using (var accepted = await host.Send(HttpMethod.Post, "/api/v1/me/agreements", token,
                   new { docType = "privacy", version = CurrentAgreements.Version }))
            Assert.Equal(HttpStatusCode.NoContent, accepted.StatusCode);
        using (var admitted = await host.Send(HttpMethod.Post, path, token, request))
            Assert.Equal(HttpStatusCode.NotFound, admitted.StatusCode);
        Assert.Equal(2, await db.UserAgreements.CountAsync(a => a.UserId == user.Id));
        Assert.False(await db.Applications.AnyAsync(a => a.OrganizerId == user.Id));
    }

    [Fact]
    public async Task DecliningAndUnlistingRemainAvailableWithoutAgreements()
    {
        await using var host = await SocketHost.Start(database.ConnectionString);
        var token = host.Token();
        var missingId = Guid.NewGuid();
        foreach (var path in new[] { $"/api/v1/applications/{missingId}/decision", $"/api/v1/applications/{missingId}/counter-offer/respond" })
        {
            using var declined = await host.Send(HttpMethod.Post, path, token, new { decision = "decline" });
            Assert.Equal(HttpStatusCode.NotFound, declined.StatusCode);
        }
        using var unlisted = await host.Send(HttpMethod.Patch, $"/api/v1/manage/rooms/{missingId}", token, new { status = "unlisted" });
        Assert.Equal(HttpStatusCode.NotFound, unlisted.StatusCode);
    }

    [Fact]
    public async Task ReadinessRequiresDatabase_LivenessDoesNot()
    {
        await using var healthy = await SocketHost.Start(database.ConnectionString);
        using (var ready = await healthy.Send(HttpMethod.Get, "/health/ready"))
            Assert.Equal(HttpStatusCode.OK, ready.StatusCode);
        var unavailable = new Npgsql.NpgsqlConnectionStringBuilder(database.ConnectionString)
        {
            Database = "missing_release_readiness_database", Timeout = 2,
        };
        await using var unhealthy = await SocketHost.Start(unavailable.ConnectionString);
        using (var live = await unhealthy.Send(HttpMethod.Get, "/health"))
            Assert.Equal(HttpStatusCode.OK, live.StatusCode);
        using (var notReady = await unhealthy.Send(HttpMethod.Get, "/health/ready"))
        {
            Assert.Equal(HttpStatusCode.ServiceUnavailable, notReady.StatusCode);
            Assert.DoesNotContain("Password", await notReady.Content.ReadAsStringAsync());
        }
    }
}
