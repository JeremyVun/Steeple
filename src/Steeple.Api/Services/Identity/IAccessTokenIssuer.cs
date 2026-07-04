
namespace Steeple.Api.Services.Identity;
/// <summary>Port: signs the API's own short-lived access JWT for a user session.</summary>
public interface IAccessTokenIssuer
{
    /// <summary>Issues an access token with <c>sub</c> = user id and <c>sid</c> = session (refresh family) id.</summary>
    string IssueAccessToken(User user, Guid sessionId);
}
