using System.Net;
using System.Net.Http.Headers;
using System.Text.Json;

namespace Steeple.Web.Services;

/// <summary>
/// Typed <see cref="HttpClient"/> implementation of <see cref="ISteepleApiClient"/>. JSON uses the
/// ASP.NET web defaults (camelCase, case-insensitive) so the contract records round-trip cleanly.
/// </summary>
public sealed class SteepleApiClient : ISteepleApiClient
{
    private readonly HttpClient _http;

    public SteepleApiClient(HttpClient http) => _http = http;

    public async Task<ListingSearchResult> SearchAsync(string? queryString, CancellationToken ct = default)
    {
        var qs = string.IsNullOrEmpty(queryString) ? "" : (queryString.StartsWith('?') ? queryString : "?" + queryString);
        var result = await _http.GetFromJsonAsync<ListingSearchResult>($"api/v1/listings/search{qs}", ct);
        return result ?? EmptyResult();
    }

    public Task<RoomDetailDto?> GetBySlugAsync(string venueSlug, string roomSlug, CancellationToken ct = default) =>
        GetDetailAsync($"api/v1/listings/by-slug/{Uri.EscapeDataString(venueSlug)}/{Uri.EscapeDataString(roomSlug)}", ct);

    public Task<RoomDetailDto?> GetByIdAsync(Guid id, CancellationToken ct = default) =>
        GetDetailAsync($"api/v1/listings/{id}", ct);

    public async Task<IReadOnlyList<string>> GetSuburbsAsync(CancellationToken ct = default) =>
        await _http.GetFromJsonAsync<List<string>>("api/v1/suburbs", ct) ?? [];

    public async Task<IReadOnlyList<SitemapEntry>> GetSitemapEntriesAsync(CancellationToken ct = default) =>
        await _http.GetFromJsonAsync<List<SitemapEntry>>("api/v1/sitemap", ct) ?? [];

    public async Task<GeofenceContextDto> GetGeofenceAsync(CancellationToken ct = default) =>
        await _http.GetFromJsonAsync<GeofenceContextDto>("api/v1/geofence", ct)
        ?? throw new InvalidOperationException("The API returned no geofence context.");

    public async Task<VenueReviewPageDto> GetVenueReviewsAsync(
        Guid venueId, int page = 1, int pageSize = 10, CancellationToken ct = default)
    {
        var safePage = Math.Max(page, 1);
        var safePageSize = Math.Clamp(pageSize, 1, 50);
        return await _http.GetFromJsonAsync<VenueReviewPageDto>(
            $"api/v1/venues/{venueId}/ratings?page={safePage}&pageSize={safePageSize}", ct)
            ?? new VenueReviewPageDto([], 0, safePage, safePageSize);
    }

    public async Task<RoomAvailabilityDto?> GetListingAvailabilityAsync(
        Guid roomId, DateOnly from, DateOnly to, CancellationToken ct = default)
    {
        var path = $"api/v1/listings/{roomId}/availability?from={from:yyyy-MM-dd}&to={to:yyyy-MM-dd}";
        using var response = await _http.GetAsync(path, ct);
        if (response.StatusCode == HttpStatusCode.NotFound)
        {
            return null;
        }

        response.EnsureSuccessStatusCode();
        return await response.Content.ReadFromJsonAsync<RoomAvailabilityDto>(ct);
    }

    public async Task<ScheduleCheckResultDto?> CheckListingScheduleAsync(
        Guid roomId, ScheduleDto schedule, CancellationToken ct = default)
    {
        using var response = await _http.PostAsJsonAsync(
            $"api/v1/listings/{roomId}/availability/check", new { schedule }, ct);
        // 404 (not readable) and 400 (uncheckable schedule) both mean "render no verdict card".
        if (!response.IsSuccessStatusCode)
        {
            return null;
        }

        return await response.Content.ReadFromJsonAsync<ScheduleCheckResultDto>(ct);
    }

