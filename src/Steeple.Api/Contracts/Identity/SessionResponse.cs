using System.Text.Json.Serialization;

namespace Steeple.Api.Contracts.Identity;
/// <summary>
/// A freshly issued session: the API's own token pair plus the resolved user.
/// <see cref="RefreshToken"/> is absent when the client asked for cookie transport — the token is
/// then in the <c>Set-Cookie</c> header, httpOnly, where no script can reach it.
/// </summary>
public record SessionResponse(
    string AccessToken,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] string? RefreshToken,
    SessionUserDto User,
    bool IsNewUser);

/// <summary>The signed-in user as returned at session creation and on <c>GET /me</c>.</summary>
public record SessionUserDto(
    Guid Id,
    string DisplayName,
    string? Email,
    DateTimeOffset CreatedAtUtc);
