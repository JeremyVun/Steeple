using Microsoft.AspNetCore.Mvc.ApplicationModels;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.DependencyInjection;
using System.Reflection;

namespace Steeple.Api.Tests.Extensions;

public class SecurityConfigurationTests
{
    [Fact]
    public void ProductionConfigurationValidator_DevelopmentIsExempt()
    {
        var configuration = new ConfigurationBuilder().Build();

        ProductionConfigurationValidator.Validate(configuration, new TestHostEnvironment("Development"));
    }

    [Theory]
    [InlineData("google", "disabled", "disabled", "disabled")]
    [InlineData("apple", "enabled", "fcm", "enabled")]
    public void ProductionConfigurationValidator_SupportedProductionModesPass(
        string geocodingMode, string turnstileMode, string pushMode, string googleSsoMode)
    {
        var overrides = new Dictionary<string, string?>
        {
            ["Geocoding:Mode"] = geocodingMode,
            ["Turnstile:Mode"] = turnstileMode,
            ["Push:Mode"] = pushMode,
            ["Auth:Google:Mode"] = googleSsoMode,
        };
        if (geocodingMode == "apple")
        {
            overrides["Geocoding:AppleTeamId"] = "TEAM123456";
            overrides["Geocoding:AppleKeyId"] = "KEY1234567";
            overrides["Geocoding:ApplePrivateKey"] = "private-key";
        }
        if (turnstileMode == "enabled")
        {
            overrides["Turnstile:SecretKey"] = "turnstile-secret";
        }
        if (pushMode == "fcm")
        {
            overrides["Push:ServiceAccountJson"] = "{}";
        }
        if (googleSsoMode == "enabled")
        {
            overrides["Auth:Google:ClientIds:0"] = "google-client-id";
        }

        ProductionConfigurationValidator.Validate(
            ProductionConfiguration(overrides),
            new TestHostEnvironment("Production"));
    }

    [Theory]
    [InlineData("ConnectionStrings:SteepleDb", "Host=db;Database=steeple;Username=steeple;Password=steeple_dev_pw", "Database")]
    [InlineData("ConnectionStrings:SteepleDb", "Host=db;Database=steeple;Username=steeple", "Database")]
    [InlineData("Email:ApiKey", "", "Email")]
    [InlineData("Email:Mode", "disabled", "Email")]
    [InlineData("Geocoding:Mode", "development", "Geocoding")]
    [InlineData("Media:Mode", "development", "Media")]
    [InlineData("Seo:PublicBaseUrl", "", "SEO")]
    [InlineData("Auth:Apple:Mode", "disabled", "Identity/Apple")]
    [InlineData("Auth:Apple:Mode", "disabled", "Identity/SSO")]
    [InlineData("Auth:Apple:ClientIds:0", "", "Identity/Apple")]
    [InlineData("Auth:Google:Mode", "", "Identity/Google")]
    [InlineData("Turnstile:Mode", "", "Turnstile")]
    [InlineData("Push:Mode", "", "Push")]
    [InlineData("Flags:payments.enabled", "true", "Payments")]
    public void ProductionConfigurationValidator_BrokenCapabilityNamesTheCapability(
        string key, string value, string capability)
    {
        var configuration = ProductionConfiguration(new Dictionary<string, string?> { [key] = value });

        var exception = Assert.Throws<InvalidOperationException>(() =>
            ProductionConfigurationValidator.Validate(configuration, new TestHostEnvironment("Production")));

        Assert.Contains(capability, exception.Message);
    }

    [Fact]
    public void ProductionConfigurationValidator_EnabledTurnstileRequiresSecret()
    {
        var configuration = ProductionConfiguration(new Dictionary<string, string?>
        {
            ["Turnstile:Mode"] = "enabled",
            ["Turnstile:SecretKey"] = "",
        });

        var exception = Assert.Throws<InvalidOperationException>(() =>
            ProductionConfigurationValidator.Validate(configuration, new TestHostEnvironment("Production")));

        Assert.Contains("Turnstile", exception.Message);
        Assert.Contains("SecretKey", exception.Message);
    }

