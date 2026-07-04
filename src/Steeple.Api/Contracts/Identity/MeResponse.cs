
namespace Steeple.Api.Contracts.Identity;
/// <summary><c>GET /api/v1/me</c>: profile plus recorded legal-document acceptances.</summary>
public record MeResponse(
    Guid Id,
    string DisplayName,
    string? Email,
    DateTimeOffset CreatedAtUtc,
    IReadOnlyList<AgreementDto> Agreements);

/// <summary>One recorded acceptance of a legal document version.</summary>
/// <param name="DocType">Wire token: <c>tos</c> or <c>privacy</c>.</param>
public record AgreementDto(string DocType, string Version, DateTimeOffset AcceptedAtUtc);
