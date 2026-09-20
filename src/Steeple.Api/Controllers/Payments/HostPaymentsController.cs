using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Steeple.Api.Contracts.Payments;

namespace Steeple.Api.Controllers.Payments;

[ApiController]
[Authorize]
[Route("api/v1")]
public sealed class HostPaymentsController : ControllerBase
{
    private readonly IHostPaymentOnboardingService _onboarding;
    private readonly IFeatureFlags _flags;
    private readonly IHostEnvironment _environment;

    public HostPaymentsController(
        IHostPaymentOnboardingService onboarding,
        IFeatureFlags flags,
        IHostEnvironment environment)
    {
        _onboarding = onboarding;
        _flags = flags;
        _environment = environment;
    }

    private bool Enabled => _flags.IsEnabled(HostPaymentOnboardingService.OnboardingFlag)
        || _environment.IsDevelopment() && _flags.IsEnabled(PaymentService.PaymentsFlag);

    [HttpGet("manage/venues/{id:guid}/payments")]
    public async Task<ActionResult<VenuePaymentStateDto>> Get(Guid id, CancellationToken ct)
    {
        if (!Enabled) return NotFound();
        return ToActionResult(await _onboarding.GetAsync(User.GetUserId(), id, ct));
    }

    [HttpPost("manage/venues/{id:guid}/payments/onboarding")]
    [EnableRateLimiting(RateLimitPolicies.Manage)]
    public async Task<ActionResult<OnboardingLinkDto>> Start(Guid id, CancellationToken ct)
    {
        if (!Enabled) return NotFound();
        return ToActionResult(await _onboarding.StartAsync(User.GetUserId(), id, ct));
    }

    [HttpPost("manage/venues/{id:guid}/payments/onboarding/mock-complete")]
    [DevelopmentOnly]
    [EnableRateLimiting(RateLimitPolicies.Manage)]
    public async Task<ActionResult<VenuePaymentStateDto>> CompleteMock(Guid id, CancellationToken ct)
    {
        if (!Enabled) return NotFound();
        return ToActionResult(await _onboarding.CompleteMockAsync(User.GetUserId(), id, ct));
    }

    [HttpPut("manage/venues/{id:guid}/payments/opt-in")]
    [EnableRateLimiting(RateLimitPolicies.Manage)]
    public async Task<ActionResult<VenuePaymentStateDto>> SetOptIn(
        Guid id, [FromBody] SetVenuePaymentOptInRequest request, CancellationToken ct)
    {
        if (!Enabled) return NotFound();
        return ToActionResult(await _onboarding.SetOptInAsync(User.GetUserId(), id, request.OptedIn, ct));
    }

    [HttpPost("manage/venues/{id:guid}/payments/dashboard")]
    [EnableRateLimiting(RateLimitPolicies.Manage)]
    public async Task<ActionResult<DashboardLinkDto>> Dashboard(Guid id, CancellationToken ct)
    {
        if (!Enabled) return NotFound();
        return ToActionResult(await _onboarding.CreateDashboardLinkAsync(User.GetUserId(), id, ct));
    }

    [AllowAnonymous]
    [HttpPost("payments/webhook")]
    [RequestSizeLimit(64 * 1024)]
    [EnableRateLimiting(RateLimitPolicies.PaymentWebhooks)]
    public async Task<ActionResult<WebhookReceiptDto>> Webhook(CancellationToken ct)
    {
        using var reader = new StreamReader(Request.Body);
        var payload = await reader.ReadToEndAsync(ct);
        var signature = Request.Headers["Stripe-Signature"].ToString();
        return ToActionResult(await _onboarding.ProcessWebhookAsync(payload, signature, ct));
    }

    private ActionResult<T> ToActionResult<T>(PaymentResult<T> result) where T : class =>
        result.Error is null ? Ok(result.Value) : ToProblem(result.Error);

    private ObjectResult ToProblem(PaymentError error)
    {
        var status = error.Code switch
        {
            PaymentErrorCodes.InvalidPayment or PaymentErrorCodes.InvalidWebhookSignature => StatusCodes.Status400BadRequest,
            PaymentErrorCodes.AccountNotReady => StatusCodes.Status409Conflict,
            PaymentErrorCodes.ProviderUnavailable => StatusCodes.Status503ServiceUnavailable,
            _ => StatusCodes.Status404NotFound,
        };
        return Problem(detail: error.Detail, statusCode: status, extensions: new Dictionary<string, object?>
        {
            ["code"] = error.Code,
        });
    }
}
