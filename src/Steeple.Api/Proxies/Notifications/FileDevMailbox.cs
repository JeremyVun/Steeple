using System.Text.Json;
using Steeple.Api.Services.Notifications;

namespace Steeple.Api.Proxies.Notifications;
/// <summary>
/// <see cref="IDevMailbox"/> backed by a JSON-lines file under the content root
/// (<c>dev-mailbox/mail.jsonl</c>), mirrored in memory. File-backed so a dev-loop API restart
/// — routine while iterating — doesn't lose the mail you were about to click. The ring is capped;
/// older lines are dropped on rewrite. Development only.
/// </summary>
public sealed class FileDevMailbox : IDevMailbox
{
    /// <summary>How many sends the mailbox keeps. A dev loop never needs more.</summary>
    private const int Capacity = 200;

    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    private readonly object _gate = new();
    private readonly List<CapturedEmail> _mail = [];
    private readonly string _path;
    private readonly ILogger<FileDevMailbox> _logger;

    /// <summary>Creates the mailbox and replays whatever the previous run left behind.</summary>
    public FileDevMailbox(IHostEnvironment environment, ILogger<FileDevMailbox> logger)
    {
        _logger = logger;
        _path = Path.Combine(environment.ContentRootPath, "dev-mailbox", "mail.jsonl");
        Directory.CreateDirectory(Path.GetDirectoryName(_path)!);
        Replay();
    }

    /// <inheritdoc />
    public void Capture(string toEmail, EmailContent content, DateTimeOffset sentAtUtc)
    {
        var captured = new CapturedEmail(
            Guid.NewGuid(), toEmail, content.Subject, content.TextBody, content.HtmlBody, sentAtUtc);

        lock (_gate)
        {
            _mail.Add(captured);
            var trimmed = _mail.Count > Capacity;
            if (trimmed)
            {
                _mail.RemoveRange(0, _mail.Count - Capacity);
            }

            try
            {
                if (trimmed)
                {
                    File.WriteAllLines(_path, _mail.Select(m => JsonSerializer.Serialize(m, Json)));
                }
                else
                {
                    File.AppendAllLines(_path, [JsonSerializer.Serialize(captured, Json)]);
                }
            }
            catch (IOException ex)
            {
                // The in-memory copy still serves this session — never fail a send over dev tooling.
                _logger.LogWarning(ex, "Dev mailbox could not write {Path}.", _path);
            }
        }
    }

    /// <inheritdoc />
    public IReadOnlyList<CapturedEmail> List()
    {
        lock (_gate)
        {
            return _mail.AsEnumerable().Reverse().ToList();
        }
    }

    /// <inheritdoc />
    public CapturedEmail? Get(Guid id)
    {
        lock (_gate)
        {
            return _mail.FirstOrDefault(m => m.Id == id);
        }
    }

    private void Replay()
    {
        if (!File.Exists(_path))
        {
            return;
        }

        try
        {
            foreach (var line in File.ReadLines(_path))
            {
                if (line.Length > 0 && JsonSerializer.Deserialize<CapturedEmail>(line, Json) is { } mail)
                {
                    _mail.Add(mail);
                }
            }

            if (_mail.Count > Capacity)
            {
                _mail.RemoveRange(0, _mail.Count - Capacity);
            }
        }
        catch (Exception ex) when (ex is IOException or JsonException)
        {
            _logger.LogWarning(ex, "Dev mailbox could not replay {Path}; starting empty.", _path);
            _mail.Clear();
        }
    }
}
