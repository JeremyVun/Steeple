using Microsoft.Extensions.Options;
using Steeple.Api.Contracts.Manage;

namespace Steeple.Api.Services.Manage;
/// <summary>
/// Default <see cref="IManageService"/>. Providers create and edit freely; publishing is the
/// moderated step: a never-approved room's "publish" becomes a publish *request* for the Admin
/// queue, while an already-approved room relists directly. Edits to live listings are applied
/// immediately but flagged (<c>ProviderEditedAtUtc</c>) for the Admin review feed — quality gate
/// without edit friction (ROADMAP Phase 5).
/// </summary>
public sealed class ManageService : IManageService
{
    private readonly IManageRepository _repository;
    private readonly IVenueManagerRepository _venueManagers;
    private readonly IGeocodingGateway _geocoding;
    private readonly IGeofencePolicy _geofence;
    private readonly IAnalyticsSink _analytics;
    private readonly TimeProvider _clock;
    private readonly GeocodingOptions _geocodingOptions;

    /// <summary>Creates the service from its ports.</summary>
    public ManageService(
        IManageRepository repository,
        IVenueManagerRepository venueManagers,
        IGeocodingGateway geocoding,
        IGeofencePolicy geofence,
        IAnalyticsSink analytics,
        TimeProvider clock,
        IOptions<GeocodingOptions> geocodingOptions)
    {
        _repository = repository;
        _venueManagers = venueManagers;
        _geocoding = geocoding;
        _geofence = geofence;
        _analytics = analytics;
        _clock = clock;
        _geocodingOptions = geocodingOptions.Value;
    }

    /// <inheritdoc />
    public async Task<ManageResult<ManagedVenueDetailDto>> GetVenueAsync(Guid callerId, Guid venueId, CancellationToken ct = default)
    {
        var (venue, error) = await LoadScopedVenueAsync(callerId, venueId, ct).ConfigureAwait(false);
        return error is not null
            ? new ManageResult<ManagedVenueDetailDto>(null, error)
            : ManageResult<ManagedVenueDetailDto>.Ok(venue!.ToManagedDetailDto());
    }

    /// <inheritdoc />
    public async Task<ManageResult<ManagedVenueDetailDto>> CreateVenueAsync(Guid callerId, SaveVenueRequest request, CancellationToken ct = default)
    {
        var name = request.Name?.Trim() ?? "";
        var description = request.Description?.Trim() ?? "";
        var addressLine = request.AddressLine?.Trim() ?? "";
        var suburb = request.Suburb?.Trim() ?? "";
        var postcode = request.Postcode?.Trim() ?? "";

        if (ValidateVenueFields(name, description, addressLine, suburb, postcode, request) is { } invalid)
        {
            return ManageResult<ManagedVenueDetailDto>.Fail(ManageErrorCodes.InvalidVenue, invalid);
        }

        var venueType = FlagEnumExtensions.ParseToken<VenueType>(request.VenueType) ?? VenueType.Church;

        var location = await GeocodeInsideBeachheadAsync(addressLine, suburb, postcode, ct).ConfigureAwait(false);
        if (location.Error is not null)
        {
            return new ManageResult<ManagedVenueDetailDto>(null, location.Error);
        }

        var baseSlug = Slugs.From(name);
        if (baseSlug.Length == 0)
        {
            return ManageResult<ManagedVenueDetailDto>.Fail(ManageErrorCodes.InvalidVenue, "Give the venue a name.");
        }

        var now = _clock.GetUtcNow();
        var venue = new Venue
        {
            Id = Guid.NewGuid(),
            Name = name,
            Slug = await Slugs.UniquifyAsync(baseSlug, s => _repository.VenueSlugExistsAsync(s, ct)).ConfigureAwait(false),
            Description = description,
            Type = venueType,
            AddressLine = addressLine,
            Suburb = suburb,
            Postcode = postcode,
            Latitude = location.Point!.Value.Latitude,
            Longitude = location.Point.Value.Longitude,
            ContactEmail = NormalizeOptional(request.ContactEmail),
            ParkingInfo = request.ParkingInfo?.Trim() ?? "",
            TransitInfo = request.TransitInfo?.Trim() ?? "",
            IsIdentityVerified = false, // concierge/Admin verification, never self-claimed
            // The beachhead is single-timezone; an areas table brings per-area zones (SYSTEM_DESIGN §10).
            Timezone = "America/New_York",
            CreatedAtUtc = now,
            UpdatedAtUtc = now,
        };

        await _repository.AddVenueWithManagerAsync(venue, callerId, ct).ConfigureAwait(false);
        await TrackSafelyAsync("venue_created", new { venueId = venue.Id, suburb = venue.Suburb }).ConfigureAwait(false);

        return ManageResult<ManagedVenueDetailDto>.Ok(venue.ToManagedDetailDto());
    }

