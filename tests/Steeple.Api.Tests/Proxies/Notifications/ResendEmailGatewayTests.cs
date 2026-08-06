using Microsoft.Extensions.Logging;
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
