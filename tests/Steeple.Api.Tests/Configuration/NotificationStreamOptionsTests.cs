namespace Steeple.Api.Tests.Configuration;

public sealed class NotificationStreamOptionsTests
{
    [Fact]
    public void DefaultsAreValid()
    {
        var options = new NotificationStreamOptions();

        Assert.True(options.IsValid());
        Assert.Equal(4, options.MaxSubscriptionsPerUser);
        Assert.Equal(256, options.MaxSubscriptionsPerProcess);
    }

    [Fact]
    public void RejectsUnsafeOrUnboundedSettings()
    {
        var invalid = new[]
        {
            Change(options => options.MaxSubscriptionsPerUser = 0),
            Change(options => options.MaxSubscriptionsPerProcess = 4097),
            Change(options => options.MaxSubscriptionsPerUser = options.MaxSubscriptionsPerProcess + 1),
            Change(options => options.HeartbeatInterval = TimeSpan.Zero),
            Change(options => options.MaxLifetime = TimeSpan.FromMinutes(6)),
            Change(options => options.WriteDeadline = TimeSpan.FromMinutes(1)),
            Change(options => options.ProbeInterval = TimeSpan.Zero),
            Change(options => options.ConnectionDeadline = TimeSpan.Zero),
            Change(options => options.ProbeDeadline = TimeSpan.Zero),
            Change(options => options.RetryBaseDelay = TimeSpan.Zero),
            Change(options => options.RetryMaxDelay = TimeSpan.FromMinutes(2)),
            Change(options => options.HealthyResetInterval = TimeSpan.Zero),
        };

        Assert.All(invalid, options => Assert.False(options.IsValid()));
    }

    private static NotificationStreamOptions Change(Action<NotificationStreamOptions> change)
    {
        var options = new NotificationStreamOptions();
        change(options);
        return options;
    }
}
