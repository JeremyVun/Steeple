import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../app/theme/theme.dart';
import '../../../core/api/app_error.dart';
import '../../../core/models/models.dart';
import '../../../core/utils/dates.dart';
import '../../../core/widgets/widgets.dart';
import '../application/manage_request_providers.dart';

/// A provider's view of one application, with approve/decline actions
/// (MOBILE_CONTRACTS §7 `manageRequest` route). Mirrors the confirm-dialog →
/// notifier → snackbar-on-error idiom of `ApplicationThreadScreen.withdraw`.
class ManageRequestScreen extends ConsumerStatefulWidget {
  const ManageRequestScreen({required this.applicationId, super.key});

  final String applicationId;

  @override
  ConsumerState<ManageRequestScreen> createState() => _ManageRequestScreenState();
}

class _ManageRequestScreenState extends ConsumerState<ManageRequestScreen> {
  final _messageController = TextEditingController();
  bool _deciding = false;

  @override
  void dispose() {
    _messageController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(manageRequestProvider(widget.applicationId));

    return Scaffold(
      appBar: AppBar(title: Text(state.value?.roomName ?? 'Request')),
      body: AsyncValueView(
        value: state,
        skeleton: () => const Skeleton(child: _RequestSkeleton()),
        onRetry: () => ref.read(manageRequestProvider(widget.applicationId).notifier).refresh(),
        data: _buildDetail,
      ),
    );
  }

  Widget _buildDetail(Application application) {
    final colors = context.steepleColors;
    final actionable = application.statusValue == ApplicationStatus.pending ||
        application.statusValue == ApplicationStatus.needsInfo;

    return ListView(
      padding: const EdgeInsets.all(SteepleTokens.gutter),
      children: [
        Card(
          child: Padding(
            padding: const EdgeInsets.all(SteepleTokens.space4),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  application.roomName,
                  style: SteepleTypography.headlineSerif.copyWith(color: colors.textPrimary),
                ),
                const SizedBox(height: SteepleTokens.space1),
                Text(
                  application.venueName,
                  style: SteepleTypography.bodySm.copyWith(color: colors.textSecondary),
                ),
                const SizedBox(height: SteepleTokens.space3),
                StatusChip(statusRaw: application.status, domain: StatusDomain.application),
                const SizedBox(height: SteepleTokens.space3),
                Text(
                  scheduleSummary(application.schedule),
                  style: SteepleTypography.bodySm.copyWith(color: colors.textPrimary),
                ),
                const SizedBox(height: SteepleTokens.space1),
                Text(
                  '${application.organizer.displayName} · Group of ${application.groupSize} · '
                  '${wireTokenLabel(application.activityType)}',
                  style: SteepleTypography.bodySm.copyWith(color: colors.textSecondary),
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: SteepleTokens.space6),
        Text(
          'Their request',
          style: SteepleTypography.title.copyWith(color: colors.textPrimary),
        ),
        const SizedBox(height: SteepleTokens.space2),
        Text(
          application.intentText,
          style: SteepleTypography.bodySm.copyWith(color: colors.textPrimary),
        ),
        if (actionable) ...[
          const SizedBox(height: SteepleTokens.space6),
          Text(
            'Message (optional)',
            style: SteepleTypography.title.copyWith(color: colors.textPrimary),
          ),
          const SizedBox(height: SteepleTokens.space2),
          TextField(
            controller: _messageController,
            minLines: 2,
            maxLines: 4,
            decoration: const InputDecoration(
              hintText: "Add a note for the organizer — sent either way.",
            ),
          ),
          const SizedBox(height: SteepleTokens.space5),
          Row(
            children: [
              Expanded(
                child: OutlinedButton(
                  onPressed: _deciding ? null : () => _confirmDecide(approve: false),
                  style: OutlinedButton.styleFrom(foregroundColor: colors.danger.fg),
                  child: const Text('Decline'),
                ),
              ),
              const SizedBox(width: SteepleTokens.space3),
              Expanded(
                child: FilledButton(
                  onPressed: _deciding ? null : () => _confirmDecide(approve: true),
                  child: _deciding
                      ? SizedBox(
                          width: 20,
                          height: 20,
                          child: CircularProgressIndicator(
                            strokeWidth: 2,
                            color: Theme.of(context).colorScheme.onPrimary,
                          ),
                        )
                      : const Text('Approve'),
                ),
              ),
            ],
          ),
        ],
      ],
    );
  }

  Future<void> _confirmDecide({required bool approve}) async {
    final colors = context.steepleColors;
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(approve ? 'Approve this application?' : 'Decline this application?'),
        content: Text(
          approve
              ? "This creates a booking and lets the organizer know they're confirmed."
              : "The organizer will be told this request wasn't approved.",
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Not yet'),
          ),
          FilledButton(
            style: FilledButton.styleFrom(
              backgroundColor: approve ? colors.actionPrimary : colors.danger.fg,
              foregroundColor: Theme.of(context).colorScheme.onPrimary,
            ),
            onPressed: () => Navigator.pop(context, true),
            child: Text(approve ? 'Approve' : 'Decline'),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;

    setState(() => _deciding = true);
    final message = _messageController.text.trim();
    try {
      final updated = await ref
          .read(manageRequestProvider(widget.applicationId).notifier)
          .decide(approve: approve, message: message.isEmpty ? null : message);
      if (!mounted) return;
      final autoDeclined = approve && updated.statusValue != ApplicationStatus.approved;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            autoDeclined
                ? 'That time slot was just booked elsewhere — this application was '
                    'automatically declined instead.'
                : approve
                    ? 'Application approved.'
                    : 'Application declined.',
          ),
        ),
      );
    } catch (e) {
      if (!mounted) return;
      final appError = e is AppError ? e : null;
      final text = appError?.code == 'slot_taken'
          ? 'That time slot was just booked elsewhere — refresh to see the latest.'
          : "Couldn't record your decision. Try again in a moment.";
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(text)));
    } finally {
      if (mounted) setState(() => _deciding = false);
    }
  }
}

class _RequestSkeleton extends StatelessWidget {
  const _RequestSkeleton();

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(SteepleTokens.gutter),
      children: const [
        SkeletonBlock(width: 200, height: 22),
        SizedBox(height: SteepleTokens.space2),
        SkeletonBlock(width: 150),
        SizedBox(height: SteepleTokens.space4),
        SkeletonBlock(width: 90, height: 24, radius: SteepleTokens.radiusPill),
        SizedBox(height: SteepleTokens.space6),
        SkeletonBlock(width: double.infinity, height: 56),
      ],
    );
  }
}
