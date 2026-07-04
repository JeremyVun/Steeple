
namespace Steeple.Api.Contracts.Applications;
/// <summary><c>POST /api/v1/applications/{id}/messages</c> body — one thread message.</summary>
public record ApplicationMessageRequest(string Body);

/// <summary>
/// <c>POST /api/v1/applications/{id}/decision</c> body (provider only).
/// </summary>
/// <param name="Decision">Wire token: <c>approve</c> or <c>decline</c>.</param>
/// <param name="Message">Optional note posted onto the thread with the decision.</param>
public record ApplicationDecisionRequest(string Decision, string? Message);
