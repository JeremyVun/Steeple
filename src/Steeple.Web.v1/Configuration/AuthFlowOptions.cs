
namespace Steeple.Web.Configuration;
/// <summary>
/// Browser SSO flow configuration ("Auth" section). The BFF only needs the public client
/// identifiers — token verification happens at the API; Web never holds provider secrets.
/// </summary>
public sealed class AuthFlowOptions
{
    /// <summary>Configuration section name.</summary>
    public const string SectionName = "Auth";

    /// <summary>
    /// Shows the dev sign-in form on /login and enables its callback. Set only in
    /// <c>appsettings.Development.json</c> (mirrored by the API's <c>Auth:DevLoginEnabled</c>);
    /// base config omits it, so no deployed environment renders the form.
    /// </summary>
    public bool DevLoginEnabled { get; set; }

    /// <summary>Google settings.</summary>
    public GoogleOptions Google { get; set; } = new();

    /// <summary>Apple settings.</summary>
    public AppleOptions Apple { get; set; } = new();

    /// <summary>"Sign in with Google" (GIS) settings.</summary>
    public sealed class GoogleOptions
    {
        /// <summary>The OAuth web client id rendered into the GIS button. Empty disables Google sign-in.</summary>
        public string ClientId { get; set; } = "";
    }

    /// <summary>"Sign in with Apple" web flow settings.</summary>
    public sealed class AppleOptions
    {
        /// <summary>The Apple Services ID (the web flow's client_id). Empty disables Apple sign-in.</summary>
        public string ServicesId { get; set; } = "";
    }
}
