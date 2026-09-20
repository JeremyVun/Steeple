using Microsoft.Extensions.Options;
using Steeple.Api.Contracts.Payments;
using Steeple.Api.Services.Manage;

namespace Steeple.Api.Services.Payments;

public sealed class HostPaymentOnboardingService : IHostPaymentOnboardingService
{
    public const string OnboardingFlag = FeatureFlagKeys.PaymentsOnboarding;

    private readonly IPaymentRepository _repository;
    private readonly IConnectOnboardingGateway _gateway;
    private readonly IVenueManagerRepository _venueManagers;
    private readonly IAnalyticsSink _analytics;
    private readonly TimeProvider _clock;
    private readonly ConnectOptions _options;

    public HostPaymentOnboardingService(
        IPaymentRepository repository,
        IConnectOnboardingGateway gateway,
        IVenueManagerRepository venueManagers,
        IAnalyticsSink analytics,
        TimeProvider clock,
        IOptions<PaymentsOptions> options)
    {
        _repository = repository;
        _gateway = gateway;
        _venueManagers = venueManagers;
        _analytics = analytics;
        _clock = clock;
        _options = options.Value.Connect;
    }

    public async Task<PaymentResult<OnboardingLinkDto>> StartAsync(
        Guid callerId, Guid venueId, CancellationToken ct = default)
    {
        if (!await IsManagerAsync(callerId, venueId, ct).ConfigureAwait(false))
        {
            return NotFound<OnboardingLinkDto>();
        }

        try
        {
            var now = _clock.GetUtcNow();
            var account = await _repository.GetOrCreateVenueProvisioningAsync(
                venueId, _gateway.Provider, now, ct).ConfigureAwait(false);
            if (!account.Provider.Equals(_gateway.Provider, StringComparison.Ordinal))
            {
                return ProviderUnavailable<OnboardingLinkDto>();
            }
            var wasProvisioned = account.ProviderAccountId is not null;
            ProviderAccountSnapshot? snapshot = null;
            if (account.ProviderAccountId is null)
            {
                snapshot = await _gateway.FindOrCreateAccountAsync(venueId, account.ProvisioningKey, ct).ConfigureAwait(false);
                account.ProviderAccountId = snapshot.Id;
                await _repository.SaveAsync(ct).ConfigureAwait(false);
                if (!wasProvisioned)
                {
                    await TrackSafelyAsync("payout_onboarding_started", new { venueId }, ct).ConfigureAwait(false);
                }
            }
            else if (_gateway.IsMock)
            {
                snapshot = ToSnapshot(account);
            }

            if (_gateway.IsMock)
            {
                Apply(account, snapshot!, now);
                await _repository.SaveAsync(ct).ConfigureAwait(false);
            }
            else
            {
                await RefreshAccountAsync(account, ct).ConfigureAwait(false);
            }

            var returnUrl = _gateway.IsMock ? "" : BuildReturnUrl(venueId, "return");
            var refreshUrl = _gateway.IsMock ? "" : BuildReturnUrl(venueId, "refresh");
            var url = await _gateway.CreateAccountLinkAsync(account.ProviderAccountId!, returnUrl, refreshUrl, ct).ConfigureAwait(false);
            return PaymentResult<OnboardingLinkDto>.Ok(new OnboardingLinkDto(url, _gateway.IsMock));
        }
        catch (ConnectProviderException)
        {
            return ProviderUnavailable<OnboardingLinkDto>();
        }
    }

    public async Task<PaymentResult<VenuePaymentStateDto>> GetAsync(
        Guid callerId, Guid venueId, CancellationToken ct = default)
    {
        if (!await IsManagerAsync(callerId, venueId, ct).ConfigureAwait(false))
        {
            return NotFound<VenuePaymentStateDto>();
        }

        var account = await _repository.GetVenueAccountAsync(venueId, ct).ConfigureAwait(false);
        if (account is not null && !account.Provider.Equals(_gateway.Provider, StringComparison.Ordinal))
        {
            if (account.Provider.Equals("mock", StringComparison.Ordinal)
                && _gateway.Provider.Equals("stripe", StringComparison.Ordinal))
            {
                return PaymentResult<VenuePaymentStateDto>.Ok(ToState(null));
            }
            return ProviderUnavailable<VenuePaymentStateDto>();
        }
        if (account?.ProviderAccountId is not null && !_gateway.IsMock)
        {
            try
            {
                await RefreshAccountAsync(account, ct).ConfigureAwait(false);
            }
            catch (ConnectProviderException)
            {
                return ProviderUnavailable<VenuePaymentStateDto>();
            }
        }

        return PaymentResult<VenuePaymentStateDto>.Ok(ToState(account));
    }

