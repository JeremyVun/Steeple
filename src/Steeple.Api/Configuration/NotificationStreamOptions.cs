namespace Steeple.Api.Configuration;

/// <summary>Bounds and lifecycle intervals for notification streams.</summary>
public sealed class NotificationStreamOptions
{
    public const string SectionName = "NotificationStream";

    public int MaxSubscriptionsPerUser { get; set; } = 4;
    public int MaxSubscriptionsPerProcess { get; set; } = 256;
    public TimeSpan HeartbeatInterval { get; set; } = TimeSpan.FromSeconds(30);
    public TimeSpan MaxLifetime { get; set; } = TimeSpan.FromMinutes(5);
    public TimeSpan WriteDeadline { get; set; } = TimeSpan.FromSeconds(5);
    public TimeSpan ProbeInterval { get; set; } = TimeSpan.FromSeconds(30);
    public TimeSpan ConnectionDeadline { get; set; } = TimeSpan.FromSeconds(5);
    public TimeSpan ProbeDeadline { get; set; } = TimeSpan.FromSeconds(5);
    public TimeSpan RetryBaseDelay { get; set; } = TimeSpan.FromSeconds(1);
    public TimeSpan RetryMaxDelay { get; set; } = TimeSpan.FromSeconds(30);
    public TimeSpan HealthyResetInterval { get; set; } = TimeSpan.FromSeconds(60);

    public bool IsValid() =>
        MaxSubscriptionsPerUser is >= 1 and <= 32
        && MaxSubscriptionsPerProcess is >= 1 and <= 4096
        && MaxSubscriptionsPerUser <= MaxSubscriptionsPerProcess
        && InRange(HeartbeatInterval, TimeSpan.FromSeconds(1), TimeSpan.FromMinutes(1))
        && InRange(MaxLifetime, TimeSpan.FromSeconds(30), TimeSpan.FromMinutes(5))
        && InRange(WriteDeadline, TimeSpan.FromMilliseconds(100), TimeSpan.FromSeconds(30))
        && InRange(ProbeInterval, TimeSpan.FromSeconds(1), TimeSpan.FromMinutes(1))
        && InRange(ConnectionDeadline, TimeSpan.FromMilliseconds(100), TimeSpan.FromSeconds(30))
        && InRange(ProbeDeadline, TimeSpan.FromMilliseconds(100), TimeSpan.FromSeconds(30))
        && InRange(RetryBaseDelay, TimeSpan.FromMilliseconds(100), TimeSpan.FromSeconds(30))
        && InRange(RetryMaxDelay, RetryBaseDelay, TimeSpan.FromMinutes(1))
        && InRange(HealthyResetInterval, TimeSpan.FromSeconds(1), TimeSpan.FromMinutes(5));

    private static bool InRange(TimeSpan value, TimeSpan minimum, TimeSpan maximum) =>
        value >= minimum && value <= maximum;
}
