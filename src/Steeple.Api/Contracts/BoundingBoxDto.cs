namespace Steeple.Api.Contracts;
/// <summary>
/// Wire contract for an axis-aligned geographic rectangle (decimal degrees), inclusive on all four
/// edges. A self-contained mirror of <see cref="Steeple.Persistence.Models.BoundingBox"/> so
/// response DTOs never leak the persistence value object onto the wire.
/// </summary>
/// <param name="MinLat">Southern edge (smallest latitude).</param>
/// <param name="MaxLat">Northern edge (largest latitude).</param>
/// <param name="MinLng">Western edge (smallest longitude).</param>
/// <param name="MaxLng">Eastern edge (largest longitude).</param>
public record BoundingBoxDto(double MinLat, double MaxLat, double MinLng, double MaxLng);
