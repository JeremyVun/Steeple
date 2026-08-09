using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Steeple.Api.Proxies.Notifications;

namespace Steeple.Api.Tests.Proxies.Notifications;

public class ResendEmailGatewayTests
{
    [Fact]
    public async Task SendAsync_MissingApiKey_DoesNotLogPrivateMessageData()
    {
        var gateway = new ResendEmailGateway(
            new HttpClient(),
            Options.Create(new EmailOptions()),
            new FailOnLogLogger<ResendEmailGateway>());

        await gateway.SendAsync(
            "private-person@example.com",
            new EmailContent("Private booking", "The private schedule and message body."));
    }

    [Fact]
    public async Task SendAsync_ProviderRejection_ThrowsSoTheOutboxCanRetry()
    {
        using var http = new HttpClient(new RejectingHandler());
        var gateway = new ResendEmailGateway(
            http,
            Options.Create(new EmailOptions { ApiKey = "test-key" }),
            NullLogger<ResendEmailGateway>.Instance);

        var exception = await Assert.ThrowsAsync<HttpRequestException>(() => gateway.SendAsync(
            "private-person@example.com",
            new EmailContent("Private booking", "The private schedule and message body.")));

        Assert.Equal(System.Net.HttpStatusCode.ServiceUnavailable, exception.StatusCode);
    }

    private sealed class RejectingHandler : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(
            HttpRequestMessage request,
            CancellationToken cancellationToken) =>
            Task.FromResult(new HttpResponseMessage(System.Net.HttpStatusCode.ServiceUnavailable));
    }

    private sealed class FailOnLogLogger<T> : ILogger<T>
    {
        public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;

        public bool IsEnabled(LogLevel logLevel) => true;

        public void Log<TState>(
            LogLevel logLevel,
            EventId eventId,
            TState state,
            Exception? exception,
            Func<TState, Exception?, string> formatter) =>
            throw new InvalidOperationException($"Unexpected email log: {formatter(state, exception)}");
    }
}
