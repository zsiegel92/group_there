import { relations } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

export const users = pgTable(
  "users",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull().unique(),
    emailVerified: boolean("email_verified").default(false).notNull(),
    image: text("image"),
    isTestUser: boolean("is_test_user").default(false).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index("user_email_idx").on(table.email)]
);

export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at").notNull(),
    token: text("token").notNull().unique(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
  },
  (table) => [
    index("session_userId_idx").on(table.userId),
    index("session_token_idx").on(table.token),
  ]
);

export const accounts = pgTable(
  "accounts",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at"),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index("account_userId_idx").on(table.userId)]
);

export const verifications = pgTable(
  "verifications",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index("verification_identifier_idx").on(table.identifier)]
);

export const groupTypeValues = ["social", "testing"] as const;

export type GroupType = (typeof groupTypeValues)[number];

export const groupTypeEnum = pgEnum("group_type", groupTypeValues);

export const groups = pgTable("groups", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  secret: text("secret").notNull(), // hashed group secret for invite verification
  type: groupTypeEnum("type").default("social").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

export const groupsToUsers = pgTable(
  "groups_to_users",
  {
    groupId: text("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    isAdmin: boolean("is_admin").default(false).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.groupId, table.userId] }),
    index("groupsToUsers_groupId_idx").on(table.groupId),
    index("groupsToUsers_userId_idx").on(table.userId),
  ]
);

export const locationOwnerTypeValues = ["user", "event"] as const;

export type LocationOwnerType = (typeof locationOwnerTypeValues)[number];

export const locationOwnerTypeEnum = pgEnum(
  "location_owner_type",
  locationOwnerTypeValues
);

export const locations = pgTable(
  "locations",
  {
    id: text("id").primaryKey(),
    googlePlaceId: text("google_place_id"),
    name: text("name").notNull(),
    addressString: text("address_string").notNull(),
    street1: text("street1"),
    street2: text("street2"),
    city: text("city"),
    state: text("state"),
    zip: text("zip"),
    latitude: real("latitude"),
    longitude: real("longitude"),
    ownerType: locationOwnerTypeEnum("owner_type").notNull(),
    ownerId: text("owner_id").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("locations_ownerType_ownerId_idx").on(table.ownerType, table.ownerId),
    index("locations_googlePlaceId_idx").on(table.googlePlaceId),
  ]
);

export const drivingStatusEnumValues = [
  "cannot_drive",
  "must_drive",
  "can_drive_or_not",
] as const;

export type DrivingStatus = (typeof drivingStatusEnumValues)[number];

export const drivingStatusEnumValuesForDrivers: DrivingStatus[] = [
  "must_drive",
  "can_drive_or_not",
] as const;

export const drivingStatusEnumValuesForPassengers: DrivingStatus[] = [
  "can_drive_or_not",
  "cannot_drive",
] as const;

export const drivingStatusEnum = pgEnum(
  "driving_status",
  drivingStatusEnumValues
);

export const eventKindValues = ["shared_destination", "commute"] as const;

export type EventKind = (typeof eventKindValues)[number];

export const eventParticipationModeValues = ["opt_in", "opt_out"] as const;

export type EventParticipationMode =
  (typeof eventParticipationModeValues)[number];

export const eventSeriesParticipationStatusValues = [
  "joined",
  "paused",
  "declined",
] as const;

export type EventSeriesParticipationStatus =
  (typeof eventSeriesParticipationStatusValues)[number];

export const externalRideshareModeValues = [
  "disabled",
  "fallback",
  "always_available",
] as const;

export type ExternalRideshareMode =
  (typeof externalRideshareModeValues)[number];

export const solutionVehicleKindValues = [
  "participant_vehicle",
  "external_rideshare",
] as const;

export type SolutionVehicleKind = (typeof solutionVehicleKindValues)[number];

export const eventSeries = pgTable(
  "event_series",
  {
    id: text("id").primaryKey(),
    groupId: text("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    kind: text("kind")
      .$type<EventKind>()
      .default("shared_destination")
      .notNull(),
    name: text("name").notNull(),
    recurrenceRule: text("recurrence_rule"),
    timeZone: text("time_zone").default("America/New_York").notNull(),
    participationMode: text("participation_mode")
      .$type<EventParticipationMode>()
      .default("opt_in")
      .notNull(),
    createdByUserId: text("created_by_user_id").references(() => users.id),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("eventSeries_groupId_idx").on(table.groupId),
    index("eventSeries_kind_idx").on(table.kind),
  ]
);

export const eventSeriesToUsers = pgTable(
  "event_series_to_users",
  {
    eventSeriesId: text("event_series_id")
      .notNull()
      .references(() => eventSeries.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    participationStatus: text("participation_status")
      .$type<EventSeriesParticipationStatus>()
      .default("joined")
      .notNull(),
    defaultDrivingStatus: drivingStatusEnum("default_driving_status"),
    defaultCarFits: integer("default_car_fits"),
    defaultEarliestLeaveOffsetMinutes: integer(
      "default_earliest_leave_offset_minutes"
    ),
    defaultOriginLocationId: text("default_origin_location_id").references(
      () => locations.id
    ),
    defaultDestinationLocationId: text(
      "default_destination_location_id"
    ).references(() => locations.id),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.eventSeriesId, table.userId] }),
    index("eventSeriesToUsers_eventSeriesId_idx").on(table.eventSeriesId),
    index("eventSeriesToUsers_userId_idx").on(table.userId),
  ]
);

export const events = pgTable(
  "events",
  {
    id: text("id").primaryKey(),
    groupId: text("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    eventSeriesId: text("event_series_id").references(() => eventSeries.id, {
      onDelete: "set null",
    }),
    kind: text("kind")
      .$type<EventKind>()
      .default("shared_destination")
      .notNull(),
    name: text("name").notNull(),
    locationId: text("location_id").references(() => locations.id),
    time: timestamp("time").notNull(),
    timeZone: text("time_zone").default("America/New_York").notNull(),
    participationMode: text("participation_mode")
      .$type<EventParticipationMode>()
      .default("opt_in")
      .notNull(),
    externalRideshareMode: text("external_rideshare_mode")
      .$type<ExternalRideshareMode>()
      .default("disabled")
      .notNull(),
    externalRideshareSeats: integer("external_rideshare_seats")
      .default(3)
      .notNull(),
    externalRideshareCostMultiplier: real("external_rideshare_cost_multiplier")
      .default(3)
      .notNull(),
    externalRideshareFixedCostSeconds: real(
      "external_rideshare_fixed_cost_seconds"
    )
      .default(0)
      .notNull(),
    message: text("message"),
    scheduled: boolean("scheduled").default(false).notNull(),
    locked: boolean("locked").default(false).notNull(),
    haveSentInvitationEmails: boolean("have_sent_invitation_emails")
      .default(false)
      .notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("events_groupId_idx").on(table.groupId),
    index("events_eventSeriesId_idx").on(table.eventSeriesId),
    index("events_kind_idx").on(table.kind),
    index("events_time_idx").on(table.time),
  ]
);