    /// <inheritdoc />
    public async Task<ManageResult<ManagedVenueDetailDto>> UpdateVenueAsync(Guid callerId, Guid venueId, SaveVenueRequest request, CancellationToken ct = default)
    {
        var (venue, error) = await LoadScopedVenueAsync(callerId, venueId, ct).ConfigureAwait(false);
        if (error is not null)
        {
            return new ManageResult<ManagedVenueDetailDto>(null, error);
        }

        var name = request.Name?.Trim() ?? venue!.Name;
        var description = request.Description?.Trim() ?? venue!.Description;
        var addressLine = request.AddressLine?.Trim() ?? venue!.AddressLine;
        var suburb = request.Suburb?.Trim() ?? venue!.Suburb;
        var postcode = request.Postcode?.Trim() ?? venue!.Postcode;

        if (ValidateVenueFields(name, description, addressLine, suburb, postcode, request) is { } invalid)
        {
            return ManageResult<ManagedVenueDetailDto>.Fail(ManageErrorCodes.InvalidVenue, invalid);
        }

        var addressChanged = addressLine != venue!.AddressLine
            || suburb != venue.Suburb
            || postcode != venue.Postcode;

        if (addressChanged)
        {
            var location = await GeocodeInsideBeachheadAsync(addressLine, suburb, postcode, ct).ConfigureAwait(false);
            if (location.Error is not null)
            {
                return new ManageResult<ManagedVenueDetailDto>(null, location.Error);
            }

            venue.Latitude = location.Point!.Value.Latitude;
            venue.Longitude = location.Point.Value.Longitude;
        }

        venue.Name = name;
        venue.Description = description;
        venue.AddressLine = addressLine;
        venue.Suburb = suburb;
        venue.Postcode = postcode;
        if (FlagEnumExtensions.ParseToken<VenueType>(request.VenueType) is { } venueType)
        {
            venue.Type = venueType;
        }
        if (request.ContactEmail is not null)
        {
            venue.ContactEmail = NormalizeOptional(request.ContactEmail);
        }
        venue.ParkingInfo = request.ParkingInfo?.Trim() ?? venue.ParkingInfo;
        venue.TransitInfo = request.TransitInfo?.Trim() ?? venue.TransitInfo;

        var now = _clock.GetUtcNow();
        venue.UpdatedAtUtc = now;
        // Checked live against the DB, not the in-memory snapshot loaded at request start — a
        // room published concurrently between load and save must still flag for Admin review.
        if (await _repository.HasPublishedRoomsAsync(venue.Id, ct).ConfigureAwait(false))
        {
            venue.ProviderEditedAtUtc = now;
        }

        await _repository.SaveChangesAsync(ct).ConfigureAwait(false);
        return ManageResult<ManagedVenueDetailDto>.Ok(venue.ToManagedDetailDto());
    }

