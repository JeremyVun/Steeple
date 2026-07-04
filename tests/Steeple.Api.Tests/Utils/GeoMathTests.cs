namespace Steeple.Api.Tests.Utils;
/// <summary>
/// Unit tests for the pure geographic math in <see cref="GeoMath"/>.
/// </summary>
public class GeoMathTests
{
    // Grace Community Church of Vienna and Vienna Presbyterian Church from the seed data
    // (db/changelog/002-seed.sql) — roughly 558m apart (haversine, verified independently).
    private const double GraceLat = 38.9012;
    private const double GraceLng = -77.2653;
    private const double PresbyterianLat = 38.9018;
    private const double PresbyterianLng = -77.2589;

    [Fact]
    public void DistanceMeters_KnownPair_ReturnsExpectedDistanceWithinTolerance()
    {
        var meters = GeoMath.DistanceMeters(GraceLat, GraceLng, PresbyterianLat, PresbyterianLng);

        Assert.InRange(meters, 550d, 566d);
    }

    [Fact]
    public void DistanceMeters_SamePoint_ReturnsZero()
    {
        var meters = GeoMath.DistanceMeters(GraceLat, GraceLng, GraceLat, GraceLng);

        Assert.Equal(0d, meters, precision: 9);
    }

    [Fact]
    public void FromRadius_GivenRadius_LatitudeSpanIsApproximatelyTwiceTheRadius()
    {
        const double radiusMeters = 5_000;

        var box = GeoMath.FromRadius(GraceLat, GraceLng, radiusMeters);

        // Symmetric around the center: MaxLatitude - MinLatitude spans two radii.
        var latSpanMeters = (box.MaxLatitude - box.MinLatitude) * 111_320d;
        Assert.Equal(2 * radiusMeters, latSpanMeters, precision: 6);
        Assert.Equal(GraceLat, (box.MinLatitude + box.MaxLatitude) / 2, precision: 9);
    }

    [Fact]
    public void FromRadius_VirginiaLatitude_LongitudeSpanIsWiderThanLatitudeSpan()
    {
        var box = GeoMath.FromRadius(GraceLat, GraceLng, 5_000);

        var latSpan = box.MaxLatitude - box.MinLatitude;
        var lngSpan = box.MaxLongitude - box.MinLongitude;

        // At ~39 degrees north, cos(lat) < 1 so the same radius covers a wider longitude span.
        Assert.True(lngSpan > latSpan, $"expected lngSpan ({lngSpan}) > latSpan ({latSpan})");
        Assert.Equal(GraceLng, (box.MinLongitude + box.MaxLongitude) / 2, precision: 9);
    }

    [Fact]
    public void FromRadius_EquatorCenter_LatitudeAndLongitudeSpansAreEqual()
    {
        // At the equator cos(lat) == 1, so the cos-lat scaling is a no-op and both spans match.
        var box = GeoMath.FromRadius(0d, 0d, 5_000);

        var latSpan = box.MaxLatitude - box.MinLatitude;
        var lngSpan = box.MaxLongitude - box.MinLongitude;
        Assert.Equal(latSpan, lngSpan, precision: 9);
    }

    [Theory]
    [InlineData(90d)]
    [InlineData(-90d)]
    public void FromRadius_PoleAdjacentCenter_ProducesValidFullLongitudeSpan(double poleLatitude)
    {
        // cos(lat) collapses to ~0 at the poles; the guard in FromRadius must kick in rather
        // than divide by (near) zero and produce an unbounded/NaN/Infinity longitude span.
        var box = GeoMath.FromRadius(poleLatitude, 0d, 5_000);

        Assert.False(double.IsNaN(box.MinLongitude) || double.IsNaN(box.MaxLongitude));
        Assert.False(double.IsInfinity(box.MinLongitude) || double.IsInfinity(box.MaxLongitude));
        Assert.Equal(-180d, box.MinLongitude);
        Assert.Equal(180d, box.MaxLongitude);

        // The latitude span itself is unaffected by the guard and stays finite.
        Assert.False(double.IsNaN(box.MinLatitude) || double.IsNaN(box.MaxLatitude));
    }
}
