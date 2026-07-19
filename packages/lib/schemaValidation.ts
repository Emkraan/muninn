import { ArchivedFormat, TokenExpiry } from "@linkwarden/types/global";
import {
  AiTaggingMethod,
  LinksRouteTo,
  DashboardSectionType,
  Theme,
} from "@linkwarden/prisma/client";
import { z } from "zod";

// const stringField = z.string({
//   errorMap: (e) => ({
//     message: `Invalid ${e.path}.`,
//   }),
// });

export const ForgotPasswordSchema = z.object({
  email: z.string().email(),
});

export const ResetPasswordSchema = z.object({
  token: z.string(),
  password: z.string().min(8),
});

export const VerifyEmailSchema = z.object({
  token: z.string(),
});

export const PostTokenSchema = z.object({
  name: z.string().max(50),
  expires: z.enum(TokenExpiry),
});

export type PostTokenSchemaType = z.infer<typeof PostTokenSchema>;

export const PostUserSchema = () => {
  const emailEnabled =
    process.env.EMAIL_FROM && process.env.EMAIL_SERVER ? true : false;

  return z.object({
    name: z.string().trim().min(1).max(50).optional(),
    password: z.string().min(8).max(2048).optional(),
    email: emailEnabled
      ? z.string().trim().email().toLowerCase()
      : z.string().nullish(),
    username: emailEnabled
      ? z.string().optional()
      : z
          .string()
          .trim()
          .toLowerCase()
          .min(3)
          .max(50)
          .regex(/^[a-z0-9_-]{3,50}$/),
    invite: z.boolean().default(false),
    acceptPromotionalEmails: z.boolean().default(false),
  });
};

export const UpdateUserSchema = () => {
  const emailEnabled =
    process.env.EMAIL_FROM && process.env.EMAIL_SERVER ? true : false;

  return z.object({
    name: z.string().trim().min(0).max(50).optional(),
    email: emailEnabled
      ? z.string().trim().email().toLowerCase()
      : z.string().nullish(),
    username: z
      .string()
      .trim()
      .toLowerCase()
      .min(3)
      .max(50)
      .regex(/^[a-z0-9_-]{3,50}$/),
    image: z.string().nullish(),
    password: z.string().min(8).max(2048).optional(),
    newPassword: z.string().min(8).max(2048).optional(),
    oldPassword: z.string().min(8).max(2048).optional(),
    archiveAsScreenshot: z.boolean().optional(),
    archiveAsMonolith: z.boolean().optional(),
    archiveAsPDF: z.boolean().optional(),
    archiveAsReadable: z.boolean().optional(),
    archiveAsWaybackMachine: z.boolean().optional(),
    aiTaggingMethod: z.enum(AiTaggingMethod).optional(),
    aiPredefinedTags: z.array(z.string().max(20).trim()).max(20).optional(),
    aiTagExistingLinks: z.boolean().optional(),
    locale: z.string().max(20).optional(),
    isPrivate: z.boolean().optional(),
    preventDuplicateLinks: z.boolean().optional(),
    collectionOrder: z.array(z.number()).optional(),
    linksRouteTo: z.enum(LinksRouteTo).optional(),
    referredBy: z.string().max(100).nullish(),
  });
};

export const UpdateUserPreferenceSchema = z.object({
  theme: z.enum(Theme).optional(),
  readableFontFamily: z.string().trim().max(100).optional(),
  readableFontSize: z.string().trim().max(100).optional(),
  readableLineHeight: z.string().trim().max(100).optional(),
  readableLineWidth: z.string().trim().max(100).optional(),
  // archiveAsScreenshot: z.boolean().optional(),
  // archiveAsMonolith: z.boolean().optional(),
  // archiveAsPDF: z.boolean().optional(),
  // archiveAsReadable: z.boolean().optional(),
  // archiveAsWaybackMachine: z.boolean().optional(),
  // aiTaggingMethod: z.enum(AiTaggingMethod).optional(),
  // aiPredefinedTags: z.array(z.string().max(20).trim()).max(20).optional(),
  // aiTagExistingLinks: z.boolean().optional(),
  // preventDuplicateLinks: z.boolean().optional(),
  // linksRouteTo: z.enum(LinksRouteTo).optional(),
});

