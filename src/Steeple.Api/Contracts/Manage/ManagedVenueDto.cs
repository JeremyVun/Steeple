
namespace Steeple.Api.Contracts.Manage;
/// <summary>
/// A venue the caller manages (<c>GET /api/v1/manage/venues</c>, CONTRACTS §6). Deliberately
/// slim — enough for a provider surface to label itself and route; full CRUD arrives in Phase 5.
/// </summary>
public record ManagedVenueDto(Guid Id, string Name, string Slug);
