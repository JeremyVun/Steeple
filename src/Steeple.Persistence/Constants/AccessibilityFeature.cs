namespace Steeple.Persistence.Constants;
/// <summary>
/// Bitwise set of accessibility features a room provides.
/// </summary>
[Flags]
public enum AccessibilityFeature : int
{
    /// <summary>No accessibility features specified.</summary>
    None = 0,
    StepFreeAccess = 1,
    AccessibleRestroom = 2,
    AccessibleParking = 4,
    HearingLoop = 8,
    LiftAccess = 16
}
