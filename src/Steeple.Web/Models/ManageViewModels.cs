namespace Steeple.Web.Models;

/// <summary>The provider home (<c>/manage</c>): venues the caller manages.</summary>
public sealed class ManageHomeViewModel
{
    /// <summary>Managed venues (empty = show onboarding).</summary>
    public required IReadOnlyList<ManagedVenueDto> Venues { get; init; }

    /// <summary>One-shot success message (PRG).</summary>
    public string? Flash { get; init; }
}

/// <summary>
/// The venue form, for create and edit. Mutable + model-bound so a failed submit re-renders
/// with the person's input intact (same stance as the apply form).
/// </summary>
public sealed class VenueFormViewModel
{
    /// <summary>Null when creating.</summary>
    public Guid? VenueId { get; set; }

    public string Name { get; set; } = "";
    public string Description { get; set; } = "";
    public string VenueType { get; set; } = "church";
    public string AddressLine { get; set; } = "";
    public string Suburb { get; set; } = "";
    public string Postcode { get; set; } = "";
    public string ContactEmail { get; set; } = "";
    public string ParkingInfo { get; set; } = "";
    public string TransitInfo { get; set; } = "";
    public string Timezone { get; set; } = "America/New_York";

    /// <summary>Top-of-form error banner.</summary>
    public string? Error { get; set; }

    /// <summary>Venue-type choices (wire token + label).</summary>
    public static IReadOnlyList<FilterOption> VenueTypeOptions { get; } =
    [
        new("church", "Church"),
        new("publicSpace", "Public space"),
        new("other", "Other"),
    ];

    /// <summary>US-first IANA shortlist (value = wire identifier).</summary>
    public static IReadOnlyList<FilterOption> TimezoneOptions { get; } =
    [
        new("America/New_York", "Eastern — New York"),
        new("America/Chicago", "Central — Chicago"),
        new("America/Denver", "Mountain — Denver"),
        new("America/Phoenix", "Arizona — Phoenix"),
        new("America/Los_Angeles", "Pacific — Los Angeles"),
        new("America/Anchorage", "Alaska — Anchorage"),
        new("Pacific/Honolulu", "Hawaii — Honolulu"),
    ];

    /// <summary>The shortlist plus the venue's current zone when it isn't on it, so an edit round-trips unchanged.</summary>
    public IReadOnlyList<FilterOption> TimezoneChoices =>
        TimezoneOptions.Any(o => o.Value == Timezone)
            ? TimezoneOptions
            : [.. TimezoneOptions, new(Timezone, Timezone)];

    /// <summary>Prefills the form from a fetched venue.</summary>
    public static VenueFormViewModel From(ManagedVenueDetailDto venue) => new()
    {
        VenueId = venue.Id,
        Name = venue.Name,
        Description = venue.Description,
        VenueType = venue.VenueType,
        AddressLine = venue.AddressLine,
        Suburb = venue.Suburb,
        Postcode = venue.Postcode,
        ContactEmail = venue.ContactEmail ?? "",
        ParkingInfo = venue.ParkingInfo,
        TransitInfo = venue.TransitInfo,
        Timezone = venue.Timezone,
    };

    /// <summary>The wire payload (create and edit send the full form).</summary>
    public SaveVenueRequest ToRequest() => new(
        Name: Name.Trim(),
        Description: Description.Trim(),
        VenueType: VenueType,
        AddressLine: AddressLine.Trim(),
        Suburb: Suburb.Trim(),
        Postcode: Postcode.Trim(),
        ContactEmail: string.IsNullOrWhiteSpace(ContactEmail) ? "" : ContactEmail.Trim(),
        ParkingInfo: ParkingInfo.Trim(),
        TransitInfo: TransitInfo.Trim(),
        Timezone: Timezone.Trim());
}

/// <summary>The venue editor page: details form + the rooms list.</summary>
public sealed class VenueEditorViewModel
{
    public required ManagedVenueDetailDto Venue { get; init; }
    public required VenueFormViewModel Form { get; init; }
    public required VenueVerificationFormViewModel VerificationForm { get; init; }
    public string? Flash { get; init; }
}

/// <summary>Host proof-of-authority form on the venue editor.</summary>
public sealed class VenueVerificationFormViewModel
{
    public Guid VenueId { get; set; }
    public string ContactName { get; set; } = "";
    public string ContactEmail { get; set; } = "";
    public string EvidenceSummary { get; set; } = "";
    public bool AttestedAuthority { get; set; }
    public string Document1Label { get; set; } = "";
    public string Document1Url { get; set; } = "";
    public string Document2Label { get; set; } = "";
    public string Document2Url { get; set; } = "";
    public string Document3Label { get; set; } = "";
    public string Document3Url { get; set; } = "";
    public string? Error { get; set; }

