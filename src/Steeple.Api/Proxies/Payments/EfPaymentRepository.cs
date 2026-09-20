using System.Data;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using Steeple.Api.Services.Payments;

namespace Steeple.Api.Proxies.Payments;
/// <summary>
/// EF Core adapter for <see cref="IPaymentRepository"/>. The two Postgres-specific pieces live
/// here: the one-live-payment partial unique index's violation (SQLSTATE 23505) becomes a
/// <c>false</c> return from <see cref="TryAddPaymentAsync"/>, and the sweep serialization is a
/// session advisory lock held on the scope's pinned connection.
/// </summary>
public class EfPaymentRepository : IPaymentRepository
{
    /// <summary>Advisory-lock key for the payment sweep (arbitrary, unique within the database).</summary>
    private const long SweepLockKey = 0x5745_4550_5041_59; // "WEEPPAY"
    private const long AccountStateLockSalt = 0x5354_5041_5941_43; // "STPAYAC"

    private readonly SteepleDbContext _db;

    /// <summary>Creates the repository over the EF context.</summary>
    public EfPaymentRepository(SteepleDbContext db) => _db = db;

    /// <inheritdoc />
    public Task<User?> GetUserAsync(Guid userId, CancellationToken ct = default) =>
        _db.Users.FirstOrDefaultAsync(u => u.Id == userId && u.DeletedAtUtc == null, ct);

    /// <inheritdoc />
    public Task<VenuePaymentAccount?> GetVenueAccountAsync(Guid venueId, CancellationToken ct = default) =>
        _db.VenuePaymentAccounts.FirstOrDefaultAsync(a => a.VenueId == venueId, ct);

    /// <inheritdoc />
    public async Task<VenuePaymentAccount> GetOrCreateVenueProvisioningAsync(
        Guid venueId, string provider, DateTimeOffset nowUtc, CancellationToken ct = default)
    {
        var existing = await GetVenueAccountAsync(venueId, ct).ConfigureAwait(false);
        if (existing is not null)
        {
            return await PrepareProviderAsync(existing, provider, nowUtc, ct).ConfigureAwait(false);
        }

        var account = new VenuePaymentAccount
        {
            VenueId = venueId,
            ProvisioningKey = Guid.NewGuid(),
            Provider = provider,
            CreatedAtUtc = nowUtc,
            UpdatedAtUtc = nowUtc,
        };
        _db.VenuePaymentAccounts.Add(account);
        try
        {
            await _db.SaveChangesAsync(ct).ConfigureAwait(false);
            return account;
        }
        catch (DbUpdateException ex) when (ex.InnerException is PostgresException { SqlState: PostgresErrorCodes.UniqueViolation })
        {
            _db.Entry(account).State = EntityState.Detached;
            var winner = await GetVenueAccountAsync(venueId, ct).ConfigureAwait(false)
                ?? throw new InvalidOperationException("Concurrent venue payment provisioning disappeared.");
            return await PrepareProviderAsync(winner, provider, nowUtc, ct).ConfigureAwait(false);
        }
    }

    private async Task<VenuePaymentAccount> PrepareProviderAsync(
        VenuePaymentAccount account, string provider, DateTimeOffset nowUtc, CancellationToken ct)
    {
        if (account.Provider.Equals(provider, StringComparison.Ordinal))
        {
            return account;
        }
        if (!provider.Equals("stripe", StringComparison.Ordinal)
            || !account.Provider.Equals("mock", StringComparison.Ordinal))
        {
            return account;
        }

        var provisioningKey = Guid.NewGuid();
        await _db.Database.ExecuteSqlInterpolatedAsync($"""
            UPDATE venue_payment_accounts
            SET "Provider" = 'stripe',
                "ProviderAccountId" = NULL,
                "ProvisioningKey" = {provisioningKey},
                "DetailsSubmitted" = false,
                "ChargesEnabled" = false,
                "PayoutsEnabled" = false,
                "RequirementsDue" = ARRAY[]::text[],
                "DisabledReason" = NULL,
                "OptedInAtUtc" = NULL,
                "UpdatedAtUtc" = {nowUtc}
            WHERE "VenueId" = {account.VenueId} AND "Provider" = 'mock'
            """, ct).ConfigureAwait(false);
        await _db.Entry(account).ReloadAsync(ct).ConfigureAwait(false);
        return account;
    }

