import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';

import '../../../app/theme/theme.dart';
import '../../../core/analytics/analytics_service.dart';
import '../../../core/models/models.dart';
import '../../../core/navigation/route_names.dart';
import '../../../core/widgets/widgets.dart';
import '../providers.dart';
import 'pin_bitmaps.dart';

/// Beachhead fallback camera (Vienna, VA) until the geofence/search response
/// supplies a center.
const _fallbackCamera = CameraPosition(target: LatLng(38.9007, -77.2653), zoom: 13);

/// Map half of Explore: search-as-region-settles (debounce lives in the
/// results provider), pre-rasterized pins, selected pin → [ListingCard]
/// popup — the same one card as the list (MOBILE_CONTRACTS §9).
class DiscoveryMapView extends ConsumerStatefulWidget {
  const DiscoveryMapView({super.key});

  @override
  ConsumerState<DiscoveryMapView> createState() => _DiscoveryMapViewState();
}

class _DiscoveryMapViewState extends ConsumerState<DiscoveryMapView> {
  GoogleMapController? _controller;
  PinBitmaps? _pins;
  RoomSummary? _selected;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_pins == null) {
      PinBitmaps.rasterize(context).then((pins) {
        if (mounted) setState(() => _pins = pins);
      });
    }
  }

  Future<void> _onCameraIdle() async {
    final controller = _controller;
    if (controller == null) return;
    final region = await controller.getVisibleRegion();
    ref.read(mapRegionProvider.notifier).settle(
          BoundingBox(
            minLat: region.southwest.latitude,
            maxLat: region.northeast.latitude,
            minLng: region.southwest.longitude,
            maxLng: region.northeast.longitude,
          ),
        );
    ref.read(analyticsProvider).track(AnalyticsEvents.mapInteracted, {'kind': 'pan'});
  }

  @override
  Widget build(BuildContext context) {
    final results = ref.watch(searchResultsProvider).value;
    final pins = _pins;
    final rooms = results?.items ?? const <RoomSummary>[];

    final markers = <Marker>{
      if (pins != null)
        for (final room in rooms)
          Marker(
            markerId: MarkerId(room.roomId),
            position: LatLng(room.latitude, room.longitude),
            icon: pins.of(isFree: room.isFree, selected: room.roomId == _selected?.roomId),
            anchor: const Offset(0.5, 1),
            onTap: () {
              ref
                  .read(analyticsProvider)
                  .track(AnalyticsEvents.mapInteracted, {'kind': 'pin'});
              setState(() => _selected = room);
            },
          ),
    };

    final selected = _selected;
    return Stack(
      children: [
        GoogleMap(
          initialCameraPosition: _fallbackCamera,
          markers: markers,
          onMapCreated: (controller) => _controller = controller,
          onCameraIdle: _onCameraIdle,
          onTap: (_) => setState(() => _selected = null),
          myLocationButtonEnabled: false,
          mapToolbarEnabled: false,
          zoomControlsEnabled: false,
        ),
        if (selected != null)
          Positioned(
            left: SteepleTokens.gutter,
            right: SteepleTokens.gutter,
            bottom: SteepleTokens.gutter,
            child: AnimatedSwitcher(
              duration: SteepleTokens.durBase,
              child: ListingCard(
                key: ValueKey(selected.roomId),
                summary: selected,
                onTap: () => context.goNamed(
                  RouteNames.listing,
                  pathParameters: {
                    'venueSlug': selected.venueSlug,
                    'roomSlug': selected.roomSlug,
                  },
                ),
              ),
            ),
          ),
      ],
    );
  }
}
