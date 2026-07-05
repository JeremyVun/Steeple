using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Steeple.Api.Contracts.Bookings;
using Steeple.Api.Services.Bookings;

namespace Steeple.Api.Controllers.Bookings;
/// <summary>
/// Bookings surface (CONTRACTS §5): both parties' lists, the detail with its occurrence set,
/// cancellation (notice-window rules in the service), and per-occurrence no-show marking.
/// Bookings are only ever *created* by the Applications decision endpoint — approval is the
/// booking transaction; there is deliberately no <c>POST /bookings</c>.
/// </summary>
[ApiController]
[Authorize]
[Route("api/v1")]
public sealed class BookingsController : ControllerBase
{
    private readonly IBookingService _bookings;
    private readonly IRatingService _ratings;

    public BookingsController(IBookingService bookings, IRatingService ratings)
    {
        _bookings = bookings;
        _ratings = ratings;
    }

    /// <summary>The organizer's bookings, newest first (<c>?status=</c> filters by wire token).</summary>
    [HttpGet("me/bookings")]
    public async Task<ActionResult<BookingListResult>> Mine(
        [FromQuery] string? status, [FromQuery] int page = 1, [FromQuery] int pageSize = 24, CancellationToken ct = default)
    {
        var result = await _bookings.GetForOrganizerAsync(User.GetUserId(), status, page, pageSize, ct);
        return result.Error is null ? Ok(result.Value) : ToProblem(result.Error);
    }

    /// <summary>Bookings across every venue the caller manages.</summary>
    [HttpGet("manage/bookings")]
    public async Task<ActionResult<BookingListResult>> Manage(
        [FromQuery] string? status, [FromQuery] int page = 1, [FromQuery] int pageSize = 24, CancellationToken ct = default)
    {
        var result = await _bookings.GetForManagerAsync(User.GetUserId(), status, page, pageSize, ct);
        return result.Error is null ? Ok(result.Value) : ToProblem(result.Error);
    }

    /// <summary>Full booking incl. occurrences. Party-scoped — anyone else 404s.</summary>
    [HttpGet("bookings/{id:guid}")]
    public async Task<ActionResult<BookingDto>> Get(Guid id, CancellationToken ct)
    {
        var result = await _bookings.GetAsync(id, User.GetUserId(), ct);
        return result.Error is null ? Ok(result.Value) : ToProblem(result.Error);
    }

    /// <summary>Cancels the booking (either party); slots beyond the notice window are freed.</summary>
    [HttpPost("bookings/{id:guid}/cancel")]
    [EnableRateLimiting(RateLimitPolicies.Apply)]
    public async Task<ActionResult<BookingDto>> Cancel(
        Guid id, [FromBody] CancelBookingRequest request, CancellationToken ct)
    {
        var result = await _bookings.CancelAsync(id, User.GetUserId(), request, ct);
        return result.Error is null ? Ok(result.Value) : ToProblem(result.Error);
    }

    /// <summary>Marks a past occurrence as a no-show (either party marks the other).</summary>
    [HttpPost("occurrences/{id:guid}/no-show")]
    [EnableRateLimiting(RateLimitPolicies.Apply)]
    public async Task<ActionResult<BookingDto>> MarkNoShow(Guid id, CancellationToken ct)
    {
        var result = await _bookings.MarkNoShowAsync(id, User.GetUserId(), ct);
        return result.Error is null ? Ok(result.Value) : ToProblem(result.Error);
    }

    /// <summary>Submits the caller's one immutable star rating for a rateable booking.</summary>
    [HttpPost("bookings/{id:guid}/ratings")]
    [EnableRateLimiting(RateLimitPolicies.Apply)]
    public async Task<IActionResult> Rate(Guid id, [FromBody] SubmitRatingRequest request, CancellationToken ct)
    {
        var result = await _ratings.SubmitAsync(id, User.GetUserId(), request, ct);
        return result.Error is null ? NoContent() : ToProblem(result.Error);
    }

    /// <summary>Maps a stable bookings error code onto the RFC 9457 envelope (CONTRACTS §2).</summary>
    private ObjectResult ToProblem(BookingError error)
    {
        var status = error.Code switch
        {
            BookingErrorCodes.InvalidState => StatusCodes.Status409Conflict,
            BookingErrorCodes.InvalidRating => StatusCodes.Status400BadRequest,
            BookingErrorCodes.InvalidBooking => StatusCodes.Status400BadRequest,
            _ => StatusCodes.Status404NotFound,
        };

        return Problem(detail: error.Detail, statusCode: status, extensions: new Dictionary<string, object?>
        {
            ["code"] = error.Code,
        });
    }
}
