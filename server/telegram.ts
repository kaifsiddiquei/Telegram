import TelegramBot from 'node-telegram-bot-api';
import { storage } from './storage';
import { insertUserSchema, insertConversationSchema, insertMessageSchema, insertSupportIssueSchema } from '@shared/schema';

// Check if Telegram token exists
if (!process.env.TELEGRAM_BOT_TOKEN) {
  console.error('TELEGRAM_BOT_TOKEN environment variable is required');
  process.exit(1);
}

// Create a bot instance
const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN);

// Support group ID (to be set after bot is added to the group)
let supportGroupId: string | null = null;

export interface WebhookUpdate {
  update_id: number;
  message?: TelegramBot.Message;
  edited_message?: TelegramBot.Message;
  channel_post?: TelegramBot.Message;
  edited_channel_post?: TelegramBot.Message;
}

export async function setSupportGroupId(groupId: string) {
  supportGroupId = groupId;
}

export async function getSupportGroupId() {
  return supportGroupId;
}

/**
 * Process incoming webhook data from Telegram
 */
export async function processUpdate(update: WebhookUpdate) {
  try {
    if (update.message) {
      await handleIncomingMessage(update.message);
    } else if (update.edited_message) {
      // Handle edited messages if needed
    }
  } catch (error) {
    console.error('Error processing Telegram update:', error);
  }
}

/**
 * Handle incoming messages from users or support group
 */
async function handleIncomingMessage(message: TelegramBot.Message) {
  // Check if this is a message from the support group
  if (supportGroupId && message.chat.id.toString() === supportGroupId) {
    await handleSupportGroupMessage(message);
    return;
  }
  
  // This is a direct message from a user to the bot
  await handleUserDirectMessage(message);
}

/**
 * Handle messages sent from users directly to the bot
 */
async function handleUserDirectMessage(message: TelegramBot.Message) {
  if (!message.from) return;
  
  // Get or create user
  const telegramId = message.from.id.toString();
  let user = await storage.getUserByTelegramId(telegramId);
  
  if (!user) {
    // Create new user
    const userData = {
      telegramId,
      username: message.from.username || null,
      firstName: message.from.first_name,
      lastName: message.from.last_name || null,
      languageCode: message.from.language_code || null,
      isPremium: !!message.from.is_premium,
      bio: null,
      profilePhoto: null,
    };
    
    const validatedUser = insertUserSchema.parse(userData);
    user = await storage.createUser(validatedUser);
    
    // Send welcome message
    await bot.sendMessage(message.chat.id, 
      "👋 Welcome to our support bot! How can I help you today?");
  }
  
  // Get or create conversation
  let conversation = await storage.getConversationByTelegramUserId(telegramId);
  
  if (!conversation) {
    // Create a new conversation
    const conversationData = {
      telegramUserId: telegramId,
      threadId: null,
      status: 'open'
    };
    
    const validatedConversation = insertConversationSchema.parse(conversationData);
    conversation = await storage.createConversation(validatedConversation);
  }
  
  // Store the user message
  const messageData = {
    conversationId: conversation.id,
    telegramMessageId: message.message_id.toString(),
    senderId: telegramId,
    senderType: 'user',
    senderName: message.from.first_name + (message.from.last_name ? ` ${message.from.last_name}` : ''),
    content: message.text || null,
    mediaType: getMediaType(message),
    mediaUrl: getMediaUrl(message),
  };
  
  const validatedMessage = insertMessageSchema.parse(messageData);
  await storage.createMessage(validatedMessage);
  
  // Forward message to support group
  if (supportGroupId) {
    // Create thread if it doesn't exist
    if (!conversation.threadId) {
      // Get user photo if available
      let userProfilePhoto = null;
      try {
        const photos = await bot.getUserProfilePhotos(parseInt(telegramId), 0, 1);
        if (photos.photos.length > 0) {
          const photo = photos.photos[0][0];
          const fileLink = await bot.getFileLink(photo.file_id);
          userProfilePhoto = fileLink;
          
          // Update user with profile photo
          if (user) {
            await storage.updateUser(user.id, { profilePhoto: fileLink });
          }
        }
      } catch (error) {
        console.error('Error getting user profile photo:', error);
      }
      
      // Create a thread in the support group with user info
      const userInfoText = `
📱 <b>New Support Request</b>

<b>User:</b> ${message.from.first_name} ${message.from.last_name || ''}
<b>Username:</b> ${message.from.username ? '@' + message.from.username : 'Not set'}
<b>User ID:</b> ${telegramId}
<b>Language:</b> ${message.from.language_code || 'Unknown'}
<b>Premium:</b> ${message.from.is_premium ? 'Yes' : 'No'}
<b>Date Joined:</b> ${new Date().toLocaleString()}
      `;
      
      const threadMessage = await bot.sendMessage(supportGroupId, userInfoText, {
        parse_mode: 'HTML'
      });
      
      // Create a topic/thread
      try {
        await bot.createForumTopic(supportGroupId, message.from.first_name);
        
        // Store thread ID in conversation
        await storage.updateConversation(conversation.id, {
          threadId: threadMessage.message_id.toString()
        });
        
        // Update conversation with thread ID
        conversation = { ...conversation, threadId: threadMessage.message_id.toString() };
        
        // Create a support issue
        const issueData = {
          userId: telegramId,
          conversationId: conversation.id,
          title: 'New Support Request',
          status: 'pending',
          assignedTo: null
        };
        
        const validatedIssue = insertSupportIssueSchema.parse(issueData);
        await storage.createSupportIssue(validatedIssue);
      } catch (error) {
        console.error('Error creating forum topic:', error);
      }
    }
    
    // Forward the message to the support group thread
    if (message.text) {
      await bot.sendMessage(supportGroupId, `<b>${message.from.first_name}:</b> ${message.text}`, {
        reply_to_message_id: parseInt(conversation.threadId || '0'),
        parse_mode: 'HTML'
      });
    }
    
    // Forward media if present
    if (message.photo || message.document || message.video || message.audio || message.voice) {
      const fileId = getFileId(message);
      if (fileId) {
        if (message.photo) {
          await bot.sendPhoto(supportGroupId, fileId, {
            caption: `<b>${message.from.first_name}:</b> ${message.caption || ''}`,
            reply_to_message_id: parseInt(conversation.threadId || '0'),
            parse_mode: 'HTML'
          });
        } else if (message.document) {
          await bot.sendDocument(supportGroupId, fileId, {
            caption: `<b>${message.from.first_name}:</b> ${message.caption || ''}`,
            reply_to_message_id: parseInt(conversation.threadId || '0'),
            parse_mode: 'HTML'
          });
        } else if (message.video) {
          await bot.sendVideo(supportGroupId, fileId, {
            caption: `<b>${message.from.first_name}:</b> ${message.caption || ''}`,
            reply_to_message_id: parseInt(conversation.threadId || '0'),
            parse_mode: 'HTML'
          });
        }
      }
    }
  }
}

