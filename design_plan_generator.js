// ============================================================================
// DESIGN PLAN GENERATOR - Modèle Stylisé Haute Définition A4 pour Impression / PDF
// Conforme au modèle Word A4 officiel : Marges 1.0 cm partout, 3 colonnes, 1 page par jour
// Avec logo officiel Al Kawthar, photos Google Drive fiables et pied de page scellé
// ============================================================================

const fs = require('fs');
const path = require('path');

// Chargement du Logo Al Kawthar officiel (SVG vectoriel parfait)
let logoAlKawtharUri = '';
try {
  const logoSvgPath = path.join(__dirname, 'public/logo-alkawthar.svg');
  if (fs.existsSync(logoSvgPath)) {
    const svgStr = fs.readFileSync(logoSvgPath, 'utf8');
    logoAlKawtharUri = `data:image/svg+xml;base64,${Buffer.from(svgStr).toString('base64')}`;
  }
} catch (e) {
  console.warn('Erreur chargement logo SVG Al Kawthar:', e.message);
}

// Fallback intégré haute fidélité du logo au cas où le fichier n'est pas sur le disque
if (!logoAlKawtharUri) {
  const inlineSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 500" width="500" height="500">
  <defs>
    <linearGradient id="akCyanGrad" x1="0%" y1="100%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#0284C7" />
      <stop offset="45%" stop-color="#00A3E0" />
      <stop offset="100%" stop-color="#38BDF8" />
    </linearGradient>
    <linearGradient id="akCyanGrad2" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#7DD3FC" />
      <stop offset="60%" stop-color="#0284C7" />
      <stop offset="100%" stop-color="#0369A1" />
    </linearGradient>
    <path id="arcTop" d="M 80,250 A 170,170 0 0,1 420,250" fill="none" />
    <path id="arcBottom" d="M 85,250 A 165,165 0 0,0 415,250" fill="none" />
  </defs>
  <circle cx="250" cy="250" r="242" fill="#FFFFFF" />
  <circle cx="250" cy="250" r="236" fill="none" stroke="#082A5E" stroke-width="4.5" />
  <circle cx="250" cy="250" r="226" fill="none" stroke="#082A5E" stroke-width="2" />
  <circle cx="250" cy="250" r="148" fill="none" stroke="#082A5E" stroke-width="2.5" />
  <circle cx="250" cy="250" r="142" fill="#062047" />
  <circle cx="68" cy="246" r="6.5" fill="#082A5E" />
  <circle cx="432" cy="246" r="6.5" fill="#082A5E" />
  <text font-family="'Cinzel', 'Times New Roman', serif" font-size="42" font-weight="bold" fill="#082A5E" letter-spacing="8">
    <textPath href="#arcTop" startOffset="50%" text-anchor="middle">AL KAWTHAR</textPath>
  </text>
  <text font-family="'Outfit', 'Montserrat', 'Helvetica', sans-serif" font-size="20" font-weight="700" fill="#082A5E" letter-spacing="3.5">
    <textPath href="#arcBottom" startOffset="50%" text-anchor="middle">LES ÉCOLES INTERNATIONALES</textPath>
  </text>
  <g transform="translate(250, 250)">
    <path d="M -95 -25 C -55 -105, 55 -100, 95 -30 C 85 -18, 70 -30, 48 -58 C 8 -92, -52 -82, -82 -12 Z" fill="url(#akCyanGrad)" />
    <path d="M -60 100 C -20 80, 50 30, 75 -45 C 85 -55, 90 -40, 82 -25 C 60 45, -5 95, -45 115 Z" fill="url(#akCyanGrad)" />
    <path d="M -85 -10 C -40 -10, 30 20, 65 75 C 55 85, 45 75, 20 40 C -15 0, -55 -2, -80 5 Z" fill="url(#akCyanGrad2)" />
    <path d="M -90 -5 C -65 50, -5 85, 50 75 C 40 85, -15 95, -70 60 C -95 35, -100 10, -90 -5 Z" fill="url(#akCyanGrad)" opacity="0.9" />
  </g>
</svg>`;
  logoAlKawtharUri = `data:image/svg+xml;base64,${Buffer.from(inlineSvg).toString('base64')}`;
}

const subjectColors = {
  'francais': { bg: '#EEF2FF', border: '#818CF8', text: '#312E81', icon: 'fa-book-open', label: 'Français' },
  'maths': { bg: '#EFF6FF', border: '#60A5FA', text: '#1E40AF', icon: 'fa-calculator', label: 'Mathématiques' },
  'mathematiques': { bg: '#EFF6FF', border: '#60A5FA', text: '#1E40AF', icon: 'fa-calculator', label: 'Mathématiques' },
  'arabe': { bg: '#ECFDF5', border: '#34D399', text: '#065F46', icon: 'fa-feather-alt', label: 'العربية' },
  'anglais': { bg: '#F0F9FF', border: '#38BDF8', text: '#0369A1', icon: 'fa-language', label: 'English' },
  'sciences': { bg: '#F0FDF4', border: '#4ADE80', text: '#14532D', icon: 'fa-atom', label: 'Sciences' },
  'svt': { bg: '#F0FDF4', border: '#4ADE80', text: '#14532D', icon: 'fa-leaf', label: 'SVT' },
  'physique': { bg: '#F5F3FF', border: '#A78BFA', text: '#4C1D95', icon: 'fa-bolt', label: 'Physique-Chimie' },
  'histoire': { bg: '#FFFBEB', border: '#FBBF24', text: '#78350F', icon: 'fa-landmark', label: 'Histoire-Géo' },
  'geographie': { bg: '#FFFBEB', border: '#FBBF24', text: '#78350F', icon: 'fa-globe-americas', label: 'Histoire-Géo' },
  'islamique': { bg: '#ECFDF5', border: '#10B981', text: '#047857', icon: 'fa-mosque', label: 'التربية الإسلامية' },
  'art': { bg: '#FDF2F8', border: '#F472B6', text: '#831843', icon: 'fa-palette', label: 'Arts Plastiques' },
  'musique': { bg: '#FAF5FF', border: '#C084FC', text: '#581C87', icon: 'fa-music', label: 'Éducation Musicale' },
  'sport': { bg: '#F5F3FF', border: '#A78BFA', text: '#4C1D95', icon: 'fa-running', label: 'EPS' },
  'eps': { bg: '#F5F3FF', border: '#A78BFA', text: '#4C1D95', icon: 'fa-running', label: 'EPS' },
  'informatique': { bg: '#F8FAFC', border: '#94A3B8', text: '#0F172A', icon: 'fa-laptop-code', label: 'Informatique' },
  'defaut': { bg: '#F8FAFC', border: '#CBD5E1', text: '#334155', icon: 'fa-graduation-cap', label: 'Cours' }
};

function getSubjectStyle(subjectName) {
  if (!subjectName) return subjectColors.defaut;
  const s = String(subjectName).toLowerCase().trim();
  for (const [key, val] of Object.entries(subjectColors)) {
    if (key !== 'defaut' && s.includes(key)) {
      return val;
    }
  }
  return subjectColors.defaut;
}

// Formatage robuste et haute compatibilité des URLs Google Drive
function formatDriveImageUrl(url) {
  if (!url || typeof url !== 'string') return '';
  const clean = url.trim();
  if (clean.startsWith('data:image/')) return clean;
  
  // Extraction de l'ID du fichier Google Drive
  const driveMatch = clean.match(/\/file\/d\/([a-zA-Z0-9_-]+)/) ||
                     clean.match(/\/d\/([a-zA-Z0-9_-]+)/) || 
                     clean.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (driveMatch && driveMatch[1]) {
    const fileId = driveMatch[1];
    // Renvoyer le point d'accès direct thumbnail Google Drive avec résolution maximale d'origine (w2560)
    return `https://drive.google.com/thumbnail?id=${fileId}&sz=w2560`;
  }
  return clean;
}

