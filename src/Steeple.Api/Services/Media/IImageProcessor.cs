namespace Steeple.Api.Services.Media;
/// <summary>
/// Image pipeline port (SYSTEM_DESIGN §9): validate, auto-orient, strip all metadata
/// (EXIF carries GPS — never persist it), and produce the fixed variant set.
/// </summary>
public interface IImageProcessor
{
    /// <summary>
    /// Processes an uploaded image into the variant set, or null when the bytes are not a
    /// decodable JPEG/PNG/WebP image (content sniffing — the client's content type is not trusted).
    /// </summary>
    Task<ProcessedImage?> ProcessAsync(Stream content, CancellationToken ct = default);
}

/// <summary>The processed variant set, all metadata-stripped JPEG.</summary>
/// <param name="Variants">One entry per <see cref="MediaVariants.Widths"/> width, largest last.</param>
/// <param name="ContentHash">Hex SHA-256 of the source bytes — the content-addressed storage key.</param>
public record ProcessedImage(IReadOnlyList<ImageVariant> Variants, string ContentHash);

/// <summary>A single encoded rendition.</summary>
public record ImageVariant(int Width, byte[] Bytes);

/// <summary>The fixed variant widths (DESIGN_SYSTEM §8.5 card sizing; CONTRACTS §6).</summary>
public static class MediaVariants
{
    /// <summary>Thumb / card / full widths in CSS pixels.</summary>
    public static readonly int[] Widths = [400, 800, 1600];
}
