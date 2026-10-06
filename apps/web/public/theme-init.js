// Apply saved theme before first paint to avoid a flash (external so CSP stays strict).
try {
  var p = JSON.parse(localStorage.getItem('wt:prefs') || '{}');
  var t = p.theme || 'system';
  if (t === 'system') t = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  document.documentElement.dataset.theme = t;
  document.documentElement.dataset.accent = (['vermilion','cobalt','moss','plum','amber','ink'].indexOf(p.accent) >= 0 ? p.accent : 'vermilion');
  document.documentElement.dataset.size = p.size || 'md';
} catch (e) {}
