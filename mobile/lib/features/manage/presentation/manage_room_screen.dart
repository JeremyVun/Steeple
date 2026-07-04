import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../app/theme/theme.dart';
import '../../../core/api/app_error.dart';
import '../../../core/models/models.dart';
import '../../../core/widgets/widgets.dart';
import '../application/manage_room_providers.dart';
import 'widgets/in_review_badge.dart';

/// Basic room edit — fields + publish-state actions (MOBILE_CONTRACTS §7
/// `manageRoom` route). Status actions each send a `ManagedRoomPatch` and
/// save immediately, except `unlist`, which confirms first (it's the only
/// one that takes a live listing out of search) — all follow the same
/// save→snackbar-on-error idiom.
class ManageRoomScreen extends ConsumerStatefulWidget {
  const ManageRoomScreen({required this.roomId, super.key});

  final String roomId;

  @override
  ConsumerState<ManageRoomScreen> createState() => _ManageRoomScreenState();
}

class _ManageRoomScreenState extends ConsumerState<ManageRoomScreen> {
  final _nameController = TextEditingController();
  final _descriptionController = TextEditingController();
  final _capacityController = TextEditingController();
  final _priceController = TextEditingController();
  bool _fieldsLoaded = false;
  bool _saving = false;

  @override
  void dispose() {
    _nameController.dispose();
    _descriptionController.dispose();
    _capacityController.dispose();
    _priceController.dispose();
    super.dispose();
  }

  void _loadFields(ManagedRoom room) {
    _nameController.text = room.name;
    _descriptionController.text = room.description;
    _capacityController.text = room.capacity.toString();
    _priceController.text = room.isFree ? '' : room.pricePerHour!.toStringAsFixed(2);
    _fieldsLoaded = true;
  }

  @override
  Widget build(BuildContext context) {
    final provider = manageRoomProvider(widget.roomId);
    final state = ref.watch(provider);

    ref.listen(provider, (previous, next) {
      final room = next.value;
      if (room != null && !_fieldsLoaded) _loadFields(room);
    });
    // First build: `ref.listen` only fires on subsequent changes, so seed the
    // controllers from whatever's already resolved too.
    final current = state.value;
    if (current != null && !_fieldsLoaded) _loadFields(current);

    return Scaffold(
      appBar: AppBar(title: Text(state.value?.name ?? 'Edit room')),
      body: AsyncValueView(
        value: state,
        skeleton: () => const Skeleton(child: _RoomSkeleton()),
        onRetry: () => ref.read(provider.notifier).refresh(),
        data: _buildForm,
      ),
    );
  }

