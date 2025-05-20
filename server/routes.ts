import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { processUpdate, getSupportGroupId, setSupportGroupId, getBotInfo } from "./telegram";
import { z } from "zod";

export async function registerRoutes(app: Express): Promise<Server> {
  const httpServer = createServer(app);

  // API routes for the Telegram bot webhook
  app.post('/api/webhook', async (req, res) => {
    try {
      await processUpdate(req.body);
      res.status(200).send('OK');
    } catch (error) {
      console.error('Error processing webhook:', error);
      res.status(500).send('Error processing webhook');
    }
  });

  // API endpoint to get bot information
  app.get('/api/bot/info', async (req, res) => {
    try {
      const botInfo = await getBotInfo();
      res.json({ success: true, data: botInfo });
    } catch (error) {
      console.error('Error getting bot info:', error);
      res.status(500).json({ success: false, error: 'Failed to get bot info' });
    }
  });

  // API endpoint to set the support group ID
  app.post('/api/bot/support-group', async (req, res) => {
    try {
      const schema = z.object({
        groupId: z.string()
      });
      
      const { groupId } = schema.parse(req.body);
      await setSupportGroupId(groupId);
      
      res.json({ success: true, data: { groupId } });
    } catch (error) {
      console.error('Error setting support group ID:', error);
      res.status(500).json({ success: false, error: 'Failed to set support group ID' });
    }
  });

  // API endpoint to get support group ID
  app.get('/api/bot/support-group', async (req, res) => {
    try {
      const groupId = await getSupportGroupId();
      res.json({ success: true, data: { groupId } });
    } catch (error) {
      console.error('Error getting support group ID:', error);
      res.status(500).json({ success: false, error: 'Failed to get support group ID' });
    }
  });

  // API endpoint to get conversations
  app.get('/api/conversations', async (req, res) => {
    try {
      const conversations = await storage.listConversations();
      res.json({ success: true, data: conversations });
    } catch (error) {
      console.error('Error getting conversations:', error);
      res.status(500).json({ success: false, error: 'Failed to get conversations' });
    }
  });

  // API endpoint to get a specific conversation
  app.get('/api/conversations/:id', async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ success: false, error: 'Invalid conversation ID' });
      }
      
      const conversation = await storage.getConversation(id);
      if (!conversation) {
        return res.status(404).json({ success: false, error: 'Conversation not found' });
      }
      
      res.json({ success: true, data: conversation });
    } catch (error) {
      console.error('Error getting conversation:', error);
      res.status(500).json({ success: false, error: 'Failed to get conversation' });
    }
  });

  // API endpoint to get messages for a conversation
  app.get('/api/conversations/:id/messages', async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ success: false, error: 'Invalid conversation ID' });
      }
      
      const conversation = await storage.getConversation(id);
      if (!conversation) {
        return res.status(404).json({ success: false, error: 'Conversation not found' });
      }
      
      const messages = await storage.getMessagesByConversationId(id);
      
      // Also get the user for this conversation
      const user = await storage.getUserByTelegramId(conversation.telegramUserId);
      
      // Get support issue if any
      const supportIssue = await storage.getSupportIssueByConversationId(id);
      
      res.json({ 
        success: true, 
        data: { 
          conversation,
          messages,
          user,
          supportIssue
        } 
      });
    } catch (error) {
      console.error('Error getting conversation messages:', error);
      res.status(500).json({ success: false, error: 'Failed to get conversation messages' });
    }
  });

  // API endpoint to get users
  app.get('/api/users', async (req, res) => {
    try {
      // Not ideal to convert all users to an array in memory, but it's just for demo
      const users = Array.from(
        (storage as any).users.values()
      ).sort((a, b) => b.joinedAt.getTime() - a.joinedAt.getTime());
      
      res.json({ success: true, data: users });
    } catch (error) {
      console.error('Error getting users:', error);
      res.status(500).json({ success: false, error: 'Failed to get users' });
    }
  });

  // API endpoint to get a specific user
  app.get('/api/users/:id', async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ success: false, error: 'Invalid user ID' });
      }
      
      const user = await storage.getUser(id);
      if (!user) {
        return res.status(404).json({ success: false, error: 'User not found' });
      }
      
      // Get support history
      const supportIssues = await storage.listSupportIssuesByUserId(user.telegramId);
      
      res.json({ 
        success: true, 
        data: { 
          user,
          supportIssues
        } 
      });
    } catch (error) {
      console.error('Error getting user:', error);
      res.status(500).json({ success: false, error: 'Failed to get user' });
    }
  });

  return httpServer;
}