    /// <inheritdoc />
    public Task<VenuePaymentAccount?> GetVenueAccountByProviderIdAsync(string providerAccountId, CancellationToken ct = default) =>
        _db.VenuePaymentAccounts.FirstOrDefaultAsync(a => a.ProviderAccountId == providerAccountId, ct);

    /// <inheritdoc />
    public Task ReloadVenueAccountAsync(VenuePaymentAccount account, CancellationToken ct = default) =>
        _db.Entry(account).ReloadAsync(ct);

    /// <inheritdoc />
    public async Task<(PaymentWebhookEvent Event, bool Added)> GetOrAddWebhookEventAsync(
        PaymentWebhookEvent webhookEvent, CancellationToken ct = default)
    {
        var existing = await _db.PaymentWebhookEvents.FindAsync(
            [webhookEvent.Source, webhookEvent.ProviderEventId], ct).ConfigureAwait(false);
        if (existing is not null)
        {
            return (existing, false);
        }

        _db.PaymentWebhookEvents.Add(webhookEvent);
        try
        {
            await _db.SaveChangesAsync(ct).ConfigureAwait(false);
            return (webhookEvent, true);
        }
        catch (DbUpdateException ex) when (ex.InnerException is PostgresException { SqlState: PostgresErrorCodes.UniqueViolation })
        {
            _db.Entry(webhookEvent).State = EntityState.Detached;
            var winner = await _db.PaymentWebhookEvents.FindAsync(
                [webhookEvent.Source, webhookEvent.ProviderEventId], ct).ConfigureAwait(false);
            return (winner ?? throw new InvalidOperationException("Concurrent webhook event disappeared."), false);
        }
    }

    /// <inheritdoc />
    public async Task AcquireAccountStateLockAsync(string providerAccountId, CancellationToken ct = default)
    {
        await _db.Database.OpenConnectionAsync(ct).ConfigureAwait(false);
        var connection = _db.Database.GetDbConnection();
        await using var command = connection.CreateCommand();
        command.CommandText = "SELECT pg_advisory_lock(hashtextextended(@account, @salt))";
        var account = command.CreateParameter();
        account.ParameterName = "account";
        account.Value = providerAccountId;
        command.Parameters.Add(account);
        var salt = command.CreateParameter();
        salt.ParameterName = "salt";
        salt.Value = AccountStateLockSalt;
        command.Parameters.Add(salt);
        await command.ExecuteScalarAsync(ct).ConfigureAwait(false);
    }

    /// <inheritdoc />
    public async Task ReleaseAccountStateLockAsync(string providerAccountId, CancellationToken ct = default)
    {
        var connection = _db.Database.GetDbConnection();
        if (connection.State != ConnectionState.Open)
        {
            return;
        }

        await using (var command = connection.CreateCommand())
        {
            command.CommandText = "SELECT pg_advisory_unlock(hashtextextended(@account, @salt))";
            var account = command.CreateParameter();
            account.ParameterName = "account";
            account.Value = providerAccountId;
            command.Parameters.Add(account);
            var salt = command.CreateParameter();
            salt.ParameterName = "salt";
            salt.Value = AccountStateLockSalt;
            command.Parameters.Add(salt);
            await command.ExecuteScalarAsync(ct).ConfigureAwait(false);
        }

        await _db.Database.CloseConnectionAsync().ConfigureAwait(false);
    }

