/**
 * LINE Webhook Event Schemas
 *
 * Zod schemas for validating and typing LINE webhook events.
 */

import { z } from 'zod';

// =============================================================================
// Source Schemas
// =============================================================================

const UserSourceSchema = z.object({
  type: z.literal('user'),
  userId: z.string(),
});

const GroupSourceSchema = z.object({
  type: z.literal('group'),
  groupId: z.string(),
  userId: z.string().optional(),
});

const RoomSourceSchema = z.object({
  type: z.literal('room'),
  roomId: z.string(),
  userId: z.string().optional(),
});

const SourceSchema = z.discriminatedUnion('type', [
  UserSourceSchema,
  GroupSourceSchema,
  RoomSourceSchema,
]);

// =============================================================================
// Delivery Context
// =============================================================================

const DeliveryContextSchema = z.object({
  isRedelivery: z.boolean(),
});

// =============================================================================
// Base Event Schema
// =============================================================================

const EventBaseSchema = z.object({
  timestamp: z.number(),
  source: SourceSchema.optional(),
  webhookEventId: z.string().optional(),
  deliveryContext: DeliveryContextSchema.optional(),
  mode: z.enum(['active', 'standby']).optional(),
});

// =============================================================================
// Message Schemas
// =============================================================================

const TextMessageSchema = z.object({
  type: z.literal('text'),
  id: z.string(),
  text: z.string(),
  quoteToken: z.string().optional(),
  mention: z
    .object({
      mentionees: z.array(
        z.object({
          index: z.number(),
          length: z.number(),
          type: z.enum(['user', 'all']),
          userId: z.string().optional(),
        }),
      ),
    })
    .optional(),
});

const ImageMessageSchema = z.object({
  type: z.literal('image'),
  id: z.string(),
  contentProvider: z.object({
    type: z.enum(['line', 'external']),
    originalContentUrl: z.string().optional(),
    previewImageUrl: z.string().optional(),
  }),
  imageSet: z
    .object({
      id: z.string(),
      index: z.number(),
      total: z.number(),
    })
    .optional(),
});

const VideoMessageSchema = z.object({
  type: z.literal('video'),
  id: z.string(),
  duration: z.number().optional(),
  contentProvider: z.object({
    type: z.enum(['line', 'external']),
    originalContentUrl: z.string().optional(),
    previewImageUrl: z.string().optional(),
  }),
});

const AudioMessageSchema = z.object({
  type: z.literal('audio'),
  id: z.string(),
  duration: z.number().optional(),
  contentProvider: z.object({
    type: z.enum(['line', 'external']),
    originalContentUrl: z.string().optional(),
  }),
});

const FileMessageSchema = z.object({
  type: z.literal('file'),
  id: z.string(),
  fileName: z.string(),
  fileSize: z.number(),
});

const LocationMessageSchema = z.object({
  type: z.literal('location'),
  id: z.string(),
  title: z.string().optional(),
  address: z.string().optional(),
  latitude: z.number(),
  longitude: z.number(),
});

const StickerMessageSchema = z.object({
  type: z.literal('sticker'),
  id: z.string(),
  packageId: z.string(),
  stickerId: z.string(),
  stickerResourceType: z
    .enum([
      'STATIC',
      'ANIMATION',
      'SOUND',
      'ANIMATION_SOUND',
      'POPUP',
      'POPUP_SOUND',
      'CUSTOM',
      'MESSAGE',
    ])
    .optional(),
  keywords: z.array(z.string()).optional(),
  text: z.string().optional(),
});

const MessageSchema = z.discriminatedUnion('type', [
  TextMessageSchema,
  ImageMessageSchema,
  VideoMessageSchema,
  AudioMessageSchema,
  FileMessageSchema,
  LocationMessageSchema,
  StickerMessageSchema,
]);

// =============================================================================
// Event Schemas
// =============================================================================

const MessageEventSchema = EventBaseSchema.extend({
  type: z.literal('message'),
  replyToken: z.string(),
  message: MessageSchema,
});

const FollowEventSchema = EventBaseSchema.extend({
  type: z.literal('follow'),
  replyToken: z.string(),
});

const UnfollowEventSchema = EventBaseSchema.extend({
  type: z.literal('unfollow'),
});

const JoinEventSchema = EventBaseSchema.extend({
  type: z.literal('join'),
  replyToken: z.string(),
});

