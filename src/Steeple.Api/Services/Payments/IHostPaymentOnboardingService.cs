using Steeple.Api.Contracts.Payments;

namespace Steeple.Api.Services.Payments;

public interface IHostPaymentOnboardingService
{
    Task<PaymentResult<OnboardingLinkDto>> StartAsync(Guid callerId, Guid venueId, CancellationToken ct = default);
    Task<PaymentResult<VenuePaymentStateDto>> GetAsync(Guid callerId, Guid venueId, CancellationToken ct = default);
    Task<PaymentResult<VenuePaymentStateDto>> SetOptInAsync(Guid callerId, Guid venueId, bool optedIn, CancellationToken ct = default);
    Task<PaymentResult<DashboardLinkDto>> CreateDashboardLinkAsync(Guid callerId, Guid venueId, CancellationToken ct = default);
    Task<PaymentResult<VenuePaymentStateDto>> CompleteMockAsync(Guid callerId, Guid venueId, CancellationToken ct = default);
    Task<PaymentResult<WebhookReceiptDto>> ProcessWebhookAsync(string payload, string signature, CancellationToken ct = default);
}
