import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:uuid/uuid.dart';

import '../../../app/theme/theme.dart';
import '../../../core/analytics/analytics_service.dart';
import '../../../core/api/app_error.dart';
import '../../../core/auth/session_manager.dart';
import '../../../core/auth/session_state.dart';
import '../../../core/models/models.dart';
import '../../../core/navigation/route_names.dart';
import '../../../core/push/push_service.dart';
import '../../../core/utils/dates.dart';
import '../../../core/widgets/widgets.dart';
import '../../listing/providers.dart';
import '../providers.dart';

/// The apply flow (PRD: friction only at commitment). The whole form is
/// drafted anonymously; the SSO sheet appears at submit and the draft
/// survives it (provider keyed outside auth state — MOBILE_CONTRACTS §6).
class ApplyScreen extends ConsumerStatefulWidget {
  const ApplyScreen({required this.venueSlug, required this.roomSlug, super.key});

  final String venueSlug;
  final String roomSlug;

  @override
  ConsumerState<ApplyScreen> createState() => _ApplyScreenState();
}

class _ApplyScreenState extends ConsumerState<ApplyScreen> {
  /// One idempotency key per screen visit: a retried submit after a network
  /// blip returns the original application instead of a duplicate.
  final _idempotencyKey = const Uuid().v4();

  final _groupSizeController = TextEditingController();
  final _intentController = TextEditingController();
  bool _submitting = false;
  bool _tracked = false;

  @override
  void dispose() {
    _groupSizeController.dispose();
    _intentController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final detail = ref.watch(
      listingDetailProvider((venueSlug: widget.venueSlug, roomSlug: widget.roomSlug)),
    );

    return Scaffold(
      appBar: AppBar(title: const Text('Ask to book')),
      body: AsyncValueView<RoomDetail>(
        value: detail,
        onRetry: () => ref.invalidate(
          listingDetailProvider((venueSlug: widget.venueSlug, roomSlug: widget.roomSlug)),
        ),
        data: (room) {
          if (!_tracked) {
            _tracked = true;
            ref.read(analyticsProvider).track(
              AnalyticsEvents.applicationStarted,
              {'roomId': room.roomId},
            );
          }
          return _buildForm(room);
        },
      ),
    );
  }

  Widget _buildForm(RoomDetail room) {
    final colors = context.steepleColors;
    final draft = ref.watch(applyDraftProvider(room.roomId));
    final notifier = ref.read(applyDraftProvider(room.roomId).notifier);
    final schedule = draft.schedule;
    final recurring = schedule?.frequency == 'recurringWeekly';

    // Keep controllers in sync with a draft restored from an earlier visit.
    if (_groupSizeController.text.isEmpty && draft.groupSize > 0) {
      _groupSizeController.text = '${draft.groupSize}';
    }
    if (_intentController.text.isEmpty && draft.intentText.isNotEmpty) {
      _intentController.text = draft.intentText;
    }

    Widget legend(String text) => Padding(
          padding: const EdgeInsets.only(
            top: SteepleTokens.space6,
            bottom: SteepleTokens.space3,
          ),
          child: Text(
            text.toUpperCase(),
            style: SteepleTypography.label.copyWith(color: colors.textTertiary),
          ),
        );

    return Column(
      children: [
        Expanded(
          child: ListView(
            padding: const EdgeInsets.all(SteepleTokens.gutter),
            children: [
              Text(
                'Ask ${room.venue.name}',
                style: SteepleTypography.displaySerif.copyWith(color: colors.textPrimary),
              ),
              const SizedBox(height: SteepleTokens.space1),
              Text(
                '${room.roomName} · they usually reply within a few days',
                style: SteepleTypography.bodySm.copyWith(color: colors.textSecondary),
              ),

              legend('What will you do here'),
              Wrap(
                spacing: SteepleTokens.space2,
                runSpacing: SteepleTokens.space2,
                children: [
                  for (final token in room.activities)
                    FilterChipPill(
                      label: wireTokenLabel(token),
                      selected: draft.activityType == token,
                      onTap: () => notifier.update(draft.copyWith(activityType: token)),
                    ),
                ],
              ),

              legend('How many people'),
              TextField(
                controller: _groupSizeController,
                keyboardType: TextInputType.number,
                inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                decoration: InputDecoration(
                  hintText: 'e.g. 15',
                  helperText: 'This space fits up to ${room.capacity}',
                ),
                onChanged: (value) =>
                    notifier.update(draft.copyWith(groupSize: int.tryParse(value) ?? 0)),
              ),

              legend('When'),
              _ScheduleFields(
                schedule: schedule,
                recurring: recurring,
                onChanged: (s) => notifier.update(draft.copyWith(schedule: s)),
              ),

              legend('Tell them about your group'),
              TextField(
                controller: _intentController,
                minLines: 5,
                maxLines: 10,
                textCapitalization: TextCapitalization.sentences,
                decoration: const InputDecoration(
                  hintText:
                      'Toddler playgroup, about 15 of us, Tuesday mornings. '
                      'We bring our own mats and always leave the room as we found it.',
                ),
                onChanged: (value) => notifier.update(draft.copyWith(intentText: value)),
              ),
              const SizedBox(height: SteepleTokens.space2),
              Text(
                'A sentence or two about who you are goes a long way — '
                'a real person reads this.',
                style: SteepleTypography.caption.copyWith(color: colors.textTertiary),
              ),
              const SizedBox(height: SteepleTokens.space8),
            ],
          ),
        ),
        Container(
          padding: const EdgeInsets.all(SteepleTokens.gutter),
          decoration: BoxDecoration(
            color: colors.surfaceRaised,
            border: Border(top: BorderSide(color: colors.border)),
            boxShadow: colors.elevation2,
          ),
          child: SafeArea(
            top: false,
            child: FilledButton(
              onPressed: _isComplete(draft) && !_submitting ? () => _submit(room) : null,
              child: _submitting
                  ? const SizedBox(
                      width: 20,
                      height: 20,
                      child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                    )
                  : Text('Send to ${room.venue.name}'),
            ),
          ),
        ),
      ],
    );
  }

