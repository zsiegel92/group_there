import { relations } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

export const users = pgTable(
  "users",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull().unique(),
    emailVerified: boolean("emailVerified").default(false).notNull(),
    image: text("image"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt")
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
    expiresAt: timestamp("expiresAt").notNull(),
    token: text("token").notNull().unique(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
    ipAddress: text("ipAddress"),
    userAgent: text("userAgent"),
    userId: text("userId")
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
    accountId: text("accountId").notNull(),
    providerId: text("providerId").notNull(),
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accessToken: text("accessToken"),
    refreshToken: text("refreshToken"),
    idToken: text("idToken"),
    accessTokenExpiresAt: timestamp("accessTokenExpiresAt"),
    refreshTokenExpiresAt: timestamp("refreshTokenExpiresAt"),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt")
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
    expiresAt: timestamp("expiresAt").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt")
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
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt")
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

export const groupsToUsers = pgTable(
  "groupsToUsers",
  {
    groupId: text("groupId")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    isAdmin: boolean("isAdmin").default(false).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.groupId, table.userId] }),
    index("groupsToUsers_groupId_idx").on(table.groupId),
    index("groupsToUsers_userId_idx").on(table.userId),
  ]
);

export const drivingStatusEnum = pgEnum("drivingStatus", [
  "cannot_drive",
  "must_drive",
  "can_drive_or_not",
]);

export const events = pgTable(
  "events",
  {
    id: text("id").primaryKey(),
    groupId: text("groupId")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    location: text("location").notNull(),
    time: timestamp("time").notNull(),
    message: text("message"),
    scheduled: boolean("scheduled").default(false).notNull(),
    haveSentInvitationEmails: boolean("haveSentInvitationEmails")
      .default(false)
      .notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("events_groupId_idx").on(table.groupId),
    index("events_time_idx").on(table.time),
  ]
);

export const eventsToUsers = pgTable(
  "eventsToUsers",
  {
    eventId: text("eventId")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    drivingStatus: drivingStatusEnum("drivingStatus").notNull(),
    passengersCount: integer("passengersCount"), // null if cannot drive
    earliestLeaveTime: timestamp("earliestLeaveTime"), // null if cannot drive
    originLocation: text("originLocation").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.eventId, table.userId] }),
    index("eventsToUsers_eventId_idx").on(table.eventId),
    index("eventsToUsers_userId_idx").on(table.userId),
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

export const eventRelations = relations(events, ({ one, many }) => ({
  group: one(groups, {
    fields: [events.groupId],
    references: [groups.id],
  }),
  eventsToUsers: many(eventsToUsers),
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
}));