export type UpdateUserPreferenceSchemaType = z.infer<
  typeof UpdateUserPreferenceSchema
>;

export const PostSessionSchema = z.object({
  username: z.string().min(3).max(50),
  password: z.string().min(8),
  sessionName: z.string().trim().max(50).optional(),
});

export const PostLinkSchema = z.object({
  type: z.enum(["url", "pdf", "image"]).nullish(),
  url: z.string().trim().max(2048).url().optional(),
  name: z.string().trim().max(2048).optional(),
  description: z.string().trim().max(2048).optional(),
  image: z.enum(["jpeg", "png"]).optional(),
  collection: z
    .object({
      id: z.number().optional(),
      name: z.string().trim().max(2048).optional(),
    })
    .optional(),
  tags:
    z
      .array(
        z.object({
          id: z.number().optional(),
          name: z.string().trim().max(50),
        })
      )
      .optional() || [],
});

export type PostLinkSchemaType = z.infer<typeof PostLinkSchema>;

export const UpdateLinkSchema = z.object({
  id: z.number(),
  name: z.string().trim().max(2048).nullish(),
  url: z.string().trim().max(2048).nullish(),
  description: z.string().trim().max(2048).nullish(),
  icon: z.string().trim().max(50).nullish(),
  iconWeight: z.string().trim().max(50).nullish(),
  color: z.string().trim().max(50).nullish(),
  collection: z.object({
    id: z.number(),
    ownerId: z.number(),
  }),
  tags: z.array(
    z.object({
      id: z.number().optional(),
      name: z.string().trim().max(50),
    })
  ),
  pinnedBy: z
    .array(
      z
        .object({
          id: z.number().optional(),
        })
        .optional()
    )
    .optional(),
});

export type UpdateLinkSchemaType = z.infer<typeof UpdateLinkSchema>;

const ACCEPTED_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "application/pdf",
  "text/plain",
  "text/html",
];
const NEXT_PUBLIC_MAX_FILE_BUFFER = Number(
  process.env.NEXT_PUBLIC_MAX_FILE_BUFFER || 10
);
const MAX_FILE_SIZE = NEXT_PUBLIC_MAX_FILE_BUFFER * 1024 * 1024;
export const UploadFileSchema = z.object({
  file: z
    .any()
    .refine((files) => files?.length == 1, "File is required.")
    .refine(
      (files) => files?.[0]?.size <= MAX_FILE_SIZE,
      `Max file size is ${MAX_FILE_SIZE}MB.`
    )
    .refine(
      (files) => ACCEPTED_TYPES.includes(files?.[0]?.mimetype),
      `Only ${ACCEPTED_TYPES.join(", ")} files are accepted.`
    ),
  id: z.number().optional(),
  url: z.string().trim().max(2048).url().optional(),
  format: z.enum(ArchivedFormat),
});

export const PostCollectionSchema = z.object({
  name: z.string().trim().max(2048),
  description: z.string().trim().max(2048).optional(),
  color: z.string().trim().max(50).optional(),
  icon: z.string().trim().max(50).optional(),
  iconWeight: z.string().trim().max(50).optional(),
  parentId: z.number().optional(),
});

export type PostCollectionSchemaType = z.infer<typeof PostCollectionSchema>;

export const UpdateCollectionSchema = z.object({
  id: z.number(),
  name: z.string().trim().max(2048),
  description: z.string().trim().max(2048).optional(),
  color: z.string().trim().max(50).optional(),
  isPublic: z.boolean().optional(),
  icon: z.string().trim().max(50).nullish(),
  iconWeight: z.string().trim().max(50).nullish(),
  parentId: z.union([z.number(), z.literal("root")]).nullish(),
  members: z.array(
    z.object({
      userId: z.number(),
      canCreate: z.boolean(),
      canUpdate: z.boolean(),
      canDelete: z.boolean(),
    })
  ),
  propagateToSubcollections: z.boolean().optional(),
});

export type UpdateCollectionSchemaType = z.infer<typeof UpdateCollectionSchema>;