/**
 * Handle messages sent within the support group
 */
async function handleSupportGroupMessage(message: TelegramBot.Message) {
  if (!message.from || !message.reply_to_message) return;
  
  // Check if this is a reply to a thread
  const replyToMsgId = message.reply_to_message.message_id.toString();
  
  // Find the conversation with this thread ID
  const conversation = await storage.getConversationByThreadId(replyToMsgId);
  if (!conversation) return;
  
  // Store the admin message
  const messageData = {
    conversationId: conversation.id,
    telegramMessageId: message.message_id.toString(),
    senderId: message.from.id.toString(),
    senderType: 'admin',
    senderName: message.from.first_name + (message.from.last_name ? ` ${message.from.last_name}` : ''),
    content: message.text || null,
    mediaType: getMediaType(message),
    mediaUrl: getMediaUrl(message),
  };
  
  const validatedMessage = insertMessageSchema.parse(messageData);
  await storage.createMessage(validatedMessage);
  
  // Forward the admin's message to the user
  const userTelegramId = conversation.telegramUserId;
  
  if (message.text) {
    await bot.sendMessage(userTelegramId, message.text);
  }
  
  // Forward media if present
  if (message.photo || message.document || message.video || message.audio || message.voice) {
    const fileId = getFileId(message);
    if (fileId) {
      if (message.photo) {
        await bot.sendPhoto(userTelegramId, fileId, {
          caption: message.caption
        });
      } else if (message.document) {
        await bot.sendDocument(userTelegramId, fileId, {
          caption: message.caption
        });
      } else if (message.video) {
        await bot.sendVideo(userTelegramId, fileId, {
          caption: message.caption
        });
      }
    }
  }
}

/**
 * Utility functions to handle media in messages
 */
function getMediaType(message: TelegramBot.Message): string | null {
  if (message.photo) return 'photo';
  if (message.document) return 'document';
  if (message.video) return 'video';
  if (message.audio) return 'audio';
  if (message.voice) return 'voice';
  return null;
}

function getMediaUrl(message: TelegramBot.Message): string | null {
  // In a real implementation, you would get the file URL from Telegram
  // For now we just store the file ID
  const fileId = getFileId(message);
  return fileId;
}

function getFileId(message: TelegramBot.Message): string | null {
  if (message.photo) return message.photo[message.photo.length - 1].file_id;
  if (message.document) return message.document.file_id;
  if (message.video) return message.video.file_id;
  if (message.audio) return message.audio.file_id;
  if (message.voice) return message.voice.file_id;
  return null;
}

export async function getBotInfo() {
  try {
    return await bot.getMe();
  } catch (error) {
    console.error('Error getting bot info:', error);
    return null;
  }
}

export default bot;
