import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';

import '../../app/theme/theme.dart';
import '../models/models.dart';
import 'badges.dart';
import 'chips.dart';

/// The one listing card (DESIGN_SYSTEM §8.5) — list rows AND map popups use
/// this; a feature-local variant is a review defect (MOBILE_CONTRACTS §9).
///
/// Anatomy: 4:3 photo (CDN thumb variant, decode sized to layout), FREE/price
/// badge top-left, room name, venue + suburb, capacity, tag chips (max 3 +
/// "+n"). One tap target with one semantic label.
class ListingCard extends StatelessWidget {
  const ListingCard({required this.summary, this.onTap, super.key});

  final RoomSummary summary;
  final VoidCallback? onTap;

  static const _maxTags = 3;

  @override
  Widget build(BuildContext context) {
    final colors = context.steepleColors;
    final tags = summary.activities.map(wireTokenLabel).toList();
    final overflowCount = tags.length - _maxTags;
    final rating = summary.rating;

    final semanticLabel = [
      summary.roomName,
      summary.venueName,
      summary.isFree ? 'free' : 'paid',
      'seats ${summary.capacity}',
    ].join(', ');

    return Semantics(
      label: semanticLabel,
      button: onTap != null,
      child: DecoratedBox(
        decoration: BoxDecoration(
          color: colors.surfaceRaised,
          borderRadius: BorderRadius.circular(SteepleTokens.radiusMd),
          border: Border.all(color: colors.border),
          boxShadow: colors.elevation1,
        ),
        child: Material(
          type: MaterialType.transparency,
          child: InkWell(
            borderRadius: BorderRadius.circular(SteepleTokens.radiusMd),
            onTap: onTap,
            child: ExcludeSemantics(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Stack(
                    children: [
                      ClipRRect(
                        borderRadius: const BorderRadius.vertical(
                          top: Radius.circular(SteepleTokens.radiusMd),
                        ),
                        child: AspectRatio(
                          aspectRatio: 4 / 3,
                          child: _ListingPhoto(summary: summary),
                        ),
                      ),
                      Positioned(
                        top: SteepleTokens.space3,
                        left: SteepleTokens.space3,
                        child: summary.isFree
                            ? const FreeBadge()
                            : PriceBadge(
                                price: summary.pricePerHour ?? 0,
                                currency: summary.currency,
                              ),
                      ),
                    ],
                  ),
                  Padding(
                    padding: const EdgeInsets.all(SteepleTokens.space4),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          summary.roomName,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: SteepleTypography.title.copyWith(color: colors.textPrimary),
                        ),
                        const SizedBox(height: SteepleTokens.space1),
                        Text(
                          '${summary.venueName} · ${summary.suburb}',
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style:
                              SteepleTypography.bodySm.copyWith(color: colors.textSecondary),
                        ),
                        if (rating != null) ...[
                          const SizedBox(height: SteepleTokens.space1),
                          Text(
                            '★ ${rating.averageStars.toStringAsFixed(1)} (${rating.count})',
                            style: SteepleTypography.bodySm.copyWith(
                              color: colors.accent,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        ],
                        const SizedBox(height: SteepleTokens.space1),
                        Text.rich(
                          TextSpan(
                            text: 'Up to ',
                            children: [
                              TextSpan(
                                text: '${summary.capacity}',
                                style: const TextStyle(fontWeight: FontWeight.w600),
                              ),
                            ],
                          ),
                          style:
                              SteepleTypography.bodySm.copyWith(color: colors.textSecondary),
                        ),
                        if (tags.isNotEmpty) ...[
                          const SizedBox(height: SteepleTokens.space3),
                          Wrap(
                            spacing: SteepleTokens.space2,
                            runSpacing: SteepleTokens.space1,
                            children: [
                              for (final tag in tags.take(_maxTags)) TagChip(label: tag),
                              if (overflowCount > 0)
                                TagChip(label: '+$overflowCount', overflow: true),
                            ],
                          ),
                        ],
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// Photo with the brand placeholder: sage-tint→paper-deep gradient behind a
/// serif initial (§8.5) — shown while loading and when a listing has no photo.
class _ListingPhoto extends StatelessWidget {
  const _ListingPhoto({required this.summary});

  final RoomSummary summary;

  @override
  Widget build(BuildContext context) {
    final url = summary.primaryPhotoUrl;
    if (url == null || url.isEmpty) return _placeholder(context);
    return LayoutBuilder(
      builder: (context, constraints) => CachedNetworkImage(
        imageUrl: url,
        fit: BoxFit.cover,
        // Decode at layout size so decode cost matches pixels on screen
        // (MOBILE_DESIGN §4 rule 2).
        memCacheWidth: constraints.maxWidth.isFinite
            ? (constraints.maxWidth * MediaQuery.devicePixelRatioOf(context)).round()
            : null,
        placeholder: (context, _) => _placeholder(context),
        errorWidget: (context, _, _) => _placeholder(context),
      ),
    );
  }

  Widget _placeholder(BuildContext context) {
    final colors = context.steepleColors;
    final initial = summary.roomName.isEmpty ? '·' : summary.roomName[0].toUpperCase();
    return DecoratedBox(
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [colors.selectedBg, colors.surface],
        ),
      ),
      child: Center(
        child: Text(
          initial,
          style: SteepleTypography.displaySerif.copyWith(
            color: colors.selectedFg.withValues(alpha: 0.55),
            fontSize: 44,
          ),
        ),
      ),
    );
  }
}
