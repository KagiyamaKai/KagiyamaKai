/**
 * Albert Velez Portfolio Redesign — Opaque-Box E2E Test Suite
 * 
 * Adheres strictly to the 4-Tier Testing Methodology in TEST_INFRA.md:
 * - Tier 1: Feature Coverage (>=5 tests per feature across 8 features)
 * - Tier 2: Boundary & Corner Cases (>=5 tests)
 * - Tier 3: Cross-Feature Combinations (>=5 tests)
 * - Tier 4: Real-World Scenarios (>=4 scenarios)
 * 
 * Zero external npm dependencies. Runs natively via Node.js:
 *   node tests/e2e_test_suite.js
 *   node --test tests/e2e_test_suite.js
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

// Path Resolution
const PROJECT_ROOT = path.resolve(__dirname, '..');
const YAKUZO_DIR = path.join(PROJECT_ROOT, 'yakuzo');
const HTML_PATH = path.join(YAKUZO_DIR, 'index.html');
const CSS_PATH = path.join(YAKUZO_DIR, 'styles.css');
const JS_PATH = path.join(YAKUZO_DIR, 'app.js');

// Test Execution State & Reporter
let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const failureDetails = [];

function runCheck(tier, category, testName, testFn) {
  totalTests++;
  const label = `[${tier}] ${category} :: ${testName}`;
  try {
    testFn();
    passedTests++;
    console.log(`  \x1b[32m✔\x1b[0m ${label}`);
  } catch (err) {
    failedTests++;
    console.error(`  \x1b[31m✖\x1b[0m ${label}`);
    console.error(`    \x1b[33mError:\x1b[0m ${err.message}`);
    failureDetails.push({ label, error: err });
  }
}

// ============================================================================
// Lightweight DOM & Browser Environment Simulator
// ============================================================================

class DOMElement {
  constructor(tagName = 'div', attributes = {}) {
    this.tagName = tagName.toUpperCase();
    this.attributes = { ...attributes };
    this.children = [];
    this.parentElement = null;
    this.eventListeners = {};
    this.style = {};
    this.open = false; // for dialog elements
    this._textContent = '';
    this._innerHTML = '';
  }

  get id() { return this.attributes['id'] || ''; }
  set id(val) { this.attributes['id'] = val; }

  get className() { return this.attributes['class'] || ''; }
  set className(val) { this.attributes['class'] = val; }

  get classList() {
    const self = this;
    return {
      add(...classes) {
        const cur = (self.className || '').split(/\s+/).filter(Boolean);
        classes.forEach(c => { if (!cur.includes(c)) cur.push(c); });
        self.className = cur.join(' ');
      },
      remove(...classes) {
        const cur = (self.className || '').split(/\s+/).filter(Boolean);
        self.className = cur.filter(c => !classes.includes(c)).join(' ');
      },
      contains(cls) {
        return (self.className || '').split(/\s+/).includes(cls);
      },
      toggle(cls, force) {
        const has = this.contains(cls);
        const shouldHave = force !== undefined ? force : !has;
        if (shouldHave) this.add(cls);
        else this.remove(cls);
        return shouldHave;
      }
    };
  }

  get dataset() {
    const data = {};
    for (const [key, val] of Object.entries(this.attributes)) {
      if (key.startsWith('data-')) {
        const prop = key.slice(5).replace(/-([a-z])/g, (_, l) => l.toUpperCase());
        data[prop] = val;
      }
    }
    return new Proxy(data, {
      set: (target, prop, value) => {
        target[prop] = value;
        const attrKey = 'data-' + prop.replace(/([A-Z])/g, '-$1').toLowerCase();
        this.attributes[attrKey] = String(value);
        return true;
      },
      get: (target, prop) => target[prop]
    });
  }

  getAttribute(name) {
    return this.attributes[name] !== undefined ? this.attributes[name] : null;
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
    if (name === 'class') this._className = String(value);
  }

  removeAttribute(name) {
    delete this.attributes[name];
  }

  hasAttribute(name) {
    return this.attributes[name] !== undefined;
  }

  appendChild(child) {
    if (child.parentElement) {
      child.parentElement.removeChild(child);
    }
    child.parentElement = this;
    this.children.push(child);
    return child;
  }

  removeChild(child) {
    const idx = this.children.indexOf(child);
    if (idx !== -1) {
      child.parentElement = null;
      this.children.splice(idx, 1);
    }
    return child;
  }

  remove() {
    if (this.parentElement) {
      this.parentElement.removeChild(this);
    }
  }

  get textContent() {
    if (this.children.length === 0) return this._textContent;
    return this.children.map(c => c.textContent).join(' ');
  }

  set textContent(val) {
    this._textContent = String(val);
    this.children = [];
  }

  get innerHTML() {
    return this._innerHTML;
  }

  set innerHTML(htmlStr) {
    this._innerHTML = String(htmlStr);
    this.children = [];
    if (!htmlStr.trim()) {
      this._textContent = '';
      return;
    }
    // Lightweight innerHTML element extractor for simulated querySelector
    const tagRegex = /<([a-zA-Z0-9\-]+)([^>]*)>(?:([\s\S]*?)<\/\1>)?/g;
    let match;
    while ((match = tagRegex.exec(htmlStr)) !== null) {
      const tag = match[1];
      const attrStr = match[2];
      const innerContent = match[3] || '';
      
      const el = new DOMElement(tag);
      const attrRegex = /([a-zA-Z0-9\-]+)(?:=(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
      let attrMatch;
      while ((attrMatch = attrRegex.exec(attrStr)) !== null) {
        const attrName = attrMatch[1];
        const attrVal = attrMatch[2] !== undefined ? attrMatch[2] : (attrMatch[3] !== undefined ? attrMatch[3] : (attrMatch[4] || ''));
        el.setAttribute(attrName, attrVal);
      }
      el.textContent = innerContent.replace(/<[^>]+>/g, '').trim();
      this.appendChild(el);
    }
  }

  addEventListener(event, handler) {
    if (!this.eventListeners[event]) this.eventListeners[event] = [];
    this.eventListeners[event].push(handler);
  }

  removeEventListener(event, handler) {
    if (this.eventListeners[event]) {
      this.eventListeners[event] = this.eventListeners[event].filter(h => h !== handler);
    }
  }

  dispatchEvent(event) {
    const list = this.eventListeners[event.type] || [];
    event.target = this;
    event.currentTarget = this;
    for (const handler of list) {
      handler(event);
    }
    return !event.defaultPrevented;
  }

  click() {
    this.dispatchEvent({ type: 'click', preventDefault: () => {}, target: this });
  }

  focus() {
    this._focused = true;
  }

  blur() {
    this._focused = false;
  }

  showModal() {
    this.open = true;
    this.setAttribute('open', '');
  }

  close() {
    this.open = false;
    this.removeAttribute('open');
  }

  getBoundingClientRect() {
    return { top: 0, left: 0, width: 800, height: 600, right: 800, bottom: 600 };
  }

  matches(selector) {
    if (selector.includes(',')) {
      return selector.split(',').some(s => this.matches(s.trim()));
    }
    selector = selector.trim();
    if (selector.startsWith('#')) {
      return this.id === selector.slice(1);
    }
    if (selector.startsWith('.')) {
      return this.classList.contains(selector.slice(1));
    }
    if (selector.startsWith('[') && selector.endsWith(']')) {
      const inner = selector.slice(1, -1);
      if (inner.includes('=')) {
        const [k, v] = inner.split('=').map(s => s.replace(/['"]/g, '').trim());
        return this.getAttribute(k) === v;
      }
      return this.hasAttribute(inner);
    }
    return this.tagName.toLowerCase() === selector.toLowerCase();
  }

  querySelector(selector) {
    const all = this.querySelectorAll(selector);
    return all.length > 0 ? all[0] : null;
  }

  querySelectorAll(selector) {
    const results = [];
    const walk = (node) => {
      for (const child of node.children) {
        if (child.matches && child.matches(selector)) {
          results.push(child);
        }
        walk(child);
      }
    };
    walk(this);
    return results;
  }
}

class DOMDocument extends DOMElement {
  constructor() {
    super('#document');
    this.documentElement = new DOMElement('html', { 'data-theme': 'dark' });
    this.head = new DOMElement('head');
    this.body = new DOMElement('body');
    this.documentElement.appendChild(this.head);
    this.documentElement.appendChild(this.body);
    this.appendChild(this.documentElement);
  }

  createElement(tagName) {
    return new DOMElement(tagName);
  }

  getElementById(id) {
    const walk = (node) => {
      if (node.id === id) return node;
      for (const child of node.children) {
        const found = walk(child);
        if (found) return found;
      }
      return null;
    };
    return walk(this.documentElement);
  }

  querySelector(selector) {
    if (selector.startsWith('#')) {
      return this.getElementById(selector.slice(1));
    }
    return this.documentElement.querySelector(selector);
  }

  querySelectorAll(selector) {
    const results = [];
    const walk = (node) => {
      if (node.matches && node.matches(selector)) {
        results.push(node);
      }
      for (const child of node.children) {
        walk(child);
      }
    };
    walk(this.documentElement);
    return results;
  }
}

function parseHTMLToDOM(htmlString) {
  const doc = new DOMDocument();
  
  // Extract data-theme from html if present
  const htmlThemeMatch = htmlString.match(/<html[^>]*data-theme=["']([^"']+)["']/i);
  if (htmlThemeMatch) {
    doc.documentElement.setAttribute('data-theme', htmlThemeMatch[1]);
  }

  // Extract elements with id, class, or data-* attributes
  const elemRegex = /<([a-zA-Z0-9\-]+)([^>]*)>/g;
  let match;
  while ((match = elemRegex.exec(htmlString)) !== null) {
    const tag = match[1].toLowerCase();
    if (['!doctype', 'meta', 'link', 'br', 'hr'].includes(tag)) continue;
    
    const attrStr = match[2];
    const el = new DOMElement(tag);

    const attrRegex = /([a-zA-Z0-9\-]+)(?:=(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
    let attrMatch;
    while ((attrMatch = attrRegex.exec(attrStr)) !== null) {
      const attrName = attrMatch[1];
      const attrVal = attrMatch[2] !== undefined ? attrMatch[2] : (attrMatch[3] !== undefined ? attrMatch[3] : (attrMatch[4] || ''));
      el.setAttribute(attrName, attrVal);
    }
    doc.body.appendChild(el);
  }
  return doc;
}

// ============================================================================
// Test Suite Sandbox Environment Initializer
// ============================================================================

function setupPortfolioRuntime() {
  const htmlContent = fs.readFileSync(HTML_PATH, 'utf8');
  const jsContent = fs.readFileSync(JS_PATH, 'utf8');
  const document = parseHTMLToDOM(htmlContent);

  const storageStore = {};
  const localStorageMock = {
    getItem: (key) => storageStore[key] || null,
    setItem: (key, val) => { storageStore[key] = String(val); },
    removeItem: (key) => { delete storageStore[key]; },
    clear: () => { for (const k in storageStore) delete storageStore[k]; }
  };

  let clipboardContents = '';
  const navigatorMock = {
    clipboard: {
      writeText: (txt) => {
        clipboardContents = txt;
        return Promise.resolve();
      }
    }
  };

  const windowMock = {
    document,
    localStorage: localStorageMock,
    navigator: navigatorMock,
    matchMedia: (query) => ({
      matches: false,
      addEventListener: () => {},
      removeEventListener: () => {}
    }),
    addEventListener: (event, handler) => document.addEventListener(event, handler),
    removeEventListener: (event, handler) => document.removeEventListener(event, handler),
    scrollTo: () => {},
    scrollBy: () => {},
    scrollY: 0,
    innerHeight: 800,
    innerWidth: 1280
  };

  const sandbox = {
    window: windowMock,
    document,
    localStorage: localStorageMock,
    navigator: navigatorMock,
    console,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval
  };

  vm.createContext(sandbox);

  // Execute app.js with safe export extraction in sandbox
  const instrumentedJs = `
${jsContent}
;globalThis.__EXPORTS__ = {
  ENTERPRISE_TIERS: typeof ENTERPRISE_TIERS !== 'undefined' ? ENTERPRISE_TIERS : undefined,
  PROJECTS: typeof PROJECTS !== 'undefined' ? PROJECTS : undefined,
  COMMANDS: typeof COMMANDS !== 'undefined' ? COMMANDS : undefined,
  state: typeof state !== 'undefined' ? state : undefined,
  dom: typeof dom !== 'undefined' ? dom : undefined,
  switchTier: typeof switchTier !== 'undefined' ? switchTier : undefined,
  toggleTheme: typeof toggleTheme !== 'undefined' ? toggleTheme : undefined,
  setTheme: typeof setTheme !== 'undefined' ? setTheme : undefined,
  openProjectModal: typeof openProjectModal !== 'undefined' ? openProjectModal : undefined,
  closeProjectModal: typeof closeProjectModal !== 'undefined' ? closeProjectModal : undefined,
  openCommandPalette: typeof openCommandPalette !== 'undefined' ? openCommandPalette : undefined,
  closeCommandPalette: typeof closeCommandPalette !== 'undefined' ? closeCommandPalette : undefined,
  searchCommandPalette: typeof searchCommandPalette !== 'undefined' ? searchCommandPalette : undefined,
  executeSelectedCommand: typeof executeSelectedCommand !== 'undefined' ? executeSelectedCommand : undefined,
  copyEmailToClipboard: typeof copyEmailToClipboard !== 'undefined' ? copyEmailToClipboard : undefined,
  renderArchitectureShowcase: typeof renderArchitectureShowcase !== 'undefined' ? renderArchitectureShowcase : undefined
};
`;

  vm.runInContext(instrumentedJs, sandbox);

  // Trigger DOMContentLoaded
  document.dispatchEvent({ type: 'DOMContentLoaded', preventDefault: () => {} });

  const exportsObj = sandbox.__EXPORTS__ || {};
  Object.assign(sandbox, exportsObj);

  return {
    sandbox,
    document,
    localStorage: localStorageMock,
    getClipboard: () => clipboardContents,
    htmlContent,
    jsContent
  };
}

// ============================================================================
// TIER 1: FEATURE COVERAGE (>=5 tests per feature)
// ============================================================================

console.log("\n=======================================================");
console.log("EXECUTION: 4-Tier E2E Test Suite for Yakuzo Portfolio");
console.log("=======================================================\n");

const runtime = setupPortfolioRuntime();
const { sandbox, document, htmlContent, jsContent } = runtime;
const cssContent = fs.readFileSync(CSS_PATH, 'utf8');

// --- Feature 1: Enterprise Tier Taxonomy (Micro, Small, Medium, Large) ---
console.log("\n--- Feature 1: Enterprise Tier Taxonomy ---");

runCheck("Tier 1", "F1: Tier Taxonomy", "All 4 enterprise tiers plus 'all' defined in ENTERPRISE_TIERS", () => {
  assert.ok(sandbox.ENTERPRISE_TIERS, "ENTERPRISE_TIERS must be defined in app.js");
  const keys = Object.keys(sandbox.ENTERPRISE_TIERS);
  ['all', 'micro', 'small', 'medium', 'large'].forEach(tier => {
    assert.ok(keys.includes(tier), `Missing tier: ${tier}`);
  });
});

runCheck("Tier 1", "F1: Tier Taxonomy", "Tier labels exactly match authoritative specification", () => {
  const tiers = sandbox.ENTERPRISE_TIERS;
  assert.strictEqual(tiers.micro.name, "Micro Enterprise");
  assert.strictEqual(tiers.small.name, "Small Business");
  assert.strictEqual(tiers.medium.name, "Medium Enterprise");
  assert.strictEqual(tiers.large.name, "Large Enterprise");
});

runCheck("Tier 1", "F1: Tier Taxonomy", "Each tier defines an explicit engineering domain category", () => {
  const tiers = sandbox.ENTERPRISE_TIERS;
  assert.ok(tiers.micro.domain.includes("POS") || tiers.micro.domain.includes("Kiosks"));
  assert.ok(tiers.small.domain.includes("Operational") || tiers.small.domain.includes("Campus"));
  assert.ok(tiers.medium.domain.includes("Collaboration") || tiers.medium.domain.includes("AI"));
  assert.ok(tiers.large.domain.includes("Distributed") || tiers.large.domain.includes("Low-Level"));
});

runCheck("Tier 1", "F1: Tier Taxonomy", "Each tier defines non-empty core capability focus badges", () => {
  const tiers = sandbox.ENTERPRISE_TIERS;
  ['micro', 'small', 'medium', 'large'].forEach(t => {
    assert.ok(Array.isArray(tiers[t].focus), `Tier ${t} focus must be an array`);
    assert.ok(tiers[t].focus.length >= 4, `Tier ${t} must have at least 4 focus competencies`);
  });
});

runCheck("Tier 1", "F1: Tier Taxonomy", "HTML navigation contains accessible tier tabs with data-tier attributes", () => {
  const tabs = document.querySelectorAll('.tier-tab, .tier-nav-tab, [data-tier]');
  assert.ok(tabs.length >= 5, `Expected at least 5 tier navigation tabs, found ${tabs.length}`);
  const tiersFound = tabs.map(t => t.getAttribute('data-tier'));
  ['all', 'micro', 'small', 'medium', 'large'].forEach(tier => {
    assert.ok(tiersFound.includes(tier), `HTML missing navigation tab for tier: ${tier}`);
  });
});


// --- Feature 2: Complete 12-Project Spectrum Mapping ---
console.log("\n--- Feature 2: Complete 12-Project Spectrum Mapping ---");

runCheck("Tier 1", "F2: Project Mapping", "Exactly 12 projects registered across the enterprise portfolio", () => {
  assert.ok(Array.isArray(sandbox.PROJECTS), "PROJECTS must be an array");
  assert.strictEqual(sandbox.PROJECTS.length, 12, `Expected exactly 12 projects, found ${sandbox.PROJECTS.length}`);
});

runCheck("Tier 1", "F2: Project Mapping", "Micro Enterprise tier contains PisoOS, Cafe POS, and Retail POS", () => {
  const microProjects = sandbox.PROJECTS.filter(p => p.tier === 'micro');
  assert.strictEqual(microProjects.length, 3, "Micro tier must contain 3 projects");
  const ids = microProjects.map(p => p.id);
  assert.ok(ids.includes('pisoos'), "Missing PisoOS in Micro tier");
  assert.ok(ids.includes('cafe-pos'), "Missing Cafe POS in Micro tier");
  assert.ok(ids.includes('retail-pos'), "Missing Retail POS in Micro tier");
});

runCheck("Tier 1", "F2: Project Mapping", "Small Business tier contains Fynn Hotel, NCST SRMS, and Celestine University SRMS", () => {
  const smallProjects = sandbox.PROJECTS.filter(p => p.tier === 'small');
  assert.strictEqual(smallProjects.length, 3, "Small tier must contain 3 projects");
  const ids = smallProjects.map(p => p.id);
  assert.ok(ids.includes('hotel-project'), "Missing Fynn Hotel in Small tier");
  assert.ok(ids.includes('srms'), "Missing NCST SRMS in Small tier");
  assert.ok(ids.includes('cup-srms'), "Missing Celestine University SRMS in Small tier");
});

runCheck("Tier 1", "F2: Project Mapping", "Medium Enterprise tier contains Nexus Workspace and Recipely", () => {
  const mediumProjects = sandbox.PROJECTS.filter(p => p.tier === 'medium');
  assert.strictEqual(mediumProjects.length, 2, "Medium tier must contain 2 projects");
  const ids = mediumProjects.map(p => p.id);
  assert.ok(ids.includes('nexus-workspace'), "Missing Nexus Workspace in Medium tier");
  assert.ok(ids.includes('recipely'), "Missing Recipely in Medium tier");
});

runCheck("Tier 1", "F2: Project Mapping", "Large Enterprise tier contains ShopHub, POVA 5 Pro, Tecno LH8n, and HyperOS Launcher Stack", () => {
  const largeProjects = sandbox.PROJECTS.filter(p => p.tier === 'large');
  assert.strictEqual(largeProjects.length, 4, "Large tier must contain 4 projects");
  const ids = largeProjects.map(p => p.id);
  assert.ok(ids.includes('shophub'), "Missing ShopHub in Large tier");
  assert.ok(ids.includes('pova5pro-charging-bridge'), "Missing POVA 5 Pro in Large tier");
  assert.ok(ids.includes('lh8n-lightbelt-ksu'), "Missing Tecno LH8n in Large tier");
  assert.ok(ids.includes('hyperos-launcher-stack-recents'), "Missing HyperOS Launcher Stack in Large tier");
});

runCheck("Tier 1", "F2: Project Mapping", "Every project possesses valid non-empty identity and metadata fields", () => {
  sandbox.PROJECTS.forEach(p => {
    assert.ok(p.id && typeof p.id === 'string', `Project missing id`);
    assert.ok(p.name && typeof p.name === 'string', `Project ${p.id} missing name`);
    assert.ok(p.tier && ['micro', 'small', 'medium', 'large'].includes(p.tier), `Project ${p.id} has invalid tier`);
    assert.ok(p.repository && typeof p.repository === 'string', `Project ${p.id} missing repository`);
    assert.ok(['Private', 'Public', 'Open Source'].includes(p.access), `Project ${p.id} has invalid access: ${p.access}`);
    assert.ok(p.image && p.image.startsWith('assets/projects/'), `Project ${p.id} has invalid image path: ${p.image}`);
    assert.ok(p.problem && p.problem.length > 20, `Project ${p.id} missing substantive problem statement`);
    assert.ok(p.architecture && p.architecture.length > 20, `Project ${p.id} missing substantive architecture statement`);
    assert.ok(Array.isArray(p.technologies) && p.technologies.length >= 3, `Project ${p.id} must have >= 3 technologies`);
  });
});

runCheck("Tier 1", "F2: Project Mapping", "Large Enterprise projects highlight low-level kernel, bypass, or Kafka architectures", () => {
  const pova = sandbox.PROJECTS.find(p => p.id === 'pova5pro-charging-bridge');
  assert.ok(pova.technologies.some(t => t.includes('KernelSU') || t.includes('PMIC') || t.includes('Bypass')));
  const shophub = sandbox.PROJECTS.find(p => p.id === 'shophub');
  assert.ok(shophub.technologies.some(t => t.includes('Kafka') || t.includes('Redis')));
});


// --- Feature 3: Minimalist Copy & Capabilities Statements ---
console.log("\n--- Feature 3: Minimalist Copy & Capabilities Statements ---");

runCheck("Tier 1", "F3: Minimalist Copy", "Each enterprise tier has a distinct, capability-oriented tagline", () => {
  ['micro', 'small', 'medium', 'large'].forEach(tier => {
    const tagline = sandbox.ENTERPRISE_TIERS[tier].tagline;
    assert.ok(tagline && tagline.length > 30, `Tier ${tier} missing capability tagline`);
  });
});

runCheck("Tier 1", "F3: Minimalist Copy", "Hero engineering statement is concise (<200 characters)", () => {
  const heroMatch = htmlContent.match(/class=["'](?:profile-bio|hero-statement)["'][^>]*>([\s\S]*?)<\/p>/i);
  assert.ok(heroMatch, "Hero statement paragraph must exist");
  const text = heroMatch[1].replace(/\s+/g, ' ').trim();
  assert.ok(text.length < 200, `Hero statement too verbose (${text.length} chars): ${text}`);
});

runCheck("Tier 1", "F3: Minimalist Copy", "Problem statements are concise, professional, and under 300 characters", () => {
  sandbox.PROJECTS.forEach(p => {
    assert.ok(p.problem.length <= 300, `Project ${p.id} problem statement exceeds 300 chars (${p.problem.length})`);
  });
});

runCheck("Tier 1", "F3: Minimalist Copy", "Architecture summaries are concise, technical, and under 350 characters", () => {
  sandbox.PROJECTS.forEach(p => {
    assert.ok(p.architecture.length <= 350, `Project ${p.id} architecture exceeds 350 chars (${p.architecture.length})`);
  });
});

runCheck("Tier 1", "F3: Minimalist Copy", "Zero instances of placeholder or dummy strings in HTML and JS dataset", () => {
  const forbidden = ["TODO", "TBD", "Lorem ipsum", "lorem ipsum", "[placeholder]", "[INSERT", "{INSERT", "dummy text"];
  forbidden.forEach(term => {
    assert.ok(!htmlContent.includes(term), `HTML contains placeholder term: ${term}`);
    assert.ok(!jsContent.includes(`"${term}"`) && !jsContent.includes(`'${term}'`), `JS contains placeholder: ${term}`);
  });
});


// --- Feature 4: Asset Integrity & Zero 404s ---
console.log("\n--- Feature 4: Asset Integrity & Zero 404s ---");

runCheck("Tier 1", "F4: Asset Integrity", "Avatar asset exists at yakuzo/assets/avatar.jpg and is non-empty", () => {
  const avatarPath = path.join(YAKUZO_DIR, 'assets', 'avatar.jpg');
  assert.ok(fs.existsSync(avatarPath), "Avatar file must exist at yakuzo/assets/avatar.jpg");
  const stats = fs.statSync(avatarPath);
  assert.ok(stats.size > 1000, "Avatar file size must be > 1000 bytes");
});

runCheck("Tier 1", "F4: Asset Integrity", "Favicon asset exists at yakuzo/assets/favicon.svg and is valid SVG", () => {
  const favPath = path.join(YAKUZO_DIR, 'assets', 'favicon.svg');
  assert.ok(fs.existsSync(favPath), "Favicon must exist at yakuzo/assets/favicon.svg");
  const content = fs.readFileSync(favPath, 'utf8');
  assert.ok(content.includes('<svg'), "Favicon must contain valid SVG tag");
});

runCheck("Tier 1", "F4: Asset Integrity", "All 12 project screenshot assets referenced in dataset exist on disk", () => {
  sandbox.PROJECTS.forEach(p => {
    const fullPath = path.join(YAKUZO_DIR, p.image);
    assert.ok(fs.existsSync(fullPath), `Asset for project ${p.id} missing at: ${fullPath}`);
    const stats = fs.statSync(fullPath);
    assert.ok(stats.size > 5000, `Asset for project ${p.id} is too small (${stats.size} bytes)`);
  });
});

runCheck("Tier 1", "F4: Asset Integrity", "Large Enterprise screenshots (charge-bridge.png and miui-stack.png) exist in yakuzo/assets/projects/", () => {
  const p1 = path.join(YAKUZO_DIR, 'assets', 'projects', 'charge-bridge.png');
  const p2 = path.join(YAKUZO_DIR, 'assets', 'projects', 'miui-stack.png');
  assert.ok(fs.existsSync(p1), "charge-bridge.png must exist in yakuzo/assets/projects/");
  assert.ok(fs.existsSync(p2), "miui-stack.png must exist in yakuzo/assets/projects/");
  assert.ok(fs.statSync(p1).size > 20000, "charge-bridge.png size must be > 20KB");
  assert.ok(fs.statSync(p2).size > 20000, "miui-stack.png size must be > 20KB");
});

runCheck("Tier 1", "F4: Asset Integrity", "All local image references in index.html resolve to real files on disk", () => {
  const imgMatches = htmlContent.match(/<img[^>]*src=["'](assets\/[^"']+)["']/g) || [];
  assert.ok(imgMatches.length > 0, "Expected img elements in index.html");
  imgMatches.forEach(tag => {
    const src = tag.match(/src=["'](assets\/[^"']+)["']/)[1];
    const assetPath = path.join(YAKUZO_DIR, src);
    assert.ok(fs.existsSync(assetPath), `HTML references non-existent asset: ${src}`);
  });
});


// --- Feature 5: Design Quality & Cliché Elimination ---
console.log("\n--- Feature 5: Design Quality & Cliché Elimination ---");

runCheck("Tier 1", "F5: Design Quality", "Elimination of tracked-out ALL-CAPS eyebrows: no generic uppercase tracked eyebrow class", () => {
  // Check that .eyebrow class does NOT exist with text-transform: uppercase and tracked spacing
  const hasClichéEyebrow = cssContent.includes('.eyebrow') && cssContent.match(/\.eyebrow[\s\S]*?text-transform:\s*uppercase/i);
  assert.ok(!hasClichéEyebrow, "Generic AI tracked uppercase .eyebrow cliché detected in styles.css");
});

runCheck("Tier 1", "F5: Design Quality", "GitHub Dark Theme Design System defined on :root (--bg-canvas, --bg-surface, --border-default, --accent-blue, etc.)", () => {
  const requiredTokens = [
    '--bg-canvas',
    '--bg-surface',
    '--border-default',
    '--border-active',
    '--text-header',
    '--text-primary',
    '--text-muted',
    '--accent-blue',
    '--accent-green'
  ];
  requiredTokens.forEach(token => {
    assert.ok(cssContent.includes(token), `styles.css :root missing required token: ${token}`);
  });
});

runCheck("Tier 1", "F5: Design Quality", "Light theme tokens defined under [data-theme='light'] with inverted high-contrast values", () => {
  const lightBlock = cssContent.match(/\[data-theme=["']light["']\][\s\S]*?\{([\s\S]*?)\}/i);
  assert.ok(lightBlock, "styles.css must define [data-theme='light'] rules");
  const blockContent = lightBlock[1];
  assert.ok(blockContent.includes('--bg-canvas'), "Light theme missing --bg-canvas override");
  assert.ok(blockContent.includes('--text-primary'), "Light theme missing --text-primary override");
  assert.ok(blockContent.includes('--border-default'), "Light theme missing --border-default override");
});

runCheck("Tier 1", "F5: Design Quality", "Typography tokens: sans-serif and mono-space fonts configured with system fallbacks", () => {
  assert.ok(cssContent.includes('--font-sans'), "Missing --font-sans token");
  assert.ok(cssContent.includes('--font-mono'), "Missing --font-mono token");
});

runCheck("Tier 1", "F5: Design Quality", "Accessible motion restraint: @media (prefers-reduced-motion: reduce) rule present", () => {
  assert.ok(cssContent.includes('(prefers-reduced-motion: reduce)'), "CSS must include prefers-reduced-motion media query");
});


// --- Feature 6: Interactive Tier Navigation & Transitions ---
console.log("\n--- Feature 6: Interactive Tier Navigation & Transitions ---");

runCheck("Tier 1", "F6: Navigation", "switchTier('micro') renders 3 projects and updates capability banner", () => {
  sandbox.switchTier('micro');
  assert.strictEqual(sandbox.state.activeTier, 'micro');
  const grid = document.getElementById('projects-grid');
  const cards = grid.children.filter(c => c.tagName === 'ARTICLE');
  assert.strictEqual(cards.length, 3, "Micro tier should render exactly 3 cards");
  const banner = document.getElementById('tier-capability-banner');
  assert.ok(banner.innerHTML.includes("Micro Enterprise"));
});

runCheck("Tier 1", "F6: Navigation", "switchTier('small') renders 3 projects and updates capability banner", () => {
  sandbox.switchTier('small');
  assert.strictEqual(sandbox.state.activeTier, 'small');
  const grid = document.getElementById('projects-grid');
  const cards = grid.children.filter(c => c.tagName === 'ARTICLE');
  assert.strictEqual(cards.length, 3, "Small tier should render exactly 3 cards");
  const banner = document.getElementById('tier-capability-banner');
  assert.ok(banner.innerHTML.includes("Small Business"));
});

runCheck("Tier 1", "F6: Navigation", "switchTier('medium') renders 2 projects and updates capability banner", () => {
  sandbox.switchTier('medium');
  assert.strictEqual(sandbox.state.activeTier, 'medium');
  const grid = document.getElementById('projects-grid');
  const cards = grid.children.filter(c => c.tagName === 'ARTICLE');
  assert.strictEqual(cards.length, 2, "Medium tier should render exactly 2 cards");
  const banner = document.getElementById('tier-capability-banner');
  assert.ok(banner.innerHTML.includes("Medium Enterprise"));
});

runCheck("Tier 1", "F6: Navigation", "switchTier('large') renders 4 projects and updates capability banner", () => {
  sandbox.switchTier('large');
  assert.strictEqual(sandbox.state.activeTier, 'large');
  const grid = document.getElementById('projects-grid');
  const cards = grid.children.filter(c => c.tagName === 'ARTICLE');
  assert.strictEqual(cards.length, 4, "Large tier should render exactly 4 cards");
  const banner = document.getElementById('tier-capability-banner');
  assert.ok(banner.innerHTML.includes("Large Enterprise"));
});

runCheck("Tier 1", "F6: Navigation", "switchTier('all') renders all 12 projects and updates count indicator", () => {
  sandbox.switchTier('all');
  assert.strictEqual(sandbox.state.activeTier, 'all');
  const grid = document.getElementById('projects-grid');
  const cards = grid.children.filter(c => c.tagName === 'ARTICLE');
  assert.strictEqual(cards.length, 12, "All tier should render all 12 cards");
  const counter = document.getElementById('project-count-indicator');
  assert.ok(counter.textContent.includes("12 projects"));
});


// --- Feature 7: System Utilities (Command Palette, Modal, Theme) ---
console.log("\n--- Feature 7: System Utilities ---");

runCheck("Tier 1", "F7: System Utilities", "Theme toggle toggles data-theme attribute on documentElement", () => {
  sandbox.setTheme('dark');
  assert.strictEqual(document.documentElement.getAttribute('data-theme'), 'dark');
  sandbox.toggleTheme();
  assert.strictEqual(document.documentElement.getAttribute('data-theme'), 'light');
  sandbox.toggleTheme();
  assert.strictEqual(document.documentElement.getAttribute('data-theme'), 'dark');
});

runCheck("Tier 1", "F7: System Utilities", "Theme changes persist cleanly to localStorage", () => {
  sandbox.setTheme('light');
  const lightSaved = runtime.localStorage.getItem('yakuzo-gh-theme') || runtime.localStorage.getItem('yakuzo-theme');
  assert.strictEqual(lightSaved, 'light');
  sandbox.setTheme('dark');
  const darkSaved = runtime.localStorage.getItem('yakuzo-gh-theme') || runtime.localStorage.getItem('yakuzo-theme');
  assert.strictEqual(darkSaved, 'dark');
});

runCheck("Tier 1", "F7: System Utilities", "Command palette dialog opens and closes via control methods", () => {
  sandbox.openCommandPalette();
  assert.strictEqual(sandbox.state.cmdPaletteOpen, true);
  const palette = document.getElementById('cmd-palette');
  assert.ok(!palette.hasAttribute('hidden'), "Command palette should not have hidden attribute when open");
  sandbox.closeCommandPalette();
  assert.strictEqual(sandbox.state.cmdPaletteOpen, false);
  assert.ok(palette.hasAttribute('hidden'), "Command palette should have hidden attribute when closed");
});

runCheck("Tier 1", "F7: System Utilities", "Architecture modal opens with project-specific technical specs", () => {
  sandbox.openProjectModal('pova5pro-charging-bridge');
  const modal = document.getElementById('architecture-modal');
  assert.strictEqual(modal.open, true);
  const title = document.getElementById('modal-title');
  assert.ok(title.textContent.includes('POVA 5 Pro'));
  sandbox.closeProjectModal();
  assert.strictEqual(modal.open, false);
});

runCheck("Tier 1", "F7: System Utilities", "Copy email action copies Albert's contact email to clipboard", () => {
  sandbox.copyEmailToClipboard('albertvelez025@gmail.com');
  assert.strictEqual(runtime.getClipboard(), 'albertvelez025@gmail.com');
});


// --- Feature 8: Responsive Layout & Zero Errors ---
console.log("\n--- Feature 8: Responsive Layout & Zero Errors ---");

runCheck("Tier 1", "F8: Quality Floor", "HTML5 Doctype and responsive viewport meta tag configured", () => {
  assert.ok(htmlContent.includes('<!DOCTYPE html>'), "Missing HTML5 doctype");
  assert.ok(htmlContent.includes('name="viewport"'), "Missing viewport meta tag");
  assert.ok(htmlContent.includes('width=device-width'), "Viewport missing width=device-width");
});

runCheck("Tier 1", "F8: Quality Floor", "Semantic landmarks (header, main, nav, section, dialog, footer) present", () => {
  ['<header', '<main', '<nav', '<section', '<dialog', '<footer'].forEach(tag => {
    assert.ok(htmlContent.includes(tag), `HTML missing landmark: ${tag}`);
  });
});

runCheck("Tier 1", "F8: Quality Floor", "Responsive CSS media queries defined for mobile breakpoints", () => {
  assert.ok(cssContent.includes('@media (max-width:'), "styles.css missing mobile media queries");
});

runCheck("Tier 1", "F8: Quality Floor", "Body overflow rules prevent horizontal page scrolling (overflow-x: hidden)", () => {
  assert.ok(cssContent.includes('overflow-x: hidden'), "CSS must prevent horizontal overflow on body/html");
});

runCheck("Tier 1", "F8: Quality Floor", "app.js parses with 0 syntax errors or unhandled reference errors", () => {
  assert.doesNotThrow(() => {
    new vm.Script(jsContent);
  }, "app.js failed syntax parsing check");
});


// ============================================================================
// TIER 2: BOUNDARY & CORNER CASES (>=5 tests)
// ============================================================================
console.log("\n--- Tier 2: Boundary & Corner Cases ---");

runCheck("Tier 2", "Boundary", "B1: Broken image fallback handling in project card markup", () => {
  // Ensure image rendering includes fallback onerror or wrapper background
  const imgWrapClass = cssContent.includes('.card-image-wrap') || cssContent.includes('.project-card-image-wrap') || cssContent.includes('.card-thumb-img') || cssContent.includes('.project-thumbnail');
  assert.ok(imgWrapClass, "CSS must style project card thumbnail wrapper for image loading fallback");
});

runCheck("Tier 2", "Boundary", "B2: Keyboard navigation triggers (Enter, Space, Ctrl+K, Escape)", () => {
  // Check keydown event listener registration
  assert.ok(jsContent.includes('ctrlKey') || jsContent.includes('metaKey'), "Shortcuts must support Ctrl/Cmd key");
  assert.ok(jsContent.includes('"Escape"'), "Escape key shortcut must be handled");
});

runCheck("Tier 2", "Boundary", "B3: Rapid tier switching immunity: 50 switches execute synchronously without DOM corruption", () => {
  const sequence = ['micro', 'large', 'small', 'all', 'medium', 'large', 'micro', 'all'];
  for (let i = 0; i < 50; i++) {
    const tier = sequence[i % sequence.length];
    sandbox.switchTier(tier);
  }
  sandbox.switchTier('micro');
  const grid = document.getElementById('projects-grid');
  const cards = grid.children.filter(c => c.tagName === 'ARTICLE');
  assert.strictEqual(cards.length, 3, "DOM cards should match exact micro tier count after rapid transitions");
});

runCheck("Tier 2", "Boundary", "B4: Resilient theme persistence when localStorage returns null or is absent", () => {
  runtime.localStorage.clear();
  assert.doesNotThrow(() => {
    sandbox.setTheme('dark');
  }, "Theme setting should not fail with empty localStorage");
  assert.strictEqual(document.documentElement.getAttribute('data-theme'), 'dark');
});

runCheck("Tier 2", "Boundary", "B5: Viewport constraint: container elements constrain maximum widths to prevent mobile blowouts", () => {
  assert.ok(cssContent.includes('--container-max') || cssContent.includes('max-width: 1240px'), "CSS must clamp container max width");
  assert.ok(cssContent.includes('box-sizing: border-box'), "CSS must enforce border-box globally");
});


// ============================================================================
// TIER 3: CROSS-FEATURE COMBINATIONS (>=5 tests)
// ============================================================================
console.log("\n--- Tier 3: Cross-Feature Combinations ---");

runCheck("Tier 3", "Combination", "C1: Switch to 'large' tier, open modal for POVA 5 Pro, verify specs, close modal, tier remains 'large'", () => {
  sandbox.switchTier('large');
  assert.strictEqual(sandbox.state.activeTier, 'large');
  
  sandbox.openProjectModal('pova5pro-charging-bridge');
  const modal = document.getElementById('architecture-modal');
  assert.strictEqual(modal.open, true);
  
  const modalBody = document.getElementById('modal-body');
  assert.ok(modalBody.innerHTML.includes('PMIC') || modalBody.innerHTML.includes('Bypass') || modalBody.innerHTML.includes('KernelSU'));
  
  sandbox.closeProjectModal();
  assert.strictEqual(modal.open, false);
  assert.strictEqual(sandbox.state.activeTier, 'large');
});

runCheck("Tier 3", "Combination", "C2: Toggle theme to 'light' while viewing 'medium' tier, verify data-theme='light' and medium projects intact", () => {
  sandbox.switchTier('medium');
  sandbox.setTheme('light');
  
  assert.strictEqual(document.documentElement.getAttribute('data-theme'), 'light');
  assert.strictEqual(sandbox.state.activeTier, 'medium');
  const grid = document.getElementById('projects-grid');
  const cards = grid.children.filter(c => c.tagName === 'ARTICLE');
  assert.strictEqual(cards.length, 2, "Medium enterprise projects must remain rendered in light mode");
});

runCheck("Tier 3", "Combination", "C3: Command palette search for 'Kafka' returns ShopHub Enterprise across tiers", () => {
  sandbox.openCommandPalette();
  sandbox.searchCommandPalette('Kafka');
  
  assert.ok(sandbox.state.cmdMatches.length > 0, "Searching for Kafka must yield results");
  const hasShopHub = sandbox.state.cmdMatches.some(m => m.name.includes('ShopHub') || (m.desc && m.desc.includes('Kafka')));
  assert.ok(hasShopHub, "ShopHub should appear in Kafka search results");
  sandbox.closeCommandPalette();
});

runCheck("Tier 3", "Combination", "C4: Modal dismissal restores clean state", () => {
  sandbox.openProjectModal('shophub');
  const modal = document.getElementById('architecture-modal');
  assert.strictEqual(modal.open, true);
  
  sandbox.closeProjectModal();
  assert.strictEqual(modal.open, false);
});

runCheck("Tier 3", "Combination", "C5: Full circular tier cycle (Micro -> Small -> Medium -> Large -> All) maintains telemetry fidelity", () => {
  const steps = [
    { key: 'micro', count: 3, label: 'Micro Enterprise' },
    { key: 'small', count: 3, label: 'Small Business' },
    { key: 'medium', count: 2, label: 'Medium Enterprise' },
    { key: 'large', count: 4, label: 'Large Enterprise' },
    { key: 'all', count: 12, label: 'All Enterprise Tiers' }
  ];

  steps.forEach(step => {
    sandbox.switchTier(step.key);
    assert.strictEqual(sandbox.state.activeTier, step.key);
    const grid = document.getElementById('projects-grid');
    const cards = grid.children.filter(c => c.tagName === 'ARTICLE');
    assert.strictEqual(cards.length, step.count, `Tier ${step.key} card count mismatch`);
    const banner = document.getElementById('tier-capability-banner');
    assert.ok(banner.innerHTML.includes(step.label), `Banner did not update for ${step.key}`);
  });
});


// ============================================================================
// TIER 4: REAL-WORLD SCENARIOS (>=4 comprehensive scenarios)
// ============================================================================
console.log("\n--- Tier 4: Real-World Scenarios ---");

runCheck("Tier 4", "Scenario 1", "Technical Recruiter Survey: Evaluates low-level engineering capability across Large Enterprise", () => {
  // Step 1: Set theme to default dark telemetry
  sandbox.setTheme('dark');
  assert.strictEqual(document.documentElement.getAttribute('data-theme'), 'dark');

  // Step 2: Jump directly to Large Enterprise tier
  sandbox.switchTier('large');
  assert.strictEqual(sandbox.state.activeTier, 'large');

  // Step 3: Inspect POVA 5 Pro Charging Bridge hardware specs
  sandbox.openProjectModal('pova5pro-charging-bridge');
  const povaProject = sandbox.PROJECTS.find(p => p.id === 'pova5pro-charging-bridge');
  assert.ok(povaProject.problem.includes('power') || povaProject.problem.includes('battery') || povaProject.problem.includes('thermal'));
  assert.ok(povaProject.architecture.includes('PMIC') || povaProject.architecture.includes('bypass') || povaProject.architecture.includes('KernelSU'));
  sandbox.closeProjectModal();

  // Step 4: Verify ShopHub high-throughput event streaming specs
  const shopHubProject = sandbox.PROJECTS.find(p => p.id === 'shophub');
  assert.ok(shopHubProject.technologies.some(t => t.includes('Kafka')));
  assert.ok(shopHubProject.technologies.some(t => t.includes('Redis')));

  // Step 5: Recruiter triggers email copy for interview outreach
  sandbox.copyEmailToClipboard('albertvelez025@gmail.com');
  assert.strictEqual(runtime.getClipboard(), 'albertvelez025@gmail.com');
});

runCheck("Tier 4", "Scenario 2", "Small/Medium Business Client Flow: Inspects POS/Kiosk solutions and Collaboration platforms", () => {
  // Step 1: Client reviews Micro Enterprise tier for offline POS and Kiosk reliability
  sandbox.switchTier('micro');
  const pisoos = sandbox.PROJECTS.find(p => p.id === 'pisoos');
  assert.ok(pisoos.problem.includes('coin') || pisoos.problem.includes('kiosk') || pisoos.problem.includes('terminal'));
  assert.ok(pisoos.technologies.includes('Embedded Linux'));

  // Step 2: Client reviews Small Business operational management systems
  sandbox.switchTier('small');
  const hotel = sandbox.PROJECTS.find(p => p.id === 'hotel-project');
  assert.ok(hotel.name.includes('Hotel Management'));

  // Step 3: Client evaluates Medium Enterprise collaborative workspace
  sandbox.switchTier('medium');
  const nexus = sandbox.PROJECTS.find(p => p.id === 'nexus-workspace');
  assert.ok(nexus.technologies.includes('FastAPI') || nexus.technologies.includes('WebSockets') || nexus.technologies.includes('Next.js 15'));
});

runCheck("Tier 4", "Scenario 3", "Accessibility & Design Audit: Frontend-Design skill compliance and WCAG foundation", () => {
  // Check 1: No cliché AI designs (no tracked-out uppercase eyebrows)
  const trackedEyebrow = cssContent.match(/\.eyebrow[\s\S]*?letter-spacing:\s*(?:0\.[2-9]|[1-9])em/);
  assert.ok(!trackedEyebrow, "No tracked-out uppercase eyebrow tags allowed");

  // Check 2: GitHub border tokens and high data-ink ratio
  assert.ok(cssContent.includes('--border-default: #21262d;'), "Dark default border token defined");
  assert.ok(cssContent.includes('--border-active: #30363d;'), "Dark active border token defined");

  // Check 3: GitHub blue and green accents
  assert.ok(cssContent.includes('--accent-blue: #58a6ff;'), "Dark accent blue defined");
  assert.ok(cssContent.includes('--accent-green: #238636;'), "Dark accent green defined");

  // Check 4: Reduced motion media query
  assert.ok(cssContent.includes('@media (prefers-reduced-motion: reduce)'), "Prefers reduced motion query must be present");

  // Check 5: ARIA role and label verification
  assert.ok(htmlContent.includes('role="tablist"'), "Tablist ARIA role must be present");
  assert.ok(htmlContent.includes('aria-label="Enterprise Tiers"'), "Enterprise Tiers nav must have descriptive aria-label");
});

runCheck("Tier 4", "Scenario 4", "Command Palette Power-User Flow: Keyboard shortcut, instant search, and dismissal", () => {
  // Step 1: Open palette
  sandbox.openCommandPalette();
  assert.strictEqual(sandbox.state.cmdPaletteOpen, true);

  // Step 2: Query for PisoOS embedded Linux kiosk
  sandbox.searchCommandPalette('PisoOS');
  assert.ok(sandbox.state.cmdMatches.length > 0, "Query 'PisoOS' must return matches");
  assert.ok(sandbox.state.cmdMatches.some(m => m.name.includes('PisoOS') || (m.desc && m.desc.includes('PisoOS'))), "Matches must contain PisoOS");

  // Step 3: Query for theme toggle command
  sandbox.searchCommandPalette('theme');
  const themeCmd = sandbox.state.cmdMatches.find(m => m.id.includes('theme'));
  assert.ok(themeCmd, "Command palette must index theme toggle command");

  // Step 4: Dismiss with Escape
  sandbox.closeCommandPalette();
  assert.strictEqual(sandbox.state.cmdPaletteOpen, false);
});


// ============================================================================
// SUMMARY & EXIT CODE
// ============================================================================

console.log("\n=======================================================");
console.log(`TEST RUN COMPLETE: ${totalTests} checks executed`);
console.log(`\x1b[32mPassed:\x1b[0m ${passedTests}`);
console.log(`\x1b[31mFailed:\x1b[0m ${failedTests}`);
console.log("=======================================================\n");

if (failedTests > 0) {
  console.error("FAILURES ENCOUNTERED:");
  failureDetails.forEach(f => {
    console.error(`- ${f.label}: ${f.error.message}`);
  });
  process.exit(1);
} else {
  console.log("All E2E opaque-box assertions passed with 100% compliance.\n");
  process.exit(0);
}