    /// <inheritdoc />
    public async Task<bool> TryAddPaymentAsync(Payment payment, CancellationToken ct = default)
    {
        _db.Payments.Add(payment);
        try
        {
            await _db.SaveChangesAsync(ct).ConfigureAwait(false);
            return true;
        }
        catch (DbUpdateException ex) when (ex.InnerException is PostgresException { SqlState: PostgresErrorCodes.UniqueViolation })
        {
            // Another worker already holds the live claim for this occurrence — the partial
            // unique index is the double-charge guard doing its job. Nothing was written.
            _db.Entry(payment).State = EntityState.Detached;
            return false;
        }
    }

    /// <inheritdoc />
    public async Task<IReadOnlyList<Payment>> GetForBookingsAsync(IReadOnlyList<Guid> bookingIds, CancellationToken ct = default) =>
        await _db.Payments
            .Where(p => bookingIds.Contains(p.BookingId))
            .OrderByDescending(p => p.CreatedAtUtc)
            .ToListAsync(ct)
            .ConfigureAwait(false);

    /// <inheritdoc />
    public async Task<IReadOnlyList<ChargeCandidate>> GetChargeCandidatesAsync(
        DateTimeOffset nowUtc, DateTimeOffset windowEndUtc, CancellationToken ct = default)
    {
        var occurrences = await ChargeableOccurrences()
            .Where(o => o.StartUtc > nowUtc && o.StartUtc <= windowEndUtc)
            .OrderBy(o => o.StartUtc)
            .ToListAsync(ct)
            .ConfigureAwait(false);

        return await WithFailureHistoryAsync(occurrences, ct).ConfigureAwait(false);
    }

    /// <inheritdoc />
    public async Task<ChargeCandidate?> GetFirstChargeCandidateForBookingAsync(Guid bookingId, CancellationToken ct = default)
    {
        var occurrence = await ChargeableOccurrences()
            .Where(o => o.BookingId == bookingId)
            .OrderBy(o => o.StartUtc)
            .FirstOrDefaultAsync(ct)
            .ConfigureAwait(false);
        if (occurrence is null)
        {
            return null;
        }

        var candidates = await WithFailureHistoryAsync([occurrence], ct).ConfigureAwait(false);
        return candidates[0];
    }

    /// <inheritdoc />
    public async Task<IReadOnlyList<Payment>> GetRefundableAsync(Guid? bookingId = null, CancellationToken ct = default)
    {
        var query = PaymentGraph().Where(p =>
            p.Status == PaymentStatus.Succeeded
            && p.Occurrence!.Status == OccurrenceStatus.Cancelled);
        if (bookingId is { } id)
        {
            query = query.Where(p => p.BookingId == id);
        }

        return await query.ToListAsync(ct).ConfigureAwait(false);
    }

    /// <inheritdoc />
    public async Task<IReadOnlyList<Payment>> GetStalePendingAsync(DateTimeOffset olderThanUtc, CancellationToken ct = default) =>
        await PaymentGraph()
            .Where(p => p.Status == PaymentStatus.Pending && p.CreatedAtUtc <= olderThanUtc)
            .ToListAsync(ct)
            .ConfigureAwait(false);

    /// <inheritdoc />
    public async Task<bool> WasPreviousOccurrencePaymentCancelledAsync(
        Guid bookingId, DateTimeOffset beforeStartUtc, CancellationToken ct = default)
    {
        var previous = await _db.BookingOccurrences
            .Where(o => o.BookingId == bookingId && o.StartUtc < beforeStartUtc)
            .OrderByDescending(o => o.StartUtc)
            .FirstOrDefaultAsync(ct)
            .ConfigureAwait(false);
        if (previous is null || previous.Status != OccurrenceStatus.Cancelled)
        {
            return false;
        }

        return await _db.Payments
            .AnyAsync(p => p.OccurrenceId == previous.Id && p.Status == PaymentStatus.Failed, ct)
            .ConfigureAwait(false);
    }

