
namespace Steeple.Api.Contracts.Identity;
/// <summary><c>POST /api/v1/me/devices</c> body: register (or refresh) a push device — upsert by <paramref name="FcmToken"/>.</summary>
/// <param name="FcmToken">FCM registration token (≤512 chars).</param>
/// <param name="Platform">Wire token: <c>ios</c>, <c>android</c> or <c>web</c>.</param>
public record RegisterDeviceRequest(string FcmToken, string Platform);
