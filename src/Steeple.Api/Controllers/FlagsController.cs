using Microsoft.AspNetCore.Mvc;
using Steeple.Api.Services.Flags;

namespace Steeple.Api.Controllers;
/// <summary>
/// The client flags proxy (CONTRACTS §8): mobile/web clients never talk to the deployed flags
/// service directly — they read the public, per-context boolean snapshot from here instead.
/// Anonymous (flags gate features before/without sign-in too).
/// </summary>
[ApiController]
[Route("api/v1/flags")]
public sealed class FlagsController : ControllerBase
{
    private readonly IPublicFlagsService _flags;

    public FlagsController(IPublicFlagsService flags) => _flags = flags;

    /// <summary>The public flag snapshot for the caller's platform/build (both optional).</summary>
    [HttpGet]
    public ActionResult<IReadOnlyDictionary<string, bool>> Get([FromQuery] string? platform, [FromQuery] int? build) =>
        Ok(_flags.Evaluate(platform, build));
}