  Widget _buildForm(ManagedRoom room) {
    final colors = context.steepleColors;

    return ListView(
      padding: const EdgeInsets.all(SteepleTokens.gutter),
      children: [
        Row(
          children: [
            Expanded(
              child: Text(
                room.venueName,
                style: SteepleTypography.bodySm.copyWith(color: colors.textSecondary),
              ),
            ),
            if (room.publishRequestedAtUtc != null)
              const InReviewBadge()
            else
              StatusChip(statusRaw: room.status, domain: StatusDomain.room),
          ],
        ),
        const SizedBox(height: SteepleTokens.space5),
        Text('Name', style: SteepleTypography.label.copyWith(color: colors.textTertiary)),
        const SizedBox(height: SteepleTokens.space2),
        TextField(controller: _nameController),
        const SizedBox(height: SteepleTokens.space4),
        Text('Description', style: SteepleTypography.label.copyWith(color: colors.textTertiary)),
        const SizedBox(height: SteepleTokens.space2),
        TextField(controller: _descriptionController, minLines: 3, maxLines: 6),
        const SizedBox(height: SteepleTokens.space4),
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('Capacity',
                      style: SteepleTypography.label.copyWith(color: colors.textTertiary)),
                  const SizedBox(height: SteepleTokens.space2),
                  TextField(
                    controller: _capacityController,
                    keyboardType: TextInputType.number,
                    inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                  ),
                ],
              ),
            ),
            const SizedBox(width: SteepleTokens.space4),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('Price per hour (blank = free)',
                      style: SteepleTypography.label.copyWith(color: colors.textTertiary)),
                  const SizedBox(height: SteepleTokens.space2),
                  TextField(
                    controller: _priceController,
                    keyboardType: const TextInputType.numberWithOptions(decimal: true),
                    inputFormatters: [FilteringTextInputFormatter.allow(RegExp(r'^\d*\.?\d{0,2}'))],
                  ),
                ],
              ),
            ),
          ],
        ),
        const SizedBox(height: SteepleTokens.space6),
        FilledButton(
          onPressed: _saving ? null : () => _saveFields(room),
          child: _saving
              ? SizedBox(
                  width: 20,
                  height: 20,
                  child: CircularProgressIndicator(
                    strokeWidth: 2,
                    color: Theme.of(context).colorScheme.onPrimary,
                  ),
                )
              : const Text('Save changes'),
        ),
        const SizedBox(height: SteepleTokens.space8),
        Text('Listing status', style: SteepleTypography.title.copyWith(color: colors.textPrimary)),
        const SizedBox(height: SteepleTokens.space3),
        _StatusActions(room: room, saving: _saving, onAction: _applyStatus),
      ],
    );
  }

  Future<void> _saveFields(ManagedRoom room) async {
    final name = _nameController.text.trim();
    final description = _descriptionController.text.trim();
    final capacity = int.tryParse(_capacityController.text.trim());
    final priceText = _priceController.text.trim();
    final price = priceText.isEmpty ? 0.0 : double.tryParse(priceText);

    if (name.isEmpty || capacity == null || capacity <= 0 || price == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Check the name, capacity, and price fields.')),
      );
      return;
    }

    await _save(
      ManagedRoomPatch(
        name: name,
        description: description,
        capacity: capacity,
        pricePerHour: price,
      ),
      successMessage: 'Changes saved.',
    );
  }

  Future<void> _applyStatus(String status) async {
    if (status == 'unlisted') {
      final confirmed = await showDialog<bool>(
        context: context,
        builder: (context) => AlertDialog(
          title: const Text('Take this room offline?'),
          content: const Text(
            "Organizers won't be able to find this room in search until you relist it.",
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context, false),
              child: const Text('Not yet'),
            ),
            FilledButton(
              style: FilledButton.styleFrom(
                backgroundColor: context.steepleColors.danger.fg,
                foregroundColor: Theme.of(context).colorScheme.onPrimary,
              ),
              onPressed: () => Navigator.pop(context, true),
              child: const Text('Unlist'),
            ),
          ],
        ),
      );
      if (confirmed != true || !mounted) return;
    }

    await _save(ManagedRoomPatch(status: status), successMessage: _statusMessage(status));
  }

  String _statusMessage(String status) => switch (status) {
        'published' => 'Sent for review.',
        'draft' => 'Publish request withdrawn.',
        'unlisted' => 'Unlisted.',
        _ => 'Updated.',
      };

  Future<void> _save(ManagedRoomPatch patch, {required String successMessage}) async {
    setState(() => _saving = true);
    try {
      await ref.read(manageRoomProvider(widget.roomId).notifier).save(patch);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(successMessage)));
      }
    } catch (e) {
      if (!mounted) return;
      final appError = e is AppError ? e : null;
      final text = switch (appError?.code) {
        'has_active_bookings' =>
          'This room has upcoming bookings and can\'t change status right now.',
        'no_photos' => 'Add at least one photo before requesting publish.',
        _ => "Couldn't save that. Try again in a moment.",
      };
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(text)));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }
}

class _StatusActions extends StatelessWidget {
  const _StatusActions({required this.room, required this.saving, required this.onAction});

  final ManagedRoom room;
  final bool saving;
  final void Function(String status) onAction;

  @override
  Widget build(BuildContext context) {
    final colors = context.steepleColors;
    final inReview = room.publishRequestedAtUtc != null;

    if (inReview) {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            "This room is waiting on review before it goes live.",
            style: SteepleTypography.bodySm.copyWith(color: colors.textSecondary),
          ),
          const SizedBox(height: SteepleTokens.space3),
          OutlinedButton(
            onPressed: saving ? null : () => onAction('draft'),
            child: const Text('Withdraw request'),
          ),
        ],
      );
    }

    return switch (room.statusValue) {
      ManagedRoomStatus.draft => FilledButton(
          onPressed: saving ? null : () => onAction('published'),
          child: const Text('Request publish'),
        ),
      ManagedRoomStatus.published => OutlinedButton(
          onPressed: saving ? null : () => onAction('unlisted'),
          style: OutlinedButton.styleFrom(foregroundColor: colors.danger.fg),
          child: const Text('Unlist'),
        ),
      ManagedRoomStatus.unlisted || ManagedRoomStatus.unknown => FilledButton(
          onPressed: saving ? null : () => onAction('published'),
          child: const Text('Relist'),
        ),
    };
  }
}

class _RoomSkeleton extends StatelessWidget {
  const _RoomSkeleton();

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(SteepleTokens.gutter),
      children: const [
        SkeletonBlock(width: 150),
        SizedBox(height: SteepleTokens.space5),
        SkeletonBlock(width: double.infinity, height: 48),
        SizedBox(height: SteepleTokens.space4),
        SkeletonBlock(width: double.infinity, height: 96),
      ],
    );
  }
}
