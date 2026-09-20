/// Additive payload carried by `event: invalidate`; it intentionally has no content.
class NotificationInvalidation {
  const NotificationInvalidation();

  factory NotificationInvalidation.fromJson(Map<String, dynamic> json) =>
      const NotificationInvalidation();

  Map<String, dynamic> toJson() => const <String, dynamic>{};
}
