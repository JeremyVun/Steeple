import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../app/theme/theme.dart';
import '../models/models.dart';

String quotePrice(ApplicationQuote quote, ProposedSchedule? schedule) {
  final hourly =
      '${quote.currency} ${quote.pricePerHour.toStringAsFixed(2)} / hour';
  if (schedule == null) return hourly;
  int? minutes(String value) {
    final parts = value.split(':');
    if (parts.length < 2) return null;
    final h = int.tryParse(parts[0]);
    final m = int.tryParse(parts[1]);
    return h == null || m == null ? null : h * 60 + m;
  }

  final start = minutes(schedule.startTime);
  final end = minutes(schedule.endTime);
  if (start == null || end == null || end <= start) return hourly;
  final raw = (quote.pricePerHour * 100).round() * (end - start) / 60;
  final floor = raw.floor();
  final cents = (raw - floor - 0.5).abs() < 0.000001
      ? (floor.isEven ? floor : floor + 1)
      : raw.round();
  return '$hourly · ${quote.currency} ${(cents / 100).toStringAsFixed(2)} per session';
}

class BookingTerms extends StatelessWidget {
  const BookingTerms({
    required this.quote,
    this.schedule,
    this.host = false,
    this.legacyRequest = true,
    super.key,
  });
  final ApplicationQuote? quote;
  final ProposedSchedule? schedule;
  final bool host;
  final bool legacyRequest;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(vertical: SteepleTokens.space4),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text('Price and house rules', style: SteepleTypography.title),
        const SizedBox(height: SteepleTokens.space2),
        if (quote case final saved?) ...[
          Text(quotePrice(saved, schedule), style: SteepleTypography.bodySm),
          const SizedBox(height: SteepleTokens.space2),
          Text(
            saved.houseRules.isEmpty
                ? 'No house rules listed.'
                : saved.houseRules,
          ),
        ] else ...[
          const Text('This older request has no saved price or house rules.'),
          if (legacyRequest)
            Text(
              host
                  ? 'The guest must withdraw this request, review the current price and house rules, and send a new request before you can approve it.'
                  : 'Withdraw this request and review the current price and house rules before sending it again.',
            ),
        ],
      ],
    ),
  );
}

Uri bookingSupportUri(String kind, String id) => Uri.parse(
  'mailto:jvun@steepleapp.co?subject=${Uri.encodeComponent('Steeple $kind help — $id')}&body=${Uri.encodeComponent('$kind ID: $id\n\nPlease describe the problem, including any dates affected:\n')}',
);

class BookingSupport extends StatelessWidget {
  const BookingSupport({required this.kind, required this.id, super.key});
  final String kind;
  final String id;
  @override
  Widget build(BuildContext context) => TextButton.icon(
    icon: const Icon(Icons.mail_outline),
    label: Text('Email support about this $kind'),
    onPressed: () async {
      var opened = false;
      try {
        opened = await launchUrl(bookingSupportUri(kind, id));
      } catch (_) {
        /* The email address remains available below. */
      }
      if (!opened && context.mounted) {
        await showDialog<void>(
          context: context,
          builder: (context) => AlertDialog(
            title: const Text('Email support'),
            content: SelectableText('jvun@steepleapp.co\n\n$kind ID: $id'),
            actions: [
              TextButton(
                onPressed: () => Navigator.pop(context),
                child: const Text('Close'),
              ),
            ],
          ),
        );
      }
    },
  );
}
