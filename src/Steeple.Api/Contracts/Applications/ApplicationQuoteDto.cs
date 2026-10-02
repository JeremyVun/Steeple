namespace Steeple.Api.Contracts.Applications;
/// <summary>
/// The room terms the organizer reviewed when submitting an application. These terms are stored
/// with the application and become the booking's agreement if it is confirmed.
/// </summary>
public record ApplicationQuoteDto(decimal PricePerHour, string Currency, string HouseRules);
