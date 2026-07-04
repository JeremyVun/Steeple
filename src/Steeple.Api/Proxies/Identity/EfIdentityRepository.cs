using Microsoft.EntityFrameworkCore;

namespace Steeple.Api.Proxies.Identity;
/// <summary>EF Core adapter for <see cref="IIdentityRepository"/> over <see cref="SteepleDbContext"/>.</summary>
public sealed class EfIdentityRepository : IIdentityRepository
{
    private readonly SteepleDbContext _db;
    private readonly TimeProvider _clock;

    /// <summary>Creates the repository.</summary>
    public EfIdentityRepository(SteepleDbContext db, TimeProvider clock)
    {
        _db = db;
        _clock = clock;
    }

    /// <inheritdoc />
    public Task<UserLogin?> FindLoginAsync(AuthProvider provider, string subject, CancellationToken ct = default) =>
        _db.UserLogins
            .Include(l => l.User)
            .SingleOrDefaultAsync(l => l.Provider == provider && l.Subject == subject, ct);

    /// <inheritdoc />
    public Task<bool> EmailBelongsToAnotherUserAsync(string email, CancellationToken ct = default) =>
        _db.Users.AnyAsync(u => u.Email == email && u.DeletedAtUtc == null, ct);

    /// <inheritdoc />
    public async Task<User> CreateUserWithLoginAsync(User user, UserLogin login, CancellationToken ct = default)
    {
        _db.Users.Add(user);
        _db.UserLogins.Add(login);
        await _db.SaveChangesAsync(ct).ConfigureAwait(false);
        return user;
    }

    /// <inheritdoc />
    public Task<User?> GetUserAsync(Guid userId, CancellationToken ct = default) =>
        _db.Users
            .Include(u => u.Agreements)
            .SingleOrDefaultAsync(u => u.Id == userId, ct);

    /// <inheritdoc />
    public async Task AddRefreshTokenAsync(RefreshToken token, CancellationToken ct = default)
    {
        _db.RefreshTokens.Add(token);
        await _db.SaveChangesAsync(ct).ConfigureAwait(false);
    }

    /// <inheritdoc />
    public Task<RefreshToken?> FindRefreshTokenAsync(string tokenHash, CancellationToken ct = default) =>
        _db.RefreshTokens
            .Include(t => t.User)
            .SingleOrDefaultAsync(t => t.TokenHash == tokenHash, ct);

    /// <inheritdoc />
    public async Task ReplaceRefreshTokenAsync(RefreshToken current, RefreshToken next, CancellationToken ct = default)
    {
        // One SaveChanges = one transaction: the rotation either fully happens or not at all.
        _db.RefreshTokens.Update(current);
        _db.RefreshTokens.Add(next);
        await _db.SaveChangesAsync(ct).ConfigureAwait(false);
    }

    /// <inheritdoc />
    public async Task RevokeFamilyAsync(Guid familyId, CancellationToken ct = default)
    {
        var now = _clock.GetUtcNow();
        await _db.RefreshTokens
            .Where(t => t.FamilyId == familyId && t.RevokedAtUtc == null)
            .ExecuteUpdateAsync(s => s.SetProperty(t => t.RevokedAtUtc, now), ct)
            .ConfigureAwait(false);
    }

    /// <inheritdoc />
    public async Task RevokeAllForUserAsync(Guid userId, CancellationToken ct = default)
    {
        var now = _clock.GetUtcNow();
        await _db.RefreshTokens
            .Where(t => t.UserId == userId && t.RevokedAtUtc == null)
            .ExecuteUpdateAsync(s => s.SetProperty(t => t.RevokedAtUtc, now), ct)
            .ConfigureAwait(false);
    }

    /// <inheritdoc />
    public async Task RecordAgreementAsync(Guid userId, AgreementDocType docType, string version, CancellationToken ct = default)
    {
        var exists = await _db.UserAgreements
            .AnyAsync(a => a.UserId == userId && a.DocType == docType && a.Version == version, ct)
            .ConfigureAwait(false);
        if (exists)
        {
            return;
        }

        _db.UserAgreements.Add(new UserAgreement
        {
            Id = Guid.NewGuid(),
            UserId = userId,
            DocType = docType,
            Version = version,
            AcceptedAtUtc = _clock.GetUtcNow(),
        });

        try
        {
            await _db.SaveChangesAsync(ct).ConfigureAwait(false);
        }
        catch (DbUpdateException)
        {
            // Two concurrent accepts of the same version raced on the unique index — the record
            // exists either way, which is all this method promises.
        }
    }

    /// <inheritdoc />
    public async Task AnonymizeUserAsync(Guid userId, CancellationToken ct = default)
    {
        var user = await _db.Users
            .Include(u => u.Logins)
            .SingleOrDefaultAsync(u => u.Id == userId, ct)
            .ConfigureAwait(false);
        if (user is null || user.DeletedAtUtc is not null)
        {
            return;
        }

        var now = _clock.GetUtcNow();

        // Clear PII but keep the row: agreements stay as legal records, and future bookings /
        // ratings keep a valid party reference. Logins go so the SSO identity can start fresh.
        user.DisplayName = "Deleted account";
        user.Email = null;
        user.DeletedAtUtc = now;
        _db.UserLogins.RemoveRange(user.Logins);

        await _db.RefreshTokens
            .Where(t => t.UserId == userId && t.RevokedAtUtc == null)
            .ExecuteUpdateAsync(s => s.SetProperty(t => t.RevokedAtUtc, now), ct)
            .ConfigureAwait(false);

        // Anonymization keeps the user row (unlike a real delete), so the devices table's cascade
        // never fires — stop pushing to a deleted account explicitly.
        await _db.Devices
            .Where(d => d.UserId == userId)
            .ExecuteDeleteAsync(ct)
            .ConfigureAwait(false);

        await _db.SaveChangesAsync(ct).ConfigureAwait(false);
    }
}
