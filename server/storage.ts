import {
  users, type User, type InsertUser,
  conversations, type Conversation, type InsertConversation,
  messages, type Message, type InsertMessage,
  supportIssues, type SupportIssue, type InsertSupportIssue
} from "@shared/schema";

export interface IStorage {
  // User methods
  getUser(id: number): Promise<User | undefined>;
  getUserByTelegramId(telegramId: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: number, user: Partial<InsertUser>): Promise<User | undefined>;
  
  // Conversation methods
  getConversation(id: number): Promise<Conversation | undefined>;
  getConversationByTelegramUserId(telegramUserId: string): Promise<Conversation | undefined>;
  getConversationByThreadId(threadId: string): Promise<Conversation | undefined>;
  createConversation(conversation: InsertConversation): Promise<Conversation>;
  updateConversation(id: number, updates: Partial<InsertConversation>): Promise<Conversation | undefined>;
  listConversations(limit?: number): Promise<Conversation[]>;
  
  // Message methods
  getMessage(id: number): Promise<Message | undefined>;
  createMessage(message: InsertMessage): Promise<Message>;
  getMessagesByConversationId(conversationId: number, limit?: number): Promise<Message[]>;
  
  // Support Issue methods
  getSupportIssue(id: number): Promise<SupportIssue | undefined>;
  getSupportIssueByConversationId(conversationId: number): Promise<SupportIssue | undefined>;
  createSupportIssue(issue: InsertSupportIssue): Promise<SupportIssue>;
  updateSupportIssue(id: number, updates: Partial<InsertSupportIssue>): Promise<SupportIssue | undefined>;
  listSupportIssuesByUserId(userId: string): Promise<SupportIssue[]>;
}

export class MemStorage implements IStorage {
  private users: Map<number, User>;
  private conversations: Map<number, Conversation>;
  private messages: Map<number, Message>;
  private supportIssues: Map<number, SupportIssue>;
  private currentIds: {
    users: number;
    conversations: number;
    messages: number;
    supportIssues: number;
  };

  constructor() {
    this.users = new Map();
    this.conversations = new Map();
    this.messages = new Map();
    this.supportIssues = new Map();
    this.currentIds = {
      users: 1,
      conversations: 1,
      messages: 1,
      supportIssues: 1
    };
  }

  // User methods
  async getUser(id: number): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByTelegramId(telegramId: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.telegramId === telegramId
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = this.currentIds.users++;
    const now = new Date();
    const user: User = { 
      ...insertUser, 
      id,
      joinedAt: now
    };
    this.users.set(id, user);
    return user;
  }

  async updateUser(id: number, updates: Partial<InsertUser>): Promise<User | undefined> {
    const user = await this.getUser(id);
    if (!user) return undefined;
    
    const updatedUser = { ...user, ...updates };
    this.users.set(id, updatedUser);
    return updatedUser;
  }

  // Conversation methods
  async getConversation(id: number): Promise<Conversation | undefined> {
    return this.conversations.get(id);
  }

  async getConversationByTelegramUserId(telegramUserId: string): Promise<Conversation | undefined> {
    return Array.from(this.conversations.values()).find(
      (conversation) => conversation.telegramUserId === telegramUserId
    );
  }

  async getConversationByThreadId(threadId: string): Promise<Conversation | undefined> {
    return Array.from(this.conversations.values()).find(
      (conversation) => conversation.threadId === threadId
    );
  }

  async createConversation(insertConversation: InsertConversation): Promise<Conversation> {
    const id = this.currentIds.conversations++;
    const now = new Date();
    const conversation: Conversation = { 
      ...insertConversation, 
      id,
      lastMessageAt: now,
      createdAt: now
    };
    this.conversations.set(id, conversation);
    return conversation;
  }

  async updateConversation(id: number, updates: Partial<InsertConversation>): Promise<Conversation | undefined> {
    const conversation = await this.getConversation(id);
    if (!conversation) return undefined;
    
    const updatedConversation = { ...conversation, ...updates, lastMessageAt: new Date() };
    this.conversations.set(id, updatedConversation);
    return updatedConversation;
  }

  async listConversations(limit: number = 50): Promise<Conversation[]> {
    return Array.from(this.conversations.values())
      .sort((a, b) => b.lastMessageAt.getTime() - a.lastMessageAt.getTime())
      .slice(0, limit);
  }

  // Message methods
  async getMessage(id: number): Promise<Message | undefined> {
    return this.messages.get(id);
  }

  async createMessage(insertMessage: InsertMessage): Promise<Message> {
    const id = this.currentIds.messages++;
    const now = new Date();
    const message: Message = { 
      ...insertMessage, 
      id,
      sentAt: now
    };
    this.messages.set(id, message);
    
    // Update conversation's lastMessageAt
    const conversation = await this.getConversation(message.conversationId);
    if (conversation) {
      await this.updateConversation(conversation.id, {});
    }
    
    return message;
  }

  async getMessagesByConversationId(conversationId: number, limit: number = 50): Promise<Message[]> {
    return Array.from(this.messages.values())
      .filter(message => message.conversationId === conversationId)
      .sort((a, b) => a.sentAt.getTime() - b.sentAt.getTime())
      .slice(-limit);
  }

  // Support Issue methods
  async getSupportIssue(id: number): Promise<SupportIssue | undefined> {
    return this.supportIssues.get(id);
  }

  async getSupportIssueByConversationId(conversationId: number): Promise<SupportIssue | undefined> {
    return Array.from(this.supportIssues.values()).find(
      (issue) => issue.conversationId === conversationId
    );
  }

  async createSupportIssue(insertIssue: InsertSupportIssue): Promise<SupportIssue> {
    const id = this.currentIds.supportIssues++;
    const now = new Date();
    const issue: SupportIssue = { 
      ...insertIssue, 
      id,
      openedAt: now,
      closedAt: null
    };
    this.supportIssues.set(id, issue);
    return issue;
  }

  async updateSupportIssue(id: number, updates: Partial<InsertSupportIssue>): Promise<SupportIssue | undefined> {
    const issue = await this.getSupportIssue(id);
    if (!issue) return undefined;
    
    const updatedIssue = { ...issue, ...updates };
    this.supportIssues.set(id, updatedIssue);
    return updatedIssue;
  }

  async listSupportIssuesByUserId(userId: string): Promise<SupportIssue[]> {
    return Array.from(this.supportIssues.values())
      .filter(issue => issue.userId === userId)
      .sort((a, b) => b.openedAt.getTime() - a.openedAt.getTime());
  }
}

import { DatabaseStorage } from './database-storage';

// Use DatabaseStorage in production, MemStorage for development
const isProduction = process.env.NODE_ENV === 'production';
export const storage = isProduction 
  ? new DatabaseStorage() 
  : new MemStorage();
