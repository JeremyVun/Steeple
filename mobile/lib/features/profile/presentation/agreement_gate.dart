import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../app/env_config.dart';
import '../../../core/models/legal_documents.dart';
import '../providers.dart';

Future<void> openLegalDocument(
  BuildContext context,
  WidgetRef ref,
  String path,
) async {
  final host = ref.read(envProvider).canonicalWebHost;
  try {
    if (await launchUrl(
      Uri.https(host, '/$path'),
      mode: LaunchMode.externalApplication,
    )) {
      return;
    }
  } catch (_) {
    // Surface a failed launch instead of leaving a legal link apparently inert.
  }
  if (context.mounted) {
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        content: Text(
          'The document could not be opened. Try again in a moment.',
        ),
      ),
    );
  }
}

/// False on refusal, dismissal, or failed reads/writes. The caller keeps its draft.
Future<bool> ensureCurrentAgreements(
  BuildContext context,
  WidgetRef ref,
) async {
  final repository = ref.read(profileRepositoryProvider);
  try {
    final me = await repository.me();
    if (hasCurrentAgreements(me.agreements)) return true;
    if (!context.mounted) return false;
    final missing = legalDocuments
        .where(
          (doc) => !me.agreements.any(
            (a) =>
                a.docType == doc.docType &&
                a.version == currentAgreementVersion,
          ),
        )
        .toList();
    var saving = false;
    String? error;
    return await showDialog<bool>(
          context: context,
          barrierDismissible: false,
          builder: (dialogContext) => StatefulBuilder(
            builder: (context, setState) => PopScope(
              canPop: !saving,
              child: AlertDialog(
                title: const Text('Terms and privacy'),
                content: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Text(
                      'Read the current terms and privacy policy before continuing.',
                    ),
                    for (final doc in legalDocuments)
                      TextButton(
                        onPressed: () =>
                            openLegalDocument(context, ref, doc.path),
                        child: Text(doc.label),
                      ),
                    if (error != null) Text(error!),
                  ],
                ),
                actions: [
                  TextButton(
                    onPressed: saving
                        ? null
                        : () => Navigator.of(dialogContext).pop(false),
                    child: const Text('Not now'),
                  ),
                  FilledButton(
                    onPressed: saving
                        ? null
                        : () async {
                            setState(() {
                              saving = true;
                              error = null;
                            });
                            try {
                              for (final doc in missing) {
                                await repository.acceptAgreement(
                                  doc.docType,
                                  currentAgreementVersion,
                                );
                              }
                              ref.invalidate(meProvider);
                              if (dialogContext.mounted) {
                                Navigator.of(dialogContext).pop(true);
                              }
                            } catch (_) {
                              if (context.mounted) {
                                setState(() {
                                  saving = false;
                                  error =
                                      'Your acceptance could not be saved. Please try again.';
                                });
                              }
                            }
                          },
                    child: Text(saving ? 'Saving…' : 'Agree and continue'),
                  ),
                ],
              ),
            ),
          ),
        ) ??
        false;
  } catch (_) {
    if (context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Your account could not be checked. Please try again.'),
        ),
      );
    }
    return false;
  }
}