    public async Task<(SessionResponse? Session, string? ErrorCode)> CreateSessionAsync(
        CreateSessionRequest request, CancellationToken ct = default)
    {
        using var response = await _http.PostAsJsonAsync("api/v1/auth/sessions", request, ct);
        if (response.IsSuccessStatusCode)
        {
            var session = await response.Content.ReadFromJsonAsync<SessionResponse>(ct);
            return session is null ? (null, "empty_response") : (session, null);
        }

        return (null, await ReadProblemCodeAsync(response, ct));
    }

    public async Task<RefreshResponse?> RefreshAsync(string refreshToken, CancellationToken ct = default)
    {
        using var response = await _http.PostAsJsonAsync("api/v1/auth/refresh", new { refreshToken }, ct);
        return response.IsSuccessStatusCode
            ? await response.Content.ReadFromJsonAsync<RefreshResponse>(ct)
            : null;
    }

    public Task RevokeSessionAsync(string accessToken, CancellationToken ct = default) =>
        SendAuthorizedAsync(HttpMethod.Delete, "api/v1/auth/sessions", accessToken, body: null, ct);

    public Task RevokeAllSessionsAsync(string accessToken, CancellationToken ct = default) =>
        SendAuthorizedAsync(HttpMethod.Delete, "api/v1/me/sessions", accessToken, body: null, ct);

    public async Task<MeResponse?> GetMeAsync(string accessToken, CancellationToken ct = default)
    {
        using var request = AuthorizedRequest(HttpMethod.Get, "api/v1/me", accessToken, body: null);
        using var response = await _http.SendAsync(request, ct);
        return response.IsSuccessStatusCode
            ? await response.Content.ReadFromJsonAsync<MeResponse>(ct)
            : null;
    }

    public Task DeleteMeAsync(string accessToken, CancellationToken ct = default) =>
        SendAuthorizedAsync(HttpMethod.Delete, "api/v1/me", accessToken, body: null, ct);

    public Task AcceptAgreementAsync(string accessToken, AcceptAgreementRequest request, CancellationToken ct = default) =>
        SendAuthorizedAsync(HttpMethod.Post, "api/v1/me/agreements", accessToken, request, ct);

    public async Task<(ApplicationDto? Application, string? ErrorCode, ScheduleCheckResultDto? Conflict)> SubmitApplicationAsync(
        string accessToken, Guid roomId, SubmitApplicationRequest request, Guid idempotencyKey, CancellationToken ct = default)
    {
        using var httpRequest = AuthorizedRequest(HttpMethod.Post, $"api/v1/listings/{roomId}/applications", accessToken, request);
        httpRequest.Headers.Add("Idempotency-Key", idempotencyKey.ToString());
        using var response = await _http.SendAsync(httpRequest, ct);

        if (response.IsSuccessStatusCode)
        {
            var application = await response.Content.ReadFromJsonAsync<ApplicationDto>(ct);
            return application is null ? (null, "empty_response", null) : (application, null, null);
        }

        // 409 schedule_unavailable carries the same {available, totalOccurrences, conflicts[]}
        // payload the check endpoint returns — parse it once so the caller can re-render the card.
        var body = await response.Content.ReadAsStringAsync(ct);
        var errorCode = ReadProblemCode(body) ?? "api_error";
        var conflict = errorCode == "schedule_unavailable" ? ReadScheduleCheckResult(body) : null;
        return (null, errorCode, conflict);
    }

    public async Task<ApplicationListResult> GetMyApplicationsAsync(string accessToken, string? status, int page, CancellationToken ct = default) =>
        await GetApplicationListAsync("api/v1/me/applications", accessToken, status, page, ct);

    public async Task<ApplicationListResult> GetManageApplicationsAsync(string accessToken, string? status, int page, CancellationToken ct = default) =>
        await GetApplicationListAsync("api/v1/manage/applications", accessToken, status, page, ct);

    public async Task<ApplicationDto?> GetApplicationAsync(string accessToken, Guid id, CancellationToken ct = default)
    {
        using var request = AuthorizedRequest(HttpMethod.Get, $"api/v1/applications/{id}", accessToken, body: null);
        using var response = await _http.SendAsync(request, ct);
        if (response.StatusCode == HttpStatusCode.NotFound)
        {
            return null;
        }

        response.EnsureSuccessStatusCode();
        return await response.Content.ReadFromJsonAsync<ApplicationDto>(ct);
    }

