namespace Steeple.Api.Configuration;

public static class PaymentsConfigurationValidator
{
    public static void Validate(IConfiguration configuration, IHostEnvironment environment)
    {
        var payments = configuration.GetSection(PaymentsOptions.SectionName).Get<PaymentsOptions>() ?? new PaymentsOptions();
        var connect = payments.Connect;
        var onboardingEnabled = configuration.GetValue<bool>($"Flags:{FeatureFlagKeys.PaymentsOnboarding}");
        var paymentsEnabled = configuration.GetValue<bool>($"Flags:{FeatureFlagKeys.PaymentsEnabled}");
        var stripe = connect.Mode.Equals(ConnectOptions.StripeMode, StringComparison.OrdinalIgnoreCase);

        if (!stripe && !connect.Mode.Equals(ConnectOptions.DisabledMode, StringComparison.OrdinalIgnoreCase))
        {
            throw new InvalidOperationException("Payments/Connect: Mode must be 'disabled' or 'stripe'.");
        }

        if (onboardingEnabled && !environment.IsDevelopment() && !stripe)
        {
            throw new InvalidOperationException("Payments/Connect: payments.onboarding requires Stripe mode outside Development.");
        }

        if (!stripe)
        {
            return;
        }

        if (!connect.TestMode || !connect.SecretKey.StartsWith("sk_test_", StringComparison.Ordinal))
        {
            throw new InvalidOperationException("Payments/Connect: this onboarding slice requires TestMode=true and a Stripe test secret key.");
        }

        if (!IsSafeWebBase(connect.WebBaseUrl))
        {
            throw new InvalidOperationException("Payments/Connect: WebBaseUrl must be an absolute HTTPS URL, or HTTP on loopback for local testing.");
        }

        if (paymentsEnabled)
        {
            throw new InvalidOperationException("Payments/Connect: payments.enabled must remain false while Stripe onboarding is sandbox-only.");
        }

    }

    private static bool IsSafeWebBase(string value)
    {
        if (!Uri.TryCreate(value, UriKind.Absolute, out var uri)
            || string.IsNullOrWhiteSpace(uri.Host)
            || !string.IsNullOrEmpty(uri.UserInfo)
            || !string.IsNullOrEmpty(uri.Query)
            || !string.IsNullOrEmpty(uri.Fragment))
        {
            return false;
        }

        return uri.Scheme.Equals(Uri.UriSchemeHttps, StringComparison.OrdinalIgnoreCase)
            || uri.Scheme.Equals(Uri.UriSchemeHttp, StringComparison.OrdinalIgnoreCase) && uri.IsLoopback;
    }
}
