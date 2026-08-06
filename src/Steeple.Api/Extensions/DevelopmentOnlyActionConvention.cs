using Microsoft.AspNetCore.Mvc.ApplicationModels;

namespace Steeple.Api.Extensions;

/// <summary>Marker for HTTP actions that must not exist outside local Development.</summary>
[AttributeUsage(AttributeTargets.Class | AttributeTargets.Method)]
public sealed class DevelopmentOnlyAttribute : Attribute;

/// <summary>Removes development-only actions from endpoint discovery in deployed environments.</summary>
public sealed class DevelopmentOnlyActionConvention(bool isDevelopment) : IApplicationModelConvention
{
    /// <inheritdoc />
    public void Apply(ApplicationModel application)
    {
        if (isDevelopment)
        {
            return;
        }

        for (var controllerIndex = application.Controllers.Count - 1; controllerIndex >= 0; controllerIndex--)
        {
            var controller = application.Controllers[controllerIndex];
            if (controller.Attributes.OfType<DevelopmentOnlyAttribute>().Any())
            {
                application.Controllers.RemoveAt(controllerIndex);
                continue;
            }

            for (var index = controller.Actions.Count - 1; index >= 0; index--)
            {
                if (controller.Actions[index].Attributes.OfType<DevelopmentOnlyAttribute>().Any())
                {
                    controller.Actions.RemoveAt(index);
                }
            }
        }
    }
}
