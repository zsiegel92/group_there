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

export const groups = pgTable("groups", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  secret: text("secret").notNull(), // hashed group secret for invite verification
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

const locationOwnerTypeEnum = pgEnum(
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

export const events = pgTable(
  "events",
  {
    id: text("id").primaryKey(),
    groupId: text("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    locationId: text("location_id").references(() => locations.id),
    time: timestamp("time").notNull(),
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
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.eventId, table.userId] }),
    index("eventsToUsers_eventId_idx").on(table.eventId),
    index("eventsToUsers_userId_idx").on(table.userId),
  ]
);

export const solutions = pgTable("solutions", {
  id: text("id").primaryKey(),
  eventId: text("event_id")
    .notNull()
    .unique()
    .references(() => events.id, { onDelete: "cascade" }),
  feasible: boolean("feasible").notNull(),
  optimal: boolean("optimal").notNull(),
  totalDriveSeconds: real("total_drive_seconds").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const solutionParties = pgTable(
  "solution_parties",
  {
    id: text("id").primaryKey(),
    solutionId: text("solution_id")
      .notNull()
      .references(() => solutions.id, { onDelete: "cascade" }),
    driverUserId: text("driver_user_id").references(() => users.id),
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
      .references(() => users.id),
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

export const eventRelations = relations(events, ({ one, many }) => ({
  group: one(groups, {
    fields: [events.groupId],
    references: [groups.id],
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