  bool _isComplete(ApplicationDraft draft) {
    final s = draft.schedule;
    if (draft.activityType.isEmpty || draft.groupSize <= 0) return false;
    if (draft.intentText.trim().length < 10) return false;
    if (s == null || s.startDate.isEmpty || s.startTime.isEmpty || s.endTime.isEmpty) {
      return false;
    }
    if (s.frequency == 'recurringWeekly' &&
        (s.endDate == null || s.daysOfWeek == null || s.daysOfWeek!.isEmpty)) {
      return false;
    }
    return true;
  }

  Future<void> _submit(RoomDetail room) async {
    // The SSO gate, only at the moment of commitment.
    if (ref.read(sessionProvider) is! SignedIn) {
      final result = await showSsoSheet(
        context,
        reason: 'Sign in so ${room.venue.name} knows who’s asking.',
        trigger: 'apply',
      );
      if (result is! SignInSuccess || !mounted) return; // draft survives
    }

    setState(() => _submitting = true);
    final draft = ref.read(applyDraftProvider(room.roomId));
    try {
      final application = await ref.read(applicationsRepositoryProvider).submit(
            room.roomId,
            draft,
            idempotencyKey: _idempotencyKey,
            // TODO(release): Turnstile only guards environments with a
            // configured secret; mobile sends none until a widget exists.
            turnstileToken: '',
          );
      if (!mounted) return;
      unawaited(HapticFeedback.lightImpact()); // apply-submitted moment (§7)
      ref.read(applyDraftProvider(room.roomId).notifier).clear();
      await _showSubmitted(room, application);
    } on AppError catch (error) {
      if (!mounted) return;
      setState(() => _submitting = false);
      final message = switch (error.kind) {
        AppErrorKind.validation =>
          'Something in the form needs fixing — check the dates and try again.',
        AppErrorKind.notFound => 'This space is no longer taking requests.',
        AppErrorKind.rateLimited => 'A moment, please — try again shortly.',
        _ => "Couldn't send your application. Check your connection and try again.",
      };
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message)));
    }
  }

  /// The submitted "moment" + the contextual push ask (MOBILE_DESIGN §5:
  /// "want to know when the church replies?" — never at launch).
  Future<void> _showSubmitted(RoomDetail room, Application application) async {
    final colors = context.steepleColors;
    final notify = await showDialog<bool>(
      context: context,
      barrierDismissible: false,
      builder: (context) => AlertDialog(
        icon: Icon(Icons.mark_email_read_rounded, color: colors.selectedFg, size: 40),
        title: Text('Sent to ${room.venue.name}'),
        content: const Text(
          'They usually reply within a few days. '
          'Want to know the moment they do?',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('Not now'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(context).pop(true),
            child: const Text('Notify me'),
          ),
        ],
      ),
    );
    if (!mounted) return;
    if (notify == true) {
      await ref.read(pushServiceProvider).requestPermissionInContext();
    }
    if (!mounted) return;
    context.goNamed(
      RouteNames.applicationThread,
      pathParameters: {'id': application.id},
    );
  }
}

