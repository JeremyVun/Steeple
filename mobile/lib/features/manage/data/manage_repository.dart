import '../../../core/api/api_client.dart';
import '../../../core/models/models.dart';

/// Manage (provider self-service) wire access (MOBILE_CONTRACTS §8;
/// CONTRACTS §6, Phase 5). Owned by the manage feature.
abstract class ManageRepository {
  /// `GET /api/v1/manage/venues` — venues where the caller is a
  /// `venue_manager` (empty for non-providers).
  Future<List<ManagedVenue>> venues();

  /// `GET /api/v1/manage/venues/{id}`.
  Future<ManagedVenueDetail> venue(String id);

  /// `GET /api/v1/manage/rooms/{id}`.
  Future<ManagedRoom> room(String id);

  /// `PATCH /api/v1/manage/rooms/{id}` — only non-null [patch] fields are
  /// sent; returns the room as it now stands.
  Future<ManagedRoom> saveRoom(String id, ManagedRoomPatch patch);

  /// `GET /api/v1/manage/rooms/{id}/availability` — the room's open hours +
  /// blackouts; always all seven days Sunday-first, blackouts sorted ascending.
  Future<RoomAvailabilityRules> openHours(String roomId);

  /// `PUT /api/v1/manage/rooms/{id}/availability` — replace-all write; returns
  /// the canonical rules as they now stand.
  Future<RoomAvailabilityRules> saveOpenHours(String roomId, RoomAvailabilityRules rules);

  /// `GET /api/v1/manage/applications` — the provider inbox (empty list, not
  /// an error, for non-managers).
  Future<Paged<Application>> applications({String? status, int page = 1});

  /// `GET /api/v1/manage/venues/{id}/calendar?from&to` — the venue's confirmed
  /// occurrences + pending overlays over a venue-local date span (≤92 days;
  /// server defaults today..+27d when omitted).
  Future<VenueCalendar> calendar(String venueId, {required String from, required String to});

  /// `POST /api/v1/applications/{id}/decision`.
  Future<Application> decide(String id, {required bool approve, String? message});

  /// `POST /api/v1/applications/{id}/counter-offer` (CONTRACTS §5) — the
  /// manager suggests an alternative [schedule]. Supersedes any open counter,
  /// moves the application to `counterOffered`. Can `409 schedule_unavailable`
  /// (conflict payload in `AppError.problem`) or `409 invalid_state` once
  /// decided.
  Future<Application> counterOffer(
    String id,
    ProposedSchedule schedule, {
    String? message,
  });
}

class ApiManageRepository implements ManageRepository {
  const ApiManageRepository(this._api);

  final ApiClient _api;

  @override
  Future<List<ManagedVenue>> venues() => _api.get(
        '/api/v1/manage/venues',
        decode: (data) => (data as List<dynamic>)
            .map((e) => ManagedVenue.fromJson(e as Map<String, dynamic>))
            .toList(),
      );

  @override
  Future<ManagedVenueDetail> venue(String id) => _api.get(
        '/api/v1/manage/venues/$id',
        decode: (data) => ManagedVenueDetail.fromJson(data as Map<String, dynamic>),
      );

  @override
  Future<ManagedRoom> room(String id) => _api.get(
        '/api/v1/manage/rooms/$id',
        decode: (data) => ManagedRoom.fromJson(data as Map<String, dynamic>),
      );

  @override
  Future<ManagedRoom> saveRoom(String id, ManagedRoomPatch patch) => _api.patch(
        '/api/v1/manage/rooms/$id',
        body: patch.toJson(),
        decode: (data) => ManagedRoom.fromJson(data as Map<String, dynamic>),
      );

  @override
  Future<RoomAvailabilityRules> openHours(String roomId) => _api.get(
        '/api/v1/manage/rooms/$roomId/availability',
        decode: (data) => RoomAvailabilityRules.fromJson(data as Map<String, dynamic>),
      );

  @override
  Future<RoomAvailabilityRules> saveOpenHours(
    String roomId,
    RoomAvailabilityRules rules,
  ) =>
      _api.put(
        '/api/v1/manage/rooms/$roomId/availability',
        body: rules.toSavePayload(),
        decode: (data) => RoomAvailabilityRules.fromJson(data as Map<String, dynamic>),
      );

  @override
  Future<Paged<Application>> applications({String? status, int page = 1}) => _api.get(
        '/api/v1/manage/applications',
        query: {'status': ?status, 'page': page},
        decode: (data) =>
            Paged.fromJson(data as Map<String, dynamic>, Application.fromJson),
      );

  @override
  Future<VenueCalendar> calendar(
    String venueId, {
    required String from,
    required String to,
  }) =>
      _api.get(
        '/api/v1/manage/venues/$venueId/calendar',
        query: {'from': from, 'to': to},
        decode: (data) => VenueCalendar.fromJson(data as Map<String, dynamic>),
      );

  @override
  Future<Application> decide(String id, {required bool approve, String? message}) => _api.post(
        '/api/v1/applications/$id/decision',
        body: {
          'decision': approve ? 'approve' : 'decline',
          'message': ?message,
        },
        decode: (data) => Application.fromJson(data as Map<String, dynamic>),
      );

  @override
  Future<Application> counterOffer(
    String id,
    ProposedSchedule schedule, {
    String? message,
  }) =>
      _api.post(
        '/api/v1/applications/$id/counter-offer',
        body: {'schedule': schedule.toJson(), 'message': ?message},
        decode: (data) => Application.fromJson(data as Map<String, dynamic>),
      );
}