    public static VenueVerificationFormViewModel ForVenue(ManagedVenueDetailDto venue) => new()
    {
        VenueId = venue.Id,
        ContactEmail = venue.ContactEmail ?? "",
    };

    public SubmitVenueVerificationRequest ToRequest()
    {
        var documents = new[]
            {
                new VenueVerificationDocumentRequest(Document1Label.Trim(), Document1Url.Trim()),
                new VenueVerificationDocumentRequest(Document2Label.Trim(), Document2Url.Trim()),
                new VenueVerificationDocumentRequest(Document3Label.Trim(), Document3Url.Trim()),
            }
            .Where(d => !string.IsNullOrWhiteSpace(d.Label) || !string.IsNullOrWhiteSpace(d.Url))
            .ToList();

        return new SubmitVenueVerificationRequest(
            ContactName: ContactName.Trim(),
            ContactEmail: string.IsNullOrWhiteSpace(ContactEmail) ? null : ContactEmail.Trim(),
            EvidenceSummary: EvidenceSummary.Trim(),
            AttestedAuthority: AttestedAuthority,
            Documents: documents);
    }
}

/// <summary>
/// The room form, for create and edit. Flags are posted as repeated camelCase wire tokens
/// (CONTRACTS §2.1) straight through to the API.
/// </summary>
public sealed class RoomFormViewModel
{
    /// <summary>Null when creating.</summary>
    public Guid? RoomId { get; set; }

    public Guid VenueId { get; set; }
    public string VenueName { get; set; } = "";
    public string Name { get; set; } = "";
    public string Description { get; set; } = "";
    public int? Capacity { get; set; }

    /// <summary>Empty = free (the API stores non-positive as free).</summary>
    public string PricePerHour { get; set; } = "";

    public string HouseRules { get; set; } = "";
    public List<string> Activities { get; set; } = [];
    public List<string> Amenities { get; set; } = [];
    public List<string> Accessibility { get; set; } = [];

    /// <summary>Top-of-form error banner.</summary>
    public string? Error { get; set; }

    /// <summary>Activity chips (wire token registry, CONTRACTS §2.1).</summary>
    public static IReadOnlyList<FilterOption> ActivityOptions { get; } = BuildOptions(
        "children", "sports", "community", "religious", "arts", "education", "music");

    /// <summary>Amenity chips (wire token registry, CONTRACTS §2.1).</summary>
    public static IReadOnlyList<FilterOption> AmenityOptions { get; } = BuildOptions(
        "parking", "kitchen", "restrooms", "wifi", "audioVisual", "tables", "chairs",
        "heating", "airConditioning", "stage", "piano");

    /// <summary>Accessibility chips (wire token registry, CONTRACTS §2.1).</summary>
    public static IReadOnlyList<FilterOption> AccessibilityOptions { get; } = BuildOptions(
        "stepFreeAccess", "accessibleRestroom", "accessibleParking", "hearingLoop", "liftAccess");

    /// <summary>Prefills the form from a fetched room.</summary>
    public static RoomFormViewModel From(ManagedRoomDto room) => new()
    {
        RoomId = room.Id,
        VenueId = room.VenueId,
        VenueName = room.VenueName,
        Name = room.Name,
        Description = room.Description,
        Capacity = room.Capacity,
        PricePerHour = room.PricePerHour is { } price ? price.ToString("0.##") : "",
        HouseRules = room.HouseRules,
        Activities = [.. room.Activities],
        Amenities = [.. room.Amenities],
        Accessibility = [.. room.Accessibility],
    };

    /// <summary>
    /// The wire payload. Never carries <c>status</c> — publish/unlist is its own explicit action,
    /// not a form side-effect.
    /// </summary>
    public SaveRoomRequest ToRequest() => new(
        Name: Name.Trim(),
        Description: Description.Trim(),
        Capacity: Capacity,
        PricePerHour: decimal.TryParse(PricePerHour, out var price) ? price : 0m,
        HouseRules: HouseRules.Trim(),
        Status: null,
        Activities: Activities,
        Amenities: Amenities,
        Accessibility: Accessibility);

    private static IReadOnlyList<FilterOption> BuildOptions(params string[] tokens) =>
        tokens.Select(t => new FilterOption(t, DiscoveryViewModel.Humanize(t))).ToList();
}

/// <summary>The room editor page: details form + status card + photo manager.</summary>
public sealed class RoomEditorViewModel
{
    public required ManagedRoomDto Room { get; init; }
    public required RoomFormViewModel Form { get; init; }
    public string? Flash { get; init; }

    /// <summary>Photo-section error, rendered next to the uploader rather than the form.</summary>
    public string? PhotoError { get; init; }
}

/// <summary>One flags checkbox group in the room form (rendered by <c>_FlagGroupFields</c>).</summary>
public sealed record FlagGroupViewModel(
    string Legend,
    string InputName,
    IReadOnlyList<FilterOption> Options,
    IReadOnlyList<string> Selected,
    string? HelpText);
