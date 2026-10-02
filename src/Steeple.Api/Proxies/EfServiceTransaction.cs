using System.Runtime.CompilerServices;
using Microsoft.EntityFrameworkCore;

namespace Steeple.Api.Proxies;

public sealed class EfServiceTransaction(SteepleDbContext db, ILogger<EfServiceTransaction> logger) : IServiceTransaction
{
    private static readonly ConditionalWeakTable<SteepleDbContext, TransactionState> States = new();
    private readonly TransactionState _state = States.GetValue(db, _ => new TransactionState());

    public async Task<T> RunAsync<T>(Func<Task<T>> operation, CancellationToken ct = default)
    {
        if (_state.Active)
        {
            return await operation().ConfigureAwait(false);
        }

        T result;
        List<Func<Task>> callbacks;
        await using (var transaction = await db.Database.BeginTransactionAsync(ct).ConfigureAwait(false))
        {
            _state.Active = true;
            try
            {
                result = await operation().ConfigureAwait(false);
                await transaction.CommitAsync(ct).ConfigureAwait(false);
                callbacks = [.. _state.AfterCommit];
            }
            catch
            {
                await transaction.RollbackAsync(CancellationToken.None).ConfigureAwait(false);
                db.ChangeTracker.Clear();
                throw;
            }
            finally
            {
                _state.Active = false;
                _state.AfterCommit.Clear();
            }
        }

        foreach (var callback in callbacks)
        {
            try
            {
                await callback().ConfigureAwait(false);
            }
            catch (Exception exception)
            {
                logger.LogError(exception, "Post-commit action failed; the domain change remains committed.");
            }
        }
        return result;
    }

    public async Task RunAsync(Func<Task> operation, CancellationToken ct = default) =>
        await RunAsync(async () =>
        {
            await operation().ConfigureAwait(false);
            return true;
        }, ct).ConfigureAwait(false);

    public Task AfterCommitAsync(Func<Task> action)
    {
        if (!_state.Active)
        {
            return action();
        }
        _state.AfterCommit.Add(action);
        return Task.CompletedTask;
    }

    private sealed class TransactionState
    {
        public bool Active { get; set; }
        public List<Func<Task>> AfterCommit { get; } = [];
    }
}
