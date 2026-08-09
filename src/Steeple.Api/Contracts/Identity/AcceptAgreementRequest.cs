
using System.ComponentModel.DataAnnotations;

namespace Steeple.Api.Contracts.Identity;
/// <summary><c>POST /api/v1/me/agreements</c> body: record acceptance of one document version.</summary>
/// <param name="DocType">Wire token: <c>tos</c> or <c>privacy</c>.</param>
public record AcceptAgreementRequest(
    [Required] string DocType,
    [Required, StringLength(50, MinimumLength = 1)] string Version);
