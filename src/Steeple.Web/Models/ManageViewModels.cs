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

/// <summary>One open window row in the hours form (<c>HH:mm</c> from native time inputs).</summary>
public sealed class HoursWindowFormModel
{
    public string StartTime { get; set; } = "";
    public string EndTime { get; set; } = "";
}

/// <summary>One weekday's rows. <see cref="DayOfWeek"/> is the wire token; posted hidden.</summary>
public sealed class HoursDayFormModel
{
    public string DayOfWeek { get; set; } = "";
    public List<HoursWindowFormModel> Windows { get; set; } = [];
}

/// <summary>One blackout row; an optional end date expands to per-date blackouts on save.</summary>
public sealed class BlackoutFormModel
{
    public DateOnly? Date { get; set; }
    public DateOnly? EndDate { get; set; }
    public string Reason { get; set; } = "";
}

/// <summary>
/// The hours &amp; blackouts form. Mutable + model-bound (indexed inputs; <c>hours-editor.js</c>
/// re-indexes rows on add/remove) so a failed save re-renders with input intact.
/// </summary>
public sealed class HoursFormViewModel
{
    public List<HoursDayFormModel> Days { get; set; } = [];
    public List<BlackoutFormModel> Blackouts { get; set; } = [];

    /// <summary>Top-of-form error banner.</summary>
    public string? Error { get; set; }

    /// <summary>Wire token + label, Sunday-first (the wire's canonical day order).</summary>
    public static IReadOnlyList<FilterOption> DayOptions { get; } =
    [
        new("sunday", "Sunday"),
        new("monday", "Monday"),
        new("tuesday", "Tuesday"),
        new("wednesday", "Wednesday"),
        new("thursday", "Thursday"),
        new("friday", "Friday"),
        new("saturday", "Saturday"),
    ];

    /// <summary>Prefills all seven day rows (closed days keep an empty window list).</summary>
    public static HoursFormViewModel From(RoomAvailabilityRulesDto rules) => new()
    {
        Days = [.. DayOptions.Select(day => new HoursDayFormModel
        {
            DayOfWeek = day.Value,
            Windows = [.. rules.Days
                .Where(d => d.DayOfWeek == day.Value)
                .SelectMany(d => d.Windows)
                .Select(w => new HoursWindowFormModel { StartTime = w.StartTime, EndTime = w.EndTime })],
        })],
        Blackouts = [.. rules.Blackouts.Select(b => new BlackoutFormModel { Date = b.Date, Reason = b.Reason ?? "" })],
    };

    /// <summary>
    /// The replace-all wire payload. Blackout ranges expand to per-date rows here (the API
    /// models single dates); the API's own limits (≤200, no past dates) still apply.
    /// </summary>
    public SaveAvailabilityRulesRequest ToRequest() => new(
        Days: [.. Days
            .Where(d => d.Windows.Count > 0)
            .Select(d => new DayOpenHoursDto(
                d.DayOfWeek,
                [.. d.Windows.Select(w => new OpenWindowDto(w.StartTime.Trim(), w.EndTime.Trim()))]))],
        Blackouts: [.. Blackouts
            .Where(b => b.Date is not null)
            .SelectMany(ExpandRange)
            .DistinctBy(b => b.Date)
            .OrderBy(b => b.Date)]);

    private static IEnumerable<BlackoutDateDto> ExpandRange(BlackoutFormModel row)
    {
        var reason = string.IsNullOrWhiteSpace(row.Reason) ? null : row.Reason.Trim();
        var last = row.EndDate is { } end && end > row.Date!.Value ? end : row.Date!.Value;
        for (var date = row.Date!.Value; date <= last; date = date.AddDays(1))
        {
            yield return new BlackoutDateDto(date, reason);
        }
    }
}

/// <summary>The hours &amp; blackouts page for one room.</summary>
public sealed class RoomHoursViewModel
{
    public required ManagedRoomDto Room { get; init; }
    public required HoursFormViewModel Form { get; init; }
    public required string Timezone { get; init; }
    public string? Flash { get; init; }
}
