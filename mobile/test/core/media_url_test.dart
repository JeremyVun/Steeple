import 'package:flutter_test/flutter_test.dart';
import 'package:steeple_mobile/core/utils/media_url.dart';

void main() {
  test('resolves local media paths against the configured API origin', () {
    expect(
      resolveMediaUrl(
        Uri.parse('http://localhost:5200'),
        'media/rooms/one/photo-400.jpg',
      ),
      'http://localhost:5200/media/rooms/one/photo-400.jpg',
    );
  });

  test('preserves an API path prefix', () {
    expect(
      resolveMediaUrl(
        Uri.parse('https://example.test/steeple'),
        'media/rooms/one/photo.jpg',
      ),
      'https://example.test/steeple/media/rooms/one/photo.jpg',
    );
  });

  test('leaves CDN URLs unchanged', () {
    const cdn = 'https://media.example.test/rooms/one/photo.jpg';
    expect(resolveMediaUrl(Uri.parse('http://localhost:5200'), cdn), cdn);
  });
}
