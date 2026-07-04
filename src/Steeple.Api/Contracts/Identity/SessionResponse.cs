
namespace Steeple.Api.Contracts.Identity;
/// <summary>A freshly issued session: the API's own token pair plus the resolved user.</summary>
public record SessionResponse(
    string AccessToken,
    string RefreshToken,
    SessionUserDto User,
    bool IsNewUser);

/// <summary>The signed-in user as returned at session creation and on <c>GET /me</c>.</summary>
public record SessionUserDto(
    Guid Id,
    string DisplayName,
    string? Email,
    DateTimeOffset CreatedAtUtc);