    /// <inheritdoc />
    public async Task<ManageResult<ManagedVenueDetailDto>> SubmitVenueVerificationAsync(
        Guid callerId, Guid venueId, SubmitVenueVerificationRequest request, CancellationToken ct = default)
    {
        var (venue, error) = await LoadScopedVenueAsync(callerId, venueId, ct).ConfigureAwait(false);
        if (error is not null)
        {
            return new ManageResult<ManagedVenueDetailDto>(null, error);
        }

        if (venue!.IsIdentityVerified)
        {
            return ManageResult<ManagedVenueDetailDto>.Fail(
                ManageErrorCodes.AlreadyVerified, "This venue is already verified.");
        }

        if (await _repository.HasPendingVenueVerificationRequestAsync(venue.Id, ct).ConfigureAwait(false))
        {
            return ManageResult<ManagedVenueDetailDto>.Fail(
                ManageErrorCodes.VerificationPending, "This venue already has a verification request in review.");
        }

        var contactName = request.ContactName?.Trim() ?? "";
        var contactEmail = NormalizeOptional(request.ContactEmail);
        var evidenceSummary = request.EvidenceSummary?.Trim() ?? "";
        var documents = request.Documents ?? [];

        if (ValidateVerificationFields(contactName, contactEmail, evidenceSummary, request.AttestedAuthority, documents) is { } invalid)
        {
            return ManageResult<ManagedVenueDetailDto>.Fail(ManageErrorCodes.InvalidVerification, invalid);
        }

        var now = _clock.GetUtcNow();
        var verification = new VenueVerificationRequest
        {
            Id = Guid.NewGuid(),
            VenueId = venue.Id,
            RequestedByUserId = callerId,
            Status = VenueVerificationStatus.Pending,
            ContactName = contactName,
            ContactEmail = contactEmail,
            EvidenceSummary = evidenceSummary,
            AttestedAuthority = true,
            RequestedAtUtc = now,
            Documents = documents
                .Select(d => new VenueVerificationDocument
                {
                    Id = Guid.NewGuid(),
                    Label = d.Label!.Trim(),
                    ExternalUrl = d.Url!.Trim(),
                    CreatedAtUtc = now,
                })
                .ToList(),
        };

        venue.VerificationRequests.Add(verification);
        await _repository.AddVenueVerificationRequestAsync(verification, ct).ConfigureAwait(false);
        await TrackSafelyAsync("venue_verification_requested", new { venueId = venue.Id, documentCount = verification.Documents.Count }).ConfigureAwait(false);

        return ManageResult<ManagedVenueDetailDto>.Ok(venue.ToManagedDetailDto());
    }

    /// <inheritdoc />
    public async Task<ManageResult<ManagedRoomDto>> GetRoomAsync(Guid callerId, Guid roomId, CancellationToken ct = default)
    {
        var (room, error) = await LoadScopedRoomAsync(callerId, roomId, ct).ConfigureAwait(false);
        return error is not null
            ? new ManageResult<ManagedRoomDto>(null, error)
            : ManageResult<ManagedRoomDto>.Ok(room!.ToManagedDto());
    }

    /// <inheritdoc />
    public async Task<ManageResult<ManagedRoomDto>> CreateRoomAsync(Guid callerId, Guid venueId, SaveRoomRequest request, CancellationToken ct = default)
    {
        var (venue, error) = await LoadScopedVenueAsync(callerId, venueId, ct).ConfigureAwait(false);
        if (error is not null)
        {
            return new ManageResult<ManagedRoomDto>(null, error);
        }

        var name = request.Name?.Trim() ?? "";
        var description = request.Description?.Trim() ?? "";
        var capacity = request.Capacity ?? 0;

        if (ValidateRoomFields(name, description, capacity, request) is { } invalid)
        {
            return ManageResult<ManagedRoomDto>.Fail(ManageErrorCodes.InvalidRoom, invalid);
        }

        var (flags, unknownToken) = ParseRoomFlags(request);
        if (unknownToken is not null)
        {
            return ManageResult<ManagedRoomDto>.Fail(ManageErrorCodes.InvalidRoom, $"Unknown token '{unknownToken}'.");
        }

        var baseSlug = Slugs.From(name);
        if (baseSlug.Length == 0)
        {
            return ManageResult<ManagedRoomDto>.Fail(ManageErrorCodes.InvalidRoom, "Give the room a name.");
        }

        var now = _clock.GetUtcNow();
        var room = new Room
        {
            Id = Guid.NewGuid(),
            VenueId = venue!.Id,
            Venue = venue,
            Name = name,
            Slug = await Slugs.UniquifyAsync(baseSlug, s => _repository.RoomSlugExistsAsync(venue.Id, s, ct)).ConfigureAwait(false),
            Description = description,
            Capacity = capacity,
            PricePerHour = NormalizePrice(request.PricePerHour),
            Currency = "USD",
            HouseRules = request.HouseRules?.Trim() ?? "",
            Status = RoomStatus.Draft, // publishing is the moderated step
            AcceptedActivityTypes = flags.Activities,
            Amenities = flags.Amenities,
            AccessibilityFeatures = flags.Accessibility,
            CreatedAtUtc = now,
            UpdatedAtUtc = now,
        };

        await _repository.AddRoomAsync(room, ct).ConfigureAwait(false);
        await TrackSafelyAsync("room_created", new { roomId = room.Id, venueId = venue.Id }).ConfigureAwait(false);

        return ManageResult<ManagedRoomDto>.Ok(room.ToManagedDto());
    }

