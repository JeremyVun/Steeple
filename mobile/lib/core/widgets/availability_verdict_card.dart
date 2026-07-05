import 'package:flutter/material.dart';

import '../../app/theme/theme.dart';
import '../models/models.dart';
import '../utils/dates.dart';

/// The one shared availability/conflict verdict card (DESIGN_SYSTEM §8.13),
/// used by the apply live check, the submit-time `409 schedule_unavailable`
/// re-render, and the host-review conflict verdict (CONTRACTS §6) alike.
/// Advisory language only — approval and the DB exclusion constraint are the
/// authority; this always renders exactly what the server returned.
/// [hardBlock] forces the `danger` treatment + next-action line for the submit
/// block regardless of the partial/full split. [pendingOverlaps] adds the
/// host-review "K other pending requests overlap" section (empty elsewhere);
/// each row taps through via [onTapOverlap] when supplied.
class AvailabilityVerdictCard extends StatefulWidget {
  const AvailabilityVerdictCard({
    required this.result,
    this.hardBlock = false,
    this.pendingOverlaps = const [],
    this.onTapOverlap,
    super.key,
  });

  final ScheduleCheckResult result;
  final bool hardBlock;
  final List<PendingOverlap> pendingOverlaps;
  final void Function(String applicationId)? onTapOverlap;

  @override
  State<AvailabilityVerdictCard> createState() => _AvailabilityVerdictCardState();
}

class _AvailabilityVerdictCardState extends State<AvailabilityVerdictCard> {
  bool _expanded = false;

  static String _reasonLabel(String reason) => switch (reason) {
        'outsideOpenHours' => 'outside open hours',
        'blackout' => 'closed that day',
        'booked' => 'already booked',
        _ => wireTokenLabel(reason),
      };

  @override
  Widget build(BuildContext context) {
    final colors = context.steepleColors;
    final result = widget.result;
    final total = result.totalOccurrences;
    final clashes = result.conflicts.length;

    final _Tier tier;
    if (result.available) {
      tier = _Tier.clear;
    } else if (widget.hardBlock || clashes >= total) {
      tier = _Tier.blocked;
    } else {
      tier = _Tier.partial;
    }

    final pair = switch (tier) {
      _Tier.clear => colors.success,
      _Tier.partial => colors.warning,
      _Tier.blocked => colors.danger,
    };
    final (icon, headline) = switch (tier) {
      _Tier.clear => (
          Icons.check_circle_rounded,
          'All $total ${_dates(total)} are free.',
        ),
      _Tier.partial || _Tier.blocked => (
          Icons.error_rounded,
          '$clashes of $total ${_dates(total)} clash',
        ),
    };

    return Container(
      padding: const EdgeInsets.all(SteepleTokens.space3),
      decoration: BoxDecoration(
        color: pair.bg,
        borderRadius: BorderRadius.circular(SteepleTokens.radiusMd),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Icon(icon, size: 20, color: pair.fg),
              const SizedBox(width: SteepleTokens.space2),
              Expanded(
                child: Text(
                  headline,
                  style: SteepleTypography.bodySm.copyWith(
                    color: pair.fg,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
            ],
          ),
          if (result.conflicts.isNotEmpty) ...[
            const SizedBox(height: SteepleTokens.space2),
            InkWell(
              onTap: () => setState(() => _expanded = !_expanded),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    _expanded ? 'Hide details' : 'See which dates',
                    style: SteepleTypography.caption.copyWith(
                      color: pair.fg,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  Icon(
                    _expanded ? Icons.expand_less_rounded : Icons.expand_more_rounded,
                    size: 18,
                    color: pair.fg,
                  ),
                ],
              ),
            ),
            if (_expanded) ...[
              const SizedBox(height: SteepleTokens.space1),
              for (final conflict in result.conflicts)
                Padding(
                  padding: const EdgeInsets.only(top: SteepleTokens.space1),
                  child: Text(
                    '${weekdayMonthDay(conflict.date)} — ${_reasonLabel(conflict.reason)}',
                    style: SteepleTypography.caption.copyWith(color: pair.fg),
                  ),
                ),
            ],
          ],
          if (tier == _Tier.blocked) ...[
            const SizedBox(height: SteepleTokens.space2),
            Text(
              'Pick another time — the calendar shows what’s free.',
              style: SteepleTypography.caption.copyWith(color: pair.fg),
            ),
          ],
          if (widget.pendingOverlaps.isNotEmpty) ...[
            const SizedBox(height: SteepleTokens.space3),
            Divider(height: 1, color: pair.fg.withValues(alpha: 0.2)),
            const SizedBox(height: SteepleTokens.space2),
            Text(
              '${widget.pendingOverlaps.length} other pending '
              '${widget.pendingOverlaps.length == 1 ? 'request' : 'requests'} overlap',
              style: SteepleTypography.caption.copyWith(
                color: pair.fg,
                fontWeight: FontWeight.w600,
              ),
            ),
            for (final overlap in widget.pendingOverlaps)
              _OverlapRow(overlap: overlap, color: pair.fg, onTap: widget.onTapOverlap),
          ],
        ],
      ),
    );
  }

  static String _dates(int n) => n == 1 ? 'date' : 'dates';
}

/// One "organizer — N dates" overlap row; a real button when [onTap] routes to
/// that request's detail.
class _OverlapRow extends StatelessWidget {
  const _OverlapRow({required this.overlap, required this.color, this.onTap});

  final PendingOverlap overlap;
  final Color color;
  final void Function(String applicationId)? onTap;

  @override
  Widget build(BuildContext context) {
    final count = overlap.overlappingDateCount;
    final text = '${overlap.organizerName} — $count '
        '${count == 1 ? 'date' : 'dates'}';
    final row = Padding(
      padding: const EdgeInsets.only(top: SteepleTokens.space1),
      child: Row(
        children: [
          Expanded(
            child: Text(
              text,
              style: SteepleTypography.caption.copyWith(color: color),
            ),
          ),
          if (onTap != null)
            Icon(Icons.chevron_right_rounded, size: 16, color: color),
        ],
      ),
    );
    if (onTap == null) return row;
    return Semantics(
      button: true,
      label: 'View request from ${overlap.organizerName}',
      child: InkWell(onTap: () => onTap!(overlap.applicationId), child: row),
    );
  }
}

enum _Tier { clear, partial, blocked }
