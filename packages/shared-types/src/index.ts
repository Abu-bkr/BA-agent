import { z } from "zod";

export const projectStatusSchema = z.enum([
  "intake",
  "interviewing",
  "requirement_extraction",
  "gap_analysis",
  "risk_analysis",
  "documentation",
  "review",
  "completed",
]);

export const conversationRoleSchema = z.enum(["agent", "client"]);
export const requirementTypeSchema = z.enum([
  "functional",
  "non_functional",
  "business_rule",
]);
export const requirementStatusSchema = z.enum(["draft", "approved", "rejected"]);
export const riskSeveritySchema = z.enum(["low", "medium", "high", "critical"]);
export const riskCategorySchema = z.enum([
  "technical",
  "business",
  "timeline",
  "budget",
]);
export const documentTypeSchema = z.enum(["BRD", "SRS", "user_stories", "summary"]);

const idSchema = z.string().cuid();
const dateSchema = z.coerce.date();

export const projectCreateSchema = z.object({
  clientName: z.string().trim().min(1),
  businessDomain: z.string().trim().min(1),
  rawIdeaText: z.string().trim().min(1),
  status: projectStatusSchema.optional(),
});

export const projectSchema = projectCreateSchema.extend({
  id: idSchema,
  status: projectStatusSchema,
  createdAt: dateSchema,
  updatedAt: dateSchema,
});

export const conversationTurnSchema = z.object({
  id: idSchema,
  projectId: idSchema,
  role: conversationRoleSchema,
  question: z.string(),
  answer: z.string(),
  agentSource: z.string().nullable(),
  createdAt: dateSchema,
});

export const conversationTurnCreateSchema = conversationTurnSchema
  .omit({ id: true, createdAt: true })
  .extend({ projectId: idSchema });

export const requirementSchema = z.object({
  id: idSchema,
  projectId: idSchema,
  type: requirementTypeSchema,
  text: z.string(),
  sourceTurnId: idSchema.nullable(),
  status: requirementStatusSchema,
});

export const requirementCreateSchema = requirementSchema
  .omit({ id: true })
  .extend({ projectId: idSchema });

export const gapSchema = z.object({
  id: idSchema,
  projectId: idSchema,
  description: z.string(),
  resolved: z.boolean(),
  resolutionText: z.string().nullable(),
});

export const gapCreateSchema = gapSchema.omit({ id: true }).extend({
  projectId: idSchema,
});

export const riskSchema = z.object({
  id: idSchema,
  projectId: idSchema,
  description: z.string(),
  severity: riskSeveritySchema,
  mitigation: z.string().nullable(),
  category: riskCategorySchema,
});

export const riskCreateSchema = riskSchema.omit({ id: true }).extend({
  projectId: idSchema,
});

export const documentArtifactSchema = z.object({
  id: idSchema,
  projectId: idSchema,
  type: documentTypeSchema,
  contentMarkdown: z.string(),
  version: z.number().int().positive(),
  createdAt: dateSchema,
});

export const documentArtifactCreateSchema = documentArtifactSchema
  .omit({ id: true, createdAt: true })
  .extend({ projectId: idSchema });

export const reviewNoteSchema = z.object({
  id: idSchema,
  projectId: idSchema,
  artifactId: idSchema.nullable(),
  issue: z.string(),
  resolved: z.boolean(),
});

export const reviewNoteCreateSchema = reviewNoteSchema.omit({ id: true }).extend({
  projectId: idSchema,
});

export type ProjectStatus = z.infer<typeof projectStatusSchema>;
export type ConversationRole = z.infer<typeof conversationRoleSchema>;
export type RequirementType = z.infer<typeof requirementTypeSchema>;
export type RequirementStatus = z.infer<typeof requirementStatusSchema>;
export type RiskSeverity = z.infer<typeof riskSeveritySchema>;
export type RiskCategory = z.infer<typeof riskCategorySchema>;
export type DocumentType = z.infer<typeof documentTypeSchema>;
export type Project = z.infer<typeof projectSchema>;
export type ProjectCreate = z.infer<typeof projectCreateSchema>;
export type ConversationTurn = z.infer<typeof conversationTurnSchema>;
export type Requirement = z.infer<typeof requirementSchema>;
export type Gap = z.infer<typeof gapSchema>;
export type Risk = z.infer<typeof riskSchema>;
export type DocumentArtifact = z.infer<typeof documentArtifactSchema>;
export type ReviewNote = z.infer<typeof reviewNoteSchema>;