export const locationDistances = pgTable(
  "location_distances",
  {
    originLocationId: text("origin_location_id")
      .notNull()
      .references(() => locations.id, { onDelete: "cascade" }),
    destinationLocationId: text("destination_location_id")
      .notNull()
      .references(() => locations.id, { onDelete: "cascade" }),
    durationSeconds: real("duration_seconds").notNull(),
    distanceMeters: integer("distance_meters").notNull(),
    encodedPolyline: text("encoded_polyline"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    primaryKey({
      name: "location_distances_pk",
      columns: [table.originLocationId, table.destinationLocationId],
    }),
  ]
);

export const eventsToUsers = pgTable(
  "events_to_users",
  {
    eventId: text("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    drivingStatus: drivingStatusEnum("driving_status").notNull(),
    carFits: integer("car_fits").notNull(), // includes driver!
    earliestLeaveTime: timestamp("earliest_leave_time"), // null if cannot drive
    originLocationId: text("origin_location_id").references(() => locations.id),
    destinationLocationId: text("destination_location_id").references(
      () => locations.id
    ),
    requiredArrivalTime: timestamp("required_arrival_time"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.eventId, table.userId] }),
    index("eventsToUsers_eventId_idx").on(table.eventId),
    index("eventsToUsers_userId_idx").on(table.userId),
    index("eventsToUsers_destinationLocationId_idx").on(
      table.destinationLocationId
    ),
  ]
);

