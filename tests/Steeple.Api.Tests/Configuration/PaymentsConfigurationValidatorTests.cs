using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Hosting;

namespace Steeple.Api.Tests.Configuration;

public sealed class PaymentsConfigurationValidatorTests
{
    [Theory]
    [InlineData("sk_live_forbidden", "true", "test secret key")]
    [InlineData("sk_test_valid", "false", "TestMode")]
    public void StripeSandbox_RejectsLiveConfiguration(string key, string testMode, string expected)
    {
        var exception = Assert.Throws<InvalidOperationException>(() =>
            PaymentsConfigurationValidator.Validate(Configuration(new()
            {
                ["Payments:Connect:SecretKey"] = key,
                ["Payments:Connect:TestMode"] = testMode,
            }), new Environment("Development")));

        Assert.Contains(expected, exception.Message, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void StripeOnboarding_RejectsGuestPaymentIntake()
    {
        var exception = Assert.Throws<InvalidOperationException>(() =>
            PaymentsConfigurationValidator.Validate(Configuration(new()
            {
                ["Flags:payments.enabled"] = "true",
            }), new Environment("Development")));

        Assert.Contains("payments.enabled must remain false", exception.Message);
    }

    [Fact]
    public void StripeMode_RejectsGuestPaymentIntake_WhenOnboardingFlagIsOff()
    {
        var exception = Assert.Throws<InvalidOperationException>(() =>
            PaymentsConfigurationValidator.Validate(Configuration(new()
            {
                ["Flags:payments.onboarding"] = "false",
                ["Flags:payments.enabled"] = "true",
            }), new Environment("Development")));

        Assert.Contains("payments.enabled must remain false", exception.Message);
    }

    [Fact]
    public void ProductionEnabledOnboarding_RequiresStripe()
    {
        var configuration = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["Flags:payments.onboarding"] = "true",
            ["Payments:Connect:Mode"] = "disabled",
        }).Build();

        var exception = Assert.Throws<InvalidOperationException>(() =>
            PaymentsConfigurationValidator.Validate(configuration, new Environment("Production")));

        Assert.Contains("requires Stripe mode", exception.Message);
    }

    [Fact]
    public void StagingEnabledOnboarding_RequiresStripe()
    {
        var configuration = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["Flags:payments.onboarding"] = "true",
            ["Payments:Connect:Mode"] = "disabled",
        }).Build();

        Assert.Throws<InvalidOperationException>(() =>
            PaymentsConfigurationValidator.Validate(configuration, new Environment("Staging")));
    }

    [Fact]
    public void ValidStripeSandboxConfiguration_Passes()
    {
        PaymentsConfigurationValidator.Validate(Configuration(), new Environment("Development"));
    }

    [Theory]
    [InlineData("https://user@steeple.test/app")]
    [InlineData("https://steeple.test/app?next=elsewhere")]
    [InlineData("https://steeple.test/app#fragment")]
    public void WebBaseUrl_RejectsAuthorityAndSuffixAmbiguity(string value)
    {
        var exception = Assert.Throws<InvalidOperationException>(() =>
            PaymentsConfigurationValidator.Validate(Configuration(new()
            {
                ["Payments:Connect:WebBaseUrl"] = value,
            }), new Environment("Development")));

        Assert.Contains("WebBaseUrl", exception.Message);
    }

    private static IConfiguration Configuration(Dictionary<string, string?>? overrides = null)
    {
        var values = new Dictionary<string, string?>
        {
            ["Flags:payments.onboarding"] = "true",
            ["Flags:payments.enabled"] = "false",
            ["Payments:Connect:Mode"] = "stripe",
            ["Payments:Connect:SecretKey"] = "sk_test_valid",
            ["Payments:Connect:WebBaseUrl"] = "https://steeple.test/app",
            ["Payments:Connect:TestMode"] = "true",
        };
        foreach (var pair in overrides ?? []) values[pair.Key] = pair.Value;
        return new ConfigurationBuilder().AddInMemoryCollection(values).Build();
    }

    private sealed class Environment(string name) : IHostEnvironment
    {
        public string EnvironmentName { get; set; } = name;
        public string ApplicationName { get; set; } = "tests";
        public string ContentRootPath { get; set; } = "/tmp";
        public IFileProvider ContentRootFileProvider { get; set; } = new NullFileProvider();
    }
}