    /// <inheritdoc />
    public Task SaveAsync(CancellationToken ct = default) => _db.SaveChangesAsync(ct);

    /// <inheritdoc />
    public async Task<bool> TryAcquireSweepLockAsync(CancellationToken ct = default)
    {
        // Pin the scope's connection open so the session-level lock survives for the whole sweep;
        // EF reuses the already-open connection for every query in this scope.
        await _db.Database.OpenConnectionAsync(ct).ConfigureAwait(false);
        var connection = _db.Database.GetDbConnection();
        await using var command = connection.CreateCommand();
        command.CommandText = "SELECT pg_try_advisory_lock(@key)";
        var parameter = command.CreateParameter();
        parameter.ParameterName = "key";
        parameter.Value = SweepLockKey;
        command.Parameters.Add(parameter);
        var acquired = await command.ExecuteScalarAsync(ct).ConfigureAwait(false) is true;
        if (!acquired)
        {
            await _db.Database.CloseConnectionAsync().ConfigureAwait(false);
        }

        return acquired;
    }

    /// <inheritdoc />
    public async Task ReleaseSweepLockAsync(CancellationToken ct = default)
    {
        var connection = _db.Database.GetDbConnection();
        if (connection.State != ConnectionState.Open)
        {
            return;
        }

        await using (var command = connection.CreateCommand())
        {
            command.CommandText = "SELECT pg_advisory_unlock(@key)";
            var parameter = command.CreateParameter();
            parameter.ParameterName = "key";
            parameter.Value = SweepLockKey;
            command.Parameters.Add(parameter);
            await command.ExecuteScalarAsync(ct).ConfigureAwait(false);
        }

        await _db.Database.CloseConnectionAsync().ConfigureAwait(false);
    }

    /// <summary>Scheduled, priced, confirmed-booking occurrences with no live payment claim.</summary>
    private IQueryable<BookingOccurrence> ChargeableOccurrences() =>
        _db.BookingOccurrences
            .Include(o => o.Booking!).ThenInclude(b => b.Room!).ThenInclude(r => r.Venue)
            .Include(o => o.Booking!).ThenInclude(b => b.Organizer)
            .Where(o => o.Status == OccurrenceStatus.Scheduled
                && o.Booking!.Status == BookingStatus.Confirmed
                && o.Booking.InAppPayment
                && o.Booking.PricePerOccurrence != null
                && !_db.Payments.Any(p => p.OccurrenceId == o.Id && p.Status != PaymentStatus.Failed));

    private IQueryable<Payment> PaymentGraph() =>
        _db.Payments
            .Include(p => p.Occurrence)
            .Include(p => p.Booking!).ThenInclude(b => b.Room!).ThenInclude(r => r.Venue)
            .Include(p => p.Booking!).ThenInclude(b => b.Organizer);

    /// <summary>Attaches each occurrence's failed-attempt summary in one grouped query.</summary>
    private async Task<IReadOnlyList<ChargeCandidate>> WithFailureHistoryAsync(
        IReadOnlyList<BookingOccurrence> occurrences, CancellationToken ct)
    {
        if (occurrences.Count == 0)
        {
            return [];
        }

        var ids = occurrences.Select(o => o.Id).ToList();
        var failures = await _db.Payments
            .Where(p => ids.Contains(p.OccurrenceId) && p.Status == PaymentStatus.Failed)
            .GroupBy(p => p.OccurrenceId)
            .Select(g => new { OccurrenceId = g.Key, Count = g.Count(), Last = g.Max(p => p.CreatedAtUtc) })
            .ToListAsync(ct)
            .ConfigureAwait(false);
        var byOccurrence = failures.ToDictionary(f => f.OccurrenceId);

        return occurrences
            .Select(o => byOccurrence.TryGetValue(o.Id, out var f)
                ? new ChargeCandidate(o, f.Count, f.Last)
                : new ChargeCandidate(o, 0, null))
            .ToList();
    }
}