export const solutions = pgTable("solutions", {
  id: text("id").primaryKey(),
  eventId: text("event_id")
    .notNull()
    .unique()
    .references(() => events.id, { onDelete: "cascade" }),
  problemKind: text("problem_kind")
    .$type<EventKind>()
    .default("shared_destination")
    .notNull(),
  feasible: boolean("feasible").notNull(),
  optimal: boolean("optimal").notNull(),
  totalDriveSeconds: real("total_drive_seconds").notNull(),
  externalRideshareMode: text("external_rideshare_mode")
    .$type<ExternalRideshareMode>()
    .default("disabled")
    .notNull(),
  externalRideshareVehicleCount: integer("external_rideshare_vehicle_count")
    .default(0)
    .notNull(),
  totalExternalRideshareCostSeconds: real(
    "total_external_rideshare_cost_seconds"
  )
    .default(0)
    .notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const solutionParties = pgTable(
  "solution_parties",
  {
    id: text("id").primaryKey(),
    solutionId: text("solution_id")
      .notNull()
      .references(() => solutions.id, { onDelete: "cascade" }),
    driverUserId: text("driver_user_id").references(() => users.id, {
      onDelete: "cascade",
    }),
    vehicleKind: text("vehicle_kind")
      .$type<SolutionVehicleKind>()
      .default("participant_vehicle")
      .notNull(),
    externalRideshareOriginLocationId: text(
      "external_rideshare_origin_location_id"
    ).references(() => locations.id),
    externalRideshareLabel: text("external_rideshare_label"),
    costMultiplier: real("cost_multiplier").default(1).notNull(),
    partyIndex: integer("party_index").notNull(),
  },
  (table) => [index("solutionParties_solutionId_idx").on(table.solutionId)]
);

export const blastTypeValues = ["event_scheduled", "event_confirmed"] as const;

export type BlastType = (typeof blastTypeValues)[number];

export const blasts = pgTable(
  "blasts",
  {
    id: text("id").primaryKey(),
    eventId: text("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    type: text("type").notNull(), // 'event_scheduled' | 'event_confirmed'
    sentByUserId: text("sent_by_user_id")
      .notNull()
      .references(() => users.id),
    recipientCount: integer("recipient_count").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [index("blasts_eventId_idx").on(table.eventId)]
);

export const solutionPartyMembers = pgTable(
  "solution_party_members",
  {
    partyId: text("party_id")
      .notNull()
      .references(() => solutionParties.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    pickupOrder: integer("pickup_order").notNull(), // 0=driver, 1+=passengers in order
  },
  (table) => [
    primaryKey({ columns: [table.partyId, table.userId] }),
    index("solutionPartyMembers_userId_idx").on(table.userId),
  ]
);

export const userRelations = relations(users, ({ many }) => ({
  sessions: many(sessions),
  accounts: many(accounts),
  groupsToUsers: many(groupsToUsers),
  eventSeriesToUsers: many(eventSeriesToUsers),
  eventsToUsers: many(eventsToUsers),
}));

export const sessionRelations = relations(sessions, ({ one }) => ({
  user: one(users, {
    fields: [sessions.userId],
    references: [users.id],
  }),
}));

export const accountRelations = relations(accounts, ({ one }) => ({
  user: one(users, {
    fields: [accounts.userId],
    references: [users.id],
  }),
}));

export const groupRelations = relations(groups, ({ many }) => ({
  groupsToUsers: many(groupsToUsers),
  eventSeries: many(eventSeries),
  events: many(events),
}));

export const groupsToUsersRelations = relations(groupsToUsers, ({ one }) => ({
  group: one(groups, {
    fields: [groupsToUsers.groupId],
    references: [groups.id],
  }),
  user: one(users, {
    fields: [groupsToUsers.userId],
    references: [users.id],
  }),
}));

export const locationRelations = relations(locations, ({ one }) => ({
  event: one(events, {
    fields: [locations.ownerId],
    references: [events.id],
  }),
}));

export const eventSeriesRelations = relations(eventSeries, ({ one, many }) => ({
  group: one(groups, {
    fields: [eventSeries.groupId],
    references: [groups.id],
  }),
  createdByUser: one(users, {
    fields: [eventSeries.createdByUserId],
    references: [users.id],
  }),
  eventSeriesToUsers: many(eventSeriesToUsers),
  events: many(events),
}));

export const eventSeriesToUsersRelations = relations(
  eventSeriesToUsers,
  ({ one }) => ({
    eventSeries: one(eventSeries, {
      fields: [eventSeriesToUsers.eventSeriesId],
      references: [eventSeries.id],
    }),
    user: one(users, {
      fields: [eventSeriesToUsers.userId],
      references: [users.id],
    }),
    defaultOriginLocation: one(locations, {
      fields: [eventSeriesToUsers.defaultOriginLocationId],
      references: [locations.id],
    }),
    defaultDestinationLocation: one(locations, {
      fields: [eventSeriesToUsers.defaultDestinationLocationId],
      references: [locations.id],
    }),
  })
);

export const eventRelations = relations(events, ({ one, many }) => ({
  group: one(groups, {
    fields: [events.groupId],
    references: [groups.id],
  }),
  eventSeries: one(eventSeries, {
    fields: [events.eventSeriesId],
    references: [eventSeries.id],
  }),
  location: one(locations, {
    fields: [events.locationId],
    references: [locations.id],
  }),
  eventsToUsers: many(eventsToUsers),
  solution: one(solutions, {
    fields: [events.id],
    references: [solutions.eventId],
  }),
  blasts: many(blasts),
}));

export const eventsToUsersRelations = relations(eventsToUsers, ({ one }) => ({
  event: one(events, {
    fields: [eventsToUsers.eventId],
    references: [events.id],
  }),
  user: one(users, {
    fields: [eventsToUsers.userId],
    references: [users.id],
  }),
  originLocation: one(locations, {
    fields: [eventsToUsers.originLocationId],
    references: [locations.id],
  }),
  destinationLocation: one(locations, {
    fields: [eventsToUsers.destinationLocationId],
    references: [locations.id],
  }),
}));

export const solutionRelations = relations(solutions, ({ one, many }) => ({
  event: one(events, {
    fields: [solutions.eventId],
    references: [events.id],
  }),
  parties: many(solutionParties),
}));

export const solutionPartyRelations = relations(
  solutionParties,
  ({ one, many }) => ({
    solution: one(solutions, {
      fields: [solutionParties.solutionId],
      references: [solutions.id],
    }),
    driver: one(users, {
      fields: [solutionParties.driverUserId],
      references: [users.id],
    }),
    externalRideshareOriginLocation: one(locations, {
      fields: [solutionParties.externalRideshareOriginLocationId],
      references: [locations.id],
    }),
    members: many(solutionPartyMembers),
  })
);

export const solutionPartyMemberRelations = relations(
  solutionPartyMembers,
  ({ one }) => ({
    party: one(solutionParties, {
      fields: [solutionPartyMembers.partyId],
      references: [solutionParties.id],
    }),
    user: one(users, {
      fields: [solutionPartyMembers.userId],
      references: [users.id],
    }),
  })
);

export const blastRelations = relations(blasts, ({ one }) => ({
  event: one(events, {
    fields: [blasts.eventId],
    references: [events.id],
  }),
  sentByUser: one(users, {
    fields: [blasts.sentByUserId],
    references: [users.id],
  }),
}));
