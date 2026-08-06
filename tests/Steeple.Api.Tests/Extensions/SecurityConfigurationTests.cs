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
