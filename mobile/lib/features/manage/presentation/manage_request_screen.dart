import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../app/theme/theme.dart';
import '../../../core/api/app_error.dart';
import '../../../core/models/models.dart';
import '../../../core/navigation/route_names.dart';
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
    final status = application.statusValue;
    final awaitingOrganizer = status == ApplicationStatus.counterOffered;
    final undecided = status == ApplicationStatus.pending ||
        status == ApplicationStatus.needsInfo ||
        awaitingOrganizer;

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
        if (application.conflicts != null) ...[
          const SizedBox(height: SteepleTokens.space5),
          AvailabilityVerdictCard(
            result: application.conflicts!.checkResult,
            pendingOverlaps: application.conflicts!.pendingOverlaps,
            onTapOverlap: (id) => context.pushNamed(
              RouteNames.manageRequest,
              pathParameters: {'id': id},
            ),
          ),
        ],
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
        if (undecided) ...[
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
                  onPressed: (_deciding || awaitingOrganizer)
                      ? null
                      : () => _confirmDecide(approve: true),
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
          if (awaitingOrganizer) ...[
            const SizedBox(height: SteepleTokens.space2),
            Text(
              'Waiting on the organizer to accept or decline your suggested time.',
              style: SteepleTypography.caption.copyWith(color: colors.textTertiary),
            ),
          ],
          const SizedBox(height: SteepleTokens.space3),
          Center(
            child: TextButton.icon(
              onPressed: _deciding ? null : () => _openCounterSheet(application),
              icon: const Icon(Icons.schedule_rounded, size: 18),
              label: Text(awaitingOrganizer ? 'Suggest a different time' : 'Suggest another time'),
            ),
          ),
        ],
      ],
    );
  }

  Future<void> _openCounterSheet(Application application) async {
    final submitted = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      showDragHandle: true,
      builder: (sheetContext) => _CounterOfferSheet(
        initial: application.schedule,
        onSubmit: (schedule, message) => ref
            .read(manageRequestProvider(widget.applicationId).notifier)
            .counterOffer(schedule, message: message),
      ),
    );
    if (submitted == true && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Time suggested — waiting to hear back from the organizer.')),
      );
    }
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

/// "Suggest another time" composer (CONTRACTS §5). A bottom sheet prefilled
/// from the organizer's requested [initial] schedule, reusing the apply flow's
/// weekday-chip + native time/date-picker idiom (no availability calendar here
/// — the server validates and a `409 schedule_unavailable` surfaces inline).
/// Owns its own submit so a conflict keeps the sheet open for correction.
class _CounterOfferSheet extends StatefulWidget {
  const _CounterOfferSheet({required this.initial, required this.onSubmit});

  final ProposedSchedule initial;
  final Future<void> Function(ProposedSchedule schedule, String? message) onSubmit;

  @override
  State<_CounterOfferSheet> createState() => _CounterOfferSheetState();
}

class _CounterOfferSheetState extends State<_CounterOfferSheet> {
  static const _days = [
    'sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', //
  ];
  static const _dayAbbrev = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  late ProposedSchedule _schedule = widget.initial;
  final _messageController = TextEditingController();
  bool _submitting = false;
  String? _conflictDetail;

  @override
  void dispose() {
    _messageController.dispose();
    super.dispose();
  }

  bool get _recurring => _schedule.frequency == 'recurringWeekly';

  bool get _complete {
    final s = _schedule;
    if (s.startDate.isEmpty || s.startTime.isEmpty || s.endTime.isEmpty) return false;
    if (s.endTime.compareTo(s.startTime) <= 0) return false;
    if (_recurring && (s.endDate == null || (s.daysOfWeek ?? const []).isEmpty)) {
      return false;
    }
    return true;
  }

  String _fmtDate(DateTime d) =>
      '${d.year}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

  String _fmtTime(TimeOfDay t) =>
      '${t.hour.toString().padLeft(2, '0')}:${t.minute.toString().padLeft(2, '0')}';

  TimeOfDay _timeOfDay(String hhmm, String fallback) {
    final parts = (hhmm.isNotEmpty ? hhmm : fallback).split(':');
    return TimeOfDay(hour: int.parse(parts[0]), minute: int.parse(parts[1]));
  }

  List<String> _toggleDay(List<String> current, String token) {
    final next = current.contains(token)
        ? current.where((d) => d != token).toList()
        : [...current, token];
    next.sort((a, b) => _days.indexOf(a).compareTo(_days.indexOf(b)));
    return next;
  }

  void _update(ProposedSchedule next) => setState(() {
        _schedule = next;
        _conflictDetail = null; // the schedule moved on; drop the stale verdict
      });

  Future<void> _pickDate(BuildContext context, {required bool isEnd}) async {
    final now = DateTime.now();
    final picked = await showDatePicker(
      context: context,
      firstDate: now,
      lastDate: now.add(const Duration(days: 365)),
      initialDate: now,
    );
    if (picked == null) return;
    _update(isEnd
        ? _schedule.copyWith(endDate: _fmtDate(picked))
        : _schedule.copyWith(startDate: _fmtDate(picked)));
  }

  Future<void> _pickTime(BuildContext context, {required bool isEnd}) async {
    final current = isEnd ? _schedule.endTime : _schedule.startTime;
    final picked = await showTimePicker(
      context: context,
      initialTime: _timeOfDay(current, isEnd ? '12:00' : '09:00'),
    );
    if (picked == null) return;
    final hhmm = _fmtTime(picked);
    _update(isEnd
        ? _schedule.copyWith(endTime: hhmm)
        : _schedule.copyWith(startTime: hhmm));
  }

