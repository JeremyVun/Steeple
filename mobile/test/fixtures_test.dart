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
      // Additive matchedWindow (CONTRACTS §3, availability plan commit 6):
      // present only on the item stamped with one.
      expect(result.items[0].matchedWindow?.date, '2026-09-08');
      expect(result.items[0].matchedWindow?.startTime, '18:00');
      expect(result.items[0].matchedWindow?.endTime, '21:00');
      expect(result.items[1].matchedWindow, isNull);
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
      // Additive open-hours (CONTRACTS §3): all seven days, Sunday-first.
      expect(detail.openHours, hasLength(7));
      expect(detail.openHours!.first.dayOfWeek, 'sunday');
      expect(detail.openHours!.first.windows, isEmpty);
      final wed = detail.openHours!.firstWhere((d) => d.dayOfWeek == 'wednesday');
      expect(wed.windows, hasLength(2));
    });

    test('tolerates a legacy payload with no openHours', () {
      final json = _loadJson('room_detail.json');
      json.remove('openHours');

      final detail = RoomDetail.fromJson(json);

      expect(detail.openHours, isNull);
    });
  });

  group('availability.json', () {
    test('round-trips RoomAvailability', () {
      final availability =
          RoomAvailability.fromJson(_loadJson('availability.json'));

      expect(availability.timezone, 'America/New_York');
      expect(availability.days, hasLength(14));
      expect(availability.days.first.date, '2026-07-06');
      // A fully-free day carries its window.
      expect(availability.days.first.freeWindows, hasLength(1));
      expect(availability.days.first.freeWindows.first.startTime, '18:00');
      // A blackout day: flagged, no free windows.
      final blackout = availability.days.firstWhere((d) => d.isBlackout);
      expect(blackout.date, '2026-07-13');
      expect(blackout.freeWindows, isEmpty);
      // A booked-out / closed day: no free windows, not a blackout.
      expect(availability.dayFor('2026-07-09')?.freeWindows, isEmpty);
      expect(availability.dayFor('2026-07-09')?.isBlackout, isFalse);
    });
  });

  group('conflict_check.json', () {
    test('round-trips ScheduleCheckResult with all three reasons', () {
      final result =
          ScheduleCheckResult.fromJson(_loadJson('conflict_check.json'));

      expect(result.available, isFalse);
      expect(result.totalOccurrences, 8);
      expect(result.conflicts, hasLength(3));
      expect(
        result.conflicts.map((c) => c.reason),
        containsAll(<String>['booked', 'blackout', 'outsideOpenHours']),
      );
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

  group('application_counter_offer.json', () {
    test('round-trips an Application carrying an open counterOffer', () {
      final application =
          Application.fromJson(_loadJson('application_counter_offer.json'));

      // New status token (CONTRACTS §5, availability plan commit 8).
      expect(application.statusValue, ApplicationStatus.counterOffered);
      expect(application.bookingId, isNull);

      final counter = application.counterOffer;
      expect(counter, isNotNull);
      expect(counter!.statusValue, CounterOfferStatus.open);
      expect(counter.isOpen, isTrue);
      expect(counter.respondedAtUtc, isNull);
      expect(counter.message, contains('Thursday'));
      // The offered schedule differs from the ask (Thursday vs Tuesday).
      expect(counter.schedule.daysOfWeek, ['thursday']);
      expect(application.schedule.daysOfWeek, ['tuesday']);
    });

    test('tolerates an unknown counter status token', () {
      final json = _loadJson('application_counter_offer.json');
      (json['counterOffer'] as Map<String, dynamic>)['status'] = 'someFutureState';

      final application = Application.fromJson(json);

      expect(application.counterOffer!.statusValue, CounterOfferStatus.unknown);
      expect(application.counterOffer!.isOpen, isFalse);
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

    test('the pending item carries an additive host-review conflicts block', () {
      final page = Paged<Application>.fromJson(
        _loadJson('manage_applications_page.json'),
        (json) => Application.fromJson(json),
      );

      // Additive (CONTRACTS §6): null on the decided item, present on pending.
      expect(page.items[0].conflicts, isNull);
      final conflicts = page.items[1].conflicts;
      expect(conflicts, isNotNull);
      expect(conflicts!.totalOccurrences, 4);
      expect(conflicts.conflicts, hasLength(2));
      expect(
        conflicts.conflicts.map((c) => c.reason),
        containsAll(<String>['booked', 'blackout']),
      );
      expect(conflicts.pendingOverlaps, hasLength(2));
      expect(conflicts.pendingOverlaps[0].organizerName, 'Priya Patel');
      expect(conflicts.pendingOverlaps[0].overlappingDateCount, 2);
      // Adapts to the shared verdict shape — 2 of 4 clash ⇒ not available.
      expect(conflicts.checkResult.available, isFalse);
      expect(conflicts.checkResult.totalOccurrences, 4);
    });

    test('tolerates a legacy payload with no conflicts', () {
      final json = _loadJson('manage_applications_page.json');
      final items = (json['items'] as List<dynamic>).cast<Map<String, dynamic>>();
      items[1].remove('conflicts');

      final application = Application.fromJson(items[1]);

      expect(application.conflicts, isNull);
    });
  });

  group('host_calendar.json', () {
    test('round-trips VenueCalendar', () {
      final calendar = VenueCalendar.fromJson(_loadJson('host_calendar.json'));

      expect(calendar.timezone, 'America/New_York');
      expect(calendar.from, '2026-07-05');
      expect(calendar.to, '2026-07-11');
      expect(calendar.rooms, hasLength(2));
      expect(calendar.rooms[0].name, 'Fellowship Hall');
      expect(calendar.occurrences, hasLength(6));
      expect(calendar.occurrences[0].organizerName, 'Priya Patel');
      expect(calendar.occurrences[0].startTime, '18:00');
      // Every occurrence date falls inside the echoed window.
      for (final o in calendar.occurrences) {
        expect(o.localDate.compareTo(calendar.from) >= 0, isTrue);
        expect(o.localDate.compareTo(calendar.to) <= 0, isTrue);
      }
      // Two pending overlays; the first spans two dates.
      expect(calendar.pending, hasLength(2));
      expect(calendar.pending[0].organizerName, 'Marcus Lee');
      expect(calendar.pending[0].dates, hasLength(2));
      expect(calendar.pending[1].applicationId,
          'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee');
    });
  });

  group('room_open_hours.json', () {
    test('round-trips RoomAvailabilityRules', () {
      final rules = RoomAvailabilityRules.fromJson(_loadJson('room_open_hours.json'));

      expect(rules.timezone, 'America/New_York');
      // GET always emits all seven days Sunday-first.
      expect(rules.days, hasLength(7));
      expect(rules.days.first.dayOfWeek, 'sunday');
      expect(rules.days.last.dayOfWeek, 'saturday');
      // Closed days have empty windows.
      expect(rules.days[0].windows, isEmpty);
      // Wednesday has two windows.
      final wednesday = rules.days.firstWhere((d) => d.dayOfWeek == 'wednesday');
      expect(wednesday.windows, hasLength(2));
      expect(wednesday.windows[0].startTime, '09:00');
      expect(wednesday.windows[1].endTime, '21:00');
      // Two future blackouts, each with a reason.
      expect(rules.blackouts, hasLength(2));
      expect(rules.blackouts[0].date, '2026-12-24');
      expect(rules.blackouts[0].reason, 'Christmas Eve service');
    });

    test('toSavePayload emits days + blackouts only', () {
      final rules = RoomAvailabilityRules.fromJson(_loadJson('room_open_hours.json'));
      final payload = rules.toSavePayload();

      expect(payload.keys, unorderedEquals(<String>['days', 'blackouts']));
      expect(payload['days'], hasLength(7));
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
