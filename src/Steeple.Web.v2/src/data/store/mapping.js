import { ACCESS_LABELS, ACTIVITY_LABELS, AMENITY_LABELS, toLabels } from '../vocabulary.js';
import { DAY_LABELS } from './model.js';
import { daysToMask } from './schedule.js';

const nowIso = () => new Date().toISOString();

/** Steeple's ScheduleDto in the product vocabulary. */
export function fromWireSchedule(schedule = {}) {
  const weekly = schedule.frequency === 'recurringWeekly';
  const days = (schedule.daysOfWeek ?? []).map((name) =>
    DAY_LABELS.findIndex((label) => label.toLowerCase() === String(name).toLowerCase())
  );
  return {
    frequency: weekly ? 'weekly' : 'oneOff',
    startDate: schedule.startDate ?? null,
    endDate: weekly ? (schedule.endDate ?? null) : null,
    daysOfWeekMask: weekly ? daysToMask(days.filter((day) => day >= 0)) : null,
    startTime: (schedule.startTime ?? '').slice(0, 5),
    endTime: (schedule.endTime ?? '').slice(0, 5),
  };
}

/** Steeple's ApplicationDto in the product vocabulary. */
export function fromWireApplication(dto) {
  return {
    id: dto.id,
    venueId: dto.venueSlug,
    roomId: dto.roomSlug,
    remoteRoomId: dto.roomId,
    roomName: dto.roomName ?? null,
    venueName: dto.venueName ?? null,
    organizerId: dto.organizer?.id ?? null,
    organizerName: dto.organizer?.displayName ?? null,
    organizerRating: dto.organizer?.ratingSummary ?? null,
    organizationName: dto.organizationName ?? null,
    hasPaymentMethod: dto.hasPaymentMethod === true,
    activityType: ACTIVITY_LABELS[String(dto.activityType ?? '').toLowerCase()] ?? dto.activityType,
    groupSize: dto.groupSize,
    intentText: dto.intentText ?? '',
    status: dto.status,
    ...fromWireSchedule(dto.schedule),
    createdAt: dto.createdAtUtc ?? nowIso(),
    decidedAt: dto.decidedAtUtc ?? null,
    expiresAt: dto.expiresAtUtc ?? null,
    bookingId: dto.bookingId ?? null,
    messageCount: dto.messageCount ?? 0,
  };
}

export function fromWireCounter(dto, applicationId) {
  return {
    id: dto.id,
    applicationId,
    ...fromWireSchedule(dto.schedule),
    message: dto.message ?? null,
    status: dto.status,
    createdAt: dto.createdAtUtc ?? nowIso(),
    respondedAt: dto.respondedAtUtc ?? null,
  };
}

/** Steeple's ManagedRoomDto in the product vocabulary. */
export function fromWireRoom(dto) {
  return {
    remoteId: dto.id,
    keptLocally: false,
    name: dto.name,
    description: dto.description,
    capacity: dto.capacity,
    pricePerHour: dto.pricePerHour,
    houseRules: dto.houseRules ?? '',
    activities: toLabels(dto.activities, ACTIVITY_LABELS),
    amenities: toLabels(dto.amenities, AMENITY_LABELS),
    accessibility: toLabels(dto.accessibility, ACCESS_LABELS),
    status: dto.status,
    publishRequestedAt: dto.publishRequestedAtUtc ?? null,
    photo: dto.photos?.find((photo) => photo.isPrimary)?.cardUrl ?? dto.photos?.[0]?.cardUrl ?? null,
  };
}
