namespace Steeple.Persistence.Models;

/// <summary>Minimal replay ledger for verified payment provider events.</summary>
public class PaymentWebhookEvent
{
    public string ProviderEventId { get; set; } = "";
    public string Source { get; set; } = "";
    public string Type { get; set; } = "";
    public string? ProviderAccountId { get; set; }
    public string? ProviderObjectId { get; set; }
    public DateTimeOffset ReceivedAtUtc { get; set; }
    public DateTimeOffset? ProcessedAtUtc { get; set; }
    public int Attempts { get; set; }
    public string? LastError { get; set; }
}
