import { aiPromptLibrary } from '../ai-library-catalog.js';
import { draftContracts } from './ai-draft-contract.js';
import { READY_MODULE_FIELDS, READY_MODULE_TYPES } from './ready-template-module-types.js';

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
  const workflows=Object.entries(READY_MODULE_TYPES).map(([id,meta])=>`${id}: ${READY_MODULE_FIELDS[id]?.result || (id==='interests'?'toggle an existing ordinary role, no staff permissions':id==='faq'?'show the configured private answer':'register or cancel participation with optional capacity')}; settings=${meta.form?'subjectLabel,detailsLabel (45 characters), private review channel and staff role':id==='faq'?'answer (1800 characters)':id==='events'?'capacity (0 means unlimited), startsAt':'existing ordinary role'}; button=${meta.action}`).join('\n');
  const formKnowledge='Form modules also support subjectPlaceholder/detailsPlaceholder (up to 100 characters), subjectMaxLength (1-120), detailsMaxLength (1-1000). These are real Discord modal settings. Both fields remain required. Use customer-specific hints and respect the requested limits. They do not add new form fields or change the approval workflow. ';
  return formKnowledge + editorKnowledge + `Available conversation draft routes: ${routes.join(', ')}. Library entries are starter messages, never fixed designs. Compose customer-specific copy and approved settings. Module drafts use kind:module and moduleKind:interests,suggestions,reports,events,applications,faq,submissions,orders,learning,tasks. interests is an existing ordinary role toggle button, not a new room or staff role. Channel and role are selected in review. All writes require existing review, permissions and selected guild/bot checks. Unknown functions require development; never claim execution. Image shaping and arbitrary text layouts are available only when the actual renderer and review expose those controls. Downloaded repositories do not grant capabilities.\nExisting operational workflows:\n${workflows}\nReturn editable drafts immediately for supported requests. Use the customer's language for copy and field labels. Preserve unchanged settings on follow-ups. A link button navigates and never opens a ticket, grants a role or submits a form. Valid module extras: imagePlacement=image|thumbnail, links=[{label,url}] with up to four HTTPS links. Do not copy URLs or identities from reference screenshots. Never add a footer, server slogan or branding the customer did not request. Missing destinations and roles are selected in the editor. Do not replace required functionality with an announcement. Music playback, arbitrary executable code and new unregistered workflows require development; provide the supported portion and disclose the missing essential function before publication.`;
}
