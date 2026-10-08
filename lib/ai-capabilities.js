import { aiPromptLibrary } from '../ai-library-catalog.js';
import { draftContracts } from './ai-draft-contract.js';

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
  contract: draftContracts.find(contract=>contract.id===(item.moduleKind || item.kind)) || null,
})));

export function capabilityKnowledge() {
  const editorKnowledge='The visual editor separates content, appearance, and function/destination. Standalone modules retain one real module action button and support four additional reviewed HTTPS link buttons. Links navigate only. Module final images can be large below the text or a top-right thumbnail. Arbitrary image coordinates require the composed-image renderer. Never invent new button handlers or arbitrary Discord button sizes/colors. Explain the actual handler, produce a draft, and keep permission checks and final confirmation mandatory. ';
  const routes = [...new Set(aiCapabilities.filter(item => item.availability === 'reviewed_draft').map(item => item.id))];
  const editors = [...new Set(aiCapabilities.filter(item => item.availability === 'existing_editor').map(item => item.id))];
  return editorKnowledge + `Available conversation draft routes: ${routes.join(', ')}. Library entries are starter messages, never fixed designs. Compose customer-specific copy and approved settings. Module drafts use kind:module and moduleKind:interests,suggestions,reports,events,applications,faq,submissions,orders,learning,tasks. interests is an existing ordinary role toggle button, not a new room or staff role. Channel and role are selected in review. All writes require existing review, permissions and selected guild/bot checks. Unknown functions require development; never claim execution. Image shaping and arbitrary text layouts are available only when the actual renderer and review expose those controls. Downloaded repositories do not grant capabilities.`;
}