// Résolution souple du lien photo de l'enseignant
function findTeacherPhotoUrl(enseignant, photosMap) {
  if (!enseignant || !photosMap || typeof photosMap !== 'object') return '';
  const raw = String(enseignant).trim();
  if (photosMap[raw]) return formatDriveImageUrl(photosMap[raw]);

  // Nettoyage pour correspondance insensible à la casse et préfixes
  const clean = raw.toLowerCase()
    .replace(/^(m\.|mme|mr|prof|professeur|enseignant)\s+/i, '')
    .replace(/[\s\-_.]+/g, '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  for (const [key, val] of Object.entries(photosMap)) {
    if (!val) continue;
    const keyClean = String(key).toLowerCase()
      .replace(/^(m\.|mme|mr|prof|professeur|enseignant)\s+/i, '')
      .replace(/[\s\-_.]+/g, '')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (clean === keyClean || clean.includes(keyClean) || keyClean.includes(clean)) {
      return formatDriveImageUrl(val);
    }
  }
  return '';
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatDateFrench(date) {
  if (!date || isNaN(date.getTime())) return "";
  const days = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];
  const months = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];
  const dayName = days[date.getUTCDay()];
  const dayNum = String(date.getUTCDate()).padStart(2, '0');
  const monthName = months[date.getUTCMonth()];
  const yearNum = date.getUTCFullYear();
  return `${dayName} ${dayNum} ${monthName} ${yearNum}`;
}

function getDateForDayName(weekStartDate, dayName) {
  if (!weekStartDate || isNaN(weekStartDate.getTime())) return null;
  const dayOrder = { "Dimanche": 0, "Lundi": 1, "Mardi": 2, "Mercredi": 3, "Jeudi": 4 };
  const offset = dayOrder[dayName];
  if (offset === undefined) return null;
  const specificDate = new Date(Date.UTC(
    weekStartDate.getUTCFullYear(),
    weekStartDate.getUTCMonth(),
    weekStartDate.getUTCDate()
  ));
  specificDate.setUTCDate(specificDate.getUTCDate() + offset);
  return specificDate;
}

/**
 * Génère le code HTML complet du document stylisé A4
 */
