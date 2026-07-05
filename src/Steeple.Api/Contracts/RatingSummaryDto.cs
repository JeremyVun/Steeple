namespace Steeple.Api.Contracts;
/// <summary>Visible star-rating aggregate for a venue/listing surface.</summary>
public record RatingSummaryDto(double AverageStars, int Count);

/// <summary>One public, revealed venue review comment.</summary>
public record VenueReviewDto(int Stars, string? Comment, string RaterName, DateTimeOffset CreatedAtUtc);

/// <summary>Paginated public reviews for a venue (CONTRACTS §2 pagination envelope).</summary>
public record VenueReviewPageDto(
    IReadOnlyList<VenueReviewDto> Items,
    int TotalCount,
    int Page,
    int PageSize);