    [Fact]
    public void AddSteepleApi_ProductionRejectsRepositoryKnownSigningKeyEagerly()
    {
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Auth:Jwt:SigningKey"] = "4kdPT0yylVMLDzUyD9BXXtDNbjM01xd1Cx3BgDMHo9Q=",
            })
            .Build();

        var exception = Assert.Throws<InvalidOperationException>(() =>
            new ServiceCollection().AddSteepleApi(configuration, new TestHostEnvironment("Production")));

        Assert.Contains("repository-known", exception.Message);
    }

    [Fact]
    public void AddSteepleApi_ProductionRejectsEnabledMockPayments()
    {
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Payments:Gateway"] = "mock",
                ["Flags:payments.enabled"] = "true",
                ["Auth:Jwt:SigningKey"] = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
            })
            .Build();

        var exception = Assert.Throws<InvalidOperationException>(() =>
            new ServiceCollection().AddSteepleApi(configuration, new TestHostEnvironment("Production")));

        Assert.Contains("cannot enable 'payments.enabled'", exception.Message);
    }

    [Theory]
    [InlineData(false, false)]
    [InlineData(true, true)]
    public void AddSteepleApi_PaymentSweeperRegistrationFollowsFlag(bool enabled, bool expected)
    {
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Auth:Jwt:SigningKey"] = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
                ["Flags:payments.enabled"] = enabled.ToString(),
            })
            .Build();
        var services = new ServiceCollection();

        services.AddSteepleApi(configuration, new TestHostEnvironment("Development"));

        Assert.Equal(expected, services.Any(descriptor =>
            descriptor.ServiceType == typeof(IHostedService)
            && descriptor.ImplementationType == typeof(PaymentSweeper)));
    }

    [Fact]
    public void DevelopmentOnlyActionConvention_RemovesMarkedActionsOutsideDevelopment()
    {
        var application = new ApplicationModel();
        var controller = new ControllerModel(typeof(FakeController).GetTypeInfo(), []);
        application.Controllers.Add(controller);
        controller.Actions.Add(Action(nameof(FakeController.Normal)));
        controller.Actions.Add(Action(nameof(FakeController.DevelopmentOnly)));

        new DevelopmentOnlyActionConvention(isDevelopment: false).Apply(application);

        Assert.Equal(nameof(FakeController.Normal), Assert.Single(controller.Actions).ActionMethod.Name);
    }

    [Fact]
    public void DevelopmentOnlyActionConvention_RemovesMarkedControllersOutsideDevelopment()
    {
        var application = new ApplicationModel();
        application.Controllers.Add(new ControllerModel(
            typeof(DevelopmentOnlyController).GetTypeInfo(),
            typeof(DevelopmentOnlyController).GetCustomAttributes(inherit: true).Cast<object>().ToArray()));

        new DevelopmentOnlyActionConvention(isDevelopment: false).Apply(application);

        Assert.Empty(application.Controllers);
    }

    private static ActionModel Action(string methodName)
    {
        var method = typeof(FakeController).GetMethod(methodName)!;
        return new ActionModel(method, method.GetCustomAttributes(inherit: true).Cast<object>().ToArray());
    }

    private static IConfiguration ProductionConfiguration(IReadOnlyDictionary<string, string?>? overrides = null)
    {
        var values = new Dictionary<string, string?>
        {
            ["ConnectionStrings:SteepleDb"] = "Host=db;Database=steeple;Username=steeple;Password=deployment-secret",
            ["Auth:Jwt:SigningKey"] = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
            ["Auth:Google:Mode"] = "disabled",
            ["Auth:Apple:Mode"] = "enabled",
            ["Auth:Apple:ClientIds:0"] = "com.example.steeple.web",
            ["Turnstile:Mode"] = "disabled",
            ["Email:Mode"] = "resend",
            ["Email:ApiKey"] = "resend-key",
            ["Email:From"] = "Steeple <hello@steeple.example>",
            ["Email:WebBaseUrl"] = "https://steeple.example",
            ["Geocoding:Mode"] = "google",
            ["Geocoding:GoogleApiKey"] = "geocoding-key",
            ["Media:Mode"] = "objectStorage",
            ["Media:ServiceUrl"] = "https://objects.example",
            ["Media:Bucket"] = "steeple-media",
            ["Media:AccessKey"] = "access-key",
            ["Media:SecretKey"] = "secret-key",
            ["Media:PublicBaseUrl"] = "https://media.example",
            ["Seo:PublicBaseUrl"] = "https://steeple.example",
            ["Push:Mode"] = "disabled",
            ["Payments:Gateway"] = "mock",
            ["Flags:payments.enabled"] = "false",
        };
        if (overrides is not null)
        {
            foreach (var (key, value) in overrides)
            {
                values[key] = value;
            }
        }

        return new ConfigurationBuilder().AddInMemoryCollection(values).Build();
    }

    private sealed class FakeController
    {
        public void Normal() { }

        [DevelopmentOnly]
        public void DevelopmentOnly() { }
    }

    [DevelopmentOnly]
    private sealed class DevelopmentOnlyController { }

    private sealed class TestHostEnvironment(string environmentName) : IHostEnvironment
    {
        public string EnvironmentName { get; set; } = environmentName;
        public string ApplicationName { get; set; } = "Steeple.Api.Tests";
        public string ContentRootPath { get; set; } = "/tmp";
        public IFileProvider ContentRootFileProvider { get; set; } = new NullFileProvider();
    }
}
