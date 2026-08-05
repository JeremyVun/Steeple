using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Steeple.Web.Controllers;

/// <summary>
/// The signed-in person's account page: profile, recorded agreement versions, sign out
/// everywhere, and account deletion (all state lives at the API — this is a thin BFF surface).
/// </summary>
[Authorize]
public sealed class AccountController : SteepleControllerBase
{
    private readonly ISteepleApiClient _api;
    private readonly IFeatureFlags _flags;
    private readonly ILogger<AccountController> _logger;

    /// <summary>Creates the controller.</summary>
    public AccountController(ISteepleApiClient api, IFeatureFlags flags, ILogger<AccountController> logger)
    {
        _api = api;
        _flags = flags;
        _logger = logger;
    }

    /// <summary>Profile + agreements + session controls.</summary>
    [HttpGet("/account")]
    public async Task<IActionResult> Index(CancellationToken ct)
    {
        if (!_flags.IsEnabled("web.sign_in_enabled"))
        {
            return NotFound();
        }

        var accessToken = await HttpContext.GetTokenAsync(SteepleCookieEvents.AccessTokenName);
        var me = accessToken is null ? null : await GetMeSafelyAsync(accessToken, ct);
        if (me is null)
        {
            // Token no longer resolves (revoked elsewhere / deleted account): clear the cookie
            // rather than render a dead session.
            await HttpContext.SignOutAsync(CookieAuthenticationDefaults.AuthenticationScheme);
            return Redirect(Url.Content("~/login"));
        }

        ViewData["Title"] = "Your account";
        ViewData["Robots"] = "noindex,nofollow";
        return View(me);
    }

    /// <summary>Revokes every session, then signs this browser out.</summary>
    [HttpPost("/account/signout-everywhere")]
    public async Task<IActionResult> SignOutEverywhere(CancellationToken ct)
    {
        var accessToken = await HttpContext.GetTokenAsync(SteepleCookieEvents.AccessTokenName);
        if (accessToken is not null)
        {
            try
            {
                await _api.RevokeAllSessionsAsync(accessToken, ct);
            }
            catch (HttpRequestException ex)
            {
                _logger.LogWarning(ex, "Sign-out-everywhere revocation failed.");
                TempData["AuthError"] = "We couldn't reach the server — try again in a moment.";
                return Redirect(Url.Content("~/account"));
            }
        }

        await HttpContext.SignOutAsync(CookieAuthenticationDefaults.AuthenticationScheme);
        return Redirect(Url.Content("~/"));
    }

    /// <summary>Deletes (anonymizes) the account at the API, then signs this browser out.</summary>
    [HttpPost("/account/delete")]
    public async Task<IActionResult> Delete(CancellationToken ct)
    {
        var accessToken = await HttpContext.GetTokenAsync(SteepleCookieEvents.AccessTokenName);
        if (accessToken is not null)
        {
            try
            {
                await _api.DeleteMeAsync(accessToken, ct);
            }
            catch (HttpRequestException ex)
            {
                _logger.LogWarning(ex, "Account deletion call failed.");
                TempData["AuthError"] = "We couldn't reach the server — your account was not deleted. Try again in a moment.";
                return Redirect(Url.Content("~/account"));
            }
        }

        await HttpContext.SignOutAsync(CookieAuthenticationDefaults.AuthenticationScheme);
        return Redirect(Url.Content("~/"));
    }

    private async Task<MeResponse?> GetMeSafelyAsync(string accessToken, CancellationToken ct)
    {
        try
        {
            return await _api.GetMeAsync(accessToken, ct);
        }
        catch (HttpRequestException)
        {
            return null;
        }
    }
}
