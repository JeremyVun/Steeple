using SixLabors.ImageSharp;
using SixLabors.ImageSharp.Formats.Jpeg;
using SixLabors.ImageSharp.Metadata.Profiles.Exif;
using SixLabors.ImageSharp.PixelFormats;
using SixLabors.ImageSharp.Processing;

namespace Steeple.Api.Tests.Proxies.Media;
/// <summary>
/// Unit tests for <see cref="ImageSharpImageProcessor"/>: EXIF/GPS metadata must never survive
/// into the stored variants (uploads from phones carry GPS EXIF — SYSTEM_DESIGN §9), variant
/// widths must match <see cref="MediaVariants.Widths"/> and never upscale, and non-image bytes
/// must be rejected rather than crash the caller.
/// </summary>
public class ImageSharpImageProcessorTests
{
    [Fact]
    public async Task ProcessAsync_ImageWithExifAndGps_StripsAllMetadataFromEveryVariant()
    {
        var processor = new ImageSharpImageProcessor();
        using var source = CreateJpegWithExifAndGps(width: 2000, height: 1500);

        var result = await processor.ProcessAsync(source);

        Assert.NotNull(result);
        Assert.NotEmpty(result!.Variants);
        foreach (var variant in result.Variants)
        {
            using var decoded = Image.Load(variant.Bytes);
            Assert.Null(decoded.Metadata.ExifProfile);
            Assert.Null(decoded.Metadata.XmpProfile);
            Assert.Null(decoded.Metadata.IptcProfile);
        }
    }

    [Fact]
    public async Task ProcessAsync_LargeSourceImage_ProducesVariantsAtEveryConfiguredWidth()
    {
        var processor = new ImageSharpImageProcessor();
        using var source = CreateJpegWithExifAndGps(width: 2000, height: 1500);

        var result = await processor.ProcessAsync(source);

        Assert.NotNull(result);
        var widths = result!.Variants.Select(v => v.Width).OrderBy(w => w).ToList();
        Assert.Equal(MediaVariants.Widths.OrderBy(w => w).ToList(), widths);

        // Source (2000w) is larger than every configured width, so each variant resizes exactly
        // to its target width (never merely "at most").
        foreach (var variant in result.Variants)
        {
            using var decoded = Image.Load(variant.Bytes);
            Assert.Equal(variant.Width, decoded.Width);
            Assert.True(decoded.Width <= 1600);
        }
    }

    [Fact]
    public async Task ProcessAsync_SourceSmallerThanTargetWidth_NeverUpscales()
    {
        var processor = new ImageSharpImageProcessor();
        // Smaller than every configured width (400/800/1600).
        using var source = CreateJpegWithExifAndGps(width: 200, height: 150);

        var result = await processor.ProcessAsync(source);

        Assert.NotNull(result);
        foreach (var variant in result!.Variants)
        {
            using var decoded = Image.Load(variant.Bytes);
            Assert.Equal(200, decoded.Width); // never upscaled past the source's own width
        }
    }

    [Fact]
    public async Task ProcessAsync_NonImageBytes_ReturnsNull()
    {
        var processor = new ImageSharpImageProcessor();
        using var garbage = new MemoryStream([0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07]);

        var result = await processor.ProcessAsync(garbage);

        Assert.Null(result);
    }

    [Fact]
    public async Task ProcessAsync_EmptyStream_ReturnsNull()
    {
        // Image.Load on zero bytes throws ArgumentNullException (not a decode exception),
        // so the processor guards empty input explicitly — a 0-byte upload must 400, not 500.
        var processor = new ImageSharpImageProcessor();
        using var empty = new MemoryStream();

        Assert.Null(await processor.ProcessAsync(empty));
    }

    [Fact]
    public async Task ProcessAsync_SameSourceBytes_ProducesTheSameContentHash()
    {
        var processor = new ImageSharpImageProcessor();
        var bytes = CreateJpegWithExifAndGps(width: 600, height: 400).ToArray();

        var first = await processor.ProcessAsync(new MemoryStream(bytes));
        var second = await processor.ProcessAsync(new MemoryStream(bytes));

        Assert.Equal(first!.ContentHash, second!.ContentHash);
        Assert.Equal(64, first.ContentHash.Length); // hex SHA-256
    }

    /// <summary>Builds an in-memory JPEG carrying EXIF orientation + GPS coordinates, the exact
    /// kind of upload the processor must scrub.</summary>
    private static MemoryStream CreateJpegWithExifAndGps(int width, int height)
    {
        using var image = new Image<Rgba32>(width, height);
        // Vary a few pixels so the source isn't a degenerate single-color image (not load-bearing
        // for these tests, but keeps the JPEG encoder honest).
        image[0, 0] = new Rgba32(100, 149, 237, 255);
        image[width - 1, height - 1] = new Rgba32(30, 30, 30, 255);

        var exif = new ExifProfile();
        exif.SetValue(ExifTag.Orientation, (ushort)1);
        exif.SetValue(ExifTag.Make, "SteepleTestCamera");
        exif.SetValue(ExifTag.GPSLatitude, new[] { new SixLabors.ImageSharp.Rational(38u, 1u), new SixLabors.ImageSharp.Rational(54u, 1u), new SixLabors.ImageSharp.Rational(4u, 1u) });
        exif.SetValue(ExifTag.GPSLatitudeRef, "N");
        exif.SetValue(ExifTag.GPSLongitude, new[] { new SixLabors.ImageSharp.Rational(77u, 1u), new SixLabors.ImageSharp.Rational(15u, 1u), new SixLabors.ImageSharp.Rational(55u, 1u) });
        exif.SetValue(ExifTag.GPSLongitudeRef, "W");
        image.Metadata.ExifProfile = exif;

        var output = new MemoryStream();
        image.Save(output, new JpegEncoder());
        output.Position = 0;
        return output;
    }
}
