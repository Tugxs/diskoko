import { aiPromptLibrary } from '../ai-library-catalog.js';

// Describes existing routes; importing a library never enables a new executor.
export const aiCapabilities = Object.freeze(aiPromptLibrary.map(item => Object.freeze({
  id: item.moduleKind || item.kind,
  title: item.title,
  category: item.category,
  availability: item.moduleKind ? 'existing_editor' : 'reviewed_draft',
  entryPoint: item.moduleKind ? 'library_module' : 'conversation_review',
  confirmationRequired: true,
  scope: 'user/guild/bot',
  description: item.prompt,
})));

export function capabilityKnowledge() {
  const routes = [...new Set(aiCapabilities.filter(item => item.availability === 'reviewed_draft').map(item => item.id))];
  const editors = [...new Set(aiCapabilities.filter(item => item.availability === 'existing_editor').map(item => item.id))];
  return `Available conversation draft routes: ${routes.join(', ')}. Existing library editors: ${editors.join(', ')}. Preserve the library. An existing editor is not a callable conversation executor: direct the customer to that editor rather than inventing a JSON action. All writes require the existing review, permissions and selected guild/bot checks. Unknown functions require development; never claim execution. Image shaping and arbitrary text layouts are available only when the actual renderer and review expose those controls. Downloaded repositories do not grant capabilities.`;
}
