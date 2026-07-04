
namespace Steeple.Api.Contracts.Identity;
/// <summary><c>POST /api/v1/auth/refresh</c> body.</summary>
public record RefreshRequest(string RefreshToken);

/// <summary>The rotated token pair returned by a successful refresh.</summary>
public record RefreshResponse(string AccessToken, string RefreshToken);
