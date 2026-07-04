using Microsoft.Extensions.Options;

namespace Steeple.Api.Proxies.Media;
/// <summary>
/// Dev fallback for <see cref="IMediaStore"/>: writes under the content root and relies on the
/// API's <c>/media</c> static-file mapping (Program.cs) to serve the files. Keeps the whole
/// upload loop runnable with zero cloud config; production supplies Spaces settings instead.
/// </summary>
public sealed class LocalDiskMediaStore : IMediaStore
{
    private readonly string _root;
    private readonly string _publicBaseUrl;

    /// <summary>Resolves the storage root and public prefix from options + environment.</summary>
    public LocalDiskMediaStore(IOptions<MediaOptions> options, IHostEnvironment environment)
    {
        _root = Path.Combine(environment.ContentRootPath, options.Value.LocalRoot);
        _publicBaseUrl = options.Value.PublicBaseUrl.TrimEnd('/');
    }

    /// <inheritdoc />
    public async Task<string> PutAsync(string key, byte[] bytes, string contentType, CancellationToken ct = default)
    {
        var path = SafePath(key);
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        await File.WriteAllBytesAsync(path, bytes, ct).ConfigureAwait(false);
        return $"{_publicBaseUrl}/media/{key}";
    }

    /// <inheritdoc />
    public Task DeleteAsync(IReadOnlyList<string> keys, CancellationToken ct = default)
    {
        foreach (var key in keys)
        {
            var path = SafePath(key);
            if (File.Exists(path))
            {
                File.Delete(path);
            }
        }

        return Task.CompletedTask;
    }

    /// <summary>Confines keys to the storage root (keys are server-generated, but stay paranoid).</summary>
    private string SafePath(string key)
    {
        var full = Path.GetFullPath(Path.Combine(_root, key));
        return full.StartsWith(Path.GetFullPath(_root), StringComparison.Ordinal)
            ? full
            : throw new InvalidOperationException($"Media key '{key}' escapes the storage root.");
    }
}
