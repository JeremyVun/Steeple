using System.Net;
using System.Net.Http;
using System.Security.Cryptography;
using System.Text;
using Steeple.Api.Proxies.Payments;
using Stripe;

namespace Steeple.Api.Tests.Proxies;

public sealed class StripeConnectOnboardingGatewayTests
{
    [Fact]
    public async Task AmbiguousCreate_RecoversAccountByDurableMetadata()
    {
        var provisioningKey = Guid.NewGuid();
        var http = new ScriptedStripeHttp([
            Ok("""{"object":"list","data":[],"has_more":false,"url":"/v1/accounts"}"""),
            Response(HttpStatusCode.InternalServerError, """{"error":{"type":"api_error","message":"uncertain"}}"""),
            Ok(AccountList(provisioningKey)),
        ]);
        var gateway = new StripeConnectOnboardingGateway(new StripeClient("sk_test_valid", httpClient: http));

        var result = await gateway.FindOrCreateAccountAsync(Guid.NewGuid(), provisioningKey);

        Assert.Equal("acct_recovered", result.Id);
        var create = Assert.Single(http.Requests, r => r.Method == HttpMethod.Post);
        Assert.Equal($"connect-account:{provisioningKey:N}", create.StripeHeaders["Idempotency-Key"]);
        var body = await create.Content!.ReadAsStringAsync();
        Assert.DoesNotContain("country", body, StringComparison.OrdinalIgnoreCase);
        Assert.Contains(Uri.EscapeDataString(provisioningKey.ToString("D")), body);
    }

    [Fact]
    public async Task ExistingAccount_IsRecoveredByDurableMetadataBeforeCreate()
    {
        var provisioningKey = Guid.NewGuid();
        var http = new ScriptedStripeHttp([Ok(AccountList(provisioningKey))]);
        var gateway = new StripeConnectOnboardingGateway(new StripeClient("sk_test_valid", httpClient: http));

        var result = await gateway.FindOrCreateAccountAsync(Guid.NewGuid(), provisioningKey);

        Assert.Equal("acct_recovered", result.Id);
        Assert.DoesNotContain(http.Requests, request => request.Method == HttpMethod.Post);
    }

    [Fact]
    public async Task InitialLookup_MapsProviderTimeoutToSafeException()
    {
        var gateway = new StripeConnectOnboardingGateway(
            new StripeClient("sk_test_valid", httpClient: new TimeoutStripeHttp()));

        var exception = await Assert.ThrowsAsync<ConnectProviderException>(() =>
            gateway.FindOrCreateAccountAsync(Guid.NewGuid(), Guid.NewGuid()));

        Assert.IsType<TaskCanceledException>(exception.InnerException);
    }

    [Theory]
    [InlineData("https://evil.example/onboard")]
    [InlineData("https://evil@connect.stripe.com/onboard")]
    [InlineData("https://connect.stripe.com:444/onboard")]
    [InlineData("https://dashboard.stripe.com/onboard")]
    public async Task RedirectLinks_RejectUnsafeUrls(string url)
    {
        var http = new ScriptedStripeHttp([
            Ok("""{"object":"account_link","created":1,"expires_at":2,"url":"URL"}"""
                .Replace("URL", url, StringComparison.Ordinal)),
        ]);
        var gateway = new StripeConnectOnboardingGateway(new StripeClient("sk_test_valid", httpClient: http));

        await Assert.ThrowsAsync<ConnectProviderException>(() => gateway.CreateAccountLinkAsync(
            "acct_test", "https://steeple.test/return", "https://steeple.test/refresh"));
    }

    [Fact]
    public void VerifyWebhook_VerifiesSignatureAndExtractsAccount()
    {
        const string secret = "whsec_test";
        var payload = """{"id":"evt_1","object":"event","api_version":"API_VERSION","type":"account.updated","livemode":false,"account":"acct_1","data":{"object":{"id":"acct_1","object":"account"}}}"""
            .Replace("API_VERSION", StripeConfiguration.ApiVersion, StringComparison.Ordinal);
        var timestamp = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
        var digest = Convert.ToHexStringLower(HMACSHA256.HashData(
            Encoding.UTF8.GetBytes(secret), Encoding.UTF8.GetBytes($"{timestamp}.{payload}")));
        var gateway = new StripeConnectOnboardingGateway(new StripeClient("sk_test_valid"));

        var result = gateway.VerifyWebhook(payload, $"t={timestamp},v1={digest}", secret);

        Assert.Equal("evt_1", result.Id);
        Assert.Equal("acct_1", result.ProviderAccountId);
        Assert.Throws<ConnectWebhookSignatureException>(() =>
            gateway.VerifyWebhook(payload, $"t={timestamp},v1=bad", secret));
    }

    private static string AccountList(Guid provisioningKey) => """
        {"object":"list","data":[{"id":"acct_recovered","object":"account","details_submitted":false,"charges_enabled":false,"payouts_enabled":false,"metadata":{"steeple_provisioning_key":"PROVISIONING_KEY"},"requirements":{"currently_due":[]}}],"has_more":false,"url":"/v1/accounts"}
        """.Replace("PROVISIONING_KEY", provisioningKey.ToString("D"), StringComparison.Ordinal);

    private static StripeResponse Ok(string content) => Response(HttpStatusCode.OK, content);

    private static StripeResponse Response(HttpStatusCode status, string content) =>
        new(status, new HttpResponseMessage().Headers, content);

    private sealed class ScriptedStripeHttp(IEnumerable<StripeResponse> responses) : IHttpClient
    {
        private readonly Queue<StripeResponse> _responses = new(responses);
        public List<StripeRequest> Requests { get; } = [];

        public Task<StripeResponse> MakeRequestAsync(StripeRequest request, CancellationToken cancellationToken = default)
        {
            Requests.Add(request);
            return Task.FromResult(_responses.Dequeue());
        }

        public Task<StripeStreamedResponse> MakeStreamingRequestAsync(
            StripeRequest request, CancellationToken cancellationToken = default) => throw new NotSupportedException();
    }

    private sealed class TimeoutStripeHttp : IHttpClient
    {
        public Task<StripeResponse> MakeRequestAsync(
            StripeRequest request, CancellationToken cancellationToken = default) =>
            Task.FromException<StripeResponse>(new TaskCanceledException("provider timeout"));

        public Task<StripeStreamedResponse> MakeStreamingRequestAsync(
            StripeRequest request, CancellationToken cancellationToken = default) => throw new NotSupportedException();
    }
}
