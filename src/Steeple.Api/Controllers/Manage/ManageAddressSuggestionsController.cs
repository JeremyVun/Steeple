using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Steeple.Api.Contracts.Manage;

namespace Steeple.Api.Controllers.Manage;
/// <summary>
/// Address typeahead for the venue address form (CONTRACTS §6). Signed-in only and rate-limited:
/// the upstream geocoding provider is a metered, per-team-quota API, so this must never become an
/// open proxy. Short input and provider outages both answer an empty list — never an error.
/// </summary>
[ApiController]
[Authorize]
[Route("api/v1/manage/address-suggestions")]
public sealed class ManageAddressSuggestionsController : ControllerBase
{
    private readonly IManageService _manage;

    /// <summary>Creates the controller over the manage use-cases.</summary>
    public ManageAddressSuggestionsController(IManageService manage)
    {
        _manage = manage;
    }

    /// <summary>Suggestions for partial address input (empty below 3 characters).</summary>
    [HttpGet]
    [EnableRateLimiting(RateLimitPolicies.Manage)]
    public async Task<ActionResult<IReadOnlyList<AddressSuggestionDto>>> Get([FromQuery] string q, CancellationToken ct) =>
        Ok(await _manage.SuggestAddressesAsync(q, ct));
}
