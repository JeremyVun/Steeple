using System.Security.Claims;
using System.Text.Json;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Hosting;
using Steeple.Api.Contracts.Payments;
using Steeple.Api.Controllers.Payments;

namespace Steeple.Api.Tests.Controllers;

public sealed class HostPaymentsControllerTests
{
    [Fact]
    public void OptInBody_RequiresExplicitBooleanProperty()
    {
        Assert.Throws<JsonException>(() => JsonSerializer.Deserialize<SetVenuePaymentOptInRequest>(
            "{}", new JsonSerializerOptions(JsonSerializerDefaults.Web)));
    }

    [Fact]
    public async Task Get_IsControlledOnlyByOnboardingFlag()
    {
        var service = new RecordingService();
        var enabled = CreateController(service, new SetFeatureFlags(FeatureFlagKeys.PaymentsOnboarding), "Production");

        var response = await enabled.Get(Guid.NewGuid(), default);

        Assert.IsType<OkObjectResult>(response.Result);
        Assert.Equal(1, service.GetCalls);

        var legacy = CreateController(service, new SetFeatureFlags(FeatureFlagKeys.PaymentsEnabled), "Development");
        response = await legacy.Get(Guid.NewGuid(), default);
        Assert.IsType<OkObjectResult>(response.Result);
        Assert.Equal(2, service.GetCalls);

        var hidden = CreateController(service, new SetFeatureFlags(FeatureFlagKeys.PaymentsEnabled), "Production");
        response = await hidden.Get(Guid.NewGuid(), default);
        Assert.IsType<NotFoundResult>(response.Result);
        Assert.Equal(2, service.GetCalls);
    }

    private static HostPaymentsController CreateController(RecordingService service, IFeatureFlags flags, string environment) =>
        new(service, flags, new Environment(environment))
        {
            ControllerContext = new ControllerContext
            {
                HttpContext = new DefaultHttpContext
                {
                    User = new ClaimsPrincipal(new ClaimsIdentity(
                        [new Claim("sub", Guid.NewGuid().ToString())], "test")),
                },
            },
        };

    private sealed class Environment(string name) : IHostEnvironment
    {
        public string EnvironmentName { get; set; } = name;
        public string ApplicationName { get; set; } = "tests";
        public string ContentRootPath { get; set; } = "/tmp";
        public IFileProvider ContentRootFileProvider { get; set; } = new NullFileProvider();
    }

    private sealed class RecordingService : IHostPaymentOnboardingService
    {
        public int GetCalls { get; private set; }

        public Task<PaymentResult<VenuePaymentStateDto>> GetAsync(Guid callerId, Guid venueId, CancellationToken ct = default)
        {
            GetCalls++;
            return Task.FromResult(PaymentResult<VenuePaymentStateDto>.Ok(
                new VenuePaymentStateDto(false, false, false, false, false, null, false)));
        }

        public Task<PaymentResult<OnboardingLinkDto>> StartAsync(Guid callerId, Guid venueId, CancellationToken ct = default) => throw new NotSupportedException();
        public Task<PaymentResult<VenuePaymentStateDto>> SetOptInAsync(Guid callerId, Guid venueId, bool optedIn, CancellationToken ct = default) => throw new NotSupportedException();
        public Task<PaymentResult<DashboardLinkDto>> CreateDashboardLinkAsync(Guid callerId, Guid venueId, CancellationToken ct = default) => throw new NotSupportedException();
        public Task<PaymentResult<VenuePaymentStateDto>> CompleteMockAsync(Guid callerId, Guid venueId, CancellationToken ct = default) => throw new NotSupportedException();
        public Task<PaymentResult<WebhookReceiptDto>> ProcessWebhookAsync(string payload, string signature, CancellationToken ct = default) => throw new NotSupportedException();
    }
}
