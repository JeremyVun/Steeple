using System.Globalization;
using Steeple.Api.Contracts.Applications;

namespace Steeple.Api.Services.Applications;

/// <summary>Validates and parses the venue-local schedule shared by submits and counter-offers.</summary>
internal static class ApplicationSchedulePolicy
{
    private static readonly TimeSpan MaxTermLength = TimeSpan.FromDays(366);

    internal const int MaxGroupSize = 1000;
    internal const int MaxTextLength = 2000;

    /// <summary>Returns a human-readable problem, or null when the submission is valid.</summary>
    internal static string? ValidateSubmission(SubmitApplicationRequest request)
    {
        if (!TryParseActivity(request.ActivityType))
        {
            return $"Unknown activity type '{request.ActivityType}'.";
        }

        if (request.GroupSize is < 1 or > MaxGroupSize)
        {
            return $"Group size must be between 1 and {MaxGroupSize}.";
        }

        if (string.IsNullOrWhiteSpace(request.IntentText) || request.IntentText.Trim().Length > MaxTextLength)
        {
            return $"Tell the venue what you're planning (up to {MaxTextLength} characters).";
        }

        if (request.OrganizationName is { } org && org.Trim().Length > 200)
        {
            return "The group or organization name can be up to 200 characters.";
        }

        return ValidateSchedule(request.Schedule);
    }

    /// <summary>Returns a human-readable problem, or null when a venue-local schedule is valid.</summary>
    internal static string? ValidateSchedule(ScheduleDto? schedule)
    {
        if (schedule is null)
        {
            return "A proposed schedule is required.";
        }

        if (!Enum.TryParse<ScheduleFrequency>(schedule.Frequency, ignoreCase: true, out var frequency)
            || !Enum.IsDefined(frequency))
        {
            return $"Unknown frequency '{schedule.Frequency}'.";
        }

        if (!TryParseTime(schedule.StartTime, out var start) || !TryParseTime(schedule.EndTime, out var end))
        {
            return "Times must be HH:mm (24-hour), e.g. \"09:00\".";
        }

        if (end <= start)
        {
            return "The end time must be after the start time.";
        }

        // "Today" belongs to the venue's timezone, so callers check it after loading the room.
        if (frequency == ScheduleFrequency.RecurringWeekly)
        {
            if (schedule.EndDate is not { } endDate)
            {
                return "A recurring schedule needs an end date (recurring terms are always bounded).";
            }

            if (endDate < schedule.StartDate)
            {
                return "The end date can't be before the start date.";
            }

            if (endDate.DayNumber - schedule.StartDate.DayNumber > MaxTermLength.TotalDays)
            {
                return "A recurring term can run at most a year — renew it when it ends.";
            }

            if (schedule.DaysOfWeek is not { Count: > 0 } dayTokens)
            {
                return "A recurring schedule needs at least one day of the week.";
            }

            var days = FlagEnumExtensions.CombineTokens<Weekdays>(dayTokens, out var unknownDays);
            if (unknownDays.Count > 0)
            {
                return $"Unknown day of the week '{unknownDays[0]}'.";
            }

            if (days == Weekdays.None)
            {
                return "A recurring schedule needs at least one day of the week.";
            }

            if (!ScheduleMaterializer.WeekdaysOccurBetween(days, schedule.StartDate, endDate))
            {
                return "None of the selected days fall between the start and end dates.";
            }
        }
        else if (schedule.EndDate is { } endDate && endDate != schedule.StartDate)
        {
            return "A one-off request has a single date — leave the end date empty.";
        }

        return null;
    }

    /// <summary>Parses an already validated schedule into its stored venue-local representation.</summary>
    internal static ParsedApplicationSchedule Parse(ScheduleDto schedule)
    {
        var frequency = Enum.Parse<ScheduleFrequency>(schedule.Frequency, ignoreCase: true);
        return new ParsedApplicationSchedule(
            frequency,
            schedule.StartDate,
            frequency == ScheduleFrequency.RecurringWeekly ? schedule.EndDate : schedule.StartDate,
            frequency == ScheduleFrequency.RecurringWeekly
                ? FlagEnumExtensions.CombineTokens<Weekdays>(schedule.DaysOfWeek!, out _)
                : null,
            TimeOnly.ParseExact(schedule.StartTime, "HH:mm", CultureInfo.InvariantCulture),
            TimeOnly.ParseExact(schedule.EndTime, "HH:mm", CultureInfo.InvariantCulture));
    }

    internal static ActivityType ParseActivity(string token) =>
        Enum.Parse<ActivityType>(token, ignoreCase: true);

    internal static DateOnly VenueLocalToday(string timezone, DateTimeOffset now) =>
        DateOnly.FromDateTime(
            TimeZoneInfo.ConvertTime(now, TimeZoneInfo.FindSystemTimeZoneById(timezone)).DateTime);

    private static bool TryParseTime(string? value, out TimeOnly time) =>
        TimeOnly.TryParseExact(value, "HH:mm", CultureInfo.InvariantCulture, DateTimeStyles.None, out time);

    private static bool TryParseActivity(string? token) =>
        Enum.TryParse<ActivityType>(token, ignoreCase: true, out var parsed)
        && parsed != ActivityType.None
        && Enum.IsDefined(parsed);
}

internal readonly record struct ParsedApplicationSchedule(
    ScheduleFrequency Frequency,
    DateOnly StartDate,
    DateOnly? EndDate,
    Weekdays? DaysOfWeek,
    TimeOnly StartTime,
    TimeOnly EndTime);
