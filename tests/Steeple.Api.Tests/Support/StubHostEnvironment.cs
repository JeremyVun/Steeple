using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Hosting;

namespace Steeple.Api.Tests.Support;

/// <summary>An <see cref="IHostEnvironment"/> for services whose behaviour differs by environment.</summary>
internal sealed class StubHostEnvironment(string? environmentName = null) : IHostEnvironment
{
    public string EnvironmentName { get; set; } = environmentName ?? Environments.Development;

    public string ApplicationName { get; set; } = "Steeple.Api.Tests";

    public string ContentRootPath { get; set; } = AppContext.BaseDirectory;

    public IFileProvider ContentRootFileProvider { get; set; } = new NullFileProvider();
}
