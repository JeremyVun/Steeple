using System.Security.Claims;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Steeple.Api.Contracts.Payments;
using Steeple.Api.Controllers.Payments;

namespace Steeple.Api.Tests.Controllers;

public sealed class PaymentsControllerTests
{
    [Fact]
    public async Task CreateSetup_FlagOff_IsHiddenWithoutCallingPayments()
    {
        var payments = new RecordingPaymentService();
        var controller = CreateController(payments, enabled: false);

        var response = await controller.CreateSetup(default);

        Assert.IsType<NotFoundResult>(response.Result);
        Assert.Equal(0, payments.SetupCalls);
    }

    [Fact]
    public async Task CreateSetup_FlagOn_UsesPaymentService()
    {
        var payments = new RecordingPaymentService();
        var controller = CreateController(payments, enabled: true);

        var response = await controller.CreateSetup(default);

        var ok = Assert.IsType<OkObjectResult>(response.Result);
        Assert.IsType<SetupIntentResponse>(ok.Value);
        Assert.Equal(1, payments.SetupCalls);
    }

    private static PaymentsController CreateController(RecordingPaymentService payments, bool enabled)
    {
        var userId = Guid.NewGuid();
        return new PaymentsController(payments, new FixedFeatureFlags(enabled))
        {
            ControllerContext = new ControllerContext
            {
                HttpContext = new DefaultHttpContext
                {
                    User = new ClaimsPrincipal(new ClaimsIdentity(
                        [new Claim("sub", userId.ToString())],
                        authenticationType: "test")),
                },
            },
        };
    }

    private sealed class FixedFeatureFlags(bool enabled) : IFeatureFlags
    {
        public bool IsEnabled(string key) => enabled && key == PaymentService.PaymentsFlag;
    }

    private sealed class RecordingPaymentService : IPaymentService
    {
        public int SetupCalls { get; private set; }

        public Task<SetupIntentResponse> CreateSetupAsync(Guid userId, CancellationToken ct = default)
        {
            SetupCalls++;
            return Task.FromResult(new SetupIntentResponse("seti_test", "pk_test", Mock: true));
        }

        public Task<PaymentResult<MyPaymentsDto>> ConfirmMockSetupAsync(
            Guid userId, MockConfirmSetupRequest request, CancellationToken ct = default) =>
            throw new NotSupportedException();

        public Task<MyPaymentsDto> GetMyPaymentsAsync(Guid userId, CancellationToken ct = default) =>
            throw new NotSupportedException();

        public Task<bool> HasPaymentMethodAsync(Guid userId, CancellationToken ct = default) =>
            throw new NotSupportedException();

        public Task<PaymentResult<OnboardingLinkDto>> StartOnboardingAsync(
            Guid callerId, Guid venueId, CancellationToken ct = default) =>
            throw new NotSupportedException();

        public Task<PaymentResult<VenuePaymentStateDto>> CompleteMockOnboardingAsync(
            Guid callerId, Guid venueId, CancellationToken ct = default) =>
            throw new NotSupportedException();

        public Task<PaymentResult<VenuePaymentStateDto>> GetVenuePaymentsAsync(
            Guid callerId, Guid venueId, CancellationToken ct = default) =>
            throw new NotSupportedException();

        public Task ChargeAtConfirmationAsync(Guid bookingId, CancellationToken ct = default) =>
            throw new NotSupportedException();

        public Task<SweepOutcome> SweepAsync(DateTimeOffset nowUtc, CancellationToken ct = default) =>
            throw new NotSupportedException();

        public Task RefundCancelledForBookingAsync(Guid bookingId, CancellationToken ct = default) =>
            throw new NotSupportedException();

        public Task<IReadOnlyDictionary<Guid, PaymentStatus>> GetOccurrenceStatusesAsync(
            IReadOnlyList<Guid> bookingIds, CancellationToken ct = default) =>
            throw new NotSupportedException();
    }
}
