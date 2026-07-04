
namespace Steeple.Web.Configuration;
/// <summary>
/// Current versions of the legal documents (date-stamped; the rendered pages display them and
/// sign-in records acceptance against them — CONTRACTS §4, SYSTEM_DESIGN §14). Bump a version
/// here in the same PR as the corresponding content change in Views/Site/Terms|Privacy.cshtml;
/// a bump makes the next sign-in record a fresh acceptance row per user.
/// </summary>
public static class LegalDocuments
{
    /// <summary>Wire token for the terms-of-service document.</summary>
    public const string TosDocType = "tos";

    /// <summary>Wire token for the privacy-policy document.</summary>
    public const string PrivacyDocType = "privacy";

    /// <summary>Current ToS version.</summary>
    public const string TosVersion = "2026-07-04";

    /// <summary>Current privacy-policy version.</summary>
    public const string PrivacyVersion = "2026-07-04";
}
