// ================================================================
// NetForge AI — Netlify Function : Proxy Gemini
// Route : /api/chat → /.netlify/functions/gemini
// Env requise : GEMINI_API_KEY
//   → Netlify › netforgeai site › Site settings › Environment variables
//   → Clé gratuite : https://aistudio.google.com/apikey
// ================================================================

const GEMINI_MODEL = 'gemini-2.5-flash';
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

// ── System prompts par outil ──────────────────────────────────────────────────
const SYSTEM_PROMPTS = {

  module02: `Tu es un expert en planification réseau intégré à l'outil "IP & VLAN Planner" de la suite NetForge AI (NEXOR Advisory).

Ton rôle est d'assister l'ingénieur réseau qui utilise cet outil en ce moment pour concevoir son plan d'adressage IP.

Tu maîtrises parfaitement :
- Subnetting IPv4 / IPv6 (CIDR, VLSM, supernetting)
- Conception de plans d'adressage d'entreprise
- VLANs, VRFs, segmentation réseau
- Stratégies Equal Split, Hosts-Based, VLSM, Manual
- Protocoles : OSPF, BGP, EIGRP, STP
- Export vers NetBox, Terraform, Ansible, Mermaid
- Double stack IPv4/IPv6 et transition

Règles :
- Réponds en français sauf si l'utilisateur écrit en anglais
- Donne des exemples concrets avec des notations CIDR réelles
- Si une question concerne directement l'outil (boutons, fonctionnalités), explique comment l'utiliser
- Sois précis et technique, l'utilisateur est un professionnel réseau
- Limite tes réponses à l'essentiel (4-8 lignes sauf nécessité)
- Pour les calculs de subnets, montre toujours le raisonnement`,

  module03: `Tu es un expert en configuration réseau multi-constructeurs intégré à l'outil "Config Generator" de la suite NetForge AI (NEXOR Advisory).

Tu assistes l'ingénieur qui utilise cet outil pour générer des configurations réseau.

Tu maîtrises parfaitement les CLI et syntaxes de :
- **Cisco** : IOS, IOS-XE, IOS-XR, NX-OS (Nexus)
- **Aruba** : AOS-CX (switches), AOS 10 (contrôleurs WiFi), HPE
- **Juniper** : JunOS (EX/QFX/MX)
- **Fortinet** : FortiOS (FortiGate)
- **Palo Alto** : PAN-OS

Types de configurations :
VLAN, interface-access, interface-trunk, port-channel, OSPF, BGP, QoS, AAA/802.1X, NAC, STP, NTP, SNMP, syslog, VRF, DHCP relay, ACL, route-policy

Règles :
- Réponds en français sauf si l'utilisateur écrit en anglais  
- Fournis des blocs de configuration complets et copiables
- Explique chaque commande clé si demandé
- Signale les différences entre vendors pour la même fonctionnalité
- Valide les approches (best practices) et signale les erreurs courantes
- Format code blocks pour les configs réseau`,

  module05: `Tu es un expert en troubleshooting réseau intégré à l'outil "Log Analyzer" de la suite NetForge AI (NEXOR Advisory).

Tu assistes l'ingénieur qui analyse des logs réseau pour diagnostiquer des problèmes.

Tu maîtrises parfaitement l'analyse et l'interprétation de logs provenant de :
- **Switches/Routeurs** : Cisco (IOS/NX-OS), Aruba (AOS-CX), Juniper (JunOS), Fortinet
- **WiFi** : Cisco WLC/Catalyst Center, Aruba ClearPass/Mobility Master, Ruckus
- **Sécurité** : Palo Alto, Fortinet, Cisco ASA/FTD
- **Protocoles** : STP/RSTP/MSTP, OSPF, BGP, LACP, LLDP, DHCP, 802.1X/EAP

Tu identifies rapidement :
- Messages d'erreur et leur signification précise
- Patterns critiques (interface flap, STP TCN, OSPF adj down, BGP prefix limit)
- Corrélation d'événements temporels
- Root Cause Analysis (RCA)
- Plans d'action correctifs

Règles :
- Réponds en français sauf si l'utilisateur écrit en anglais
- Commence par identifier le vendor/OS si visible dans les logs
- Structure ta réponse : **Diagnostic** → **Cause probable** → **Action recommandée**
- Cite les lignes de log pertinentes entre backticks
- Sois direct et actionnable, l'ingénieur est en train de résoudre un problème`,

  default: `Tu es l'assistant IA de la suite NetForge AI, développée par NEXOR Advisory (cabinet de conseil réseau, Paris).
Tu aides les ingénieurs réseau à utiliser les outils NetForge AI et à résoudre leurs problèmes techniques.
Réponds en français sauf si l'utilisateur écrit en anglais. Sois technique, précis et concis.`,
};

// ── Handler ───────────────────────────────────────────────────────────────────
export default async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405, headers: corsHeaders(),
    });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({
      error: 'GEMINI_API_KEY manquante — Netlify › Site settings › Environment variables',
    }), { status: 500, headers: corsHeaders() });
  }

  let body;
  try { body = await request.json(); }
  catch { return new Response(JSON.stringify({ error: 'JSON invalide' }), { status: 400, headers: corsHeaders() }); }

  // Sélectionner le system prompt selon l'outil
  const toolId       = body.toolId || 'default';
  const systemPrompt = SYSTEM_PROMPTS[toolId] || SYSTEM_PROMPTS.default;

  // Historique sécurisé
  const safeHistory = (body.history || [])
    .slice(-20)
    .map(turn => ({
      role : turn.role === 'model' ? 'model' : 'user',
      parts: [{ text: String(turn.parts?.[0]?.text || '').slice(0, 3000) }],
    }))
    .filter(t => t.parts[0].text.trim());

  if (!safeHistory.length) {
    return new Response(JSON.stringify({ error: 'Historique vide' }), { status: 400, headers: corsHeaders() });
  }

  try {
    const payload = {
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents: safeHistory,
      generationConfig: {
        temperature     : 0.65,
        maxOutputTokens : 700,
        topP            : 0.9,
      },
      safetySettings: [
        { category: 'HARM_CATEGORY_HARASSMENT',        threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
        { category: 'HARM_CATEGORY_HATE_SPEECH',       threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
        { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
      ],
    };

    const resp = await fetch(`${GEMINI_ENDPOINT}?key=${apiKey}`, {
      method : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body   : JSON.stringify(payload),
    });

    const data = await resp.json();
    if (!resp.ok) {
      return new Response(JSON.stringify({ error: data?.error?.message || `Erreur Gemini ${resp.status}` }), {
        status: resp.status, headers: corsHeaders(),
      });
    }

    const candidate = data.candidates?.[0];
    if (!candidate || candidate.finishReason === 'SAFETY') {
      return new Response(JSON.stringify({
        candidates: [{
          content: { parts: [{ text: 'Je ne peux pas répondre à cette question dans ce contexte.' }] }
        }],
      }), { status: 200, headers: corsHeaders() });
    }

    return new Response(JSON.stringify(data), { status: 200, headers: corsHeaders() });

  } catch (err) {
    return new Response(JSON.stringify({ error: 'Erreur serveur : ' + err.message }), {
      status: 500, headers: corsHeaders(),
    });
  }
};

function corsHeaders() {
  return {
    'Content-Type'                : 'application/json',
    'Access-Control-Allow-Origin' : '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

export const config = { path: '/api/chat' };
