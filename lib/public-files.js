const publicFiles = new Set([
  'index.html', 'account.html', 'studio.html', 'checkout.html', 'watch.html', 'watch.js',
  'plans.html', 'privacy.html', 'terms.html', 'usage.html', 'why-diskoko.html',
  'knowledge.html', 'quickstart.html', 'faq.html', 'safety.html', 'reports.html',
  'contact.html', 'status.html', 'changelog.html', 'bot-docs.html', 'ai-bot-guide.html',
  'discord-permissions.html', 'fair-use.html', 'cookie-policy.html',
  'dpa.html', 'refund-policy.html', 'delete-account.html', 'security-vulnerability.html',
  'app.js', 'control-center.js', 'mouse-field.js', 'account.js', 'checkout.js', 'workspace.js', 'ai-library-catalog.js',
  'reports.js', 'status.js', 'ai-design-scene.js', 'ai-ui-language.js', 'ai-library-english.js', 'ai-editor-prototype.js',
  'styles.css', 'dashboard.css', 'workspace.css', 'ready-library.css', 'checkout.css', 'legal.css', 'logo-unified.css', 'button-system.css', 'dashboard-theme.css',
  'assets/diskoko-logo.png', 'assets/diskoko-coming-soon.jpg',
  'assets/discord-message-content-off.webp',
]);

export function isPublicStaticPath(pathname) {
  const path = String(pathname || '').replace(/^\/+/, '') || 'index.html';
  if (publicFiles.has(path)) return true;
  return !path.includes('/') && publicFiles.has(`${path}.html`);
}