    public async Task<PaymentResult<VenuePaymentStateDto>> SetOptInAsync(
        Guid callerId, Guid venueId, bool optedIn, CancellationToken ct = default)
    {
        if (!await IsManagerAsync(callerId, venueId, ct).ConfigureAwait(false))
        {
            return NotFound<VenuePaymentStateDto>();
        }

        var account = await _repository.GetVenueAccountAsync(venueId, ct).ConfigureAwait(false);
        if (account is not null && !account.Provider.Equals(_gateway.Provider, StringComparison.Ordinal))
        {
            return ProviderUnavailable<VenuePaymentStateDto>();
        }
        if (account is null)
        {
            return optedIn
                ? AccountNotReady<VenuePaymentStateDto>()
                : PaymentResult<VenuePaymentStateDto>.Ok(ToState(null));
        }

        if (!optedIn)
        {
            if (account.ProviderAccountId is null)
            {
                var changed = account.OptedInAtUtc is not null;
                account.OptedInAtUtc = null;
                account.UpdatedAtUtc = _clock.GetUtcNow();
                await _repository.SaveAsync(ct).ConfigureAwait(false);
                if (changed)
                {
                    await TrackSafelyAsync("payout_preference_changed", new { venueId, optedIn = false }, ct).ConfigureAwait(false);
                }
                return PaymentResult<VenuePaymentStateDto>.Ok(ToState(account));
            }

            await _repository.AcquireAccountStateLockAsync(account.ProviderAccountId, ct).ConfigureAwait(false);
            try
            {
                await _repository.ReloadVenueAccountAsync(account, ct).ConfigureAwait(false);
                var changed = account.OptedInAtUtc is not null;
                account.OptedInAtUtc = null;
                account.UpdatedAtUtc = _clock.GetUtcNow();
                await _repository.SaveAsync(ct).ConfigureAwait(false);
                if (changed)
                {
                    await TrackSafelyAsync("payout_preference_changed", new { venueId, optedIn = false }, ct).ConfigureAwait(false);
                }
                return PaymentResult<VenuePaymentStateDto>.Ok(ToState(account));
            }
            finally
            {
                await _repository.ReleaseAccountStateLockAsync(account.ProviderAccountId, CancellationToken.None).ConfigureAwait(false);
            }
        }

        if (account.ProviderAccountId is null)
        {
            return AccountNotReady<VenuePaymentStateDto>();
        }

        await _repository.AcquireAccountStateLockAsync(account.ProviderAccountId, ct).ConfigureAwait(false);
        try
        {
            await _repository.ReloadVenueAccountAsync(account, ct).ConfigureAwait(false);
            if (!_gateway.IsMock)
            {
                var snapshot = await _gateway.RetrieveAccountAsync(account.ProviderAccountId, ct).ConfigureAwait(false);
                Apply(account, snapshot, _clock.GetUtcNow());
            }
            if (!IsReady(account))
            {
                return AccountNotReady<VenuePaymentStateDto>();
            }

            var changed = account.OptedInAtUtc is null;
            account.OptedInAtUtc ??= _clock.GetUtcNow();
            account.UpdatedAtUtc = _clock.GetUtcNow();
            await _repository.SaveAsync(ct).ConfigureAwait(false);
            if (changed)
            {
                await TrackSafelyAsync("payout_preference_changed", new { venueId, optedIn = true }, ct).ConfigureAwait(false);
            }
            return PaymentResult<VenuePaymentStateDto>.Ok(ToState(account));
        }
        catch (ConnectProviderException)
        {
            return ProviderUnavailable<VenuePaymentStateDto>();
        }
        finally
        {
            await _repository.ReleaseAccountStateLockAsync(account.ProviderAccountId, CancellationToken.None).ConfigureAwait(false);
        }
    }

    public async Task<PaymentResult<DashboardLinkDto>> CreateDashboardLinkAsync(
        Guid callerId, Guid venueId, CancellationToken ct = default)
    {
        var state = await GetAsync(callerId, venueId, ct).ConfigureAwait(false);
        if (state.Error is not null)
        {
            return PaymentResult<DashboardLinkDto>.Fail(state.Error.Code, state.Error.Detail);
        }

        var account = await _repository.GetVenueAccountAsync(venueId, ct).ConfigureAwait(false);
        if (account?.ProviderAccountId is null || !state.Value!.CanOpenDashboard)
        {
            return AccountNotReady<DashboardLinkDto>();
        }

        try
        {
            var url = await _gateway.CreateDashboardLinkAsync(account.ProviderAccountId, ct).ConfigureAwait(false);
            return PaymentResult<DashboardLinkDto>.Ok(new DashboardLinkDto(url, Mock: false));
        }
        catch (ConnectProviderException)
        {
            return ProviderUnavailable<DashboardLinkDto>();
        }
    }

