using Microsoft.Extensions.Options;
using Steeple.Api.Services.Flags;

namespace Steeple.Api.Tests.Services;
/// <summary>
/// Unit tests for <see cref="PublicFlagsService"/> (CONTRACTS §8): the
/// <c>mobile.force_upgrade</c> build-comparison rule, that only the hardcoded public allowlist
/// ever reaches the wire, and that missing/absent input degrades safely (fail closed).
/// </summary>
public class PublicFlagsServiceTests
{
    [Fact]
    public void Evaluate_BuildBelowMinimum_ForceUpgradeIsTrue()
    {
        var service = CreateService(minSupportedBuild: 10);

        var result = service.Evaluate("ios", build: 5);

        Assert.True(result["mobile.force_upgrade"]);
    }

    [Fact]
    public void Evaluate_BuildAtOrAboveMinimum_ForceUpgradeIsFalse()
    {
        var service = CreateService(minSupportedBuild: 10);

        Assert.False(service.Evaluate("ios", build: 10)["mobile.force_upgrade"]);
        Assert.False(service.Evaluate("ios", build: 25)["mobile.force_upgrade"]);
    }

    [Fact]
    public void Evaluate_NoBuildSupplied_ForceUpgradeIsFalseEvenWithAHighMinimum()
    {
        var service = CreateService(minSupportedBuild: 999);

        var result = service.Evaluate("ios", build: null);

        Assert.False(result["mobile.force_upgrade"]);
    }

    [Fact]
    public void Evaluate_DefaultMinimumSupportedBuildOfZero_NeverForcesAnUpgrade()
    {
        var service = CreateService(minSupportedBuild: 0);

        Assert.False(service.Evaluate("ios", build: 0)["mobile.force_upgrade"]);
        Assert.False(service.Evaluate("ios", build: 1)["mobile.force_upgrade"]);
    }

    [Fact]
    public void Evaluate_OnlyReturnsTheHardcodedPublicAllowlist()
    {
        // A private/ops-only flag configured underneath must never leak onto the wire, even
        // though the underlying IFeatureFlags reader knows about it.
        var flags = new FakeFeatureFlags();
        flags.Set("mobile.apply_enabled", true);
        flags.Set("some.private_ops_flag", true);
        var service = CreateService(flags, minSupportedBuild: 0);

        var result = service.Evaluate("android", build: 3);

        Assert.Equal(PublicFlagsService.PublicFlagKeys.Count, result.Count);
        foreach (var key in PublicFlagsService.PublicFlagKeys)
        {
            Assert.Contains(key, result.Keys);
        }
        Assert.DoesNotContain("some.private_ops_flag", result.Keys);
    }

    [Fact]
    public void Evaluate_PlainBooleanFlags_ReflectTheUnderlyingReaderVerbatim()
    {
        var flags = new FakeFeatureFlags();
        flags.Set("mobile.apply_enabled", true);
        flags.Set("mobile.manage_enabled", false);
        var service = CreateService(flags, minSupportedBuild: 0);

        var result = service.Evaluate("web", build: null);

        Assert.True(result["mobile.apply_enabled"]);
        Assert.False(result["mobile.manage_enabled"]);
    }

    [Fact]
    public void Evaluate_UnknownFlagDefaultsFalse_FailsClosed()
    {
        // Nothing configured at all -> every plain boolean reads false (ConfigFeatureFlags'
        // fail-closed contract), and force_upgrade stays false with the default 0 minimum.
        var service = CreateService(minSupportedBuild: 0);

        var result = service.Evaluate(null, null);

        Assert.False(result["mobile.apply_enabled"]);
        Assert.False(result["mobile.manage_enabled"]);
        Assert.False(result["mobile.force_upgrade"]);
    }

    private static PublicFlagsService CreateService(int minSupportedBuild) =>
        CreateService(new FakeFeatureFlags(), minSupportedBuild);

    private static PublicFlagsService CreateService(FakeFeatureFlags flags, int minSupportedBuild) =>
        new(flags, Options.Create(new FlagsOptions { MobileMinSupportedBuild = minSupportedBuild }));

    private sealed class FakeFeatureFlags : IFeatureFlags
    {
        private readonly Dictionary<string, bool> _values = [];

        public void Set(string key, bool enabled) => _values[key] = enabled;

        public bool IsEnabled(string key) => _values.TryGetValue(key, out var enabled) && enabled;
    }
}
