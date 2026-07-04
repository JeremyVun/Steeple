using System.Security.Cryptography;
using SixLabors.ImageSharp;
using SixLabors.ImageSharp.Formats.Jpeg;
using SixLabors.ImageSharp.Processing;

namespace Steeple.Api.Proxies.Media;
/// <summary>
/// ImageSharp adapter for <see cref="IImageProcessor"/>: decode (which is also the content
/// check), auto-orient from the EXIF flag, then re-encode JPEG variants with all metadata
/// dropped — uploads from phones carry GPS EXIF that must never reach the CDN.
/// </summary>
public sealed class ImageSharpImageProcessor : IImageProcessor
{
    private const int JpegQuality = 82;

    /// <inheritdoc />
    public async Task<ProcessedImage?> ProcessAsync(Stream content, CancellationToken ct = default)
    {
        // Buffer once: we hash the original bytes and decode from the same buffer.
        using var buffer = new MemoryStream();
        await content.CopyToAsync(buffer, ct).ConfigureAwait(false);
        var sourceBytes = buffer.ToArray();
        if (sourceBytes.Length == 0)
        {
            return null; // Image.Load throws ArgumentNullException on empty input, not a decode exception
        }

        Image image;
        try
        {
            image = Image.Load(sourceBytes);
        }
        catch (Exception ex) when (ex is UnknownImageFormatException or InvalidImageContentException)
        {
            return null; // not an image (or a format we don't accept) — the caller 400s
        }

        using (image)
        {
            // Bake the EXIF orientation into the pixels before the metadata is dropped.
            image.Mutate(x => x.AutoOrient());

            // Dropping metadata wholesale is the EXIF strip (GPS, serials, thumbnails, all of it).
            image.Metadata.ExifProfile = null;
            image.Metadata.XmpProfile = null;
            image.Metadata.IptcProfile = null;

            var encoder = new JpegEncoder { Quality = JpegQuality };
            var variants = new List<ImageVariant>(MediaVariants.Widths.Length);

            foreach (var width in MediaVariants.Widths)
            {
                using var variant = image.Clone(x =>
                {
                    if (image.Width > width)
                    {
                        // Height 0 = preserve aspect ratio; never upscale small sources.
                        x.Resize(width, 0);
                    }
                });

                using var output = new MemoryStream();
                await variant.SaveAsync(output, encoder, ct).ConfigureAwait(false);
                variants.Add(new ImageVariant(width, output.ToArray()));
            }

            return new ProcessedImage(variants, Convert.ToHexStringLower(SHA256.HashData(sourceBytes)));
        }
    }
}
