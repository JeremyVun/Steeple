namespace Steeple.Persistence.Constants;
/// <summary>
/// Bitwise set of physical amenities a room offers.
/// </summary>
[Flags]
public enum Amenity : int
{
    /// <summary>No amenities specified.</summary>
    None = 0,
    Parking = 1,
    Kitchen = 2,
    Restrooms = 4,
    Wifi = 8,
    AudioVisual = 16,
    Tables = 32,
    Chairs = 64,
    Heating = 128,
    AirConditioning = 256,
    Stage = 512,
    Piano = 1024
}
