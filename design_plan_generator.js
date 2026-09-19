// ============================================================================
// DESIGN PLAN GENERATOR - Modèle Stylisé Haute Définition A4 pour Impression / PDF
// Conforme au modèle Word officiel : Marges 1.5 cm, 3 colonnes, 1 page par jour
// ============================================================================

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

function formatDriveImageUrl(url) {
  if (!url || typeof url !== 'string') return '';
  const clean = url.trim();
  if (clean.startsWith('data:image/')) return clean;
  const driveMatch = clean.match(/\/d\/([a-zA-Z0-9_-]+)/) || clean.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (driveMatch && driveMatch[1]) {
    return `https://lh3.googleusercontent.com/d/${driveMatch[1]}`;
  }
  return clean;
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

function formatPeriodHour(periodeNum) {
  const p = parseInt(periodeNum, 10);
  switch (p) {
    case 1: return '08:00 - 08:55';
    case 2: return '08:55 - 09:50';
    case 3: return '10:10 - 11:05';
    case 4: return '11:05 - 12:00';
    case 5: return '12:00 - 12:55';
    case 6: return '13:15 - 14:10';
    case 7: return '14:10 - 15:05';
    default: return '';
  }
}

function generateDesignPlanHtml({
  week = 1,
  classe = 'Classe',
  data = [],
  notes = '',
  section = 'garcons',
  theme = 'indigo',
  showPhotos = true,
  teachersPhotos = {},
  weekStartDate = null,
  weekDateRange = '',
  semester = 1
}) {
  const dayOrder = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi'];
  const arabicDays = {
    'Dimanche': 'الأحد',
    'Lundi': 'الإثنين',
    'Mardi': 'الثلاثاء',
    'Mercredi': 'الأربعاء',
    'Jeudi': 'الخميس'
  };

  // Grouper les séances par jour
  const groupedByDay = {};
  dayOrder.forEach(d => { groupedByDay[d] = []; });

  data.forEach(item => {
    if (!item) return;
    const rawDay = item['Jour'] || item['jour'] || item['day'] || '';
    let matchedDay = dayOrder.find(d => rawDay.toLowerCase().includes(d.toLowerCase())) || rawDay;
    if (!groupedByDay[matchedDay]) {
      groupedByDay[matchedDay] = [];
    }
    groupedByDay[matchedDay].push(item);
  });

  // Trier par période chaque jour
  dayOrder.forEach(d => {
    if (groupedByDay[d]) {
      groupedByDay[d].sort((a, b) => {
        const pA = parseInt(a['Période'] || a['periode'] || a['Période (Heure)'] || 0, 10);
        const pB = parseInt(b['Période'] || b['periode'] || b['Période (Heure)'] || 0, 10);
        return pA - pB;
      });
    }
  });

  // Déterminer la date de début si objet ou string
  let weekStartObj = null;
  if (weekStartDate instanceof Date && !isNaN(weekStartDate.getTime())) {
    weekStartObj = weekStartDate;
  } else if (typeof weekStartDate === 'string' && weekStartDate.trim() !== '') {
    const parsed = new Date(weekStartDate.includes('T') ? weekStartDate : weekStartDate + 'T00:00:00Z');
    if (!isNaN(parsed.getTime())) weekStartObj = parsed;
  }

  // Libellé de la plage de la semaine
  let plageSemaineDisplay = weekDateRange;
  if (!plageSemaineDisplay) {
    if (weekStartObj) {
      const endD = new Date(weekStartObj.getTime());
      endD.setUTCDate(endD.getUTCDate() + 4);
      plageSemaineDisplay = `du ${formatDateFrench(weekStartObj)} à ${formatDateFrench(endD)}`;
    } else {
      plageSemaineDisplay = `du Dimanche ...... à Jeudi ......`;
    }
  }

  // Filtrer les jours qui ont des cours ou afficher les 5 jours de la semaine scolaire
  const activeDays = dayOrder.filter(d => (groupedByDay[d] && groupedByDay[d].length > 0));
  const daysToRender = activeDays.length > 0 ? activeDays : dayOrder;
  const totalPages = daysToRender.length;

  return `<!DOCTYPE html>
<html lang="fr" data-theme="${escapeHtml(theme)}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Plan Hebdomadaire - Semaine ${week} - ${escapeHtml(classe)}</title>
  <!-- Google Fonts professionnels : Outfit, Plus Jakarta Sans et Cairo -->
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@500;600;700;800&family=Outfit:wght@500;600;700;800;900&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <!-- FontAwesome Icons -->
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
  
  <style>
    /* ========================================================================
       CONFIGURATION PAGE A4 & MARGES EXACTES DE 1.5 CM
       ======================================================================== */
    @page {
      size: A4 portrait;
      margin: 1.5cm 1.5cm 1.5cm 1.5cm;
    }

    :root {
      --primary-color: #1E3A8A;
      --primary-gradient: linear-gradient(135deg, #1E3A8A 0%, #2563EB 100%);
      --accent-color: #2563EB;
      --accent-light: #EFF6FF;
      --border-dark: #334155;
      --border-light: #CBD5E1;
      --text-main: #0F172A;
      --text-muted: #475569;
      --lesson-topic-color: #991B1B;
      --homework-bg: #FEF3C7;
      --homework-border: #F59E0B;
      --homework-text: #92400E;
    }

    [data-theme="emerald"] {
      --primary-color: #065F46;
      --primary-gradient: linear-gradient(135deg, #065F46 0%, #059669 100%);
      --accent-color: #059669;
      --accent-light: #ECFDF5;
      --homework-bg: #FEF9C3;
      --homework-border: #EAB308;
      --homework-text: #854D0E;
    }

    [data-theme="prestige"] {
      --primary-color: #881337;
      --primary-gradient: linear-gradient(135deg, #881337 0%, #BE123C 100%);
      --accent-color: #BE123C;
      --accent-light: #FFF1F2;
      --lesson-topic-color: #881337;
      --homework-bg: #FEF2F2;
      --homework-border: #F87171;
      --homework-text: #991B1B;
    }

    [data-theme="classic"] {
      --primary-color: #000000;
      --primary-gradient: linear-gradient(135deg, #1E293B 0%, #0F172A 100%);
      --accent-color: #0F172A;
      --accent-light: #F1F5F9;
      --lesson-topic-color: #000000;
      --homework-bg: #F8FAFC;
      --homework-border: #94A3B8;
      --homework-text: #0F172A;
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background-color: #E2E8F0;
      color: var(--text-main);
      line-height: 1.45;
      -webkit-font-smoothing: antialiased;
    }

    /* BARRE D'ACTION FLOTTANTE EN HAUT (NON IMPRIMABLE) */
    .screen-toolbar {
      position: sticky;
      top: 0;
      z-index: 1000;
      background: #0F172A;
      color: white;
      padding: 10px 20px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 12px;
      box-shadow: 0 4px 16px rgba(0,0,0,0.25);
    }

    .toolbar-info {
      display: flex;
      align-items: center;
      gap: 10px;
      font-size: 0.95rem;
      font-weight: 700;
    }

    .toolbar-controls {
      display: flex;
      align-items: center;
      gap: 10px;
      flex-wrap: wrap;
    }

    .btn-toolbar {
      border: none;
      padding: 8px 16px;
      border-radius: 8px;
      font-weight: 700;
      font-size: 0.85rem;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 7px;
      transition: all 0.2s ease;
    }

    .btn-print-primary {
      background: linear-gradient(135deg, #10B981, #059669);
      color: white;
      box-shadow: 0 2px 8px rgba(16, 185, 129, 0.4);
    }
    .btn-print-primary:hover {
      filter: brightness(1.1);
      transform: translateY(-1px);
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
      font-size: 0.78rem;
      font-weight: 600;
      padding: 5px 10px;
      border-radius: 6px;
      cursor: pointer;
    }

    .theme-opt-btn.active {
      background: white;
      color: #0F172A;
    }

    /* CONTENEUR GLOBAL DES FEUILLES A4 */
    .all-pages-wrapper {
      padding: 20px 0;
    }

    /* ========================================================================
       FEUILLE A4 STRICTE (210mm x 297mm) AVEC MARGE 1.5 CM
       ======================================================================== */
    .a4-page {
      width: 210mm;
      min-height: 297mm;
      margin: 0 auto 30px auto;
      padding: 1.5cm; /* Marge exacte de 1.5 cm sur les 4 côtés */
      background: #FFFFFF;
      box-shadow: 0 8px 24px rgba(0,0,0,0.12);
      box-sizing: border-box;
      position: relative;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      page-break-after: always;
      break-after: page;
    }

    .a4-page:last-child {
      margin-bottom: 20px;
    }

    /* ------------------------------------------------------------------------
       1. EN-TÊTE STRUCTURÉ COMME SUR LE MODÈLE WORD
       ------------------------------------------------------------------------ */
    .word-header-container {
      margin-bottom: 12px;
      border-bottom: 2px solid var(--primary-color);
      padding-bottom: 8px;
    }

    .word-main-title {
      font-family: 'Outfit', sans-serif;
      font-size: 1.55rem;
      font-weight: 900;
      color: var(--primary-color);
      letter-spacing: 0.05em;
      text-transform: uppercase;
      text-align: center;
      margin-bottom: 8px;
    }

    .word-meta-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.92rem;
    }

    .word-meta-table td {
      padding: 3px 0;
      vertical-align: middle;
    }

    .meta-left {
      text-align: left;
      width: 50%;
    }

    .meta-right {
      text-align: right;
      width: 50%;
    }

    .meta-label {
      font-weight: 800;
      color: #1E293B;
      text-transform: uppercase;
      font-size: 0.88rem;
    }

    .meta-value {
      font-weight: 700;
      color: var(--primary-color);
      font-size: 0.95rem;
    }

    .meta-date-range {
      font-weight: 600;
      color: #334155;
    }

    /* ------------------------------------------------------------------------
       2. TABLEAU DES NOTES (DESIGN SOIGNÉ & PROFESSIONNEL)
       ------------------------------------------------------------------------ */
    .word-notes-block {
      margin-bottom: 12px;
    }

    .notes-styled-table {
      width: 100%;
      border-collapse: collapse;
      border: 1.5px solid #F59E0B;
      background: #FFFBEB;
      border-radius: 6px;
      overflow: hidden;
    }

    .notes-styled-table th {
      background: linear-gradient(135deg, #F59E0B 0%, #D97706 100%);
      color: #FFFFFF;
      padding: 5px 10px;
      font-size: 0.82rem;
      font-weight: 800;
      letter-spacing: 0.03em;
      text-transform: uppercase;
    }

    .notes-styled-table td {
      padding: 8px 12px;
      font-size: 0.86rem;
      color: #78350F;
      line-height: 1.45;
      font-weight: 500;
      white-space: pre-wrap;
    }

    /* ------------------------------------------------------------------------
       3. BANDEAU DE DATE DU JOUR (EX: Lundi 21 Septembre 2026)
       ------------------------------------------------------------------------ */
    .day-banner-strip {
      background: #F8FAFC;
      border: 1.5px solid var(--border-light);
      border-left: 5px solid var(--primary-color);
      padding: 7px 14px;
      margin-bottom: 10px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-radius: 4px;
    }

    .day-title-french {
      font-family: 'Outfit', sans-serif;
      font-size: 1.15rem;
      font-weight: 800;
      color: var(--primary-color);
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .day-title-arabic {
      font-family: 'Cairo', sans-serif;
      font-size: 1.2rem;
      font-weight: 700;
      color: #475569;
      direction: rtl;
    }

    /* ------------------------------------------------------------------------
       4. TABLEAU OFFICIEL DES SÉANCES DU JOUR (3 COLONNES EXACTES)
       MATIÈRES | TRAVAIL DE CLASSE | DEVOIRS
       ------------------------------------------------------------------------ */
    .main-table-wrapper {
      flex: 1;
    }

    .lessons-table-a4 {
      width: 100%;
      border-collapse: collapse;
      border: 1.5px solid var(--border-dark);
      font-size: 0.84rem;
    }

    .lessons-table-a4 thead th {
      background: #F1F5F9;
      color: #0F172A;
      font-family: 'Outfit', sans-serif;
      font-weight: 800;
      font-size: 0.88rem;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      padding: 8px 10px;
      border: 1.5px solid var(--border-dark);
      text-align: center;
    }

    .lessons-table-a4 tbody td {
      border: 1px solid #CBD5E1;
      padding: 8px 10px;
      vertical-align: top;
    }

    .lessons-table-a4 tbody tr:nth-child(even) {
      background: #FAFAFC;
    }

    /* COLONNE 1 : MATIÈRES */
    .col-matieres-td {
      width: 28%;
      border-right: 1.5px solid var(--border-dark) !important;
    }

    .subject-header-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 4px;
    }

    .subject-name-tag {
      font-weight: 800;
      font-size: 0.86rem;
      display: inline-flex;
      align-items: center;
      gap: 5px;
      padding: 2px 7px;
      border-radius: 5px;
      border: 1px solid transparent;
      white-space: nowrap;
    }

    .period-badge-pill {
      font-size: 0.72rem;
      font-weight: 800;
      background: #0F172A;
      color: white;
      padding: 1px 6px;
      border-radius: 4px;
      white-space: nowrap;
    }

    .period-time-txt {
      font-size: 0.7rem;
      color: var(--text-muted);
      margin-bottom: 5px;
      font-weight: 600;
    }

    /* ENSEIGNANT AVEC PHOTO GOOGLE DRIVE */
    .teacher-item-box {
      display: flex;
      align-items: center;
      gap: 7px;
      margin-top: 4px;
      padding-top: 4px;
      border-top: 1px dashed #E2E8F0;
    }

    .teacher-photo-thumb {
      width: 30px;
      height: 30px;
      border-radius: 50%;
      object-fit: cover;
      border: 1.5px solid var(--accent-color);
      flex-shrink: 0;
      background: #E2E8F0;
    }

    .teacher-fallback-thumb {
      width: 30px;
      height: 30px;
      border-radius: 50%;
      background: var(--accent-light);
      color: var(--primary-color);
      border: 1.5px solid var(--accent-color);
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 0.75rem;
      font-weight: 800;
      flex-shrink: 0;
    }

    .teacher-name-print {
      font-weight: 700;
      font-size: 0.82rem;
      color: #1E293B;
      line-height: 1.2;
    }

    .support-info-txt {
      font-size: 0.75rem;
      color: #475569;
      font-style: italic;
      margin-top: 4px;
    }

    /* COLONNE 2 : TRAVAIL DE CLASSE */
    .col-classwork-td {
      width: 44%;
      border-right: 1.5px solid var(--border-dark) !important;
    }

    .lesson-title-strong {
      font-weight: 800;
      font-size: 0.88rem;
      color: var(--lesson-topic-color);
      margin-bottom: 4px;
      line-height: 1.35;
      display: block;
    }

    .classwork-detail-txt {
      font-size: 0.84rem;
      color: #1E293B;
      line-height: 1.45;
      white-space: pre-wrap;
    }

    /* COLONNE 3 : DEVOIRS */
    .col-homework-td {
      width: 28%;
    }

    .homework-item-card {
      background: var(--homework-bg);
      border: 1px solid var(--homework-border);
      border-radius: 6px;
      padding: 6px 8px;
      color: var(--homework-text);
      font-weight: 600;
      font-size: 0.82rem;
      line-height: 1.35;
    }

    .homework-tag-label {
      font-size: 0.7rem;
      font-weight: 800;
      text-transform: uppercase;
      display: flex;
      align-items: center;
      gap: 4px;
      margin-bottom: 2px;
      color: var(--homework-text);
    }

    .no-homework-txt {
      color: #94A3B8;
      font-size: 0.8rem;
      font-style: italic;
    }

    /* ------------------------------------------------------------------------
       5. PIED DE PAGE IMPRIMABLE
       ------------------------------------------------------------------------ */
    .a4-page-footer {
      margin-top: 10px;
      padding-top: 6px;
      border-top: 1px solid #CBD5E1;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 0.74rem;
      color: #64748B;
    }

    .footer-stamp-box {
      font-weight: 700;
      color: #334155;
    }

    /* ========================================================================
       RÈGLES D'IMPRESSION STRICTES (@media print)
       ======================================================================== */
    @media print {
      html, body {
        background: #FFFFFF !important;
        margin: 0 !important;
        padding: 0 !important;
        color: #000000 !important;
      }

      .no-print {
        display: none !important;
      }

      .all-pages-wrapper {
        padding: 0 !important;
      }

      .a4-page {
        width: 100% !important;
        min-height: auto !important;
        margin: 0 !important;
        padding: 0 !important; /* Le navigateur applique les 1.5 cm de @page */
        box-shadow: none !important;
        border: none !important;
        page-break-after: always !important;
        break-after: page !important;
      }

      .a4-page:last-child {
        page-break-after: avoid !important;
        break-after: avoid !important;
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
      <i class="fas fa-file-pdf" style="color:#60A5FA;"></i>
      <span>Plan Hebdomadaire Stylisé • Semaine ${week} • Classe : ${escapeHtml(classe)}</span>
    </div>
    <div class="toolbar-controls">
      <!-- Sélecteur de Thème Visuel -->
      <div class="theme-selector">
        <button type="button" class="theme-opt-btn ${theme === 'indigo' ? 'active' : ''}" onclick="setTheme('indigo')">Indigo</button>
        <button type="button" class="theme-opt-btn ${theme === 'emerald' ? 'active' : ''}" onclick="setTheme('emerald')">Émeraude</button>
        <button type="button" class="theme-opt-btn ${theme === 'prestige' ? 'active' : ''}" onclick="setTheme('prestige')">Bordeaux</button>
        <button type="button" class="theme-opt-btn ${theme === 'classic' ? 'active' : ''}" onclick="setTheme('classic')">Classique</button>
      </div>
      <!-- Enregistrer HTML autonome -->
      <button type="button" class="btn-toolbar btn-download-html" onclick="downloadSelfHtml()">
        <i class="fas fa-download"></i> <span>Enregistrer HTML</span>
      </button>
      <!-- Bouton Impression / Exportation PDF -->
      <button type="button" class="btn-toolbar btn-print-primary" onclick="window.print()">
        <i class="fas fa-print"></i> <span>Imprimer / Sauvegarder en PDF</span>
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

      return `
      <section class="a4-page" id="page_day_${dayName.toLowerCase()}">
        
        <!-- EN-TÊTE OFFICIEL WORD SUR CHAQUE PAGE -->
        <header class="word-header-container">
          <div class="word-main-title">PLAN HEBDOMADAIRE</div>
          <table class="word-meta-table">
            <tr>
              <td class="meta-left">
                <span class="meta-label">CLASSE : </span>
                <span class="meta-value">${escapeHtml(classe)}</span>
              </td>
              <td class="meta-right">
                <span class="meta-label">SEMESTRE : </span>
                <span class="meta-value">${escapeHtml(String(semester || 1))}</span>
              </td>
            </tr>
            <tr>
              <td class="meta-left">
                <span class="meta-label">Semaine : </span>
                <span class="meta-value">${week}</span>
              </td>
              <td class="meta-right">
                <span class="meta-date-range">${escapeHtml(plageSemaineDisplay)}</span>
              </td>
            </tr>
          </table>
        </header>

        <!-- TABLEAU DES NOTES (SUR LA PREMIÈRE PAGE OU RAPPELÉ) -->
        ${isFirstPage ? `
          <div class="word-notes-block">
            <table class="notes-styled-table">
              <thead>
                <tr>
                  <th style="text-align:left;"><i class="fas fa-clipboard-list"></i> Remarques & Notes de la semaine</th>
                  <th style="text-align:right; font-family:'Cairo', sans-serif;">ملاحظات الأسبوع</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td colspan="2">
                    ${escapeHtml(notes && notes.trim() !== '' ? notes : 'Aucune consigne particulière pour cette semaine.')}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        ` : ''}

        <!-- BANDEAU DU JOUR EN COURS (EX: Lundi 21 Septembre 2026) -->
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
              ${rows.length === 0 ? `
                <tr>
                  <td colspan="3" style="text-align:center; padding:30px; color:#94A3B8; font-style:italic;">
                    Aucune séance programmée pour cette journée.
                  </td>
                </tr>
              ` : rows.map(row => {
                const periodeVal = row['Période'] || row['periode'] || row['Période (Heure)'] || '1';
                const horaire = formatPeriodHour(periodeVal);
                const matiere = row['Matière'] || row['matiere'] || 'Cours';
                const styleMat = getSubjectStyle(matiere);
                const enseignant = row['Enseignant'] || row['enseignant'] || '';

                // Récupération de la photo Google Drive si disponible
                let photoUrl = teachersPhotos[enseignant] || '';
                if (photoUrl) photoUrl = formatDriveImageUrl(photoUrl);
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
                    ${horaire ? `<div class="period-time-txt">${horaire}</div>` : ''}

                    <div class="teacher-item-box">
                      ${(showPhotos && photoUrl) 
                        ? `<img src="${photoUrl}" alt="${escapeHtml(enseignant)}" class="teacher-photo-thumb" onerror="this.onerror=null; this.src='https://ui-avatars.com/api/?name=${encodeURIComponent(enseignant)}&background=1E3A8A&color=fff';">`
                        : `<span class="teacher-fallback-thumb">${teacherInitial}</span>`
                      }
                      <div class="teacher-name-print">${escapeHtml(enseignant)}</div>
                    </div>

                    ${support ? `<div class="support-info-txt"><i class="fas fa-paperclip"></i> Support : ${escapeHtml(support)}</div>` : ''}
                  </td>

                  <!-- 2. TRAVAIL DE CLASSE -->
                  <td class="col-classwork-td">
                    ${lecon ? `<strong class="lesson-title-strong"><i class="fas fa-book-reader" style="font-size:0.75rem;"></i> ${escapeHtml(lecon)}</strong>` : ''}
                    <div class="classwork-detail-txt">${escapeHtml(travaux || '—')}</div>
                  </td>

                  <!-- 3. DEVOIRS -->
                  <td class="col-homework-td">
                    ${hasHw ? `
                      <div class="homework-item-card">
                        <div class="homework-tag-label">
                          <i class="fas fa-pencil-alt"></i> <span>À faire :</span>
                        </div>
                        <div>${escapeHtml(devoirs)}</div>
                      </div>
                    ` : `
                      <span class="no-homework-txt">${escapeHtml(devoirs || '—')}</span>
                    `}
                  </td>
                </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>

        <!-- PIED DE PAGE DE CHAQUE FEUILLE A4 -->
        <footer class="a4-page-footer">
          <div>Plan de travail hebdomadaire • Classe : <strong>${escapeHtml(classe)}</strong></div>
          <div class="footer-stamp-box">Visa de la Direction</div>
          <div>Page <strong>${pageNum}</strong> / ${totalPages}</div>
        </footer>

      </section>
      `;
    }).join('')}
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