    public Task<(ApplicationDto? Application, string? ErrorCode)> PostApplicationMessageAsync(
        string accessToken, Guid id, string body, CancellationToken ct = default) =>
        PostForApplicationAsync($"api/v1/applications/{id}/messages", accessToken, new ApplicationMessageRequest(body), ct);

    public Task<(ApplicationDto? Application, string? ErrorCode)> PostApplicationDecisionAsync(
        string accessToken, Guid id, string decision, string? message, CancellationToken ct = default) =>
        PostForApplicationAsync($"api/v1/applications/{id}/decision", accessToken, new ApplicationDecisionRequest(decision, message), ct);

    public Task<(ApplicationDto? Application, string? ErrorCode)> WithdrawApplicationAsync(
        string accessToken, Guid id, CancellationToken ct = default) =>
        PostForApplicationAsync($"api/v1/applications/{id}/withdraw", accessToken, body: null, ct);

    public async Task<IReadOnlyList<ManagedVenueDto>> GetManagedVenuesAsync(string accessToken, CancellationToken ct = default)
    {
        using var request = AuthorizedRequest(HttpMethod.Get, "api/v1/manage/venues", accessToken, body: null);
        using var response = await _http.SendAsync(request, ct);
        response.EnsureSuccessStatusCode();
        return await response.Content.ReadFromJsonAsync<List<ManagedVenueDto>>(ct) ?? [];
    }

    public Task<ManagedVenueDetailDto?> GetManagedVenueAsync(string accessToken, Guid id, CancellationToken ct = default) =>
        GetAuthorizedOrNullAsync<ManagedVenueDetailDto>($"api/v1/manage/venues/{id}", accessToken, ct);

    public async Task<(ManagedVenueDetailDto? Venue, string? ErrorCode)> CreateVenueAsync(
        string accessToken, SaveVenueRequest request, CancellationToken ct = default)
    {
        using var httpRequest = AuthorizedRequest(HttpMethod.Post, "api/v1/manage/venues", accessToken, request);
        using var response = await _http.SendAsync(httpRequest, ct);
        return await ReadResultAsync<ManagedVenueDetailDto>(response, ct);
    }

    public async Task<(ManagedVenueDetailDto? Venue, string? ErrorCode)> UpdateVenueAsync(
        string accessToken, Guid id, SaveVenueRequest request, CancellationToken ct = default)
    {
        using var httpRequest = AuthorizedRequest(HttpMethod.Patch, $"api/v1/manage/venues/{id}", accessToken, request);
        using var response = await _http.SendAsync(httpRequest, ct);
        return await ReadResultAsync<ManagedVenueDetailDto>(response, ct);
    }

    public async Task<(ManagedVenueDetailDto? Venue, string? ErrorCode)> SubmitVenueVerificationAsync(
        string accessToken, Guid id, SubmitVenueVerificationRequest request, CancellationToken ct = default)
    {
        using var httpRequest = AuthorizedRequest(HttpMethod.Post, $"api/v1/manage/venues/{id}/verification", accessToken, request);
        using var response = await _http.SendAsync(httpRequest, ct);
        return await ReadResultAsync<ManagedVenueDetailDto>(response, ct);
    }

    public Task<ManagedRoomDto?> GetManagedRoomAsync(string accessToken, Guid id, CancellationToken ct = default) =>
        GetAuthorizedOrNullAsync<ManagedRoomDto>($"api/v1/manage/rooms/{id}", accessToken, ct);

    public async Task<(ManagedRoomDto? Room, string? ErrorCode)> CreateRoomAsync(
        string accessToken, Guid venueId, SaveRoomRequest request, CancellationToken ct = default)
    {
        using var httpRequest = AuthorizedRequest(HttpMethod.Post, $"api/v1/manage/venues/{venueId}/rooms", accessToken, request);
        using var response = await _http.SendAsync(httpRequest, ct);
        return await ReadResultAsync<ManagedRoomDto>(response, ct);
    }