export const UpdateTagSchema = z.object({
  name: z.string().trim().max(50),
});

export type UpdateTagSchemaType = z.infer<typeof UpdateTagSchema>;

export const PostRssSubscriptionSchema = z.object({
  name: z.string().max(50),
  url: z.string().url().max(2048),
  collectionId: z.number().optional(),
  collectionName: z.string().max(50).optional(),
});

export const PostTagSchema = z.object({
  tags: z.array(
    z.object({
      label: z.string().trim().max(50),
      archiveAsScreenshot: z.boolean().nullish(),
      archiveAsMonolith: z.boolean().nullish(),
      archiveAsPDF: z.boolean().nullish(),
      archiveAsReadable: z.boolean().nullish(),
      archiveAsWaybackMachine: z.boolean().nullish(),
      aiTag: z.boolean().nullish(),
    })
  ),
});

export type PostTagSchemaType = z.infer<typeof PostTagSchema>;

export const TagBulkDeletionSchema = z.object({
  tagIds: z.array(z.number()).min(1),
});

export type TagBulkDeletionSchemaType = z.infer<typeof TagBulkDeletionSchema>;

export const MergeTagsSchema = z.object({
  newTagName: z.string().trim().max(50),
  tagIds: z.array(z.number()).min(1),
});

export type MergeTagsSchemaType = z.infer<typeof MergeTagsSchema>;

export const PostHighlightSchema = z.object({
  color: z.string().trim().max(50),
  comment: z.string().trim().max(2048).nullish(),
  startOffset: z.number(),
  endOffset: z.number(),
  text: z.string().trim().max(2048),
  linkId: z.number(),
});

export type PostHighlightSchemaType = z.infer<typeof PostHighlightSchema>;

export const LinkArchiveActionSchema = z.object({
  linkIds: z.array(z.number()).optional(),
});

export type LinkArchiveActionSchemaType = z.infer<
  typeof LinkArchiveActionSchema
>;

export const DeletePreservationsSchema = z.object({
  action: z.enum(["allAndRePreserve", "allBroken"]),
});

export type DeletePreservationsSchemaType = z.infer<
  typeof DeletePreservationsSchema
>;

export const UpdateDashboardLayoutSchema = z.array(
  z.object({
    type: z.enum(DashboardSectionType),
    collectionId: z.number().optional(),
    enabled: z.boolean(),
    order: z.number().optional(),
  })
);

export type UpdateDashboardLayoutSchemaType = z.infer<
  typeof UpdateDashboardLayoutSchema
>;

// ============================================================================
// Muninn: board / widget dashboard layer
// ============================================================================

const BoardMemberSchema = z.object({
  userId: z.number(),
  canCreate: z.boolean(),
  canUpdate: z.boolean(),
  canDelete: z.boolean(),
  canManage: z.boolean(),
});

export const PostBoardSchema = z.object({
  name: z.string().trim().min(1).max(2048),
  description: z.string().trim().max(2048).optional(),
  color: z.string().trim().max(50).optional(),
  icon: z.string().trim().max(50).optional(),
  isDefault: z.boolean().optional(),
  isPublic: z.boolean().optional(),
});

export type PostBoardSchemaType = z.infer<typeof PostBoardSchema>;

export const UpdateBoardSchema = z.object({
  name: z.string().trim().min(1).max(2048),
  description: z.string().trim().max(2048).optional(),
  color: z.string().trim().max(50).optional(),
  icon: z.string().trim().max(50).nullish(),
  isDefault: z.boolean().optional(),
  isPublic: z.boolean().optional(),
  members: z.array(BoardMemberSchema).optional(),
});

export type UpdateBoardSchemaType = z.infer<typeof UpdateBoardSchema>;

export const PostSectionSchema = z.object({
  name: z.string().trim().min(1).max(2048),
  order: z.number().int().optional(),
});

export type PostSectionSchemaType = z.infer<typeof PostSectionSchema>;

export const UpdateSectionSchema = z.object({
  name: z.string().trim().min(1).max(2048).optional(),
  order: z.number().int().optional(),
});

