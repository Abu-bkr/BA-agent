import { PromptTemplate } from "@langchain/core/prompts";

/**
 * Shared input variables used by every documentation prompt template.
 * The node formats these before rendering so the templates stay free of
 * inline data-shaping logic.
 */
export const DOCUMENTATION_INPUT_VARIABLES = [
  "projectContext",
  "requirements",
  "gaps",
  "risks",
  "reviewNotes",
  "revisionGuidance",
] as const;

export interface DocumentationPromptInput {
  projectContext: string;
  requirements: string;
  gaps: string;
  risks: string;
  reviewNotes: string;
  revisionGuidance: string;
}

const SOURCE_DATA_BLOCK = `# Project Context
{projectContext}

# Requirements
{requirements}

# Gaps & Ambiguities
{gaps}

# Risks
{risks}

# Previous Review Feedback
{reviewNotes}

# Revision Status
{revisionGuidance}`;

export const brdPromptTemplate = new PromptTemplate({
  template: `You are a senior business analyst. Generate a complete Business Requirements Document (BRD) in Markdown for the project below.

${SOURCE_DATA_BLOCK}

# Instructions
- Write a professional, well-structured BRD in Markdown with these sections, in order:
  1. "# Business Requirements Document"
  2. "## Executive Summary"
  3. "## Business Objectives"
  4. "## Stakeholders"
  5. "## Scope" (list what is in scope and what is out of scope)
  6. "## Functional Requirements"
  7. "## Non-Functional Requirements"
  8. "## Business Rules"
  9. "## Assumptions & Constraints"
  10. "## Risks & Mitigations"
  11. "## Success Metrics"
  12. "## Open Questions"
- Every requirement listed above MUST appear somewhere in the document. Do not omit any.
- Explicitly call out high-severity (high or critical) risks and their mitigations.
- Do not invent requirements that are not listed. Where information is genuinely missing, list it under Open Questions.
- Return ONLY the Markdown document with no preamble, explanation, or code fences.`,
  inputVariables: [...DOCUMENTATION_INPUT_VARIABLES],
});

export const srsPromptTemplate = new PromptTemplate({
  template: `You are a technical business analyst. Generate a Software Requirements Specification (SRS) in Markdown from the requirements below.

${SOURCE_DATA_BLOCK}

# Instructions
- Write a professional SRS in Markdown with these sections, in order:
  1. "# Software Requirements Specification"
  2. "## Introduction" (purpose, scope, definitions, references)
  3. "## Overall Description" (product perspective, user classes, operating environment)
  4. "## System Features & Functional Requirements" (number each as FR-01, FR-02, ... and map each to its source requirement)
  5. "## External Interface Requirements" (user, hardware, software, communications interfaces)
  6. "## Non-Functional Requirements" (performance, security, usability, reliability, maintainability)
  7. "## Data & Persistence Requirements"
  8. "## Business Rules"
  9. "## Assumptions & Dependencies"
  10. "## Appendix: Traceability Matrix" (source requirement -> SRS section, so reviewers can confirm every requirement is covered)
- Every requirement from the list MUST appear in the SRS; the traceability matrix is mandatory so coverage can be verified.
- Keep each requirement faithful to its source text. Note ambiguity rather than guessing.
- Return ONLY the Markdown document with no preamble, explanation, or code fences.`,
  inputVariables: [...DOCUMENTATION_INPUT_VARIABLES],
});

export const userStoriesPromptTemplate = new PromptTemplate({
  template: `You are a business analyst. Convert the requirements below into User Stories in the standard format: "As a [role], I want [goal], so that [benefit]." Every story must include concrete Acceptance Criteria.

${SOURCE_DATA_BLOCK}

# Instructions
- Produce a Markdown document titled "# User Stories".
- Group stories under "## Epic: <name>" headings derived from the functional areas of the requirements.
- For each story, render it as:
  - **Story N**: As a [role], I want [goal], so that [benefit].
  - **Acceptance Criteria**:
    - Given <context>, when <action>, then <expected result>
    - Include at least 2-3 concrete, testable criteria per story.
- Cover every functional and business-rule requirement with at least one story. Non-functional requirements may become "As a system, ..." stories.
- Keep roles concrete (e.g. "end user", "administrator", "reporting manager") rather than generic.
- Return ONLY the Markdown document with no preamble, explanation, or code fences.`,
  inputVariables: [...DOCUMENTATION_INPUT_VARIABLES],
});

export const documentationPromptTemplates: Record<
  "BRD" | "SRS" | "user_stories",
  PromptTemplate
> = {
  BRD: brdPromptTemplate,
  SRS: srsPromptTemplate,
  user_stories: userStoriesPromptTemplate,
};
