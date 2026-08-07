using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace Steeple.Api.Tests.Proxies;

public class AppleMapsGatewayTests
{
    [Fact]
    public void CreateAuthorizationToken_MintsAVerifiableEs256TeamJwt()
    {
        using var key = ECDsa.Create(ECCurve.NamedCurves.nistP256);
        var now = DateTimeOffset.FromUnixTimeSeconds(1_700_000_000);

        var token = AppleMapsTokenProvider.CreateAuthorizationToken(key, "TEAM123456", "KEY9876543", now, TimeSpan.FromMinutes(20));

        var parts = token.Split('.');
        Assert.Equal(3, parts.Length);

        using var header = JsonDocument.Parse(FromBase64Url(parts[0]));
        Assert.Equal("ES256", header.RootElement.GetProperty("alg").GetString());
        Assert.Equal("KEY9876543", header.RootElement.GetProperty("kid").GetString());
        Assert.Equal("JWT", header.RootElement.GetProperty("typ").GetString());

        using var payload = JsonDocument.Parse(FromBase64Url(parts[1]));
        Assert.Equal("TEAM123456", payload.RootElement.GetProperty("iss").GetString());
        Assert.Equal("server_api", payload.RootElement.GetProperty("scope").GetString());
        Assert.Equal(1_700_000_000, payload.RootElement.GetProperty("iat").GetInt64());
        Assert.Equal(1_700_000_000 + 1200, payload.RootElement.GetProperty("exp").GetInt64());

        // JWS ES256 signatures are the raw r||s form — verifiable with the same key.
        var signingInput = Encoding.UTF8.GetBytes($"{parts[0]}.{parts[1]}");
        Assert.True(key.VerifyData(signingInput, FromBase64Url(parts[2]), HashAlgorithmName.SHA256));
    }

    [Fact]
    public void ImportPrivateKey_AcceptsPemAndBareBase64()
    {
        using var original = ECDsa.Create(ECCurve.NamedCurves.nistP256);
        var pkcs8 = original.ExportPkcs8PrivateKey();
        var pem = $"-----BEGIN PRIVATE KEY-----\n{Convert.ToBase64String(pkcs8)}\n-----END PRIVATE KEY-----";

        using var fromPem = AppleMapsTokenProvider.ImportPrivateKey(pem);
        using var fromBase64 = AppleMapsTokenProvider.ImportPrivateKey(Convert.ToBase64String(pkcs8));

        var payload = Encoding.UTF8.GetBytes("steeple");
        Assert.True(original.VerifyData(payload, fromPem.SignData(payload, HashAlgorithmName.SHA256), HashAlgorithmName.SHA256));
        Assert.True(original.VerifyData(payload, fromBase64.SignData(payload, HashAlgorithmName.SHA256), HashAlgorithmName.SHA256));
    }

    [Fact]
    public void ParseSuggestions_KeepsResolvedAddressesAndDropsQueryCompletions()
    {
        var json = """
        {
          "results": [
            { "completionUrl": "/v1/search?q=Museums", "displayLines": ["Museums", "Search Nearby"] },
            {
              "displayLines": ["151 3rd St", "San Francisco, CA 94103, United States"],
              "location": { "latitude": 37.7857, "longitude": -122.4011 },
              "structuredAddress": {
                "locality": "San Francisco",
                "postCode": "94103",
                "thoroughfare": "3rd St",
                "subThoroughfare": "151",
                "fullThoroughfare": "151 3rd St"
              }
            },
            { "displayLines": ["No structured address"], "location": { "lat": 1.5, "lng": 2.5 } },
            { "displayLines": ["Incomplete coordinate"], "location": {} }
          ]
        }
        """;

        var suggestions = AppleMapsGeocodingGateway.ParseSuggestions(json);

        Assert.Equal(2, suggestions.Count);
        var first = suggestions[0];
        Assert.Equal("151 3rd St, San Francisco, CA 94103, United States", first.Label);
        Assert.Equal(37.7857, first.Latitude);
        Assert.Equal(-122.4011, first.Longitude);
        Assert.Equal("151 3rd St", first.AddressLine);
        Assert.Equal("San Francisco", first.Suburb);
        Assert.Equal("94103", first.Postcode);

        var second = suggestions[1];
        Assert.Equal("No structured address", second.Label);
        Assert.Equal(1.5, second.Latitude);
        Assert.Equal(2.5, second.Longitude);
        Assert.Null(second.AddressLine);
        Assert.Null(second.Suburb);
        Assert.Null(second.Postcode);
    }

    private static byte[] FromBase64Url(string value)
    {
        var padded = value.Replace('-', '+').Replace('_', '/');
        return Convert.FromBase64String(padded.PadRight(padded.Length + (4 - padded.Length % 4) % 4, '='));
    }
}
