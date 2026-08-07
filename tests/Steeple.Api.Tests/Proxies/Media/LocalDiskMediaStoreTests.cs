using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Options;

namespace Steeple.Api.Tests.Proxies.Media;

public sealed class LocalDiskMediaStoreTests
{
    [Fact]
    public async Task PutAsync_StoresBytesAndReturnsOriginIndependentPath()
    {
        var contentRoot = Path.Combine(Path.GetTempPath(), $"steeple-media-{Guid.NewGuid():N}");
        try
        {
            var options = Options.Create(new MediaOptions
            {
                LocalRoot = "media-store",
                PublicBaseUrl = "http://localhost:9999",
            });
            var store = new LocalDiskMediaStore(options, new TestHostEnvironment(contentRoot));

            var url = await store.PutAsync("rooms/one/photo-400.jpg", [1, 2, 3], "image/jpeg");

            Assert.Equal("media/rooms/one/photo-400.jpg", url);
            Assert.Equal(
                [1, 2, 3],
                await File.ReadAllBytesAsync(Path.Combine(contentRoot, "media-store", "rooms", "one", "photo-400.jpg")));
        }
        finally
        {
            if (Directory.Exists(contentRoot))
            {
                Directory.Delete(contentRoot, recursive: true);
            }
        }
    }

    private sealed class TestHostEnvironment(string contentRoot) : IHostEnvironment
    {
        public string EnvironmentName { get; set; } = Environments.Development;
        public string ApplicationName { get; set; } = "Steeple.Api.Tests";
        public string ContentRootPath { get; set; } = contentRoot;
        public IFileProvider ContentRootFileProvider { get; set; } = new NullFileProvider();
    }
}
