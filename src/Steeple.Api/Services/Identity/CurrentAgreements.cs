namespace Steeple.Api.Services.Identity;

/// <summary>Versions served by the web legal pages and explicitly accepted by every client.</summary>
public static class CurrentAgreements
{
    public const string Version = "2026-09-20";

    public static bool IsCurrent(AgreementDocType docType, string version) =>
        docType is AgreementDocType.Tos or AgreementDocType.Privacy && version == Version;

    public static bool HasAcceptedAll(IEnumerable<UserAgreement> agreements) =>
        new[] { AgreementDocType.Tos, AgreementDocType.Privacy }
            .All(doc => agreements.Any(a => a.DocType == doc && IsCurrent(doc, a.Version)));
}
