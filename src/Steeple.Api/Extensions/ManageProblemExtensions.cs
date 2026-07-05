using Microsoft.AspNetCore.Mvc;

namespace Steeple.Api.Extensions;
/// <summary>
/// Maps <see cref="ManageError"/> codes to ProblemDetails responses (same idiom as the
/// Applications controller's <c>ToProblem</c>, shared here because two controllers speak Manage).
/// </summary>
public static class ManageProblemExtensions
{
    /// <summary>ProblemDetails with the stable <c>code</c> extension (CONTRACTS §2).</summary>
    public static ObjectResult ToManageProblem(this ControllerBase controller, ManageError error)
    {
        var status = error.Code switch
        {
            ManageErrorCodes.HasActiveBookings => StatusCodes.Status409Conflict,
            ManageErrorCodes.AlreadyVerified => StatusCodes.Status409Conflict,
            ManageErrorCodes.VerificationPending => StatusCodes.Status409Conflict,
            ManageErrorCodes.NotFound => StatusCodes.Status404NotFound,
            // invalid_venue / invalid_room / invalid_photo / invalid_image / geofence_rejected /
            // no_photos / no_open_hours / invalid_availability / invalid_verification
            _ => StatusCodes.Status400BadRequest,
        };

        return controller.Problem(detail: error.Detail, statusCode: status, extensions: new Dictionary<string, object?>
        {
            ["code"] = error.Code,
        });
    }
}