    public async Task<(ManagedRoomDto? Room, string? ErrorCode)> UpdateManagedRoomAsync(
        string accessToken, Guid roomId, SaveRoomRequest request, CancellationToken ct = default)
    {
        using var httpRequest = AuthorizedRequest(HttpMethod.Patch, $"api/v1/manage/rooms/{roomId}", accessToken, request);
        using var response = await _http.SendAsync(httpRequest, ct);
        return await ReadResultAsync<ManagedRoomDto>(response, ct);
    }

    public Task<RoomAvailabilityRulesDto?> GetRoomAvailabilityAsync(string accessToken, Guid roomId, CancellationToken ct = default) =>
        GetAuthorizedOrNullAsync<RoomAvailabilityRulesDto>($"api/v1/manage/rooms/{roomId}/availability", accessToken, ct);

    public async Task<(RoomAvailabilityRulesDto? Rules, string? ErrorCode)> SaveRoomAvailabilityAsync(
        string accessToken, Guid roomId, SaveAvailabilityRulesRequest request, CancellationToken ct = default)
    {
        using var httpRequest = AuthorizedRequest(HttpMethod.Put, $"api/v1/manage/rooms/{roomId}/availability", accessToken, request);
        using var response = await _http.SendAsync(httpRequest, ct);
        return await ReadResultAsync<RoomAvailabilityRulesDto>(response, ct);
    }

    public async Task<(RoomPhotoDto? Photo, string? ErrorCode)> UploadRoomPhotoAsync(
        string accessToken, Guid roomId, Stream content, string fileName, string contentType, string? caption, CancellationToken ct = default)
    {
        using var form = new MultipartFormDataContent();
        var streamContent = new StreamContent(content);
        streamContent.Headers.ContentType = new MediaTypeHeaderValue(contentType);
        form.Add(streamContent, "file", fileName);
        if (!string.IsNullOrEmpty(caption))
        {
            form.Add(new StringContent(caption), "caption");
        }

        using var httpRequest = new HttpRequestMessage(HttpMethod.Post, $"api/v1/manage/rooms/{roomId}/photos")
        {
            Headers = { Authorization = new AuthenticationHeaderValue("Bearer", accessToken) },
            Content = form,
        };
        using var response = await _http.SendAsync(httpRequest, ct);
        return await ReadResultAsync<RoomPhotoDto>(response, ct);
    }

    public async Task<(RoomPhotoDto? Photo, string? ErrorCode)> UpdatePhotoAsync(
        string accessToken, Guid photoId, UpdatePhotoRequest request, CancellationToken ct = default)
    {
        using var httpRequest = AuthorizedRequest(HttpMethod.Patch, $"api/v1/manage/photos/{photoId}", accessToken, request);
        using var response = await _http.SendAsync(httpRequest, ct);
        return await ReadResultAsync<RoomPhotoDto>(response, ct);
    }

    public async Task<string?> DeletePhotoAsync(string accessToken, Guid photoId, CancellationToken ct = default)
    {
        using var request = AuthorizedRequest(HttpMethod.Delete, $"api/v1/manage/photos/{photoId}", accessToken, body: null);
        using var response = await _http.SendAsync(request, ct);
        return response.IsSuccessStatusCode ? null : await ReadProblemCodeAsync(response, ct) ?? "api_error";
    }

    public async Task<BookingListResult> GetMyBookingsAsync(string accessToken, string? status, int page, CancellationToken ct = default) =>
        await GetBookingListAsync("api/v1/me/bookings", accessToken, status, page, ct);

    public async Task<BookingListResult> GetManageBookingsAsync(string accessToken, string? status, int page, CancellationToken ct = default) =>
        await GetBookingListAsync("api/v1/manage/bookings", accessToken, status, page, ct);

    public async Task<BookingDto?> GetBookingAsync(string accessToken, Guid id, CancellationToken ct = default)
    {
        using var request = AuthorizedRequest(HttpMethod.Get, $"api/v1/bookings/{id}", accessToken, body: null);
        using var response = await _http.SendAsync(request, ct);
        if (response.StatusCode == HttpStatusCode.NotFound)
        {
            return null;
        }

        response.EnsureSuccessStatusCode();
        return await response.Content.ReadFromJsonAsync<BookingDto>(ct);
    }