    /// <inheritdoc />
    public async Task<ManageResult<ManagedRoomDto>> UpdateRoomAsync(Guid callerId, Guid roomId, SaveRoomRequest request, CancellationToken ct = default)
    {
        var (room, error) = await LoadScopedRoomAsync(callerId, roomId, ct).ConfigureAwait(false);
        if (error is not null)
        {
            return new ManageResult<ManagedRoomDto>(null, error);
        }

        var name = request.Name?.Trim() ?? room!.Name;
        var description = request.Description?.Trim() ?? room!.Description;
        var capacity = request.Capacity ?? room!.Capacity;

        if (ValidateRoomFields(name, description, capacity, request) is { } invalid)
        {
            return ManageResult<ManagedRoomDto>.Fail(ManageErrorCodes.InvalidRoom, invalid);
        }

        RoomStatus? requestedStatus = null;
        if (request.Status is not null)
        {
            requestedStatus = FlagEnumExtensions.ParseToken<RoomStatus>(request.Status);
            if (requestedStatus is null)
            {
                return ManageResult<ManagedRoomDto>.Fail(ManageErrorCodes.InvalidRoom, $"Unknown status '{request.Status}'.");
            }
        }

        var (flags, unknownToken) = ParseRoomFlags(request);
        if (unknownToken is not null)
        {
            return ManageResult<ManagedRoomDto>.Fail(ManageErrorCodes.InvalidRoom, $"Unknown token '{unknownToken}'.");
        }

        var now = _clock.GetUtcNow();

        // Status transition first — it can fail, and nothing should be half-applied.
        var publishNewlyRequested = false;
        if (requestedStatus is { } target && target != room!.Status)
        {
            if (room.Status == RoomStatus.Published)
            {
                if (await _repository.HasFutureConfirmedOccurrencesAsync(room.Id, now, ct).ConfigureAwait(false))
                {
                    return ManageResult<ManagedRoomDto>.Fail(
                        ManageErrorCodes.HasActiveBookings,
                        "This room has upcoming confirmed bookings — cancel them before unpublishing.");
                }

                room.Status = target;
            }
            else if (target == RoomStatus.Published)
            {
                if (room.Photos.Count == 0)
                {
                    return ManageResult<ManagedRoomDto>.Fail(
                        ManageErrorCodes.NoPhotos, "Add at least one photo before publishing.");
                }

                if (room.FirstPublishedAtUtc is not null)
                {
                    // Already passed moderation once — relisting is provider-controlled.
                    room.Status = RoomStatus.Published;
                    room.ProviderEditedAtUtc = now;
                }
                else if (room.PublishRequestedAtUtc is null)
                {
                    room.PublishRequestedAtUtc = now; // joins the Admin moderation queue
                    publishNewlyRequested = true;
                }
            }
            else
            {
                room.Status = target;
            }
        }

        // An explicit draft/unlisted ask withdraws a pending publish request.
        if (requestedStatus is RoomStatus.Draft or RoomStatus.Unlisted)
        {
            room!.PublishRequestedAtUtc = null;
        }

        var contentChanged = name != room!.Name
            || description != room.Description
            || capacity != room.Capacity
            || request.PricePerHour is not null
            || request.HouseRules is not null
            || request.Activities is not null
            || request.Amenities is not null
            || request.Accessibility is not null;

        room.Name = name;
        room.Description = description;
        room.Capacity = capacity;
        if (request.PricePerHour is not null)
        {
            room.PricePerHour = NormalizePrice(request.PricePerHour);
        }
        room.HouseRules = request.HouseRules?.Trim() ?? room.HouseRules;
        if (request.Activities is not null)
        {
            room.AcceptedActivityTypes = flags.Activities;
        }
        if (request.Amenities is not null)
        {
            room.Amenities = flags.Amenities;
        }
        if (request.Accessibility is not null)
        {
            room.AccessibilityFeatures = flags.Accessibility;
        }

        room.UpdatedAtUtc = now;
        if (contentChanged && room.Status == RoomStatus.Published)
        {
            // Live listing changed — flag for the Admin review feed (edit is not blocked).
            room.ProviderEditedAtUtc = now;
        }

        await _repository.SaveChangesAsync(ct).ConfigureAwait(false);

        if (publishNewlyRequested)
        {
            await TrackSafelyAsync("listing_publish_requested", new { roomId = room.Id, venueId = room.VenueId }).ConfigureAwait(false);
        }

        return ManageResult<ManagedRoomDto>.Ok(room.ToManagedDto());
    }

