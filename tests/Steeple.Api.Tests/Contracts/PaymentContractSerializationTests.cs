using System.Text.Json;
using Steeple.Api.Contracts.Payments;

namespace Steeple.Api.Tests.Contracts;

public sealed class PaymentContractSerializationTests
{
    [Fact]
    public void VenuePaymentState_RoundTripsWithWebJsonOptions()
    {
        var state = new VenuePaymentStateDto(
            true, true, false, false, true, null, false, "restricted",
            ["external_account"], "requirements.past_due", true, true, false);

        var json = JsonSerializer.Serialize(state, JsonSerializerOptions.Web);
        var roundTrip = JsonSerializer.Deserialize<VenuePaymentStateDto>(json, JsonSerializerOptions.Web);

        Assert.Equivalent(state, roundTrip, strict: true);
    }
}
