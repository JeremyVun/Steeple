import 'user.dart';

/// Keep in step with the API policy and the versioned public legal pages.
const currentAgreementVersion = '2026-09-20';
const legalDocuments = [
  (docType: 'tos', label: 'Terms & safety', path: 'terms.html'),
  (docType: 'privacy', label: 'Privacy policy', path: 'privacy.html'),
];

bool hasCurrentAgreements(List<Agreement> agreements) => legalDocuments.every(
  (doc) => agreements.any(
    (accepted) =>
        accepted.docType == doc.docType &&
        accepted.version == currentAgreementVersion,
  ),
);
