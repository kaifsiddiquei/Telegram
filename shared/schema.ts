import { pgTable, text, serial, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// User information
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  telegramId: text("telegram_id").notNull().unique(),
  username: text("username"),
  firstName: text("first_name").notNull(),
  lastName: text("last_name"),
  languageCode: text("language_code"),
  isPremium: boolean("is_premium").default(false),
  bio: text("bio"),
  joinedAt: timestamp("joined_at").defaultNow(),
  profilePhoto: text("profile_photo"),
});

export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  joinedAt: true,
});

// Conversation (topic) model
export const conversations = pgTable("conversations", {
  id: serial("id").primaryKey(),
  telegramUserId: text("telegram_user_id").notNull(),
  threadId: text("thread_id"),
  status: text("status").notNull().default("open"),
  lastMessageAt: timestamp("last_message_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertConversationSchema = createInsertSchema(conversations).omit({
  id: true,
  lastMessageAt: true,
  createdAt: true,
});

// Message model
export const messages = pgTable("messages", {
  id: serial("id").primaryKey(),
  conversationId: integer("conversation_id").notNull(),
  telegramMessageId: text("telegram_message_id"),
  senderId: text("sender_id").notNull(),
  senderType: text("sender_type").notNull(), // 'user', 'admin', 'bot'
  senderName: text("sender_name"),
  content: text("content"),
  mediaType: text("media_type"), // 'image', 'file', etc.
  mediaUrl: text("media_url"),
  sentAt: timestamp("sent_at").defaultNow(),
});

export const insertMessageSchema = createInsertSchema(messages).omit({
  id: true,
  sentAt: true,
});

// Support issue model
export const supportIssues = pgTable("support_issues", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  conversationId: integer("conversation_id").notNull(),
  title: text("title").notNull(),
  status: text("status").notNull().default("pending"),
  openedAt: timestamp("opened_at").defaultNow(),
  closedAt: timestamp("closed_at"),
  assignedTo: text("assigned_to"),
});

export const insertSupportIssueSchema = createInsertSchema(supportIssues).omit({
  id: true,
  openedAt: true,
  closedAt: true,
});

// Type exports
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;

export type Conversation = typeof conversations.$inferSelect;
export type InsertConversation = z.infer<typeof insertConversationSchema>;

export type Message = typeof messages.$inferSelect;
export type InsertMessage = z.infer<typeof insertMessageSchema>;

export type SupportIssue = typeof supportIssues.$inferSelect;
export type InsertSupportIssue = z.infer<typeof insertSupportIssueSchema>;
