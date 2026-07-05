import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../app/theme/theme.dart';
import '../../../core/api/app_error.dart';
import '../../../core/models/models.dart';
import '../../../core/widgets/widgets.dart';
import '../application/manage_hours_providers.dart';

/// Weekday tokens Sunday-first (§2.1) — the row order the GET always emits and
/// the order this form keeps its editable copy in.
const _weekdayTokens = <String>[
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
];

const _weekdayLabels = <String, String>{
  'sunday': 'Sunday',
  'monday': 'Monday',
  'tuesday': 'Tuesday',
  'wednesday': 'Wednesday',
  'thursday': 'Thursday',
  'friday': 'Friday',
  'saturday': 'Saturday',
};

const _maxWindowsPerDay = 6;
const _maxBlackouts = 200;

/// "Hours & blackouts" editor (MOBILE_CONTRACTS §7 `manageRoomHours` route) —
/// host parity for room open hours. Seven day rows (Sunday-first) with editable
/// windows, per-day copy, preset quick-fills, and a blackout list; one Save does
/// the replace-all `PUT`. Local validation mirrors the server rules (≤6 windows,
/// end>start, no intra-day overlap) so most errors never round-trip.
class ManageRoomHoursScreen extends ConsumerStatefulWidget {
  const ManageRoomHoursScreen({required this.roomId, super.key});

  final String roomId;

  @override
  ConsumerState<ManageRoomHoursScreen> createState() => _ManageRoomHoursScreenState();
}

class _ManageRoomHoursScreenState extends ConsumerState<ManageRoomHoursScreen> {
  /// Windows per weekday token; always holds all seven keys once loaded.
  final Map<String, List<_Window>> _byDay = {};
  final List<BlackoutDate> _blackouts = [];
  String _timezone = '';
  bool _loaded = false;
  bool _saving = false;

  void _load(RoomAvailabilityRules rules) {
    _timezone = rules.timezone;
    for (final token in _weekdayTokens) {
      final day = rules.days.firstWhere(
        (d) => d.dayOfWeek == token,
        orElse: () => DayOpenHours(dayOfWeek: token),
      );
      _byDay[token] = [for (final w in day.windows) _Window.parse(w.startTime, w.endTime)];
    }
    _blackouts
      ..clear()
      ..addAll(rules.blackouts);
    _loaded = true;
  }

  @override
  Widget build(BuildContext context) {
    final provider = manageRoomHoursProvider(widget.roomId);
    final state = ref.watch(provider);

    ref.listen(provider, (previous, next) {
      final rules = next.value;
      if (rules != null && !_loaded) setState(() => _load(rules));
    });
    final current = state.value;
    if (current != null && !_loaded) _load(current);

    return Scaffold(
      appBar: AppBar(title: const Text('Hours & blackouts')),
      body: AsyncValueView(
        value: state,
        skeleton: () => const Skeleton(child: _HoursSkeleton()),
        onRetry: () => ref.read(provider.notifier).refresh(),
        data: (_) => _buildForm(context),
      ),
    );
  }