    public async Task<(BookingDto? Booking, string? ErrorCode)> CancelBookingAsync(
        string accessToken, Guid id, string? reason, CancellationToken ct = default)
    {
        using var request = AuthorizedRequest(HttpMethod.Post, $"api/v1/bookings/{id}/cancel", accessToken, new CancelBookingRequest(reason));
        using var response = await _http.SendAsync(request, ct);
        return await ReadBookingResultAsync(response, ct);
    }

    public async Task<(BookingDto? Booking, string? ErrorCode)> MarkNoShowAsync(
        string accessToken, Guid occurrenceId, CancellationToken ct = default)
    {
        using var request = AuthorizedRequest(HttpMethod.Post, $"api/v1/occurrences/{occurrenceId}/no-show", accessToken, body: null);
        using var response = await _http.SendAsync(request, ct);
        return await ReadBookingResultAsync(response, ct);
    }

    public async Task<string?> SubmitRatingAsync(
        string accessToken, Guid bookingId, int stars, string? comment, CancellationToken ct = default)
    {
        using var request = AuthorizedRequest(
            HttpMethod.Post,
            $"api/v1/bookings/{bookingId}/ratings",
            accessToken,
            new SubmitRatingRequest(stars, comment));
        using var response = await _http.SendAsync(request, ct);
        return response.IsSuccessStatusCode ? null : await ReadProblemCodeAsync(response, ct) ?? "api_error";
    }

    private static async Task<(BookingDto? Booking, string? ErrorCode)> ReadBookingResultAsync(
        HttpResponseMessage response, CancellationToken ct)
    {
        if (response.IsSuccessStatusCode)
        {
            var booking = await response.Content.ReadFromJsonAsync<BookingDto>(ct);
            return booking is null ? (null, "empty_response") : (booking, null);
        }

        return (null, await ReadProblemCodeAsync(response, ct) ?? "api_error");
    }

    private async Task<BookingListResult> GetBookingListAsync(
        string path, string accessToken, string? status, int page, CancellationToken ct)
    {
        var qs = $"?page={page}";
        if (!string.IsNullOrEmpty(status))
        {
            qs += $"&status={Uri.EscapeDataString(status)}";
        }

        using var request = AuthorizedRequest(HttpMethod.Get, $"{path}{qs}", accessToken, body: null);
        using var response = await _http.SendAsync(request, ct);
        response.EnsureSuccessStatusCode();
        return await response.Content.ReadFromJsonAsync<BookingListResult>(ct)
            ?? new BookingListResult([], 0, page, 24);
    }

    /// <summary>Bearer-authorized POST that returns the updated application, or the stable error code on failure.</summary>
    private async Task<(ApplicationDto? Application, string? ErrorCode)> PostForApplicationAsync(
        string path, string accessToken, object? body, CancellationToken ct)
    {
        using var request = AuthorizedRequest(HttpMethod.Post, path, accessToken, body);
        using var response = await _http.SendAsync(request, ct);
        return await ReadApplicationResultAsync(response, ct);
    }

    private static async Task<(ApplicationDto? Application, string? ErrorCode)> ReadApplicationResultAsync(
        HttpResponseMessage response, CancellationToken ct)
    {
        if (response.IsSuccessStatusCode)
        {
            var application = await response.Content.ReadFromJsonAsync<ApplicationDto>(ct);
            return application is null ? (null, "empty_response") : (application, null);
        }

        return (null, await ReadProblemCodeAsync(response, ct) ?? "api_error");
    }

    private async Task<ApplicationListResult> GetApplicationListAsync(
        string path, string accessToken, string? status, int page, CancellationToken ct)
    {
        var qs = $"?page={page}";
        if (!string.IsNullOrEmpty(status))
        {
            qs += $"&status={Uri.EscapeDataString(status)}";
        }

        using var request = AuthorizedRequest(HttpMethod.Get, $"{path}{qs}", accessToken, body: null);
        using var response = await _http.SendAsync(request, ct);
        response.EnsureSuccessStatusCode();
        return await response.Content.ReadFromJsonAsync<ApplicationListResult>(ct)
            ?? new ApplicationListResult([], 0, page, 24);
    }

