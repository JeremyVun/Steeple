using Steeple.Admin.ViewModels.Admin;
using Steeple.Persistence;
using Steeple.Persistence.Constants;
using Steeple.Persistence.Models;
using Microsoft.EntityFrameworkCore;

namespace Steeple.Admin.Services.Admin;

/// <summary>
/// Admin workspace backed by the shared Postgres database (via <see cref="SteepleDbContext"/>).
/// Listings, analytics, and the listing/event metrics are sourced live from the same tables the
/// public web funnel reads — so the two surfaces stay coherent.
///
/// Users, bookings, feature flags, and the account/trusted-device views have no schema yet (they
/// arrive with later slices), so those sections remain interactive in-memory placeholders, clearly
/// fenced off below. Registered as a singleton (like the former mock); the scoped DbContext is
/// resolved per operation through <see cref="IServiceScopeFactory"/>.
/// </summary>
public sealed class PostgresAdminWorkspace : IAdminWorkspace
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly object _gate = new();

    // ----- Not-yet-schema-backed placeholder state (later slices) -------------------------------
    private readonly List<AdminUserRow> _users;
    private readonly List<AdminBookingRow> _bookings;
    private readonly List<AdminFeatureFlagRow> _flags;
    private readonly List<AdminTrustedDeviceRow> _trustedDevices;

    public PostgresAdminWorkspace(IServiceScopeFactory scopeFactory)
    {
        _scopeFactory = scopeFactory;

        var now = DateTimeOffset.UtcNow;

        _users =
        [
            new(Guid.Parse("8f730a1a-1ed6-47e1-8f0b-26a1a237f318"), "Maria Santos", "maria@example.org", "Organizer", "SSO verified", "Active", 3, now.AddHours(-2)),
            new(Guid.Parse("cb104afa-53e5-4a0d-a7fc-679890d42d25"), "Eli Washington", "eli@example.org", "Church admin", "MFA enabled", "Active", 9, now.AddMinutes(-38)),
            new(Guid.Parse("ef6d032f-0641-456e-bbee-66f8eacfb775"), "Nora Patel", "nora@example.org", "Organizer", "New", "Review", 0, now.AddDays(-1)),
            new(Guid.Parse("0f712499-6dd7-41b8-8c03-1e72e25da516"), "St. Mark Office", "office@stmark.example", "Venue admin", "SSO verified", "Paused", 12, now.AddDays(-4)),
        ];

        _bookings =
        [
            new(Guid.Parse("f7e3eb06-9867-4142-b682-36d7d3511350"), "St. Andrew's / Parish Hall", "Maria Santos", "Tue weekly, 9:30-11:00 AM, until Aug 31", "Approved", "Toddler playgroup"),
            new(Guid.Parse("f9107356-5826-46dd-87c7-afddc6d3db84"), "St. Mark / Fellowship Room", "Falls Church Food Circle", "Sat Jun 20, 2:00-5:00 PM", "Pending", "Food pantry packing"),
            new(Guid.Parse("d94ba142-38b0-454c-92da-482cc5fe97f0"), "Hope Church / Classroom 2", "Nora Patel", "Thu Jun 25, 6:30-8:30 PM", "Question sent", "Homework club"),
        ];

        _flags =
        [
            new("admin.htmx_dashboard", "Enables the new server-rendered admin surface.", true, false, "admins", now.AddHours(-3)),
            new("booking.recurring_materialization", "Uses bounded recurrence with materialized occurrences.", true, false, "api", now.AddDays(-1)),
            new("trust.phone_otp_stepup", "Escalates selected high-risk bookings to SMS OTP.", false, false, "risk-tier:high", now.AddDays(-2)),
            new("web.apply_from_browser", "Allows consumer web users to submit applications without app handoff.", false, true, "10% rollout", now.AddDays(-5)),
        ];

        _trustedDevices =
        [
            new(Guid.Parse("cd02da3f-d634-4129-9d2a-07404d033144"), "Safari on macOS", "127.0.0.1", now.AddDays(-4), now.AddHours(-3), now.AddDays(26), true),
            new(Guid.Parse("a72fec97-aee7-49cf-9877-5ffac231ab76"), "Chrome on iOS", "203.0.113.42", now.AddDays(-12), now.AddDays(-2), now.AddDays(18), false),
        ];
    }

    public AdminWorkspaceViewModel Snapshot()
    {
        using var scope = _scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SteepleDbContext>();

        // --- Real data from Postgres --------------------------------------------------------------
        var listings = db.Rooms
            .AsNoTracking()
            .Include(r => r.Venue)
            .OrderBy(r => r.Venue!.Name)
            .ThenBy(r => r.Name)
            .Select(r => new AdminListingRow(
                r.Id,
                r.Venue!.Name,
                r.Name,
                r.Venue.Suburb,
                r.Capacity,
                DisplayStatus(r.Status),
                r.PricePerHour == null || r.PricePerHour <= 0m ? "Free" : "$" + ((int)r.PricePerHour) + "/hr",
                0,
                0))
            .ToList();

        var events = db.AnalyticsEvents
            .AsNoTracking()
            .OrderByDescending(e => e.OccurredAtUtc)
            .Take(50)
            .ToList();

        var analytics = events
            .Select(e => new AdminAnalyticsRow(
                e.OccurredAtUtc,
                e.EventType,
                "web",
                string.IsNullOrEmpty(e.SessionId) ? "—" : e.SessionId!,
                e.PayloadJson ?? ""))
            .ToList();

        var publishedCount = listings.Count(l => l.Status == "Published");

        // Recent activity is derived live from the analytics stream (real), newest first.
        var activity = events
            .Take(6)
            .Select(e => new AdminActivity(e.OccurredAtUtc, "web", e.EventType, e.PayloadJson ?? ""))
            .ToList();

        lock (_gate)
        {
            var shell = new AdminShellViewModel(
                ActiveSection: "overview",
                Metrics:
                [
                    // Placeholder — applications/bookings have no schema yet (later slice).
                    new("Pending applications", "—", "Not yet tracked", "neutral"),
                    new("Published listings", publishedCount.ToString(), "Live in discovery", "good"),
                    // Placeholder — no users/auth schema yet (later slice).
                    new("Active users", "—", "Not yet tracked", "neutral"),
                    new("Tracked events", events.Count.ToString(), "Legacy Postgres stream (pre-Loki)", "good"),
                ],
                Activity: activity);

            var account = new AdminAccountViewModel(
                Username: "jeremy",
                MfaEnabled: true,
                TrustedDevices: _trustedDevices.ToList(),
                RecentActivity: activity);

            return new AdminWorkspaceViewModel(
                shell,
                _users.ToList(),
                listings,
                _bookings.ToList(),
                analytics,
                _flags.ToList(),
                account);
        }
    }

    /// <summary>
    /// Writes a real <see cref="RoomStatus"/> change to one or more rooms in a single round-trip —
    /// visible to the web funnel. Backs the admin bulk-select action.
    /// </summary>
    public void UpdateListingStatuses(IReadOnlyCollection<Guid> listingIds, string status)
    {
        if (listingIds.Count == 0 || ParseStatus(status) is not RoomStatus parsed)
        {
            return; // Nothing selected, or an unknown UI status (e.g. "Needs review") — no-op.
        }

        using var scope = _scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SteepleDbContext>();
        var rooms = db.Rooms.Where(r => listingIds.Contains(r.Id)).ToList();
        foreach (var room in rooms)
        {
            room.Status = parsed;
        }

        db.SaveChanges();
    }

    // ----- Placeholder mutations (not yet schema-backed) ---------------------------------------
    public void ToggleFeatureFlag(string key, bool enabled)
    {
        lock (_gate)
        {
            var index = _flags.FindIndex(f => string.Equals(f.Key, key, StringComparison.OrdinalIgnoreCase));
            if (index < 0)
            {
                return;
            }

            _flags[index] = _flags[index] with { Enabled = enabled, UpdatedAt = DateTimeOffset.UtcNow };
        }
    }

    public void UpdateUserStatuses(IReadOnlyCollection<Guid> userIds, string status)
    {
        if (userIds.Count == 0 || string.IsNullOrWhiteSpace(status))
        {
            return; // Nothing selected, or no status chosen — no-op.
        }

        lock (_gate)
        {
            foreach (var userId in userIds)
            {
                var index = _users.FindIndex(u => u.Id == userId);
                if (index >= 0)
                {
                    _users[index] = _users[index] with { Status = status };
                }
            }
        }
    }

    private static string DisplayStatus(RoomStatus status) => status switch
    {
        RoomStatus.Published => "Published",
        RoomStatus.Draft => "Draft",
        RoomStatus.Unlisted => "Paused",
        _ => status.ToString(),
    };

    private static RoomStatus? ParseStatus(string status) => status switch
    {
        "Published" => RoomStatus.Published,
        "Draft" => RoomStatus.Draft,
        "Paused" => RoomStatus.Unlisted,
        _ => null,
    };
}