  Widget _buildForm(BuildContext context) {
    final colors = context.steepleColors;

    return ListView(
      padding: const EdgeInsets.all(SteepleTokens.gutter),
      children: [
        Text(
          'Times are in the venue\'s local zone ($_timezone).',
          style: SteepleTypography.bodySm.copyWith(color: colors.textSecondary),
        ),
        const SizedBox(height: SteepleTokens.space4),
        _PresetsRow(onApply: _applyPreset),
        const SizedBox(height: SteepleTokens.space6),
        Text('Open hours', style: SteepleTypography.title.copyWith(color: colors.textPrimary)),
        const SizedBox(height: SteepleTokens.space3),
        for (final token in _weekdayTokens) ...[
          _DayRow(
            token: token,
            label: _weekdayLabels[token]!,
            windows: _byDay[token] ?? const [],
            error: _dayError(token),
            onAdd: () => _addWindow(token),
            onEditStart: (i) => _editTime(token, i, isEnd: false),
            onEditEnd: (i) => _editTime(token, i, isEnd: true),
            onRemove: (i) => _removeWindow(token, i),
            onCopy: () => _copyDay(token),
          ),
          const Divider(height: SteepleTokens.space6),
        ],
        const SizedBox(height: SteepleTokens.space4),
        Text('Blackout dates', style: SteepleTypography.title.copyWith(color: colors.textPrimary)),
        const SizedBox(height: SteepleTokens.space2),
        Text(
          'Dates the room is closed regardless of open hours.',
          style: SteepleTypography.bodySm.copyWith(color: colors.textSecondary),
        ),
        const SizedBox(height: SteepleTokens.space3),
        if (_blackouts.isEmpty)
          Text(
            'No blackout dates.',
            style: SteepleTypography.bodySm.copyWith(color: colors.textTertiary),
          )
        else
          for (var i = 0; i < _blackouts.length; i++) ...[
            _BlackoutRow(
              blackout: _blackouts[i],
              onRemove: () => setState(() => _blackouts.removeAt(i)),
            ),
            const SizedBox(height: SteepleTokens.space2),
          ],
        const SizedBox(height: SteepleTokens.space3),
        OutlinedButton.icon(
          onPressed: _saving ? null : _addBlackout,
          icon: const Icon(Icons.event_busy_rounded, size: 18),
          label: const Text('Add blackout date'),
        ),
        const SizedBox(height: SteepleTokens.space8),
        FilledButton(
          onPressed: _saving ? null : _save,
          child: _saving
              ? SizedBox(
                  width: 20,
                  height: 20,
                  child: CircularProgressIndicator(
                    strokeWidth: 2,
                    color: Theme.of(context).colorScheme.onPrimary,
                  ),
                )
              : const Text('Save'),
        ),
      ],
    );
  }

  // --- Window editing ---------------------------------------------------------

  void _addWindow(String token) {
    final windows = _byDay[token]!;
    if (windows.length >= _maxWindowsPerDay) {
      _snack('Up to $_maxWindowsPerDay time ranges per day.');
      return;
    }
    // Seed a window that doesn't collide with the last one where possible.
    final startMin = windows.isEmpty ? 18 * 60 : windows.last.endMin;
    final start = startMin >= 22 * 60 ? 20 * 60 : startMin;
    final end = (start + 60).clamp(start + 1, 24 * 60 - 1);
    setState(() => windows.add(_Window(start, end)));
  }

  Future<void> _editTime(String token, int index, {required bool isEnd}) async {
    final window = _byDay[token]![index];
    final initial = isEnd ? window.end : window.start;
    final picked = await showTimePicker(context: context, initialTime: initial);
    if (picked == null) return;
    setState(() {
      _byDay[token]![index] =
          isEnd ? window.copyWith(end: picked) : window.copyWith(start: picked);
    });
  }

  void _removeWindow(String token, int index) =>
      setState(() => _byDay[token]!.removeAt(index));

  /// Per-day validation message (null = valid) — mirrors the server rules.
  String? _dayError(String token) {
    final windows = [..._byDay[token] ?? const <_Window>[]]..sort((a, b) => a.startMin - b.startMin);
    if (windows.length > _maxWindowsPerDay) return 'Up to $_maxWindowsPerDay time ranges per day.';
    for (var i = 0; i < windows.length; i++) {
      if (windows[i].endMin <= windows[i].startMin) return 'End time must be after start time.';
      if (i > 0 && windows[i].startMin < windows[i - 1].endMin) {
        return 'Time ranges can\'t overlap.';
      }
    }
    return null;
  }

  // --- Copy to… ---------------------------------------------------------------

  Future<void> _copyDay(String source) async {
    final targets = await showModalBottomSheet<List<String>>(
      context: context,
      builder: (context) => _CopyToSheet(source: source),
    );
    if (targets == null || targets.isEmpty) return;
    setState(() {
      for (final target in targets) {
        _byDay[target] = [for (final w in _byDay[source]!) w.copy()];
      }
    });
  }

  // --- Presets ----------------------------------------------------------------