export type UpdateSectionSchemaType = z.infer<typeof UpdateSectionSchema>;

export const PostBoardItemSchema = z
  .object({
    sectionId: z.number(),
    kind: z.enum(["link", "widget"]),
    linkId: z.number().nullish(),
    widgetType: z.string().trim().max(100).nullish(),
    widgetConfig: z.record(z.string(), z.any()).nullish(),
    x: z.number().int().optional(),
    y: z.number().int().optional(),
    w: z.number().int().positive().optional(),
    h: z.number().int().positive().optional(),
    order: z.number().int().optional(),
  })
  .refine((d) => (d.kind === "link" ? typeof d.linkId === "number" : true), {
    message: "linkId is required when kind is 'link'",
    path: ["linkId"],
  })
  .refine((d) => (d.kind === "widget" ? !!d.widgetType : true), {
    message: "widgetType is required when kind is 'widget'",
    path: ["widgetType"],
  });

export type PostBoardItemSchemaType = z.infer<typeof PostBoardItemSchema>;

export const UpdateBoardItemSchema = z.object({
  sectionId: z.number().optional(),
  widgetConfig: z.record(z.string(), z.any()).nullish(),
  widgetType: z.string().trim().max(100).nullish(),
  x: z.number().int().optional(),
  y: z.number().int().optional(),
  w: z.number().int().positive().optional(),
  h: z.number().int().positive().optional(),
  order: z.number().int().optional(),
});

export type UpdateBoardItemSchemaType = z.infer<typeof UpdateBoardItemSchema>;

// Single-item position patch (PATCH /boards/:id/items/:itemId/position)
export const ItemPositionSchema = z.object({
  sectionId: z.number().optional(),
  x: z.number().int().optional(),
  y: z.number().int().optional(),
  w: z.number().int().positive().optional(),
  h: z.number().int().positive().optional(),
  order: z.number().int().optional(),
});

export type ItemPositionSchemaType = z.infer<typeof ItemPositionSchema>;

// Bulk reposition (PATCH /boards/:id/items/positions) - one call for a full reorg
export const BulkItemPositionSchema = z.object({
  items: z
    .array(
      z.object({
        id: z.number(),
        sectionId: z.number().optional(),
        x: z.number().int().optional(),
        y: z.number().int().optional(),
        w: z.number().int().positive().optional(),
        h: z.number().int().positive().optional(),
        order: z.number().int().optional(),
      })
    )
    .min(1),
});

export type BulkItemPositionSchemaType = z.infer<typeof BulkItemPositionSchema>;

export const PostBoardMemberSchema = z.object({
  userId: z.number(),
  canCreate: z.boolean().optional(),
  canUpdate: z.boolean().optional(),
  canDelete: z.boolean().optional(),
  canManage: z.boolean().optional(),
});

export type PostBoardMemberSchemaType = z.infer<typeof PostBoardMemberSchema>;

export const PostWidgetTypeSchema = z.object({
  key: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
      message: "key must be lowercase kebab-case",
    }),
  displayName: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2048).optional(),
  configSchema: z.record(z.string(), z.any()),
  fetchSpec: z.record(z.string(), z.any()),
  defaultRefreshIntervalSeconds: z.number().int().positive().max(86400).optional(),
});

export type PostWidgetTypeSchemaType = z.infer<typeof PostWidgetTypeSchema>;

export const UpdateWidgetTypeSchema = z.object({
  displayName: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(2048).optional(),
  configSchema: z.record(z.string(), z.any()).optional(),
  fetchSpec: z.record(z.string(), z.any()).optional(),
  defaultRefreshIntervalSeconds: z.number().int().positive().max(86400).optional(),
});

export type UpdateWidgetTypeSchemaType = z.infer<typeof UpdateWidgetTypeSchema>;

// Widget status fetch (POST /boards/:id/items/:itemId/widget-status or /widgets/preview)
export const WidgetPreviewSchema = z.object({
  widgetType: z.string().trim().min(1).max(100),
  widgetConfig: z.record(z.string(), z.any()),
});

export type WidgetPreviewSchemaType = z.infer<typeof WidgetPreviewSchema>;
