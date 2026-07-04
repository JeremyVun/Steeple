using Microsoft.Extensions.Options;

namespace Steeple.Api.Tests.Services;
/// <summary>
/// Unit tests for <see cref="GeofencePolicy"/> against the values from the beachhead config
/// section in <c>src/Steeple.Api/appsettings.json</c> (constructed directly rather than bound
/// from the file, so these don't depend on the JSON layout).
/// </summary>
public class GeofencePolicyTests
{
    // Mirrors the "Geofence" section in src/Steeple.Api/appsettings.json.
    private const double MinLatitude = 38.84;
    private const double MaxLatitude = 38.96;
    private const double MinLongitude = -77.34;
    private const double MaxLongitude = -77.12;
    private const double CenterLatitude = 38.9012;
    private const double CenterLongitude = -77.2653;

    private static GeofencePolicy CreatePolicy()
    {
        var options = new GeofenceOptions
        {
            AreaName = "Vienna & nearby (Northern Virginia)",
            MinLatitude = MinLatitude,
            MaxLatitude = MaxLatitude,
            MinLongitude = MinLongitude,
            MaxLongitude = MaxLongitude,
            CenterLatitude = CenterLatitude,
            CenterLongitude = CenterLongitude,
        };
        return new GeofencePolicy(Options.Create(options));
    }

    [Fact]
    public void ResolveSearchBounds_NoSpatialInput_ReturnsFullBeachhead()
    {
        var policy = CreatePolicy();
        var query = new ListingSearchQuery();

        var bounds = policy.ResolveSearchBounds(query);

        Assert.Equal(policy.Beachhead, bounds);
    }

    [Fact]
    public void ResolveSearchBounds_ViewportFullyInsideBeachhead_ReturnedAsIs()
    {
        var policy = CreatePolicy();
        var query = new ListingSearchQuery
        {
            MinLat = 38.88,
            MaxLat = 38.92,
            MinLng = -77.30,
            MaxLng = -77.20,
        };

        var bounds = policy.ResolveSearchBounds(query);

        Assert.Equal(new BoundingBox(38.88, 38.92, -77.30, -77.20), bounds);
    }

    [Fact]
    public void ResolveSearchBounds_ViewportPartiallyOverlapping_ClampedToIntersection()
    {
        var policy = CreatePolicy();
        // North/east edges spill outside the beachhead; south/west edges stay inside it.
        var query = new ListingSearchQuery
        {
            MinLat = 38.90,
            MaxLat = 39.10,
            MinLng = -77.30,
            MaxLng = -77.05,
        };

        var bounds = policy.ResolveSearchBounds(query);

        Assert.Equal(38.90, bounds.MinLatitude);
        Assert.Equal(MaxLatitude, bounds.MaxLatitude);
        Assert.Equal(-77.30, bounds.MinLongitude);
        Assert.Equal(MaxLongitude, bounds.MaxLongitude);
    }

    [Fact]
    public void ResolveSearchBounds_ViewportFullyDisjoint_ReturnsDegenerateBox()
    {
        var policy = CreatePolicy();
        // Entirely north-east of the beachhead on both axes.
        var query = new ListingSearchQuery
        {
            MinLat = 39.50,
            MaxLat = 39.60,
            MinLng = -77.00,
            MaxLng = -76.90,
        };

        var bounds = policy.ResolveSearchBounds(query);

        // Both edges collapse onto the nearest (north-east) corner of the beachhead: a
        // zero-area box that can match no coordinate strictly inside the served area.
        Assert.Equal(bounds.MinLatitude, bounds.MaxLatitude);
        Assert.Equal(bounds.MinLongitude, bounds.MaxLongitude);
        Assert.Equal(MaxLatitude, bounds.MinLatitude);
        Assert.Equal(MaxLongitude, bounds.MinLongitude);
        Assert.Equal(0d, (bounds.MaxLatitude - bounds.MinLatitude) * (bounds.MaxLongitude - bounds.MinLongitude));
    }

    [Fact]
    public void ResolveSearchBounds_CenterAndRadius_ProducesBoundsClampedIntoBeachhead()
    {
        var policy = CreatePolicy();
        // 50km radius from the beachhead center comfortably exceeds the ~13km-tall,
        // ~24km-wide beachhead, so the resolved box must be clamped down to it.
        var query = new ListingSearchQuery
        {
            CenterLat = CenterLatitude,
            CenterLng = CenterLongitude,
            RadiusMeters = 50_000,
        };

        var bounds = policy.ResolveSearchBounds(query);

        Assert.True(bounds.MinLatitude >= MinLatitude);
        Assert.True(bounds.MaxLatitude <= MaxLatitude);
        Assert.True(bounds.MinLongitude >= MinLongitude);
        Assert.True(bounds.MaxLongitude <= MaxLongitude);
        // The unclamped radius box would have overshot every edge, so clamping must have
        // pinned the result to the full beachhead on all four sides.
        Assert.Equal(MinLatitude, bounds.MinLatitude);
        Assert.Equal(MaxLatitude, bounds.MaxLatitude);
        Assert.Equal(MinLongitude, bounds.MinLongitude);
        Assert.Equal(MaxLongitude, bounds.MaxLongitude);
    }

    [Fact]
    public void ResolveSearchBounds_RadiusWithoutCenter_IsIgnoredAndReturnsFullBeachhead()
    {
        var policy = CreatePolicy();
        // RadiusMeters alone (no center) doesn't satisfy branch 2 of ResolveSearchBounds.
        var query = new ListingSearchQuery { RadiusMeters = 1000 };

        var bounds = policy.ResolveSearchBounds(query);

        Assert.Equal(policy.Beachhead, bounds);
    }

    [Fact]
    public void IsWithinBeachhead_CenterPoint_ReturnsTrue()
    {
        var policy = CreatePolicy();

        Assert.True(policy.IsWithinBeachhead(CenterLatitude, CenterLongitude));
    }

    [Fact]
    public void IsWithinBeachhead_PointNorthOfBeachhead_ReturnsFalse()
    {
        var policy = CreatePolicy();

        Assert.False(policy.IsWithinBeachhead(39.50, CenterLongitude));
    }

    [Fact]
    public void IsWithinBeachhead_PointOnBoundaryCorner_ReturnsTrue()
    {
        var policy = CreatePolicy();

        // Bounds are inclusive on all four edges.
        Assert.True(policy.IsWithinBeachhead(MinLatitude, MinLongitude));
        Assert.True(policy.IsWithinBeachhead(MaxLatitude, MaxLongitude));
    }
}
