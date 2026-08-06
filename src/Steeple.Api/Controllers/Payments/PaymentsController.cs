using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Steeple.Api.Contracts.Payments;

namespace Steeple.Api.Controllers.Payments;
/// <summary>
/// Payments surface (docs/contracts/payments.md): the guest method-on-file loop
/// (<c>/me/payments/*</c> — mock stand-ins for Stripe Elements) and venue payout onboarding
/// (<c>/manage/venues/{id}/payments/*</c>, manager-scoped). All endpoints authenticated; the
/// mock-* endpoints retire at Stripe-time, everything else keeps its shape.
/// </summary>
[ApiController]
[Authorize]
[DevelopmentOnly]
[Route("api/v1")]
public sealed class PaymentsController : ControllerBase
{
    private readonly IPaymentService _payments;

    public PaymentsController(IPaymentService payments) => _payments = payments;

    /// <summary>Ensures the caller's payment customer and opens a setup intent for saving a method.</summary>
    [HttpPost("me/payments/setup")]
    [EnableRateLimiting(RateLimitPolicies.Payments)]
    public async Task<ActionResult<SetupIntentResponse>> CreateSetup(CancellationToken ct) =>
        Ok(await _payments.CreateSetupAsync(User.GetUserId(), ct));

    /// <summary>Mock confirm: records the saved method's brand + last4 (display data only, never a PAN).</summary>
    [HttpPost("me/payments/setup/mock-confirm")]
    [DevelopmentOnly]
    [EnableRateLimiting(RateLimitPolicies.Payments)]
    public async Task<ActionResult<MyPaymentsDto>> MockConfirmSetup(
        [FromBody] MockConfirmSetupRequest request, CancellationToken ct)
    {
        var result = await _payments.ConfirmMockSetupAsync(User.GetUserId(), request, ct);
        return result.Error is null ? Ok(result.Value) : ToProblem(result.Error);
    }

    /// <summary>The caller's saved-method summary.</summary>
    [HttpGet("me/payments")]
    public async Task<ActionResult<MyPaymentsDto>> GetMyPayments(CancellationToken ct) =>
        Ok(await _payments.GetMyPaymentsAsync(User.GetUserId(), ct));

    /// <summary>Starts (or resumes) payout onboarding for a managed venue; returns the onboarding link.</summary>
    [HttpPost("manage/venues/{id:guid}/payments/onboarding")]
    [EnableRateLimiting(RateLimitPolicies.Manage)]
    public async Task<ActionResult<OnboardingLinkDto>> StartOnboarding(Guid id, CancellationToken ct)
    {
        var result = await _payments.StartOnboardingAsync(User.GetUserId(), id, ct);
        return result.Error is null ? Ok(result.Value) : ToProblem(result.Error);
    }

    /// <summary>Mock-completes onboarding in one step (stands in for hosted KYC + webhooks + opt-in).</summary>
    [HttpPost("manage/venues/{id:guid}/payments/onboarding/mock-complete")]
    [DevelopmentOnly]
    [EnableRateLimiting(RateLimitPolicies.Manage)]
    public async Task<ActionResult<VenuePaymentStateDto>> MockCompleteOnboarding(Guid id, CancellationToken ct)
    {
        var result = await _payments.CompleteMockOnboardingAsync(User.GetUserId(), id, ct);
        return result.Error is null ? Ok(result.Value) : ToProblem(result.Error);
    }

    /// <summary>The venue's payout onboarding/opt-in state.</summary>
    [HttpGet("manage/venues/{id:guid}/payments")]
    public async Task<ActionResult<VenuePaymentStateDto>> GetVenuePayments(Guid id, CancellationToken ct)
    {
        var result = await _payments.GetVenuePaymentsAsync(User.GetUserId(), id, ct);
        return result.Error is null ? Ok(result.Value) : ToProblem(result.Error);
    }

    /// <summary>Maps a stable payments error code onto the RFC 9457 envelope (CONTRACTS §2).</summary>
    private ObjectResult ToProblem(PaymentError error)
    {
        var status = error.Code switch
        {
            PaymentErrorCodes.InvalidPayment => StatusCodes.Status400BadRequest,
            _ => StatusCodes.Status404NotFound,
        };

        return Problem(detail: error.Detail, statusCode: status, extensions: new Dictionary<string, object?>
        {
            ["code"] = error.Code,
        });
    }
}
