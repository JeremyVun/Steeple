using Microsoft.AspNetCore.Mvc;

namespace Steeple.Api.Controllers.Ratings;

/// <summary>Public rating/review reads (CONTRACTS §5).</summary>
[ApiController]
[Route("api/v1")]
public sealed class RatingsController : ControllerBase
{
    private readonly IRatingService _ratings;
    private readonly TimeProvider _clock;

    public RatingsController(IRatingService ratings, TimeProvider clock)
    {
        _ratings = ratings;
        _clock = clock;
    }

    /// <summary>Public, revealed review comments for a venue, newest first.</summary>
    [HttpGet("venues/{id:guid}/ratings")]
    public async Task<ActionResult<VenueReviewPageDto>> VenueReviews(
        Guid id,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 10,
        CancellationToken ct = default)
    {
        return Ok(await _ratings.GetVenueReviewsAsync(id, page, pageSize, _clock.GetUtcNow(), ct));
    }
}
