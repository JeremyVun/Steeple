using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;
using Steeple.Api.Contracts.Applications;
using Steeple.Api.Contracts.Manage;

namespace Steeple.Api.Extensions;

/// <summary>HTTP commitment gate; accepting documents, reading, withdrawing and cancelling stay available.</summary>
[AttributeUsage(AttributeTargets.Method)]
public sealed class RequireCurrentAgreementsAttribute() : TypeFilterAttribute(typeof(CurrentAgreementsFilter));

public sealed class CurrentAgreementsFilter(IIdentityRepository identity) : IAsyncActionFilter
{
    public async Task OnActionExecutionAsync(ActionExecutingContext context, ActionExecutionDelegate next)
    {
        // Refusing a commitment never requires accepting new terms.
        var declining = context.ActionArguments.Values.Any(value => value switch
        {
            ApplicationDecisionRequest decision => string.Equals(decision.Decision, "decline", StringComparison.OrdinalIgnoreCase),
            CounterOfferResponseRequest response => string.Equals(response.Decision, "decline", StringComparison.OrdinalIgnoreCase),
            SaveRoomRequest room when HttpMethods.IsPatch(context.HttpContext.Request.Method) =>
                room.Status is "unlisted" or "draft",
            _ => false,
        });
        if (declining)
        {
            await next();
            return;
        }

        var user = await identity.GetUserAsync(context.HttpContext.User.GetUserId(), context.HttpContext.RequestAborted);
        if (user is not null && user.DeletedAtUtc is null && CurrentAgreements.HasAcceptedAll(user.Agreements))
        {
            await next();
            return;
        }

        var problem = new ProblemDetails
        {
            Status = StatusCodes.Status403Forbidden,
            Title = "Agreement required",
            Detail = "Open your account and accept the current terms and privacy policy before continuing.",
        };
        problem.Extensions["code"] = "agreements_required";
        problem.Extensions["requiredAgreements"] = new[]
        {
            new { docType = "tos", version = CurrentAgreements.Version },
            new { docType = "privacy", version = CurrentAgreements.Version },
        };
        context.Result = new ObjectResult(problem) { StatusCode = problem.Status };
    }
}