    private async Task<(Venue? Venue, ManageError? Error)> LoadScopedVenueAsync(Guid callerId, Guid venueId, CancellationToken ct)
    {
        var venue = await _repository.GetVenueWithRoomsAsync(venueId, ct).ConfigureAwait(false);
        if (venue is null || !await _venueManagers.IsManagerAsync(callerId, venueId, ct).ConfigureAwait(false))
        {
            // Unknown and unmanaged answer identically — no existence leak.
            return (null, new ManageError(ManageErrorCodes.NotFound, "No such venue."));
        }

        return (venue, null);
    }

    private async Task<(Room? Room, ManageError? Error)> LoadScopedRoomAsync(Guid callerId, Guid roomId, CancellationToken ct)
    {
        var room = await _repository.GetRoomWithVenueAsync(roomId, ct).ConfigureAwait(false);
        if (room is null || !await _venueManagers.IsManagerAsync(callerId, room.VenueId, ct).ConfigureAwait(false))
        {
            return (null, new ManageError(ManageErrorCodes.NotFound, "No such room."));
        }

        return (room, null);
    }

    private async Task<(GeoPoint? Point, ManageError? Error)> GeocodeInsideBeachheadAsync(
        string addressLine, string suburb, string postcode, CancellationToken ct)
    {
        var address = $"{addressLine}, {suburb}, {_geocodingOptions.Region} {postcode}";
        var point = await _geocoding.GeocodeAsync(address, ct).ConfigureAwait(false);
        if (point is null)
        {
            return (null, new ManageError(
                ManageErrorCodes.InvalidVenue,
                "We couldn't find that address — check the street, suburb, and ZIP."));
        }

        if (!_geofence.IsWithinBeachhead(point.Value.Latitude, point.Value.Longitude))
        {
            return (null, new ManageError(
                ManageErrorCodes.GeofenceRejected,
                $"Steeple currently serves {_geofence.AreaName} only — that address is outside the area."));
        }

        return (point, null);
    }

