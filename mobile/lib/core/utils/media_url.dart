/// Resolves local-disk `media/...` paths against the API this mobile build uses.
/// CDN/object-store URLs are already absolute and pass through unchanged.
String resolveMediaUrl(Uri apiBaseUrl, String value) {
  final mediaUri = Uri.parse(value);
  if (mediaUri.hasScheme || mediaUri.hasAuthority) return value;

  final base = apiBaseUrl.path.endsWith('/')
      ? apiBaseUrl
      : apiBaseUrl.replace(path: '${apiBaseUrl.path}/');
  return base.resolveUri(mediaUri).toString();
}
