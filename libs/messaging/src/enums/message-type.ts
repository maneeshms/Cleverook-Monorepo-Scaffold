import { Channel } from './channel.enum';
import { MessageCategory } from './message-category.enum';

/**
 * Named events the platform can notify about. Each maps to a set of channels,
 * a category, and the template key to render. A type listing multiple channels
 * fans out to all of them (subject to user preferences + contact points).
 *
 * Add a new event here + a template in the registry — callers just pass the type.
 */
export enum MessageType {
  EMAIL_VERIFICATION = 'EMAIL_VERIFICATION',
  PHONE_OTP = 'PHONE_OTP',
  WELCOME = 'WELCOME',
  PASSWORD_RESET = 'PASSWORD_RESET',
  TASK_ASSIGNED = 'TASK_ASSIGNED',
}

export interface MessageTypeDefinition {
  channels: Channel[];
  category: MessageCategory;
  /** Template registry key (usually === the message type). */
  templateKey: string;
}

export const MESSAGE_TYPE_DEFINITIONS: Record<MessageType, MessageTypeDefinition> = {
  [MessageType.EMAIL_VERIFICATION]: {
    channels: [Channel.EMAIL],
    category: MessageCategory.TRANSACTIONAL,
    templateKey: 'EMAIL_VERIFICATION',
  },
  [MessageType.PHONE_OTP]: {
    channels: [Channel.SMS],
    category: MessageCategory.TRANSACTIONAL,
    templateKey: 'PHONE_OTP',
  },
  [MessageType.WELCOME]: {
    channels: [Channel.EMAIL],
    category: MessageCategory.TRANSACTIONAL,
    templateKey: 'WELCOME',
  },
  [MessageType.PASSWORD_RESET]: {
    channels: [Channel.EMAIL],
    category: MessageCategory.TRANSACTIONAL,
    templateKey: 'PASSWORD_RESET',
  },
  [MessageType.TASK_ASSIGNED]: {
    channels: [Channel.EMAIL, Channel.IN_APP],
    category: MessageCategory.TRANSACTIONAL,
    templateKey: 'TASK_ASSIGNED',
  },
};
