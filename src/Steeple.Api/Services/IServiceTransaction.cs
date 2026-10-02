namespace Steeple.Api.Services;

public interface IServiceTransaction
{
    Task<T> RunAsync<T>(Func<Task<T>> operation, CancellationToken ct = default);
    Task RunAsync(Func<Task> operation, CancellationToken ct = default);
    Task AfterCommitAsync(Func<Task> action);
}
