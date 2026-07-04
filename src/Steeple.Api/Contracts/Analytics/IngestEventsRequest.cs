using System.Text.Json;

namespace Steeple.Api.Contracts.Analytics;
/// <summary><c>POST /api/v1/events</c> body (CONTRACTS §7): one client session's batch of funnel events.</summary>
public record IngestEventsRequest(string? SessionId, IReadOnlyList<IngestEventItem>? Events);

/// <summary>One client-sourced event in the batch — <see cref="Props"/> is an arbitrary (small) JSON object.</summary>
public record IngestEventItem(string? Name, DateTimeOffset? OccurredAt, JsonElement? Props);
