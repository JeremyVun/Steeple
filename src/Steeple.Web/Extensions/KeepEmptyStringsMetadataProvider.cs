using Microsoft.AspNetCore.Mvc.ModelBinding.Metadata;

namespace Steeple.Web.Extensions;
/// <summary>
/// Binds a blank form input to <c>""</c> instead of MVC's default <c>null</c>. The form view
/// models initialize string properties to <c>""</c> and their payload builders trim without null
/// checks — without this, submitting a form with any optional field left empty overwrote the
/// default with null and threw before validation could run.
/// </summary>
public sealed class KeepEmptyStringsMetadataProvider : IDisplayMetadataProvider
{
    /// <inheritdoc />
    public void CreateDisplayMetadata(DisplayMetadataProviderContext context)
    {
        if (context.Key.ModelType == typeof(string))
        {
            context.DisplayMetadata.ConvertEmptyStringToNull = false;
        }
    }
}
