using System.Net;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;

namespace Steeple.Api.Tests.Proxies;

public class GoogleGeocodingGatewayTests
{
    [Fact]
    public async Task GeocodeAsync_DeserializesResolvedLocation()
    {
        var gateway = CreateGateway("""
        {
          "status": "OK",
          "results": [
            {
              "geometry": {
                "location": { "lat": 38.8816, "lng": -77.0910 }
              }
            }
          ]
        }
        """);

        var point = await gateway.GeocodeAsync("400 Maple Avenue West");

        Assert.NotNull(point);
        Assert.Equal(38.8816, point.Value.Latitude);
        Assert.Equal(-77.0910, point.Value.Longitude);
    }

    [Theory]
    [InlineData("{\"status\":\"ZERO_RESULTS\",\"results\":[]}")]
    [InlineData("{\"status\":\"OK\",\"results\":[{\"geometry\":{\"location\":{}}}]}")]
    public async Task GeocodeAsync_UnresolvedResponse_ReturnsNull(string json)
    {
        var gateway = CreateGateway(json);

        Assert.Null(await gateway.GeocodeAsync("unknown"));
    }

    private static GoogleGeocodingGateway CreateGateway(string json)
    {
        var http = new HttpClient(new JsonHandler(json));
        return new GoogleGeocodingGateway(
            http,
            Options.Create(new GeocodingOptions { GoogleApiKey = "test-key" }),
            NullLogger<GoogleGeocodingGateway>.Instance);
    }

    private sealed class JsonHandler(string json) : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct) =>
            Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK)
            {
                Content = new StringContent(json, System.Text.Encoding.UTF8, "application/json"),
            });
    }
}
