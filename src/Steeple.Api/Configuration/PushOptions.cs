namespace Steeple.Api.Configuration;
/// <summary>
/// FCM push configuration ("Push" section). With neither <see cref="ServiceAccountJsonPath"/> nor
/// <see cref="ServiceAccountJson"/> set, the API registers <see cref="Proxies.Notifications.LoggingPushGateway"/>
/// instead of talking to Firebase (local dev / pre-Firebase environments) — the inbox row is still
/// written, so nothing is lost.
/// </summary>
public sealed class PushOptions
{
    /// <summary>Configuration section name.</summary>
    public const string SectionName = "Push";

    /// <summary>Path to the Firebase service-account JSON key file. Empty = not configured this way.</summary>
    public string ServiceAccountJsonPath { get; set; } = "";

    /// <summary>The service-account JSON itself, inline (e.g. from a secret-manager env var). Empty = not configured this way.</summary>
    public string ServiceAccountJson { get; set; } = "";
}