    private static string? ValidateVenueFields(
        string name, string description, string addressLine, string suburb, string postcode, SaveVenueRequest request)
    {
        if (name.Length is 0 or > 200) return "Give the venue a name (up to 200 characters).";
        if (description.Length is 0 or > 4000) return "Describe the venue (up to 4000 characters).";
        if (addressLine.Length is 0 or > 300) return "Enter the street address.";
        if (suburb.Length is 0 or > 200) return "Enter the suburb or town.";
        if (postcode.Length is 0 or > 20) return "Enter the ZIP code.";
        if (request.ContactEmail is { Length: > 0 } email && (email.Length > 320 || !email.Contains('@')))
            return "That contact email doesn't look right.";
        if (request.ParkingInfo is { Length: > 1000 }) return "Parking notes are limited to 1000 characters.";
        if (request.TransitInfo is { Length: > 1000 }) return "Transit notes are limited to 1000 characters.";
        if (request.VenueType is not null && FlagEnumExtensions.ParseToken<VenueType>(request.VenueType) is null)
            return $"Unknown venue type '{request.VenueType}'.";
        return null;
    }

    private static string? ValidateVerificationFields(
        string contactName,
        string? contactEmail,
        string evidenceSummary,
        bool attestedAuthority,
        IReadOnlyList<VenueVerificationDocumentRequest> documents)
    {
        if (!attestedAuthority) return "Confirm you are authorized to list or lease rooms for this venue.";
        if (contactName.Length is 0 or > 200) return "Enter a contact name (up to 200 characters).";
        if (contactEmail is { Length: > 0 } email && (email.Length > 320 || !email.Contains('@')))
            return "That contact email doesn't look right.";
        if (evidenceSummary.Length is < 20 or > 4000)
            return "Summarize the ownership or lease-authority evidence in 20 to 4000 characters.";
        if (documents.Count is 0 or > 5) return "Add between 1 and 5 document links.";

        foreach (var document in documents)
        {
            var label = document.Label?.Trim() ?? "";
            var url = document.Url?.Trim() ?? "";
            if (label.Length is 0 or > 200) return "Each document needs a label up to 200 characters.";
            if (url.Length is 0 or > 1000 || !IsHttpUrl(url)) return "Each document link must be a valid https:// or http:// URL.";
        }

        return null;
    }

    private static string? ValidateRoomFields(string name, string description, int capacity, SaveRoomRequest request)
    {
        if (name.Length is 0 or > 200) return "Give the room a name (up to 200 characters).";
        if (description.Length is 0 or > 4000) return "Describe the room (up to 4000 characters).";
        if (capacity is < 1 or > 10_000) return "Capacity must be between 1 and 10,000.";
        if (request.PricePerHour is > 99_999_999m) return "That hourly price is out of range.";
        if (request.HouseRules is { Length: > 4000 }) return "House rules are limited to 4000 characters.";
        return null;
    }

    private static ((ActivityType Activities, Amenity Amenities, AccessibilityFeature Accessibility) Flags, string? UnknownToken)
        ParseRoomFlags(SaveRoomRequest request)
    {
        var activities = FlagEnumExtensions.CombineTokens<ActivityType>(request.Activities ?? [], out var badActivities);
        var amenities = FlagEnumExtensions.CombineTokens<Amenity>(request.Amenities ?? [], out var badAmenities);
        var accessibility = FlagEnumExtensions.CombineTokens<AccessibilityFeature>(request.Accessibility ?? [], out var badAccessibility);

        var unknown = badActivities.Concat(badAmenities).Concat(badAccessibility).FirstOrDefault();
        return ((activities, amenities, accessibility), unknown);
    }

    /// <summary>Non-positive means free, stored as null (the public IsFree rule).</summary>
    private static decimal? NormalizePrice(decimal? price) =>
        price is null or <= 0m ? null : decimal.Round(price.Value, 2);

    private static string? NormalizeOptional(string? value) =>
        string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    private static bool IsHttpUrl(string value) =>
        Uri.TryCreate(value, UriKind.Absolute, out var uri)
        && (uri.Scheme == Uri.UriSchemeHttps || uri.Scheme == Uri.UriSchemeHttp);

    private async Task TrackSafelyAsync(string eventType, object payload)
    {
        try
        {
            await _analytics.TrackAsync(eventType, payload).ConfigureAwait(false);
        }
        catch
        {
            // Best-effort: analytics must never fail a manage operation.
        }
    }
}
