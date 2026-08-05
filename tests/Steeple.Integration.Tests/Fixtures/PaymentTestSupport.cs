using Microsoft.Extensions.Options;
using Steeple.Api.Configuration;
using Steeple.Api.Contracts.Payments;

namespace Steeple.Integration.Tests.Fixtures;

/// <summary>
/// Inert <see cref="IPaymentService"/> for rigs whose subject isn't payments (the booking
/// integrity proofs construct <c>BookingService</c> directly). Records charge/refund kicks.
/// </summary>
public sealed class NullPaymentService : IPaymentService
{
    public bool HasMethod { get; set; } = true;

    public List<Guid> ChargeKicks { get; } = [];

    public List<Guid> RefundKicks { get; } = [];

    public Task<SetupIntentResponse> CreateSetupAsync(Guid userId, CancellationToken ct = default) =>
        Task.FromResult(new SetupIntentResponse("seti_mock_null", "pk_mock", true));

    public Task<PaymentResult<MyPaymentsDto>> ConfirmMockSetupAsync(Guid userId, MockConfirmSetupRequest request, CancellationToken ct = default) =>
        Task.FromResult(PaymentResult<MyPaymentsDto>.Ok(new MyPaymentsDto(true, null, true)));

    public Task<MyPaymentsDto> GetMyPaymentsAsync(Guid userId, CancellationToken ct = default) =>
        Task.FromResult(new MyPaymentsDto(HasMethod, null, true));

    public Task<bool> HasPaymentMethodAsync(Guid userId, CancellationToken ct = default) =>
        Task.FromResult(HasMethod);

    public Task<PaymentResult<OnboardingLinkDto>> StartOnboardingAsync(Guid callerId, Guid venueId, CancellationToken ct = default) =>
        Task.FromResult(PaymentResult<OnboardingLinkDto>.Ok(new OnboardingLinkDto("mock-onboarding:null", true)));

    public Task<PaymentResult<VenuePaymentStateDto>> CompleteMockOnboardingAsync(Guid callerId, Guid venueId, CancellationToken ct = default) =>
        Task.FromResult(PaymentResult<VenuePaymentStateDto>.Ok(new VenuePaymentStateDto(true, true, true, true, true, null, true)));

    public Task<PaymentResult<VenuePaymentStateDto>> GetVenuePaymentsAsync(Guid callerId, Guid venueId, CancellationToken ct = default) =>
        Task.FromResult(PaymentResult<VenuePaymentStateDto>.Ok(new VenuePaymentStateDto(false, false, false, false, false, null, true)));

    public Task ChargeAtConfirmationAsync(Guid bookingId, CancellationToken ct = default)
    {
        ChargeKicks.Add(bookingId);
        return Task.CompletedTask;
    }

    public Task<SweepOutcome> SweepAsync(DateTimeOffset nowUtc, CancellationToken ct = default) =>
        Task.FromResult(SweepOutcome.Empty);

    public Task RefundCancelledForBookingAsync(Guid bookingId, CancellationToken ct = default)
    {
        RefundKicks.Add(bookingId);
        return Task.CompletedTask;
    }

    public Task<IReadOnlyDictionary<Guid, PaymentStatus>> GetOccurrenceStatusesAsync(IReadOnlyList<Guid> bookingIds, CancellationToken ct = default) =>
        Task.FromResult<IReadOnlyDictionary<Guid, PaymentStatus>>(new Dictionary<Guid, PaymentStatus>());
}

/// <summary>Set-based feature-flag stub: off unless explicitly enabled.</summary>
public sealed class TestFeatureFlags : IFeatureFlags
{
    private readonly HashSet<string> _enabled;

    public TestFeatureFlags(params string[] enabled) => _enabled = [.. enabled];

    public bool IsEnabled(string key) => _enabled.Contains(key);
}

/// <summary>Shared option envelopes for directly constructed services.</summary>
public static class PaymentTestOptions
{
    public static IOptions<PaymentsOptions> Payments(double chargeWindowHours = 48, double cancelDeadlineHours = 24, double retryIntervalSeconds = 0) =>
        Options.Create(new PaymentsOptions
        {
            ChargeWindowHours = chargeWindowHours,
            CancelDeadlineHours = cancelDeadlineHours,
            RetryIntervalSeconds = retryIntervalSeconds,
        });
}
