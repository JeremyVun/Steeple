namespace Steeple.Api.Tests.Proxies.Identity;

public class JwtAccessTokenIssuerTests
{
    [Theory]
    [InlineData("TtDVdGEAWZGFYmJ9sMbac9NL5QuqNBJyXYGlzUiwClw=")]
    [InlineData("4kdPT0yylVMLDzUyD9BXXtDNbjM01xd1Cx3BgDMHo9Q=")]
    [InlineData(" 4kdPT0yylVMLDzUyD9BXXtDNbjM01xd1Cx3BgDMHo9Q= ")]
    public void CreateSigningKey_ProductionRejectsRepositoryKnownKeys(string signingKey)
    {
        var jwt = new AuthOptions.JwtOptions { SigningKey = signingKey };

        var exception = Assert.Throws<InvalidOperationException>(() =>
            JwtAccessTokenIssuer.CreateSigningKey(jwt, rejectKnownDevelopmentKeys: true));

        Assert.Contains("repository-known", exception.Message);
    }

    [Fact]
    public void CreateSigningKey_ProductionAcceptsAnUnknownStrongKey()
    {
        var jwt = new AuthOptions.JwtOptions
        {
            SigningKey = Convert.ToBase64String(System.Security.Cryptography.RandomNumberGenerator.GetBytes(32)),
        };

        Assert.Equal(256, JwtAccessTokenIssuer.CreateSigningKey(jwt, rejectKnownDevelopmentKeys: true).KeySize);
    }
}
