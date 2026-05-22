import { WEB_FETCH_MAX_CHARS, WEB_SEARCH_MAX_RESULTS } from '../constants.js';

function stripHtml(html) {
  // Remove script and style tags with content
  let text = html.replace(/<script[\s\S]*?<\/script>/gi, '');
  text = text.replace(/<style[\s\S]*?<\/style>/gi, '');
  // Remove HTML tags
  text = text.replace(/<[^>]+>/g, ' ');
  // Decode common entities
  text = text.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
  text = text.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ');
  // Collapse whitespace
  text = text.replace(/[ \t]+/g, ' ');
  text = text.replace(/\n\s*\n/g, '\n');
  return text.trim();
}

export async function handleWebFetch(args) {
  const { url } = args;
  if (!url) return { type: 'error', message: 'Error: No URL provided.' };
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    return { type: 'error', message: 'Error: URL must start with http:// or https://' };
  }

  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(10_000),
      headers: { 'User-Agent': 'MistralVibe/1.0' },
    });
    if (!res.ok) return { type: 'error', message: `Error: HTTP ${res.status} ${res.statusText}` };

    const contentType = res.headers.get('content-type') || '';
    const body = await res.text();

    if (contentType.includes('text/html')) {
      const stripped = stripHtml(body);
      return stripped.length > WEB_FETCH_MAX_CHARS
        ? stripped.slice(0, WEB_FETCH_MAX_CHARS) + '\n[Content truncated]'
        : stripped;
    }

    return body.length > WEB_FETCH_MAX_CHARS
      ? body.slice(0, WEB_FETCH_MAX_CHARS) + '\n[Content truncated]'
      : body;
  } catch (err) {
    if (err.name === 'TimeoutError') return { type: 'error', message: 'Error: Request timed out after 10s.' };
    return { type: 'error', message: `Error fetching URL: ${err.message}` };
  }
}

export async function handleWebSearch(args) {
  const { query } = args;
  if (!query) return { type: 'error', message: 'Error: No query provided.' };

  try {
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    const res = await fetch(url, {
      signal: AbortSignal.timeout(10_000),
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; MistralVibe/1.0)',
      },
    });
    if (!res.ok) return { type: 'error', message: `Error: DuckDuckGo returned HTTP ${res.status}` };

    const html = await res.text();

    // Parse results from DuckDuckGo HTML
    const results = [];
    const resultRegex = /<a[^>]+class="result__a"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
    const snippetRegex = /<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi;

    const links = [];
    let m;
    while ((m = resultRegex.exec(html)) !== null && links.length < WEB_SEARCH_MAX_RESULTS) {
      links.push({ url: m[1], title: m[2].replace(/<[^>]+>/g, '').trim() });
    }

    const snippets = [];
    while ((m = snippetRegex.exec(html)) !== null && snippets.length < WEB_SEARCH_MAX_RESULTS) {
      snippets.push(m[1].replace(/<[^>]+>/g, '').trim());
    }

    if (links.length === 0) {
      return { type: 'error', message: `No results found for: ${query}\nTry using web_fetch to visit specific URLs directly.` };
    }

    for (let i = 0; i < links.length; i++) {
      const snippet = snippets[i] || '';
      results.push(`${i + 1}. ${links[i].title} - ${links[i].url}${snippet ? '\n   ' + snippet : ''}`);
    }

    return results.join('\n\n');
  } catch (err) {
    return { type: 'error', message: `Web search failed: ${err.message}\nYou can use web_fetch to visit specific URLs directly.` };
  }
}
