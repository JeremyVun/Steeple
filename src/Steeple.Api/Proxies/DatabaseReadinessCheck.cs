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
            // CanConnect/SELECT 1 alone would admit an unmigrated database. Materializing this
            // projection checks the latest required booking column, even when there are no rows.
            await db.Bookings.Select(b => new { b.Id, b.InAppPayment }).Take(1)
                .ToListAsync(deadline.Token).ConfigureAwait(false);
            return HealthCheckResult.Healthy();
        }
        catch (Exception exception) when (exception is not OutOfMemoryException)
        {
            return HealthCheckResult.Unhealthy("Database unavailable or schema not ready.");
        }
    }
}