  void _applyPreset(_Preset preset) {
    setState(() {
      for (final token in _weekdayTokens) {
        _byDay[token] = [for (final w in preset.windowsFor(token)) w.copy()];
      }
    });
  }

  // --- Blackouts --------------------------------------------------------------

  Future<void> _addBlackout() async {
    if (_blackouts.length >= _maxBlackouts) {
      _snack('Up to $_maxBlackouts blackout dates.');
      return;
    }
    final now = DateTime.now();
    final date = await showDatePicker(
      context: context,
      firstDate: DateTime(now.year, now.month, now.day),
      lastDate: now.add(const Duration(days: 365 * 3)),
      initialDate: now,
    );
    if (date == null || !mounted) return;
    final iso = _isoDate(date);
    if (_blackouts.any((b) => b.date == iso)) {
      _snack('That date is already blacked out.');
      return;
    }
    final reason = await _askReason();
    if (!mounted) return;
    setState(() {
      _blackouts
        ..add(BlackoutDate(date: iso, reason: (reason?.trim().isEmpty ?? true) ? null : reason!.trim()))
        ..sort((a, b) => a.date.compareTo(b.date));
    });
  }

  Future<String?> _askReason() {
    final controller = TextEditingController();
    return showDialog<String>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Add a note (optional)'),
        content: TextField(
          controller: controller,
          autofocus: true,
          maxLength: 200,
          decoration: const InputDecoration(hintText: 'e.g. Christmas Day'),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, null),
            child: const Text('Skip'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, controller.text),
            child: const Text('Add'),
          ),
        ],
      ),
    );
  }

  // --- Save -------------------------------------------------------------------

  Future<void> _save() async {
    // Pre-validate every day so overlaps/>6/end<=start never round-trip.
    for (final token in _weekdayTokens) {
      final error = _dayError(token);
      if (error != null) {
        _snack('${_weekdayLabels[token]}: $error');
        return;
      }
    }

    final rules = RoomAvailabilityRules(
      roomId: widget.roomId,
      timezone: _timezone,
      days: [
        for (final token in _weekdayTokens)
          DayOpenHours(
            dayOfWeek: token,
            windows: ([..._byDay[token]!]..sort((a, b) => a.startMin - b.startMin))
                .map((w) => w.toWire())
                .toList(),
          ),
      ],
      blackouts: List.of(_blackouts),
    );

    setState(() => _saving = true);
    try {
      await ref.read(manageRoomHoursProvider(widget.roomId).notifier).save(rules);
      if (mounted) _snack('Hours saved.');
    } catch (e) {
      if (!mounted) return;
      final appError = e is AppError ? e : null;
      // A 400 invalid_availability carries a human `detail` — surface it
      // verbatim; anything else falls back to the generic line.
      final text = appError?.kind == AppErrorKind.validation && appError?.detail != null
          ? appError!.detail!
          : "Couldn't save that. Try again in a moment.";
      _snack(text);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  void _snack(String text) =>
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(text)));
}

String _isoDate(DateTime d) =>
    '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

/// A window held as [TimeOfDay]s during editing; converts to/from the `HH:mm`
/// wire strings.
class _Window {
  _Window(int startMin, int endMin)
      : start = TimeOfDay(hour: startMin ~/ 60, minute: startMin % 60),
        end = TimeOfDay(hour: endMin ~/ 60, minute: endMin % 60);

  _Window._(this.start, this.end);

  factory _Window.parse(String start, String end) =>
      _Window._(_parse(start), _parse(end));

  TimeOfDay start;
  TimeOfDay end;

  int get startMin => start.hour * 60 + start.minute;
  int get endMin => end.hour * 60 + end.minute;

  _Window copyWith({TimeOfDay? start, TimeOfDay? end}) =>
      _Window._(start ?? this.start, end ?? this.end);

  _Window copy() => _Window._(start, end);

  OpenWindow toWire() => OpenWindow(startTime: _fmt(start), endTime: _fmt(end));

  static TimeOfDay _parse(String hhmm) {
    final parts = hhmm.split(':');
    return TimeOfDay(hour: int.parse(parts[0]), minute: int.parse(parts[1]));
  }

