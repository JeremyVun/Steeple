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
import 'availability_calendar.dart';

/// The apply flow (PRD: friction only at commitment). The whole form is
/// drafted anonymously; the SSO sheet appears at submit and the draft
/// survives it (provider keyed outside auth state — MOBILE_CONTRACTS §6).
class ApplyScreen extends ConsumerStatefulWidget {
  const ApplyScreen({
    required this.venueSlug,
    required this.roomSlug,
    this.whenSelection,
    super.key,
  });

  final String venueSlug;
  final String roomSlug;

  /// The search's When filter (CONTRACTS §3), carried through as router
  /// `extra` from the listing detail screen — seeds the schedule below on
  /// first load only, never overwriting a draft already in progress
  /// (MOBILE_CONTRACTS §7).
  final WhenFilter? whenSelection;

  @override
  ConsumerState<ApplyScreen> createState() => _ApplyScreenState();
}

/// Weekday wire tokens, Sunday-first — the order CONTRACTS §5 requires
/// `schedule.daysOfWeek` emitted in.
const _weekdayOrder = [
  'sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', //
];

/// Seeds a fresh [ProposedSchedule] from a search's When filter: weekly when
/// days were picked, one-off otherwise; time band/custom range resolved to a
/// concrete `HH:mm` range (or left blank — "any time" — for the user to fill
/// in via the calendar/pickers below).
ProposedSchedule _scheduleFromWhen(WhenFilter when) {
  final (startTime, endTime) = when.resolvedRange;
  final recurring = when.daysOfWeek.isNotEmpty;
  return ProposedSchedule(
    frequency: recurring ? 'recurringWeekly' : 'oneOff',
    startDate: recurring ? '' : (when.date ?? ''),
    daysOfWeek: recurring
        ? (when.daysOfWeek.toList()..sort((a, b) =>
            _weekdayOrder.indexOf(a).compareTo(_weekdayOrder.indexOf(b))))
        : null,
    startTime: startTime ?? '',
    endTime: endTime ?? '',
  );
}

class _ApplyScreenState extends ConsumerState<ApplyScreen> {
  /// One idempotency key per screen visit: a retried submit after a network
  /// blip returns the original application instead of a duplicate.
  final _idempotencyKey = const Uuid().v4();

  final _groupSizeController = TextEditingController();
  final _intentController = TextEditingController();
  bool _submitting = false;
  bool _tracked = false;
  bool _seededFromSearch = false;

  /// The advisory conflict check (DESIGN_SYSTEM §8.13): debounced 500ms after
  /// the schedule changes, re-rendered from the submit-time 409 when it blocks.
  Timer? _checkDebounce;
  ScheduleCheckResult? _checkResult;
  bool _checking = false;

  /// True when [_checkResult] is the submit-time hard block, not the live
  /// advisory check — the card gets the danger + next-action treatment.
  bool _hardBlock = false;

  @override
  void dispose() {
    _checkDebounce?.cancel();
    _groupSizeController.dispose();
    _intentController.dispose();
    super.dispose();
  }

  bool _scheduleCheckable(ProposedSchedule? s) {
    if (s == null || s.startDate.isEmpty || s.startTime.isEmpty || s.endTime.isEmpty) {
      return false;
    }
    if (s.frequency == 'recurringWeekly' &&
        (s.endDate == null || s.daysOfWeek == null || s.daysOfWeek!.isEmpty)) {
      return false;
    }
    return true;
  }

