// Fixture round-trip tests (MOBILE_CONTRACTS §11) — the contract-drift alarm.
// Each fixture under test/fixtures/ is asserted to `fromJson` successfully
// and spot-checked on a few fields; when CONTRACTS.md changes, a failing test
// here is the to-do list.
import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:steeple_mobile/core/models/models.dart';

Map<String, dynamic> _loadJson(String name) {
  final raw = File('test/fixtures/$name').readAsStringSync();
  return jsonDecode(raw) as Map<String, dynamic>;
}

void main() {
  group('listing_search.json', () {
    test('round-trips ListingSearchResult', () {
      final result = ListingSearchResult.fromJson(
        _loadJson('listing_search.json'),
      );

      expect(result.totalCount, 3);
      expect(result.items, hasLength(3));
      expect(result.items[0].isFree, isFalse);
      expect(result.items[1].isFree, isTrue);
      expect(result.items[0].rating?.averageStars, 4.75);
      expect(result.center?.latitude, closeTo(38.9012, 0.0001));
      expect(result.appliedBounds.minLat, closeTo(38.85, 0.0001));
    });
  });

  group('room_detail.json', () {
    test('round-trips RoomDetail', () {
      final detail = RoomDetail.fromJson(_loadJson('room_detail.json'));

      expect(detail.roomName, 'Fellowship Hall');
      expect(detail.venue.name, 'Grace Community Church');
      expect(detail.venue.venueTypeValue, VenueType.church);
      expect(detail.rating?.count, 4);
      expect(detail.amenities, contains('kitchen'));
      expect(detail.photos, hasLength(2));
    });
  });

  group('auth_session.json', () {
    test('round-trips AuthSession', () {
      final session = AuthSession.fromJson(_loadJson('auth_session.json'));

      expect(session.accessToken, isNotEmpty);
      expect(session.user.displayName, 'Priya Patel');
      expect(session.isNewUser, isFalse);
    });
  });

  group('me.json', () {
    test('round-trips MeResponse', () {
      final me = MeResponse.fromJson(_loadJson('me.json'));

      expect(me.displayName, 'Priya Patel');
      expect(me.agreements, hasLength(2));
      expect(me.agreements[0].docType, 'tos');
    });
  });

  group('application.json', () {
    test('round-trips Application', () {
      final application = Application.fromJson(_loadJson('application.json'));

      expect(application.statusValue, ApplicationStatus.approved);
      expect(
        application.schedule.frequencyValue,
        ScheduleFrequency.recurringWeekly,
      );
      expect(application.messages, hasLength(2));
      expect(application.bookingId, 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
      expect(application.organizer.ratingSummary?.ratingCount, 2);
    });

    test('tolerates an unknown status token and unrecognized fields', () {
      final json = _loadJson('application.json');
      json['status'] = 'someFutureStatus';
      json['extraField'] = 'unrecognized-by-this-client-build';

      final application = Application.fromJson(json);

      expect(application.statusValue, ApplicationStatus.unknown);
      // Unknown tokens still render humanized rather than crashing.
      expect(wireTokenLabel(application.status), 'Some future status');
    });
  });

  group('booking.json', () {
    test('round-trips Booking', () {
      final booking = Booking.fromJson(_loadJson('booking.json'));

      expect(booking.statusValue, BookingStatus.confirmed);
      expect(booking.typeValue, BookingType.recurring);
      expect(booking.occurrences, hasLength(3));
      expect(booking.nextOccurrence?.statusValue, OccurrenceStatus.scheduled);
      expect(booking.occurrences[0].statusValue, OccurrenceStatus.occurred);
      expect(booking.ratings?.byVenue?.stars, 5);
      expect(booking.ratings?.byVenue?.comment, contains('tidy'));
      expect(booking.ratings?.canRate, isTrue);
    });
  });

  group('venue_reviews.json', () {
    test('round-trips VenueReviewPage', () {
      final reviews = VenueReviewPage.fromJson(_loadJson('venue_reviews.json'));

      expect(reviews.totalCount, 2);
      expect(reviews.items, hasLength(2));
      expect(reviews.items[0].stars, 5);
      expect(reviews.items[0].comment, contains('clean'));
    });
  });

  group('notifications_page.json', () {
    test('round-trips a CursorPage<AppNotification>', () {
      final page = CursorPage<AppNotification>.fromJson(
        _loadJson('notifications_page.json'),
        (json) => AppNotification.fromJson(json),
      );

      expect(page.items, hasLength(4));
      expect(page.nextCursor, isNotNull);
      expect(page.items[0].typeValue, NotificationType.renewalDue);
      expect(
        page.items[0].payload.bookingId,
        'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      );
      expect(page.items[2].typeValue, NotificationType.applicationApproved);
      expect(
        page.items[2].payload.deepLink,
        '/inbox/applications/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      );
    });

    test('tolerates an unrecognized notification type', () {
      final json = _loadJson('notifications_page.json');
      final items = (json['items'] as List<dynamic>)
          .cast<Map<String, dynamic>>();
      items[0]['type'] = 'somethingBrandNew';

      final notification = AppNotification.fromJson(items[0]);

      expect(notification.typeValue, NotificationType.unknown);
      expect(wireTokenLabel(notification.type), 'Something brand new');
    });
  });

  group('geofence.json', () {
    test('round-trips GeofenceContext', () {
      final geofence = GeofenceContext.fromJson(_loadJson('geofence.json'));

      expect(geofence.areaName, 'Northern Virginia (Vienna beachhead)');
      expect(geofence.center.longitude, closeTo(-77.2653, 0.0001));
      expect(geofence.beachhead.maxLng, closeTo(-77.21, 0.0001));
    });
  });

  group('managed_venues.json', () {
    test('round-trips a List<ManagedVenue>', () {
      final raw =
          jsonDecode(
                File('test/fixtures/managed_venues.json').readAsStringSync(),
              )
              as List<dynamic>;
      final venues = raw
          .map((e) => ManagedVenue.fromJson(e as Map<String, dynamic>))
          .toList();

      expect(venues, hasLength(2));
      expect(venues[0].name, 'Grace Community Church');
      expect(venues[0].slug, 'grace-community-church');
    });
  });

  group('managed_venue_detail.json', () {
    test('round-trips ManagedVenueDetail', () {
      final detail = ManagedVenueDetail.fromJson(
        _loadJson('managed_venue_detail.json'),
      );

      expect(detail.name, 'Grace Community Church');
      expect(detail.venueTypeValue, VenueType.church);
      expect(detail.rooms, hasLength(2));
      expect(detail.rooms[0].statusValue, ManagedRoomStatus.published);
      expect(detail.rooms[1].statusValue, ManagedRoomStatus.draft);
      expect(detail.rooms[1].publishRequestedAtUtc, isNotNull);
    });
  });

  group('managed_room.json', () {
    test('round-trips ManagedRoom', () {
      final room = ManagedRoom.fromJson(_loadJson('managed_room.json'));

      expect(room.name, 'Fellowship Hall');
      expect(room.venueName, 'Grace Community Church');
      expect(room.statusValue, ManagedRoomStatus.published);
      expect(room.isFree, isFalse);
      expect(room.photos, hasLength(2));
      expect(room.photos[0].id, isNotNull);
      expect(room.photos[0].thumbUrl, isNotNull);
      expect(room.activities, contains('community'));
    });

    test('tolerates an unknown status token', () {
      final json = _loadJson('managed_room.json');
      json['status'] = 'archived';

      final room = ManagedRoom.fromJson(json);

      expect(room.statusValue, ManagedRoomStatus.unknown);
      expect(wireTokenLabel(room.status), 'Archived');
    });
  });

  group('manage_applications_page.json', () {
    test('round-trips a Paged<Application>', () {
      final page = Paged<Application>.fromJson(
        _loadJson('manage_applications_page.json'),
        (json) => Application.fromJson(json),
      );

      expect(page.totalCount, 2);
      expect(page.items, hasLength(2));
      expect(page.items[0].statusValue, ApplicationStatus.approved);
      expect(page.items[1].statusValue, ApplicationStatus.pending);
      expect(page.items[1].bookingId, isNull);
      expect(page.items[0].organizer.ratingSummary?.completedBookings, 3);
    });
  });

  group('flags.json', () {
    test('decodes as a platform flag snapshot', () {
      final raw = File('test/fixtures/flags.json').readAsStringSync();
      final flags = (jsonDecode(raw) as Map<String, dynamic>).map(
        (key, value) => MapEntry(key, value as bool),
      );

      expect(flags['mobile.apply_enabled'], isTrue);
      expect(flags['mobile.manage_enabled'], isFalse);
      expect(flags['mobile.force_upgrade'], isFalse);
    });
  });
}
