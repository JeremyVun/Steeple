using Steeple.Admin.ViewModels.Admin;
using Steeple.Persistence;
using Steeple.Persistence.Constants;
using Steeple.Persistence.Models;
using Steeple.Persistence.Queries;
using Microsoft.EntityFrameworkCore;

namespace Steeple.Admin.Services.Admin;

/// <summary>
/// Admin workspace backed by the shared Postgres database (via <see cref="SteepleDbContext"/>).
/// Listings, analytics, and the listing/event metrics are sourced live from the same tables the
/// public web funnel reads — so the two surfaces stay coherent.
///
/// Users, feature flags, and the account/trusted-device views have no schema yet (they arrive
/// with later slices), so those sections remain interactive in-memory placeholders, clearly
/// fenced off below. Registered as a singleton (like the former mock); the scoped DbContext is
/// resolved per operation through <see cref="IServiceScopeFactory"/>.
/// </summary>
public sealed class PostgresAdminWorkspace : IAdminWorkspace
{
    private static readonly System.Text.Json.JsonSerializerOptions PayloadJsonOptions =
        new(System.Text.Json.JsonSerializerDefaults.Web);

    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<PostgresAdminWorkspace> _logger;
    private readonly object _gate = new();

    // ----- Not-yet-schema-backed placeholder state (later slices) -------------------------------
    private readonly List<AdminUserRow> _users;
    private readonly List<AdminFeatureFlagRow> _flags;
    private readonly List<AdminTrustedDeviceRow> _trustedDevices;