    /// <summary>Bearer-authorized GET, treating a 404 as a clean <c>null</c> (not found / not discoverable).</summary>
    private async Task<T?> GetAuthorizedOrNullAsync<T>(string path, string accessToken, CancellationToken ct)
        where T : class
    {
        using var request = AuthorizedRequest(HttpMethod.Get, path, accessToken, body: null);
        using var response = await _http.SendAsync(request, ct);
        if (response.StatusCode == HttpStatusCode.NotFound)
        {
            return null;
        }

        response.EnsureSuccessStatusCode();
        return await response.Content.ReadFromJsonAsync<T>(ct);
    }

    /// <summary>Reads a created/updated resource on success, or the stable ProblemDetails error code on failure.</summary>
    private static async Task<(T? Value, string? ErrorCode)> ReadResultAsync<T>(HttpResponseMessage response, CancellationToken ct)
        where T : class
    {
        if (response.IsSuccessStatusCode)
        {
            var value = await response.Content.ReadFromJsonAsync<T>(ct);
            return value is null ? (null, "empty_response") : (value, null);
        }

        return (null, await ReadProblemCodeAsync(response, ct) ?? "api_error");
    }

    /// <summary>Sends a bearer-authorized request, throwing on non-success (callers treat these as exceptional).</summary>
    private async Task SendAuthorizedAsync(HttpMethod method, string path, string accessToken, object? body, CancellationToken ct)
    {
        using var request = AuthorizedRequest(method, path, accessToken, body);
        using var response = await _http.SendAsync(request, ct);
        response.EnsureSuccessStatusCode();
    }

    private static HttpRequestMessage AuthorizedRequest(HttpMethod method, string path, string accessToken, object? body)
    {
        var request = new HttpRequestMessage(method, path)
        {
            Headers = { Authorization = new AuthenticationHeaderValue("Bearer", accessToken) },
        };
        if (body is not null)
        {
            request.Content = JsonContent.Create(body);
        }

        return request;
    }

    /// <summary>Extracts the stable ProblemDetails <c>code</c> extension (CONTRACTS §2), if present.</summary>
    private static async Task<string?> ReadProblemCodeAsync(HttpResponseMessage response, CancellationToken ct) =>
        ReadProblemCode(await response.Content.ReadAsStringAsync(ct));

    /// <summary>Extracts the stable ProblemDetails <c>code</c> extension from an already-read body.</summary>
    private static string? ReadProblemCode(string body)
    {
        try
        {
            using var doc = JsonDocument.Parse(body);
            return doc.RootElement.TryGetProperty("code", out var code) ? code.GetString() : null;
        }
        catch (JsonException)
        {
            return null;
        }
    }

    /// <summary>
    /// Reads the <c>{available, totalOccurrences, conflicts[]}</c> payload the API embeds in the
    /// <c>409 schedule_unavailable</c> problem body (same shape the check endpoint returns).
    /// </summary>
    private static ScheduleCheckResultDto? ReadScheduleCheckResult(string body)
    {
        try
        {
            return JsonSerializer.Deserialize<ScheduleCheckResultDto>(body, JsonSerializerOptions.Web);
        }
        catch (JsonException)
        {
            return null;
        }
    }

    /// <summary>GETs a detail DTO, treating a 404 as a clean <c>null</c> (not found / not discoverable).</summary>
    private async Task<RoomDetailDto?> GetDetailAsync(string path, CancellationToken ct)
    {
        using var response = await _http.GetAsync(path, ct);
        if (response.StatusCode == HttpStatusCode.NotFound)
        {
            return null;
        }

        response.EnsureSuccessStatusCode();
        return await response.Content.ReadFromJsonAsync<RoomDetailDto>(ct);
    }

    private static ListingSearchResult EmptyResult() =>
        new([], 0, true, new BoundingBox(0, 0, 0, 0), new GeoPoint(0, 0), 1, 0);
}
