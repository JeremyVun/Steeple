import 'package:flutter/material.dart';

import '../../../../app/theme/theme.dart';
import '../../../../core/models/models.dart';
import '../../../../core/utils/dates.dart';

/// The organizer's counter-offer card (CONTRACTS §5; DESIGN_SYSTEM §8.4
/// `counterOffered` → info "Time suggested"). Shown at the top of the
/// application thread while a counter is open: the church's suggested schedule
/// against the original ask (offered emphasized, requested muted), the manager's
/// note quoted, and Accept / Decline actions. Presentational — the screen owns
/// the confirm dialog, error snackbars and busy state.
class CounterOfferCard extends StatelessWidget {
  const CounterOfferCard({
    required this.requested,
    required this.offer,
    this.onAccept,
    this.onDecline,
    this.busy = false,
    super.key,
  });

  /// The organizer's original ask (`Application.schedule`).
  final ProposedSchedule requested;

  /// The open counter (`Application.counterOffer`).
  final CounterOffer offer;

  final VoidCallback? onAccept;
  final VoidCallback? onDecline;
  final bool busy;

  @override
  Widget build(BuildContext context) {
    final colors = context.steepleColors;
    final message = offer.message?.trim();

    return Container(
      padding: const EdgeInsets.all(SteepleTokens.space4),
      decoration: BoxDecoration(
        color: colors.info.bg,
        borderRadius: BorderRadius.circular(SteepleTokens.radiusMd),
        border: Border.all(color: colors.info.fg.withValues(alpha: 0.3)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(Icons.schedule_rounded, color: colors.info.fg, size: 20),
              const SizedBox(width: SteepleTokens.space2),
              Expanded(
                child: Text(
                  'The church suggested a different time',
                  style: SteepleTypography.title.copyWith(color: colors.info.fg),
                ),
              ),
            ],
          ),
          const SizedBox(height: SteepleTokens.space3),
          _DiffRow(
            label: 'You asked',
            value: scheduleSummary(requested),
            emphasized: false,
          ),
          const SizedBox(height: SteepleTokens.space2),
          _DiffRow(
            label: 'They suggest',
            value: scheduleSummary(offer.schedule),
            emphasized: true,
          ),
          if (message != null && message.isNotEmpty) ...[
            const SizedBox(height: SteepleTokens.space3),
            Container(
              padding: const EdgeInsets.only(left: SteepleTokens.space3),
              decoration: BoxDecoration(
                border: Border(left: BorderSide(color: colors.info.fg, width: 2)),
              ),
              child: Text(
                message,
                style: SteepleTypography.bodySm.copyWith(
                  color: colors.textSecondary,
                  fontStyle: FontStyle.italic,
                ),
              ),
            ),
          ],
          const SizedBox(height: SteepleTokens.space4),
          Row(
            children: [
              Expanded(
                child: OutlinedButton(
                  onPressed: busy ? null : onDecline,
                  child: const Text('Decline'),
                ),
              ),
              const SizedBox(width: SteepleTokens.space3),
              Expanded(
                child: FilledButton(
                  onPressed: busy ? null : onAccept,
                  child: busy
                      ? SizedBox(
                          width: 20,
                          height: 20,
                          child: CircularProgressIndicator(
                            strokeWidth: 2,
                            color: Theme.of(context).colorScheme.onPrimary,
                          ),
                        )
                      : const Text('Accept'),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _DiffRow extends StatelessWidget {
  const _DiffRow({
    required this.label,
    required this.value,
    required this.emphasized,
  });

  final String label;
  final String value;
  final bool emphasized;

  @override
  Widget build(BuildContext context) {
    final colors = context.steepleColors;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label.toUpperCase(),
          style: SteepleTypography.label.copyWith(color: colors.textTertiary),
        ),
        const SizedBox(height: SteepleTokens.space1),
        Text(
          value,
          style: emphasized
              ? SteepleTypography.title.copyWith(color: colors.textPrimary)
              : SteepleTypography.bodySm.copyWith(color: colors.textSecondary),
        ),
      ],
    );
  }
}
