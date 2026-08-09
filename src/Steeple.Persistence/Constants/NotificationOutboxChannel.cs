namespace Steeple.Persistence.Constants;

/// <summary>External delivery channel represented by a notification outbox row.</summary>
public enum NotificationOutboxChannel
{
    /// <summary>Transactional email.</summary>
    Email = 0,

    /// <summary>FCM data-message push.</summary>
    Push = 1,
}
