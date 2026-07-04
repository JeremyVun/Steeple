using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;

namespace Steeple.Web.Filters;

/// <summary>
/// Gates a listings-editor action behind the <c>web.manage_enabled</c> flag: 404 (not a 403)
/// when off — the surface doesn't exist yet. Only the Phase 5 editor actions carry this;
/// the Phase 2 provider inbox in the same controller is always on.
/// </summary>
[AttributeUsage(AttributeTargets.Method)]
public sealed class RequireManageEnabledAttribute : Attribute, IAsyncActionFilter
{
    private const string ManageFlag = "web.manage_enabled";

    /// <inheritdoc />
    public async Task OnActionExecutionAsync(ActionExecutingContext context, ActionExecutionDelegate next)
    {
        var flags = context.HttpContext.RequestServices.GetRequiredService<IFeatureFlags>();
        if (flags.IsEnabled(ManageFlag))
        {
            await next();
            return;
        }

        context.HttpContext.Response.StatusCode = StatusCodes.Status404NotFound;
        context.Result = new ViewResult { ViewName = "~/Views/Discovery/NotFound.cshtml" };
    }
}
