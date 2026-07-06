/// `GET /api/v1/listings/search` query (CONTRACTS.md §3) — client-side only,
/// never deserialized from the wire, so it is a plain class (no
/// json_serializable): [toQueryParameters] is the one thing it needs to do.
library;

/// Time-of-day band boundaries (CONTRACTS §3 "When filter", venue-local
/// `HH:mm`): 08:00–12:00 / 12:00–17:00 / 17:00–22:00.
const timeOfDayBands = <String, (String, String)>{
  'morning': ('08:00', '12:00'),
  'afternoon': ('12:00', '17:00'),
  'evening': ('17:00', '22:00'),
};

/// The "when" sub-filter (time-first search, CONTRACTS §3, additive —
/// availability plan commit 6): a one-off [date] XOR recurring [daysOfWeek],
/// plus an optional time band or custom range. `isAny` ("Any time") sends no
/// When params and results carry no `matchedWindow`. Also carried as router
/// `extra` (MOBILE_CONTRACTS §7) from a listing card tap through to the apply
/// form, which prefills its schedule from it.
class WhenFilter {
  const WhenFilter({
    this.date,
    this.daysOfWeek = const <String>{},
    this.timeOfDay,
    this.startTime,
    this.endTime,
  });

  /// `yyyy-MM-dd`, one-off search. Mutually exclusive with [daysOfWeek].
  final String? date;

  /// Weekday wire tokens, recurring search. Mutually exclusive with [date].
  final Set<String> daysOfWeek;

  /// `morning | afternoon | evening`; null when a custom range is used
  /// instead (or no time was chosen at all).
  final String? timeOfDay;

  /// `HH:mm`; only meaningful when [timeOfDay] is null.
  final String? startTime;
  final String? endTime;

  bool get isAny => date == null && daysOfWeek.isEmpty;

  /// Resolved `HH:mm` range: the band's bounds, the custom range, or nulls
  /// when no time was chosen (any free window that day/those days).
  (String?, String?) get resolvedRange {
    final band = timeOfDay == null ? null : timeOfDayBands[timeOfDay];
    return band ?? (startTime, endTime);
  }

  WhenFilter copyWith({
    String? Function()? date,
    Set<String>? daysOfWeek,
    String? Function()? timeOfDay,
    String? Function()? startTime,
    String? Function()? endTime,
  }) => WhenFilter(
    date: date == null ? this.date : date(),
    daysOfWeek: daysOfWeek ?? this.daysOfWeek,
    timeOfDay: timeOfDay == null ? this.timeOfDay : timeOfDay(),
    startTime: startTime == null ? this.startTime : startTime(),
    endTime: endTime == null ? this.endTime : endTime(),
  );
}

/// The one filter/search state (`searchFiltersProvider`, MOBILE_CONTRACTS §8).
///
/// Either a center + radius **or** an explicit bounding box drives the
/// search — never both. Repeated `activities`/`accessibility` values combine
/// server-side into an AND match (CONTRACTS §3).
class SearchQuery {
  const SearchQuery({
    this.centerLat,
    this.centerLng,
    this.radiusMeters,
    this.minLat,
    this.maxLat,
    this.minLng,
    this.maxLng,
    this.suburb,
    this.minCapacity,
    this.activities = const <String>[],
    this.accessibility = const <String>[],
    this.date,
    this.daysOfWeek = const <String>[],
    this.timeOfDay,
    this.startTime,
    this.endTime,
    this.durationMinutes = 120,
    this.page = 1,
    this.pageSize = 24,
  });

  final double? centerLat;
  final double? centerLng;
  final double? radiusMeters;

  final double? minLat;
  final double? maxLat;
  final double? minLng;
  final double? maxLng;

  final String? suburb;
  final int? minCapacity;
  final List<String> activities;
  final List<String> accessibility;

  /// When filter (CONTRACTS §3, additive): `date` and `daysOfWeek` are
  /// mutually exclusive; `timeOfDay` (band token) and `startTime`/`endTime`
  /// (explicit `HH:mm`) are alternatives for the time constraint.
  final String? date;
  final List<String> daysOfWeek;
  final String? timeOfDay;
  final String? startTime;
  final String? endTime;
  final int durationMinutes;

  final int page;
  final int pageSize;

  SearchQuery copyWith({
    double? centerLat,
    double? centerLng,
    double? radiusMeters,
    double? minLat,
    double? maxLat,
    double? minLng,
    double? maxLng,
    String? suburb,
    int? minCapacity,
    List<String>? activities,
    List<String>? accessibility,
    String? date,
    List<String>? daysOfWeek,
    String? timeOfDay,
    String? startTime,
    String? endTime,
    int? durationMinutes,
    int? page,
    int? pageSize,
  }) => SearchQuery(
    centerLat: centerLat ?? this.centerLat,
    centerLng: centerLng ?? this.centerLng,
    radiusMeters: radiusMeters ?? this.radiusMeters,
    minLat: minLat ?? this.minLat,
    maxLat: maxLat ?? this.maxLat,
    minLng: minLng ?? this.minLng,
    maxLng: maxLng ?? this.maxLng,
    suburb: suburb ?? this.suburb,
    minCapacity: minCapacity ?? this.minCapacity,
    activities: activities ?? this.activities,
    accessibility: accessibility ?? this.accessibility,
    date: date ?? this.date,
    daysOfWeek: daysOfWeek ?? this.daysOfWeek,
    timeOfDay: timeOfDay ?? this.timeOfDay,
    startTime: startTime ?? this.startTime,
    endTime: endTime ?? this.endTime,
    durationMinutes: durationMinutes ?? this.durationMinutes,
    page: page ?? this.page,
    pageSize: pageSize ?? this.pageSize,
  );

  /// Builds the query-parameter map for `GET /listings/search`. Dio encodes
  /// `List<String>` values as repeated params, so `activities`/`accessibility`/
  /// `daysOfWeek` are passed through as lists rather than joined. Nulls and
  /// defaults (`durationMinutes: 120`, `page: 1`, `pageSize: 24`) are omitted.
  Map<String, dynamic> toQueryParameters() {
    final params = <String, dynamic>{};
    if (centerLat != null) params['centerLat'] = centerLat;
    if (centerLng != null) params['centerLng'] = centerLng;
    if (radiusMeters != null) params['radiusMeters'] = radiusMeters;
    if (minLat != null) params['minLat'] = minLat;
    if (maxLat != null) params['maxLat'] = maxLat;
    if (minLng != null) params['minLng'] = minLng;
    if (maxLng != null) params['maxLng'] = maxLng;
    if (suburb != null) params['suburb'] = suburb;
    if (minCapacity != null) params['minCapacity'] = minCapacity;
    if (activities.isNotEmpty) params['activities'] = activities;
    if (accessibility.isNotEmpty) params['accessibility'] = accessibility;
    if (date != null) params['date'] = date;
    if (daysOfWeek.isNotEmpty) params['daysOfWeek'] = daysOfWeek;
    if (timeOfDay != null) params['timeOfDay'] = timeOfDay;
    if (startTime != null) params['startTime'] = startTime;
    if (endTime != null) params['endTime'] = endTime;
    if (durationMinutes != 120) params['durationMinutes'] = durationMinutes;
    if (page != 1) params['page'] = page;
    if (pageSize != 24) params['pageSize'] = pageSize;
    return params;
  }
}
