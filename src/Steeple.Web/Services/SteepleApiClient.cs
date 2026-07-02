using System.Net;
using System.Net.Http.Json;

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
        var result = await _http.GetFromJsonAsync<ListingSearchResult>($"api/listings/search{qs}", ct);
        return result ?? EmptyResult();
    }

    public Task<RoomDetailDto?> GetBySlugAsync(string venueSlug, string roomSlug, CancellationToken ct = default) =>
        GetDetailAsync($"api/listings/by-slug/{Uri.EscapeDataString(venueSlug)}/{Uri.EscapeDataString(roomSlug)}", ct);

    public Task<RoomDetailDto?> GetByIdAsync(Guid id, CancellationToken ct = default) =>
        GetDetailAsync($"api/listings/{id}", ct);

    public async Task<IReadOnlyList<string>> GetSuburbsAsync(CancellationToken ct = default) =>
        await _http.GetFromJsonAsync<List<string>>("api/suburbs", ct) ?? [];

    public async Task<IReadOnlyList<SitemapEntry>> GetSitemapEntriesAsync(CancellationToken ct = default) =>
        await _http.GetFromJsonAsync<List<SitemapEntry>>("api/sitemap", ct) ?? [];

    public async Task<GeofenceContextDto> GetGeofenceAsync(CancellationToken ct = default) =>
        await _http.GetFromJsonAsync<GeofenceContextDto>("api/geofence", ct)
        ?? throw new InvalidOperationException("The API returned no geofence context.");

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
