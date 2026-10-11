import { aiPromptLibrary } from '../ai-library-catalog.js';
import { draftContracts } from './ai-draft-contract.js';
import { READY_MODULE_FIELDS, READY_MODULE_TYPES } from './ready-template-module-types.js';

// Describes existing routes; importing a library never enables a new executor.
export const aiCapabilities = Object.freeze(aiPromptLibrary.map(item => Object.freeze({
  id: item.moduleKind || item.kind,
  title: item.title,
  category: item.category,
  availability: draftContracts.some(contract=>contract.id===(item.moduleKind || item.kind)) ? 'reviewed_draft' : 'development',
  entryPoint: 'conversation_review',
  confirmationRequired: true,
  scope: 'user/guild/bot',
  description: item.prompt,
  contract: draftContracts.find(contract=>contract.id===(item.moduleKind || item.kind)) || null,
})));

// Keep customer-facing starter messages tied to registered draft executors.
export function auditCapabilityLibrary() {
  return aiCapabilities.map(item=>({
    id:item.id,title:item.title,availability:item.availability,
    compatible:!!item.contract && item.contract.draft===true && item.contract.publish===true
      && item.contract.scope.includes('owner') && item.contract.scope.includes('guild')
      && item.contract.scope.includes('bot'),
    executor:item.contract?.executor || null,
  }));
}

export function capabilityKnowledge() {
  const serviceKnowledge='Existing support tickets provide private HTML/JSON snapshots up to 1000 messages, 1-30 day retention, owner rating after closure, authorized staff assignment, and first-response/closure metrics. Giveaway managers can pause/resume/end/reroll excluding previous winners. The existing music editor supports upcoming queue reorder/shuffle, optional DJ role, and three bounded filters for Lavalink sessions only. Use that existing editor; music is not a new free-form executable draft. ';
  const editorKnowledge='The visual editor separates content, appearance, and function/destination. Standalone modules retain one real module action button and support four additional reviewed HTTPS link buttons. Links navigate only. Module final images can be large below the text or a top-right thumbnail. Arbitrary image coordinates require the composed-image renderer. Never invent new button handlers or arbitrary Discord button sizes/colors. Explain the actual handler, produce a draft, and keep permission checks and final confirmation mandatory. ';
  const routes = [...new Set(aiCapabilities.filter(item => item.availability === 'reviewed_draft').map(item => item.id))];
  const editors = [...new Set(aiCapabilities.filter(item => item.availability === 'existing_editor').map(item => item.id))];
  const workflows=Object.entries(READY_MODULE_TYPES).map(([id,meta])=>`${id}: ${READY_MODULE_FIELDS[id]?.result || (id==='interests'?'toggle an existing ordinary role, no staff permissions':id==='faq'?'show the configured private answer':'register or cancel participation with optional capacity')}; settings=${meta.form?'subjectLabel,detailsLabel (45 characters), private review channel and staff role':id==='faq'?'answer (1800 characters), optional questions=1-25 {question:1-100,answer:1-1800}; private answer selection':id==='events'?'capacity (0 means unlimited), startsAt, waitlist boolean, checkIn boolean, reminderMinutes=0-10080 (channel reminder; zero disables)':'existing ordinary role'}; button=${meta.action}`).join('\n');
  const formKnowledge='Form modules also support subjectPlaceholder/detailsPlaceholder (up to 100 characters), subjectMaxLength (1-120), detailsMaxLength (1-1000). These are real Discord modal settings. Optional cooldownSeconds (30-3600 seconds) limits repeat intake; receiptText (up to 300 characters) customizes the private receipt, with a tracking number retained. Optional dueReminder=true sends one private staff-channel overdue notice. Staff history records decisions and internal updates without exposing notes to members. formFields optionally replaces the legacy two-field form with 1-5 ordered text fields: id,label,style=1|2,required,maxLength=1-1000,minLength,placeholder. notifyMember=true optionally sends a private status update. Member history and tracking remain owner-only. Do not expose staff notes. Use customer-specific hints and respect the requested limits. They do not add new form fields or change the approval workflow. ';
  return serviceKnowledge + formKnowledge + editorKnowledge + `Available conversation draft routes: ${routes.join(', ')}. Library entries are starter messages, never fixed designs. Compose customer-specific copy and approved settings. Module drafts use kind:module and moduleKind:${Object.keys(READY_MODULE_TYPES).join(',')}. interests is an existing ordinary role toggle button, not a new room or staff role. Channel and role are selected in review. All writes require existing review, permissions and selected guild/bot checks. Unknown functions require development; never claim execution. Image shaping and arbitrary text layouts are available only when the actual renderer and review expose those controls. Downloaded repositories do not grant capabilities.\nExisting operational workflows:\n${workflows}\nReturn editable drafts immediately for supported requests. Use the customer's language for copy and field labels. Preserve unchanged settings on follow-ups. A link button navigates and never opens a ticket, grants a role or submits a form. Valid module extras: optional customer-requested footer (maximum 300 characters), imagePlacement=image|thumbnail, links=[{label,url}] with up to four HTTPS links. Do not copy URLs or identities from reference screenshots. Never add a footer, server slogan or branding the customer did not request. Missing destinations and roles are selected in the editor. Do not replace required functionality with an announcement. A new free-form music publication route, arbitrary executable code and new unregistered workflows require development; provide the supported portion and disclose the missing essential function before publication.`;
}