  /// Debounced advisory dry-run. Clears any prior verdict immediately (the
  /// schedule changed), then checks 500ms later; a verdict is dropped if the
  /// schedule moved on again before it returned.
  void _onScheduleChanged(RoomDetail room, ProposedSchedule? schedule) {
    _checkDebounce?.cancel();
    if (_checkResult != null || _hardBlock) {
      setState(() {
        _checkResult = null;
        _hardBlock = false;
      });
    }
    if (!_scheduleCheckable(schedule)) return;
    _checkDebounce = Timer(const Duration(milliseconds: 500), () async {
      if (!mounted) return;
      setState(() => _checking = true);
      try {
        final result =
            await ref.read(listingRepositoryProvider).checkSchedule(room.roomId, schedule!);
        // Drop a stale verdict if the schedule changed while in flight.
        final current = ref.read(applyDraftProvider(room.roomId)).schedule;
        if (!mounted || current != schedule) return;
        setState(() {
          _checkResult = result;
          _hardBlock = false;
          _checking = false;
        });
      } on AppError {
        if (!mounted) return;
        setState(() => _checking = false); // advisory only — never blocks on error
      }
    });
  }

  /// One-shot prefill from the search's When filter (if the room was reached
  /// through one) — never overwrites a schedule already drafted. Deferred a
  /// frame since it writes another provider, which can't happen mid-build.
  void _seedScheduleFromSearch(String roomId) {
    if (_seededFromSearch) return;
    final when = widget.whenSelection;
    if (when == null) return;
    _seededFromSearch = true;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      final notifier = ref.read(applyDraftProvider(roomId).notifier);
      final draft = ref.read(applyDraftProvider(roomId));
      if (draft.schedule != null) return; // an in-progress draft wins
      notifier.update(draft.copyWith(schedule: _scheduleFromWhen(when)));
    });
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
          _seedScheduleFromSearch(room.roomId);
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
    final availability = ref.watch(roomAvailabilityProvider(room.roomId));

    // Debounced advisory check whenever the schedule changes.
    ref.listen(
      applyDraftProvider(room.roomId).select((d) => d.schedule),
      (_, next) => _onScheduleChanged(room, next),
    );

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
                availability: availability,
                openHours: room.openHours,
                onChanged: (s) => notifier.update(draft.copyWith(schedule: s)),
              ),
              if (_checking) ...[
                const SizedBox(height: SteepleTokens.space3),
                Row(
                  children: [
                    const SizedBox(
                      width: 14,
                      height: 14,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    ),
                    const SizedBox(width: SteepleTokens.space2),
                    Text(
                      'Checking these dates…',
                      style: SteepleTypography.caption.copyWith(color: colors.textSecondary),
                    ),
                  ],
                ),
              ] else if (_checkResult != null) ...[
                const SizedBox(height: SteepleTokens.space3),
                AvailabilityVerdictCard(result: _checkResult!, hardBlock: _hardBlock),
              ],

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
              onPressed: _canSubmit(draft) ? () => _submit(room) : null,
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

  /// Submit is enabled when the form is complete, not mid-submit, and the last
  /// advisory check didn't come back unavailable (DESIGN_SYSTEM §8.13 — the
  /// button disables while a check says the schedule clashes).
  bool _canSubmit(ApplicationDraft draft) {
    if (!_isComplete(draft) || _submitting) return false;
    if (_checking) return false;
    if (_checkResult != null && !_checkResult!.available) return false;
    return true;
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
      // The submit-time hard block: re-render the conflict list in the shared
      // verdict card (danger treatment) rather than a snackbar.
      if (error.kind == AppErrorKind.conflict &&
          error.code == 'schedule_unavailable' &&
          error.problem != null) {
        setState(() {
          _submitting = false;
          _checkResult = ScheduleCheckResult.fromJson(error.problem!);
          _hardBlock = true;
        });
        return;
      }
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

/// The venue-local "when" step. A hand-rolled month calendar fed by the guest
/// availability feed drives date selection (day states + mandatory legend;
/// past / booked-out / closed / blackout days are disabled — DESIGN_SYSTEM
/// §8.10). Tapping a bookable day surfaces its free windows as chips that seed
/// the time range (§8.11); the existing time pickers then refine it, clamped
/// inside the chosen window. Weekly mode keeps the weekday multi-select (§8.12)
/// and pre-checks the tapped day's weekday. Dates/times stay Strings
/// end-to-end (`yyyy-MM-dd` / `HH:mm`), never device-local DateTimes
/// (MOBILE_CONTRACTS §5).
class _ScheduleFields extends StatelessWidget {
  const _ScheduleFields({
    required this.schedule,
    required this.recurring,
    required this.availability,
    required this.openHours,
    required this.onChanged,
  });

  final ProposedSchedule? schedule;
  final bool recurring;
  final AsyncValue<RoomAvailability> availability;
  final List<DayOpenHours>? openHours;
  final ValueChanged<ProposedSchedule> onChanged;

  /// Weekday wire tokens in the Sunday-first order the API expects on the wire.
  static const _days = [
    'sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', //
  ];

  static const _dayAbbrev = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  ProposedSchedule get _current =>
      schedule ??
      const ProposedSchedule(frequency: 'oneOff', startDate: '', startTime: '', endTime: '');

  String _fmtDate(DateTime d) =>
      '${d.year}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

  String _fmtTime(TimeOfDay t) =>
      '${t.hour.toString().padLeft(2, '0')}:${t.minute.toString().padLeft(2, '0')}';

  /// Toggle a day in/out, keeping the list sorted Sunday-first for the wire.
  List<String> _toggleDay(List<String> current, String token) {
    final next = current.contains(token)
        ? current.where((d) => d != token).toList()
        : [...current, token];
    next.sort((a, b) => _days.indexOf(a).compareTo(_days.indexOf(b)));
    return next;
  }

  /// A calendar-day tap: set the (first) date; weekly mode pre-checks that
  /// day's weekday when nothing is chosen yet (never unchecks user picks).
  void _selectDay(String date) {
    final s = _current;
    if (recurring) {
      final days = s.daysOfWeek;
      onChanged(s.copyWith(
        startDate: date,
        daysOfWeek:
            (days == null || days.isEmpty) ? [_days[weekdayOf(date)]] : days,
      ));
    } else {
      onChanged(s.copyWith(startDate: date));
    }
  }

  /// The free window the current start time sits in (or the first) — the range
  /// the time pickers are constrained to.
  OpenWindow? _activeWindow(List<OpenWindow> windows) {
    if (windows.isEmpty) return null;
    final start = _current.startTime;
    for (final w in windows) {
      if (start.compareTo(w.startTime) >= 0 && start.compareTo(w.endTime) < 0) {
        return w;
      }
    }
    return windows.first;
  }

  // `HH:mm` strings compare lexicographically (zero-padded 24h) — no DateTime.
  String _clamp(String hhmm, String lo, String hi) =>
      hhmm.compareTo(lo) < 0 ? lo : (hhmm.compareTo(hi) > 0 ? hi : hhmm);

  TimeOfDay _timeOfDay(String hhmm, String fallback) {
    final src = hhmm.isNotEmpty ? hhmm : fallback;
    final parts = src.split(':');
    return TimeOfDay(hour: int.parse(parts[0]), minute: int.parse(parts[1]));
  }

  Future<void> _pickTime(
    BuildContext context, {
    required bool isEnd,
    required List<OpenWindow> windows,
  }) async {
    final w = _activeWindow(windows);
    final current = isEnd ? _current.endTime : _current.startTime;
    final fallback = w == null ? '09:00' : (isEnd ? w.endTime : w.startTime);
    final picked = await showTimePicker(
      context: context,
      initialTime: _timeOfDay(current, fallback),
    );
    if (picked == null) return;
    var hhmm = _fmtTime(picked);
    if (w != null) hhmm = _clamp(hhmm, w.startTime, w.endTime);
    onChanged(
      isEnd ? _current.copyWith(endTime: hhmm) : _current.copyWith(startTime: hhmm),
    );
  }

  /// Native pickers stay as the no-calendar fallback (feed failed to load) and
  /// for the recurring "Until" bound (DESIGN_SYSTEM §8.10 note).
  Future<void> _pickStartDate(BuildContext context) async {
    final now = DateTime.now();
    final picked = await showDatePicker(
      context: context,
      firstDate: now,
      lastDate: now.add(const Duration(days: 365)),
      initialDate: now,
    );
    if (picked != null) _selectDay(_fmtDate(picked));
  }

  Future<void> _pickEndDate(BuildContext context) async {
    final now = DateTime.now();
    final picked = await showDatePicker(
      context: context,
      firstDate: now,
      lastDate: now.add(const Duration(days: 365)),
      initialDate: now,
    );
    if (picked == null) return;
    onChanged(_current.copyWith(endDate: _fmtDate(picked)));
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.steepleColors;
    final s = _current;
    final data = switch (availability) {
      AsyncData(:final value) => value,
      _ => null,
    };
    final selectedWindows = (data != null && s.startDate.isNotEmpty)
        ? (data.dayFor(s.startDate)?.freeWindows ?? const <OpenWindow>[])
        : const <OpenWindow>[];

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
        const SizedBox(height: SteepleTokens.space4),

        // Calendar (or graceful fallback while loading / on feed error).
        switch (availability) {
          AsyncData(:final value) => AvailabilityCalendar(
              availability: value,
              openHours: openHours,
              selectedDate: s.startDate.isEmpty ? null : s.startDate,
              onSelectDay: _selectDay,
            ),
          AsyncError() => Row(
              children: [
                pickerTile(
                  recurring ? 'First date' : 'Date',
                  s.startDate,
                  () => _pickStartDate(context),
                ),
              ],
            ),
          _ => const SkeletonBlock(height: 300, radius: SteepleTokens.radiusMd),
        },

        if (data != null) ...[
          const SizedBox(height: SteepleTokens.space3),
          const AvailabilityLegend(),
        ],

        // The tapped day's free windows, as range-seeding chips.
        if (data != null && s.startDate.isNotEmpty) ...[
          const SizedBox(height: SteepleTokens.space4),
          Text(
            selectedWindows.isEmpty
                ? 'No free windows on ${weekdayMonthDay(s.startDate)} — pick another day.'
                : 'Free on ${weekdayMonthDay(s.startDate)}',
            style: SteepleTypography.caption.copyWith(color: colors.textSecondary),
          ),
          if (selectedWindows.isNotEmpty) ...[
            const SizedBox(height: SteepleTokens.space2),
            Wrap(
              spacing: SteepleTokens.space2,
              runSpacing: SteepleTokens.space2,
              children: [
                for (final w in selectedWindows)
                  FilterChipPill(
                    label: timeRange12(w.startTime, w.endTime),
                    selected: s.startTime == w.startTime && s.endTime == w.endTime,
                    onTap: () => onChanged(
                      s.copyWith(startTime: w.startTime, endTime: w.endTime),
                    ),
                  ),
              ],
            ),
          ],
        ],

        const SizedBox(height: SteepleTokens.space3),
        Row(
          children: [
            pickerTile(
              'From',
              s.startTime,
              () => _pickTime(context, isEnd: false, windows: selectedWindows),
            ),
            const SizedBox(width: SteepleTokens.space2),
            pickerTile(
              'To',
              s.endTime,
              () => _pickTime(context, isEnd: true, windows: selectedWindows),
            ),
          ],
        ),

        if (recurring) ...[
          const SizedBox(height: SteepleTokens.space3),
          Row(
            children: [
              pickerTile('Until', s.endDate ?? '', () => _pickEndDate(context)),
            ],
          ),
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
        ],

        // Plain-language readout of the chosen slot (DESIGN_SYSTEM §8.11).
        if (s.startDate.isNotEmpty && s.startTime.isNotEmpty && s.endTime.isNotEmpty) ...[
          const SizedBox(height: SteepleTokens.space3),
          Text(
            scheduleSummary(s),
            style: SteepleTypography.bodySm.copyWith(color: colors.textPrimary),
          ),
        ],
      ],
    );
  }
}