function generateDesignPlanHtml(options = {}) {
  const {
    week = 1,
    classe = 'PEI1',
    data = [],
    notes = '',
    notesPhoto = '',
    section = 'garcons',
    theme = 'indigo',
    showPhotos = true,
    teachersPhotos = {},
    weekStartDate = null,
    weekDateRange = '',
    semester = 1,
    specialDays = [],
    isParent = false
  } = options;

  let resolvedNotes = '';
  if (typeof notes === 'string') {
    resolvedNotes = notes;
  } else if (notes && typeof notes === 'object') {
    resolvedNotes = notes[classe] || notes[classe.toUpperCase()] || notes[classe.toLowerCase()] || notes.general || '';
  }

  let resolvedNotesPhoto = '';
  if (typeof notesPhoto === 'string') {
    resolvedNotesPhoto = notesPhoto.trim();
  } else if (notesPhoto && typeof notesPhoto === 'object') {
    resolvedNotesPhoto = notesPhoto[classe] || notesPhoto[classe.toUpperCase()] || notesPhoto[classe.toLowerCase()] || '';
  }

  const dayOrder = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi"];
  const arabicDays = {
    "Dimanche": "الأحد",
    "Lundi": "الإثنين",
    "Mardi": "الثلاثاء",
    "Mercredi": "الأربعاء",
    "Jeudi": "الخميس"
  };

  const groupedByDay = {};
  data.forEach(item => {
    let rawDay = item['Jour'] || item.jour || item['jour'] || '';
    if (!rawDay) return;
    for (const d of dayOrder) {
      if (rawDay.toLowerCase().includes(d.toLowerCase())) {
        if (!groupedByDay[d]) groupedByDay[d] = [];
        groupedByDay[d].push(item);
        break;
      }
    }
  });

  const daysToRender = dayOrder.filter(dayName => groupedByDay[dayName] && groupedByDay[dayName].length > 0);
  if (daysToRender.length === 0) {
    dayOrder.forEach(d => {
      if (groupedByDay[d]) daysToRender.push(d);
    });
  }
  if (daysToRender.length === 0) {
    daysToRender.push("Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi");
  }

  const totalPages = daysToRender.length + 1; // +1 pour la page de récapitulatif des devoirs/cartable

  let weekStartObj = null;
  if (weekStartDate) {
    weekStartObj = new Date(weekStartDate);
  }

  let plageSemaineDisplay = weekDateRange;
  if (!plageSemaineDisplay && weekStartObj) {
    const endObj = new Date(weekStartObj);
    endObj.setUTCDate(endObj.getUTCDate() + 4);
    plageSemaineDisplay = `du ${formatDateFrench(weekStartObj)} à ${formatDateFrench(endObj)}`;
  } else if (!plageSemaineDisplay) {
    plageSemaineDisplay = `Semaine ${week}`;
  }

  return `<!DOCTYPE html>
<html lang="fr" data-theme="${escapeHtml(theme)}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Plan Hebdomadaire S${week} - ${escapeHtml(classe)}</title>
  
  <!-- Polices Google Fonts Professionnelles -->
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@700&family=Outfit:wght@400;500;600;700;800;900&family=Cairo:wght@600;700;800;900&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  
  <!-- FontAwesome Icons -->
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">

  <style>
    :root {
      --primary-color: #0F2E5C;
      --primary-light: #F0F4FA;
      --primary-dark: #091D3A;
      --accent-color: #0284C7;
      --accent-light: #E0F2FE;
      --border-dark: #334155;
      --border-light: #CBD5E1;
      --text-main: #0F172A;
      --text-muted: #475569;
      --day-header-bg: #0F2E5C;
      --day-header-text: #FFFFFF;
      --homework-bg: #FEF2F2;
      --homework-border: #FCA5A5;
      --homework-text: #991B1B;
      --lesson-topic-color: #0369A1;
    }

    [data-theme="emerald"] {
      --primary-color: #064E3B;
      --primary-light: #ECFDF5;
      --primary-dark: #022C22;
      --accent-color: #059669;
      --accent-light: #D1FAE5;
      --day-header-bg: #064E3B;
      --lesson-topic-color: #047857;
    }

    [data-theme="navy"] {
      --primary-color: #1E293B;
      --primary-light: #F8FAFC;
      --primary-dark: #0F172A;
      --accent-color: #475569;
      --accent-light: #E2E8F0;
      --day-header-bg: #1E293B;
      --lesson-topic-color: #334155;
    }

    [data-theme="burgundy"] {
      --primary-color: #831843;
      --primary-light: #FDF2F8;
      --primary-dark: #500724;
      --accent-color: #BE185D;
      --accent-light: #FCE7F3;
      --day-header-bg: #831843;
      --lesson-topic-color: #9D174D;
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      font-family: 'Plus Jakarta Sans', 'Outfit', 'Segoe UI', sans-serif;
      background-color: #E2E8F0;
      color: var(--text-main);
      -webkit-font-smoothing: antialiased;
      line-height: 1.35;
    }

    /* BARRE D'ACTIONS ÉCRAN (NON IMPRIMABLE) */
    .screen-toolbar {
      position: sticky;
      top: 0;
      z-index: 1000;
      background: #0F172A;
      color: #FFFFFF;
      padding: 10px 20px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      box-shadow: 0 4px 12px rgba(0,0,0,0.25);
      border-bottom: 2px solid #38BDF8;
    }

    .toolbar-info {
      display: flex;
      align-items: center;
      gap: 12px;
      font-weight: 700;
      font-size: 0.92rem;
    }

    .toolbar-controls {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .btn-action {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 7px 14px;
      border-radius: 6px;
      font-weight: 700;
      font-size: 0.82rem;
      cursor: pointer;
      border: none;
      transition: all 0.2s ease;
      text-decoration: none;
    }

    .btn-print {
      background: #10B981;
      color: white;
    }
    .btn-print:hover {
      background: #059669;
    }

    .btn-download-html {
      background: #2563EB;
      color: white;
    }
    .btn-download-html:hover {
      background: #1D4ED8;
    }

    .theme-selector {
      display: inline-flex;
      background: rgba(255,255,255,0.12);
      padding: 3px;
      border-radius: 8px;
      gap: 4px;
    }

    .theme-opt-btn {
      background: transparent;
      border: none;
      color: white;
      font-size: 0.76rem;
      font-weight: 600;
      padding: 4px 8px;
      border-radius: 5px;
      cursor: pointer;
    }

    .theme-opt-btn.active {
      background: white;
      color: #0F172A;
    }

    /* CONTENEUR GLOBAL DES FEUILLES A4 */
    .all-pages-wrapper {
      padding: 24px 0;
    }

    /* ========================================================================
       FEUILLE A4 STRICTE (210mm x 297mm) AVEC MARGE 1.0 CM PARTOUT (STYLE WORD)
       ======================================================================== */
    .a4-page {
      width: 210mm;
      min-height: 297mm;
      margin: 0 auto 30px auto;
      padding: 10mm; /* Marge exacte de 1.0 cm sur les 4 côtés */
      background: #FFFFFF;
      box-shadow: 0 4px 20px rgba(0,0,0,0.14);
      box-sizing: border-box;
      position: relative;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      overflow: visible;
      page-break-after: always;
      break-after: page;
      page-break-inside: avoid !important;
      break-inside: avoid !important;
    }

    .a4-page:last-child {
      margin-bottom: 20px;
    }

    /* ------------------------------------------------------------------------
       1. EN-TÊTE OFFICIEL WORD AL KAWTHAR (LOGO + TITRE BILINGUE + MÉTADONNÉES)
       ------------------------------------------------------------------------ */
    .word-header-container {
      margin-bottom: 5px;
      border-bottom: 2px solid var(--primary-color);
      padding-bottom: 5px;
      flex-shrink: 0;
    }

    .header-main-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }

    /* GAUCHE : LOGO OFFICIEL AL KAWTHAR */
    .header-logo-col {
      flex-shrink: 0;
      width: 58px;
      height: 58px;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .header-school-logo {
      width: 56px;
      height: 56px;
      object-fit: contain;
      display: block;
      filter: drop-shadow(0 1px 2px rgba(0,0,0,0.15));
    }

    /* CENTRE : TITRE OFFICIEL ET PLAGE DE DATES */
    .header-titles-col {
      flex: 1;
      text-align: center;
    }

    .word-main-title {
      font-family: 'Outfit', sans-serif;
      font-size: 1.18rem;
      font-weight: 900;
      color: var(--primary-color);
      letter-spacing: 0.04em;
      text-transform: uppercase;
      line-height: 1.15;
    }

    .word-sub-title-ar {
      font-family: 'Cairo', sans-serif;
      font-size: 0.78rem;
      font-weight: 700;
      color: #0369A1;
      direction: rtl;
      line-height: 1.2;
      margin-top: 1px;
    }

    .header-week-range-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: #F0F9FF;
      border: 1px solid #38BDF8;
      color: #0369A1;
      font-family: 'Outfit', 'Cairo', sans-serif;
      font-size: 0.80rem;
      font-weight: 800;
      padding: 1px 12px;
      border-radius: 12px;
      margin-top: 3px;
    }

    /* DROITE : MÉTADONNÉES CLASSE / SEMAINE */
    .header-meta-col {
      flex-shrink: 0;
      text-align: right;
      min-width: 140px;
    }

    .meta-tag-row {
      font-size: 0.78rem;
      line-height: 1.25;
      display: flex;
      justify-content: flex-end;
      align-items: center;
      gap: 4px;
    }

    .meta-tag-label {
      font-weight: 800;
      color: #1E293B;
      text-transform: uppercase;
      font-size: 0.74rem;
    }

    .meta-tag-val {
      font-weight: 800;
      color: var(--primary-color);
    }

    .meta-class-highlight {
      font-size: 0.95rem;
      color: #2563EB;
      background: #EFF6FF;
      padding: 1px 6px;
      border-radius: 4px;
      border: 1px solid #BFDBFE;
    }

    .meta-tag-sep {
      color: #94A3B8;
      margin: 0 2px;
    }

    .meta-doc-type {
      font-size: 0.70rem;
      font-weight: 800;
      color: #64748B;
      letter-spacing: 0.03em;
      text-transform: uppercase;
      margin-top: 2px;
    }

    /* ------------------------------------------------------------------------
       2. TABLEAU DES NOTES (COMPACTÉ POUR TENIR SUR LA PAGE 1 SANS DÉBORDER)
       ------------------------------------------------------------------------ */
    .word-notes-block {
      margin-bottom: 5px;
      flex-shrink: 0;
      page-break-inside: avoid !important;
      break-inside: avoid !important;
    }

    .notes-styled-container {
      border: 1.5px solid #F59E0B;
      background: #FFFDF5;
      border-radius: 5px;
      overflow: hidden;
    }

    .notes-header-bar {
      background: linear-gradient(135deg, #D97706 0%, #B45309 100%);
      color: #FFFFFF;
      padding: 2.5px 8px;
      font-size: 0.76rem;
      font-weight: 800;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .notes-header-fr {
      display: flex;
      align-items: center;
      gap: 5px;
    }

    .notes-header-ar {
      font-family: 'Cairo', sans-serif;
      direction: rtl;
    }

    .notes-body-content {
      padding: 6px 10px;
      font-size: 0.78rem;
      font-weight: 600;
      color: #1E293B;
      line-height: 1.35;
      overflow: visible;
      white-space: pre-wrap;
      word-break: break-word;
    }

    .teacher-notes-text {
      white-space: pre-wrap;
      word-break: break-word;
      line-height: 1.35;
    }

    .empty-notes-text {
      color: #64748B;
      font-style: italic;
      font-size: 0.74rem;
    }

    .notes-attached-photo-container {
      margin-top: 8px;
      text-align: center;
      width: 100%;
      overflow: hidden;
      page-break-inside: avoid !important;
      break-inside: avoid !important;
    }

    .notes-attached-photo-img {
      max-height: 280px;
      width: 100%;
      max-width: 100%;
      height: auto;
      object-fit: cover;
      border-radius: 6px;
      border: 1px solid #FCD34D;
      background: #FFFFFF;
      padding: 0;
      box-shadow: 0 2px 8px rgba(0,0,0,0.08);
      display: block;
    }

    /* ------------------------------------------------------------------------
       3. BANDEAU DU JOUR EN COURS (STYLE WORD CONTRASTÉ)
       ------------------------------------------------------------------------ */
    .day-banner-strip {
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: var(--day-header-bg);
      color: var(--day-header-text);
      padding: 3px 10px;
      border-radius: 4px;
      margin-bottom: 5px;
      flex-shrink: 0;
    }

    .day-title-french {
      font-family: 'Outfit', sans-serif;
      font-weight: 800;
      font-size: 0.88rem;
      letter-spacing: 0.02em;
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .day-title-arabic {
      font-family: 'Cairo', sans-serif;
      font-weight: 800;
      font-size: 0.95rem;
      direction: rtl;
    }

    /* ------------------------------------------------------------------------
       4. TABLEAU DU JOUR À 3 COLONNES (CALIBRÉ POUR 8 COURS STRICTS SUR A4)
       ------------------------------------------------------------------------ */
    .main-table-wrapper {
      flex: 1;
      display: flex;
      flex-direction: column;
      min-height: 0;
    }

    .lessons-table-a4 {
      width: 100%;
      border-collapse: collapse;
      border: 1.5px solid var(--border-dark);
      font-size: 0.77rem;
      table-layout: fixed;
    }

    .lessons-table-a4 thead th {
      background: #1E293B;
      color: #FFFFFF;
      font-weight: 800;
      font-size: 0.76rem;
      padding: 3.5px 6px;
      border: 1px solid var(--border-dark);
      text-transform: uppercase;
      letter-spacing: 0.03em;
      text-align: center;
    }

    .th-matieres { width: 26%; }
    .th-classwork { width: 46%; }
    .th-homework { width: 28%; }

    .lessons-table-a4 tbody tr {
      border-bottom: 1px solid #CBD5E1;
    }

    .lessons-table-a4 tbody tr:last-child {
      border-bottom: none;
    }

    .lessons-table-a4 tbody tr:nth-child(even) {
      background-color: #F8FAFC;
    }

    .lessons-table-a4 tbody td {
      padding: 3px 6px;
      vertical-align: top;
      border-right: 1px solid #CBD5E1;
    }

    .lessons-table-a4 tbody td:last-child {
      border-right: none;
    }

    /* COLONNE 1 : MATIÈRE & ENSEIGNANT AVEC PHOTO DRIVE */
    .col-matieres-td {
      background: #FFFFFF;
      border-right: 1.5px solid var(--border-dark) !important;
    }

    .subject-header-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 2px;
    }

    .subject-name-tag {
      font-weight: 800;
      font-size: 0.78rem;
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 1px 5px;
      border-radius: 4px;
      border: 1px solid transparent;
      white-space: nowrap;
      line-height: 1.15;
    }

    .period-badge-pill {
      font-size: 0.68rem;
      font-weight: 800;
      background: #0F172A;
      color: white;
      padding: 1px 5px;
      border-radius: 3px;
      white-space: nowrap;
    }

    .teacher-item-box {
      display: flex;
      align-items: center;
      gap: 6px;
      margin-top: 2px;
      padding-top: 2px;
      border-top: 1px dashed #E2E8F0;
    }

    .teacher-photo-thumb {
      width: 26px;
      height: 26px;
      border-radius: 50%;
      object-fit: cover;
      border: 1.5px solid var(--accent-color);
      flex-shrink: 0;
      background: #E2E8F0;
      display: block;
    }

    .teacher-fallback-thumb {
      width: 26px;
      height: 26px;
      border-radius: 50%;
      background: var(--accent-light);
      color: var(--primary-color);
      border: 1.5px solid var(--accent-color);
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 0.72rem;
      font-weight: 800;
      flex-shrink: 0;
    }

    .teacher-name-print {
      font-weight: 700;
      font-size: 0.76rem;
      color: #1E293B;
      line-height: 1.15;
      word-break: break-word;
    }

    /* COLONNE 2 : TRAVAIL DE CLASSE & SUPPORT DÉPLACÉ DEDANS */
    .col-classwork-td {
      border-right: 1.5px solid var(--border-dark) !important;
    }

    .lesson-title-strong {
      font-weight: 800;
      font-size: 0.80rem;
      color: var(--lesson-topic-color);
      margin-bottom: 2px;
      line-height: 1.2;
      display: block;
    }

    .classwork-detail-txt {
      font-size: 0.76rem;
      color: #1E293B;
      line-height: 1.25;
      white-space: pre-wrap;
    }

    .classwork-support-chip {
      margin-top: 3px;
      padding: 2px 6px;
      background: #F1F5F9;
      border-left: 3px solid var(--accent-color);
      border-radius: 3px;
      font-size: 0.70rem;
      color: #334155;
      display: inline-flex;
      align-items: center;
      gap: 4px;
      max-width: 100%;
    }

    .classwork-support-chip i {
      color: var(--accent-color);
      font-size: 0.68rem;
    }

    .support-chip-label {
      font-weight: 800;
      color: #0F172A;
      text-transform: uppercase;
      font-size: 0.68rem;
    }

    .support-chip-val {
      font-weight: 700;
      color: #2563EB;
      word-break: break-word;
    }

    /* COLONNE 3 : DEVOIRS */
    .col-homework-td {
      background: #FFFFFF;
    }

    .homework-item-card {
      background: var(--homework-bg);
      border: 1px solid var(--homework-border);
      border-radius: 4px;
      padding: 3px 6px;
      color: var(--homework-text);
      font-weight: 600;
      font-size: 0.75rem;
      line-height: 1.25;
    }

    .homework-tag-label {
      font-size: 0.66rem;
      font-weight: 800;
      text-transform: uppercase;
      display: flex;
      align-items: center;
      gap: 4px;
      margin-bottom: 1px;
      color: var(--homework-text);
    }

    .no-homework-txt {
      color: #94A3B8;
      font-size: 0.74rem;
      font-style: italic;
    }

    /* ------------------------------------------------------------------------
       5. PIED DE PAGE STRICTEMENT SCELLÉ EN BAS DE CHAQUE PAGE A4
       ------------------------------------------------------------------------ */
    .a4-page-footer {
      margin-top: auto;
      padding-top: 4px;
      border-top: 1.5px solid #CBD5E1;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 0.72rem;
      color: #64748B;
      flex-shrink: 0;
      page-break-inside: avoid !important;
      break-inside: avoid !important;
    }

    .footer-stamp-box {
      font-weight: 700;
      color: #334155;
    }

    .page-number-box {
      font-weight: 800;
      color: var(--primary-color);
      background: var(--accent-light);
      border: 1px solid var(--border-light);
      padding: 1px 8px;
      border-radius: 4px;
      font-size: 0.72rem;
    }

    /* ------------------------------------------------------------------------
       6. TABLEAU RÉCAPITULATIF CARTABLE & LIVRES (PAGE FINALE)
       ------------------------------------------------------------------------ */
    .backpack-tip-box {
      background: #EFF6FF;
      border: 1.5px solid #93C5FD;
      border-left: 5px solid #2563EB;
      border-radius: 6px;
      padding: 6px 10px;
      margin-bottom: 8px;
      display: flex;
      align-items: center;
      gap: 10px;
      flex-shrink: 0;
    }

    .backpack-tip-icon {
      font-size: 1.4rem;
      color: #2563EB;
      flex-shrink: 0;
    }

    .backpack-tip-title {
      font-family: 'Outfit', sans-serif;
      font-size: 0.85rem;
      font-weight: 800;
      color: #1E3A8A;
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 6px;
      margin-bottom: 2px;
    }

    .ar-tip-title {
      font-family: 'Cairo', sans-serif;
      direction: rtl;
      font-size: 0.86rem;
    }

    .backpack-tip-desc {
      font-size: 0.74rem;
      color: #334155;
      line-height: 1.3;
    }

    .backpack-recap-table {
      width: 100%;
      border-collapse: collapse;
      border: 1.5px solid #1E293B;
      font-size: 0.76rem;
      table-layout: fixed;
    }

    .backpack-recap-table th {
      background: #1E3A8A;
      color: #FFFFFF;
      padding: 4px 6px;
      font-weight: 800;
      font-size: 0.74rem;
      border: 1px solid #1E293B;
      text-align: left;
    }

    .backpack-recap-table td {
      border: 1px solid #CBD5E1;
      padding: 4px 6px;
      vertical-align: middle;
    }

    .backpack-day-cell {
      background: #F8FAFC;
      font-weight: 800;
      color: #0F172A;
      text-align: center;
    }

    .day-cell-badge {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 2px;
    }

    .day-cell-ar {
      font-family: 'Cairo', sans-serif;
      font-size: 0.72rem;
      color: #2563EB;
    }

    .backpack-homework-desc {
      font-weight: 600;
      color: #991B1B;
      line-height: 1.25;
    }

    .backpack-book-card {
      display: flex;
      align-items: center;
      gap: 5px;
      font-weight: 700;
      color: #1E293B;
    }

    .check-box-square {
      width: 16px;
      height: 16px;
      border: 1.5px solid #0284C7;
      border-radius: 3px;
      margin: 0 auto;
      background: #FFFFFF;
    }

    /* JOURNÉE SPÉCIALE / FUSIONNÉE */
    .merged-day-special-cell {
      background: #FFFBEB;
      border: 2px solid #F59E0B !important;
      padding: 8px 8px 10px 8px !important;
    }

    .merged-special-container {
      text-align: center;
      width: 100%;
    }

    .merged-badge-header {
      margin-bottom: 6px;
    }

    .merged-type-pill {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: #FEF3C7;
      color: #92400E;
      border: 1px solid #FCD34D;
      font-size: 0.78rem;
      font-weight: 800;
      padding: 2px 10px;
      border-radius: 12px;
      text-transform: uppercase;
    }

    .merged-day-title {
      font-family: 'Outfit', sans-serif;
      font-size: 1.15rem;
      font-weight: 900;
      color: #78350F;
      margin-top: 4px;
    }

    .merged-day-desc {
      font-size: 0.84rem;
      color: #451A03;
      margin: 4px auto 8px auto;
      max-width: 95%;
      line-height: 1.35;
    }

    .merged-photos-gallery {
      display: flex;
      flex-direction: column;
      align-items: center;
      width: 100%;
      margin-top: 6px;
      gap: 10px;
    }

    .merged-photo-card {
      background: transparent;
      padding: 0;
      border-radius: 8px;
      border: none;
      box-shadow: none;
      width: 100%;
      max-width: 100%;
      display: block;
      overflow: hidden;
    }

    .merged-photo-img {
      width: 100%;
      max-width: 100%;
      height: auto;
      max-height: 380px;
      object-fit: cover;
      border-radius: 8px;
      display: block;
      margin: 0 auto;
      box-shadow: 0 2px 8px rgba(0,0,0,0.08);
      border: 1px solid #FCD34D;
    }

    /* ========================================================================
       RÈGLES D'IMPRESSION STRICTES (@media print) - FORMAT WORD A4 NORMAL
       Marge physique 10mm (1.0 cm) partout, pied de page toujours en bas
       ======================================================================== */
    @media print {
      @page {
        size: A4 portrait;
        margin: 10mm 10mm 10mm 10mm; /* Marge exacte de 1.0 cm partout */
      }

      html, body {
        background: #FFFFFF !important;
        margin: 0 !important;
        padding: 0 !important;
        width: 100% !important;
        height: auto !important;
        color: #000000 !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }

      .no-print, .screen-toolbar {
        display: none !important;
      }

      .all-pages-wrapper {
        padding: 0 !important;
        margin: 0 !important;
      }

      /* Chaque section .a4-page fait exactement la hauteur utile d'une page A4 (277mm) */
      .a4-page {
        width: 100% !important;
        min-height: 277mm !important;
        height: auto !important;
        max-height: none !important;
        margin: 0 !important;
        padding: 0 !important; /* Le 10mm est déjà appliqué par @page { margin: 10mm } */
        box-shadow: none !important;
        border: none !important;
        page-break-after: always !important;
        break-after: page !important;
        page-break-inside: avoid !important;
        break-inside: avoid !important;
        display: flex !important;
        flex-direction: column !important;
        justify-content: space-between !important;
        overflow: visible !important;
        box-sizing: border-box !important;
      }

      .a4-page:last-child {
        page-break-after: auto !important;
        break-after: auto !important;
      }

      .lessons-table-a4,
      .backpack-recap-table {
        width: 100% !important;
        table-layout: fixed !important;
        page-break-inside: avoid !important;
        break-inside: avoid !important;
      }

      .lessons-table-a4 thead,
      .backpack-recap-table thead {
        display: table-header-group !important;
      }

      .lessons-table-a4 tr,
      .backpack-recap-table tr {
        page-break-inside: avoid !important;
        break-inside: avoid !important;
      }

      .word-header-container,
      .day-banner-strip,
      .word-notes-block,
      .backpack-tip-box,
      .a4-page-footer {
        page-break-inside: avoid !important;
        break-inside: avoid !important;
      }

      .a4-page-footer {
        margin-top: auto !important;
        padding-top: 4px !important;
        border-top: 1.5px solid #94A3B8 !important;
      }

      .merged-photos-gallery {
        width: 100% !important;
      }
      .merged-photo-card {
        width: 100% !important;
        max-width: 100% !important;
        background: transparent !important;
        border: none !important;
        box-shadow: none !important;
        padding: 0 !important;
      }
      .merged-photo-img {
        width: 100% !important;
        max-width: 100% !important;
        height: auto !important;
        max-height: 380px !important;
        object-fit: cover !important;
        display: block !important;
        border-radius: 6px !important;
      }
      .notes-attached-photo-container {
        width: 100% !important;
        max-height: none !important;
      }
      .notes-attached-photo-img {
        width: 100% !important;
        max-width: 100% !important;
        height: auto !important;
        max-height: 280px !important;
        object-fit: cover !important;
        display: block !important;
        border-radius: 6px !important;
      }

      * {
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
    }
  </style>
</head>
<body>

  <!-- BARRE D'ACTIONS NON IMPRIMABLE -->
  <div class="screen-toolbar no-print">
    <div class="toolbar-info">
      <i class="fas fa-file-pdf" style="color:#38BDF8; font-size:1.15rem;"></i>
      <span>Plan Hebdomadaire • Semaine ${week} • Classe : ${escapeHtml(classe)}</span>
    </div>
    <div class="toolbar-controls">
      ${!isParent ? `
      <!-- Sélecteur de Thème Visuel -->
      <div class="theme-selector">
        <button type="button" class="theme-opt-btn ${theme === 'indigo' ? 'active' : ''}" onclick="setTheme('indigo')">Indigo</button>
        <button type="button" class="theme-opt-btn ${theme === 'emerald' ? 'active' : ''}" onclick="setTheme('emerald')">Émeraude</button>
        <button type="button" class="theme-opt-btn ${theme === 'navy' ? 'active' : ''}" onclick="setTheme('navy')">Marine</button>
        <button type="button" class="theme-opt-btn ${theme === 'burgundy' ? 'active' : ''}" onclick="setTheme('burgundy')">Bordeaux</button>
      </div>

      <!-- Bouton Télécharger HTML -->
      <button type="button" class="btn-action btn-download-html" onclick="downloadSelfHtml()">
        <i class="fas fa-download"></i> <span>Enregistrer HTML</span>
      </button>
      ` : ''}

      <!-- Bouton d'impression / Enregistrer en PDF -->
      <button type="button" class="btn-action btn-print" onclick="window.print()">
        <i class="fas fa-print"></i> <span>${isParent ? 'Imprimer le Plan' : 'Imprimer / Sauvegarder en PDF'}</span>
      </button>
    </div>
  </div>

  <div class="all-pages-wrapper">
    ${daysToRender.map((dayName, index) => {
      const rows = groupedByDay[dayName] || [];
      const pageNum = index + 1;
      const isFirstPage = (index === 0);

      // Calculer la date complète du jour (ex: Lundi 21 Septembre 2026)
      let formattedDayDate = dayName;
      if (weekStartObj) {
        const dayDateObj = getDateForDayName(weekStartObj, dayName);
        if (dayDateObj) {
          formattedDayDate = formatDateFrench(dayDateObj);
        }
      }

      // Vérifier si cette journée fait l'objet d'une fusion (Pas de cours, Vacances, Sortie, Événement)
      const normDay = dayName.trim().toLowerCase();
      const normClass = String(classe || '').trim().toLowerCase();
      const matchedSpecialDay = (Array.isArray(specialDays) ? specialDays : []).find(sd => {
        if (!sd) return false;
        const sdDay = String(sd.day || '').trim().toLowerCase();
        const sdClass = String(sd.classe || 'all').trim().toLowerCase();
        const matchesDay = sdDay.includes(normDay) || normDay.includes(sdDay);
        const matchesClass = sdClass === 'all' || sdClass === 'toutes' || sdClass.includes('toutes') || sdClass === normClass || normClass.includes(sdClass) || sdClass.includes(normClass);
        return matchesDay && matchesClass;
      });

      let specialPhotos = [];
      if (matchedSpecialDay) {
        if (Array.isArray(matchedSpecialDay.photos) && matchedSpecialDay.photos.length > 0) {
          specialPhotos = matchedSpecialDay.photos.filter(p => p && (typeof p === 'string' ? p.trim() : (p.url || p.src || p.data)));
        }
        if (matchedSpecialDay.photoUrl) specialPhotos.push({ url: matchedSpecialDay.photoUrl });
        if (matchedSpecialDay.photo) specialPhotos.push({ url: matchedSpecialDay.photo });
        if (matchedSpecialDay.imageUrl) specialPhotos.push({ url: matchedSpecialDay.imageUrl });
        if (matchedSpecialDay.image) specialPhotos.push({ url: matchedSpecialDay.image });

        // Si aucune photo n'a été rattachée à la Fête Nationale, injecter l'affiche officielle
        if (specialPhotos.length === 0 && /f[eê]te\s*nationale/i.test(matchedSpecialDay.title || '')) {
          specialPhotos.push({
            url: 'https://drive.google.com/thumbnail?id=1tLpelITZSuch6gckvasulKDnm__aeF78&sz=w1200',
            caption: 'Célébration Fête Nationale'
          });
        }
      }

      return `
      <section class="a4-page" id="page_day_${dayName.toLowerCase()}">
        
        <!-- EN-TÊTE OFFICIEL WORD AL KAWTHAR AVEC LOGO OFFICIEL SUR CHAQUE PAGE -->
        <header class="word-header-container">
          <div class="header-main-row">
            <!-- GAUCHE : LOGO OFFICIEL DE L'ÉCOLE -->
            <div class="header-logo-col">
              <img src="${logoAlKawtharUri}" alt="Logo Les Écoles Internationales Al Kawthar" class="header-school-logo" />
            </div>

            <!-- CENTRE : TITRES OFFICIELS & DATE -->
            <div class="header-titles-col">
              <div class="word-main-title">LES ÉCOLES INTERNATIONALES AL KAWTHAR</div>
              <div class="word-sub-title-ar">مدارس الكوثر العالمية • AL KAWTHAR INTERNATIONAL SCHOOLS</div>
              <div class="header-week-range-badge">
                <i class="fas fa-calendar-alt"></i> <span>${escapeHtml(plageSemaineDisplay)}</span>
              </div>
            </div>

            <!-- DROITE : MÉTADONNÉES CLASSE / SEMAINE -->
            <div class="header-meta-col">
              <div class="meta-tag-row">
                <span class="meta-tag-label">CLASSE :</span>
                <span class="meta-tag-val meta-class-highlight">${escapeHtml(classe)}</span>
              </div>
              <div class="meta-tag-row">
                <span class="meta-tag-label">SEMAINE :</span>
                <span class="meta-tag-val">${week}</span>
                <span class="meta-tag-sep">|</span>
                <span class="meta-tag-label">SEMESTRE :</span>
                <span class="meta-tag-val">${escapeHtml(String(semester || 1))}</span>
              </div>
              <div class="meta-doc-type">PLAN HEBDOMADAIRE</div>
            </div>
          </div>
        </header>

        <!-- TABLEAU DES NOTES (SUR LA PREMIÈRE PAGE, COMPACTÉ POUR TENIR DANS LES 277MM) -->
        ${isFirstPage ? `
          <div class="word-notes-block">
            <div class="notes-styled-container">
              <div class="notes-header-bar">
                <div class="notes-header-fr"><i class="fas fa-clipboard-list"></i> Remarques &amp; Notes de la semaine (saisi par les enseignants)</div>
                <div class="notes-header-ar">ملاحظات الأسبوع (مسجلة من قبل المعلمين)</div>
              </div>
              <div class="notes-body-content">
                ${(resolvedNotes && resolvedNotes.trim() !== '') 
                  ? `<div class="teacher-notes-text">${escapeHtml(resolvedNotes)}</div>`
                  : `<div class="empty-notes-text"><i class="fas fa-info-circle"></i> Aucune consigne particulière pour cette semaine.</div>`}
                ${resolvedNotesPhoto ? `
                  <div class="notes-attached-photo-container">
                    <img src="${formatDriveImageUrl(resolvedNotesPhoto)}" alt="Photo Remarques" class="notes-attached-photo-img" referrerpolicy="no-referrer" onerror="if(!this.dataset.retry){this.dataset.retry=1;const id=this.src.match(/\/d\/([a-zA-Z0-9_-]+)/)?.[1]||this.src.match(/[?&]id=([a-zA-Z0-9_-]+)/)?.[1];if(id){this.src='https://drive.google.com/thumbnail?id='+id+'&sz=w800';}}" />
                  </div>
                ` : ''}
              </div>
            </div>
          </div>
        ` : ''}

        <!-- BANDEAU DU JOUR EN COURS (EX: Dimanche 20 Septembre 2026) -->
        <div class="day-banner-strip">
          <div class="day-title-french">
            <i class="fas fa-calendar-day"></i>
            <span>${escapeHtml(formattedDayDate)}</span>
          </div>
          <div class="day-title-arabic">
            <span>${arabicDays[dayName] || dayName}</span>
          </div>
        </div>

        <!-- TABLEAU DU JOUR À 3 COLONNES : MATIÈRES | TRAVAIL DE CLASSE | DEVOIRS -->
        <div class="main-table-wrapper">
          <table class="lessons-table-a4">
            <thead>
              <tr>
                <th class="th-matieres">MATIÈRES</th>
                <th class="th-classwork">TRAVAIL DE CLASSE</th>
                <th class="th-homework">DEVOIRS</th>
              </tr>
            </thead>
            <tbody>
              ${matchedSpecialDay ? `
                <tr>
                  <td colspan="3" class="merged-day-special-cell">
                    <div class="merged-special-container">
                      <div class="merged-badge-header">
                        <span class="merged-type-pill">
                          <i class="fas fa-info-circle"></i> <span>${escapeHtml(matchedSpecialDay.type === 'holiday' ? 'Vacances / Jour Férié' : (matchedSpecialDay.type === 'activity' ? 'Activité / Sortie' : (matchedSpecialDay.type === 'event' ? 'Célébration' : 'Journée Sans Cours')))}</span>
                        </span>
                        <div class="merged-day-title">${escapeHtml(matchedSpecialDay.title || 'Journée Spéciale')}</div>
                      </div>
                      ${(matchedSpecialDay.description || matchedSpecialDay.message) ? `
                        <div class="merged-day-desc">${escapeHtml(matchedSpecialDay.description || matchedSpecialDay.message)}</div>
                      ` : ''}
                      ${specialPhotos.length > 0 ? `
                        <div class="merged-photos-gallery">
                          ${specialPhotos.map(p => {
                            const rawUrl = typeof p === 'string' ? p : (p.url || p.src || p.data || '');
                            const pUrl = formatDriveImageUrl(rawUrl);
                            const driveId = (rawUrl && typeof rawUrl === 'string') ? (rawUrl.match(/\/file\/d\/([a-zA-Z0-9_-]+)/)?.[1] || rawUrl.match(/\/d\/([a-zA-Z0-9_-]+)/)?.[1] || rawUrl.match(/[?&]id=([a-zA-Z0-9_-]+)/)?.[1] || '') : '';
                            const pCap = typeof p === 'object' ? (p.caption || p.name || '') : '';
                            return `
                              <div class="merged-photo-card">
                                <img src="${pUrl}" alt="Affiche" class="merged-photo-img" referrerpolicy="no-referrer"
                                  data-file-id="${driveId || ''}"
                                  onerror="if(!this.dataset.retry && this.dataset.fileId){this.dataset.retry='1';this.src='https://lh3.googleusercontent.com/d/'+this.dataset.fileId+'=w2560';}else if(this.dataset.retry==='1' && this.dataset.fileId){this.dataset.retry='2';this.src='https://drive.google.com/uc?export=view&id='+this.dataset.fileId;}" />
                              </div>
                            `;
                          }).join('')}
                        </div>
                      ` : ''}
                    </div>
                  </td>
                </tr>
              ` : (rows.length === 0 ? `
                <tr>
                  <td colspan="3" style="text-align:center; padding: 25px; color:#64748B; font-style:italic;">
                    <i class="fas fa-calendar-times" style="font-size:1.3rem; margin-bottom:6px; display:block; color:#94A3B8;"></i>
                    Aucun cours programmé pour ce jour.
                  </td>
                </tr>
              ` : rows.map(row => {
                const rowPhotos = Array.isArray(row.photos) ? row.photos : (Array.isArray(row.images) ? row.images : []);
                if ((row.isMerged || row.merged) && rowPhotos.length > 0) {
                  return `
                  <tr>
                    <td colspan="3" class="merged-day-special-cell">
                      <div class="merged-special-container">
                        <div class="merged-day-title">${escapeHtml(row['Leçon'] || row.lecon || row['Matière'] || 'Séance Spéciale')}</div>
                        ${(row['Travaux de classe'] || row.travaux) ? `<div class="merged-day-desc">${escapeHtml(row['Travaux de classe'] || row.travaux)}</div>` : ''}
                        <div class="merged-photos-gallery">
                          ${rowPhotos.map(p => {
                            const rawUrl = typeof p === 'string' ? p : (p.url || p.src || '');
                            const pUrl = formatDriveImageUrl(rawUrl);
                            const driveId = (rawUrl && typeof rawUrl === 'string') ? (rawUrl.match(/\/file\/d\/([a-zA-Z0-9_-]+)/)?.[1] || rawUrl.match(/\/d\/([a-zA-Z0-9_-]+)/)?.[1] || rawUrl.match(/[?&]id=([a-zA-Z0-9_-]+)/)?.[1] || '') : '';
                            return `
                              <div class="merged-photo-card">
                                <img src="${pUrl}" alt="Affiche" class="merged-photo-img" referrerpolicy="no-referrer"
                                  data-file-id="${driveId || ''}"
                                  onerror="if(!this.dataset.retry && this.dataset.fileId){this.dataset.retry='1';this.src='https://lh3.googleusercontent.com/d/'+this.dataset.fileId+'=w2560';}else if(this.dataset.retry==='1' && this.dataset.fileId){this.dataset.retry='2';this.src='https://drive.google.com/uc?export=view&id='+this.dataset.fileId;}" />
                              </div>
                            `;
                          }).join('')}
                        </div>
                      </div>
                    </td>
                  </tr>
                  `;
                }

                const periodeVal = row['Période'] || row['periode'] || row['Période (Heure)'] || '1';
                const matiere = row['Matière'] || row['matiere'] || 'Cours';
                const styleMat = getSubjectStyle(matiere);
                const enseignant = row['Enseignant'] || row['enseignant'] || '';

                // Résolution robuste de la photo Google Drive de l'enseignant
                const photoUrl = findTeacherPhotoUrl(enseignant, teachersPhotos);
                const teacherInitial = enseignant ? enseignant.charAt(0).toUpperCase() : '?';

                const lecon = row['Leçon'] || row['lecon'] || '';
                const travaux = row['Travaux de classe'] || row['travaux'] || '';
                const support = row['Support'] || row['support'] || '';
                const devoirs = row['Devoirs'] || row['devoirs'] || '';
                const hasHw = devoirs && devoirs.trim() !== '' && !devoirs.toLowerCase().includes('aucun') && !devoirs.toLowerCase().includes('لا يوجد');

                return `
                <tr>
                  <!-- 1. MATIÈRES -->
                  <td class="col-matieres-td">
                    <div class="subject-header-row">
                      <span class="subject-name-tag" style="background:${styleMat.bg}; border-color:${styleMat.border}; color:${styleMat.text};">
                        <i class="fas ${styleMat.icon}"></i>
                        <span>${escapeHtml(matiere)}</span>
                      </span>
                      <span class="period-badge-pill">P${escapeHtml(periodeVal)}</span>
                    </div>

                    <div class="teacher-item-box">
                      ${(showPhotos && photoUrl) 
                        ? `<img src="${photoUrl}" alt="${escapeHtml(enseignant)}" class="teacher-photo-thumb" referrerpolicy="no-referrer" crossorigin="anonymous" onerror="this.style.display='none'; this.nextElementSibling.style.display='inline-flex';">
                           <span class="teacher-fallback-thumb" style="display:none;">${teacherInitial}</span>`
                        : `<span class="teacher-fallback-thumb">${teacherInitial}</span>`
                      }
                      <div class="teacher-name-print">${escapeHtml(enseignant)}</div>
                    </div>
                  </td>

                  <!-- 2. TRAVAIL DE CLASSE (AVEC SUPPORT DÉPLACÉ DEDANS) -->
                  <td class="col-classwork-td">
                    ${lecon ? `<strong class="lesson-title-strong"><i class="fas fa-book-reader" style="font-size:0.70rem;"></i> ${escapeHtml(lecon)}</strong>` : ''}
                    <div class="classwork-detail-txt">${escapeHtml(travaux || '—')}</div>
                    ${(support && support.trim() !== '' && support.trim() !== '-' && !support.toLowerCase().includes('aucun') && !support.toLowerCase().includes('لا يوجد')) ? `
                      <div class="classwork-support-chip">
                        <i class="fas fa-paperclip"></i>
                        <span class="support-chip-label">Support :</span>
                        <span class="support-chip-val">${escapeHtml(support)}</span>
                      </div>
                    ` : ''}
                  </td>

                  <!-- 3. DEVOIRS -->
                  <td class="col-homework-td">
                    ${hasHw ? `
                      <div class="homework-item-card">
                        <span class="homework-tag-label"><i class="fas fa-pencil-alt"></i> À faire :</span>
                        <div>${escapeHtml(devoirs)}</div>
                      </div>
                    ` : `
                      <span class="no-homework-txt">Aucun</span>
                    `}
                  </td>
                </tr>
                `;
              }).join(''))}
            </tbody>
          </table>
        </div>

        <!-- PIED DE PAGE SCELLÉ EN BAS DE LA PAGE A4 AVEC NUMÉRO DE PAGE -->
        <footer class="a4-page-footer">
          <div>Plan de travail hebdomadaire • Classe : <strong>${escapeHtml(classe)}</strong></div>
          <div class="footer-stamp-box">Visa de la Direction</div>
          <div class="page-number-box">Page <strong>${pageNum}</strong> / ${totalPages}</div>
        </footer>

      </section>
      `;
    }).join('')}

    <!-- ====================================================================
         PAGE FINALE : RÉCAPITULATIF CARTABLE & LIVRES À RAPPORTER POUR LES DEVOIRS
         ==================================================================== -->
    <section class="a4-page backpack-summary-page" id="page_backpack_recap">
      <!-- EN-TÊTE OFFICIEL WORD AL KAWTHAR -->
      <header class="word-header-container">
        <div class="header-main-row">
          <div class="header-logo-col">
            <img src="${logoAlKawtharUri}" alt="Logo Les Écoles Internationales Al Kawthar" class="header-school-logo" />
          </div>
          <div class="header-titles-col">
            <div class="word-main-title">LES ÉCOLES INTERNATIONALES AL KAWTHAR</div>
            <div class="word-sub-title-ar">مدارس الكوثر العالمية • AL KAWTHAR INTERNATIONAL SCHOOLS</div>
            <div class="header-week-range-badge">
              <i class="fas fa-calendar-alt"></i> <span>${escapeHtml(plageSemaineDisplay)}</span>
            </div>
          </div>
          <div class="header-meta-col">
            <div class="meta-tag-row">
              <span class="meta-tag-label">CLASSE :</span>
              <span class="meta-tag-val meta-class-highlight">${escapeHtml(classe)}</span>
            </div>
            <div class="meta-tag-row">
              <span class="meta-tag-label">SEMAINE :</span>
              <span class="meta-tag-val">${week}</span>
              <span class="meta-tag-sep">|</span>
              <span class="meta-tag-label">SEMESTRE :</span>
              <span class="meta-tag-val">${escapeHtml(String(semester || 1))}</span>
            </div>
            <div class="meta-doc-type">RÉCAPITULATIF CARTABLE</div>
          </div>
        </div>
      </header>

      <!-- BANDEAU CONSEIL & RAPPEL POUR LES PARENTS ET ÉLÈVES -->
      <div class="backpack-tip-box">
        <div class="backpack-tip-icon">
          <i class="fas fa-backpack"></i>
        </div>
        <div class="backpack-tip-content">
          <div class="backpack-tip-title">
            <span>ORGANISATION DU CARTABLE : LIVRES &amp; CAHIERS À RAPPORTER À LA MAISON</span>
            <span class="ar-tip-title">جدول تنظيم الحقيبة المدرسية والكتب للواجبات المنزلية</span>
          </div>
          <p class="backpack-tip-desc">
            Pour éviter d'oublier vos livres à l'école, vérifiez chaque jour votre cartable grâce à ce tableau récapitulatif des devoirs de la semaine.
            <br><span style="font-family:'Cairo', sans-serif; direction:rtl; display:inline-block;">لتفادي نسيan الكتب والكراسات بالمدرسة، يرجى مراجعة وتجهيز الحقيبة يومياً وفق هذا الجدول.</span>
          </p>
        </div>
      </div>

      <!-- TABLEAU RÉCAPITULATIF -->
      <div class="main-table-wrapper">
        <table class="backpack-recap-table">
          <thead>
            <tr>
              <th style="width: 17%;">JOUR / اليوم</th>
              <th style="width: 22%;">MATIÈRE / المادة</th>
              <th style="width: 29%;">DEVOIR PRÉVU / الواجب المطلوب</th>
              <th style="width: 24%;">LIVRE / CAHIER À PRENDRE / الكتاب أو الكراس</th>
              <th style="width: 8%; text-align:center;">VÉRIFIÉ</th>
            </tr>
          </thead>
          <tbody>
            ${daysToRender.map(dayName => {
              const dayRows = groupedByDay[dayName] || [];
              const hwRows = dayRows.filter(r => {
                const devoirs = String(r['Devoirs'] || r['devoirs'] || '').trim();
                return devoirs !== '' && devoirs !== '-' && !devoirs.toLowerCase().includes('aucun') && !devoirs.toLowerCase().includes('لا يوجد');
              });

              if (hwRows.length === 0) {
                return `
                <tr class="backpack-empty-day-row">
                  <td class="backpack-day-cell">
                    <div class="day-cell-badge">
                      <span>${escapeHtml(dayName)}</span>
                      <span class="day-cell-ar">${arabicDays[dayName] || ''}</span>
                    </div>
                  </td>
                  <td colspan="3" style="color:#64748B; font-style:italic; padding:6px 10px;">
                    <i class="fas fa-check-circle" style="color:#10B981; margin-right:5px;"></i>
                    Aucun devoir nécessitant de livre à rapporter à la maison pour ce jour. / لا توجد واجبات تتطلب إحضار كتب
                  </td>
                  <td style="text-align:center;">
                    <i class="fas fa-check" style="color:#10B981; font-size:1rem;"></i>
                  </td>
                </tr>
                `;
              }

              return hwRows.map((r, idx) => {
                const matiere = r['Matière'] || r['matiere'] || 'Cours';
                const styleMat = getSubjectStyle(matiere);
                const devoirs = r['Devoirs'] || r['devoirs'] || '';
                const support = String(r['Support'] || r['support'] || '').trim();
                const hasSupport = support && support !== '-' && !support.toLowerCase().includes('aucun') && !support.toLowerCase().includes('لا يوجد');
                
                let bookText = '';
                if (hasSupport) {
                  bookText = support;
                } else {
                  bookText = `Manuel & Cahier de ${matiere}`;
                }

                return `
                <tr>
                  ${idx === 0 ? `
                    <td rowspan="${hwRows.length}" class="backpack-day-cell" style="vertical-align:middle;">
                      <div class="day-cell-badge">
                        <span>${escapeHtml(dayName)}</span>
                        <span class="day-cell-ar">${arabicDays[dayName] || ''}</span>
                      </div>
                    </td>
                  ` : ''}
                  <td>
                    <span class="subject-name-tag" style="background:${styleMat.bg}; border-color:${styleMat.border}; color:${styleMat.text};">
                      <i class="fas ${styleMat.icon}"></i>
                      <span>${escapeHtml(matiere)}</span>
                    </span>
                  </td>
                  <td>
                    <div class="backpack-homework-desc">${escapeHtml(devoirs)}</div>
                  </td>
                  <td>
                    <div class="backpack-book-card">
                      <i class="fas fa-book-bookmark" style="color:#2563EB;"></i>
                      <span>${escapeHtml(bookText)}</span>
                    </div>
                  </td>
                  <td style="text-align:center;">
                    <div class="check-box-square"></div>
                  </td>
                </tr>
                `;
              }).join('');
            }).join('')}
          </tbody>
        </table>
      </div>

      <!-- PIED DE PAGE SCELLÉ EN BAS -->
      <footer class="a4-page-footer">
        <div>Plan de travail hebdomadaire • Classe : <strong>${escapeHtml(classe)}</strong></div>
        <div class="footer-stamp-box">Visa de la Direction</div>
        <div class="page-number-box">Page <strong>${totalPages}</strong> / ${totalPages}</div>
      </footer>
    </section>
  </div>

  <script>
    function setTheme(t) {
      document.documentElement.setAttribute('data-theme', t);
      document.querySelectorAll('.theme-opt-btn').forEach(btn => {
        btn.classList.toggle('active', btn.textContent.toLowerCase().includes(t.substring(0, 3)));
      });
    }

    function downloadSelfHtml() {
      const htmlContent = '<!DOCTYPE html>\\n' + document.documentElement.outerHTML;
      const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'Plan_Hebdomadaire_A4_S${week}_' + '${escapeHtml(classe).replace(/[^a-zA-Z0-9]/g, '_')}' + '.html';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  </script>
</body>
</html>`;
}

module.exports = {
  generateDesignPlanHtml,
  formatDriveImageUrl,
  getSubjectStyle,
  formatDateFrench,
  getDateForDayName
};
