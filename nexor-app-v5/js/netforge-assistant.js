/**
 * NetForge AI — Assistant IA Gemini par outil
 * Lecture de window.NX_TOOL_ID pour adapter le contexte
 * Appelle /api/chat → /.netlify/functions/gemini
 */

(function () {
  'use strict';

  // ── Config par outil ────────────────────────────────────────────────────────
  const TOOL_CONFIG = {
    'module02': {
      title    : 'IP & VLAN Planner',
      icon     : '🌐',
      color    : '#059669',
      colorDark: '#047857',
      colorGlow: 'rgba(5,150,105,.55)',
      greeting : "Bonjour ! Je suis votre assistant **IP & VLAN Planner**.\n\nJe peux vous aider à :\n- **Concevoir** votre plan d'adressage IPv4/IPv6\n- **Calculer** des sous-réseaux et masques CIDR\n- **Définir** vos VLANs, VRFs et stratégies de découpage\n- **Interpréter** les résultats générés par l'outil\n\nQuelle est votre question réseau ?",
    },
    'module03': {
      title    : 'Config Generator',
      icon     : '⚙️',
      color    : '#D97706',
      colorDark: '#B45309',
      colorGlow: 'rgba(217,119,6,.55)',
      greeting : "Bonjour ! Je suis votre assistant **Config Generator**.\n\nJe peux vous aider à :\n- **Expliquer** chaque bloc de configuration généré\n- **Comparer** les syntaxes Cisco / Aruba / Juniper / Fortinet\n- **Valider** votre approche (VLANs, QoS, BGP, ACL…)\n- **Déboguer** une erreur de configuration\n\nQue souhaitez-vous configurer ?",
    },
    'module05': {
      title    : 'Log Analyzer',
      icon     : '🔍',
      color    : '#7C3AED',
      colorDark: '#5B21B6',
      colorGlow: 'rgba(124,58,237,.55)',
      greeting : "Bonjour ! Je suis votre assistant **Log Analyzer**.\n\nJe peux vous aider à :\n- **Interpréter** les messages d'erreur et les logs réseau\n- **Identifier** les patterns critiques (flap, storm, timeout…)\n- **Proposer** des étapes de diagnostic et de RCA\n- **Contextualiser** les événements sur vos équipements\n\nCollez un extrait de log ou décrivez votre problème.",
      systemPrompt: "Tu es un Ingénieur TAC Niveau 3. RÈGLES D'EXPERTISE: 1) MAC Flapping / Roaming Wi-Fi : Si tu vois des MAC FLAP (ex: %SW_MATM-4-MACFLAP_NOTIF) entre 2 ports de manière répétée, n'indique pas d'emblée une boucle L2. C'est souvent un client Wi-Fi qui roam entre deux APs. Recommande TOUJOURS de vérifier les voisins avec 'show cdp neighbors' pour confirmer si ce sont des APs. 2) Sévérité : Un roaming Wi-Fi est 'Info/Low', pas 'Critical'. Ne propose pas de couper le port sans vérification."
    },
    'default': {
      title    : 'NetForge AI',
      icon     : '⚡',
      color    : '#7C3AED',
      colorDark: '#5B21B6',
      colorGlow: 'rgba(124,58,237,.55)',
      greeting : "Bonjour ! Je suis l'assistant **NetForge AI**.\n\nComment puis-je vous aider avec vos outils réseau ?",
    },
  };

  // ── Détection du contexte ────────────────────────────────────────────────────
  const TOOL_ID = (typeof window.NX_TOOL_ID === 'string')
    ? window.NX_TOOL_ID
    : (() => {
        const path = window.location.pathname;
        if (path.includes('module02') || path.includes('ip-vlan')) return 'module02';
        if (path.includes('module03') || path.includes('config-gen')) return 'module03';
        if (path.includes('module05') || path.includes('log-anal'))  return 'module05';
        return 'default';
      })();

  const CFG          = TOOL_CONFIG[TOOL_ID] || TOOL_CONFIG['default'];
  const MAX_HISTORY  = 14;
  const API_ENDPOINT = '/api/chat';

  let history  = [];
  let isOpen   = false;
  let isTyping = false;
  
  const isLocalEnv = window.location.protocol === 'file:' || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

  // ── Styles dynamiques (couleurs par outil) ──────────────────────────────────
  function buildStyles() {
    const C  = CFG.color;
    const CD = CFG.colorDark;
    const CG = CFG.colorGlow;
    const style = document.createElement('style');
    style.textContent = `
      :root {
        --nfa-c:  ${C};
        --nfa-cd: ${CD};
        --nfa-cg: ${CG};
      }
      #nfa-btn {
        position: fixed; bottom: 26px; right: 26px; z-index: 9000;
        width: 56px; height: 56px; border-radius: 50%;
        background: linear-gradient(135deg, var(--nfa-c), var(--nfa-cd));
        border: none; cursor: pointer;
        box-shadow: 0 4px 20px var(--nfa-cg);
        display: flex; align-items: center; justify-content: center;
        font-size: 24px; transition: transform .2s, box-shadow .2s;
        animation: nfa-pulse 3.5s infinite;
      }
      #nfa-btn:hover { transform: scale(1.1); box-shadow: 0 6px 30px var(--nfa-cg); }
      @keyframes nfa-pulse {
        0%,100%{ box-shadow: 0 4px 20px var(--nfa-cg); }
        55%    { box-shadow: 0 4px 36px var(--nfa-cg); }
      }
      #nfa-badge {
        position: absolute; top: -3px; right: -3px;
        background: #EF4444; color: #fff; border-radius: 50%;
        width: 17px; height: 17px; font-size: 9px; font-weight: 700;
        display: none; align-items: center; justify-content: center;
        font-family: inherit;
      }
      /* Panel */
      #nfa-panel {
        position: fixed; bottom: 96px; right: 26px; z-index: 8999;
        width: 370px; max-width: calc(100vw - 36px);
        background: #08160c; border: 1px solid rgba(255,255,255,.08);
        border-top: 2px solid var(--nfa-c);
        border-radius: 16px; box-shadow: 0 16px 60px rgba(0,0,0,.7);
        display: flex; flex-direction: column; max-height: 500px;
        transform: translateY(10px) scale(.98); opacity: 0; pointer-events: none;
        transition: opacity .2s ease, transform .2s ease;
        font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      }
      #nfa-panel.open { opacity: 1; pointer-events: all; transform: translateY(0) scale(1); }
      /* Header */
      #nfa-header {
        display: flex; align-items: center; gap: 10px;
        padding: 13px 15px; background: rgba(255,255,255,.03);
        border-bottom: 1px solid rgba(255,255,255,.06);
        border-radius: 14px 14px 0 0;
      }
      #nfa-avatar {
        width: 32px; height: 32px; border-radius: 8px;
        background: linear-gradient(135deg, var(--nfa-c), var(--nfa-cd));
        display: flex; align-items: center; justify-content: center;
        font-size: 15px; flex-shrink: 0;
      }
      #nfa-header-text { flex: 1; min-width: 0; }
      #nfa-header-text strong {
        display: block; font-size: 11px; font-weight: 700; color: #fff;
        letter-spacing: .5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      }
      #nfa-header-text span {
        font-size: 9px; color: rgba(255,255,255,.35); letter-spacing: 1px; text-transform: uppercase;
      }
      #nfa-status {
        font-size: 8px; color: #6EE7B7; letter-spacing: 1px;
        display: flex; align-items: center; gap: 4px;
      }
      #nfa-status::before {
        content: ''; width: 5px; height: 5px; border-radius: 50%;
        background: #6EE7B7; animation: nfa-blink 2.2s infinite;
      }
      @keyframes nfa-blink { 0%,100%{opacity:1} 50%{opacity:.25} }
      #nfa-close {
        background: none; border: none; color: rgba(255,255,255,.3);
        font-size: 17px; cursor: pointer; padding: 2px 4px;
        transition: color .15s;
      }
      #nfa-close:hover { color: #fff; }
      /* Messages */
      #nfa-messages {
        flex: 1; overflow-y: auto; padding: 12px;
        display: flex; flex-direction: column; gap: 9px;
        scroll-behavior: smooth;
      }
      #nfa-messages::-webkit-scrollbar { width: 3px; }
      #nfa-messages::-webkit-scrollbar-thumb {
        background: var(--nfa-c); border-radius: 2px; opacity: .4;
      }
      .nfa-msg {
        max-width: 88%; padding: 9px 12px;
        font-size: 12px; line-height: 1.6;
        animation: nfa-in .18s ease;
      }
      @keyframes nfa-in { from{opacity:0;transform:translateY(5px)} to{opacity:1;transform:none} }
      .nfa-msg.bot {
        background: rgba(255,255,255,.04); border: 1px solid rgba(255,255,255,.07);
        color: rgba(255,255,255,.8); align-self: flex-start;
        border-radius: 4px 12px 12px 12px;
      }
      .nfa-msg.user {
        background: linear-gradient(135deg, var(--nfa-c), var(--nfa-cd));
        color: #fff; align-self: flex-end;
        border-radius: 12px 12px 4px 12px;
      }
      .nfa-msg.bot strong { color: #fff; }
      .nfa-msg.bot a { color: var(--nfa-c); text-decoration: underline; }
      .nfa-msg.bot code {
        background: rgba(255,255,255,.08); padding: 1px 5px;
        border-radius: 3px; font-family: monospace; font-size: 11px;
        color: #6EE7B7;
      }
      .nfa-msg.bot ul, .nfa-msg.bot ol { margin: 5px 0 0 15px; }
      .nfa-msg.bot li { margin-bottom: 2px; }
      .nfa-msg.bot pre {
        background: rgba(0,0,0,.4); border: 1px solid rgba(255,255,255,.06);
        border-radius: 6px; padding: 8px; margin-top: 6px;
        font-family: monospace; font-size: 10px; line-height: 1.5;
        color: #6EE7B7; overflow-x: auto; white-space: pre;
      }
      /* Typing indicator */
      .nfa-typing {
        display: flex; gap: 4px; align-items: center;
        padding: 9px 13px; background: rgba(255,255,255,.04);
        border: 1px solid rgba(255,255,255,.07);
        border-radius: 4px 12px 12px 12px; align-self: flex-start;
      }
      .nfa-typing span {
        width: 5px; height: 5px; border-radius: 50%;
        background: var(--nfa-c); animation: nfa-dot .9s infinite;
      }
      .nfa-typing span:nth-child(2) { animation-delay: .17s; }
      .nfa-typing span:nth-child(3) { animation-delay: .34s; }
      @keyframes nfa-dot { 0%,80%,100%{transform:scale(.65);opacity:.4} 40%{transform:scale(1);opacity:1} }
      /* Suggestions rapides */
      #nfa-suggestions {
        display: flex; flex-wrap: wrap; gap: 5px;
        padding: 0 12px 8px;
      }
      .nfa-sug {
        font-size: 10px; padding: 4px 9px;
        background: rgba(255,255,255,.05); border: 1px solid rgba(255,255,255,.1);
        border-radius: 20px; color: rgba(255,255,255,.6); cursor: pointer;
        transition: all .15s; white-space: nowrap;
      }
      .nfa-sug:hover {
        background: var(--nfa-c); border-color: var(--nfa-c); color: #fff;
      }
      /* Input */
      #nfa-input-bar {
        display: flex; gap: 7px; padding: 10px 12px;
        border-top: 1px solid rgba(255,255,255,.06);
        background: rgba(0,0,0,.3); border-radius: 0 0 14px 14px;
      }
      #nfa-input {
        flex: 1; background: rgba(255,255,255,.06);
        border: 1px solid rgba(255,255,255,.1); border-radius: 8px;
        padding: 8px 11px; color: #fff; font-size: 12px;
        font-family: inherit; outline: none; resize: none;
        height: 36px; transition: border-color .15s;
        line-height: 1.4;
      }
      #nfa-input:focus { border-color: var(--nfa-c); }
      #nfa-input::placeholder { color: rgba(255,255,255,.2); }
      #nfa-send {
        width: 36px; height: 36px; border-radius: 8px;
        background: linear-gradient(135deg, var(--nfa-c), var(--nfa-cd));
        border: none; cursor: pointer; color: #fff; font-size: 14px;
        display: flex; align-items: center; justify-content: center;
        flex-shrink: 0; transition: transform .15s, opacity .15s;
      }
      #nfa-send:hover:not(:disabled) { transform: scale(1.08); }
      #nfa-send:disabled { opacity: .35; cursor: default; }
      /* Footer */
      #nfa-footer {
        text-align: center; padding: 0 12px 8px;
        font-size: 8px; color: rgba(255,255,255,.2);
      }
      /* Responsive */
      @media (max-width: 480px) {
        #nfa-panel { right: 12px; width: calc(100vw - 24px); bottom: 86px; }
        #nfa-btn   { bottom: 16px; right: 12px; }
      }
    `;
    document.head.appendChild(style);
  }

  // ── Suggestions rapides par outil ───────────────────────────────────────────
  const QUICK_SUGGESTIONS = {
    module02: [
      'Comment diviser un /16 en VLANs ?',
      'Différence IPv4 vs IPv6 ?',
      'Qu\'est-ce qu\'une VRF ?',
      'Comment calculer un masque CIDR ?',
    ],
    module03: [
      'Syntaxe trunk Cisco vs Aruba ?',
      'Configurer 802.1X sur Cisco IOS',
      'Différence OSPF vs BGP ?',
      'Template QoS Aruba CX ?',
    ],
    module05: [
      'Que signifie "STP TCN" dans les logs ?',
      'Analyser un log de flap d\'interface',
      'OSPF adjacency stuck INIT ?',
      'Logs DHCP : pas d\'IP attribuée',
    ],
    default: [
      'Comment démarrer ?',
      'Aide sur cet outil',
    ],
  };

  // ── Build du DOM ─────────────────────────────────────────────────────────────
  function buildWidget() {
    const btn = document.createElement('button');
    btn.id = 'nfa-btn';
    btn.setAttribute('aria-label', `Assistant ${CFG.title}`);
    btn.innerHTML = `
      <span id="nfa-badge"></span>
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 2C6.48 2 2 6.48 2 12c0 1.85.5 3.58 1.38 5.07L2 22l4.93-1.38A9.95 9.95 0 0 0 12 22c5.52 0 10-4.48 10-10S17.52 2 12 2z"/>
        <path d="M8 12h.01M12 12h.01M16 12h.01" stroke-width="2.5"/>
      </svg>
    `;

    const sugs = (QUICK_SUGGESTIONS[TOOL_ID] || QUICK_SUGGESTIONS['default'])
      .map(s => `<button class="nfa-sug">${s}</button>`)
      .join('');

    const panel = document.createElement('div');
    panel.id = 'nfa-panel';
    panel.setAttribute('role', 'dialog');
    panel.innerHTML = `
      <div id="nfa-header">
        <div id="nfa-avatar">${CFG.icon}</div>
        <div id="nfa-header-text">
          <strong>Assistant · ${CFG.title}</strong>
          <span>NetForge AI · ${isLocalEnv ? 'LM Studio (Local)' : 'Gemini'}</span>
        </div>
        <div id="nfa-status">actif</div>
        <button id="nfa-close" aria-label="Fermer">×</button>
      </div>
      <div id="nfa-messages" role="log" aria-live="polite"></div>
      <div id="nfa-suggestions">${sugs}</div>
      <div id="nfa-input-bar">
        <textarea id="nfa-input" placeholder="Posez une question sur cet outil…" rows="1" maxlength="800"></textarea>
        <button id="nfa-send" aria-label="Envoyer">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
          </svg>
        </button>
      </div>
      <div id="nfa-footer">Réponses IA · Non contractuelles · NEXOR Advisory</div>
    `;

    document.body.appendChild(btn);
    document.body.appendChild(panel);

    addMessage('bot', CFG.greeting);

    // Listeners
    btn.addEventListener('click', toggleChat);
    panel.querySelector('#nfa-close').addEventListener('click', closeChat);
    panel.querySelector('#nfa-send').addEventListener('click', sendMessage);
    panel.querySelector('#nfa-input').addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
    });
    panel.querySelector('#nfa-input').addEventListener('input', autoResize);
    // Suggestions rapides
    panel.querySelectorAll('.nfa-sug').forEach(btn => {
      btn.addEventListener('click', () => {
        const input = document.getElementById('nfa-input');
        if (input) { input.value = btn.textContent; openChat(); sendMessage(); }
      });
    });
  }

  // ── Helpers UI ──────────────────────────────────────────────────────────────
  function toggleChat() { isOpen ? closeChat() : openChat(); }

  function openChat() {
    isOpen = true;
    document.getElementById('nfa-panel').classList.add('open');
    const badge = document.getElementById('nfa-badge');
    if (badge) badge.style.display = 'none';
    scrollToBottom();
    setTimeout(() => document.getElementById('nfa-input')?.focus(), 200);
    // Masquer les suggestions après la première ouverture
    if (history.length > 1) {
      const sugs = document.getElementById('nfa-suggestions');
      if (sugs) sugs.style.display = 'none';
    }
  }

  function closeChat() {
    isOpen = false;
    document.getElementById('nfa-panel').classList.remove('open');
  }

  function autoResize() {
    const ta = document.getElementById('nfa-input');
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 96) + 'px';
  }

  function scrollToBottom() {
    const el = document.getElementById('nfa-messages');
    if (el) setTimeout(() => { el.scrollTop = el.scrollHeight; }, 40);
  }

  // ── Rendu Markdown enrichi ──────────────────────────────────────────────────
  function renderMd(text) {
    let s = text
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    // Code block (``` ... ```)
    s = s.replace(/```[\w]*\n?([\s\S]*?)```/g, (_, c) => `<pre>${c.trim()}</pre>`);
    // Inline code
    s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
    // Bold, italic
    s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/\*(.+?)\*/g, '<em>$1</em>');
    // Links
    s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^\)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
    // Lists
    s = s.replace(/^[-•]\s+(.+)$/gm, '<li>$1</li>');
    s = s.replace(/(<li>.*<\/li>(\n)?)+/g, m => `<ul>${m}</ul>`);
    // Line breaks
    s = s.replace(/\n\n/g, '<br><br>').replace(/\n/g, '<br>');
    return s;
  }

  function addMessage(role, text) {
    const msgs = document.getElementById('nfa-messages');
    if (!msgs) return;
    const div = document.createElement('div');
    div.className = 'nfa-msg ' + role;
    div.innerHTML = renderMd(text);
    msgs.appendChild(div);
    scrollToBottom();
    if (!isOpen && role === 'bot') {
      const badge = document.getElementById('nfa-badge');
      if (badge) { badge.style.display = 'flex'; badge.textContent = '1'; }
    }
  }

  function showTyping() {
    const msgs = document.getElementById('nfa-messages');
    if (!msgs) return;
    const el = document.createElement('div');
    el.className = 'nfa-typing'; el.id = 'nfa-typing';
    el.innerHTML = '<span></span><span></span><span></span>';
    msgs.appendChild(el); scrollToBottom();
  }

  function hideTyping() { document.getElementById('nfa-typing')?.remove(); }

  // ── Envoi ────────────────────────────────────────────────────────────────────
  async function sendMessage() {
    if (isTyping) return;
    const input = document.getElementById('nfa-input');
    const send  = document.getElementById('nfa-send');
    if (!input) return;
    const text = input.value.trim();
    if (!text) return;

    // Masquer suggestions
    const sugs = document.getElementById('nfa-suggestions');
    if (sugs) sugs.style.display = 'none';

    input.value = ''; input.style.height = '36px';
    addMessage('user', text);
    history.push({ role: 'user', parts: [{ text }] });
    if (history.length > MAX_HISTORY) history.splice(0, 2);

    isTyping = true;
    if (send) send.disabled = true;
    showTyping();

    try {
      // Détection de l'environnement local (file:// ou localhost)
      let reply = "";

      if (!isLocalEnv) {
        // MODE PRODUCTION : Utilisation du proxy sécurisé vers Gemini (/api/chat)
        const resp = await fetch(API_ENDPOINT, {
          method : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body   : JSON.stringify({
            history: history.slice(-MAX_HISTORY),
            toolId : TOOL_ID,      // ← contexte outil passé au backend
          }),
        });

        if (!resp.ok) {
          const err = await resp.json().catch(() => ({}));
          throw new Error(err.error || `Erreur HTTP ${resp.status}`);
        }

        const data = await resp.json();
        reply = data.candidates?.[0]?.content?.parts?.[0]?.text
          || data.reply
          || 'Désolé, je n\'ai pas pu générer une réponse.';
      } else {
        // MODE LOCAL : Fallback transparent vers LM Studio
        // Conversion de l'historique au format OpenAI (requis par LM Studio)
        const lmMessages = history.slice(-MAX_HISTORY).map(msg => ({
          role: msg.role === 'model' ? 'assistant' : msg.role,
          content: msg.parts[0].text
        }));
        
        // Ajout du System Prompt contextuel
        const baseSys = `Tu es l'Expert Technique de référence absolue (Architecte / TAC Niveau 3) pour l'outil ${CFG.title} au sein du cabinet de conseil haut de gamme NEXOR Advisory. Tu accompagnes des clients très exigeants. Tes réponses doivent être extrêmement approfondies, fiables, pédagogiques et professionnelles, dignes d'un service de très haut standing. Règle absolue : réponds TOUJOURS en Français.`;
        const expertSys = CFG.systemPrompt ? `\n\nDIRECTIVES EXPERTES SPÉCIFIQUES :\n${CFG.systemPrompt}` : '';
        lmMessages.unshift({
           role: 'system', 
           content: baseSys + expertSys
        });

        const resp = await fetch('http://127.0.0.1:1234/v1/chat/completions', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({
            messages: lmMessages,
            temperature: 0.3
          })
        });

        if (!resp.ok) throw new Error("LM Studio introuvable. Veuillez lancer LM Studio et activer le serveur local sur le port 1234.");
        
        const data = await resp.json();
        reply = data.choices[0].message.content;
      }

      history.push({ role: 'model', parts: [{ text: reply }] });
      hideTyping(); addMessage('bot', reply);

    } catch (err) {
      hideTyping();
      addMessage('bot', `⚠️ *${err.message}*\n\n(Note: En local, assurez-vous que LM Studio est bien démarré sur http://127.0.0.1:1234)`);
    } finally {
      isTyping = false;
      if (send) send.disabled = false;
      input.focus();
    }
  }

  // ── Init ─────────────────────────────────────────────────────────────────────
  function init() { buildStyles(); buildWidget(); }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
