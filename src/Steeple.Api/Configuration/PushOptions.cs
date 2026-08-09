namespace Steeple.Api.Configuration;
/// <summary>
/// FCM push configuration ("Push" section). Mode selects FCM or the disabled logging adapter;
/// either way the inbox row remains the record of truth.
/// </summary>
public sealed class PushOptions
{
    /// <summary>Configuration section name.</summary>
    public const string SectionName = "Push";

    /// <summary>Push mode: <c>fcm</c> or <c>disabled</c>.</summary>
    public string Mode { get; set; } = "";

    /// <summary>Path to the Firebase service-account JSON key file. Empty = not configured this way.</summary>
    public string ServiceAccountJsonPath { get; set; } = "";

    /// <summary>The service-account JSON itself, inline (e.g. from a secret-manager env var). Empty = not configured this way.</summary>
    public string ServiceAccountJson { get; set; } = "";

    /// <summary>Whether FCM delivery is selected, with credential inference retained for Development.</summary>
    public bool IsEnabled =>
        string.Equals(Mode, "fcm", StringComparison.OrdinalIgnoreCase)
        || (string.IsNullOrWhiteSpace(Mode)
            && (!string.IsNullOrWhiteSpace(ServiceAccountJson) || !string.IsNullOrWhiteSpace(ServiceAccountJsonPath)));
}
