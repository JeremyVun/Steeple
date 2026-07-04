import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';

import '../../../app/theme/theme.dart';

/// The four pre-rasterized map-pin bitmaps (DESIGN_SYSTEM §8.6): teardrop
/// 30×38, paper stroke 2.5, white center dot; free = sage, paid = terracotta;
/// selected = 1.15 scale + ink stroke. One bitmap per state, never
/// per-marker widget renders (MOBILE_DESIGN §4 rule 3). Pin colors are frozen
/// by the design system so this set stays small.
class PinBitmaps {
  PinBitmaps._(this.free, this.paid, this.freeSelected, this.paidSelected);

  final BitmapDescriptor free;
  final BitmapDescriptor paid;
  final BitmapDescriptor freeSelected;
  final BitmapDescriptor paidSelected;

  BitmapDescriptor of({required bool isFree, required bool selected}) => isFree
      ? (selected ? freeSelected : free)
      : (selected ? paidSelected : paid);

  static Future<PinBitmaps> rasterize(BuildContext context) async {
    final colors = context.steepleColors;
    final ratio = MediaQuery.devicePixelRatioOf(context);
    // Light-mode paper reads as the stroke on the map regardless of app theme
    // (the map canvas itself is light); ink stroke marks selection.
    const paper = SteepleTokens.paperLight;
    const ink = SteepleTokens.inkLight;

    Future<BitmapDescriptor> draw(Color fill, {required bool selected}) async {
      const baseW = 30.0, baseH = 38.0;
      final scale = (selected ? 1.15 : 1.0) * ratio;
      final w = baseW * scale, h = baseH * scale;
      final recorder = ui.PictureRecorder();
      final canvas = Canvas(recorder)..scale(scale);

      // Teardrop: circle head + tapered tail via a path.
      final path = Path()
        ..moveTo(baseW / 2, baseH - 1.5)
        ..quadraticBezierTo(6, baseH - 14, 3.2, baseH - 22.5)
        ..arcToPoint(
          const Offset(baseW - 3.2, baseH - 22.5),
          radius: const Radius.circular(11.8),
          largeArc: true,
        )
        ..quadraticBezierTo(baseW - 6, baseH - 14, baseW / 2, baseH - 1.5)
        ..close();

      canvas.drawPath(path, Paint()..color = fill);
      canvas.drawPath(
        path,
        Paint()
          ..style = PaintingStyle.stroke
          ..strokeWidth = 2.5
          ..color = selected ? ink : paper,
      );
      canvas.drawCircle(
        const Offset(baseW / 2, baseH - 23.5),
        4.2,
        Paint()..color = Colors.white,
      );

      final image = await recorder.endRecording().toImage(w.ceil(), h.ceil());
      final bytes = await image.toByteData(format: ui.ImageByteFormat.png);
      return BitmapDescriptor.bytes(
        bytes!.buffer.asUint8List(),
        imagePixelRatio: ratio,
      );
    }

    final free = await draw(colors.selectedFill, selected: false);
    final paid = await draw(colors.accent, selected: false);
    final freeSelected = await draw(colors.selectedFill, selected: true);
    final paidSelected = await draw(colors.accent, selected: true);
    return PinBitmaps._(free, paid, freeSelected, paidSelected);
  }
}
