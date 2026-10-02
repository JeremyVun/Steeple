using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Diagnostics.HealthChecks;

namespace Steeple.Api.Proxies;

/// <summary>Checks database connectivity and the booking schema required by this binary.</summary>
public sealed class DatabaseReadinessCheck(SteepleDbContext db) : IHealthCheck
{
    public async Task<HealthCheckResult> CheckHealthAsync(
        HealthCheckContext context, CancellationToken cancellationToken = default)
    {
        using var deadline = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        deadline.CancelAfter(TimeSpan.FromSeconds(3));
        try
        {
            // SELECT 1 would admit an unmigrated database, including one with no rows yet.
            await db.Bookings.Select(b => new { b.Id, b.InAppPayment, b.QuotedPricePerHour, b.QuotedHouseRules }).Take(1)
                .ToListAsync(deadline.Token).ConfigureAwait(false);
            await db.Rooms.Select(r => new { r.Id, r.AvailabilityConfiguredAtUtc }).Take(1)
                .ToListAsync(deadline.Token).ConfigureAwait(false);
            await db.Applications.Select(a => new { a.Id, a.QuotedPricePerHour, a.QuotedCurrency, a.QuotedHouseRules }).Take(1)
                .ToListAsync(deadline.Token).ConfigureAwait(false);
            return HealthCheckResult.Healthy();
        }
        catch (Exception exception) when (exception is not OutOfMemoryException)
        {
            return HealthCheckResult.Unhealthy("Database unavailable or schema not ready.");
        }
    }
}
