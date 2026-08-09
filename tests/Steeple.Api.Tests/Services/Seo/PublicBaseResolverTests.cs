using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;

namespace Steeple.Api.Tests.Services.Seo;

/// <summary>
/// One canonical origin for the whole crawler surface. The tests that matter here are the ones
/// about trust: <c>X-Forwarded-Host</c>/<c>-Prefix</c> are unvalidated client input (Program.cs
/// trust-bounds only <c>For</c>/<c>Proto</c>), and before this resolver the sitemap built its
/// absolute URLs out of them (docs/contracts/seo.md, Public base and sub-path deployment).
/// </summary>
public class PublicBaseResolverTests
{
    [Fact]
    public void Configured_base_wins_over_any_forwarded_header()
    {
        var resolver = Resolver("https://steeple.app");
        var request = Request(scheme: "http", host: "localhost:5200");
        request.Headers["X-Forwarded-Host"] = "evil.example";
        request.Headers["X-Forwarded-Prefix"] = "/pwned";
        request.Headers["X-Forwarded-Proto"] = "gopher";

        var resolved = resolver.Resolve(request);

        Assert.Equal("https://steeple.app", resolved.Root);
        Assert.Equal("https://steeple.app/space/v/r", resolved.Absolute("space/v/r"));
    }

    [Fact]
    public void A_configured_prefix_travels_with_every_url()
    {
        var resolved = Resolver("https://example.com/steeple/").Resolve(Request());

        Assert.Equal("https://example.com", resolved.Origin);
        Assert.Equal("/steeple", resolved.Prefix);
        Assert.Equal("/steeple/", resolved.BasePath);
        Assert.Equal("/steeple/route-handoff.js", resolved.Path("route-handoff.js"));
        Assert.Equal("https://example.com/steeple/", resolved.Absolute(string.Empty));
    }

    [Fact]
    public void Unconfigured_falls_back_to_the_request_origin_and_never_to_a_forwarded_host()
    {
        var request = Request(scheme: "http", host: "localhost:5173");
        request.Headers["X-Forwarded-Host"] = "evil.example";
        request.Headers["X-Forwarded-Prefix"] = "/pwned";

        var resolved = Resolver(configured: "").Resolve(request);

        Assert.Equal("http://localhost:5173", resolved.Root);
    }

    [Fact]
    public void Unconfigured_honours_the_path_base_a_trusted_host_set()
    {
        var request = Request();
        request.PathBase = "/steeple";

        Assert.Equal("https://steeple.test/steeple", Resolver(configured: "").Resolve(request).Root);
    }

    [Fact]
    public void An_unconfigured_deployment_reached_under_a_prefix_says_so_once_and_names_the_key()
    {
        // The soft-broken deploy this guard exists for: an edge strips /steeple and describes it,
        // nothing here obeys that description, and every URL published is missing the prefix. The
        // header buys a log line and never a URL.
        var log = new RecordingLogger();
        var resolver = Resolver(configured: "", development: false, log: log);

        var first = resolver.Resolve(RequestWithPrefix("/steeple"));
        resolver.Resolve(RequestWithPrefix("/steeple"));

        Assert.Equal("https://steeple.test", first.Root);
        var warning = Assert.Single(log.Warnings);
        Assert.Contains("Seo:PublicBaseUrl", warning, StringComparison.Ordinal);
        Assert.Contains("/steeple", warning, StringComparison.Ordinal);
    }

    [Fact]
    public void A_configured_deployment_and_a_bare_request_have_nothing_to_warn_about()
    {
        var configured = new RecordingLogger();
        Resolver("https://steeple.app/steeple", development: false, log: configured)
            .Resolve(RequestWithPrefix("/steeple"));

        var unprefixed = new RecordingLogger();
        Resolver(configured: "", development: false, log: unprefixed).Resolve(Request());

        Assert.Empty(configured.Warnings);
        Assert.Empty(unprefixed.Warnings);
    }

    [Fact]
    public void A_misconfigured_base_fails_at_startup_rather_than_at_the_first_crawl()
    {
        Assert.Throws<InvalidOperationException>(() => Resolver("steeple.app"));
        Assert.Throws<InvalidOperationException>(() => Resolver("ftp://steeple.app"));
    }

    [Theory]
    [InlineData("media/a.jpg", "https://steeple.app/media/a.jpg")]
    [InlineData("/media/a.jpg", "https://steeple.app/media/a.jpg")]
    [InlineData("https://cdn.example/a.jpg", "https://cdn.example/a.jpg")]
    public void Media_paths_resolve_only_when_they_are_relative(string stored, string expected) =>
        Assert.Equal(expected, PublicBase.Parse("https://steeple.app").AbsoluteMedia(stored));

    private static PublicBaseResolver Resolver(
        string configured,
        bool development = true,
        ILogger<PublicBaseResolver>? log = null) =>
        new(
            Options.Create(new SeoOptions { PublicBaseUrl = configured }),
            new StubHostEnvironment(development ? Environments.Development : Environments.Production),
            log ?? NullLogger<PublicBaseResolver>.Instance);

    private static HttpRequest Request(string scheme = "https", string host = "steeple.test")
    {
        var context = new DefaultHttpContext();
        context.Request.Scheme = scheme;
        context.Request.Host = new HostString(host);
        return context.Request;
    }

    private static HttpRequest RequestWithPrefix(string prefix)
    {
        var request = Request();
        request.Headers["X-Forwarded-Prefix"] = prefix;
        return request;
    }

    private sealed class RecordingLogger : ILogger<PublicBaseResolver>
    {
        public List<string> Warnings { get; } = [];

        public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;

        public bool IsEnabled(LogLevel logLevel) => true;

        public void Log<TState>(
            LogLevel logLevel,
            EventId eventId,
            TState state,
            Exception? exception,
            Func<TState, Exception?, string> formatter)
        {
            if (logLevel == LogLevel.Warning)
            {
                Warnings.Add(formatter(state, exception));
            }
        }
    }
}