    public async Task<PaymentResult<VenuePaymentStateDto>> CompleteMockAsync(
        Guid callerId, Guid venueId, CancellationToken ct = default)
    {
        if (!await IsManagerAsync(callerId, venueId, ct).ConfigureAwait(false))
        {
            return NotFound<VenuePaymentStateDto>();
        }

        var account = await _repository.GetVenueAccountAsync(venueId, ct).ConfigureAwait(false);
        if (account?.ProviderAccountId is null || !_gateway.IsMock
            || !account.Provider.Equals(_gateway.Provider, StringComparison.Ordinal))
        {
            return PaymentResult<VenuePaymentStateDto>.Fail(
                PaymentErrorCodes.InvalidPayment, "Start mock onboarding first.");
        }

        var now = _clock.GetUtcNow();
        account.DetailsSubmitted = true;
        account.ChargesEnabled = true;
        account.PayoutsEnabled = true;
        account.RequirementsDue = [];
        account.DisabledReason = null;
        account.OptedInAtUtc ??= now;
        account.UpdatedAtUtc = now;
        await _repository.SaveAsync(ct).ConfigureAwait(false);
        await TrackSafelyAsync("payout_onboarding_completed", new { venueId }, ct).ConfigureAwait(false);
        return PaymentResult<VenuePaymentStateDto>.Ok(ToState(account));
    }

    public async Task<PaymentResult<WebhookReceiptDto>> ProcessWebhookAsync(
        string payload, string signature, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(_options.WebhookSecret))
        {
            return ProviderUnavailable<WebhookReceiptDto>();
        }

        VerifiedConnectEvent verified;
        try
        {
            verified = _gateway.VerifyWebhook(payload, signature, _options.WebhookSecret);
        }
        catch (ConnectWebhookSignatureException)
        {
            return PaymentResult<WebhookReceiptDto>.Fail(
                PaymentErrorCodes.InvalidWebhookSignature, "The webhook signature is invalid.");
        }
        catch (ConnectProviderException)
        {
            return ProviderUnavailable<WebhookReceiptDto>();
        }

        if (verified.LiveMode)
        {
            return PaymentResult<WebhookReceiptDto>.Fail(
                PaymentErrorCodes.InvalidWebhookSignature, "Live payment events are not supported.");
        }

        if (!verified.Type.Equals("account.updated", StringComparison.Ordinal))
        {
            return PaymentResult<WebhookReceiptDto>.Ok(new WebhookReceiptDto(true));
        }

        var providerAccountId = verified.ProviderAccountId ?? verified.ProviderObjectId;
        if (string.IsNullOrWhiteSpace(providerAccountId))
        {
            return PaymentResult<WebhookReceiptDto>.Fail(
                PaymentErrorCodes.InvalidPayment, "The verified event has no account id.");
        }