  Future<void> _submit() async {
    setState(() {
      _submitting = true;
      _conflictDetail = null;
    });
    final message = _messageController.text.trim();
    try {
      await widget.onSubmit(_schedule, message.isEmpty ? null : message);
      if (mounted) Navigator.pop(context, true);
    } catch (e) {
      if (!mounted) return;
      final appError = e is AppError ? e : null;
      setState(() {
        _submitting = false;
        _conflictDetail = switch (appError?.code) {
          'schedule_unavailable' => appError?.detail ??
              'That time is outside your open hours, on a blackout date, or already '
                  'booked. Pick another time.',
          'invalid_state' => 'This request has already been decided.',
          _ => "Couldn't send your suggestion. Try again in a moment.",
        };
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.steepleColors;
    final s = _schedule;

    Widget pickerTile(String label, String value, VoidCallback onTap) => Expanded(
          child: OutlinedButton(
            onPressed: onTap,
            style: OutlinedButton.styleFrom(
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(SteepleTokens.radiusSm),
              ),
              alignment: Alignment.centerLeft,
            ),
            child: Text(
              value.isEmpty ? label : value,
              style: SteepleTypography.bodySm.copyWith(
                color: value.isEmpty ? colors.textTertiary : colors.textPrimary,
              ),
            ),
          ),
        );

    return Padding(
      padding: EdgeInsets.only(
        left: SteepleTokens.gutter,
        right: SteepleTokens.gutter,
        bottom: MediaQuery.of(context).viewInsets.bottom + SteepleTokens.gutter,
      ),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Suggest another time',
              style: SteepleTypography.headlineSerif.copyWith(color: colors.textPrimary),
            ),
            const SizedBox(height: SteepleTokens.space1),
            Text(
              'They asked for ${scheduleSummary(widget.initial)}. Offer an alternative below.',
              style: SteepleTypography.bodySm.copyWith(color: colors.textSecondary),
            ),
            const SizedBox(height: SteepleTokens.space4),
            Wrap(
              spacing: SteepleTokens.space2,
              children: [
                FilterChipPill(
                  label: 'One time',
                  selected: !_recurring,
                  onTap: () => _update(s.copyWith(frequency: 'oneOff', endDate: null)),
                ),
                FilterChipPill(
                  label: 'Weekly',
                  selected: _recurring,
                  onTap: () => _update(s.copyWith(frequency: 'recurringWeekly')),
                ),
              ],
            ),
            const SizedBox(height: SteepleTokens.space3),
            Row(
              children: [
                pickerTile(
                  _recurring ? 'First date' : 'Date',
                  s.startDate,
                  () => _pickDate(context, isEnd: false),
                ),
                if (_recurring) ...[
                  const SizedBox(width: SteepleTokens.space2),
                  pickerTile('Until', s.endDate ?? '', () => _pickDate(context, isEnd: true)),
                ],
              ],
            ),
            const SizedBox(height: SteepleTokens.space3),
            Row(
              children: [
                pickerTile('From', s.startTime, () => _pickTime(context, isEnd: false)),
                const SizedBox(width: SteepleTokens.space2),
                pickerTile('To', s.endTime, () => _pickTime(context, isEnd: true)),
              ],
            ),
            if (_recurring) ...[
              const SizedBox(height: SteepleTokens.space3),
              Text(
                'Which days',
                style: SteepleTypography.caption.copyWith(color: colors.textSecondary),
              ),
              const SizedBox(height: SteepleTokens.space2),
              Wrap(
                spacing: SteepleTokens.space2,
                runSpacing: SteepleTokens.space2,
                children: [
                  for (var i = 0; i < _days.length; i++)
                    FilterChipPill(
                      label: _dayAbbrev[i],
                      selected: (s.daysOfWeek ?? const []).contains(_days[i]),
                      onTap: () => _update(
                        s.copyWith(
                          daysOfWeek: _toggleDay(s.daysOfWeek ?? const [], _days[i]),
                        ),
                      ),
                    ),
                ],
              ),
            ],
            const SizedBox(height: SteepleTokens.space4),
            TextField(
              controller: _messageController,
              minLines: 2,
              maxLines: 4,
              textCapitalization: TextCapitalization.sentences,
              decoration: const InputDecoration(
                hintText: 'Add a note (optional) — e.g. why this time works better.',
              ),
            ),
            if (_complete) ...[
              const SizedBox(height: SteepleTokens.space3),
              Text(
                scheduleSummary(s),
                style: SteepleTypography.bodySm.copyWith(color: colors.textPrimary),
              ),
            ],
            if (_conflictDetail != null) ...[
              const SizedBox(height: SteepleTokens.space3),
              Container(
                padding: const EdgeInsets.all(SteepleTokens.space3),
                decoration: BoxDecoration(
                  color: colors.danger.bg,
                  borderRadius: BorderRadius.circular(SteepleTokens.radiusMd),
                ),
                child: Text(
                  _conflictDetail!,
                  style: SteepleTypography.bodySm.copyWith(color: colors.danger.fg),
                ),
              ),
            ],
            const SizedBox(height: SteepleTokens.space5),
            FilledButton(
              onPressed: (_complete && !_submitting) ? _submit : null,
              child: _submitting
                  ? SizedBox(
                      width: 20,
                      height: 20,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        color: Theme.of(context).colorScheme.onPrimary,
                      ),
                    )
                  : const Text('Send suggestion'),
            ),
          ],
        ),
      ),
    );
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