    public PostgresAdminWorkspace(IServiceScopeFactory scopeFactory, ILogger<PostgresAdminWorkspace> logger)
    {
        _scopeFactory = scopeFactory;
        _logger = logger;

        var now = DateTimeOffset.UtcNow;

        _users =
        [
            new(Guid.Parse("8f730a1a-1ed6-47e1-8f0b-26a1a237f318"), "Maria Santos", "maria@example.org", "Organizer", "SSO verified", "Active", 3, now.AddHours(-2)),
            new(Guid.Parse("cb104afa-53e5-4a0d-a7fc-679890d42d25"), "Eli Washington", "eli@example.org", "Church admin", "MFA enabled", "Active", 9, now.AddMinutes(-38)),
            new(Guid.Parse("ef6d032f-0641-456e-bbee-66f8eacfb775"), "Nora Patel", "nora@example.org", "Organizer", "New", "Review", 0, now.AddDays(-1)),
            new(Guid.Parse("0f712499-6dd7-41b8-8c03-1e72e25da516"), "St. Mark Office", "office@stmark.example", "Venue admin", "SSO verified", "Paused", 12, now.AddDays(-4)),
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
        var pendingByRoom = db.Applications
            .AsNoTracking()
            .Where(a => a.Status == ApplicationStatus.Pending || a.Status == ApplicationStatus.NeedsInfo)
            .GroupBy(a => a.RoomId)
            .Select(g => new { RoomId = g.Key, Count = g.Count() })
            .ToDictionary(g => g.RoomId, g => g.Count);

        var activeByRoom = db.Bookings
            .AsNoTracking()
            .Where(b => b.Status == BookingStatus.Confirmed)
            .GroupBy(b => b.RoomId)
            .Select(g => new { RoomId = g.Key, Count = g.Count() })
            .ToDictionary(g => g.RoomId, g => g.Count);

        var listings = db.Rooms
            .AsNoTracking()
            .Include(r => r.Venue)
            .OrderBy(r => r.Venue!.Name)
            .ThenBy(r => r.Name)
            .ToList()
            .Select(r => new AdminListingRow(
                r.Id,
                r.Venue!.Name,
                r.Name,
                r.Venue.Suburb,
                r.Capacity,
                DisplayStatus(r.Status),
                r.PricePerHour == null || r.PricePerHour <= 0m ? "Free" : "$" + ((int)r.PricePerHour) + "/hr",
                pendingByRoom.GetValueOrDefault(r.Id),
                activeByRoom.GetValueOrDefault(r.Id)))
            .ToList();

        var bookings = db.Bookings
            .AsNoTracking()
            .Include(b => b.Room!).ThenInclude(r => r.Venue)
            .Include(b => b.Organizer)
            .Include(b => b.Application)
            .OrderByDescending(b => b.CreatedAtUtc)
            .Take(200)
            .ToList()
            .Select(b => new AdminBookingRow(
                b.Id,
                $"{b.Room!.Venue!.Name} / {b.Room.Name}",
                b.Organizer!.DisplayName,
                DescribeSchedule(b),
                DisplayBookingStatus(b.Status),
                b.Application?.IntentText ?? ""))
            .ToList();

        var applications = db.Applications
            .AsNoTracking()
            .Include(a => a.Room!).ThenInclude(r => r.Venue)
            .Include(a => a.Organizer)
            .Include(a => a.Messages)
            .OrderByDescending(a => a.CreatedAtUtc)
            .Take(200)
            .ToList()
            .Select(a => new AdminApplicationRow(
                a.Id,
                a.Room!.Venue!.Name,
                a.Room.Name,
                a.Organizer!.DisplayName,
                a.ActivityType.ToString(),
                a.GroupSize,
                DescribeSchedule(a),
                DisplayApplicationStatus(a.Status),
                a.Messages.Count,
                a.CreatedAtUtc))
            .ToList();

        // Phase 5 moderation queue: publish requests + provider-edited live listings.
        var publishRequests = db.Rooms
            .AsNoTracking()
            .Include(r => r.Venue)
            .Include(r => r.Photos)
            .Where(r => r.PublishRequestedAtUtc != null)
            .OrderBy(r => r.PublishRequestedAtUtc)
            .ToList()
            .Select(r => new AdminPublishRequestRow(
                r.Id,
                r.Venue!.Name,
                r.Name,
                r.Venue.Suburb,
                r.Capacity,
                r.PricePerHour == null || r.PricePerHour <= 0m ? "Free" : "$" + ((int)r.PricePerHour) + "/hr",
                r.Photos.Count,
                r.PublishRequestedAtUtc!.Value,
                r.Description,
                r.Photos
                    .OrderBy(p => p.SortOrder)
                    .Take(4)
                    .Select(p => p.ThumbUrl ?? p.Url)
                    .ToList()))
            .ToList();

        var editedRooms = db.Rooms
            .AsNoTracking()
            .Include(r => r.Venue)
            .Where(r => r.ProviderEditedAtUtc != null)
            .ToList()
            .Select(r => new AdminEditedListingRow(r.Id, false, r.Venue!.Name, r.Name, r.ProviderEditedAtUtc!.Value));

        var editedVenues = db.Venues
            .AsNoTracking()
            .Where(v => v.ProviderEditedAtUtc != null)
            .ToList()
            .Select(v => new AdminEditedListingRow(v.Id, true, v.Name, null, v.ProviderEditedAtUtc!.Value));

        var moderation = new AdminModerationViewModel(
            publishRequests,
            editedRooms.Concat(editedVenues).OrderBy(e => e.EditedAt).ToList());

        var venueManagers = db.VenueManagers
            .AsNoTracking()
            .Include(m => m.Venue)
            .Include(m => m.User)
            .OrderBy(m => m.Venue!.Name)
            .ToList()
            .Select(m => new AdminVenueManagerRow(
                m.Id,
                m.Venue!.Name,
                m.User!.DisplayName,
                m.User.Email ?? "—",
                m.CreatedAtUtc))
            .ToList();

        var venueOptions = db.Venues
            .AsNoTracking()
            .OrderBy(v => v.Name)
            .Select(v => new AdminVenueOption(v.Id, v.Name))
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

        var pendingApplications = applications.Count(a => a.Status is "Pending" or "Needs info");
        var userCount = db.Users.Count(u => u.DeletedAtUtc == null);

        lock (_gate)
        {
            var shell = new AdminShellViewModel(
                ActiveSection: "overview",
                Metrics:
                [
                    new("Pending applications", pendingApplications.ToString(), "Awaiting a decision", pendingApplications > 0 ? "warn" : "good"),
                    new("Moderation queue", (publishRequests.Count + moderation.EditedListings.Count).ToString(),
                        "Publish requests + edited listings", publishRequests.Count > 0 ? "warn" : "good"),
                    new("Published listings", publishedCount.ToString(), "Live in discovery", "good"),
                    new("Accounts", userCount.ToString(), "SSO sign-ups", "good"),
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
                bookings,
                applications,
                moderation,
                venueManagers,
                venueOptions,
                analytics,
                _flags.ToList(),
                account);
        }
    }

    /// <summary>
    /// Writes a real <see cref="RoomStatus"/> change to one or more rooms in a single round-trip —
    /// visible to the web funnel. Backs the admin bulk-select action. The listing lifecycle honors
    /// bookings (SYSTEM_DESIGN §5): a room with future confirmed occurrences can't leave Published
    /// — those rooms are skipped and named in the returned message (null when nothing was blocked).
    /// </summary>
    public string? UpdateListingStatuses(IReadOnlyCollection<Guid> listingIds, string status)
    {
        if (listingIds.Count == 0 || ParseStatus(status) is not RoomStatus parsed)
        {
            return null; // Nothing selected, or an unknown UI status (e.g. "Needs review") — no-op.
        }

        using var scope = _scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SteepleDbContext>();
        var now = DateTimeOffset.UtcNow;
        var rooms = db.Rooms.Where(r => listingIds.Contains(r.Id)).ToList();

        string? blockedMessage = null;
        if (parsed != RoomStatus.Published)
        {
            // Shared with Api's EfManageRepository.HasFutureConfirmedOccurrencesAsync — the rule
            // that ending a commitment needs explicit cancellation lives once in Persistence.
            var blockedIds = db.RoomIdsWithFutureConfirmedOccurrences(listingIds, now).ToHashSet();

            if (blockedIds.Count > 0)
            {
                var blockedNames = rooms.Where(r => blockedIds.Contains(r.Id)).Select(r => r.Name);
                blockedMessage =
                    $"Kept published — upcoming confirmed bookings: {string.Join(", ", blockedNames)}. " +
                    "Cancel the bookings first (ending commitments needs explicit cancellation with notice).";
                rooms = rooms.Where(r => !blockedIds.Contains(r.Id)).ToList();
            }
        }

        foreach (var room in rooms)
        {
            room.Status = parsed;
            room.UpdatedAtUtc = now; // sitemap lastmod
        }

        db.SaveChanges();
        return blockedMessage;
    }

    /// <summary>
    /// Manual state repair (ROADMAP Phase 2): force applications to a status when something went
    /// sideways (e.g. a church decided over the phone). Bypasses the API's state machine on
    /// purpose — this is the operator override, and it sends no notifications.
    /// </summary>
    public void UpdateApplicationStatuses(IReadOnlyCollection<Guid> applicationIds, string status)
    {
        if (applicationIds.Count == 0 || ParseApplicationStatus(status) is not ApplicationStatus parsed)
        {
            return;
        }

        using var scope = _scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SteepleDbContext>();
        var now = DateTimeOffset.UtcNow;
        foreach (var application in db.Applications.Where(a => applicationIds.Contains(a.Id)).ToList())
        {
            application.Status = parsed;
            application.DecidedAtUtc = parsed is ApplicationStatus.Pending or ApplicationStatus.NeedsInfo ? null : now;
        }

        db.SaveChanges();
    }

    /// <inheritdoc />
    public string? LinkVenueManager(Guid venueId, string email)
    {
        var trimmed = email.Trim();
        if (trimmed.Length == 0)
        {
            return "Enter the email the person signs in with.";
        }

        using var scope = _scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SteepleDbContext>();

        if (!db.Venues.Any(v => v.Id == venueId))
        {
            return "Pick a venue.";
        }

        // The email must belong to an existing SSO account — the person signs in first, then the
        // founder links them (concierge order of operations, ROADMAP Phase 2).
        var user = db.Users
            .Where(u => u.DeletedAtUtc == null && u.Email != null && u.Email.ToLower() == trimmed.ToLower())
            .FirstOrDefault();
        if (user is null)
        {
            return $"No account with the email '{trimmed}' — ask them to sign in on the web first.";
        }

        if (db.VenueManagers.Any(m => m.VenueId == venueId && m.UserId == user.Id))
        {
            return null; // Already linked — idempotent.
        }

        db.VenueManagers.Add(new VenueManager
        {
            Id = Guid.NewGuid(),
            VenueId = venueId,
            UserId = user.Id,
            CreatedAtUtc = DateTimeOffset.UtcNow,
        });
        db.SaveChanges();
        return null;
    }

    /// <inheritdoc />
    public string? DecidePublishRequest(Guid roomId, bool approve, string? note, string operatorUser)
    {
        using var scope = _scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SteepleDbContext>();

        var room = db.Rooms
            .Include(r => r.Venue)
            .FirstOrDefault(r => r.Id == roomId);
        if (room is null || room.PublishRequestedAtUtc is null)
        {
            return "That publish request is gone — someone else may have decided it.";
        }

        var now = DateTimeOffset.UtcNow;
        room.PublishRequestedAtUtc = null;
        if (approve)
        {
            room.Status = RoomStatus.Published;
            room.FirstPublishedAtUtc ??= now; // relist is provider-controlled from here on
            room.ProviderEditedAtUtc = null;  // approval is also the review
            room.UpdatedAtUtc = now;          // sitemap lastmod
        }

        // Inbox rows for the venue's managers (inbox = truth; the Admin surface has no email/push
        // fan-out — a provider checking the web/app inbox is the deal at this scale).
        var payloadJson = System.Text.Json.JsonSerializer.Serialize(
            new
            {
                roomId = room.Id,
                roomName = room.Name,
                venueName = room.Venue!.Name,
                venueSlug = room.Venue.Slug,
                roomSlug = room.Slug,
                status = approve ? "published" : "declined",
                note = string.IsNullOrWhiteSpace(note) ? null : note.Trim(),
                deepLink = approve ? $"/space/{room.Venue.Slug}/{room.Slug}" : "/inbox",
            },
            PayloadJsonOptions);

        var managerIds = db.VenueManagers
            .Where(m => m.VenueId == room.VenueId)
            .Select(m => m.UserId)
            .ToList();
        foreach (var userId in managerIds)
        {
            db.Notifications.Add(new Notification
            {
                Id = Guid.NewGuid(),
                UserId = userId,
                Type = approve ? NotificationType.ListingApproved : NotificationType.ListingDeclined,
                PayloadJson = payloadJson,
                CreatedAtUtc = now,
            });
        }

        db.SaveChanges();

        // Same stdout→Promtail→Loki shape the API sink and Web's WebAnalytics emit (CONTRACTS §7
        // listing_moderated) — EventType, OccurredAtUtc, SessionId, PayloadJson, in that order.
        // Admin has no browser session, so SessionId is the fixed "admin" token.
        _logger.LogInformation(
            "analytics_event {EventType} {OccurredAtUtc} {SessionId} {PayloadJson}",
            "listing_moderated",
            now.ToString("o"),
            "admin",
            System.Text.Json.JsonSerializer.Serialize(
                new { roomId = room.Id, outcome = approve ? "approved" : "declined", actor = operatorUser },
                PayloadJsonOptions));

        return null;
    }

    /// <inheritdoc />
    public void MarkRoomReviewed(Guid roomId, string operatorUser)
    {
        using var scope = _scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SteepleDbContext>();
        db.Rooms.Where(r => r.Id == roomId)
            .ExecuteUpdate(s => s.SetProperty(r => r.ProviderEditedAtUtc, (DateTimeOffset?)null));
        _logger.LogInformation("Moderation: {Actor} marked room {RoomId} reviewed.", operatorUser, roomId);
    }

    /// <inheritdoc />
    public void MarkVenueReviewed(Guid venueId, string operatorUser)
    {
        using var scope = _scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SteepleDbContext>();
        db.Venues.Where(v => v.Id == venueId)
            .ExecuteUpdate(s => s.SetProperty(v => v.ProviderEditedAtUtc, (DateTimeOffset?)null));
        _logger.LogInformation("Moderation: {Actor} marked venue {VenueId} reviewed.", operatorUser, venueId);
    }

    /// <inheritdoc />
    public void UnlinkVenueManager(Guid venueManagerId)
    {
        using var scope = _scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SteepleDbContext>();
        db.VenueManagers.Where(m => m.Id == venueManagerId).ExecuteDelete();
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

    private static string DisplayApplicationStatus(ApplicationStatus status) => status switch
    {
        ApplicationStatus.NeedsInfo => "Needs info",
        _ => status.ToString(),
    };

    private static ApplicationStatus? ParseApplicationStatus(string status) => status switch
    {
        "Pending" => ApplicationStatus.Pending,
        "Needs info" => ApplicationStatus.NeedsInfo,
        "Approved" => ApplicationStatus.Approved,
        "Declined" => ApplicationStatus.Declined,
        "Withdrawn" => ApplicationStatus.Withdrawn,
        "Expired" => ApplicationStatus.Expired,
        _ => null,
    };

    private static string DescribeSchedule(Application a)
    {
        var times = $"{a.StartTime:h\\:mm tt}–{a.EndTime:h\\:mm tt}";
        return a.Frequency == ScheduleFrequency.RecurringWeekly
            ? $"{a.DayOfWeek}s {times}, {a.StartDate:MMM d} – {a.EndDate:MMM d, yyyy}"
            : $"{a.StartDate:ddd, MMM d yyyy}, {times}";
    }

    private static string DescribeSchedule(Booking b)
    {
        var times = $"{b.StartTime:h\\:mm tt}–{b.EndTime:h\\:mm tt}";
        return b.Type == BookingType.Recurring
            ? $"{b.DayOfWeek}s {times}, {b.StartDate:MMM d} – {b.EndDate:MMM d, yyyy}"
            : $"{b.StartDate:ddd, MMM d yyyy}, {times}";
    }

    private static string DisplayBookingStatus(BookingStatus status) => status.ToString();
}
