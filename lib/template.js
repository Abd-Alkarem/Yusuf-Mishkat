const fs = require('fs');
const path = require('path');

const VIEWS_DIR = path.join(__dirname, '..', 'views');
const cache = {};

function render(viewPath, data = {}) {
  const fullPath = path.join(VIEWS_DIR, viewPath);
  let html;
  if (cache[fullPath]) {
    html = cache[fullPath];
  } else {
    html = fs.readFileSync(fullPath, 'utf-8');
    if (process.env.NODE_ENV === 'production') cache[fullPath] = html;
  }

  // Replace {{variable}} placeholders
  html = html.replace(/\{\{(\w+(?:\.\w+)*)\}\}/g, (match, key) => {
    const parts = key.split('.');
    let val = data;
    for (const p of parts) {
      if (val == null) return '';
      val = val[p];
    }
    return val != null ? String(val) : '';
  });

  // Handle {{#if variable}}...{{/if}}
  html = html.replace(/\{\{#if (\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g, (match, key, content) => {
    return data[key] ? content : '';
  });

  // Handle {{#unless variable}}...{{/unless}}
  html = html.replace(/\{\{#unless (\w+)\}\}([\s\S]*?)\{\{\/unless\}\}/g, (match, key, content) => {
    return !data[key] ? content : '';
  });

  return html;
}

function renderWithLayout(layoutPath, viewPath, data = {}) {
  const body = render(viewPath, data);
  return render(layoutPath, { ...data, body });
}

module.exports = { render, renderWithLayout };
