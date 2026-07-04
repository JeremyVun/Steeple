/// Pagination envelopes (CONTRACTS §2 conventions; MOBILE_CONTRACTS §5).
library;

/// Page-numbered list response: `{ items, totalCount, page, pageSize }`.
class Paged<T> {
  const Paged({
    required this.items,
    required this.totalCount,
    required this.page,
    required this.pageSize,
  });

  final List<T> items;
  final int totalCount;
  final int page;
  final int pageSize;

  bool get hasMore => page * pageSize < totalCount;

  factory Paged.fromJson(
    Map<String, dynamic> json,
    T Function(Map<String, dynamic>) fromJsonT,
  ) =>
      Paged(
        items: (json['items'] as List<dynamic>? ?? const [])
            .map((e) => fromJsonT(e as Map<String, dynamic>))
            .toList(),
        totalCount: (json['totalCount'] as num?)?.toInt() ?? 0,
        page: (json['page'] as num?)?.toInt() ?? 1,
        pageSize: (json['pageSize'] as num?)?.toInt() ?? 0,
      );
}

/// Cursor-paged response (inbox): `{ items, nextCursor? }` — `nextCursor` is
/// opaque; absent means the end.
class CursorPage<T> {
  const CursorPage({required this.items, this.nextCursor});

  final List<T> items;
  final String? nextCursor;

  bool get hasMore => nextCursor != null;

  factory CursorPage.fromJson(
    Map<String, dynamic> json,
    T Function(Map<String, dynamic>) fromJsonT,
  ) =>
      CursorPage(
        items: (json['items'] as List<dynamic>? ?? const [])
            .map((e) => fromJsonT(e as Map<String, dynamic>))
            .toList(),
        nextCursor: json['nextCursor'] as String?,
      );
}
