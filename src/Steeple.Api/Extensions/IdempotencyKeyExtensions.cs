namespace Steeple.Api.Extensions;
/// <summary>
/// Reads the <c>Idempotency-Key</c> request header (conventions.md §2). One place so every
/// create that honors it agrees on the parse — including on what a malformed key means.
/// </summary>
public static class IdempotencyKeyExtensions
{
    /// <summary>The header name.</summary>
    public const string HeaderName = "Idempotency-Key";

    /// <summary>
    /// The caller's key, or null when the header is absent — or present but not a GUID, which is
    /// treated as absent (the request proceeds unguarded) rather than rejected, matching the
    /// applications submit endpoint's long-standing behavior.
    /// </summary>
    public static Guid? ReadIdempotencyKey(this HttpRequest request) =>
        request.Headers.TryGetValue(HeaderName, out var raw) && Guid.TryParse(raw.ToString(), out var parsed)
            ? parsed
            : null;
}
