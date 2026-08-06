using Steeple.Admin.ViewModels.Admin;
using Steeple.Persistence;
using Steeple.Persistence.Constants;
using Steeple.Persistence.Models;
using Steeple.Persistence.Queries;
using Microsoft.EntityFrameworkCore;

namespace Steeple.Admin.Services.Admin;

/// <summary>
/// Admin workspace backed by the shared Postgres database (via <see cref="SteepleDbContext"/>) —
/// the documented direct-Persistence pattern, gated by authelia at the edge. Every row it shows is
/// real: the review queue, the listing takedown surface, and venue-manager links. Registered as a
/// singleton; the scoped DbContext is resolved per operation through
/// <see cref="IServiceScopeFactory"/>.
/// </summary>
public sealed class PostgresAdminWorkspace : IAdminWorkspace
{
    private static readonly System.Text.Json.JsonSerializerOptions PayloadJsonOptions =
        new(System.Text.Json.JsonSerializerDefaults.Web);

    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<PostgresAdminWorkspace> _logger;

    public PostgresAdminWorkspace(IServiceScopeFactory scopeFactory, ILogger<PostgresAdminWorkspace> logger)
    {
        _scopeFactory = scopeFactory;
        _logger = logger;
    }

    public AdminWorkspaceViewModel Snapshot()
    {
        using var scope = _scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SteepleDbContext>();

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
                DisplayStatus(r.Status),
                "$" + ((int)r.PricePerHour) + "/hr",
                pendingByRoom.GetValueOrDefault(r.Id),
                activeByRoom.GetValueOrDefault(r.Id)))
            .ToList();

        // The review queue: first-listing publish requests, with the venue's evidence and hosts
        // folded into each item — one decision, one card (D2/D3).
        var publishRequestRooms = db.Rooms
            .AsNoTracking()
            .Include(r => r.Venue)
            .Include(r => r.Photos)
            .Where(r => r.PublishRequestedAtUtc != null)
            .OrderBy(r => r.PublishRequestedAtUtc)
            .ToList();

        var queuedVenueIds = publishRequestRooms.Select(r => r.VenueId).Distinct().ToList();

        var evidenceByVenue = db.VenueVerificationRequests
            .AsNoTracking()
            .Include(r => r.Documents)
            .Where(r => queuedVenueIds.Contains(r.VenueId))
            .OrderByDescending(r => r.RequestedAtUtc)
            .ToList()
            .GroupBy(r => r.VenueId)
            .ToDictionary(
                g => g.Key,
                g => new AdminVenueEvidence(
                    g.First().ContactName,
                    g.First().ContactEmail,
                    g.First().EvidenceSummary,
                    g.First().RequestedAtUtc,
                    g.First().Documents
                        .OrderBy(d => d.CreatedAtUtc)
                        .Select(d => new AdminVenueEvidenceDocument(d.Label, d.ExternalUrl))
                        .ToList()));

        var hostsByVenue = db.VenueManagers
            .AsNoTracking()
            .Include(m => m.User)
            .Where(m => queuedVenueIds.Contains(m.VenueId))
            .ToList()
            .GroupBy(m => m.VenueId)
            .ToDictionary(
                g => g.Key,
                g => (IReadOnlyList<string>)g
                    .Select(m => m.User!.Email is { Length: > 0 } email
                        ? $"{m.User.DisplayName} ({email})"
                        : m.User!.DisplayName)
                    .ToList());

        var publishRequests = publishRequestRooms
            .Select(r => new AdminPublishRequestRow(
                r.Id,
                r.Venue!.Name,
                r.Name,
                r.Venue.Suburb,
                r.Venue.AddressLine,
                r.Capacity,
                "$" + ((int)r.PricePerHour) + "/hr",
                r.Photos.Count,
                r.PublishRequestedAtUtc!.Value,
                r.Description,
                r.Photos
                    .OrderBy(p => p.SortOrder)
                    .Take(4)
                    .Select(p => p.ThumbUrl ?? p.Url)
                    .ToList(),
                hostsByVenue.GetValueOrDefault(r.VenueId, []),
                evidenceByVenue.GetValueOrDefault(r.VenueId)))
            .ToList();

        var ratingComments = db.Ratings
            .AsNoTracking()
            .Include(r => r.Booking!).ThenInclude(b => b.Room!).ThenInclude(r => r.Venue)
            .Include(r => r.Rater)
            .Include(r => r.Organizer)
            .Where(r => r.Comment != null && r.Comment != "")
            .OrderByDescending(r => r.CreatedAtUtc)
            .Take(100)
            .ToList()
            .Select(r => new AdminRatingCommentRow(
                r.Id,
                r.Booking?.Room?.Venue?.Name ?? "Unknown venue",
                r.Booking?.Room?.Name ?? "Unknown room",
                r.Rater?.DisplayName ?? "Unknown user",
                r.RateeType == RatingRateeType.Venue
                    ? r.Booking?.Room?.Venue?.Name ?? "Venue"
                    : r.Organizer?.DisplayName ?? "Organizer",
                r.Stars,
                r.Comment!,
                r.CreatedAtUtc,
                r.HiddenAtUtc))
            .ToList();

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

        var publishedCount = listings.Count(l => l.Status == "Published");
        var shell = new AdminShellViewModel(
        [
            new("Awaiting review", publishRequests.Count.ToString(), "First listings needing a decision",
                publishRequests.Count > 0 ? "warn" : "good"),
            new("Published listings", publishedCount.ToString(), "Live in discovery", "good"),
            new("Venues", venueOptions.Count.ToString(), "On the platform", "good"),
            new("Linked hosts", venueManagers.Count.ToString(), "Accounts that can manage a venue", "good"),
        ]);

        return new AdminWorkspaceViewModel(
            shell,
            new AdminReviewQueueViewModel(publishRequests, ratingComments),
            listings,
            venueManagers,
            venueOptions);
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
    public void UnlinkVenueManager(Guid venueManagerId)
    {
        using var scope = _scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SteepleDbContext>();
        db.VenueManagers.Where(m => m.Id == venueManagerId).ExecuteDelete();
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
            room.FirstPublishedAtUtc ??= now; // the host is trusted from here on (D2)
            room.ProviderEditedAtUtc = null;  // approval is also the review
            room.UpdatedAtUtc = now;          // sitemap lastmod
            // Invariant, matching ManageService's: published ⇒ venue verified. This decision *is*
            // the venue's verification — there is no separate verification decision.
            room.Venue!.IsIdentityVerified = true;
            room.Venue.UpdatedAtUtc = now;
        }

        // The evidence submission (if any) exists to inform this decision — it's consumed by it,
        // so the host can submit fresh evidence after a decline instead of being stuck "pending".
        foreach (var evidence in db.VenueVerificationRequests
            .Where(r => r.VenueId == room.VenueId && r.Status == VenueVerificationStatus.Pending)
            .ToList())
        {
            evidence.Status = approve ? VenueVerificationStatus.Approved : VenueVerificationStatus.Declined;
            evidence.DecidedAtUtc = now;
            evidence.DecidedBy = operatorUser;
            evidence.DecisionNote = string.IsNullOrWhiteSpace(note) ? null : note.Trim();
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

        // Same stdout→Promtail→Loki shape the API sink emits (CONTRACTS §7 listing_moderated) —
        // EventType, OccurredAtUtc, SessionId, PayloadJson, in that order. Admin has no browser
        // session, so SessionId is the fixed "admin" token.
        LogAnalytics(
            "listing_moderated",
            now,
            new { roomId = room.Id, venueId = room.VenueId, outcome = approve ? "approved" : "declined", actor = operatorUser });

        return null;
    }

    /// <inheritdoc />
    public string? UnlistRoom(Guid roomId, string operatorUser)
    {
        using var scope = _scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SteepleDbContext>();

        var room = db.Rooms.Include(r => r.Venue).FirstOrDefault(r => r.Id == roomId);
        if (room is null)
        {
            return "That listing is gone.";
        }

        if (room.Status != RoomStatus.Published)
        {
            return $"{room.Name} isn't published — nothing to take down.";
        }

        var now = DateTimeOffset.UtcNow;
        room.Status = RoomStatus.Unlisted;
        room.PublishRequestedAtUtc = null;
        room.OperatorUnlistedAtUtc = now;
        room.OperatorUnlistedBy = operatorUser;
        room.UpdatedAtUtc = now; // sitemap lastmod
        db.SaveChanges();

        LogAnalytics(
            "listing_unlisted_by_operator",
            now,
            new { roomId = room.Id, venueId = room.VenueId, actor = operatorUser });

        return null;
    }

    /// <inheritdoc />
    public void SetRatingHidden(Guid ratingId, bool hidden, string operatorUser)
    {
        using var scope = _scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SteepleDbContext>();
        var hiddenAt = hidden ? DateTimeOffset.UtcNow : (DateTimeOffset?)null;
        db.Ratings.Where(r => r.Id == ratingId)
            .ExecuteUpdate(s => s.SetProperty(r => r.HiddenAtUtc, hiddenAt));
        _logger.LogInformation(
            "Moderation: {Actor} {Action} rating {RatingId}.",
            operatorUser,
            hidden ? "hid" : "restored",
            ratingId);
    }

    private void LogAnalytics(string eventType, DateTimeOffset at, object payload) =>
        _logger.LogInformation(
            "analytics_event {EventType} {OccurredAtUtc} {SessionId} {PayloadJson}",
            eventType,
            at.ToString("o"),
            "admin",
            System.Text.Json.JsonSerializer.Serialize(payload, PayloadJsonOptions));

    private static string DisplayStatus(RoomStatus status) => status switch
    {
        RoomStatus.Published => "Published",
        RoomStatus.Draft => "Draft",
        RoomStatus.Unlisted => "Unlisted",
        _ => status.ToString(),
    };
}