/// Native pickers for the venue-local schedule. Dates/times stay Strings
/// end-to-end (`yyyy-MM-dd` / `HH:mm`) — wall-clock in the venue's timezone,
/// never a device-local DateTime (MOBILE_CONTRACTS §5).
class _ScheduleFields extends StatelessWidget {
  const _ScheduleFields({
    required this.schedule,
    required this.recurring,
    required this.onChanged,
  });

  final ProposedSchedule? schedule;
  final bool recurring;
  final ValueChanged<ProposedSchedule> onChanged;

  /// Weekday wire tokens in the Sunday-first order the API expects on the wire.
  static const _days = [
    'sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', //
  ];

  static const _dayAbbrev = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  /// `DateTime.weekday` (Mon=1…Sun=7) → Sunday-first token.
  String _tokenForDate(DateTime d) => _days[d.weekday % 7];

  /// Toggle a day in/out, keeping the list sorted Sunday-first for the wire.
  List<String> _toggleDay(List<String> current, String token) {
    final next = current.contains(token)
        ? current.where((d) => d != token).toList()
        : [...current, token];
    next.sort((a, b) => _days.indexOf(a).compareTo(_days.indexOf(b)));
    return next;
  }

  ProposedSchedule get _current =>
      schedule ??
      const ProposedSchedule(frequency: 'oneOff', startDate: '', startTime: '', endTime: '');

  String _fmtDate(DateTime d) =>
      '${d.year}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

  String _fmtTime(TimeOfDay t) =>
      '${t.hour.toString().padLeft(2, '0')}:${t.minute.toString().padLeft(2, '0')}';

  Future<void> _pickDate(BuildContext context, {required bool isEnd}) async {
    final now = DateTime.now();
    final picked = await showDatePicker(
      context: context,
      firstDate: now,
      lastDate: now.add(const Duration(days: 365)),
      initialDate: now,
    );
    if (picked == null) return;
    if (isEnd) {
      onChanged(_current.copyWith(endDate: _fmtDate(picked)));
    } else {
      // Weekly slots seed the start date's weekday when no days are chosen
      // yet; an existing selection is left untouched.
      final days = _current.daysOfWeek;
      onChanged(_current.copyWith(
        startDate: _fmtDate(picked),
        daysOfWeek: recurring && (days == null || days.isEmpty)
            ? [_tokenForDate(picked)]
            : days,
      ));
    }
  }

  Future<void> _pickTime(BuildContext context, {required bool isEnd}) async {
    final picked = await showTimePicker(
      context: context,
      initialTime: const TimeOfDay(hour: 9, minute: 0),
    );
    if (picked == null) return;
    onChanged(
      isEnd
          ? _current.copyWith(endTime: _fmtTime(picked))
          : _current.copyWith(startTime: _fmtTime(picked)),
    );
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.steepleColors;
    final s = _current;

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

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Wrap(
          spacing: SteepleTokens.space2,
          children: [
            FilterChipPill(
              label: 'One time',
              selected: !recurring,
              onTap: () => onChanged(s.copyWith(frequency: 'oneOff', endDate: null)),
            ),
            FilterChipPill(
              label: 'Weekly',
              selected: recurring,
              onTap: () => onChanged(s.copyWith(frequency: 'recurringWeekly')),
            ),
          ],
        ),
        const SizedBox(height: SteepleTokens.space3),
        Row(
          children: [
            pickerTile(
              recurring ? 'First date' : 'Date',
              s.startDate,
              () => _pickDate(context, isEnd: false),
            ),
            if (recurring) ...[
              const SizedBox(width: SteepleTokens.space2),
              pickerTile('Until', s.endDate ?? '', () => _pickDate(context, isEnd: true)),
            ],
          ],
        ),
        const SizedBox(height: SteepleTokens.space2),
        Row(
          children: [
            pickerTile('From', s.startTime, () => _pickTime(context, isEnd: false)),
            const SizedBox(width: SteepleTokens.space2),
            pickerTile('To', s.endTime, () => _pickTime(context, isEnd: true)),
          ],
        ),
        if (recurring) ...[
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
                  onTap: () => onChanged(
                    s.copyWith(
                      daysOfWeek: _toggleDay(s.daysOfWeek ?? const [], _days[i]),
                    ),
                  ),
                ),
            ],
          ),
          if ((s.daysOfWeek ?? const []).isNotEmpty) ...[
            const SizedBox(height: SteepleTokens.space2),
            Text(
              '${describeWeekdays(s.daysOfWeek)} until ${s.endDate ?? '…'}',
              style: SteepleTypography.caption.copyWith(color: colors.textSecondary),
            ),
          ],
        ],
      ],
    );
  }
}
