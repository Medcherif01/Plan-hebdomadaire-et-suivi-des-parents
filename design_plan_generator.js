// ============================================================================
// DESIGN PLAN GENERATOR - Modèle Stylisé & Haute Définition pour Impression / PDF
// ============================================================================

const subjectColors = {
  'francais': { bg: '#EEF2FF', border: '#818CF8', text: '#312E81', icon: 'fa-book-open', label: 'Français' },
  'maths': { bg: '#EFF6FF', border: '#60A5FA', text: '#1E40AF', icon: 'fa-calculator', label: 'Mathématiques' },
  'mathematiques': { bg: '#EFF6FF', border: '#60A5FA', text: '#1E40AF', icon: 'fa-calculator', label: 'Mathématiques' },
  'arabe': { bg: '#ECFDF5', border: '#34D399', text: '#065F46', icon: 'fa-feather-alt', label: 'العربية' },
  'anglais': { bg: '#F0F9FF', border: '#38BDF8', text: '#0369A1', icon: 'fa-language', label: 'English' },
  'sciences': { bg: '#F0FDF4', border: '#4ADE80', text: '#14532D', icon: 'fa-atom', label: 'Sciences' },
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
  weekDateRange = ''
}) {
  const sectionLabels = {
    garcons: 'Section Garçons 👦',
    filles: 'Section Filles 👧',
    primaire: 'Section Primaire & Maternelle 👶🎒'
  };
  const currentSectionLabel = sectionLabels[section] || 'Section Garçons';

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

  let totalSessions = 0;
  let totalHomework = 0;
  const teachersSet = new Set();
  const subjectsSet = new Set();

  data.forEach(item => {
    if (!item) return;
    const rawDay = item['Jour'] || item['jour'] || item['day'] || '';
    let matchedDay = dayOrder.find(d => rawDay.toLowerCase().includes(d.toLowerCase())) || rawDay;
    if (!groupedByDay[matchedDay]) {
      groupedByDay[matchedDay] = [];
    }
    groupedByDay[matchedDay].push(item);
    totalSessions++;

    const hw = item['Devoirs'] || item['devoirs'] || '';
    if (hw && hw.trim() !== '' && !hw.toLowerCase().includes('aucun') && !hw.toLowerCase().includes('لا يوجد')) {
      totalHomework++;
    }

    const t = item['Enseignant'] || item['enseignant'] || '';
    if (t) teachersSet.add(t.trim());

    const m = item['Matière'] || item['matiere'] || '';
    if (m) subjectsSet.add(m.trim());
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

  const printTimestamp = new Date().toLocaleString('fr-FR', {
    dateStyle: 'full',
    timeStyle: 'short'
  });

  return `<!DOCTYPE html>
<html lang="fr" data-theme="${escapeHtml(theme)}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Plan Hebdomadaire Stylisé - Semaine ${week} - ${escapeHtml(classe)}</title>
  <!-- Google Fonts : Typographie bilingue moderne -->
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800&family=Outfit:wght@400;500;600;700;800&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
  <!-- FontAwesome Icons -->
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
  <style>
    :root {
      /* Palette Indigo par défaut */
      --primary-color: #1E3A8A;
      --primary-gradient: linear-gradient(135deg, #1E3A8A 0%, #2563EB 100%);
      --accent-color: #3B82F6;
      --accent-light: #EFF6FF;
      --border-color: #CBD5E1;
      --bg-canvas: #F8FAFC;
      --card-bg: #FFFFFF;
      --text-main: #0F172A;
      --text-muted: #64748B;
      --homework-bg: #FEF3C7;
      --homework-border: #F59E0B;
      --homework-text: #92400E;
    }

    [data-theme="emerald"] {
      --primary-color: #065F46;
      --primary-gradient: linear-gradient(135deg, #065F46 0%, #059669 100%);
      --accent-color: #10B981;
      --accent-light: #ECFDF5;
      --border-color: #A7F3D0;
      --homework-bg: #FEF9C3;
      --homework-border: #EAB308;
      --homework-text: #854D0E;
    }

    [data-theme="multicolor"] {
      --primary-color: #312E81;
      --primary-gradient: linear-gradient(135deg, #312E81 0%, #4F46E5 100%);
      --accent-color: #6366F1;
      --accent-light: #EEF2FF;
      --border-color: #C7D2FE;
      --homework-bg: #FFFBEB;
      --homework-border: #F59E0B;
      --homework-text: #B45309;
    }

    [data-theme="prestige"] {
      --primary-color: #881337;
      --primary-gradient: linear-gradient(135deg, #881337 0%, #BE123C 100%);
      --accent-color: #D97706;
      --accent-light: #FFFBEB;
      --border-color: #FECDD3;
      --homework-bg: #FEF2F2;
      --homework-border: #EF4444;
      --homework-text: #991B1B;
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      font-family: 'Outfit', 'Plus Jakarta Sans', 'Cairo', sans-serif;
      background-color: var(--bg-canvas);
      color: var(--text-main);
      line-height: 1.5;
      padding-bottom: 60px;
    }

    /* BARRE D'ACTIONS FLOTTANTE EN HAUT (NON IMPRIMABLE) */
    .action-toolbar-top {
      position: sticky;
      top: 0;
      z-index: 999;
      background: rgba(15, 23, 42, 0.95);
      backdrop-filter: blur(12px);
      padding: 12px 24px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 12px;
      color: white;
      box-shadow: 0 4px 20px rgba(0,0,0,0.15);
      border-bottom: 1px solid rgba(255,255,255,0.1);
    }

    .toolbar-title {
      font-weight: 700;
      font-size: 1rem;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .toolbar-actions {
      display: flex;
      align-items: center;
      gap: 10px;
      flex-wrap: wrap;
    }

    .btn-action {
      background: #2563EB;
      color: white;
      border: none;
      padding: 8px 16px;
      border-radius: 8px;
      font-weight: 700;
      font-size: 0.85rem;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      transition: all 0.2s ease;
    }

    .btn-action:hover {
      opacity: 0.9;
      transform: translateY(-1px);
    }

    .btn-print {
      background: linear-gradient(135deg, #10B981, #059669);
      box-shadow: 0 2px 8px rgba(16,185,129,0.3);
    }

    .btn-theme {
      background: rgba(255,255,255,0.15);
      border: 1px solid rgba(255,255,255,0.25);
    }

    .theme-picker {
      display: inline-flex;
      background: rgba(255,255,255,0.1);
      padding: 3px;
      border-radius: 8px;
      gap: 4px;
    }

    .theme-btn {
      background: transparent;
      border: none;
      color: white;
      font-size: 0.8rem;
      font-weight: 600;
      padding: 5px 10px;
      border-radius: 6px;
      cursor: pointer;
    }

    .theme-btn.active {
      background: white;
      color: #0F172A;
    }

    /* CONTENEUR PRINCIPAL DU PLAN */
    .plan-page-container {
      max-width: 1280px;
      margin: 24px auto;
      padding: 0 16px;
    }

    /* EN-TÊTE INSTITUTIONNEL ÉLÉGANT */
    .plan-header-card {
      background: var(--card-bg);
      border-radius: 16px;
      border: 1px solid var(--border-color);
      box-shadow: 0 4px 18px rgba(0,0,0,0.04);
      padding: 24px 28px;
      margin-bottom: 24px;
      position: relative;
      overflow: hidden;
    }

    .plan-header-card::before {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      height: 6px;
      background: var(--primary-gradient);
    }

    .header-top-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 16px;
      margin-bottom: 18px;
    }

    .school-identity {
      display: flex;
      align-items: center;
      gap: 14px;
    }

    .school-emblem {
      width: 54px;
      height: 54px;
      border-radius: 14px;
      background: var(--primary-gradient);
      color: white;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 1.6rem;
      box-shadow: 0 4px 12px rgba(30,58,138,0.25);
    }

    .school-titles h1 {
      font-size: 1.35rem;
      font-weight: 800;
      color: var(--primary-color);
      letter-spacing: -0.02em;
    }

    .school-titles p {
      font-size: 0.85rem;
      color: var(--text-muted);
      font-weight: 600;
    }

    .header-badges-group {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }

    .badge-pill {
      padding: 6px 14px;
      border-radius: 20px;
      font-size: 0.85rem;
      font-weight: 700;
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }

    .badge-week {
      background: var(--primary-gradient);
      color: white;
      box-shadow: 0 2px 8px rgba(37,99,235,0.25);
    }

    .badge-class {
      background: var(--accent-light);
      color: var(--primary-color);
      border: 1.5px solid var(--border-color);
    }

    .badge-section {
      background: #F1F5F9;
      color: #334155;
      border: 1px solid #CBD5E1;
    }

    /* BARRE DE STATISTIQUES RÉCAPITULATIVE */
    .summary-stats-strip {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
      gap: 12px;
      padding-top: 16px;
      border-top: 1px solid #F1F5F9;
    }

    .stat-pill {
      background: #F8FAFC;
      border: 1px solid #E2E8F0;
      border-radius: 10px;
      padding: 10px 14px;
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .stat-icon-circle {
      width: 36px;
      height: 36px;
      border-radius: 8px;
      background: var(--accent-light);
      color: var(--primary-color);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 0.95rem;
    }

    .stat-text .stat-num {
      font-size: 1.05rem;
      font-weight: 800;
      color: var(--text-main);
      line-height: 1.1;
    }

    .stat-text .stat-lbl {
      font-size: 0.75rem;
      color: var(--text-muted);
      font-weight: 600;
    }

    /* SECTION DES JOURS */
    .day-block-card {
      background: var(--card-bg);
      border-radius: 14px;
      border: 1px solid var(--border-color);
      margin-bottom: 20px;
      overflow: hidden;
      box-shadow: 0 3px 12px rgba(0,0,0,0.03);
      page-break-inside: avoid;
      break-inside: avoid;
    }

    .day-header-banner {
      background: #F1F5F9;
      border-bottom: 1.5px solid var(--border-color);
      padding: 12px 20px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 10px;
    }

    .day-name-fr {
      font-size: 1.05rem;
      font-weight: 800;
      color: var(--primary-color);
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .day-name-ar {
      font-family: 'Cairo', sans-serif;
      font-size: 1.1rem;
      font-weight: 700;
      color: var(--text-muted);
      direction: rtl;
    }

    /* TABLEAU DES SÉANCES DU JOUR */
    .lessons-table {
      width: 100%;
      border-collapse: collapse;
      text-align: left;
      font-size: 0.88rem;
    }

    .lessons-table th {
      background: #F8FAFC;
      color: #475569;
      font-weight: 700;
      font-size: 0.78rem;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      padding: 10px 14px;
      border-bottom: 1.5px solid var(--border-color);
    }

    .lessons-table td {
      padding: 12px 14px;
      border-bottom: 1px solid #E2E8F0;
      vertical-align: top;
    }

    .lessons-table tr:last-child td {
      border-bottom: none;
    }

    .lessons-table tr:nth-child(even) {
      background: #FAFAFC;
    }

    /* COLONNES SPÉCIFIQUES */
    .col-period {
      width: 110px;
      white-space: nowrap;
    }

    .period-badge-tag {
      background: #0F172A;
      color: white;
      font-size: 0.75rem;
      font-weight: 800;
      padding: 3px 8px;
      border-radius: 6px;
      display: inline-block;
      margin-bottom: 2px;
    }

    .period-hour-txt {
      font-size: 0.72rem;
      color: var(--text-muted);
      font-weight: 600;
    }

    .col-subject {
      width: 160px;
    }

    .subject-pill {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 5px 10px;
      border-radius: 8px;
      font-weight: 700;
      font-size: 0.82rem;
      border: 1px solid transparent;
      white-space: nowrap;
    }

    .col-teacher {
      width: 150px;
    }

    .teacher-badge-container {
      display: inline-flex;
      align-items: center;
      gap: 8px;
    }

    .teacher-avatar-photo {
      width: 32px;
      height: 32px;
      border-radius: 50%;
      object-fit: cover;
      border: 1.5px solid var(--border-color);
      background: #E2E8F0;
      flex-shrink: 0;
    }

    .teacher-avatar-fallback {
      width: 32px;
      height: 32px;
      border-radius: 50%;
      background: var(--accent-light);
      color: var(--primary-color);
      font-size: 0.75rem;
      font-weight: 800;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      border: 1px solid var(--border-color);
    }

    .teacher-name-txt {
      font-weight: 700;
      font-size: 0.84rem;
      color: var(--text-main);
    }

    .col-lesson {
      min-width: 180px;
    }

    .lesson-title-strong {
      font-weight: 700;
      color: #B91C1C; /* Rouge bordeaux institutionnel pour les titres */
      font-size: 0.9rem;
      display: block;
      margin-bottom: 2px;
    }

    .col-classwork {
      min-width: 180px;
      color: #334155;
    }

    .col-support {
      width: 130px;
      font-style: italic;
      color: #475569;
      font-size: 0.82rem;
    }

    .col-homework {
      min-width: 190px;
    }

    .homework-highlight-card {
      background: var(--homework-bg);
      border: 1px solid var(--homework-border);
      border-radius: 8px;
      padding: 7px 10px;
      color: var(--homework-text);
      font-weight: 600;
      font-size: 0.82rem;
    }

    .homework-header-tag {
      font-weight: 800;
      font-size: 0.72rem;
      text-transform: uppercase;
      letter-spacing: 0.03em;
      display: flex;
      align-items: center;
      gap: 5px;
      margin-bottom: 3px;
    }

    /* NOTES DE CLASSE BANNER */
    .class-notes-section {
      background: #FFFBEB;
      border: 1.5px solid #FCD34D;
      border-radius: 14px;
      padding: 18px 22px;
      margin-bottom: 24px;
      page-break-inside: avoid;
    }

    .class-notes-title {
      font-weight: 800;
      color: #92400E;
      font-size: 0.95rem;
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 6px;
    }

    .class-notes-content {
      font-size: 0.9rem;
      color: #78350F;
      white-space: pre-wrap;
      line-height: 1.6;
    }

    /* PIED DE PAGE IMPRIMABLE */
    .plan-footer-box {
      border-top: 1.5px solid var(--border-color);
      padding-top: 16px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 16px;
      font-size: 0.78rem;
      color: var(--text-muted);
      page-break-inside: avoid;
    }

    .signature-area {
      border: 1px dashed var(--border-color);
      border-radius: 8px;
      padding: 10px 18px;
      text-align: center;
      min-width: 220px;
      background: white;
    }

    /* GESTION IMPRESSION & PDF */
    @media print {
      body {
        background: white !important;
        padding: 0 !important;
      }
      .action-toolbar-top {
        display: none !important;
      }
      .plan-page-container {
        max-width: 100% !important;
        margin: 0 !important;
        padding: 0 !important;
      }
      .plan-header-card, .day-block-card, .class-notes-section {
        box-shadow: none !important;
        border-color: #CBD5E1 !important;
      }
      * {
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
      @page {
        size: A4 portrait;
        margin: 8mm 8mm 8mm 8mm;
      }
    }
  </style>
</head>
<body>

  <!-- BARRE D'ACTIONS RAPIDE (NON IMPRIMÉE) -->
  <div class="action-toolbar-top no-print">
    <div class="toolbar-title">
      <i class="fas fa-palette" style="color: #60A5FA;"></i>
      <span>Plan Hebdomadaire Stylisé • Semaine ${week} • ${escapeHtml(classe)}</span>
    </div>
    <div class="toolbar-actions">
      <!-- Choix de thèmes visuels -->
      <div class="theme-picker">
        <button type="button" class="theme-btn ${theme === 'indigo' ? 'active' : ''}" onclick="setTheme('indigo')">Indigo</button>
        <button type="button" class="theme-btn ${theme === 'emerald' ? 'active' : ''}" onclick="setTheme('emerald')">Émeraude</button>
        <button type="button" class="theme-btn ${theme === 'multicolor' ? 'active' : ''}" onclick="setTheme('multicolor')">Multicolore</button>
        <button type="button" class="theme-btn ${theme === 'prestige' ? 'active' : ''}" onclick="setTheme('prestige')">Bordeaux</button>
      </div>
      <!-- Bouton Téléchargement HTML autonome -->
      <button type="button" class="btn-action" onclick="downloadSelfHtml()">
        <i class="fas fa-download"></i> <span>Enregistrer le fichier HTML</span>
      </button>
      <!-- Bouton Impression / PDF Direct -->
      <button type="button" class="btn-action btn-print" onclick="window.print()">
        <i class="fas fa-print"></i> <span>Imprimer / Sauvegarder en PDF</span>
      </button>
    </div>
  </div>

  <div class="plan-page-container">

    <!-- EN-TÊTE INSTITUTIONNEL -->
    <header class="plan-header-card">
      <div class="header-top-row">
        <div class="school-identity">
          <div class="school-emblem">
            <i class="fas fa-school"></i>
          </div>
          <div class="school-titles">
            <h1>ÉCOLE & COLLÈGE - PLAN DE TRAVAIL HEBDOMADAIRE</h1>
            <p>Année Scolaire 2025 - 2026 • Suivi Pédagogique des Écoles</p>
          </div>
        </div>
        <div class="header-badges-group">
          <span class="badge-pill badge-week"><i class="fas fa-calendar-week"></i> Semaine ${week}</span>
          <span class="badge-pill badge-class"><i class="fas fa-chalkboard-user"></i> Classe : ${escapeHtml(classe)}</span>
          <span class="badge-pill badge-section"><i class="fas fa-users"></i> ${escapeHtml(currentSectionLabel)}</span>
        </div>
      </div>

      <!-- RÉSUMÉ EN CHIFFRES -->
      <div class="summary-stats-strip">
        <div class="stat-pill">
          <div class="stat-icon-circle"><i class="fas fa-clock"></i></div>
          <div class="stat-text">
            <div class="stat-num">${totalSessions}</div>
            <div class="stat-lbl">Séances programmées</div>
          </div>
        </div>
        <div class="stat-pill">
          <div class="stat-icon-circle"><i class="fas fa-pencil-alt"></i></div>
          <div class="stat-text">
            <div class="stat-num">${totalHomework}</div>
            <div class="stat-lbl">Devoirs & Travaux</div>
          </div>
        </div>
        <div class="stat-pill">
          <div class="stat-icon-circle"><i class="fas fa-book"></i></div>
          <div class="stat-text">
            <div class="stat-num">${subjectsSet.size}</div>
            <div class="stat-lbl">Matières actives</div>
          </div>
        </div>
        <div class="stat-pill">
          <div class="stat-icon-circle"><i class="fas fa-user-tie"></i></div>
          <div class="stat-text">
            <div class="stat-num">${teachersSet.size}</div>
            <div class="stat-lbl">Enseignants</div>
          </div>
        </div>
      </div>
    </header>

    <!-- LISTE DES JOURS ET SÉANCES -->
    <main class="days-container">
      ${dayOrder.map(dayName => {
        const rows = groupedByDay[dayName] || [];
        if (rows.length === 0) return '';

        return `
        <section class="day-block-card">
          <div class="day-header-banner">
            <div class="day-name-fr">
              <i class="fas fa-calendar-day" style="color:var(--accent-color);"></i>
              <span>${dayName}</span>
            </div>
            <div class="day-name-ar">
              <span>${arabicDays[dayName] || dayName}</span>
            </div>
          </div>

          <table class="lessons-table">
            <thead>
              <tr>
                <th class="col-period">Période</th>
                <th class="col-subject">Matière</th>
                <th class="col-teacher">Enseignant</th>
                <th class="col-lesson">Leçon / Thème</th>
                <th class="col-classwork">Travaux de Classe</th>
                <th class="col-support">Support</th>
                <th class="col-homework">Devoirs à la Maison</th>
              </tr>
            </thead>
            <tbody>
              ${rows.map(row => {
                const periodeVal = row['Période'] || row['periode'] || row['Période (Heure)'] || '1';
                const horaire = formatPeriodHour(periodeVal);
                const matiere = row['Matière'] || row['matiere'] || 'Cours';
                const styleMat = getSubjectStyle(matiere);
                const enseignant = row['Enseignant'] || row['enseignant'] || '';
                
                // Photo enseignant (Google Drive convertie ou fallback)
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
                  <td class="col-period">
                    <span class="period-badge-tag">Période ${escapeHtml(periodeVal)}</span>
                    ${horaire ? `<div class="period-hour-txt">${horaire}</div>` : ''}
                  </td>
                  <td class="col-subject">
                    <span class="subject-pill" style="background:${styleMat.bg}; border-color:${styleMat.border}; color:${styleMat.text};">
                      <i class="fas ${styleMat.icon}"></i>
                      <span>${escapeHtml(matiere)}</span>
                    </span>
                  </td>
                  <td class="col-teacher">
                    <div class="teacher-badge-container">
                      ${(showPhotos && photoUrl) 
                        ? `<img src="${photoUrl}" alt="${escapeHtml(enseignant)}" class="teacher-avatar-photo" onerror="this.onerror=null; this.src='https://ui-avatars.com/api/?name=${encodeURIComponent(enseignant)}&background=2563EB&color=fff';">`
                        : `<span class="teacher-avatar-fallback">${teacherInitial}</span>`
                      }
                      <span class="teacher-name-txt">${escapeHtml(enseignant)}</span>
                    </div>
                  </td>
                  <td class="col-lesson">
                    <span class="lesson-title-strong">${escapeHtml(lecon)}</span>
                  </td>
                  <td class="col-classwork">
                    ${escapeHtml(travaux)}
                  </td>
                  <td class="col-support">
                    ${escapeHtml(support)}
                  </td>
                  <td class="col-homework">
                    ${hasHw ? `
                      <div class="homework-highlight-card">
                        <div class="homework-header-tag">
                          <i class="fas fa-pencil-alt"></i> <span>Devoir requis</span>
                        </div>
                        <div>${escapeHtml(devoirs)}</div>
                      </div>
                    ` : `
                      <span style="color:#94A3B8; font-size:0.8rem;">${escapeHtml(devoirs || '—')}</span>
                    `}
                  </td>
                </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </section>
        `;
      }).join('')}
    </main>

    <!-- NOTES ET OBSERVATIONS DE LA CLASSE -->
    ${notes && notes.trim() !== '' ? `
      <section class="class-notes-section">
        <div class="class-notes-title">
          <i class="fas fa-sticky-note"></i>
          <span>Notes & Observations importantes pour la classe</span>
        </div>
        <div class="class-notes-content">${escapeHtml(notes)}</div>
      </section>
    ` : ''}

    <!-- PIED DE PAGE INSTITUTIONNEL -->
    <footer class="plan-footer-box">
      <div>
        <div><strong>Document officiel de coordination pédagogique</strong></div>
        <div>Édité le ${printTimestamp} • Application Plans Hebdomadaires</div>
      </div>
      <div class="signature-area">
        <div style="font-weight:700; color:#334155; margin-bottom:14px;">Visa & Cachet de la Direction</div>
        <div style="height:24px;"></div>
      </div>
    </footer>

  </div>

  <script>
    function setTheme(t) {
      document.documentElement.setAttribute('data-theme', t);
      document.querySelectorAll('.theme-btn').forEach(btn => {
        btn.classList.toggle('active', btn.textContent.toLowerCase().includes(t.substring(0, 3)));
      });
    }

    function downloadSelfHtml() {
      const htmlContent = '<!DOCTYPE html>\\n' + document.documentElement.outerHTML;
      const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'Plan_Hebdomadaire_Design_S${week}_' + '${escapeHtml(classe).replace(/[^a-zA-Z0-9]/g, '_')}' + '.html';
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
  getSubjectStyle
};
