using Amazon.S3;
using Amazon.S3.Model;
using Microsoft.Extensions.Options;

namespace Steeple.Api.Proxies.Media;
/// <summary>
/// DO Spaces adapter for <see cref="IMediaStore"/> (S3-compatible; public-read objects served
/// via the Spaces CDN at <see cref="MediaOptions.PublicBaseUrl"/>).
/// </summary>
public sealed class S3MediaStore : IMediaStore, IDisposable
{
    private readonly AmazonS3Client _client;
    private readonly MediaOptions _options;

    /// <summary>Creates the client from the configured Spaces credentials.</summary>
    public S3MediaStore(IOptions<MediaOptions> options)
    {
        _options = options.Value;
        _client = new AmazonS3Client(
            _options.AccessKey,
            _options.SecretKey,
            new AmazonS3Config { ServiceURL = _options.ServiceUrl });
    }

    /// <inheritdoc />
    public async Task<string> PutAsync(string key, byte[] bytes, string contentType, CancellationToken ct = default)
    {
        using var stream = new MemoryStream(bytes);
        await _client.PutObjectAsync(
            new PutObjectRequest
            {
                BucketName = _options.Bucket,
                Key = key,
                InputStream = stream,
                ContentType = contentType,
                CannedACL = S3CannedACL.PublicRead,
                // Content-hashed keys never change content — let the CDN cache them forever.
                Headers = { CacheControl = "public, max-age=31536000, immutable" },
            },
            ct).ConfigureAwait(false);

        return $"{_options.PublicBaseUrl.TrimEnd('/')}/{key}";
    }

    /// <inheritdoc />
    public async Task DeleteAsync(IReadOnlyList<string> keys, CancellationToken ct = default)
    {
        if (keys.Count == 0)
        {
            return;
        }

        await _client.DeleteObjectsAsync(
            new DeleteObjectsRequest
            {
                BucketName = _options.Bucket,
                Objects = keys.Select(k => new KeyVersion { Key = k }).ToList(),
                Quiet = true, // missing keys are fine — delete is idempotent
            },
            ct).ConfigureAwait(false);
    }

    /// <inheritdoc />
    public void Dispose() => _client.Dispose();
}