const LeaveEventSchema = EventBaseSchema.extend({
  type: z.literal('leave'),
});

const MemberJoinedEventSchema = EventBaseSchema.extend({
  type: z.literal('memberJoined'),
  replyToken: z.string(),
  joined: z.object({
    members: z.array(
      z.object({
        type: z.literal('user'),
        userId: z.string(),
      }),
    ),
  }),
});

const MemberLeftEventSchema = EventBaseSchema.extend({
  type: z.literal('memberLeft'),
  left: z.object({
    members: z.array(
      z.object({
        type: z.literal('user'),
        userId: z.string(),
      }),
    ),
  }),
});

const PostbackEventSchema = EventBaseSchema.extend({
  type: z.literal('postback'),
  replyToken: z.string(),
  postback: z.object({
    data: z.string(),
    params: z
      .object({
        date: z.string().optional(),
        time: z.string().optional(),
        datetime: z.string().optional(),
        newRichMenuAliasId: z.string().optional(),
        status: z.string().optional(),
      })
      .optional(),
  }),
});

const VideoPlayCompleteEventSchema = EventBaseSchema.extend({
  type: z.literal('videoPlayComplete'),
  replyToken: z.string(),
  videoPlayComplete: z.object({
    trackingId: z.string(),
  }),
});

const BeaconEventSchema = EventBaseSchema.extend({
  type: z.literal('beacon'),
  replyToken: z.string(),
  beacon: z.object({
    hwid: z.string(),
    type: z.enum(['enter', 'banner', 'stay']),
    dm: z.string().optional(),
  }),
});

const AccountLinkEventSchema = EventBaseSchema.extend({
  type: z.literal('accountLink'),
  replyToken: z.string(),
  link: z.object({
    result: z.enum(['ok', 'failed']),
    nonce: z.string(),
  }),
});

const UnsendEventSchema = EventBaseSchema.extend({
  type: z.literal('unsend'),
  unsend: z.object({
    messageId: z.string(),
  }),
});

// =============================================================================
// Union of All Events
// =============================================================================

export const WebhookEventSchema = z.discriminatedUnion('type', [
  MessageEventSchema,
  FollowEventSchema,
  UnfollowEventSchema,
  JoinEventSchema,
  LeaveEventSchema,
  MemberJoinedEventSchema,
  MemberLeftEventSchema,
  PostbackEventSchema,
  VideoPlayCompleteEventSchema,
  BeaconEventSchema,
  AccountLinkEventSchema,
  UnsendEventSchema,
]);

// =============================================================================
// Webhook Request Body
// =============================================================================

export const WebhookRequestBodySchema = z.object({
  destination: z.string(),
  events: z.array(WebhookEventSchema),
});

// =============================================================================
// Exported Types
// =============================================================================

export type WebhookEvent = z.infer<typeof WebhookEventSchema>;
export type WebhookRequestBody = z.infer<typeof WebhookRequestBodySchema>;

export type MessageEvent = z.infer<typeof MessageEventSchema>;
export type FollowEvent = z.infer<typeof FollowEventSchema>;
export type UnfollowEvent = z.infer<typeof UnfollowEventSchema>;
export type JoinEvent = z.infer<typeof JoinEventSchema>;
export type LeaveEvent = z.infer<typeof LeaveEventSchema>;
export type MemberJoinedEvent = z.infer<typeof MemberJoinedEventSchema>;
export type MemberLeftEvent = z.infer<typeof MemberLeftEventSchema>;
export type PostbackEvent = z.infer<typeof PostbackEventSchema>;
export type VideoPlayCompleteEvent = z.infer<typeof VideoPlayCompleteEventSchema>;
export type BeaconEvent = z.infer<typeof BeaconEventSchema>;
export type AccountLinkEvent = z.infer<typeof AccountLinkEventSchema>;
export type UnsendEvent = z.infer<typeof UnsendEventSchema>;

export type TextMessage = z.infer<typeof TextMessageSchema>;
export type ImageMessage = z.infer<typeof ImageMessageSchema>;
export type VideoMessage = z.infer<typeof VideoMessageSchema>;
export type AudioMessage = z.infer<typeof AudioMessageSchema>;
export type FileMessage = z.infer<typeof FileMessageSchema>;
export type LocationMessage = z.infer<typeof LocationMessageSchema>;
export type StickerMessage = z.infer<typeof StickerMessageSchema>;
export type Message = z.infer<typeof MessageSchema>;