  static String _fmt(TimeOfDay t) =>
      '${t.hour.toString().padLeft(2, '0')}:${t.minute.toString().padLeft(2, '0')}';
}

class _DayRow extends StatelessWidget {
  const _DayRow({
    required this.token,
    required this.label,
    required this.windows,
    required this.error,
    required this.onAdd,
    required this.onEditStart,
    required this.onEditEnd,
    required this.onRemove,
    required this.onCopy,
  });

  final String token;
  final String label;
  final List<_Window> windows;
  final String? error;
  final VoidCallback onAdd;
  final void Function(int index) onEditStart;
  final void Function(int index) onEditEnd;
  final void Function(int index) onRemove;
  final VoidCallback onCopy;

  @override
  Widget build(BuildContext context) {
    final colors = context.steepleColors;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Expanded(
              child: Text(
                label,
                style: SteepleTypography.title.copyWith(color: colors.textPrimary),
              ),
            ),
            if (windows.isNotEmpty)
              IconButton(
                onPressed: onCopy,
                icon: const Icon(Icons.copy_all_rounded, size: 20),
                tooltip: 'Copy to other days',
              ),
          ],
        ),
        if (windows.isEmpty)
          Text(
            'Closed',
            style: SteepleTypography.bodySm.copyWith(color: colors.textTertiary),
          )
        else
          for (var i = 0; i < windows.length; i++)
            Padding(
              padding: const EdgeInsets.only(bottom: SteepleTokens.space2),
              child: Row(
                children: [
                  _TimeChip(
                    label: windows[i].start.format(context),
                    onTap: () => onEditStart(i),
                  ),
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: SteepleTokens.space2),
                    child: Text('–', style: TextStyle(color: colors.textSecondary)),
                  ),
                  _TimeChip(
                    label: windows[i].end.format(context),
                    onTap: () => onEditEnd(i),
                  ),
                  const Spacer(),
                  IconButton(
                    onPressed: () => onRemove(i),
                    icon: const Icon(Icons.close_rounded, size: 20),
                    tooltip: 'Remove time range',
                  ),
                ],
              ),
            ),
        if (error != null)
          Padding(
            padding: const EdgeInsets.only(bottom: SteepleTokens.space2),
            child: Text(
              error!,
              style: SteepleTypography.bodySm.copyWith(color: colors.danger.fg),
            ),
          ),
        Align(
          alignment: Alignment.centerLeft,
          child: TextButton.icon(
            onPressed: onAdd,
            icon: const Icon(Icons.add_rounded, size: 18),
            label: const Text('Add hours'),
          ),
        ),
      ],
    );
  }
}

class _TimeChip extends StatelessWidget {
  const _TimeChip({required this.label, required this.onTap});

  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.steepleColors;
    return Semantics(
      button: true,
      label: 'Edit time $label',
      child: Material(
        type: MaterialType.transparency,
        child: InkWell(
          borderRadius: BorderRadius.circular(SteepleTokens.radiusSm),
          onTap: onTap,
          child: Container(
            padding: const EdgeInsets.symmetric(
              horizontal: SteepleTokens.space3,
              vertical: SteepleTokens.space2,
            ),
            decoration: BoxDecoration(
              color: colors.surfaceRaised,
              borderRadius: BorderRadius.circular(SteepleTokens.radiusSm),
              border: Border.all(color: colors.border),
            ),
            child: Text(
              label,
              style: SteepleTypography.body.copyWith(color: colors.textPrimary),
            ),
          ),
        ),
      ),
    );
  }
}

class _BlackoutRow extends StatelessWidget {
  const _BlackoutRow({required this.blackout, required this.onRemove});

  final BlackoutDate blackout;
  final VoidCallback onRemove;

