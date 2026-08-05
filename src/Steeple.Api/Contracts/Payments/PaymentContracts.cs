namespace Steeple.Api.Contracts.Payments;

/// <summary>
/// <c>POST /api/v1/me/payments/setup</c> response (docs/contracts/payments.md). Shaped so Stripe
/// Elements later consumes <see cref="ClientSecret"/>/<see cref="PublishableKey"/> unchanged;
/// <see cref="Mock"/> tells clients to render the mock card form instead of Elements.
/// </summary>
public record SetupIntentResponse(string ClientSecret, string PublishableKey, bool Mock);

/// <summary>
/// <c>POST /api/v1/me/payments/setup/mock-confirm</c> body — the mock stand-in for Stripe
/// Elements' confirm step. Carries display data ONLY: there is deliberately no field a full
/// card number could travel in, and <see cref="Last4"/> must be exactly four digits.
/// </summary>
public record MockConfirmSetupRequest(string? ClientSecret, string? Brand, string? Last4);

/// <summary>The saved default payment method as display data (brand + last4, never a PAN).</summary>
public record SavedPaymentMethodDto(string Brand, string Last4, DateTimeOffset SetAtUtc);

/// <summary><c>GET /api/v1/me/payments</c> response — the caller's method-on-file summary.</summary>
public record MyPaymentsDto(bool HasPaymentMethod, SavedPaymentMethodDto? Method, bool Mock);

/// <summary>
/// <c>POST /api/v1/manage/venues/{id}/payments/onboarding</c> response. At Stripe-time
/// <see cref="Url"/> becomes the Stripe-hosted account-link URL; under the mock it deep-links
/// into the web app's mock onboarding screen, which completes by calling
/// <c>…/payments/onboarding/mock-complete</c>.
/// </summary>
public record OnboardingLinkDto(string Url, bool Mock);

/// <summary>
/// <c>GET /api/v1/manage/venues/{id}/payments</c> response (payments.md §9 wire fields kept so
/// Stripe hosted onboarding slots in later). All-false with <c>OnboardingStarted</c> false =
/// never onboarded.
/// </summary>
public record VenuePaymentStateDto(
    bool OnboardingStarted,
    bool DetailsSubmitted,
    bool ChargesEnabled,
    bool PayoutsEnabled,
    bool OptedIn,
    string? DashboardUrl,
    bool Mock);
