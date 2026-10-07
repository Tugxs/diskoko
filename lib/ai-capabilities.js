import { aiPromptLibrary } from '../ai-library-catalog.js';

// Describes existing routes; importing a library never enables a new executor.
export const aiCapabilities = Object.freeze(aiPromptLibrary.map(item => Object.freeze({
  id: item.moduleKind || item.kind,
  title: item.title,
  category: item.category,
  availability: 'reviewed_draft',
  entryPoint: 'conversation_review',
  confirmationRequired: true,
  scope: 'user/guild/bot',
  description: item.prompt,
})));

export function capabilityKnowledge() {
  const routes = [...new Set(aiCapabilities.filter(item => item.availability === 'reviewed_draft').map(item => item.id))];
  const editors = [...new Set(aiCapabilities.filter(item => item.availability === 'existing_editor').map(item => item.id))];
  return `Available conversation draft routes: ${routes.join(', ')}. Library entries are starter messages, never fixed designs. Compose customer-specific copy and approved settings. Module drafts use kind:module and moduleKind:interests,suggestions,reports,events,applications,faq,submissions,orders,learning,tasks. interests is an existing ordinary role toggle button, not a new room or staff role. Channel and role are selected in review. All writes require existing review, permissions and selected guild/bot checks. Unknown functions require development; never claim execution. Image shaping and arbitrary text layouts are available only when the actual renderer and review expose those controls. Downloaded repositories do not grant capabilities.`;
}