  @override
  Widget build(BuildContext context) {
    final colors = context.steepleColors;
    return DecoratedBox(
      decoration: BoxDecoration(
        color: colors.surfaceRaised,
        borderRadius: BorderRadius.circular(SteepleTokens.radiusMd),
        border: Border.all(color: colors.border),
      ),
      child: Padding(
        padding: const EdgeInsets.symmetric(
          horizontal: SteepleTokens.space3,
          vertical: SteepleTokens.space2,
        ),
        child: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    blackout.date,
                    style: SteepleTypography.body.copyWith(color: colors.textPrimary),
                  ),
                  if (blackout.reason != null && blackout.reason!.isNotEmpty)
                    Text(
                      blackout.reason!,
                      style: SteepleTypography.bodySm.copyWith(color: colors.textSecondary),
                    ),
                ],
              ),
            ),
            IconButton(
              onPressed: onRemove,
              icon: const Icon(Icons.close_rounded, size: 20),
              tooltip: 'Remove blackout date',
            ),
          ],
        ),
      ),
    );
  }
}

class _PresetsRow extends StatelessWidget {
  const _PresetsRow({required this.onApply});

  final void Function(_Preset preset) onApply;

  @override
  Widget build(BuildContext context) {
    final colors = context.steepleColors;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Quick fill',
          style: SteepleTypography.label.copyWith(color: colors.textTertiary),
        ),
        const SizedBox(height: SteepleTokens.space2),
        Wrap(
          spacing: SteepleTokens.space2,
          runSpacing: SteepleTokens.space2,
          children: [
            for (final preset in _Preset.all)
              ActionChip(label: Text(preset.label), onPressed: () => onApply(preset)),
          ],
        ),
      ],
    );
  }
}

class _CopyToSheet extends StatefulWidget {
  const _CopyToSheet({required this.source});

  final String source;

  @override
  State<_CopyToSheet> createState() => _CopyToSheetState();
}

class _CopyToSheetState extends State<_CopyToSheet> {
  final Set<String> _selected = {};

  @override
  Widget build(BuildContext context) {
    final colors = context.steepleColors;
    final targets = _weekdayTokens.where((t) => t != widget.source).toList();
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.all(SteepleTokens.gutter),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Copy ${_weekdayLabels[widget.source]} to…',
              style: SteepleTypography.title.copyWith(color: colors.textPrimary),
            ),
            const SizedBox(height: SteepleTokens.space2),
            for (final token in targets)
              CheckboxListTile(
                dense: true,
                contentPadding: EdgeInsets.zero,
                value: _selected.contains(token),
                title: Text(_weekdayLabels[token]!),
                onChanged: (checked) => setState(() {
                  if (checked ?? false) {
                    _selected.add(token);
                  } else {
                    _selected.remove(token);
                  }
                }),
              ),
            const SizedBox(height: SteepleTokens.space3),
            SizedBox(
              width: double.infinity,
              child: FilledButton(
                onPressed: _selected.isEmpty
                    ? null
                    : () => Navigator.pop(context, _selected.toList()),
                child: const Text('Copy'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// A whole-week quick-fill.
class _Preset {
  const _Preset(this.label, this._byToken);

  final String label;
  final Map<String, List<_Window>> _byToken;

  List<_Window> windowsFor(String token) => _byToken[token] ?? const [];

  static final all = <_Preset>[
    _Preset('Weekday evenings 6–9 PM', {
      for (final t in ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'])
        t: [_Window(18 * 60, 21 * 60)],
    }),
    _Preset('Weekend days 9–5', {
      'saturday': [_Window(9 * 60, 17 * 60)],
      'sunday': [_Window(9 * 60, 17 * 60)],
    }),
    _Preset('Open 8–9 daily', {
      for (final t in _weekdayTokens) t: [_Window(8 * 60, 21 * 60)],
    }),
  ];
}

class _HoursSkeleton extends StatelessWidget {
  const _HoursSkeleton();

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(SteepleTokens.gutter),
      children: const [
        SkeletonBlock(width: 220),
        SizedBox(height: SteepleTokens.space5),
        SkeletonBlock(width: double.infinity, height: 48),
        SizedBox(height: SteepleTokens.space4),
        SkeletonBlock(width: double.infinity, height: 48),
        SizedBox(height: SteepleTokens.space4),
        SkeletonBlock(width: double.infinity, height: 48),
      ],
    );
  }
}
