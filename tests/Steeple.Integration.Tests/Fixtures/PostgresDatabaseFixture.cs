using Npgsql;
using Testcontainers.PostgreSql;

namespace Steeple.Integration.Tests.Fixtures;
/// <summary>
/// Starts a single <c>postgres:18-alpine</c> Testcontainer for the whole collection, then applies
/// the Liquibase-owned schema + seed (<c>db/changelog/001-schema.sql</c>, <c>002-seed.sql</c>) by
/// executing each file's full contents as a raw script. Both files are Liquibase *formatted SQL*
/// — every Liquibase directive is a <c>--</c> line comment — so running them verbatim through
/// Npgsql is valid and keeps this project from having to depend on Liquibase itself.
/// </summary>
public sealed class PostgresDatabaseFixture : IAsyncLifetime
{
    private readonly PostgreSqlContainer _container = new PostgreSqlBuilder("postgres:18-alpine")
        .Build();

    /// <summary>Connection string for the running container; valid only after <see cref="InitializeAsync"/>.</summary>
    public string ConnectionString { get; private set; } = "";

    /// <inheritdoc />
    public async Task InitializeAsync()
    {
        await _container.StartAsync();
        ConnectionString = _container.GetConnectionString();
        await ApplyChangelogAsync();
    }

    /// <inheritdoc />
    public async Task DisposeAsync() => await _container.DisposeAsync();

    private async Task ApplyChangelogAsync()
    {
        var changelogDir = Path.Combine(FindRepoRoot(), "db", "changelog");
        var schemaSql = await File.ReadAllTextAsync(Path.Combine(changelogDir, "001-schema.sql"));
        var seedSql = await File.ReadAllTextAsync(Path.Combine(changelogDir, "002-seed.sql"));

        await using var connection = new NpgsqlConnection(ConnectionString);
        await connection.OpenAsync();

        await using (var schemaCommand = new NpgsqlCommand(schemaSql, connection))
        {
            await schemaCommand.ExecuteNonQueryAsync();
        }

        await using (var seedCommand = new NpgsqlCommand(seedSql, connection))
        {
            await seedCommand.ExecuteNonQueryAsync();
        }
    }

    /// <summary>Walks up from the test assembly's output directory until it finds the repo root (the directory containing <c>Steeple.slnx</c>).</summary>
    private static string FindRepoRoot()
    {
        var dir = new DirectoryInfo(AppContext.BaseDirectory);
        while (dir is not null && !File.Exists(Path.Combine(dir.FullName, "Steeple.slnx")))
        {
            dir = dir.Parent;
        }

        return dir?.FullName
            ?? throw new InvalidOperationException(
                $"Could not locate Steeple.slnx by walking up from {AppContext.BaseDirectory}.");
    }
}

/// <summary>xUnit collection binding so every test class in the collection shares one container/database.</summary>
[CollectionDefinition(Name)]
public sealed class PostgresCollection : ICollectionFixture<PostgresDatabaseFixture>
{
    public const string Name = "Postgres";
}
