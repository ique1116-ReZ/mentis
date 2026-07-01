# Guided Chat Assessment Design

Date: 2026-07-01

## Goal

Improve the patient chat experience so the AI feels like a concise rehab assistant instead of a Markdown document generator. The chat should guide users through structured, clickable assessment steps by body region, and later sync concrete exercise prescriptions into the right-side rehab plan when an exercise action library exists.

## User Problems

- Assistant replies currently expose Markdown markers such as `**` and long numbered blocks.
- The AI asks too many things at once, which makes the user do all the work.
- Assessment should be progressive: one safety or context question at a time, with tappable choices where possible.
- When the AI eventually gives exercise actions, those actions should update the rehab training panel instead of staying only in chat text.

## Recommended Approach

Use a structured chat response contract:

- `content`: short natural-language reply with no Markdown syntax.
- `question`: the next assessment question, if one is needed.
- `options`: clickable answers for the current question.
- `assessmentStep`: machine-readable step id for progress tracking.
- `planPatch`: optional future field for safe updates to the right-side rehab plan.

The backend owns response shape, safety boundaries, and body-region assessment templates. The frontend renders natural text and buttons, sends selected options as user messages, and applies plan updates only when they are structured.

## Conversation Style

The system prompt should require:

- Chinese, concise, warm, and practical.
- No Markdown syntax, including `**`, headings, tables, or long numbered lists.
- One main question per assistant turn.
- Prefer clickable choices over open-ended questions.
- Keep medical safety language, but make it short and direct.
- Do not diagnose. Use phrases like "需要排除" or "建议线下评估" instead of definitive labels.
- If urgent red flags appear, stop training guidance and recommend medical evaluation.

## Assessment Templates

Each body region gets a template made of ordered steps. Initial minimum coverage:

- Ankle:
  - Weight bearing after injury.
  - Bone tenderness around inner ankle, outer ankle, base of fifth metatarsal, and navicular area.
  - Visible deformity, numbness, coldness, severe bruising, or rapidly worsening swelling.
  - Pain score.
  - Injury timing and current activity goal.
- Knee:
  - Weight bearing and major swelling after trauma.
  - Locking, giving way, deformity, fever, or neurological symptoms.
  - Pain location.
  - Pain score.
  - Training load and triggering movement.

Other categories can start with shared general steps and receive detailed templates later:

- Shoulder.
- Lower back.
- Hip.

## Frontend Behavior

Assistant messages should render from structured fields rather than raw Markdown. The UI should show:

- Short assistant text bubble.
- Optional question text.
- Choice buttons inside or immediately below the bubble.
- Existing quick actions remain available, but assessment choices take priority while a guided assessment is active.

When a user taps a choice, the app sends the choice as the next message and preserves the selected `assessmentStep`.

## Training Plan Sync

The right-side rehab panel should not parse freeform chat text. It should update only from a structured `planPatch`.

Because the exercise action library is not built yet, the first implementation should:

- Define the `planPatch` shape but keep it optional.
- Avoid auto-generating detailed plan items from freeform AI prose.
- Allow future action library records to map stable action ids to display names, dosage, precautions, and progression criteria.
- Update the right panel only when an action id is known or when the backend returns a limited safe plan summary that does not pretend to be a full exercise prescription.

Future action library shape:

- `actionId`
- `title`
- `bodyRegion`
- `phase`
- `dosage`
- `instructions`
- `contraindications`
- `progressionCriteria`

## Error Handling

- If the model service fails, show a short fallback and preserve current assessment state.
- If the backend returns malformed options, render only the text and do not show broken buttons.
- If red flags are selected, disable training-plan sync for that case and show a professional-support path.

## Testing

Backend tests:

- System prompt bans Markdown and requires concise one-question behavior.
- Ankle assessment returns clickable options for weight-bearing red flag screening.
- Knee assessment returns a guided step rather than a long Markdown checklist.
- Red flag selections do not produce `planPatch`.

Frontend tests or build checks:

- Message rendering does not expose Markdown markers from structured assistant responses.
- Option buttons call `sendMessage` with the selected answer.
- The right-side plan updates only when a structured `planPatch` exists.

## Out Of Scope

- A complete exercise action library.
- Full diagnosis or differential diagnosis.
- Automatic parsing of arbitrary AI text into rehab plans.
- Detailed templates for every condition under every body region in the first pass.
