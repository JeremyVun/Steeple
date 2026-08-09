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
    private const double MinLatitude = 38.30;
    private const double MaxLatitude = 39.55;
    private const double MinLongitude = -78.25;
    private const double MaxLongitude = -76.35;
    private const double CenterLatitude = 38.9072;
    private const double CenterLongitude = -77.0369;

    private static GeofencePolicy CreatePolicy()
    {
        var options = new GeofenceOptions
        {
            AreaName = "Washington metropolitan area",
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

        Assert.Equal(policy.Bounds, bounds);
    }

    [Fact]
    public void ResolveSearchBounds_ViewportFullyInsideBeachhead_ReturnedAsIs()
    {
        var policy = CreatePolicy();
        var query = new ListingSearchQuery
        {
            MinLat = 38.80,
            MaxLat = 39.10,
            MinLng = -77.30,
            MaxLng = -76.80,
        };

        var bounds = policy.ResolveSearchBounds(query);

        Assert.Equal(new BoundingBox(38.80, 39.10, -77.30, -76.80), bounds);
    }

    [Fact]
    public void ResolveSearchBounds_ViewportPartiallyOverlapping_ClampedToIntersection()
    {
        var policy = CreatePolicy();
        // North/east edges spill outside the beachhead; south/west edges stay inside it.
        var query = new ListingSearchQuery
        {
            MinLat = 39.30,
            MaxLat = 39.80,
            MinLng = -76.80,
            MaxLng = -76.10,
        };

        var bounds = policy.ResolveSearchBounds(query);

        Assert.Equal(39.30, bounds.MinLatitude);
        Assert.Equal(MaxLatitude, bounds.MaxLatitude);
        Assert.Equal(-76.80, bounds.MinLongitude);
        Assert.Equal(MaxLongitude, bounds.MaxLongitude);
    }

    [Fact]
    public void ResolveSearchBounds_ViewportFullyDisjoint_ReturnsDegenerateBox()
    {
        var policy = CreatePolicy();
        // Entirely north-east of the beachhead on both axes.
        var query = new ListingSearchQuery
        {
            MinLat = 40.00,
            MaxLat = 40.10,
            MinLng = -76.00,
            MaxLng = -75.90,
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
        // 250km from central DC exceeds the DMV bounds on every edge.
        var query = new ListingSearchQuery
        {
            CenterLat = CenterLatitude,
            CenterLng = CenterLongitude,
            RadiusMeters = 250_000,
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

        Assert.Equal(policy.Bounds, bounds);
    }

    [Fact]
    public void IsServed_CenterPoint_ReturnsTrue()
    {
        var policy = CreatePolicy();

        Assert.True(policy.IsServed(CenterLatitude, CenterLongitude));
    }

    [Fact]
    public void IsServed_PointNorthOfBeachhead_ReturnsFalse()
    {
        var policy = CreatePolicy();

        Assert.False(policy.IsServed(40.00, CenterLongitude));
    }

    [Theory]
    [InlineData(38.9072, -77.0369)] // Washington, DC
    [InlineData(38.8048, -77.0469)] // Alexandria, VA
    [InlineData(38.3032, -77.4605)] // Fredericksburg, VA
    [InlineData(39.4143, -77.4105)] // Frederick, MD
    [InlineData(38.9784, -76.4922)] // Annapolis, MD
    [InlineData(39.2904, -76.6122)] // Baltimore, MD
    public void IsServed_WashingtonMetroLocations_ReturnTrue(double latitude, double longitude)
    {
        var policy = CreatePolicy();

        Assert.True(policy.IsServed(latitude, longitude));
    }

    [Fact]
    public void IsServed_Richmond_ReturnsFalse()
    {
        var policy = CreatePolicy();

        Assert.False(policy.IsServed(37.5407, -77.4360));
    }

    [Fact]
    public void IsServed_PointOnBoundaryCorner_ReturnsTrue()
    {
        var policy = CreatePolicy();

        // Bounds are inclusive on all four edges.
        Assert.True(policy.IsServed(MinLatitude, MinLongitude));
        Assert.True(policy.IsServed(MaxLatitude, MaxLongitude));
    }
}
