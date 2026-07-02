using Steeple.Admin.ViewModels.Admin;

namespace Steeple.Admin.Services.Admin;

public interface IAdminWorkspace
{
    AdminWorkspaceViewModel Snapshot();

    void ToggleFeatureFlag(string key, bool enabled);

    void UpdateListingStatuses(IReadOnlyCollection<Guid> listingIds, string status);

    void UpdateUserStatuses(IReadOnlyCollection<Guid> userIds, string status);
}
