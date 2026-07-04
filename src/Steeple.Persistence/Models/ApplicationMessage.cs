
namespace Steeple.Persistence.Models;
/// <summary>
/// One message on an <see cref="Models.Application"/>'s ask thread. Either party may write while
/// the application is undecided.
/// </summary>
public class ApplicationMessage
{
    /// <summary>Primary key.</summary>
    public Guid Id { get; set; }

    /// <summary>Foreign key to the parent application.</summary>
    public Guid ApplicationId { get; set; }

    /// <summary>Foreign key to the writing user.</summary>
    public Guid SenderId { get; set; }

    /// <summary>Message text.</summary>
    public string Body { get; set; } = "";

    /// <summary>Send timestamp (UTC).</summary>
    public DateTimeOffset SentAtUtc { get; set; }

    /// <summary>Navigation to the parent application.</summary>
    public Application? Application { get; set; }

    /// <summary>Navigation to the writing user.</summary>
    public User? Sender { get; set; }
}
