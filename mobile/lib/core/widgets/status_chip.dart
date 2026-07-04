import 'package:flutter/material.dart';

import '../../app/theme/theme.dart';
import '../models/wire_tokens.dart';

/// Which status family a wire token belongs to (the same token can mean
/// different things per domain — `cancelled` is danger on a booking but
/// neutral on an occurrence).
enum StatusDomain { application, booking, occurrence, room }

/// The one status chip (DESIGN_SYSTEM §8.4): tint background + role fg,
/// bodySm 600 label. Unknown tokens → neutral + humanized raw token, so a
/// new server status renders instead of crashing (CONTRACTS §1.1).
class StatusChip extends StatelessWidget {
  const StatusChip({required this.statusRaw, required this.domain, super.key});

  final String statusRaw;
  final StatusDomain domain;

  @override
  Widget build(BuildContext context) {
    final colors = context.steepleColors;
    final (role, label) = _map(colors);
    return Semantics(
      label: 'Status: $label',
      child: Container(
        padding: const EdgeInsets.symmetric(
          horizontal: SteepleTokens.space3,
          vertical: SteepleTokens.space1,
        ),
        decoration: BoxDecoration(
          color: role.bg,
          borderRadius: BorderRadius.circular(SteepleTokens.radiusPill),
        ),
        child: Text(
          label,
          style: SteepleTypography.bodySm.copyWith(color: role.fg, fontWeight: FontWeight.w600),
        ),
      ),
    );
  }

  (StatusColors, String) _map(SteepleColors c) {
    final byDomain = switch (domain) {
      StatusDomain.application => switch (statusRaw) {
          'pending' => (c.warning, 'Pending'),
          'needsInfo' => (c.info, 'Needs info'),
          'approved' => (c.success, 'Approved'),
          'declined' => (c.danger, 'Declined'),
          'withdrawn' => (c.neutral, 'Withdrawn'),
          'expired' => (c.neutral, 'Expired'),
          _ => null,
        },
      StatusDomain.booking => switch (statusRaw) {
          'confirmed' => (c.success, 'Confirmed'),
          'completed' => (c.neutral, 'Completed'),
          'cancelled' => (c.danger, 'Cancelled'),
          _ => null,
        },
      StatusDomain.occurrence => switch (statusRaw) {
          'scheduled' => (c.info, 'Scheduled'),
          'occurred' => (c.neutral, 'Went ahead'),
          'noShow' => (c.danger, 'No-show'),
          'cancelled' => (c.neutral, 'Cancelled'),
          _ => null,
        },
      // Manage surface (Phase 5): a room's own publish state. `draft` awaiting
      // a publish request reads as "In review" here — publishRequestedAtUtc
      // itself isn't a wire enum, so callers that need that distinction
      // render it alongside this chip rather than through it.
      StatusDomain.room => switch (statusRaw) {
          'draft' => (c.neutral, 'Draft'),
          'published' => (c.success, 'Published'),
          'unlisted' => (c.neutral, 'Unlisted'),
          _ => null,
        },
    };
    return byDomain ?? (c.neutral, humanizeWireToken(statusRaw));
  }
}
