import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../app/theme/theme.dart';
import '../../../core/api/app_error.dart';
import '../../../core/models/models.dart';
import '../../../core/navigation/route_names.dart';
import '../../../core/utils/dates.dart';
import '../../../core/widgets/widgets.dart';
import '../application/application_thread_providers.dart';
import 'widgets/counter_offer_card.dart';

/// The application ask/answer thread (MOBILE_CONTRACTS §7
/// `applicationThread` route; push deep-link target). Reads through a local
/// family notifier over the apply feature's `applicationsRepositoryProvider`.
class ApplicationThreadScreen extends ConsumerStatefulWidget {
  const ApplicationThreadScreen({required this.applicationId, super.key});

  final String applicationId;

  @override
  ConsumerState<ApplicationThreadScreen> createState() =>
      _ApplicationThreadScreenState();
}

class _ApplicationThreadScreenState extends ConsumerState<ApplicationThreadScreen> {
  final _messageController = TextEditingController();
  bool _sending = false;
  bool _respondingToCounter = false;

  @override
  void dispose() {
    _messageController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(applicationThreadProvider(widget.applicationId));

    return Scaffold(
      appBar: AppBar(title: Text(state.value?.roomName ?? 'Application')),
      body: AsyncValueView(
        value: state,
        skeleton: () => const Skeleton(child: _ThreadSkeleton()),
        onRetry: () =>
            ref.read(applicationThreadProvider(widget.applicationId).notifier).refresh(),
        data: _buildThread,
      ),
    );
  }

  Widget _buildThread(Application application) {
    final colors = context.steepleColors;
    final canWithdraw = application.statusValue == ApplicationStatus.pending ||
        application.statusValue == ApplicationStatus.needsInfo ||
        application.statusValue == ApplicationStatus.counterOffered;
    final bookingId = application.bookingId;
    final counter = application.counterOffer;
    final counterOpen = application.statusValue == ApplicationStatus.counterOffered &&
        counter != null &&
        counter.isOpen;

    return Column(
      children: [
        Expanded(
          child: ListView(
            padding: const EdgeInsets.all(SteepleTokens.gutter),
            children: [
              _HeaderCard(application: application),
              if (counterOpen) ...[
                const SizedBox(height: SteepleTokens.space4),
                CounterOfferCard(
                  requested: application.schedule,
                  offer: counter,
                  busy: _respondingToCounter,
                  onAccept: _confirmAcceptCounter,
                  onDecline: _declineCounter,
                ),
              ] else if (counter != null && !counter.isOpen) ...[
                const SizedBox(height: SteepleTokens.space4),
                _CounterNote(offer: counter),
              ],
              if (application.statusValue == ApplicationStatus.approved &&
                  bookingId != null) ...[
                const SizedBox(height: SteepleTokens.space4),
                _ApprovedBanner(bookingId: bookingId),
              ],
              const SizedBox(height: SteepleTokens.space6),
              Text(
                'Messages',
                style: SteepleTypography.title.copyWith(color: colors.textPrimary),
              ),
              const SizedBox(height: SteepleTokens.space3),
              for (final message in application.messages) ...[
                _MessageBubble(
                  message: message,
                  fromOrganizer: message.senderId == application.organizer.id,
                ),
                const SizedBox(height: SteepleTokens.space2),
              ],
              if (canWithdraw) ...[
                const SizedBox(height: SteepleTokens.space4),
                Center(
                  child: TextButton(
                    onPressed: _confirmWithdraw,
                    style: TextButton.styleFrom(foregroundColor: colors.danger.fg),
                    child: const Text('Withdraw application'),
                  ),
                ),
              ],
            ],
          ),
        ),
        SafeArea(
          top: false,
          child: Padding(
            padding: const EdgeInsets.symmetric(
              horizontal: SteepleTokens.space3,
              vertical: SteepleTokens.space2,
            ),
            child: Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: _messageController,
                    minLines: 1,
                    maxLines: 4,
                    decoration: const InputDecoration(hintText: 'Write a reply'),
                  ),
                ),
                const SizedBox(width: SteepleTokens.space2),
                IconButton(
                  onPressed: _sending ? null : _send,
                  tooltip: 'Send',
                  icon: _sending
                      ? const SizedBox(
                          width: 20,
                          height: 20,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Icon(Icons.send_rounded),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }

  Future<void> _send() async {
    final body = _messageController.text.trim();
    if (body.isEmpty) return;
    setState(() => _sending = true);
    try {
      await ref.read(applicationThreadProvider(widget.applicationId).notifier).sendMessage(body);
      _messageController.clear();
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text("Couldn't send your message. Check your connection and try again."),
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  Future<void> _confirmAcceptCounter() async {
    final application = ref.read(applicationThreadProvider(widget.applicationId)).value;
    final offer = application?.counterOffer;
    if (offer == null) return;
    final offered = scheduleSummary(offer.schedule);
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Accept this time?'),
        content: Text('This books $offered; your original ask goes away.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Not yet'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Accept'),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;
    await _respondToCounter(accept: true);
  }

  Future<void> _declineCounter() => _respondToCounter(accept: false);

  Future<void> _respondToCounter({required bool accept}) async {
    setState(() => _respondingToCounter = true);
    try {
      final updated = await ref
          .read(applicationThreadProvider(widget.applicationId).notifier)
          .respondToCounter(accept: accept);
      if (!mounted) return;
      final message = accept
          ? updated.statusValue == ApplicationStatus.approved
              ? "You're booked — see you then."
              : 'That time was just booked elsewhere, so this went back to the church.'
          : 'Declined — your original request is back with the church.';
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message)));
    } catch (e) {
      if (!mounted) return;
      final code = e is AppError ? e.code : null;
      final text = switch (code) {
        'slot_taken' =>
          'That time was just booked elsewhere — refresh to see the latest.',
        'invalid_state' =>
          "This suggestion isn't open anymore — refresh to see the latest.",
        _ => "Couldn't send your response. Try again in a moment.",
      };
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(text)));
    } finally {
      if (mounted) setState(() => _respondingToCounter = false);
    }
  }

  Future<void> _confirmWithdraw() async {
    final colors = context.steepleColors;
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Withdraw application?'),
        content: const Text(
          "The church won't see this application anymore. You can't undo this.",
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Keep application'),
          ),
          FilledButton(
            style: FilledButton.styleFrom(
              backgroundColor: colors.danger.fg,
              foregroundColor: Colors.white,
            ),
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Withdraw'),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;
    try {
      await ref.read(applicationThreadProvider(widget.applicationId).notifier).withdraw();
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text("Couldn't withdraw your application. Try again in a moment."),
          ),
        );
      }
    }
  }
}

