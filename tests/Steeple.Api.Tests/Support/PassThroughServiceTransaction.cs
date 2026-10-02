namespace Steeple.Api.Tests.Support;

internal sealed class PassThroughServiceTransaction : IServiceTransaction
{
    public Task<T> RunAsync<T>(Func<Task<T>> operation, CancellationToken ct = default) => operation();
    public Task RunAsync(Func<Task> operation, CancellationToken ct = default) => operation();
    public Task AfterCommitAsync(Func<Task> action) => action();
}
