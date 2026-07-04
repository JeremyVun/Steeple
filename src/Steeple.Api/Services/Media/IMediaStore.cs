namespace Steeple.Api.Services.Media;
/// <summary>
/// Object-storage port (SYSTEM_DESIGN §9): DO Spaces (S3-compatible, public-read + CDN) in
/// production, local disk served by the API in dev. Keys are content-addressed paths like
/// <c>rooms/{roomId}/{hash}-{width}.jpg</c>.
/// </summary>
public interface IMediaStore
{
    /// <summary>Stores one object publicly and returns its absolute public URL.</summary>
    Task<string> PutAsync(string key, byte[] bytes, string contentType, CancellationToken ct = default);

    /// <summary>Deletes objects; missing keys are not an error (delete is idempotent).</summary>
    Task DeleteAsync(IReadOnlyList<string> keys, CancellationToken ct = default);
}
