using Steeple.Api.Contracts.Payments;
using Steeple.Api.Services.Flags;

namespace Steeple.Api.Tests.Support;

/// <summary>Set-based feature-flag stub: off unless explicitly enabled at construction.</summary>
public sealed class SetFeatureFlags : IFeatureFlags
{
    private readonly HashSet<string> _enabled;

    public SetFeatureFlags(params string[] enabled) => _enabled = [.. enabled];

    public bool IsEnabled(string key) => _enabled.Contains(key);
}
/// <summary>
/// Inert <see cref="IPaymentService"/> for unit rigs: configurable method-on-file answer,
/// records charge kicks/refund calls, everything else answers empty.
/// </summary>
public sealed class StubPaymentService : IPaymentService
{
    /// <summary>The answer <see cref="HasPaymentMethodAsync"/> gives (default: a card is on file).</summary>
    public bool HasMethod { get; set; } = true;

    /// <summary>Booking ids passed to <see cref="ChargeAtConfirmationAsync"/>.</summary>
    public List<Guid> ChargeKicks { get; } = [];

    /// <summary>Booking ids passed to <see cref="RefundCancelledForBookingAsync"/>.</summary>
    public List<Guid> RefundKicks { get; } = [];

    public Task<SetupIntentResponse> CreateSetupAsync(Guid userId, CancellationToken ct = default) =>
        Task.FromResult(new SetupIntentResponse("seti_mock_stub", "pk_mock", true));

    public Task<PaymentResult<MyPaymentsDto>> ConfirmMockSetupAsync(Guid userId, MockConfirmSetupRequest request, CancellationToken ct = default) =>
        Task.FromResult(PaymentResult<MyPaymentsDto>.Ok(new MyPaymentsDto(true, null, true)));

    public Task<MyPaymentsDto> GetMyPaymentsAsync(Guid userId, CancellationToken ct = default) =>
        Task.FromResult(new MyPaymentsDto(HasMethod, null, true));

    public Task<bool> HasPaymentMethodAsync(Guid userId, CancellationToken ct = default) =>
        Task.FromResult(HasMethod);

    public Task<PaymentResult<OnboardingLinkDto>> StartOnboardingAsync(Guid callerId, Guid venueId, CancellationToken ct = default) =>
        Task.FromResult(PaymentResult<OnboardingLinkDto>.Ok(new OnboardingLinkDto("mock-onboarding:stub", true)));

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