        var now = _clock.GetUtcNow();
        await _repository.AcquireAccountStateLockAsync(providerAccountId, ct).ConfigureAwait(false);
        try
        {
            var (ledger, _) = await _repository.GetOrAddWebhookEventAsync(new PaymentWebhookEvent
            {
                Source = "connect",
                ProviderEventId = verified.Id,
                Type = verified.Type,
                ProviderAccountId = providerAccountId,
                ProviderObjectId = verified.ProviderObjectId,
                ReceivedAtUtc = now,
            }, ct).ConfigureAwait(false);
            if (ledger.ProcessedAtUtc is not null)
            {
                return PaymentResult<WebhookReceiptDto>.Ok(new WebhookReceiptDto(true));
            }

            ledger.Attempts++;
            try
            {
                var snapshot = await _gateway.RetrieveAccountAsync(providerAccountId, ct).ConfigureAwait(false);
                var account = await _repository.GetVenueAccountByProviderIdAsync(providerAccountId, ct).ConfigureAwait(false);
                var completedNow = false;
                if (account is not null)
                {
                    completedNow = !account.DetailsSubmitted && snapshot.DetailsSubmitted;
                    Apply(account, snapshot, now);
                }
                ledger.ProcessedAtUtc = now;
                ledger.LastError = null;
                await _repository.SaveAsync(ct).ConfigureAwait(false);
                if (completedNow)
                {
                    await TrackSafelyAsync("payout_onboarding_completed", new { venueId = account!.VenueId }, ct).ConfigureAwait(false);
                }
                return PaymentResult<WebhookReceiptDto>.Ok(new WebhookReceiptDto(true));
            }
            catch (ConnectProviderException)
            {
                ledger.LastError = "provider_unavailable";
                await _repository.SaveAsync(ct).ConfigureAwait(false);
                return ProviderUnavailable<WebhookReceiptDto>();
            }
        }
        finally
        {
            await _repository.ReleaseAccountStateLockAsync(providerAccountId, CancellationToken.None).ConfigureAwait(false);
        }
    }

    private async Task RefreshAccountAsync(VenuePaymentAccount account, CancellationToken ct)
    {
        var providerAccountId = account.ProviderAccountId!;
        await _repository.AcquireAccountStateLockAsync(providerAccountId, ct).ConfigureAwait(false);
        try
        {
            await _repository.ReloadVenueAccountAsync(account, ct).ConfigureAwait(false);
            var snapshot = await _gateway.RetrieveAccountAsync(providerAccountId, ct).ConfigureAwait(false);
            var completedNow = !account.DetailsSubmitted && snapshot.DetailsSubmitted;
            Apply(account, snapshot, _clock.GetUtcNow());
            await _repository.SaveAsync(ct).ConfigureAwait(false);
            if (completedNow)
            {
                await TrackSafelyAsync("payout_onboarding_completed", new { venueId = account.VenueId }, ct).ConfigureAwait(false);
            }
        }
        finally
        {
            await _repository.ReleaseAccountStateLockAsync(providerAccountId, CancellationToken.None).ConfigureAwait(false);
        }
    }

    private Task<bool> IsManagerAsync(Guid callerId, Guid venueId, CancellationToken ct) =>
        _venueManagers.IsManagerAsync(callerId, venueId, ct);

    private string BuildReturnUrl(Guid venueId, string outcome) =>
        $"{_options.WebBaseUrl.TrimEnd('/')}/desk?paymentVenue={venueId:D}&paymentReturn={outcome}";

    private static void Apply(VenuePaymentAccount account, ProviderAccountSnapshot snapshot, DateTimeOffset now)
    {
        account.ProviderAccountId = snapshot.Id;
        account.DetailsSubmitted = snapshot.DetailsSubmitted;
        account.ChargesEnabled = snapshot.ChargesEnabled;
        account.PayoutsEnabled = snapshot.PayoutsEnabled;
        account.RequirementsDue = [.. snapshot.RequirementsDue.Distinct(StringComparer.Ordinal).Order()];
        account.DisabledReason = snapshot.DisabledReason;
        account.UpdatedAtUtc = now;
    }

    private static ProviderAccountSnapshot ToSnapshot(VenuePaymentAccount account) => new(
        account.ProviderAccountId!, account.DetailsSubmitted, account.ChargesEnabled,
        account.PayoutsEnabled, account.RequirementsDue, account.DisabledReason);

    private VenuePaymentStateDto ToState(VenuePaymentAccount? account)
    {
        var ready = account is not null && IsReady(account);
        var status = account switch
        {
            null => PaymentAccountStatus.NotStarted,
            _ when ready => PaymentAccountStatus.Ready,
            { DisabledReason: not null } when !account.DisabledReason.Equals(
                "requirements.pending_verification", StringComparison.Ordinal) => PaymentAccountStatus.Restricted,
            { DetailsSubmitted: true } when account.RequirementsDue.Length == 0 => PaymentAccountStatus.Pending,
            _ => PaymentAccountStatus.Incomplete,
        };

        return new VenuePaymentStateDto(
            account is not null,
            account?.DetailsSubmitted ?? false,
            account?.ChargesEnabled ?? false,
            account?.PayoutsEnabled ?? false,
            account?.OptedInAtUtc is not null,
            null,
            _gateway.IsMock,
            FlagEnumExtensions.ToCamelCaseToken(status.ToString()),
            account?.RequirementsDue ?? [],
            account?.DisabledReason,
            true,
            !_gateway.IsMock && account?.DetailsSubmitted == true,
            false);
    }

    private static bool IsReady(VenuePaymentAccount account) =>
        account.DetailsSubmitted && account.ChargesEnabled && account.PayoutsEnabled
        && account.RequirementsDue.Length == 0 && account.DisabledReason is null;

    private static PaymentResult<T> NotFound<T>() where T : class =>
        PaymentResult<T>.Fail(PaymentErrorCodes.NotFound, "No such venue.");

    private static PaymentResult<T> ProviderUnavailable<T>() where T : class =>
        PaymentResult<T>.Fail(PaymentErrorCodes.ProviderUnavailable, "The payment provider is temporarily unavailable.");

    private static PaymentResult<T> AccountNotReady<T>() where T : class =>
        PaymentResult<T>.Fail(PaymentErrorCodes.AccountNotReady, "Complete payment account setup before opting in.");

    private async Task TrackSafelyAsync(string eventType, object payload, CancellationToken ct)
    {
        try
        {
            await _analytics.TrackAsync(eventType, payload, ct: ct).ConfigureAwait(false);
        }
        catch
        {
        }
    }
}