class _HeaderCard extends StatelessWidget {
  const _HeaderCard({required this.application});

  final Application application;

  @override
  Widget build(BuildContext context) {
    final colors = context.steepleColors;
    return Card(
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
              'Group of ${application.groupSize} · ${wireTokenLabel(application.activityType)}',
              style: SteepleTypography.bodySm.copyWith(color: colors.textSecondary),
            ),
          ],
        ),
      ),
    );
  }
}

/// A muted note for a counter that is no longer open — the organizer already
/// responded, or it lapsed/was superseded (CONTRACTS §5).
class _CounterNote extends StatelessWidget {
  const _CounterNote({required this.offer});

  final CounterOffer offer;

  @override
  Widget build(BuildContext context) {
    final colors = context.steepleColors;
    final text = switch (offer.statusValue) {
      CounterOfferStatus.accepted =>
        'You accepted the church’s suggested time (${scheduleSummary(offer.schedule)}).',
      CounterOfferStatus.declinedByOrganizer =>
        'You declined the church’s suggested time; your original request is back with them.',
      CounterOfferStatus.superseded =>
        'The church replaced an earlier suggested time.',
      CounterOfferStatus.lapsed =>
        'The church’s suggested time is no longer available.',
      _ => 'The church suggested ${scheduleSummary(offer.schedule)}.',
    };
    return Container(
      padding: const EdgeInsets.all(SteepleTokens.space3),
      decoration: BoxDecoration(
        color: colors.surfaceRaised,
        borderRadius: BorderRadius.circular(SteepleTokens.radiusMd),
        border: Border.all(color: colors.border),
      ),
      child: Row(
        children: [
          Icon(Icons.schedule_rounded, color: colors.textTertiary, size: 18),
          const SizedBox(width: SteepleTokens.space2),
          Expanded(
            child: Text(
              text,
              style: SteepleTypography.caption.copyWith(color: colors.textSecondary),
            ),
          ),
        ],
      ),
    );
  }
}

class _ApprovedBanner extends StatelessWidget {
  const _ApprovedBanner({required this.bookingId});

  final String bookingId;

  @override
  Widget build(BuildContext context) {
    final colors = context.steepleColors;
    return Container(
      padding: const EdgeInsets.all(SteepleTokens.space4),
      decoration: BoxDecoration(
        color: colors.success.bg,
        borderRadius: BorderRadius.circular(SteepleTokens.radiusMd),
      ),
      child: Row(
        children: [
          Icon(Icons.check_circle_rounded, color: colors.success.fg),
          const SizedBox(width: SteepleTokens.space3),
          Expanded(
            child: Text(
              'This application was approved.',
              style: SteepleTypography.bodySm.copyWith(color: colors.success.fg),
            ),
          ),
          TextButton(
            onPressed: () =>
                context.goNamed(RouteNames.bookingDetail, pathParameters: {'id': bookingId}),
            child: const Text('View booking'),
          ),
        ],
      ),
    );
  }
}

class _MessageBubble extends StatelessWidget {
  const _MessageBubble({required this.message, required this.fromOrganizer});

  final ApplicationMessage message;
  final bool fromOrganizer;

  @override
  Widget build(BuildContext context) {
    final colors = context.steepleColors;
    final bubbleColor = fromOrganizer ? colors.selectedBg : colors.surfaceRaised;

    return Row(
      mainAxisAlignment: fromOrganizer ? MainAxisAlignment.end : MainAxisAlignment.start,
      children: [
        Flexible(
          child: Column(
            crossAxisAlignment:
                fromOrganizer ? CrossAxisAlignment.end : CrossAxisAlignment.start,
            children: [
              Container(
                padding: const EdgeInsets.all(SteepleTokens.space3),
                decoration: BoxDecoration(
                  color: bubbleColor,
                  borderRadius: BorderRadius.circular(SteepleTokens.radiusMd),
                  border: fromOrganizer ? null : Border.all(color: colors.border),
                ),
                child: Text(
                  message.body,
                  style: SteepleTypography.bodySm.copyWith(color: colors.textPrimary),
                ),
              ),
              const SizedBox(height: SteepleTokens.space1),
              Text(
                relativeStamp(message.sentAtUtc),
                style: SteepleTypography.caption.copyWith(color: colors.textTertiary),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _ThreadSkeleton extends StatelessWidget {
  const _ThreadSkeleton();

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
        SizedBox(height: SteepleTokens.space3),
        SkeletonBlock(width: double.infinity, height: 56),
      ],
    );
  }
}
