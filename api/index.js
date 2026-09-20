// api/index.js — v1, sélection dynamique du modèle, sortie JSON via prompt (sans generationConfig)

// Protection contre les chargements multiples du module (Railway/Serverless)
if (global.appInstance) {
  console.log('⚠️ Module api/index.js déjà chargé, réutilisation de l\'instance existante');
  module.exports = global.appInstance;
  return;
}

const express = require('express');
const cors = require('cors');
const fileUpload = require('express-fileupload');
const XLSX = require('xlsx');
const PizZip = require('pizzip');
const Docxtemplater = require('docxtemplater');
const fetch = require('node-fetch');
const { MongoClient } = require('mongodb');
const archiver = require('archiver');
const webpush = require('web-push');
const path = require('path');
const moment = require('moment');
const crypto = require('crypto');
let GoogleGenAI;
try {
  GoogleGenAI = require('@google/genai').GoogleGenAI;
} catch (e) {
  GoogleGenAI = null;
}
const { generateDesignPlanHtml } = require(path.join(__dirname, '../design_plan_generator'));
// ========================================================================
// ====================== AIDES POUR GÉNÉRATION WORD ======================
// ========================================================================

const xmlEscape = (str) => {
  if (typeof str !== 'string') return '';
  return str.replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
};

const containsArabic = (text) => {
  if (typeof text !== 'string') return false;
  const arabicRegex = /[\u0600-\u06FF]/;
  return arabicRegex.test(text);
};

const formatTextForWord = (text, options = {}) => {
  if (!text || typeof text !== 'string' || text.trim() === '') {
    return '<w:p/>';
  }
  
  // Nettoyer le texte : supprimer les espaces/sauts de ligne avant et après
  const cleanedText = text.trim();
  
  const { color, italic } = options;
  const runPropertiesParts = [];
  runPropertiesParts.push('<w:sz w:val="22"/><w:szCs w:val="22"/>');
  if (color) runPropertiesParts.push(`<w:color w:val="${color}"/>`);
  if (italic) runPropertiesParts.push('<w:i/><w:iCs w:val="true"/>');

  let paragraphProperties = '';
  if (containsArabic(cleanedText)) {
    // Pour le texte arabe : RTL + centré
    paragraphProperties = '<w:pPr><w:bidi/><w:jc w:val="center"/></w:pPr>';
    runPropertiesParts.push('<w:rtl/>');
  }

  const runProperties = `<w:rPr>${runPropertiesParts.join('')}</w:rPr>`;
  
  // Conserver uniquement les sauts de ligne intentionnels de l'enseignant
  const lines = cleanedText.split(/\r\n|\n|\r/);
  const content = lines
    .map(line => `<w:t xml:space="preserve">${xmlEscape(line)}</w:t>`)
    .join('<w:br/>');
  return `<w:p>${paragraphProperties}<w:r>${runProperties}${content}</w:r></w:p>`;
};

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(fileUpload());
// --- CONFIGURATION POUR LE FRONTEND ---
// On définit le chemin vers le dossier public (qui est un dossier parent à 'api')
const publicPath = path.join(__dirname, '..', 'public');

// 1. On dit à Express de rendre accessibles les fichiers statiques (CSS, JS, Images)
app.use(express.static(publicPath));

// 2. Route pour la page d'accueil (Health Check de Railway)
app.get('/', (req, res) => {
  res.sendFile(path.join(publicPath, 'index.html'));
});

// 3. Route de secours pour le diagnostic (optionnel)
app.get('/diagnostic', (req, res) => {
  res.sendFile(path.join(publicPath, 'diagnostic.html'));
});
// --------------------------------------
const MONGO_URL = process.env.MONGO_URL;
const WORD_TEMPLATE_URL = process.env.WORD_TEMPLATE_URL;
const LESSON_TEMPLATE_URL = process.env.LESSON_TEMPLATE_URL;

// ========================================================================
// GENERATEURS DE SYSTEME DE SECOURS POUR TEMPLATES WORD (DOCX)
// ========================================================================
function createDefaultLessonTemplateZip() {
  const zip = new PizZip();
  
  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>`);

  zip.file('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`);

  zip.file('word/_rels/document.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`);

  zip.file('word/styles.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docDefaults>
    <w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr></w:rDefault>
  </w:docDefaults>
</w:styles>`);

  zip.file('word/document.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="34"/><w:color w:val="1E3A8A"/></w:rPr><w:t>FICHE DE PRÉPARATION DE LEÇON</w:t></w:r></w:p>
    <w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="26"/><w:color w:val="2563EB"/></w:rPr><w:t>{Matiere} - {Classe}</w:t></w:r></w:p>
    <w:p><w:r><w:t>Enseignant : {NomEnseignant} | Semaine : {Semaine} | Séance : {Seance} | Date : {Jour} {Date}</w:t></w:r></w:p>
    <w:p><w:r><w:rPr><w:b/><w:sz w:val="24"/><w:color w:val="1E293B"/></w:rPr><w:t>Titre du cours / Leçon : </w:t></w:r><w:r><w:t>{Lecon}</w:t></w:r></w:p>
    <w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Unité pédagogique : </w:t></w:r><w:r><w:t>{TitreUnite}</w:t></w:r></w:p>
    <w:p><w:pPr><w:spacing w:before="140"/></w:pPr><w:r><w:rPr><w:b/><w:color w:val="1D4ED8"/></w:rPr><w:t>🎯 Objectifs d'apprentissage :</w:t></w:r></w:p>
    <w:p><w:r><w:t>{Objectifs}</w:t></w:r></w:p>
    <w:p><w:pPr><w:spacing w:before="140"/></w:pPr><w:r><w:rPr><w:b/><w:color w:val="1D4ED8"/></w:rPr><w:t>🛠 Méthodes &amp; Outils :</w:t></w:r></w:p>
    <w:p><w:r><w:t>Méthodes : {Methodes}</w:t></w:r></w:p>
    <w:p><w:r><w:t>Outils &amp; Matériel : {Outils}</w:t></w:r></w:p>
    <w:p><w:pPr><w:spacing w:before="140"/></w:pPr><w:r><w:rPr><w:b/><w:color w:val="1D4ED8"/></w:rPr><w:t>⏱ Déroulement de la séance :</w:t></w:r></w:p>
    <w:p><w:r><w:t>{Contenu}</w:t></w:r></w:p>
    <w:p><w:pPr><w:spacing w:before="140"/></w:pPr><w:r><w:rPr><w:b/><w:color w:val="1D4ED8"/></w:rPr><w:t>📚 Ressources pédagogiques :</w:t></w:r></w:p>
    <w:p><w:r><w:t>{Ressources}</w:t></w:r></w:p>
    <w:p><w:pPr><w:spacing w:before="140"/></w:pPr><w:r><w:rPr><w:b/><w:color w:val="1D4ED8"/></w:rPr><w:t>📝 Devoirs à la maison :</w:t></w:r></w:p>
    <w:p><w:r><w:t>{Devoirs}</w:t></w:r></w:p>
    <w:p><w:pPr><w:spacing w:before="140"/></w:pPr><w:r><w:rPr><w:b/><w:color w:val="1D4ED8"/></w:rPr><w:t>🌟 Différenciation pédagogique :</w:t></w:r></w:p>
    <w:p><w:r><w:rPr><w:b/></w:rPr><w:t>• Soutien &amp; Remédiation : </w:t></w:r><w:r><w:t>{DiffLents}</w:t></w:r></w:p>
    <w:p><w:r><w:rPr><w:b/></w:rPr><w:t>• Approfondissement : </w:t></w:r><w:r><w:t>{DiffTresPerf}</w:t></w:r></w:p>
    <w:p><w:r><w:rPr><w:b/></w:rPr><w:t>• Démarche collective : </w:t></w:r><w:r><w:t>{DiffTous}</w:t></w:r></w:p>
  </w:body>
</w:document>`);

  return zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
}

/**
 * Générateur pédagogique intégré de secours (Ultra-résilient)
 * Produit un plan de leçon complet et structuré si le service IA (Gemini/Groq) est indisponible ou hors quota.
 */
function generatePedagogicalFallbackData(matiere, classe, lecon, enseignant, travaux, support, devoirsPrevus) {
  const lang = typeof detectLessonLanguage === 'function' 
    ? detectLessonLanguage(enseignant, matiere, lecon, travaux) 
    : (/[\u0600-\u06FF]/.test(`${enseignant || ''} ${matiere || ''} ${lecon || ''}`) ? 'ar' : 'fr');
  const isEn = lang === 'en';
  const isAr = lang === 'ar';
  const topic = lecon && String(lecon).trim().length > 1 && lecon !== '-' ? String(lecon).trim() : `${matiere || 'Séance de cours'}`;

  if (isEn) {
    return {
      TitreUnite: `Unit: ${matiere || 'Course Unit'} - ${topic}`,
      Methodes: "Active learning, guided practice, formative feedback, differentiated instruction",
      Outils: support && support !== 'Non spécifié' ? support : "Textbook, worksheets, board, multimedia projector",
      Objectifs: `- Master the fundamental principles and key concepts of: ${topic}\n- Apply core knowledge through targeted classroom exercises on "${topic}"\n- Demonstrate autonomous reasoning and analytical problem solving`,
      etapes: [
        { phase: "Introduction & Hook", duree: "5 min", activite: `Review prior concepts, present the learning intentions, and engage students with an opening hook on "${topic}".` },
        { phase: "Guided Practice & Core Activity", duree: "25 min", activite: `Interactive instruction and concept development focusing specifically on "${topic}". Classroom tasks: ${travaux && travaux !== 'Non spécifié' ? travaux : `Targeted exercises on ${topic}`}. Materials: ${support && support !== 'Non spécifié' ? support : 'Curriculum resources'}.` },
        { phase: "Synthesis & Formative Assessment", duree: "10 min", activite: `Consolidate key learnings on "${topic}", review student solutions, and clarify misconceptions.` },
        { phase: "Wrap-up & Homework", duree: "5 min", activite: `Summarize the lesson outcomes on "${topic}" and assign homework: ${devoirsPrevus && devoirsPrevus !== 'Non spécifié' ? devoirsPrevus : `Consolidation exercises on ${topic}`}.` }
      ],
      Ressources: support && support !== 'Non spécifié' ? support : "Curriculum textbook, guided notes, educational handouts",
      Devoirs: devoirsPrevus && devoirsPrevus !== 'Non spécifié' ? devoirsPrevus : `Consolidation exercises on ${topic}`,
      DiffLents: "Step-by-step scaffolding, visual aids, and one-on-one guided prompts",
      DiffTresPerf: "Challenging application problems and peer-tutoring leadership",
      DiffTous: "Multi-modal presentation and regular understanding checks"
    };
  } else if (isAr) {
    return {
      TitreUnite: `الوحدة: ${matiere || 'المادة الدراسية'} - ${topic}`,
      Methodes: "التعلم النشط، الممارسة الموجهة، التمايز البيداغوجي، الحوار والمناقشة",
      Outils: support && support !== 'Non spécifié' ? support : "الكتاب المدرسي، السبورة، أوراق العمل، الوسائل التعليمية",
      Objectifs: `- استيعاب وفهم المفاهيم الأساسية الخاصة بدرس: ${topic}\n- تطبيق المعارف المكتسبة عبر أنشطة صفية وتمارين موجهة في موضوع: ${topic}\n- تنمية التفكير التحليلي والقدرة على الاستنتاج الذاتي والتطبيق السليم`,
      etapes: [
        { phase: "التهيئة والتمهيد", duree: "5 دقائق", activite: `مراجعة المكتسبات السابقة، إثارة دافعية التلاميذ، وإعلان أهداف الدرس: "${topic}".` },
        { phase: "بناء التعلمات والنشاط الرئيسي", duree: "25 دقيقة", activite: `الشرح التفاعلي وبناء المفاهيم المحددة في درس "${topic}". أعمال الصف المبرمجة: ${travaux && travaux !== 'Non spécifié' ? travaux : `تمارين وتطبيقات حول ${topic}`}. الاعتماد على السند: ${support && support !== 'Non spécifié' ? support : 'المعينات التربوية المعتمدة'}.` },
        { phase: "التقويم التكويني والتركيب", duree: "10 دقائق", activite: `مناقشة الحلول المتعلقة بدرس "${topic}"، رصد الثغرات وتصحيح الأخطاء الشائعة، وتركيب خلاصة الدرس.` },
        { phase: "الخاتمة وتكليف الواجبات", duree: "5 دقائق", activite: `تأكيد المفاهيم الأساسية لدرس "${topic}" وتوجيه التلاميذ للواجبات المنزلية: ${devoirsPrevus && devoirsPrevus !== 'Non spécifié' ? devoirsPrevus : `تمارين التثبيت المنزلي لدرس ${topic}`}.` }
      ],
      Ressources: support && support !== 'Non spécifié' ? support : "الكتاب المدرسي المعتمد، المذكرات البيداغوجية، بطاقات الأنشطة",
      Devoirs: devoirsPrevus && devoirsPrevus !== 'Non spécifié' ? devoirsPrevus : `إنجاز تمارين تطبيقية في موضوع ${topic}`,
      DiffLents: "دعم فردي موجه، تبسيط التعليمات وتقديم أمثلة إرشادية خطوة بخطوة",
      DiffTresPerf: "تمارين إثرائية متقدمة ومسائل مفتوحة لتحفيز التفكير الإبداعي",
      DiffTous: "تنويع أساليب العرض والتفاعل ومراعاة وتيرة التعلم لجميع المتعلمين"
    };
  } else {
    return {
      TitreUnite: `Unité : ${matiere || 'Discipline'} - ${topic}`,
      Methodes: "Pédagogie active, démarche explicite, pratique guidée puis autonome, différenciation",
      Outils: support && support !== 'Non spécifié' ? support : "Manuel scolaire, tableau interactif/feutre, fiches d'exercices",
      Objectifs: `- Comprendre et assimiler les notions clés du thème spécifique : ${topic}\n- Réinvestir les savoirs et compétences acquis dans des exercices ciblés sur « ${topic} »\n- Développer l'esprit d'analyse et l'autonomie méthodologique des élèves`,
      etapes: [
        { phase: "Introduction & Accroche", duree: "5 min", activite: `Rappel des prérequis pertinents, mise en situation motivante et formulation claire des objectifs d'apprentissage sur « ${topic} ».` },
        { phase: "Activité Principale & Entraînement", duree: "25 min", activite: `Explicitation et approfondissement du thème « ${topic} ». Mise en œuvre des travaux de classe : ${travaux && travaux !== 'Non spécifié' ? travaux : `exercices et recherche sur ${topic}`}. Exploitation du support : ${support && support !== 'Non spécifié' ? support : 'documents et manuel scolaire'}.` },
        { phase: "Synthèse & Évaluation formative", duree: "10 min", activite: `Mise en commun des productions des élèves sur « ${topic} », institutionnalisation des notions clés et remédiation des erreurs récurrentes.` },
        { phase: "Clôture & Devoirs", duree: "5 min", activite: `Bilan récapitulatif de la séance consacrée à « ${topic} » et consignes de travail personnel : ${devoirsPrevus && devoirsPrevus !== 'Non spécifié' ? devoirsPrevus : `exercices d'application sur ${topic}`}.` }
      ],
      Ressources: support && support !== 'Non spécifié' ? support : "Manuel officiel, fiches pédagogiques, ressources documentaires",
      Devoirs: devoirsPrevus && devoirsPrevus !== 'Non spécifié' ? devoirsPrevus : `Consolidation et exercices d'application sur ${topic}`,
      DiffLents: "Étayage progressif, consignes simplifiées, exemples repères et accompagnement ciblé",
      DiffTresPerf: "Activités d'approfondissement, défis de réflexion et rôle de tuteur d'équipe",
      DiffTous: "Modalités d'apprentissage variées (individuel, binôme) et progression par paliers"
    };
  }
}

function createDefaultWordTemplateZip() {
  const zip = new PizZip();
  
  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`);

  zip.file('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`);

  zip.file('word/_rels/document.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
</Relationships>`);

  zip.file('word/document.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:rPr><w:b/><w:sz w:val="32"/></w:rPr><w:t>PLAN HEBDOMADAIRE - CLASSE {classe}</w:t></w:r></w:p>
    <w:p><w:r><w:t>Semaine {semaine} ({plageSemaine})</w:t></w:r></w:p>
    <w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Remarques générales / Notes :</w:t></w:r></w:p>
    <w:p><w:r><w:t>{notes}</w:t></w:r></w:p>
    {#jours}
    <w:p><w:r><w:rPr><w:b/><w:color w:val="2563EB"/></w:rPr><w:t>Jour : {jourDateComplete}</w:t></w:r></w:p>
    {#matieres}
    <w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Matière : {matiere}</w:t></w:r></w:p>
    <w:p><w:r><w:t>Leçon : {Lecon}</w:t></w:r></w:p>
    <w:p><w:r><w:t>Travail de classe : {travailDeClasse}</w:t></w:r></w:p>
    <w:p><w:r><w:t>Support : {Support}</w:t></w:r></w:p>
    <w:p><w:r><w:t>Devoirs : {devoirs}</w:t></w:r></w:p>
    {/matieres}
    {/jours}
  </w:body>
</w:document>`);

  return zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
}

async function getLessonTemplateBuffer() {
  const url = process.env.LESSON_TEMPLATE_URL || LESSON_TEMPLATE_URL;
  if (url && typeof url === 'string' && url.trim().startsWith('http')) {
    try {
      console.log(`📡 Téléchargement modèle leçon depuis: ${url}`);
      const resp = await fetch(url);
      if (resp.ok) {
        const buf = Buffer.from(await resp.arrayBuffer());
        if (buf && buf.length > 100) return buf;
      }
      console.warn(`⚠️ Téléchargement modèle leçon échoué (HTTP ${resp.status}), utilisation du modèle intégré de secours.`);
    } catch (err) {
      console.warn(`⚠️ Exception téléchargement modèle leçon: ${err.message}, utilisation du modèle intégré.`);
    }
  }
  return createDefaultLessonTemplateZip();
}

async function getWordTemplateBuffer() {
  const url = process.env.WORD_TEMPLATE_URL || WORD_TEMPLATE_URL;
  if (url && typeof url === 'string' && url.trim().startsWith('http')) {
    try {
      console.log(`📡 Téléchargement modèle hebdo depuis: ${url}`);
      const resp = await fetch(url);
      if (resp.ok) {
        const buf = Buffer.from(await resp.arrayBuffer());
        if (buf && buf.length > 100) return buf;
      }
      console.warn(`⚠️ Téléchargement modèle hebdo échoué (HTTP ${resp.status}), utilisation du modèle intégré de secours.`);
    } catch (err) {
      console.warn(`⚠️ Exception téléchargement modèle hebdo: ${err.message}, utilisation du modèle intégré.`);
    }
  }
  return createDefaultWordTemplateZip();
}

// Configuration IA Providers (GROQ et GEMINI)
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const USE_GROQ = GROQ_API_KEY ? true : false;
const AI_API_KEY = USE_GROQ ? GROQ_API_KEY : GEMINI_API_KEY;

// Configuration Web Push (VAPID)
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || 'BDuAoL4lagqZmYl4BPdCFYBwRhoqGMrcWUFAbF1pMBWq2e0JOV6fL_WitURlXXhXTROGB2vYpnvgSDZfAoZq0Jo';
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || 'TVK1zF6o5s-SK3OQnGCMgu4KZCNxg3py4YA4sMqtItg';
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:admin@plan-hebdomadaire.com';

// Configuration de web-push avec les clés VAPID
if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    VAPID_SUBJECT,
    VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY
  );
  console.log('✅ Web Push VAPID configuré');
} else {
  console.warn('⚠️ Clés VAPID manquantes - notifications push désactivées');
}

const arabicTeachers = ['Majed', 'Jaber', 'Imad', 'Saeed'];
const englishTeachers = ['Kamel'];

const maleTeachers = [
  'Mohamed', 'Abas', 'Jaber', 'Imad', 'Kamel', 'Majed', 'Mohamed Ali', 'Morched', 
  'Saeed', 'Sami', 'Sylvano', 'Tonga', 'Oumarou', 'Zine', 'Youssouf'
];

const femaleTeachers = [
  'Amina', 'Fatima', 'Khadija', 'Mariam', 'Salma', 'Zainab', 'Nour', 'Houda', 
  'Leila', 'Sarah', 'Zohra', 'Farah', 'Music', 'Musique', 'Amal', 'Amal Arabe'
];

const primaireTeachers = [
  'Nadia', 'Samira', 'Imane', 'Fatima Zahra', 'Mouna', 'Siham', 'Hajar', 'Meriem', 
  'Salma P', 'Khadija P', 'Aicha', 'Hanane', 'Farah', 'Music', 'Musique', 'Amal'
];

const isMusicTeacher = (name) => {
  if (!name) return false;
  const n = String(name).trim().toLowerCase();
  return n === 'farah' || n.includes('farah') || n === 'music' || n === 'musique' || n.includes('music') || n.includes('musique');
};

const isAmalArabeTeacher = (name) => {
  if (!name) return false;
  const n = String(name).trim().toLowerCase();
  return (n.includes('amal') || n.startsWith('amal')) && (n.includes('arabe') || n.includes('arab') || n.includes('عرب'));
};

const isAmalSoleTeacher = (name) => {
  if (!name) return false;
  const n = String(name).trim().toLowerCase();
  if (isAmalArabeTeacher(n)) return false;
  return n.includes('amal') || n.startsWith('amal');
};

function detectLessonLanguage(enseignant, matiere, lecon, travaux) {
  const text = `${enseignant || ''} ${matiere || ''} ${lecon || ''} ${travaux || ''}`;
  // 1. Détection arabe par caractères arabes ou matières d'arabe/islam/coran
  const isArabicChar = /[\u0600-\u06FF]/.test(text);
  const isArabicSubject = /arabe|islam|coran|tarbiya|tawhid|hadith|fiqh|sirah|tajweed|عربي|اسلام|قرآن|تربية|توحيد|فقه|حديث|سيرة/i.test(matiere || '');
  const isArabicTeacher = (Array.isArray(arabicTeachers) && arabicTeachers.some(t => String(enseignant || '').toLowerCase().includes(t.toLowerCase()))) || isAmalArabeTeacher(enseignant);
  if (isArabicChar || isArabicSubject || isArabicTeacher) {
    return 'ar';
  }

  // 2. Détection anglais par matière ou enseignant
  const isEnglishSubject = /anglais|english|esl/i.test(matiere || '');
  const isEnglishTeacher = Array.isArray(englishTeachers) && englishTeachers.some(t => String(enseignant || '').toLowerCase().includes(t.toLowerCase()));
  if (isEnglishSubject || isEnglishTeacher) {
    return 'en';
  }

  return 'fr';
}

const isDualSectionTeacher = (name) => {
  if (!name) return false;
  return isMusicTeacher(name) || isAmalSoleTeacher(name);
};

const isDualMusicTeacher = isDualSectionTeacher;

const defaultWeeksConfig = {
  1: { title: "Semaine 1", titleAr: "الأسبوع 1", start: "2026-08-30", end: "2026-09-03" },
  2: { title: "Semaine 2", titleAr: "الأسبوع 2", start: "2026-09-06", end: "2026-09-10" },
  3: { title: "Semaine 3", titleAr: "الأسبوع 3", start: "2026-09-13", end: "2026-09-17" },
  4: { title: "Semaine 4", titleAr: "الأسبوع 4", start: "2026-09-20", end: "2026-09-24" },
  5: { title: "Semaine 5", titleAr: "الأسبوع 5", start: "2026-09-27", end: "2026-10-01" },
  6: { title: "Semaine 6", titleAr: "الأسبوع 6", start: "2026-10-04", end: "2026-10-08" },
  7: { title: "Semaine 7", titleAr: "الأسبوع 7", start: "2026-10-11", end: "2026-10-15" },
  8: { title: "Semaine 8", titleAr: "الأسبوع 8", start: "2026-10-18", end: "2026-10-22" },
  9: { title: "Semaine 9", titleAr: "الأسبوع 9", start: "2026-10-25", end: "2026-10-29" },
  10: { title: "Semaine 10", titleAr: "الأسبوع 10", start: "2026-11-01", end: "2026-11-05" },
  11: { title: "Semaine 11", titleAr: "الأسبوع 11", start: "2026-11-08", end: "2026-11-12" },
  12: { title: "Semaine 12", titleAr: "الأسبوع 12", start: "2026-11-15", end: "2026-11-19" },
  13: { title: "Semaine 13", titleAr: "الأسبوع 13", start: "2026-11-29", end: "2026-12-03" },
  14: { title: "Semaine 14", titleAr: "الأسبوع 14", start: "2026-12-06", end: "2026-12-10" },
  15: { title: "Semaine 15", titleAr: "الأسبوع 15", start: "2026-12-13", end: "2026-12-17" },
  16: { title: "Semaine 16", titleAr: "الأسبوع 16", start: "2026-12-20", end: "2026-12-24" },
  17: { title: "Semaine 17", titleAr: "الأسبوع 17", start: "2026-12-27", end: "2026-12-31" },
  18: { title: "Semaine 18", titleAr: "الأسبوع 18", start: "2027-01-03", end: "2027-01-07" },
  19: { title: "Semaine 19", titleAr: "الأسبوع 19", start: "2027-01-17", end: "2027-01-21" },
  20: { title: "Semaine 20", titleAr: "الأسبوع 20", start: "2027-01-24", end: "2027-01-28" },
  21: { title: "Semaine 21", titleAr: "الأسبوع 21", start: "2027-01-31", end: "2027-02-04" },
  22: { title: "Semaine 22", titleAr: "الأسبوع 22", start: "2027-02-07", end: "2027-02-11" },
  23: { title: "Semaine 23", titleAr: "الأسبوع 23", start: "2027-02-14", end: "2027-02-18" },
  24: { title: "Semaine 24", titleAr: "الأسبوع 24", start: "2027-02-21", end: "2027-02-25" },
  25: { title: "Semaine 25", titleAr: "الأسبوع 25", start: "2027-03-14", end: "2027-03-18" },
  26: { title: "Semaine 26", titleAr: "الأسبوع 26", start: "2027-03-21", end: "2027-03-25" },
  27: { title: "Semaine 27", titleAr: "الأسبوع 27", start: "2027-03-28", end: "2027-04-01" },
  28: { title: "Semaine 28", titleAr: "الأسبوع 28", start: "2027-04-04", end: "2027-04-08" },
  29: { title: "Semaine 29", titleAr: "الأسبوع 29", start: "2027-04-11", end: "2027-04-15" },
  30: { title: "Semaine 30", titleAr: "الأسبوع 30", start: "2027-04-18", end: "2027-04-22" },
  31: { title: "Semaine 31", titleAr: "الأسبوع 31", start: "2027-04-25", end: "2027-04-29" },
  32: { title: "Semaine 32", titleAr: "الأسبوع 32", start: "2027-05-02", end: "2027-05-06" },
  33: { title: "Semaine 33", titleAr: "الأسبوع 33", start: "2027-05-23", end: "2027-05-27" },
  34: { title: "Semaine 34", titleAr: "الأسبوع 34", start: "2027-05-30", end: "2027-06-03" },
  35: { title: "Semaine 35", titleAr: "الأسبوع 35", start: "2027-06-06", end: "2027-06-10" },
  36: { title: "Semaine 36", titleAr: "الأسبوع 36", start: "2027-06-13", end: "2027-06-17" },
  37: { title: "Semaine 37", titleAr: "الأسبوع 37", start: "2027-06-20", end: "2027-06-24" },
  38: { title: "Semaine 38", titleAr: "الأسبوع 38", start: "2027-06-27", end: "2027-06-30" }
};

const specificWeekDateRangesNode = {};
for (const [wNum, wData] of Object.entries(defaultWeeksConfig)) {
  specificWeekDateRangesNode[wNum] = { start: wData.start, end: wData.end };
}

const validUsers = {
  // Garçons
  "Mohamed": "Mohamed", "Abas": "Abas", "Jaber": "Jaber", "Imad": "Imad", "Kamel": "Kamel",
  "Majed": "Majed", "Mohamed Ali": "Mohamed Ali", "Morched": "Morched",
  "Saeed": "Saeed", "Sami": "Sami", "Sylvano": "Sylvano", "Tonga": "Tonga", "Oumarou": "Oumarou", "Zine": "Zine", "Youssouf": "Youssouf",
  // Filles
  "Amina": "Amina", "Fatima": "Fatima", "Khadija": "Khadija", "Mariam": "Mariam",
  "Salma": "Salma", "Zainab": "Zainab", "Nour": "Nour", "Houda": "Houda",
  "Leila": "Leila", "Sarah": "Sarah", "Zohra": "Zohra",
  // Enseignantes multi-sections (Filles & Primaire/Maternelle)
  "Farah": "Farah", "farah": "farah", "Music": "Music", "Musique": "Musique", "music": "music", "musique": "musique",
  "Amal": "Amal", "amal": "amal", "Amal Arabe": "Amal Arabe", "amal arabe": "amal arabe",
  // Primaire & Maternelle
  "Nadia": "Nadia", "Samira": "Samira", "Imane": "Imane", "Fatima Zahra": "Fatima Zahra",
  "Mouna": "Mouna", "Siham": "Siham", "Hajar": "Hajar", "Meriem": "Meriem",
  "Salma P": "Salma P", "Khadija P": "Khadija P", "Aicha": "Aicha", "Hanane": "Hanane"
};

let cachedDb = null;

class InMemoryCollection {
  constructor(name) {
    this.name = name;
    this.items = [];
  }

  async findOne(query) {
    if (!query) return this.items[0] || null;
    return this.items.find(item => this._matches(item, query)) || null;
  }

  find(query = {}, options = {}) {
    let result = this.items.filter(item => this._matches(item, query));
    let sortObj = null;
    let limitCount = null;
    let skipCount = 0;
    const cursor = {
      sort: (s) => {
        sortObj = s;
        return cursor;
      },
      limit: (n) => {
        limitCount = n;
        return cursor;
      },
      skip: (n) => {
        skipCount = n;
        return cursor;
      },
      project: () => cursor,
      projection: () => cursor,
      toArray: async () => {
        let res = [...result];
        if (sortObj && typeof sortObj === 'object') {
          const entries = Object.entries(sortObj);
          if (entries.length > 0) {
            res.sort((a, b) => {
              for (const [key, dir] of entries) {
                const valA = a ? a[key] : undefined;
                const valB = b ? b[key] : undefined;
                if (valA === valB) continue;
                if (valA === undefined) return 1;
                if (valB === undefined) return -1;
                const comparison = valA > valB ? 1 : -1;
                return (dir === -1 || dir === 'desc') ? -comparison : comparison;
              }
              return 0;
            });
          }
        }
        if (skipCount > 0) res = res.slice(skipCount);
        if (typeof limitCount === 'number') res = res.slice(0, limitCount);
        return res;
      },
    };
    return cursor;
  }

  async insertOne(doc) {
    const newItem = { _id: doc._id || String(Date.now()) + Math.random().toString(36).substr(2, 5), ...doc };
    this.items.push(newItem);
    return { acknowledged: true, insertedId: newItem._id };
  }

  async insertMany(docs) {
    const insertedIds = {};
    docs.forEach((doc, idx) => {
      const newItem = { _id: doc._id || String(Date.now()) + idx, ...doc };
      this.items.push(newItem);
      insertedIds[idx] = newItem._id;
    });
    return { acknowledged: true, insertedIds };
  }

  _setDeep(obj, path, value) {
    if (!path.includes('.')) {
      obj[path] = value;
      return;
    }
    const parts = path.split('.');
    let curr = obj;
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (curr[part] === undefined || curr[part] === null || typeof curr[part] !== 'object') {
        curr[part] = {};
      }
      curr = curr[part];
    }
    curr[parts[parts.length - 1]] = value;
  }

  async updateOne(filter, update, options = {}) {
    let index = this.items.findIndex(item => this._matches(item, filter));
    if (index >= 0) {
      if (update.$set) {
        for (const [k, v] of Object.entries(update.$set)) {
          this._setDeep(this.items[index], k, v);
        }
      }
      if (update.$inc) {
        for (const [k, v] of Object.entries(update.$inc)) {
          const curr = this._getValueByPath(this.items[index], k) || 0;
          this._setDeep(this.items[index], k, curr + v);
        }
      }
      return { modifiedCount: 1, matchedCount: 1 };
    } else if (options.upsert) {
      const newItem = { _id: filter._id || filter.endpoint || filter.week || String(Date.now()) };
      if (update.$setOnInsert) {
        for (const [k, v] of Object.entries(update.$setOnInsert)) {
          this._setDeep(newItem, k, v);
        }
      }
      if (update.$set) {
        for (const [k, v] of Object.entries(update.$set)) {
          this._setDeep(newItem, k, v);
        }
      }
      this.items.push(newItem);
      return { modifiedCount: 0, matchedCount: 0, upsertedCount: 1 };
    }
    return { modifiedCount: 0, matchedCount: 0 };
  }

  async updateMany(filter, update) {
    let count = 0;
    this.items.forEach(item => {
      if (this._matches(item, filter)) {
        if (update.$set) {
          for (const [k, v] of Object.entries(update.$set)) {
            this._setDeep(item, k, v);
          }
        }
        if (update.$inc) {
          for (const [k, v] of Object.entries(update.$inc)) {
            const curr = this._getValueByPath(item, k) || 0;
            this._setDeep(item, k, curr + v);
          }
        }
        count++;
      }
    });
    return { modifiedCount: count, matchedCount: count };
  }

  async deleteOne(filter) {
    const index = this.items.findIndex(item => this._matches(item, filter));
    if (index >= 0) {
      this.items.splice(index, 1);
      return { deletedCount: 1 };
    }
    return { deletedCount: 0 };
  }

  async deleteMany(filter) {
    const initialLen = this.items.length;
    this.items = this.items.filter(item => !this._matches(item, filter));
    return { deletedCount: initialLen - this.items.length };
  }

  async bulkWrite(operations) {
    if (!Array.isArray(operations)) return { ok: 1 };
    for (const op of operations) {
      if (op.updateOne) {
        await this.updateOne(op.updateOne.filter, op.updateOne.update, { upsert: op.updateOne.upsert });
      } else if (op.insertOne) {
        await this.insertOne(op.insertOne.document);
      } else if (op.deleteOne) {
        await this.deleteOne(op.deleteOne.filter);
      }
    }
    return { ok: 1 };
  }

  async countDocuments(query = {}) {
    return this.items.filter(item => this._matches(item, query)).length;
  }

  async distinct(field, query = {}) {
    const matched = this.items.filter(item => this._matches(item, query));
    const set = new Set();
    matched.forEach(item => {
      const val = this._getValueByPath(item, field);
      if (Array.isArray(val)) {
        val.forEach(v => {
          if (v !== undefined && v !== null && v !== '') set.add(v);
        });
      } else if (val !== undefined && val !== null && val !== '') {
        set.add(val);
      }
    });
    return Array.from(set);
  }

  async createIndex() { return 'ok'; }
  async dropIndex() { return 'ok'; }

  _getValueByPath(obj, keyPath) {
    if (!obj || typeof obj !== 'object') return undefined;
    if (keyPath in obj) return obj[keyPath];
    const parts = keyPath.split('.');
    let curr = obj;
    for (let i = 0; i < parts.length; i++) {
      if (curr === null || curr === undefined) return undefined;
      const part = parts[i];
      if (Array.isArray(curr)) {
        const remaining = parts.slice(i).join('.');
        return curr.map(item => this._getValueByPath(item, remaining)).flat();
      }
      curr = curr[part];
    }
    return curr;
  }

  _matches(item, query) {
    if (!query || typeof query !== 'object' || Object.keys(query).length === 0) return true;
    for (const key of Object.keys(query)) {
      if (key === '$or') {
        if (!Array.isArray(query.$or)) return false;
        const matchedOr = query.$or.some(subQuery => this._matches(item, subQuery));
        if (!matchedOr) return false;
        continue;
      }
      if (key === '$and') {
        if (!Array.isArray(query.$and)) return false;
        const matchedAnd = query.$and.every(subQuery => this._matches(item, subQuery));
        if (!matchedAnd) return false;
        continue;
      }

      const qVal = query[key];
      const iVal = this._getValueByPath(item, key);

      if (qVal instanceof RegExp) {
        if (!qVal.test(String(iVal ?? ''))) return false;
      } else if (qVal && typeof qVal === 'object' && !Array.isArray(qVal) && !(qVal instanceof Date)) {
        if (qVal.$exists !== undefined) {
          const exists = iVal !== undefined;
          if (exists !== Boolean(qVal.$exists)) return false;
        }
        if (qVal.$regex !== undefined) {
          const reg = qVal.$regex instanceof RegExp ? qVal.$regex : new RegExp(qVal.$regex, qVal.$options || 'i');
          if (!reg.test(String(iVal ?? ''))) return false;
        }
        if (qVal.$in && Array.isArray(qVal.$in)) {
          const inMatches = Array.isArray(iVal)
            ? iVal.some(v => qVal.$in.some(target => String(target) === String(v)))
            : qVal.$in.some(target => String(target) === String(iVal));
          if (!inMatches) return false;
        }
        if (qVal.$nin && Array.isArray(qVal.$nin)) {
          const ninMatches = Array.isArray(iVal)
            ? iVal.every(v => !qVal.$nin.some(target => String(target) === String(v)))
            : !qVal.$nin.some(target => String(target) === String(iVal));
          if (!ninMatches) return false;
        }
        if (qVal.$ne !== undefined) {
          if (String(iVal) === String(qVal.$ne)) return false;
        }
        if (qVal.$gt !== undefined) {
          const compA = iVal instanceof Date ? iVal.getTime() : iVal;
          const compB = qVal.$gt instanceof Date ? qVal.$gt.getTime() : qVal.$gt;
          if (!(compA > compB)) return false;
        }
        if (qVal.$gte !== undefined) {
          const compA = iVal instanceof Date ? iVal.getTime() : iVal;
          const compB = qVal.$gte instanceof Date ? qVal.$gte.getTime() : qVal.$gte;
          if (!(compA >= compB)) return false;
        }
        if (qVal.$lt !== undefined) {
          const compA = iVal instanceof Date ? iVal.getTime() : iVal;
          const compB = qVal.$lt instanceof Date ? qVal.$lt.getTime() : qVal.$lt;
          if (!(compA < compB)) return false;
        }
        if (qVal.$lte !== undefined) {
          const compA = iVal instanceof Date ? iVal.getTime() : iVal;
          const compB = qVal.$lte instanceof Date ? qVal.$lte.getTime() : qVal.$lte;
          if (!(compA <= compB)) return false;
        }
      } else {
        if (Array.isArray(iVal)) {
          if (!iVal.some(val => String(val) === String(qVal))) return false;
        } else if (qVal instanceof Date && iVal instanceof Date) {
          if (qVal.getTime() !== iVal.getTime()) return false;
        } else if (key === '_id' || (qVal && typeof qVal === 'object' && typeof qVal.toString === 'function')) {
          if (String(iVal) !== String(qVal)) return false;
        } else {
          if (iVal !== qVal && String(iVal) !== String(qVal)) return false;
        }
      }
    }
    return true;
  }
}

class InMemoryDb {
  constructor() {
    this.collections = new Map();
  }

  collection(name) {
    if (!this.collections.has(name)) {
      this.collections.set(name, new InMemoryCollection(name));
    }
    return this.collections.get(name);
  }
}

async function connectToDatabase() {
  if (cachedDb) return cachedDb;
  const mongoUrl = (process.env.MONGO_URL || MONGO_URL || '').trim();
  if (!mongoUrl || (!mongoUrl.startsWith('mongodb://') && !mongoUrl.startsWith('mongodb+srv://'))) {
    cachedDb = new InMemoryDb();
    return cachedDb;
  }
  try {
    const client = new MongoClient(mongoUrl, { connectTimeoutMS: 5000, serverSelectionTimeoutMS: 5000 });
    await client.connect();
    const db = client.db();
    cachedDb = db;
    return db;
  } catch (err) {
    cachedDb = new InMemoryDb();
    return cachedDb;
  }
}

function formatDateFrenchNode(date) {
  if (!date || isNaN(date.getTime())) return "Date invalide";
  const days = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];
  const months = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];
  const dayName = days[date.getUTCDay()];
  const dayNum = String(date.getUTCDate()).padStart(2, '0');
  const monthName = months[date.getUTCMonth()];
  const yearNum = date.getUTCFullYear();
  return `${dayName} ${dayNum} ${monthName} ${yearNum}`;
}
const fieldKeyAliasesServer = {
  'classe': ['classe', 'class', 'الفصل', 'الصف', 'صف', 'فصل', 'classes'],
  'jour': ['jour', 'day', 'اليوم', 'يوم', 'jours'],
  'periode': ['periode', 'période', 'period', 'الحصة', 'حصة', 'seance', 'séance'],
  'matiere': ['matiere', 'matière', 'subject', 'المادة', 'مادة'],
  'enseignant': ['enseignant', 'professeur', 'teacher', 'المعلم', 'الأستاذ', 'الاستاذ', 'prof', 'professeur(e)'],
  'lecon': ['lecon', 'leçon', 'lesson', 'الدرس', 'درس', 'titre', 'titre de la leçon'],
  'travaux de classe': ['travaux de classe', 'travaux', 'classwork', 'العمل الصفي', 'أعمال الفصل', 'اعمال الفصل', 'activites', 'activités'],
  'devoirs': ['devoirs', 'devoir', 'homework', 'الواجبات', 'الواجب', 'واجب', 'واجبات', 'devoir a la maison'],
  'support': ['support', 'supports', 'ressources', 'الدعم', 'المرفقات', 'lien', 'liens']
};

function extractDayNameFromString(dayString) {
  if (!dayString || typeof dayString !== 'string') return null;
  const trimmed = dayString.trim();
  const dayMap = {
    'dimanche': 'Dimanche', 'sun': 'Dimanche', 'sunday': 'Dimanche', 'الأحد': 'Dimanche', 'الاحد': 'Dimanche',
    'lundi': 'Lundi', 'mon': 'Lundi', 'monday': 'Lundi', 'الإثنين': 'Lundi', 'الاثنين': 'Lundi',
    'mardi': 'Mardi', 'tue': 'Mardi', 'tuesday': 'Mardi', 'الثلاثاء': 'Mardi',
    'mercredi': 'Mercredi', 'wed': 'Mercredi', 'wednesday': 'Mercredi', 'الأربعاء': 'Mercredi', 'الاربعاء': 'Mercredi',
    'jeudi': 'Jeudi', 'thu': 'Jeudi', 'thursday': 'Jeudi', 'الخميس': 'Jeudi'
  };
  const lower = trimmed.toLowerCase();
  if (dayMap[lower]) return dayMap[lower];
  for (const [k, v] of Object.entries(dayMap)) {
    if (lower.includes(k.toLowerCase())) return v;
  }
  return null;
}

function getDateForDayNameNode(weekStartDate, dayName) {
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

const findKey = (obj, target) => {
  if (!obj || typeof obj !== 'object' || !target) return undefined;
  const keys = Object.keys(obj);
  const targetLower = target.trim().toLowerCase();
  const targetNorm = targetLower.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  
  // 1. Direct match
  const direct = keys.find(k => k.trim().toLowerCase() === targetLower);
  if (direct) return direct;
  
  // 2. Normalized match
  const normKey = keys.find(k => k.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '') === targetNorm);
  if (normKey) return normKey;
  
  // 3. Aliases
  const aliases = fieldKeyAliasesServer[targetNorm] || [];
  for (const k of keys) {
    const kNorm = k.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (aliases.includes(kNorm)) return k;
  }
  return undefined;
};

// ======================= Fonction utilitaire pour les noms de fichiers ==
const sanitizeForFilename = (str) => {
  if (str === null || str === undefined) return 'Sans_nom';
  if (typeof str !== 'string') str = String(str);
  return str
    .trim()
    .replace(/[\\/:*?"<>|\x00-\x1f]/g, '_')
    .replace(/\s+/g, ' ')
    .trim() || 'Sans_nom';
};

// ======================= Normalisation & Comparaison des Classes =========
const canonicalClassEquivalentsServer = [
  { code: 'pei1', names: ['pei1', 'pei 1', 'السادس', 'سادس', '6eme', '6', 'classe6', 'classe 6'] },
  { code: 'pei2', names: ['pei2', 'pei 2', 'الاول متوسط', 'اول متوسط', '1am', '7eme', '7', 'classe7'] },
  { code: 'pei3', names: ['pei3', 'pei 3', 'الثاني متوسط', 'ثاني متوسط', '2am', '8eme', '8', 'classe8'] },
  { code: 'pei4', names: ['pei4', 'pei 4', 'الثالث متوسط', 'ثالث متوسط', '3am', '9eme', '9', 'classe9'] },
  { code: 'pei5', names: ['pei5', 'pei 5', 'الاول ثانوي', 'اول ثانوي', '1as', '10eme', '10', 'seconde'] },
  { code: 'dp1', names: ['dp1', 'dp 1', 'الثاني ثانوي', 'ثاني ثانوي', '2as', '11eme', '11', 'premiere'] },
  { code: 'dp2', names: ['dp2', 'dp 2', 'الثالث ثانوي', 'ثالث ثانوي', '3as', '12eme', '12', 'terminale'] },
  { code: 'ps', names: ['ps', 'الروضه الصغري', 'الروضة الصغرى', 'petite section', 'maternelle 1', 'ps1'] },
  { code: 'ms', names: ['ms', 'الروضه المتوسطه', 'الروضة المتوسطة', 'moyenne section', 'maternelle 2', 'ms1'] },
  { code: 'gs', names: ['gs', 'الروضه الكبري', 'الروضة الكبرى', 'grande section', 'maternelle 3', 'gs1'] },
  { code: 'pp1', names: ['pp1', 'pp 1', 'الابتدائي الاول', 'الابتدائي 1', 'cp', 'primaire 1'] },
  { code: 'pp2', names: ['pp2', 'pp 2', 'الابتدائي الثاني', 'الابتدائي 2', 'ce1', 'primaire 2'] },
  { code: 'pp3', names: ['pp3', 'pp 3', 'الابتدائي الثالث', 'الابتدائي 3', 'ce2', 'primaire 3'] },
  { code: 'pp4', names: ['pp4', 'pp 4', 'الابتدائي الرابع', 'الابتدائي 4', 'cm1', 'primaire 4'] },
  { code: 'pp5', names: ['pp5', 'pp 5', 'الابتدائي الخامس', 'الابتدائي 5', 'cm2', 'primaire 5'] }
];

function normalizeClassStringServer(str) {
  if (!str) return '';
  return String(str)
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u064B-\u065F\u0670]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/[\s\-_()[\]{}:/.,]/g, '');
}

function isClassMatchServer(classA, classB) {
  if (!classA || !classB) return false;
  const a = String(classA).trim();
  const b = String(classB).trim();
  if (a.toLowerCase() === b.toLowerCase()) return true;

  const normA = normalizeClassStringServer(a);
  const normB = normalizeClassStringServer(b);
  if (!normA || !normB) return false;
  if (normA === normB) return true;

  if (normA.includes(normB) || normB.includes(normA)) return true;

  for (const group of canonicalClassEquivalentsServer) {
    const matchA = (normA === group.code) || group.names.some(n => {
      const nNorm = normalizeClassStringServer(n);
      return normA === nNorm || normA.includes(nNorm) || nNorm.includes(normA);
    });
    const matchB = (normB === group.code) || group.names.some(n => {
      const nNorm = normalizeClassStringServer(n);
      return normB === nNorm || normB.includes(nNorm) || nNorm.includes(normB);
    });
    if (matchA && matchB) return true;
  }
  return false;
}

// ======================= Sélection dynamique du modèle ==================

/**
 * Liste les modèles disponibles via l'API v1 et retourne le premier modèle
 * correspondant à la liste de préférence ET supportant generateContent.
 *
 * On gère les changements de noms (EoL des 1.5, arrivée des 2.5, etc.).
 */
async function resolveGeminiModel(apiKey) {
  const url = `https://generativelanguage.googleapis.com/v1/models?key=${apiKey}`;
  const resp = await fetch(url);
  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    throw new Error(`Impossible de lister les modèles (HTTP ${resp.status}) ${body}`);
  }
  const json = await resp.json();
  const models = Array.isArray(json.models) ? json.models : [];

  // Préférence (ordre décroissant) – ajuste si besoin selon tes coûts/perf
  const preferredNames = [
    // Généraux actuels
    "gemini-2.5-flash",
    "gemini-2.5-pro",
    "gemini-2.5-flash-lite",
    // Anciennes séries (si encore exposées pour ta clé)
    "gemini-1.5-flash-001",
    "gemini-1.5-pro-002",
    "gemini-1.5-flash"
  ];

  const nameSet = new Map(models.map(m => [m.name, m]));
  // Cherche d'abord dans les préférés
  for (const short of preferredNames) {
    const full = `models/${short}`;
    const m = nameSet.get(full);
    if (m && Array.isArray(m.supportedGenerationMethods) && m.supportedGenerationMethods.includes("generateContent")) {
      return short;
    }
  }
  // Sinon, prends le premier qui supporte generateContent
  const any = models.find(m => Array.isArray(m.supportedGenerationMethods) && m.supportedGenerationMethods.includes("generateContent"));
  if (any) return any.name.replace(/^models\//, "");

  throw new Error("Aucun modèle compatible v1 trouvé pour votre clé (generateContent). Vérifiez l'accès de la clé et l'API activée.");
}

// ------------------------- Web Push Subscriptions -------------------------

app.post('/api/subscribe', async (req, res) => {
  try {
    const subscription = req.body.subscription;
    const username = req.body.username;
    if (!subscription || !username) {
      return res.status(400).json({ message: 'Subscription et username requis.' });
    }

    const db = await connectToDatabase();
    // Utiliser l'endpoint comme _id pour garantir l'unicité de l'abonnement
    await db.collection('subscriptions').updateOne(
      { _id: subscription.endpoint },
      { $set: { subscription: subscription, username: username, createdAt: new Date() } },
      { upsert: true }
    );

    res.status(201).json({ message: 'Abonnement enregistré.' });
  } catch (error) {
    console.error('Erreur MongoDB /subscribe:', error);
    res.status(500).json({ message: 'Erreur serveur.' });
  }
});

app.post('/api/unsubscribe', async (req, res) => {
  try {
    const endpoint = req.body.endpoint;
    if (!endpoint) {
      return res.status(400).json({ message: 'Endpoint requis.' });
    }

    const db = await connectToDatabase();
    await db.collection('subscriptions').deleteOne({ _id: endpoint });

    res.status(200).json({ message: 'Abonnement supprimé.' });
  } catch (error) {
    console.error('Erreur MongoDB /unsubscribe:', error);
    res.status(500).json({ message: 'Erreur serveur.' });
  }
});

// ------------------------- Rappels Automatiques (Cron) -------------------------

// Fonction utilitaire pour déterminer la semaine actuelle :
// L'affichage de plan hebdo de la semaine courante commence toujours du jeudi à 15:00 (pour le dimanche prochain à jeudi prochain)
function getCurrentWeekNumber(refDate = new Date()) {
  const d = new Date(refDate);
  const day = d.getDay(); // 0: Dimanche, 1: Lundi, 2: Mardi, 3: Mercredi, 4: Jeudi, 5: Vendredi, 6: Samedi
  const hour = d.getHours();

  let daysToSunday = 0;
  if ((day === 4 && hour >= 15) || day === 5 || day === 6) {
    // À partir du jeudi 15:00, vendredi et samedi : bascule vers le dimanche prochain
    daysToSunday = (7 - day) % 7;
    if (daysToSunday === 0) daysToSunday = 7;
  } else {
    // Du dimanche au jeudi avant 15:00 : semaine active en cours (dimanche passé à jeudi)
    daysToSunday = -day;
  }

  const targetSunday = new Date(d);
  targetSunday.setDate(d.getDate() + daysToSunday);
  const y = targetSunday.getFullYear();
  const m = String(targetSunday.getMonth() + 1).padStart(2, '0');
  const dayNum = String(targetSunday.getDate()).padStart(2, '0');
  const targetSundayStr = `${y}-${m}-${dayNum}`;

  const config = specificWeekDateRangesNode;
  const sortedWeeks = Object.keys(config)
    .map(k => parseInt(k, 10))
    .filter(n => !isNaN(n))
    .sort((a, b) => a - b);

  if (sortedWeeks.length === 0) return 1;

  // 1. Recherche par date de début exacte (dimanche)
  for (const w of sortedWeeks) {
    if (config[w]?.start === targetSundayStr) {
      return w;
    }
  }

  // 2. Recherche par inclusion dans l'intervalle de la semaine
  for (const w of sortedWeeks) {
    const start = config[w]?.start;
    const end = config[w]?.end;
    if (start && end && targetSundayStr >= start && targetSundayStr <= end) {
      return w;
    }
  }

  // 3. Recherche de la semaine la plus proche
  for (let i = 0; i < sortedWeeks.length; i++) {
    const currentWeekNum = sortedWeeks[i];
    const nextWeekNum = sortedWeeks[i + 1];
    const currentStart = config[currentWeekNum]?.start;
    const nextStart = nextWeekNum ? config[nextWeekNum]?.start : null;

    if (currentStart) {
      if (nextStart) {
        if (targetSundayStr >= currentStart && targetSundayStr < nextStart) {
          return currentWeekNum;
        }
      } else {
        if (targetSundayStr >= currentStart) {
          return currentWeekNum;
        }
      }
    }
  }

  return sortedWeeks[0] || 1;
}

// Fonction utilitaire pour déterminer la semaine prochaine pour les enseignants (bascule chaque dimanche)
function getTeacherDefaultWeekNumber() {
  const currentW = getCurrentWeekNumber();
  const maxWeek = 38;
  if (typeof currentW === 'number' && !isNaN(currentW)) {
    return Math.min(currentW + 1, maxWeek);
  }
  return 1;
}

app.get('/api/send-reminders', async (req, res) => {
  try {
    const weekNumber = getCurrentWeekNumber();
    if (!weekNumber) {
      console.log('⚠️ Semaine actuelle non définie dans la configuration.');
      return res.status(200).json({ message: 'Semaine actuelle non définie.' });
    }

    const db = await connectToDatabase();
    const planDocument = await db.collection('plans').findOne({ week: weekNumber });

    if (!planDocument || !planDocument.data || planDocument.data.length === 0) {
      console.log(`⚠️ Aucun plan trouvé pour la semaine ${weekNumber}.`);
      return res.status(200).json({ message: `Aucun plan trouvé pour la semaine ${weekNumber}.` });
    }

    // 1. Identifier les enseignants avec au moins une leçon vide
    const teachersToRemind = new Set();
    const leconKey = findKey(planDocument.data[0] || {}, 'Leçon');

    if (leconKey) {
      planDocument.data.forEach(row => {
        const enseignantKey = findKey(row, 'Enseignant');
        const enseignant = enseignantKey ? row[enseignantKey] : null;
        const lecon = row[leconKey];

        // Si l'enseignant est valide et la leçon est vide ou non définie
        if (enseignant && (!lecon || lecon.trim() === '')) {
          teachersToRemind.add(enseignant);
        }
      });
    }

    if (teachersToRemind.size === 0) {
      console.log(`✅ Tous les plans de la semaine ${weekNumber} semblent complets.`);
      return res.status(200).json({ message: 'Tous les plans sont complets. Aucun rappel envoyé.' });
    }

    console.log(`🔔 Enseignants à rappeler pour S${weekNumber}:`, Array.from(teachersToRemind));

    // 2. Récupérer les abonnements pour ces enseignants
    const subscriptions = await db.collection('subscriptions').find({
      username: { $in: Array.from(teachersToRemind) }
    }).toArray();

    if (subscriptions.length === 0) {
      console.log('⚠️ Aucun abonnement push trouvé pour les enseignants à rappeler.');
      return res.status(200).json({ message: 'Aucun abonnement push trouvé.' });
    }

    // 3. Envoyer les notifications
    const notificationPayload = JSON.stringify({
      title: 'Rappel Plan Hebdomadaire',
      body: `Veuillez compléter votre plan de leçon pour la semaine ${weekNumber}.`,
      icon: '/icons/icon-192x192.png', // Assurez-vous que cette icône existe
      data: {
        url: '/', // URL à ouvrir lors du clic sur la notification
        week: weekNumber
      }
    });

    const sendPromises = subscriptions.map(sub => {
      return webpush.sendNotification(sub.subscription, notificationPayload)
        .then(() => console.log(`Notification envoyée à ${sub.username}`))
        .catch(async (error) => {
          console.error(`Échec envoi notification à ${sub.username}:`, error);
          // Supprimer l'abonnement si l'erreur est 410 Gone (abonnement expiré)
          if (error.statusCode === 410) {
            await db.collection('subscriptions').deleteOne({ _id: sub.subscription.endpoint });
            console.log(`Abonnement expiré pour ${sub.username} supprimé.`);
          }
        });
    });

    await Promise.allSettled(sendPromises);

    res.status(200).json({ 
      message: `${sendPromises.length} rappels tentés.`,
      teachersReminded: Array.from(teachersToRemind)
    });

  } catch (error) {
    console.error('❌ Erreur serveur /send-reminders:', error);
    res.status(500).json({ message: 'Erreur interne /send-reminders.' });
  }
});

// ------------------------- Auth & CRUD simples -------------------------

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.status(200).json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    mongoConfigured: !!MONGO_URL,
    geminiConfigured: !!GEMINI_API_KEY
  });
});

app.post('/api/login', async (req, res) => {
  try {
    console.log('[LOGIN] Requête reçue de:', req.headers['x-forwarded-for'] || req.connection.remoteAddress);
    const { username, password, section = 'garcons' } = req.body;
    console.log('[LOGIN] Tentative pour utilisateur:', username, 'dans la section:', section);
    
    if (!username || !password) {
      console.log('[LOGIN] Username ou password manquant');
      return res.status(400).json({ success: false, message: 'Nom d\'utilisateur et mot de passe requis' });
    }

    const trimmedUsername = username.trim();
    const db = await connectToDatabase();

    // Compte Administrateur Principal (Med01 avec mot de passe Med120786)
    if (trimmedUsername === 'Med01' && password === 'Med120786') {
      console.log('[LOGIN] Authentification Administrateur Med01 réussie');
      return res.status(200).json({ success: true, username: 'Med01', role: 'admin', section, language: 'fr' });
    }

    // Compte Administrateur / Superviseur Racha (Racha avec mot de passe Racha@90)
    if ((trimmedUsername.toLowerCase() === 'racha') && password === 'Racha@90') {
      console.log('[LOGIN] Authentification Administratrice Racha réussie');
      return res.status(200).json({ success: true, username: 'Racha', role: 'supervisor', section, language: 'fr' });
    }

    const userId = `${section}_${trimmedUsername}`;

    // 1. Vérifier si l'utilisateur a été supprimé par l'administrateur
    const isDeleted = await db.collection('deleted_users').findOne({ _id: userId });
    if (isDeleted) {
      return res.status(401).json({ success: false, message: 'Ce compte a été supprimé par l\'administrateur.' });
    }

    // 2. Contrôle de section strict (enseignantes / enseignants / primaire)
    if (isDualMusicTeacher(trimmedUsername)) {
      if (section === 'garcons') {
        return res.status(403).json({ success: false, message: `Accès refusé : L'enseignante '${trimmedUsername}' n'appartient qu'aux sections Filles et Primaire & Maternelle.` });
      }
      // Autorisé pour la Section Filles et la Section Primaire & Maternelle
    } else {
      if (section === 'garcons' && (femaleTeachers.includes(trimmedUsername) || primaireTeachers.includes(trimmedUsername))) {
        return res.status(403).json({ success: false, message: `Accès refusé : L'enseignant(e) '${trimmedUsername}' n'appartient pas à la Section Garçons.` });
      }
      if (section === 'filles' && (maleTeachers.includes(trimmedUsername) || primaireTeachers.includes(trimmedUsername))) {
        return res.status(403).json({ success: false, message: `Accès refusé : L'enseignant(e) '${trimmedUsername}' n'appartient pas à la Section Filles.` });
      }
      if (section === 'primaire' && (maleTeachers.includes(trimmedUsername) || femaleTeachers.includes(trimmedUsername))) {
        return res.status(403).json({ success: false, message: `Accès refusé : L'enseignant(e) '${trimmedUsername}' n'appartient pas à la Section Primaire & Maternelle.` });
      }
    }

    // 3. Recherche de l'utilisateur dans la base de données (par nom d'utilisateur d'accès ou nom d'enseignant dans le tableau)
    const isDual = isDualMusicTeacher(trimmedUsername);
    const userDoc = await db.collection('users').findOne(
      isDual 
        ? {
            section: { $in: ['filles', 'primaire'] },
            $or: [
              { username: trimmedUsername },
              { tableTeacherName: trimmedUsername },
              { username: { $regex: new RegExp(`^${trimmedUsername}$`, 'i') } },
              { tableTeacherName: { $regex: new RegExp(`^${trimmedUsername}$`, 'i') } }
            ]
          }
        : { 
            section: section,
            $or: [
              { username: trimmedUsername },
              { tableTeacherName: trimmedUsername }
            ]
          }
    );

    if (userDoc && userDoc.password) {
      if (userDoc.password === password) {
        console.log('[LOGIN] Authentification réussie pour (DB):', trimmedUsername);
        let userLang = userDoc.language;
        if (!userLang) {
          userLang = arabicTeachers.includes(userDoc.username) ? 'ar' : (englishTeachers.includes(userDoc.username) ? 'en' : 'fr');
        }
        return res.status(200).json({ 
          success: true, 
          username: userDoc.username, 
          tableTeacherName: userDoc.tableTeacherName || userDoc.username,
          role: userDoc.role || 'teacher', 
          section, 
          language: userLang 
        });
      } else {
        console.log('[LOGIN] Mot de passe incorrect pour:', trimmedUsername);
        return res.status(401).json({ success: false, message: 'Mot de passe incorrect.' });
      }
    } else if (validUsers[trimmedUsername] && (password === trimmedUsername || password.toLowerCase() === trimmedUsername.toLowerCase())) {
      console.log('[LOGIN] Authentification par défaut réussie pour enseignant:', trimmedUsername);
      let userLang = arabicTeachers.includes(trimmedUsername) ? 'ar' : (englishTeachers.includes(trimmedUsername) ? 'en' : 'fr');
      return res.status(200).json({ 
        success: true, 
        username: trimmedUsername, 
        tableTeacherName: trimmedUsername,
        role: 'teacher', 
        section, 
        language: userLang 
      });
    }

    console.log('[LOGIN] Compte non configuré pour:', trimmedUsername);
    res.status(401).json({ success: false, message: 'Compte ou mot de passe non configuré par l\'administrateur.' });
  } catch (error) {
    console.error('[LOGIN] CRASH in /api/login:', error);
    res.status(500).json({ success: false, message: 'Erreur interne du serveur.' });
  }
});

// --- API GESTION DES ENSEIGNANTS / COMPTES (ADMIN) ---

app.get('/api/admin/users', async (req, res) => {
  try {
    const section = req.query.section || 'garcons';
    const db = await connectToDatabase();
    
    const deletedUserDocs = await db.collection('deleted_users').find({ section }).toArray();
    const deletedUserIds = new Set(deletedUserDocs.map(d => d._id));

    let users = await db.collection('users').find({ section: section }).toArray();

    // Assurer que la liste par défaut des enseignants est visible dans le panel pour configuration facile
    const defaultList = section === 'filles' ? femaleTeachers : (section === 'primaire' ? primaireTeachers : maleTeachers);
    const existingUserMap = new Map();
    users.forEach(u => existingUserMap.set(u.username, u));

    let completeList = [];
    for (const teacherName of defaultList) {
      const uId = `${section}_${teacherName}`;
      if (deletedUserIds.has(uId)) continue;
      
      if (existingUserMap.has(teacherName)) {
        completeList.push(existingUserMap.get(teacherName));
      } else {
        let defLang = 'fr';
        if (arabicTeachers.includes(teacherName)) defLang = 'ar';
        if (englishTeachers.includes(teacherName)) defLang = 'en';
        
        completeList.push({
          _id: uId,
          username: teacherName,
          tableTeacherName: '',
          password: '',
          section: section,
          role: 'teacher',
          language: defLang,
          isConfigured: false
        });
      }
    }

    // Ajouter les utilisateurs personnalisés ajoutés par l'admin qui ne sont pas dans defaultList
    for (const u of users) {
      if (!deletedUserIds.has(u._id) && !defaultList.includes(u.username)) {
        if (section === 'garcons' && (femaleTeachers.includes(u.username) || primaireTeachers.includes(u.username) || isDualMusicTeacher(u.username))) continue;
        if (section === 'filles' && !isDualMusicTeacher(u.username) && (maleTeachers.includes(u.username) || primaireTeachers.includes(u.username))) continue;
        if (section === 'primaire' && !isDualMusicTeacher(u.username) && (maleTeachers.includes(u.username) || femaleTeachers.includes(u.username))) continue;
        completeList.push(u);
      }
    }

    // Filtre de sécurité strict par section
    if (section === 'garcons') {
      completeList = completeList.filter(u => !femaleTeachers.some(f => f.toLowerCase() === u.username.toLowerCase()) && !primaireTeachers.some(p => p.toLowerCase() === u.username.toLowerCase()) && !isDualMusicTeacher(u.username));
    } else if (section === 'filles') {
      completeList = completeList.filter(u => isDualMusicTeacher(u.username) || (!maleTeachers.some(m => m.toLowerCase() === u.username.toLowerCase()) && !primaireTeachers.some(p => p.toLowerCase() === u.username.toLowerCase())));
    } else if (section === 'primaire') {
      completeList = completeList.filter(u => isDualMusicTeacher(u.username) || (!maleTeachers.some(m => m.toLowerCase() === u.username.toLowerCase()) && !femaleTeachers.some(f => f.toLowerCase() === u.username.toLowerCase())));
    }

    res.status(200).json(completeList);
  } catch (error) {
    console.error('Erreur GET /api/admin/users:', error);
    res.status(500).json({ message: 'Erreur serveur.' });
  }
});

app.post('/api/admin/users', async (req, res) => {
  try {
    const { username, password, section = 'garcons', role = 'teacher', language = 'fr', tableTeacherName = '', photoUrl = '' } = req.body;
    if (!username || !password) {
      return res.status(400).json({ message: 'Nom d\'utilisateur et mot de passe requis.' });
    }
    const trimmedUser = username.trim();
    const trimmedTableTeacherName = (tableTeacherName || '').trim() || trimmedUser;
    const cleanPhoto = formatDriveImageUrl(photoUrl || '');
    const db = await connectToDatabase();

    const userId = `${section}_${trimmedUser}`;
    
    // Si l'utilisateur avait été précédemment supprimé, annuler sa suppression
    await db.collection('deleted_users').deleteOne({ _id: userId });

    const updateFields = { 
      username: trimmedUser, 
      tableTeacherName: trimmedTableTeacherName,
      password: password, 
      section: section, 
      role: role, 
      language: language || 'fr',
      updatedAt: new Date() 
    };
    if (cleanPhoto) {
      updateFields.photoUrl = cleanPhoto;
    }

    await db.collection('users').updateOne(
      { _id: userId },
      { $set: updateFields },
      { upsert: true }
    );

    if (cleanPhoto) {
      await db.collection('teachers_photos').updateOne(
        { teacherName: trimmedUser },
        { $set: { teacherName: trimmedUser, photoUrl: cleanPhoto, section, updatedAt: new Date() } },
        { upsert: true }
      );
    }

    res.status(200).json({ message: `Compte '${trimmedUser}' enregistré (Nom Tableau/Tri: '${trimmedTableTeacherName || trimmedUser}', Langue: ${language}) pour la section ${section}.` });
  } catch (error) {
    console.error('Erreur POST /api/admin/users:', error);
    res.status(500).json({ message: 'Erreur serveur.' });
  }
});

app.delete('/api/admin/users', async (req, res) => {
  try {
    const { username, section = 'garcons' } = req.body;
    if (!username) {
      return res.status(400).json({ message: 'Nom d\'utilisateur requis.' });
    }
    const trimmedUser = username.trim();
    const db = await connectToDatabase();

    const userId = `${section}_${trimmedUser}`;
    await db.collection('users').deleteOne({ _id: userId });
    await db.collection('deleted_users').updateOne(
      { _id: userId },
      { $set: { _id: userId, username: trimmedUser, section, deletedAt: new Date() } },
      { upsert: true }
    );

    res.status(200).json({ message: `Compte '${trimmedUser}' supprimé de la section ${section}.` });
  } catch (error) {
    console.error('Erreur DELETE /api/admin/users:', error);
    res.status(500).json({ message: 'Erreur serveur.' });
  }
});

// Helper pour nettoyer et convertir les liens Google Drive en URL d'image directe
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

// --- API GESTION DES PHOTOS DES ENSEIGNANTS (GOOGLE DRIVE / LIENS DIRECTS) ---

app.get('/api/teachers-photos', async (req, res) => {
  try {
    const db = await connectToDatabase();
    const photosDocs = await db.collection('teachers_photos').find({}).toArray();
    const photosMap = {};
    photosDocs.forEach(doc => {
      if (doc.teacherName && doc.photoUrl) {
        photosMap[doc.teacherName] = doc.photoUrl;
      }
    });

    const usersWithPhotos = await db.collection('users').find({ photoUrl: { $exists: true, $ne: '' } }).toArray();
    usersWithPhotos.forEach(u => {
      if (u.username && u.photoUrl && !photosMap[u.username]) {
        photosMap[u.username] = u.photoUrl;
      }
      if (u.tableTeacherName && u.photoUrl && !photosMap[u.tableTeacherName]) {
        photosMap[u.tableTeacherName] = u.photoUrl;
      }
    });

    res.status(200).json({ success: true, photos: photosMap });
  } catch (error) {
    console.error('Erreur GET /api/teachers-photos:', error);
    res.status(500).json({ success: false, error: error.message, photos: {} });
  }
});

app.post('/api/teachers-photos', async (req, res) => {
  try {
    const db = await connectToDatabase();
    const { teacherName, photoUrl, section = 'garcons', photos } = req.body;

    if (photos && typeof photos === 'object') {
      for (const [tName, pUrl] of Object.entries(photos)) {
        if (!tName) continue;
        const cleanUrl = formatDriveImageUrl(pUrl);
        await db.collection('teachers_photos').updateOne(
          { teacherName: tName.trim() },
          { $set: { teacherName: tName.trim(), photoUrl: cleanUrl, updatedAt: new Date() } },
          { upsert: true }
        );
        await db.collection('users').updateMany(
          { $or: [{ username: tName.trim() }, { tableTeacherName: tName.trim() }] },
          { $set: { photoUrl: cleanUrl } }
        );
      }
      return res.status(200).json({ success: true, message: 'Photos enregistrées avec succès.' });
    }

    if (!teacherName) {
      return res.status(400).json({ success: false, message: 'Nom de l\'enseignant requis.' });
    }

    const cleanUrl = formatDriveImageUrl(photoUrl || '');
    await db.collection('teachers_photos').updateOne(
      { teacherName: teacherName.trim() },
      { $set: { teacherName: teacherName.trim(), photoUrl: cleanUrl, section, updatedAt: new Date() } },
      { upsert: true }
    );
    await db.collection('users').updateMany(
      { $or: [{ username: teacherName.trim() }, { tableTeacherName: teacherName.trim() }] },
      { $set: { photoUrl: cleanUrl } }
    );

    res.status(200).json({ success: true, message: `Photo enregistrée pour ${teacherName}.`, photoUrl: cleanUrl });
  } catch (error) {
    console.error('Erreur POST /api/teachers-photos:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/my-teacher-photo', async (req, res) => {
  try {
    const { username, photoUrl, section = 'garcons' } = req.body;
    if (!username) {
      return res.status(400).json({ success: false, message: 'Nom d\'utilisateur requis.' });
    }
    const db = await connectToDatabase();
    const cleanUrl = formatDriveImageUrl(photoUrl || '');
    
    await db.collection('teachers_photos').updateOne(
      { teacherName: username.trim() },
      { $set: { teacherName: username.trim(), photoUrl: cleanUrl, section, updatedAt: new Date() } },
      { upsert: true }
    );
    await db.collection('users').updateMany(
      { $or: [{ username: username.trim() }, { tableTeacherName: username.trim() }] },
      { $set: { photoUrl: cleanUrl } }
    );

    res.status(200).json({ success: true, message: 'Votre photo a été mise à jour.', photoUrl: cleanUrl });
  } catch (error) {
    console.error('Erreur POST /api/my-teacher-photo:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// GESTION ET CONFIGURATION DES SEMAINES ET DATES DU CALENDRIER SCOLAIRE
// ============================================================================

async function loadWeeksConfigurationFromDb(db) {
  try {
    const configDoc = await db.collection('settings').findOne({ _id: 'weeks_configuration' });
    const mergedConfig = {};
    for (const [wNum, wData] of Object.entries(defaultWeeksConfig)) {
      mergedConfig[wNum] = { ...wData };
    }
    if (configDoc && configDoc.weeks) {
      for (const [wNum, wData] of Object.entries(configDoc.weeks)) {
        if (wData) {
          mergedConfig[wNum] = {
            title: wData.title || defaultWeeksConfig[wNum]?.title || `Semaine ${wNum}`,
            titleAr: wData.titleAr || defaultWeeksConfig[wNum]?.titleAr || `الأسبوع ${wNum}`,
            start: wData.start || defaultWeeksConfig[wNum]?.start || '',
            end: wData.end || defaultWeeksConfig[wNum]?.end || ''
          };
        }
      }
    }
    // Synchroniser en mémoire specificWeekDateRangesNode
    for (const [wNum, wData] of Object.entries(mergedConfig)) {
      specificWeekDateRangesNode[wNum] = { start: wData.start, end: wData.end };
    }
    return mergedConfig;
  } catch (err) {
    console.error('Erreur chargement weeks_configuration:', err);
    return defaultWeeksConfig;
  }
}

app.get(['/api/weeks-config', '/api/admin/weeks-config'], async (req, res) => {
  try {
    const db = await connectToDatabase();
    const weeksConfig = await loadWeeksConfigurationFromDb(db);
    res.status(200).json({ success: true, weeks: weeksConfig, defaultWeeks: defaultWeeksConfig });
  } catch (error) {
    console.error('Erreur GET /api/weeks-config:', error);
    res.status(200).json({ success: true, weeks: defaultWeeksConfig, defaultWeeks: defaultWeeksConfig });
  }
});

app.post(['/api/admin/weeks-config', '/api/weeks-config'], async (req, res) => {
  try {
    const db = await connectToDatabase();
    const { week, title, titleAr, start, end, weeks, resetToDefault } = req.body;

    if (resetToDefault) {
      await db.collection('settings').updateOne(
        { _id: 'weeks_configuration' },
        { $set: { _id: 'weeks_configuration', weeks: defaultWeeksConfig, updatedAt: new Date() } },
        { upsert: true }
      );
      for (const [wNum, wData] of Object.entries(defaultWeeksConfig)) {
        specificWeekDateRangesNode[wNum] = { start: wData.start, end: wData.end };
      }
      return res.status(200).json({
        success: true,
        message: 'Calendrier scolaire réinitialisé aux dates officielles 2026/2027.',
        weeks: defaultWeeksConfig
      });
    }

    const currentConfig = await loadWeeksConfigurationFromDb(db);

    if (weeks && typeof weeks === 'object') {
      // Mise à jour multiple
      for (const [wNum, wData] of Object.entries(weeks)) {
        if (currentConfig[wNum]) {
          currentConfig[wNum] = {
            title: wData.title !== undefined ? String(wData.title).trim() : currentConfig[wNum].title,
            titleAr: wData.titleAr !== undefined ? String(wData.titleAr).trim() : currentConfig[wNum].titleAr,
            start: wData.start !== undefined ? String(wData.start).trim() : currentConfig[wNum].start,
            end: wData.end !== undefined ? String(wData.end).trim() : currentConfig[wNum].end
          };
          specificWeekDateRangesNode[wNum] = { start: currentConfig[wNum].start, end: currentConfig[wNum].end };
        }
      }
      await db.collection('settings').updateOne(
        { _id: 'weeks_configuration' },
        { $set: { _id: 'weeks_configuration', weeks: currentConfig, updatedAt: new Date() } },
        { upsert: true }
      );
      return res.status(200).json({
        success: true,
        message: 'Toutes les semaines ont été mises à jour avec succès.',
        weeks: currentConfig
      });
    }

    if (week) {
      const wNum = parseInt(week, 10);
      if (isNaN(wNum) || wNum < 1 || wNum > 52) {
        return res.status(400).json({ message: 'Numéro de semaine invalide.' });
      }

      currentConfig[wNum] = {
        title: title !== undefined ? String(title).trim() : (currentConfig[wNum]?.title || `Semaine ${wNum}`),
        titleAr: titleAr !== undefined ? String(titleAr).trim() : (currentConfig[wNum]?.titleAr || `الأسبوع ${wNum}`),
        start: start !== undefined ? String(start).trim() : (currentConfig[wNum]?.start || ''),
        end: end !== undefined ? String(end).trim() : (currentConfig[wNum]?.end || '')
      };

      specificWeekDateRangesNode[wNum] = { start: currentConfig[wNum].start, end: currentConfig[wNum].end };

      await db.collection('settings').updateOne(
        { _id: 'weeks_configuration' },
        { $set: { _id: 'weeks_configuration', weeks: currentConfig, updatedAt: new Date() } },
        { upsert: true }
      );

      return res.status(200).json({
        success: true,
        message: `Configuration de la semaine ${wNum} mise à jour avec succès.`,
        week: wNum,
        weekData: currentConfig[wNum],
        weeks: currentConfig
      });
    }

    return res.status(400).json({ message: 'Données de semaine manquantes.' });
  } catch (error) {
    console.error('Erreur POST /api/admin/weeks-config:', error);
    res.status(500).json({ message: 'Erreur serveur lors de la mise à jour des semaines.' });
  }
});

// ============================================================================
// FONCTIONS AIDES ET HOMELOG/DEVOIRS UTILS
// ============================================================================

function convertGoogleDriveUrl(url) {
  if (!url) return url;
  const drivePattern = /https:\/\/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/;
  const match = String(url).match(drivePattern);
  if (match && match[1]) {
    return `https://lh3.googleusercontent.com/d/${match[1]}`;
  }
  return url;
}

async function deleteOldPhotos(collection) {
  try {
    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
    const result = await collection.deleteMany({ createdAt: { $lt: threeDaysAgo } });
    return result.deletedCount;
  } catch (e) {
    return 0;
  }
}

function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

const dayNamesFr = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
function getDayNameFr(dateStr) {
  if (!dateStr) return null;
  const m = moment(dateStr);
  if (m.isValid()) {
    return dayNamesFr[m.day()];
  }
  return null;
}

const calculateDailyStar = (evaluations) => {
  if (!evaluations || evaluations.length === 0) return 0;
  const completedHomework = evaluations.filter(ev => ev.status === 'Fait').length;
  const partiallyCompleted = evaluations.filter(ev => ev.status === 'Partiellement Fait').length;
  const hasGoodParticipation = evaluations.every(ev => (ev.participation || 0) > 5);
  const hasGoodBehavior = evaluations.every(ev => (ev.behavior || 0) > 5);
  if (completedHomework === evaluations.length && hasGoodParticipation && hasGoodBehavior) {
    return 1;
  }
  const halfOrMore = (completedHomework + partiallyCompleted) >= (evaluations.length / 2);
  if (halfOrMore && hasGoodParticipation && hasGoodBehavior) {
    return 0.5;
  }
  return 0;
};

const calculateStarsLegacy = (evaluations) => {
  const evalsByDay = {};
  (evaluations || []).forEach(ev => {
    if (!evalsByDay[ev.date]) evalsByDay[ev.date] = [];
    evalsByDay[ev.date].push(ev);
  });
  let stars = 0;
  for (const date in evalsByDay) {
    const dayEvals = evalsByDay[date];
    const completedHomework = dayEvals.filter(ev => ev.status === 'Fait' || ev.status === 'Partiellement Fait').length;
    const completionRate = (completedHomework / dayEvals.length) * 100;
    const hasGoodCompletion = completionRate > 70;
    const goodBehavior = dayEvals.every(ev => (ev.behavior || 0) > 5);
    const goodParticipation = dayEvals.every(ev => (ev.participation || 0) > 5);
    if (hasGoodCompletion && goodBehavior && goodParticipation) {
      stars++;
    }
  }
  return stars;
};

const defaultBoysStudents = {
  PEI1: [
    { name: "Faysal", photo: "https://lh3.googleusercontent.com/d/1IB6BKROX3TRxaIIHVVVWbB7-Ii-V8VrC", birthday: "4/2014" },
    { name: "Bilal", photo: "https://lh3.googleusercontent.com/d/1B0QUZJhpSad5Fs3qRTugUe4oyTlUDEVu", birthday: "2/2015" },
    { name: "Jad", photo: "https://lh3.googleusercontent.com/d/1VLvrWjeJwaClf4pSaLiwjnS79N-HrsFr", birthday: "8/2014" },
    { name: "Manaf", photo: "https://lh3.googleusercontent.com/d/1h46Tqtqcp5tNqdY62wV6pyZFYknCEMWY", birthday: "8/2014" }
  ],
  PEI2: [
    { name: "Ahmed", photo: "https://lh3.googleusercontent.com/d/1cDF-yegSB2tqsWac0AoNttbi8qAALYT1", birthday: "9/2013" },
    { name: "Yasser", photo: "https://lh3.googleusercontent.com/d/1DthaZcLUhfkkxbvaTr4o4XJENIM6ZNsz", birthday: "8/2013" },
    { name: "Eyad", photo: "https://lh3.googleusercontent.com/d/1HGyWS4cC1jWWD25Ah3WcT_eIbUHqFzJ1", birthday: "4/2013" },
    { name: "Ali", photo: "https://lh3.googleusercontent.com/d/18QAEYQWVI2HgQf9Kl_8eJ91cjE-Rjg40", birthday: "4/2013" }
  ],
  PEI3: [
    { name: "Seifeddine", photo: "https://lh3.googleusercontent.com/d/1tWdPSbtCAsTMB86WzDgqh3Xw01ahm9s6", birthday: "1/2012" },
    { name: "Mohamed", photo: "https://lh3.googleusercontent.com/d/1lB8ObGOvQDVT6FITL2y7C5TYmAGyggFn", birthday: "11/2011" },
    { name: "Wajih", photo: "https://lh3.googleusercontent.com/d/1MH6M05mQamOHevmDffVFNpSFNnxqbxs3", birthday: "6/2012" },
    { name: "Ahmad", photo: "https://lh3.googleusercontent.com/d/1zU-jBuAbYjHanzank9C1BAd00skS1Y5J", birthday: "2/2012" },
    { name: "Adam", photo: "https://lh3.googleusercontent.com/d/15I9p6VSnn1yVmPxRRbGsUkM-fsBKYOWF", birthday: "12/2012" }
  ],
  PEI4: [
    { name: "Mohamed Younes", photo: "https://lh3.googleusercontent.com/d/1ok8M9EOY71ScKuaW0mHfKUErjKZ4wbe1", birthday: "11/2011" },
    { name: "Mohamed Amine", photo: "https://lh3.googleusercontent.com/d/1UrBw6guz0oBTUy8COGeewIs3XAK773bR", birthday: "12/2012" },
    { name: "Samir", photo: "https://lh3.googleusercontent.com/d/1NdaCH8CU0DJFHXw4D0lItP-QnCswl23b", birthday: "12/2012" },
    { name: "Abdulrahman", photo: "https://lh3.googleusercontent.com/d/1yCTO5StU2tnPY0BEynnWzUveljMIUcLE", birthday: "4/2012" },
    { name: "Youssef", photo: "https://lh3.googleusercontent.com/d/1Bygg5-PYrjjMOZdI5hAe16eZ8ltn772e", birthday: "11/2011" }
  ],
  PEI5: [
    { name: "Rayane", photo: "https://lh3.googleusercontent.com/d/1zU-jBuAbYjHanzank9C1BAd00skS1Y5J", birthday: "3/2010" },
    { name: "Anis", photo: "https://lh3.googleusercontent.com/d/1MH6M05mQamOHevmDffVFNpSFNnxqbxs3", birthday: "5/2010" },
    { name: "Taha", photo: "https://lh3.googleusercontent.com/d/1lB8ObGOvQDVT6FITL2y7C5TYmAGyggFn", birthday: "8/2010" },
    { name: "Hamza", photo: "https://lh3.googleusercontent.com/d/1tWdPSbtCAsTMB86WzDgqh3Xw01ahm9s6", birthday: "11/2010" }
  ],
  DP1: [
    { name: "Ilyas", photo: "https://lh3.googleusercontent.com/d/15I9p6VSnn1yVmPxRRbGsUkM-fsBKYOWF", birthday: "2/2009" },
    { name: "Kareem", photo: "https://lh3.googleusercontent.com/d/1UrBw6guz0oBTUy8COGeewIs3XAK773bR", birthday: "6/2009" },
    { name: "Mehdi", photo: "https://lh3.googleusercontent.com/d/1NdaCH8CU0DJFHXw4D0lItP-QnCswl23b", birthday: "9/2009" }
  ],
  DP2: [
    { name: "Bilal", photo: "https://lh3.googleusercontent.com/d/1yCTO5StU2tnPY0BEynnWzUveljMIUcLE", birthday: "1/2008" },
    { name: "Zaid", photo: "https://lh3.googleusercontent.com/d/1Bygg5-PYrjjMOZdI5hAe16eZ8ltn772e", birthday: "4/2008" },
    { name: "Walid", photo: "https://lh3.googleusercontent.com/d/1ok8M9EOY71ScKuaW0mHfKUErjKZ4wbe1", birthday: "8/2008" }
  ]
};

const defaultGirlsStudents = {
  PEI1: [
    { name: "Fatima", photo: "https://images.unsplash.com/photo-1544717305-2782549b5136?w=150&auto=format&fit=crop&q=80", birthday: "3/2014" },
    { name: "Mariam", photo: "https://images.unsplash.com/photo-1517841905240-472988babdf9?w=150&auto=format&fit=crop&q=80", birthday: "5/2014" },
    { name: "Sarah", photo: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80", birthday: "8/2014" },
    { name: "Salma", photo: "https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=150&auto=format&fit=crop&q=80", birthday: "10/2014" }
  ],
  PEI2: [
    { name: "Khadija", photo: "https://images.unsplash.com/photo-1531746020798-e6953c6e8e04?w=150&auto=format&fit=crop&q=80", birthday: "4/2013" },
    { name: "Zainab", photo: "https://images.unsplash.com/photo-1529626455594-4ff0802cfb7e?w=150&auto=format&fit=crop&q=80", birthday: "7/2013" },
    { name: "Nour", photo: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&auto=format&fit=crop&q=80", birthday: "9/2013" },
    { name: "Amina", photo: "https://images.unsplash.com/photo-1508214751196-bcfd4ca60f91?w=150&auto=format&fit=crop&q=80", birthday: "11/2013" }
  ],
  PEI3: [
    { name: "Houda", photo: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80", birthday: "2/2012" },
    { name: "Leila", photo: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=150&auto=format&fit=crop&q=80", birthday: "5/2012" },
    { name: "Zohra", photo: "https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=150&auto=format&fit=crop&q=80", birthday: "8/2012" },
    { name: "Aya", photo: "https://images.unsplash.com/photo-1517841905240-472988babdf9?w=150&auto=format&fit=crop&q=80", birthday: "11/2012" }
  ],
  PEI4: [
    { name: "Yasmine", photo: "https://images.unsplash.com/photo-1531746020798-e6953c6e8e04?w=150&auto=format&fit=crop&q=80", birthday: "1/2011" },
    { name: "Hiba", photo: "https://images.unsplash.com/photo-1544717305-2782549b5136?w=150&auto=format&fit=crop&q=80", birthday: "6/2011" },
    { name: "Rania", photo: "https://images.unsplash.com/photo-1529626455594-4ff0802cfb7e?w=150&auto=format&fit=crop&q=80", birthday: "9/2011" },
    { name: "Ines", photo: "https://images.unsplash.com/photo-1508214751196-bcfd4ca60f91?w=150&auto=format&fit=crop&q=80", birthday: "12/2011" }
  ],
  PEI5: [
    { name: "Rana", photo: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80", birthday: "2/2010" },
    { name: "Malak", photo: "https://images.unsplash.com/photo-1517841905240-472988babdf9?w=150&auto=format&fit=crop&q=80", birthday: "4/2010" },
    { name: "Dina", photo: "https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=150&auto=format&fit=crop&q=80", birthday: "7/2010" }
  ],
  DP1: [
    { name: "Lina", photo: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=150&auto=format&fit=crop&q=80", birthday: "1/2009" },
    { name: "Kenza", photo: "https://images.unsplash.com/photo-1531746020798-e6953c6e8e04?w=150&auto=format&fit=crop&q=80", birthday: "5/2009" },
    { name: "Nouran", photo: "https://images.unsplash.com/photo-1508214751196-bcfd4ca60f91?w=150&auto=format&fit=crop&q=80", birthday: "8/2009" }
  ],
  DP2: [
    { name: "Chaimae", photo: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&auto=format&fit=crop&q=80", birthday: "3/2008" },
    { name: "Rim", photo: "https://images.unsplash.com/photo-1529626455594-4ff0802cfb7e?w=150&auto=format&fit=crop&q=80", birthday: "7/2008" },
    { name: "Asma", photo: "https://images.unsplash.com/photo-1544717305-2782549b5136?w=150&auto=format&fit=crop&q=80", birthday: "10/2008" }
  ]
};

const defaultPrimaireStudents = {
  PS: [
    { name: "Adam K.", photo: "https://images.unsplash.com/photo-1543332164-6e82f355badc?w=150&auto=format&fit=crop&q=80", birthday: "5/2023" },
    { name: "Lina M.", photo: "https://images.unsplash.com/photo-1519456264917-42d0aa2e0625?w=150&auto=format&fit=crop&q=80", birthday: "8/2023" },
    { name: "Zaid B.", photo: "https://images.unsplash.com/photo-1503454537195-1dcabb73ffb9?w=150&auto=format&fit=crop&q=80", birthday: "2/2023" },
    { name: "Maya S.", photo: "https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=150&auto=format&fit=crop&q=80", birthday: "11/2023" }
  ],
  MS: [
    { name: "Youssef T.", photo: "https://images.unsplash.com/photo-1508214751196-bcfd4ca60f91?w=150&auto=format&fit=crop&q=80", birthday: "3/2022" },
    { name: "Nour H.", photo: "https://images.unsplash.com/photo-1517841905240-472988babdf9?w=150&auto=format&fit=crop&q=80", birthday: "7/2022" },
    { name: "Kareem A.", photo: "https://images.unsplash.com/photo-1544717305-2782549b5136?w=150&auto=format&fit=crop&q=80", birthday: "10/2022" },
    { name: "Sarah B.", photo: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80", birthday: "1/2022" }
  ],
  GS: [
    { name: "Ilyas R.", photo: "https://images.unsplash.com/photo-1503454537195-1dcabb73ffb9?w=150&auto=format&fit=crop&q=80", birthday: "4/2021" },
    { name: "Khadija F.", photo: "https://images.unsplash.com/photo-1529626455594-4ff0802cfb7e?w=150&auto=format&fit=crop&q=80", birthday: "6/2021" },
    { name: "Sami D.", photo: "https://images.unsplash.com/photo-1543332164-6e82f355badc?w=150&auto=format&fit=crop&q=80", birthday: "9/2021" },
    { name: "Rania N.", photo: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&auto=format&fit=crop&q=80", birthday: "12/2021" }
  ],
  PP1: [
    { name: "Anas C.", photo: "https://images.unsplash.com/photo-1508214751196-bcfd4ca60f91?w=150&auto=format&fit=crop&q=80", birthday: "2/2020" },
    { name: "Salma K.", photo: "https://images.unsplash.com/photo-1517841905240-472988babdf9?w=150&auto=format&fit=crop&q=80", birthday: "5/2020" },
    { name: "Bilal E.", photo: "https://images.unsplash.com/photo-1544717305-2782549b5136?w=150&auto=format&fit=crop&q=80", birthday: "8/2020" },
    { name: "Aya M.", photo: "https://images.unsplash.com/photo-1531746020798-e6953c6e8e04?w=150&auto=format&fit=crop&q=80", birthday: "11/2020" }
  ],
  PP2: [
    { name: "Hamza L.", photo: "https://images.unsplash.com/photo-1503454537195-1dcabb73ffb9?w=150&auto=format&fit=crop&q=80", birthday: "3/2019" },
    { name: "Mariam Z.", photo: "https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=150&auto=format&fit=crop&q=80", birthday: "7/2019" },
    { name: "Rayane V.", photo: "https://images.unsplash.com/photo-1543332164-6e82f355badc?w=150&auto=format&fit=crop&q=80", birthday: "9/2019" },
    { name: "Ines G.", photo: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80", birthday: "12/2019" }
  ],
  PP3: [
    { name: "Yassine S.", photo: "https://images.unsplash.com/photo-1508214751196-bcfd4ca60f91?w=150&auto=format&fit=crop&q=80", birthday: "1/2018" },
    { name: "Fatima E.", photo: "https://images.unsplash.com/photo-1517841905240-472988babdf9?w=150&auto=format&fit=crop&q=80", birthday: "4/2018" },
    { name: "Tariq B.", photo: "https://images.unsplash.com/photo-1544717305-2782549b5136?w=150&auto=format&fit=crop&q=80", birthday: "8/2018" },
    { name: "Hajar D.", photo: "https://images.unsplash.com/photo-1529626455594-4ff0802cfb7e?w=150&auto=format&fit=crop&q=80", birthday: "10/2018" }
  ],
  PP4: [
    { name: "Omar N.", photo: "https://images.unsplash.com/photo-1503454537195-1dcabb73ffb9?w=150&auto=format&fit=crop&q=80", birthday: "2/2017" },
    { name: "Zineb B.", photo: "https://images.unsplash.com/photo-1531746020798-e6953c6e8e04?w=150&auto=format&fit=crop&q=80", birthday: "6/2017" },
    { name: "Mehdi T.", photo: "https://images.unsplash.com/photo-1543332164-6e82f355badc?w=150&auto=format&fit=crop&q=80", birthday: "9/2017" },
    { name: "Imane L.", photo: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&auto=format&fit=crop&q=80", birthday: "11/2017" }
  ],
  PP5: [
    { name: "Walid K.", photo: "https://images.unsplash.com/photo-1508214751196-bcfd4ca60f91?w=150&auto=format&fit=crop&q=80", birthday: "3/2016" },
    { name: "Manal R.", photo: "https://images.unsplash.com/photo-1517841905240-472988babdf9?w=150&auto=format&fit=crop&q=80", birthday: "5/2016" },
    { name: "Driss H.", photo: "https://images.unsplash.com/photo-1544717305-2782549b5136?w=150&auto=format&fit=crop&q=80", birthday: "8/2016" },
    { name: "Soukaina A.", photo: "https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=150&auto=format&fit=crop&q=80", birthday: "12/2016" }
  ]
};

// ============================================================================
// API GESTION DES ÉLÈVES (ADMIN)
// ============================================================================

// Cache mémoire pour optimiser la réactivité et supprimer tout lag
const studentsMemoryCache = new Map();

function invalidateStudentsCache(section) {
  if (section) {
    for (const key of studentsMemoryCache.keys()) {
      if (key.startsWith(section)) {
        studentsMemoryCache.delete(key);
      }
    }
  } else {
    studentsMemoryCache.clear();
  }
}

function normalizeStudentClass(cls) {
  if (!cls) return '';
  const str = String(cls).trim();
  const match = str.match(/\b(PEI[1-5]|DP[1-2]|PP[1-5]|PS|MS|GS)\b/i);
  if (match) return match[1].toUpperCase();
  const arabicMap = {
    'الروضة الصغرى': 'PS', 'الروضة المتوسطة': 'MS', 'الروضة الكبرى': 'GS',
    'الابتدائي الأول': 'PP1', 'الابتدائي الثاني': 'PP2', 'الابتدائي الثالث': 'PP3',
    'الابتدائي الرابع': 'PP4', 'الابتدائي الخامس': 'PP5',
    'السادس': 'PEI1', 'الاول متوسط': 'PEI2', 'الثاني متوسط': 'PEI3',
    'الثالث متوسط': 'PEI4', 'الأول ثانوي': 'PEI5', 'الاول ثانوي': 'PEI5',
    'الثاني ثانوي': 'DP1', 'الثالث ثانوي': 'DP2'
  };
  for (const [ar, code] of Object.entries(arabicMap)) {
    if (str.includes(ar)) return code;
  }
  return str.replace(/\s*(garçons|garcons|filles|primaire)\s*/gi, '').trim();
}

app.get('/api/admin/students', async (req, res) => {
  try {
    let section = req.query.section || 'garcons';
    const targetClass = req.query.class;
    const canonicalClass = normalizeStudentClass(targetClass);
    
    // Auto-détection de la section si contenue dans le nom de la classe
    if (targetClass && typeof targetClass === 'string') {
      const lower = targetClass.toLowerCase();
      if (lower.includes('garçon') || lower.includes('garcon')) section = 'garcons';
      else if (lower.includes('fille')) section = 'filles';
      else if (lower.includes('primaire') || ['ps','ms','gs','pp1','pp2','pp3','pp4','pp5'].includes(canonicalClass.toLowerCase())) {
        if (!['garcons', 'filles'].includes(section)) section = 'primaire';
      }
    }

    const cacheKey = `${section}_${canonicalClass || targetClass || 'all'}`;

    if (studentsMemoryCache.has(cacheKey)) {
      const cached = studentsMemoryCache.get(cacheKey);
      if (cached && cached.length > 0) {
        return res.status(200).json(cached);
      }
    }

    const db = await connectToDatabase();

    // Auto-seeding si la section n'a encore aucun élève enregistré
    const totalInSection = await db.collection('students').countDocuments({ section: section });
    if (totalInSection === 0) {
      const seedList = section === 'filles' ? defaultGirlsStudents : (section === 'primaire' ? defaultPrimaireStudents : defaultBoysStudents);
      for (const [cls, list] of Object.entries(seedList)) {
        for (const s of list) {
          const studentObj = {
            _id: `${section}_${cls}_${s.name}`,
            name: s.name,
            photo: s.photo,
            birthday: s.birthday,
            class: cls,
            section: section,
            createdAt: new Date()
          };
          await db.collection('students').updateOne(
            { _id: studentObj._id },
            { $set: studentObj },
            { upsert: true }
          );
        }
      }
    }

    let query = {};
    if (section && section !== 'all') {
      query.section = section;
    }

    if (targetClass && targetClass !== 'all') {
      const escapedTarget = targetClass.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const escapedCanonical = canonicalClass ? canonicalClass.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : '';
      
      const classOrConditions = [
        { class: targetClass }
      ];
      if (canonicalClass) {
        classOrConditions.push({ class: canonicalClass });
        classOrConditions.push({ class: { $regex: new RegExp(`^${escapedCanonical}$`, 'i') } });
        classOrConditions.push({ class: { $regex: new RegExp(escapedCanonical, 'i') } });
      }
      classOrConditions.push({ class: { $regex: new RegExp(`^${escapedTarget}$`, 'i') } });
      
      query.$or = classOrConditions;
    }

    let students = await db.collection('students').find(query).sort({ name: 1 }).toArray();

    // Si aucun élève trouvé avec la section spécifique, chercher toutes sections pour cette classe
    if (students.length === 0 && targetClass && targetClass !== 'all') {
      const fallbackQuery = {
        $or: [
          { class: targetClass },
          { class: canonicalClass },
          { class: { $regex: new RegExp(canonicalClass || targetClass, 'i') } }
        ]
      };
      students = await db.collection('students').find(fallbackQuery).sort({ name: 1 }).toArray();
    }

    // Si toujours 0 élèves trouvés pour cette classe, auto-seeder des élèves pour cette classe !
    if (students.length === 0 && targetClass && targetClass !== 'all') {
      const clsKey = canonicalClass || targetClass;
      const seedDict = section === 'filles' ? defaultGirlsStudents : (section === 'primaire' ? defaultPrimaireStudents : defaultBoysStudents);
      let listToSeed = seedDict[clsKey];
      if (!listToSeed || listToSeed.length === 0) {
        // Liste par défaut générée
        const defaultNames = section === 'filles' 
          ? ["Sarah A.", "Mariam B.", "Khadija C.", "Fatima D.", "Nour E.", "Salma F."]
          : ["Mohamed A.", "Ahmed B.", "Youssef C.", "Omar D.", "Ali E.", "Hamza F."];
        listToSeed = defaultNames.map((nm, idx) => ({
          name: nm,
          photo: "",
          birthday: `0${(idx % 9) + 1}/201${idx % 5}`
        }));
      }

      for (const s of listToSeed) {
        const studentObj = {
          _id: `${section}_${clsKey}_${s.name.replace(/\s+/g, '_')}`,
          name: s.name,
          photo: s.photo || "",
          birthday: s.birthday || "01/2014",
          class: clsKey,
          section: section,
          createdAt: new Date()
        };
        await db.collection('students').updateOne(
          { _id: studentObj._id },
          { $set: studentObj },
          { upsert: true }
        );
      }
      students = await db.collection('students').find({ section: section, class: clsKey }).sort({ name: 1 }).toArray();
    }

    // Mise en cache (5 minutes) si résultats non vides
    if (students && students.length > 0) {
      studentsMemoryCache.set(cacheKey, students);
      setTimeout(() => studentsMemoryCache.delete(cacheKey), 5 * 60 * 1000);
    }

    res.status(200).json(students);
  } catch (error) {
    console.error('Erreur GET /api/admin/students:', error);
    res.status(500).json({ message: 'Erreur serveur.' });
  }
});

app.post('/api/admin/students', async (req, res) => {
  try {
    const { name, photo, birthday, class: className, section = 'garcons' } = req.body;
    if (!name || !className) {
      return res.status(400).json({ message: 'Nom et classe requis.' });
    }
    const db = await connectToDatabase();
    const cleanName = name.trim();
    const studentId = `${section}_${className}_${cleanName}`;
    const formattedPhoto = convertGoogleDriveUrl(photo || '');

    const studentData = {
      _id: studentId,
      name: cleanName,
      photo: formattedPhoto,
      birthday: birthday || '',
      class: className,
      section: section,
      updatedAt: new Date()
    };

    await db.collection('students').updateOne(
      { _id: studentId },
      { $set: studentData },
      { upsert: true }
    );

    invalidateStudentsCache(section);

    res.status(200).json({ success: true, message: `Élève '${cleanName}' enregistré avec succès.`, student: studentData });
  } catch (error) {
    console.error('Erreur POST /api/admin/students:', error);
    res.status(500).json({ message: 'Erreur serveur.' });
  }
});

app.delete('/api/admin/students', async (req, res) => {
  try {
    const { id, name, class: className, section = 'garcons' } = req.body;
    const db = await connectToDatabase();
    const studentId = id || `${section}_${className}_${name}`;

    await db.collection('students').deleteOne({ _id: studentId });
    if (name) {
      await db.collection('students').deleteMany({ name: name.trim(), section: section });
    }
    invalidateStudentsCache(section);
    res.status(200).json({ success: true, message: 'Élève supprimé avec succès.' });
  } catch (error) {
    console.error('Erreur DELETE /api/admin/students:', error);
    res.status(500).json({ message: 'Erreur serveur.' });
  }
});

app.post('/api/admin/students/move', async (req, res) => {
  try {
    const { studentId, oldClass, newClass, name, studentName, section = 'garcons' } = req.body;
    if (!newClass) {
      return res.status(400).json({ success: false, error: 'La nouvelle classe est obligatoire.' });
    }
    const db = await connectToDatabase();
    const targetName = (name || studentName || '').trim();

    let student = null;
    if (studentId) {
      student = await db.collection('students').findOne({ _id: studentId });
      if (!student) {
        try {
          const { ObjectId } = require('mongodb');
          if (ObjectId.isValid(studentId)) {
            student = await db.collection('students').findOne({ _id: new ObjectId(studentId) });
          }
        } catch (e) {}
      }
    }
    if (!student && targetName && oldClass) {
      student = await db.collection('students').findOne({
        name: { $regex: new RegExp(`^${targetName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
        class: oldClass,
        section: section
      });
    }
    if (!student && targetName) {
      student = await db.collection('students').findOne({
        name: { $regex: new RegExp(`^${targetName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
        section: section
      });
    }

    // Si l'élève n'était pas encore persisté dans la BD mais fait partie des données initiales
    if (!student && targetName) {
      for (const [cls, list] of Object.entries(defaultStudents)) {
        const match = list.find(s => s.name.trim().toLowerCase() === targetName.toLowerCase());
        if (match) {
          student = {
            _id: `${section}_${cls}_${match.name}`,
            name: match.name,
            photo: match.photo,
            birthday: match.birthday,
            class: cls,
            section: section,
            createdAt: new Date()
          };
          break;
        }
      }
    }

    if (!student) {
      return res.status(404).json({ success: false, error: "Élève introuvable." });
    }

    const currentOldClass = student.class || oldClass;
    const finalStudentName = (student.name || targetName).trim();
    const currentSection = student.section || section;
    const oldId = student._id;
    const newId = `${currentSection}_${newClass}_${finalStudentName}`;

    // Supprimer l'ancien document si l'ID a changé
    if (oldId && String(oldId) !== String(newId)) {
      await db.collection('students').deleteOne({ _id: oldId });
    }

    // Supprimer tout éventuel doublon avec l'ancien nom et classe
    if (currentOldClass && currentOldClass !== newClass) {
      await db.collection('students').deleteMany({
        _id: { $ne: newId },
        name: { $regex: new RegExp(`^${finalStudentName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
        section: currentSection,
        class: currentOldClass
      });
    }

    // Créer / mettre à jour avec la nouvelle classe
    const updatedStudent = {
      ...student,
      _id: newId,
      name: finalStudentName,
      class: newClass,
      section: currentSection,
      updatedAt: new Date()
    };

    await db.collection('students').updateOne(
      { _id: newId },
      { $set: updatedStudent },
      { upsert: true }
    );

    // Mettre à jour les évaluations associées à l'élève
    try {
      await db.collection('evaluations').updateMany(
        { studentName: finalStudentName, section: currentSection },
        { $set: { class: newClass } }
      );
    } catch (evalErr) {
      console.warn('Note mise à jour evaluations:', evalErr.message);
    }

    // Mettre à jour les étoiles journalières si présentes
    try {
      await db.collection('daily_stars').updateMany(
        { studentName: finalStudentName, section: currentSection },
        { $set: { class: newClass } }
      );
    } catch (starErr) {
      console.warn('Note mise à jour daily_stars:', starErr.message);
    }

    res.status(200).json({
      success: true,
      message: `L'élève '${finalStudentName}' a été déplacé avec succès de ${currentOldClass} vers ${newClass}.`,
      student: updatedStudent
    });
  } catch (error) {
    console.error('Erreur POST /api/admin/students/move:', error);
    res.status(500).json({ success: false, error: 'Erreur serveur lors du déplacement de l\'élève.' });
  }
});

// ============================================================================
// API PORTAIL DEVOIRS ET ÉVALUATIONS (AVEC TRANSFERT AUTOMATIQUE)
// ============================================================================

function isRowMatchingTeacherExact(rowEns, targetTeacher, tableTeacher) {
  if (!rowEns || !String(rowEns).trim()) return false;
  if (!targetTeacher || targetTeacher === 'all') return true;

  const normEns = (s) => String(s || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const rNorm = normEns(rowEns);
  const tNorm = normEns(targetTeacher);
  const tableNorm = tableTeacher ? normEns(tableTeacher) : '';

  // 1. Égalité stricte exacte ou via nom de table
  if (rNorm === tNorm || (tableNorm && rNorm === tableNorm)) return true;

  // 2. Gestion de l'enseignante de musique (Farah)
  const isMusic = (n) => n.includes('musique') || n.includes('farah') || n.includes('موسيقى');
  if (isMusic(tNorm) || (tableNorm && isMusic(tableNorm))) {
    return isMusic(rNorm);
  }

  // 3. Gestion Amal Arabe vs Amal générale
  const isAmalArabe = (n) => (n.includes('amal') || n.includes('أمل') || n.includes('امل')) && (n.includes('arabe') || n.includes('عربي') || n.includes('عربية'));
  const isAmalSole = (n) => (n.includes('amal') || n.includes('أمل') || n.includes('امل')) && !isAmalArabe(n);

  if (isAmalArabe(tNorm) || (tableNorm && isAmalArabe(tableNorm))) {
    return isAmalArabe(rNorm);
  }
  if (isAmalSole(tNorm) || (tableNorm && isAmalSole(tableNorm))) {
    return isAmalSole(rNorm);
  }

  // 4. Sous-chaîne significative (au moins 3 caractères) pour les noms composés
  if (tNorm.length >= 3 && (rNorm.includes(tNorm) || tNorm.includes(rNorm))) {
    return true;
  }
  if (tableNorm && tableNorm.length >= 3 && (rNorm.includes(tableNorm) || tableNorm.includes(rNorm))) {
    return true;
  }

  return false;
}

app.get('/api/teacher-homeworks', async (req, res) => {
  try {
    const { teacher, tableTeacher, section = 'garcons', week } = req.query;
    const db = await connectToDatabase();

    // 1. Charger les plans de la section ou de toutes les sections
    let query = {};
    if (section && section !== 'all' && section !== 'toutes' && section !== 'Tous') {
      query.section = section;
    }
    if (week && !isNaN(parseInt(week, 10))) {
      query.week = parseInt(week, 10);
    }
    let planDocs = await db.collection('plans').find(query).toArray();

    // Charger les semaines et dates officielles
    const weeksConfigDoc = await db.collection('school_weeks_config').find({}).toArray();
    const weeksMap = {};
    if (weeksConfigDoc && weeksConfigDoc.length > 0) {
      weeksConfigDoc.forEach(w => {
        weeksMap[w.week] = {
          title: w.title || `Semaine ${w.week}`,
          titleAr: w.titleAr || `الأسبوع ${w.week}`,
          start: w.start,
          end: w.end
        };
      });
    }

    // Charger photos des enseignants pour affichage dans l'en-tête et les cartes
    const photosDocs = await db.collection('teachers_photos').find({}).toArray();
    const teachersPhotosMap = {};
    photosDocs.forEach(d => {
      if (d.teacherName && d.photoUrl) {
        teachersPhotosMap[d.teacherName.trim()] = d.photoUrl;
      }
    });
    try {
      const usersWithPhotos = await db.collection('users').find({ photoUrl: { $exists: true, $ne: '' } }).toArray();
      usersWithPhotos.forEach(u => {
        if (u.username && u.photoUrl && !teachersPhotosMap[u.username.trim()]) {
          teachersPhotosMap[u.username.trim()] = u.photoUrl;
        }
        if (u.tableTeacherName && u.photoUrl && !teachersPhotosMap[u.tableTeacherName.trim()]) {
          teachersPhotosMap[u.tableTeacherName.trim()] = u.photoUrl;
        }
      });
    } catch (ue) {
      console.warn('Note photos utilisateurs:', ue.message);
    }

    // Charger toutes les évaluations existantes pour vérifier le statut évalué/non évalué
    const evalQuery = (section && section !== 'all' && section !== 'toutes' && section !== 'Tous')
      ? { $or: [{ section }, { section: { $exists: false } }] }
      : {};
    const allEvaluations = await db.collection('evaluations').find(evalQuery).toArray();
    const evalMap = new Set();
    const norm = (s) => String(s || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

    allEvaluations.forEach(ev => {
      if (ev.class && ev.date && ev.subject) {
        evalMap.add(`${norm(ev.class)}_${String(ev.date).trim()}_${norm(ev.subject)}`);
      }
      if (ev.class && ev.date) {
        evalMap.add(`${norm(ev.class)}_${String(ev.date).trim()}`);
      }
    });

    const teacherHws = [];
    const sectionTeachersMap = new Map();
    const targetTeacher = (teacher || '').trim();

    planDocs.forEach(doc => {
      const wNum = doc.week;
      const wDates = weeksMap[wNum] || specificWeekDateRangesNode[wNum] || { start: '', end: '', title: `Semaine ${wNum}`, titleAr: `الأسبوع ${wNum}` };
      const weekStartDate = wDates.start ? new Date(wDates.start + 'T00:00:00Z') : null;

      if (Array.isArray(doc.data)) {
        doc.data.forEach(row => {
          const rowEns = (row[findKey(row, 'Enseignant')] || '').trim();
          const rowDevoirs = (row[findKey(row, 'Devoirs')] || '').trim();
          const rowClasse = (row[findKey(row, 'Classe')] || '').trim();
          const rowMatiere = (row[findKey(row, 'Matière')] || '').trim();
          const rowJour = (row[findKey(row, 'Jour')] || '').trim();
          const rowPeriode = (row[findKey(row, 'Période')] || '').trim();
          const rowLecon = (row[findKey(row, 'Leçon')] || '').trim();
          const rowTravaux = (row[findKey(row, 'Travaux de classe')] || '').trim();

          if (rowDevoirs && rowDevoirs !== '') {
            // Recenser l'enseignant pour la liste de sélection (admin / superviseurs)
            if (rowEns) {
              if (!sectionTeachersMap.has(rowEns)) {
                sectionTeachersMap.set(rowEns, {
                  name: rowEns,
                  photoUrl: teachersPhotosMap[rowEns] || '',
                  count: 0,
                  evaluatedCount: 0
                });
              }
            }

            // Vérification stricte : uniquement l'enseignant demandé !
            const isMatch = isRowMatchingTeacherExact(rowEns, targetTeacher, tableTeacher);

            let exactDate = '';
            let formattedDateFr = '';
            const dayName = extractDayNameFromString(rowJour) || rowJour;
            if (weekStartDate && dayName) {
              const dObj = getDateForDayNameNode(weekStartDate, dayName);
              if (dObj && !isNaN(dObj.getTime())) {
                exactDate = dObj.toISOString().split('T')[0];
                formattedDateFr = formatDateFrenchNode(dObj);
              }
            }
            if (!exactDate && wDates.start) {
              exactDate = wDates.start;
            }

            const evalKeyFull = `${norm(rowClasse)}_${exactDate}_${norm(rowMatiere)}`;
            const evalKeyClassDate = `${norm(rowClasse)}_${exactDate}`;
            const isEvaluated = evalMap.has(evalKeyFull) || evalMap.has(evalKeyClassDate);

            if (rowEns && sectionTeachersMap.has(rowEns)) {
              const tStats = sectionTeachersMap.get(rowEns);
              tStats.count += 1;
              if (isEvaluated) tStats.evaluatedCount += 1;
            }

            if (isMatch) {
              teacherHws.push({
                week: wNum,
                section: doc.section || section || 'garcons',
                weekTitle: wDates.title || `Semaine ${wNum}`,
                weekTitleAr: wDates.titleAr || `الأسبوع ${wNum}`,
                weekStartDate: wDates.start,
                weekEndDate: wDates.end,
                classe: rowClasse,
                matiere: rowMatiere,
                jour: rowJour,
                periode: rowPeriode,
                lecon: rowLecon,
                travaux: rowTravaux,
                devoir: rowDevoirs,
                enseignant: rowEns,
                teacherPhotoUrl: teachersPhotosMap[rowEns] || '',
                date: exactDate,
                formattedDateFr: formattedDateFr || `${rowJour} (S${wNum})`,
                isEvaluated: isEvaluated
              });
            }
          }
        });
      }
    });

    teacherHws.sort((a, b) => {
      if (a.week !== b.week) return a.week - b.week;
      const cComp = String(a.classe).localeCompare(String(b.classe));
      if (cComp !== 0) return cComp;
      return String(a.date || '').localeCompare(String(b.date || ''));
    });

    const sectionTeachers = Array.from(sectionTeachersMap.values()).sort((a, b) => a.name.localeCompare(b.name));

    res.status(200).json({
      success: true,
      homeworks: teacherHws,
      sectionTeachers,
      currentTeacher: targetTeacher
    });
  } catch (error) {
    console.error('Erreur GET /api/teacher-homeworks:', error);
    res.status(500).json({ success: false, error: error.message, homeworks: [], sectionTeachers: [] });
  }
});

app.get('/api/evaluations', async (req, res) => {
  try {
    const { class: className, student: studentName, date: dateQuery, week, section = 'garcons' } = req.query;
    if (!className || !dateQuery) {
      return res.status(400).json({ error: 'Classe et date sont requises.' });
    }

    const db = await connectToDatabase();

    // 1. EXTRACTION AUTOMATIQUE DES DEVOIRS DEPUIS 'plans' DE LA SECTION
    let planDocs = await db.collection('plans').find({
      $or: [
        { section: section },
        { _id: new RegExp(`^${section}_`) },
        { _id: section }
      ]
    }).toArray();

    // Déterminer la semaine cible pour la date demandée
    let targetWeekNumber = null;
    if (specificWeekDateRangesNode && typeof specificWeekDateRangesNode === 'object') {
      for (const [wStr, dates] of Object.entries(specificWeekDateRangesNode)) {
        if (dates.start && dates.end && dateQuery >= dates.start && dateQuery <= dates.end) {
          targetWeekNumber = parseInt(wStr, 10);
          break;
        }
      }
      if (!targetWeekNumber) {
        // Si dateQuery tombe un vendredi ou samedi (week-end), rattacher à la semaine scolaire correspondante
        const qDate = new Date(dateQuery + 'T00:00:00Z');
        if (!isNaN(qDate.getTime())) {
          const qDay = qDate.getUTCDay();
          if (qDay === 5 || qDay === 6) {
            const prevThu = new Date(qDate);
            prevThu.setUTCDate(qDate.getUTCDate() - (qDay === 5 ? 1 : 2));
            const prevThuStr = prevThu.toISOString().split('T')[0];
            for (const [wStr, dates] of Object.entries(specificWeekDateRangesNode)) {
              if (dates.start && dates.end && prevThuStr >= dates.start && prevThuStr <= dates.end) {
                targetWeekNumber = parseInt(wStr, 10);
                break;
              }
            }
          }
        }
      }
    }

    if (!targetWeekNumber) {
      targetWeekNumber = getCurrentWeekNumber(new Date(dateQuery));
    }

    const targetWeekConfig = (specificWeekDateRangesNode && specificWeekDateRangesNode[targetWeekNumber]) || {};
    const weekStartDate = targetWeekConfig.start ? new Date(targetWeekConfig.start + 'T00:00:00Z') : null;

    // Préparer la liste des 5 jours d'école (Dimanche à Jeudi) avec leurs dates précises
    const schoolDays = [
      { day: "Dimanche", dayAr: "الأحد", offset: 0 },
      { day: "Lundi", dayAr: "الإثنين", offset: 1 },
      { day: "Mardi", dayAr: "الثلاثاء", offset: 2 },
      { day: "Mercredi", dayAr: "الأربعاء", offset: 3 },
      { day: "Jeudi", dayAr: "الخميس", offset: 4 }
    ].map(sd => {
      let dStr = '';
      if (weekStartDate && !isNaN(weekStartDate.getTime())) {
        const d = new Date(weekStartDate);
        d.setUTCDate(d.getUTCDate() + sd.offset);
        dStr = d.toISOString().split('T')[0];
      }
      return {
        day: sd.day,
        dayAr: sd.dayAr,
        date: dStr,
        count: 0
      };
    });

    // Prioriser le plan de la semaine ciblée
    let targetPlanDoc = planDocs.find(doc => Number(doc.week) === Number(targetWeekNumber));
    if (!targetPlanDoc && planDocs.length > 0) {
      targetPlanDoc = planDocs[0];
    }

    // Détection du vendredi ou samedi -> afficher les devoirs du jeudi précédent
    let effectiveDateQuery = dateQuery;
    let isWeekendRedirect = false;
    const qDate = new Date(dateQuery + 'T00:00:00Z');
    if (!isNaN(qDate.getTime())) {
      const qDay = qDate.getUTCDay(); // 0=Dimanche, 1=Lundi, 2=Mardi, 3=Mercredi, 4=Jeudi, 5=Vendredi, 6=Samedi
      if (qDay === 5) { // Vendredi -> Jeudi précédent (-1 jour)
        const prevThu = new Date(qDate);
        prevThu.setUTCDate(qDate.getUTCDate() - 1);
        effectiveDateQuery = prevThu.toISOString().split('T')[0];
        isWeekendRedirect = true;
      } else if (qDay === 6) { // Samedi -> Jeudi précédent (-2 jours)
        const prevThu = new Date(qDate);
        prevThu.setUTCDate(qDate.getUTCDate() - 2);
        effectiveDateQuery = prevThu.toISOString().split('T')[0];
        isWeekendRedirect = true;
      }
    }

    const dayNameFr = isWeekendRedirect ? "Jeudi" : getDayNameFr(effectiveDateQuery);
    const dayNameParsed = isWeekendRedirect ? "Jeudi" : (extractDayNameFromString(effectiveDateQuery) || extractDayNameFromString(dayNameFr) || dayNameFr);
    const cleanDateQuery = String(effectiveDateQuery).trim().toLowerCase();

    const normClass = (s) => String(s || '').trim().toLowerCase().replace(/\s+/g, '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const targetNormClass = normClass(className);

    const homeworks = [];
    const weeklyHomeworks = [];
    const seenAssignments = new Set();
    const seenWeekly = new Set();

    // Parcourir les documents de plans de la section (en commençant par la semaine cible)
    const docsToProcess = targetPlanDoc ? [targetPlanDoc, ...planDocs.filter(d => d !== targetPlanDoc)] : planDocs;

    docsToProcess.forEach(doc => {
      if (Array.isArray(doc.data)) {
        const isTargetWeek = Number(doc.week) === Number(targetWeekNumber);
        const docWConfig = (specificWeekDateRangesNode && specificWeekDateRangesNode[doc.week]) || {};
        const docStartDate = docWConfig.start ? new Date(docWConfig.start + 'T00:00:00Z') : null;

        doc.data.forEach(row => {
          const rowClass = row[findKey(row, 'Classe')];
          const rowDay = row[findKey(row, 'Jour')];
          const rowDevoirs = row[findKey(row, 'Devoirs')];
          const rowMatiere = row[findKey(row, 'Matière')];
          const rowEnseignant = row[findKey(row, 'Enseignant')];
          const rowPeriode = row[findKey(row, 'Période')];
          const rowLecon = row[findKey(row, 'Leçon')];
          const rowTravaux = row[findKey(row, 'Travaux de classe')];

          if (rowClass && rowDevoirs && String(rowDevoirs).trim() !== '') {
            const rNorm = normClass(rowClass);
            const classMatch = (rNorm === targetNormClass || rNorm.includes(targetNormClass) || targetNormClass.includes(rNorm));

            if (classMatch) {
              const stdDay = extractDayNameFromString(rowDay) || getDayNameFr(rowDay) || String(rowDay || '').trim();
              let exactRowDate = '';
              let formattedDateFr = '';

              if (docStartDate && stdDay) {
                const dObj = getDateForDayNameNode(docStartDate, stdDay);
                if (dObj && !isNaN(dObj.getTime())) {
                  exactRowDate = dObj.toISOString().split('T')[0];
                  formattedDateFr = formatDateFrenchNode(dObj);
                }
              }

              // Mettre à jour le compteur du jour d'école pour la semaine cible
              if (isTargetWeek && stdDay) {
                const sDayObj = schoolDays.find(sd => sd.day === stdDay || sd.date === exactRowDate);
                if (sDayObj) {
                  sDayObj.count++;
                }
              }

              // Vérifier si cette ligne correspond à la date demandée (ou au jeudi précédent en cas de vendredi/samedi)
              let matchToday = false;
              if (exactRowDate && (exactRowDate === dateQuery || exactRowDate === effectiveDateQuery)) {
                matchToday = true;
              } else if (rowDay) {
                const cleanRowDay = String(rowDay).trim().toLowerCase();
                const cleanStdDay = String(stdDay).trim().toLowerCase();
                const cleanDayQuery = String(dayNameParsed || '').trim().toLowerCase();
                if (
                  cleanRowDay === cleanDateQuery ||
                  cleanRowDay.includes(cleanDateQuery) ||
                  (isTargetWeek && cleanStdDay && cleanStdDay === cleanDayQuery) ||
                  (isTargetWeek && cleanRowDay.includes(cleanDayQuery))
                ) {
                  matchToday = true;
                }
              }

              const hwItem = {
                week: doc.week,
                subject: rowMatiere || 'Matière',
                assignment: rowDevoirs,
                teacher: rowEnseignant || 'Enseignant',
                period: rowPeriode || '',
                lesson: rowLecon || '',
                classWork: rowTravaux || '',
                day: stdDay || rowDay || '',
                exactDate: exactRowDate,
                formattedDateFr: formattedDateFr
              };

              const uniqueKey = `${doc.week}_${rowMatiere}_${rowDevoirs}_${stdDay}`;

              if (matchToday) {
                if (!seenAssignments.has(uniqueKey)) {
                  seenAssignments.add(uniqueKey);
                  homeworks.push(hwItem);
                }
              }

              if (isTargetWeek) {
                if (!seenWeekly.has(uniqueKey)) {
                  seenWeekly.add(uniqueKey);
                  weeklyHomeworks.push(hwItem);
                }
              }
            }
          }
        });
      }
    });

    // 2. RÉCUPÉRER LES ÉVALUATIONS DÉJÀ ENREGISTRÉES
    let evalDates = [dateQuery];
    if (isWeekendRedirect && effectiveDateQuery && effectiveDateQuery !== dateQuery) {
      evalDates.push(effectiveDateQuery);
    }
    let query = { class: className, date: { $in: evalDates }, section: section };
    if (studentName) {
      query.studentName = studentName;
    }

    let evaluations = await db.collection('evaluations').find(query).toArray();
    if ((!evaluations || evaluations.length === 0) && section === 'garcons') {
      delete query.section;
      evaluations = await db.collection('evaluations').find(query).toArray();
    }

    let responseData = { 
      homeworks, 
      weeklyHomeworks,
      schoolDays,
      evaluations: evaluations || [],
      targetWeek: targetWeekNumber,
      isWeekendRedirect,
      effectiveDate: effectiveDateQuery,
      weekStartDate: targetWeekConfig.start || '',
      weekEndDate: targetWeekConfig.end || ''
    };

    // 3. ÉVALUATIONS DE LA SEMAINE (SI SOLLICITÉES)
    if (week === 'true' && studentName) {
      const targetDate = moment.utc(dateQuery);
      const firstDayOfWeek = targetDate.clone().startOf('isoWeek');
      const lastDayOfWeek = targetDate.clone().endOf('isoWeek');

      const firstDayStr = firstDayOfWeek.format('YYYY-MM-DD');
      const lastDayStr = lastDayOfWeek.format('YYYY-MM-DD');

      responseData.weeklyEvaluations = await db.collection('evaluations').find({
        studentName: studentName,
        class: className,
        date: { $gte: firstDayStr, $lte: lastDayStr }
      }).toArray();
    }

    res.status(200).json(responseData);
  } catch (error) {
    console.error('Erreur GET /api/evaluations:', error);
    res.status(500).json({ error: 'Erreur serveur', details: error.message });
  }
});

app.post('/api/evaluations', async (req, res) => {
  try {
    const { evaluations, section = 'garcons' } = req.body;
    if (!evaluations || !Array.isArray(evaluations) || evaluations.length === 0) {
      return res.status(200).json({ message: 'Aucune évaluation à enregistrer.' });
    }
    const db = await connectToDatabase();
    const operations = evaluations.map(ev => ({
      updateOne: {
        filter: { date: ev.date, studentName: ev.studentName, class: ev.class, subject: ev.subject },
        update: { $set: { ...ev, section: section, updatedAt: new Date() } },
        upsert: true
      }
    }));
    await db.collection('evaluations').bulkWrite(operations);
    res.status(200).json({ message: 'Évaluations enregistrées avec succès.' });
  } catch (error) {
    console.error('Erreur POST /api/evaluations:', error);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

app.get('/api/weekly-summary', async (req, res) => {
  try {
    const section = req.query.section || 'garcons';
    const db = await connectToDatabase();
    const today = moment().startOf('day');
    const dayOfWeek = today.day();

    let targetWeekStart = today.clone().subtract(7, 'days').day(0);
    let targetWeekEnd = today.clone().subtract(7, 'days').day(4);

    const weekIdentifier = targetWeekStart.format('YYYY-[W]WW');
    const existing = await db.collection('students_of_the_week').find({ weekIdentifier, section }).toArray();
    if (existing && existing.length > 0) {
      return res.status(200).json({ studentsOfWeek: existing, showDisplay: true, isLastWeek: true });
    }

    const dateQuery = {
      $gte: targetWeekStart.format('YYYY-MM-DD'),
      $lte: targetWeekEnd.format('YYYY-MM-DD')
    };

    const dailyStars = await db.collection('daily_stars').find({ date: dateQuery, section }).toArray();
    const allEvals = await db.collection('evaluations').find({ date: dateQuery, section }).toArray();

    const studentsByClass = {};
    dailyStars.forEach(starRecord => {
      const classKey = starRecord.className;
      if (!studentsByClass[classKey]) studentsByClass[classKey] = {};
      if (!studentsByClass[classKey][starRecord.studentName]) {
        studentsByClass[classKey][starRecord.studentName] = { stars: 0, dailyRecords: [], progressPercentage: 0 };
      }
      if (starRecord.earnedStar) studentsByClass[classKey][starRecord.studentName].stars += starRecord.earnedStar;
      studentsByClass[classKey][starRecord.studentName].dailyRecords.push(starRecord);
    });

    allEvals.forEach(ev => {
      const classKey = ev.class;
      if (!studentsByClass[classKey]) studentsByClass[classKey] = {};
      if (!studentsByClass[classKey][ev.studentName]) {
        studentsByClass[classKey][ev.studentName] = { evals: [], class: ev.class };
      }
      if (!studentsByClass[classKey][ev.studentName].evals) {
        studentsByClass[classKey][ev.studentName].evals = [];
      }
      studentsByClass[classKey][ev.studentName].evals.push(ev);
    });

    let topStudentOverall = null;
    let topStarsOverall = -1;

    for (const classKey in studentsByClass) {
      const students = studentsByClass[classKey];
      for (const studentName in students) {
        const studentData = students[studentName];
        const studentEvals = allEvals.filter(ev => ev.class === classKey && ev.studentName === studentName);
        let totalScore = 0, maxScore = 0;

        studentEvals.forEach(ev => {
          const d = moment(ev.date).day();
          if (d >= 0 && d <= 4 && ev.status !== 'Absent') {
            totalScore += (ev.status === 'Fait' ? 10 : ev.status === 'Partiellement Fait' ? 5 : 0) + (ev.participation || 0) + (ev.behavior || 0);
            maxScore += 30;
          }
        });

        const progress = maxScore > 0 ? Math.round((totalScore / maxScore) * 100) : 0;
        const stars = studentData.stars || calculateStarsLegacy(studentEvals);

        if (stars >= 3 && progress > 79) {
          if (stars > topStarsOverall) {
            topStarsOverall = stars;
            topStudentOverall = {
              name: studentName,
              class: classKey,
              stars: stars,
              progressPercentage: progress,
              progressComment: { fr: 'Excellent', ar: 'ممتاز' },
              weekIdentifier: weekIdentifier,
              section: section,
              createdAt: new Date()
            };
          }
        }
      }
    }

    const studentsOfWeek = topStudentOverall ? [topStudentOverall] : [];
    if (studentsOfWeek.length > 0) {
      await db.collection('students_of_the_week').insertMany(studentsOfWeek);
    }

    res.status(200).json({ studentsOfWeek, showDisplay: true, isLastWeek: true });
  } catch (error) {
    console.error('Erreur GET /api/weekly-summary:', error);
    res.status(500).json({ studentsOfWeek: [], showDisplay: false });
  }
});

app.get('/api/daily-stars', async (req, res) => {
  try {
    const { studentName, className, date, week, section = 'garcons' } = req.query;
    const db = await connectToDatabase();
    let query = { section: section };
    if (studentName) query.studentName = studentName;
    if (className) query.className = className;
    if (date) query.date = date;

    if (week) {
      const today = moment().startOf('day');
      query.date = {
        $gte: today.clone().day(0).format('YYYY-MM-DD'),
        $lte: today.clone().day(4).format('YYYY-MM-DD')
      };
    }

    const stars = await db.collection('daily_stars').find(query).toArray();
    res.status(200).json({ stars });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/daily-stars', async (req, res) => {
  try {
    const { date, section = 'garcons' } = req.body;
    const targetDate = date || moment().format('YYYY-MM-DD');
    const db = await connectToDatabase();

    const evaluations = await db.collection('evaluations').find({ date: targetDate, section }).toArray();
    if (evaluations.length === 0) {
      return res.status(200).json({ message: 'Aucune évaluation pour cette date.', date: targetDate });
    }

    const evalsByStudent = {};
    evaluations.forEach(ev => {
      const key = `${ev.studentName}_${ev.class}`;
      if (!evalsByStudent[key]) {
        evalsByStudent[key] = { studentName: ev.studentName, className: ev.class, evaluations: [] };
      }
      evalsByStudent[key].evaluations.push(ev);
    });

    const dailyStars = [];
    for (const key in evalsByStudent) {
      const sData = evalsByStudent[key];
      const earnedStarValue = calculateDailyStar(sData.evaluations);
      const starRecord = {
        date: targetDate,
        studentName: sData.studentName,
        className: sData.className,
        earnedStar: earnedStarValue,
        section: section,
        createdAt: new Date()
      };
      await db.collection('daily_stars').updateOne(
        { date: targetDate, studentName: sData.studentName, className: sData.className, section: section },
        { $set: starRecord },
        { upsert: true }
      );
      dailyStars.push(starRecord);
    }
    res.status(200).json({ message: `Traité pour ${dailyStars.length} élèves.`, stars: dailyStars });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/photo-of-the-day', async (req, res) => {
  try {
    const section = req.query.section || 'garcons';
    const db = await connectToDatabase();
    await deleteOldPhotos(db.collection('photos_of_the_day'));
    const latest = await db.collection('photos_of_the_day').find({ section }).sort({ createdAt: -1 }).limit(1).toArray();
    res.status(200).json(latest[0] || {});
  } catch (e) {
    res.status(500).json({});
  }
});

app.post('/api/photo-of-the-day', async (req, res) => {
  try {
    let { imageUrl, comment, section = 'garcons' } = req.body;
    if (!imageUrl) return res.status(400).json({ error: 'URL requise' });
    imageUrl = convertGoogleDriveUrl(imageUrl);
    const db = await connectToDatabase();
    await db.collection('photos_of_the_day').insertOne({ url: imageUrl, comment: comment || '', section, createdAt: new Date() });
    res.status(200).json({ message: 'Photo de félicitations ajoutée.', convertedUrl: imageUrl });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/photo-2', async (req, res) => {
  try {
    const section = req.query.section || 'garcons';
    const db = await connectToDatabase();
    await deleteOldPhotos(db.collection('photos_celebration_2'));
    const latest = await db.collection('photos_celebration_2').find({ section }).sort({ createdAt: -1 }).limit(1).toArray();
    res.status(200).json(latest[0] || {});
  } catch (e) {
    res.status(500).json({});
  }
});

app.post('/api/photo-2', async (req, res) => {
  try {
    let { imageUrl, comment, section = 'garcons' } = req.body;
    if (!imageUrl) return res.status(400).json({ error: 'URL requise' });
    imageUrl = convertGoogleDriveUrl(imageUrl);
    const db = await connectToDatabase();
    await db.collection('photos_celebration_2').insertOne({ url: imageUrl, comment: comment || '', section, createdAt: new Date() });
    res.status(200).json({ message: 'Photo 2 ajoutée.', convertedUrl: imageUrl });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/photo-3', async (req, res) => {
  try {
    const section = req.query.section || 'garcons';
    const db = await connectToDatabase();
    await deleteOldPhotos(db.collection('photos_celebration_3'));
    const latest = await db.collection('photos_celebration_3').find({ section }).sort({ createdAt: -1 }).limit(1).toArray();
    res.status(200).json(latest[0] || {});
  } catch (e) {
    res.status(500).json({});
  }
});

app.post('/api/photo-3', async (req, res) => {
  try {
    let { imageUrl, comment, section = 'garcons' } = req.body;
    if (!imageUrl) return res.status(400).json({ error: 'URL requise' });
    imageUrl = convertGoogleDriveUrl(imageUrl);
    const db = await connectToDatabase();
    await db.collection('photos_celebration_3').insertOne({ url: imageUrl, comment: comment || '', section, createdAt: new Date() });
    res.status(200).json({ message: 'Photo 3 ajoutée.', convertedUrl: imageUrl });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/send-message', async (req, res) => {
  try {
    const { teacherName, parentName, parentPhone, message, timestamp, section = 'garcons', studentName, studentClass } = req.body;
    if (!teacherName || !parentName || !message) return res.status(400).json({ error: 'Données incomplètes' });
    const db = await connectToDatabase();
    const doc = {
      teacherName: String(teacherName).trim(),
      parentName: String(parentName).trim(),
      parentPhone: String(parentPhone || '').trim(),
      studentName: String(studentName || '').trim(),
      studentClass: String(studentClass || '').trim(),
      message: String(message).trim(),
      date: timestamp || new Date().toISOString(),
      read: false,
      section,
      createdAt: new Date()
    };
    const result = await db.collection('teacher_messages').insertOne(doc);
    res.status(200).json({ message: 'Message envoyé avec succès', id: result.insertedId, doc });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/get-messages', async (req, res) => {
  try {
    const { teacherName, section = 'garcons' } = req.query;
    const db = await connectToDatabase();
    let query = {};
    if (teacherName && teacherName !== 'all') {
      const cleanT = String(teacherName).replace(/^(M\.|Mme|Mr|Prof|Professeur|Oustadh|الاستاذ|الأستاذ)\s+/i, '').trim();
      const escapedT = cleanT.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      query.teacherName = { $regex: new RegExp(escapedT, 'i') };
    } else if (section && section !== 'all') {
      query.$or = [{ section: section }, { section: { $exists: false } }];
    }
    const messages = await db.collection('teacher_messages').find(query).sort({ createdAt: -1 }).toArray();
    
    // Récupérer toutes les réponses associées à ces messages
    const msgIds = messages.map(m => String(m._id));
    const replies = await db.collection('teacher_replies').find({ messageId: { $in: msgIds } }).sort({ createdAt: 1 }).toArray();
    let parentReplies = [];
    try {
      parentReplies = await db.collection('parent_chat_replies').find({ messageId: { $in: msgIds } }).sort({ createdAt: 1 }).toArray();
    } catch (eSub) {}

    const repliesMap = {};
    replies.forEach(r => {
      const mid = String(r.messageId);
      if (!repliesMap[mid]) repliesMap[mid] = [];
      repliesMap[mid].push({ ...r, type: 'teacher' });
    });
    parentReplies.forEach(pr => {
      const mid = String(pr.messageId);
      if (!repliesMap[mid]) repliesMap[mid] = [];
      repliesMap[mid].push({ ...pr, type: 'parent', replyText: pr.text });
    });

    // Trier les réponses par ordre chronologique
    Object.keys(repliesMap).forEach(mid => {
      repliesMap[mid].sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0));
    });

    const enrichedMessages = messages.map(m => ({
      ...m,
      id: String(m._id),
      replies: repliesMap[String(m._id)] || []
    }));

    res.status(200).json(enrichedMessages);
  } catch (e) {
    console.error('Erreur /api/get-messages:', e);
    res.status(500).json([]);
  }
});

app.post('/api/mark-messages-read', async (req, res) => {
  try {
    const { teacherName, section = 'garcons', messageId } = req.body;
    const db = await connectToDatabase();
    if (messageId) {
      const { ObjectId } = require('mongodb');
      let query = { _id: messageId };
      if (ObjectId.isValid(messageId)) {
        query = { $or: [{ _id: new ObjectId(messageId) }, { _id: messageId }] };
      }
      await db.collection('teacher_messages').updateOne(query, { $set: { read: true } });
      return res.status(200).json({ message: 'Message marqué comme lu' });
    }
    if (!teacherName) return res.status(400).json({ error: 'Nom enseignant requis' });
    const cleanT = String(teacherName).replace(/^(M\.|Mme|Mr|Prof|Professeur|Oustadh|الاستاذ|الأستاذ)\s+/i, '').trim();
    const regexT = new RegExp(cleanT.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    await db.collection('teacher_messages').updateMany({ teacherName: regexT, read: false }, { $set: { read: true } });
    res.status(200).json({ message: 'Messages marqués comme lus' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/unread-count', async (req, res) => {
  try {
    const { teacherName, section = 'garcons' } = req.query;
    if (!teacherName) return res.status(400).json({ error: 'Nom enseignant requis' });
    const db = await connectToDatabase();
    let query = { read: false };
    if (teacherName !== 'all') {
      const cleanT = String(teacherName).replace(/^(M\.|Mme|Mr|Prof|Professeur|Oustadh|الاستاذ|الأستاذ)\s+/i, '').trim();
      query.teacherName = { $regex: new RegExp(cleanT.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') };
    }
    const count = await db.collection('teacher_messages').countDocuments(query);
    res.status(200).json({ count });
  } catch (e) {
    res.status(500).json({ count: 0 });
  }
});

// Endpoint permettant à l'enseignant d'initier un message direct à un parent d'élève
app.post('/api/teacher-send-message', async (req, res) => {
  try {
    const { teacherName, parentName, parentPhone, studentName, studentClass, message, section = 'garcons' } = req.body;
    if (!teacherName || !message || String(message).trim() === '') {
      return res.status(400).json({ error: 'Nom enseignant et texte du message requis' });
    }
    const db = await connectToDatabase();
    const doc = {
      teacherName: String(teacherName).trim(),
      parentName: String(parentName || "Parent d'élève").trim(),
      parentPhone: String(parentPhone || '').trim(),
      studentName: String(studentName || '').trim(),
      studentClass: String(studentClass || '').trim(),
      message: String(message).trim(),
      date: new Date().toISOString(),
      read: true,
      fromTeacher: true,
      section,
      createdAt: new Date()
    };
    const result = await db.collection('teacher_messages').insertOne(doc);
    
    // Insérer dans teacher_replies pour déclencher la notification non-lue du parent
    await db.collection('teacher_replies').insertOne({
      messageId: String(result.insertedId),
      teacherName: String(teacherName).trim(),
      parentPhone: String(parentPhone || '').trim(),
      replyText: String(message).trim(),
      readByParent: false,
      createdAt: new Date()
    });

    res.status(200).json({ success: true, message: 'Message envoyé au parent avec succès', id: result.insertedId, doc });
  } catch (e) {
    console.error('Erreur /api/teacher-send-message:', e);
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/parent-register', async (req, res) => {
  try {
    const { firstName, lastName, phone, password, section = 'garcons' } = req.body;
    if (!firstName || !lastName || !phone || !password) {
      return res.status(400).json({ error: 'Tous les champs sont requis' });
    }
    const db = await connectToDatabase();
    const existing = await db.collection('parent_accounts').findOne({ phone });
    if (existing) {
      return res.status(409).json({ error: 'Ce numéro de téléphone est déjà enregistré' });
    }
    const hashedPassword = hashPassword(password);
    await db.collection('parent_accounts').insertOne({
      firstName, lastName, phone, password: hashedPassword, section, createdAt: new Date()
    });
    res.status(201).json({ message: 'Compte créé avec succès', parent: { firstName, lastName, phone } });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/parent-login', async (req, res) => {
  try {
    const { phone, password } = req.body;
    if (!phone || !password) return res.status(400).json({ error: 'Numéro et mot de passe requis' });
    const hashedPassword = hashPassword(password);
    const db = await connectToDatabase();
    const parent = await db.collection('parent_accounts').findOne({ phone, password: hashedPassword });
    if (!parent) return res.status(401).json({ error: 'Identifiants incorrects' });
    await db.collection('parent_accounts').updateOne({ phone }, { $set: { lastLogin: new Date() } });
    res.status(200).json({ message: 'Connexion réussie', parent: { firstName: parent.firstName, lastName: parent.lastName, phone: parent.phone } });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/parent-messages', async (req, res) => {
  try {
    const { phone, name, studentName } = req.query;
    if (!phone && !name && !studentName) return res.status(200).json({ messages: [], data: [] });
    const db = await connectToDatabase();
    
    let queryConditions = [];
    if (phone && phone.trim()) {
      const cleanPhone = phone.trim();
      queryConditions.push({ parentPhone: cleanPhone });
      const digitsOnly = cleanPhone.replace(/[^0-9]/g, '');
      if (digitsOnly.length >= 7) {
        queryConditions.push({ parentPhone: { $regex: new RegExp(digitsOnly.slice(-7)) } });
      }
    }
    if (name && name.trim()) {
      queryConditions.push({ parentName: { $regex: new RegExp(name.trim(), 'i') } });
    }
    if (studentName && studentName.trim()) {
      queryConditions.push({ studentName: { $regex: new RegExp(studentName.trim(), 'i') } });
    }

    const query = queryConditions.length > 1 ? { $or: queryConditions } : (queryConditions[0] || {});
    const messages = await db.collection('teacher_messages').find(query).sort({ createdAt: -1 }).toArray();

    const msgIds = messages.map(m => String(m._id));
    const replies = await db.collection('teacher_replies').find({ messageId: { $in: msgIds } }).sort({ createdAt: 1 }).toArray();
    
    // Récupérer également les sous-messages des parents s'il y en a
    let parentReplies = [];
    try {
      parentReplies = await db.collection('parent_chat_replies').find({ messageId: { $in: msgIds } }).sort({ createdAt: 1 }).toArray();
    } catch (eSub) {}

    const repliesMap = {};
    replies.forEach(r => {
      const mid = String(r.messageId);
      if (!repliesMap[mid]) repliesMap[mid] = [];
      repliesMap[mid].push({ ...r, type: 'teacher' });
    });
    parentReplies.forEach(pr => {
      const mid = String(pr.messageId);
      if (!repliesMap[mid]) repliesMap[mid] = [];
      repliesMap[mid].push({ ...pr, type: 'parent', replyText: pr.text });
    });

    // Trier les réponses par ordre chronologique
    Object.keys(repliesMap).forEach(mid => {
      repliesMap[mid].sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0));
    });

    const enrichedMessages = messages.map(m => ({
      ...m,
      id: String(m._id),
      replies: repliesMap[String(m._id)] || []
    }));

    res.status(200).json({ messages: enrichedMessages, data: enrichedMessages });
  } catch (e) {
    console.error('Erreur /api/parent-messages:', e);
    res.status(500).json({ messages: [], data: [] });
  }
});

app.get('/api/parent-unread-replies', async (req, res) => {
  try {
    const { phone } = req.query;
    if (!phone) return res.status(200).json({ unreadCount: 0 });
    const db = await connectToDatabase();
    const cleanPhone = phone.trim();
    const digitsOnly = cleanPhone.replace(/[^0-9]/g, '');
    let query = {
      readByParent: false,
      $or: [
        { parentPhone: cleanPhone },
        ...(digitsOnly.length >= 8 ? [{ parentPhone: { $regex: new RegExp(digitsOnly.slice(-8)) } }] : [])
      ]
    };
    const count = await db.collection('teacher_replies').countDocuments(query);
    res.status(200).json({ unreadCount: count });
  } catch (e) {
    res.status(500).json({ unreadCount: 0 });
  }
});

app.post('/api/mark-replies-read', async (req, res) => {
  try {
    const { phone, messageId } = req.body;
    const db = await connectToDatabase();
    let filter = { readByParent: false };
    if (messageId) {
      filter.messageId = String(messageId);
    } else if (phone) {
      const cleanPhone = String(phone).trim();
      const digitsOnly = cleanPhone.replace(/[^0-9]/g, '');
      filter.$or = [
        { parentPhone: cleanPhone },
        ...(digitsOnly.length >= 8 ? [{ parentPhone: { $regex: new RegExp(digitsOnly.slice(-8)) } }] : [])
      ];
    } else {
      return res.status(400).json({ error: 'Téléphone ou messageId requis' });
    }
    await db.collection('teacher_replies').updateMany(filter, { $set: { readByParent: true } });
    res.status(200).json({ message: 'Réponses marquées comme lues' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/send-reply', async (req, res) => {
  try {
    let { messageId, teacherName, parentPhone, replyText } = req.body;
    if (!messageId || !replyText || String(replyText).trim() === '') {
      return res.status(400).json({ error: 'Identifiant du message et texte de la réponse requis' });
    }
    const db = await connectToDatabase();
    const { ObjectId } = require('mongodb');

    let origMsg = null;
    try {
      if (ObjectId.isValid(messageId)) {
        origMsg = await db.collection('teacher_messages').findOne({ _id: new ObjectId(messageId) });
      }
    } catch (eId) {}
    if (!origMsg) {
      origMsg = await db.collection('teacher_messages').findOne({ _id: messageId });
    }

    if (!parentPhone && origMsg && origMsg.parentPhone) {
      parentPhone = origMsg.parentPhone;
    }
    if (!teacherName && origMsg && origMsg.teacherName) {
      teacherName = origMsg.teacherName;
    }
    if (!teacherName) teacherName = 'Enseignant';
    if (!parentPhone) parentPhone = '';

    const newReply = {
      messageId: String(messageId),
      teacherName: String(teacherName).trim(),
      parentPhone: String(parentPhone).trim(),
      replyText: String(replyText).trim(),
      readByParent: false,
      createdAt: new Date()
    };
    const insRes = await db.collection('teacher_replies').insertOne(newReply);
    newReply._id = insRes.insertedId;

    // Mettre à jour le statut du message d'origine
    try {
      if (origMsg && origMsg._id) {
        await db.collection('teacher_messages').updateOne(
          { _id: origMsg._id },
          { $set: { replied: true, read: true, repliedAt: new Date(), lastReply: String(replyText).trim() } }
        );
      }
    } catch (updateErr) {
      console.warn('Note: update message status non critique:', updateErr.message);
    }

    res.status(200).json({ success: true, message: 'Réponse envoyée avec succès', reply: newReply });
  } catch (e) {
    console.error('Erreur /api/send-reply:', e);
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/parent-send-chat', async (req, res) => {
  try {
    const { messageId, text, parentName, parentPhone } = req.body;
    if (!messageId || !text || String(text).trim() === '') {
      return res.status(400).json({ error: 'Message ID et texte requis' });
    }
    const db = await connectToDatabase();
    const { ObjectId } = require('mongodb');
    let origMsg = null;
    if (ObjectId.isValid(messageId)) {
      origMsg = await db.collection('teacher_messages').findOne({ _id: new ObjectId(messageId) });
    }
    if (!origMsg) {
      origMsg = await db.collection('teacher_messages').findOne({ _id: messageId });
    }

    const replyItem = {
      messageId: String(messageId),
      sender: 'parent',
      parentName: parentName || (origMsg ? origMsg.parentName : 'Parent'),
      parentPhone: parentPhone || (origMsg ? origMsg.parentPhone : ''),
      teacherName: origMsg ? origMsg.teacherName : '',
      text: String(text).trim(),
      createdAt: new Date()
    };
    await db.collection('parent_chat_replies').insertOne(replyItem);

    // Marquer le message comme non-lu pour que l'enseignant ait sa notification 1 en rouge
    if (origMsg && origMsg._id) {
      await db.collection('teacher_messages').updateOne(
        { _id: origMsg._id },
        { $set: { read: false, replied: false, lastParentReply: String(text).trim(), updatedAt: new Date() } }
      );
    }
    res.status(200).json({ success: true, item: replyItem });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/get-conversation', async (req, res) => {
  try {
    const { messageId } = req.query;
    if (!messageId) return res.status(400).json({ error: 'ID requis' });
    const db = await connectToDatabase();
    const message = await db.collection('teacher_messages').findOne({ _id: new (require('mongodb').ObjectId)(messageId) });
    const replies = await db.collection('teacher_replies').find({ messageId }).sort({ createdAt: 1 }).toArray();
    res.status(200).json({ message, replies });
  } catch (e) {
    res.status(500).json({ message: null, replies: [] });
  }
});

// ============================================================================
// ROUTES ADMIN : SUPERVISION DE TOUS LES MESSAGES ENSEIGNANTS - PARENTS
// ============================================================================
app.get('/api/admin/all-messages', async (req, res) => {
  try {
    const { section, teacherName, search } = req.query;
    const db = await connectToDatabase();
    
    let query = {};
    if (section && section !== 'all') {
      query.section = section;
    }
    if (teacherName && teacherName !== 'all') {
      query.teacherName = teacherName;
    }
    if (search && search.trim() !== '') {
      const searchRegex = new RegExp(search.trim(), 'i');
      query.$or = [
        { teacherName: searchRegex },
        { parentName: searchRegex },
        { parentPhone: searchRegex },
        { message: searchRegex }
      ];
    }
    
    const messages = await db.collection('teacher_messages').find(query).sort({ createdAt: -1 }).toArray();
    
    // Récupérer toutes les réponses associées à ces messages
    const messageIds = messages.map(m => String(m._id));
    const replies = await db.collection('teacher_replies').find({ messageId: { $in: messageIds } }).sort({ createdAt: 1 }).toArray();
    
    const repliesMap = {};
    replies.forEach(rep => {
      if (!repliesMap[rep.messageId]) repliesMap[rep.messageId] = [];
      repliesMap[rep.messageId].push(rep);
    });
    
    const enrichedMessages = messages.map(m => ({
      ...m,
      replies: repliesMap[String(m._id)] || []
    }));
    
    res.status(200).json({ success: true, total: enrichedMessages.length, messages: enrichedMessages });
  } catch (error) {
    console.error('Erreur GET /api/admin/all-messages:', error);
    res.status(500).json({ success: false, error: error.message, messages: [] });
  }
});

app.delete('/api/admin/delete-message/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) return res.status(400).json({ success: false, error: 'ID requis' });
    const db = await connectToDatabase();
    const objId = new (require('mongodb').ObjectId)(id);
    await db.collection('teacher_messages').deleteOne({ _id: objId });
    await db.collection('teacher_replies').deleteMany({ messageId: id });
    res.status(200).json({ success: true, message: 'Message et réponses supprimés avec succès.' });
  } catch (error) {
    console.error('Erreur DELETE /api/admin/delete-message:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// ROUTES ADMIN : GESTION DE LA PUBLICATION ET AUTORISATION DES PLANS AUX PARENTS
// ============================================================================
app.get('/api/plan-publication-status', async (req, res) => {
  try {
    const { section } = req.query;
    const db = await connectToDatabase();
    let query = {};
    if (section && section !== 'all') {
      query.section = section;
    }
    const list = await db.collection('published_plans').find(query).toArray();
    const statusMap = {};
    list.forEach(item => {
      statusMap[item.week] = Boolean(item.published ?? item.isPublishedToParents);
    });
    res.status(200).json({ success: true, publishedPlans: list, statusMap });
  } catch (error) {
    console.error('Erreur GET /api/plan-publication-status:', error);
    res.status(500).json({ success: false, error: error.message, publishedPlans: [], statusMap: {} });
  }
});

app.post('/api/admin/toggle-plan-publication', async (req, res) => {
  try {
    const rawWeek = req.body.week ?? req.body.weekNumber;
    const section = req.body.section || 'garcons';
    const published = req.body.published ?? req.body.isPublishedToParents;
    const updatedBy = req.body.updatedBy || req.body.adminUser || 'Admin';

    const weekNumber = parseInt(rawWeek, 10);
    if (isNaN(weekNumber) || !section) {
      return res.status(400).json({ success: false, error: 'Semaine ou section invalide.' });
    }
    const db = await connectToDatabase();
    const isPub = Boolean(published);
    const sectionsToUpdate = (section === 'all') ? ['garcons', 'filles', 'primaire', 'all'] : [section];

    for (const secKey of sectionsToUpdate) {
      const docId = `${secKey}_${weekNumber}`;
      await db.collection('published_plans').updateOne(
        { _id: docId },
        {
          $set: {
            week: weekNumber,
            section: secKey,
            published: isPub,
            isPublishedToParents: isPub,
            updatedAt: new Date(),
            updatedBy: updatedBy
          }
        },
        { upsert: true }
      );
    }
    
    console.log(`📢 [PUBLICATION] Semaine S${weekNumber} (${section} -> ${sectionsToUpdate.join(', ')}) -> ${isPub ? 'PUBLIÉE AUX PARENTS' : 'MASQUÉE'}`);
    res.status(200).json({ success: true, week: weekNumber, weekNumber, section, published: isPub, isPublishedToParents: isPub });
  } catch (error) {
    console.error('Erreur POST /api/admin/toggle-plan-publication:', error);
    res.status(500).json({ success: false, error: error.message, message: error.message });
  }
});

app.post('/api/translate-text', async (req, res) => {
  try {
    const { text, targetLang } = req.body;
    if (!text) return res.status(400).json({ error: 'Texte requis' });
    const translations = {
      'Fait': 'أنجز', 'Non Fait': 'لم ينجز', 'Partiellement Fait': 'أنجز جزئياً', 'Absent': 'غائب',
      'Excellent': 'ممتاز', 'Très bien': 'جيد جداً', 'Bien': 'جيد', 'Moyen': 'متوسط', 'Faible': 'ضعيف',
      'أنجز': 'Fait', 'لم ينجز': 'Non Fait', 'أنجز جزئياً': 'Partiellement Fait', 'غائب': 'Absent'
    };
    let translatedText = text;
    for (const [key, val] of Object.entries(translations)) {
      translatedText = translatedText.replace(new RegExp(key, 'gi'), val);
    }
    res.status(200).json({ originalText: text, translatedText, targetLang });
  } catch (e) {
    res.status(500).json({ originalText: text, translatedText: text });
  }
});

app.get('/api/general-evaluations', async (req, res) => {
  try {
    const section = req.query.section || 'garcons';
    const db = await connectToDatabase();
    const eightWeeksAgo = moment().subtract(8, 'weeks').startOf('day');
    const evaluations = await db.collection('evaluations').find({
      section: section,
      date: { $gte: eightWeeksAgo.format('YYYY-MM-DD') }
    }).toArray();

    const studentEvaluations = {};
    evaluations.forEach(ev => {
      const sName = (ev.studentName || '').trim();
      const cName = (ev.class || '').trim();
      if (!sName || !cName) return;
      const key = `${cName}|||${sName}`;
      if (!studentEvaluations[key]) {
        studentEvaluations[key] = {
          classe: cName,
          student: sName,
          behaviors: [], participations: [], statuses: [],
          bySubject: {}
        };
      }
      const sd = studentEvaluations[key];
      const subj = (ev.subject || '').trim();
      if (subj && !sd.bySubject[subj]) {
        sd.bySubject[subj] = { behaviors: [], participations: [], statuses: [] };
      }
      const bNum = parseInt(ev.behavior, 10);
      const pNum = parseInt(ev.participation, 10);
      if (!isNaN(bNum)) { sd.behaviors.push(bNum); if (subj) sd.bySubject[subj].behaviors.push(bNum); }
      if (!isNaN(pNum)) { sd.participations.push(pNum); if (subj) sd.bySubject[subj].participations.push(pNum); }
      if (ev.status) { sd.statuses.push(ev.status); if (subj) sd.bySubject[subj].statuses.push(ev.status); }
    });

    function calcScores(behaviors, participations, statuses, isPEI1) {
      const maxPB = isPEI1 ? 30 : 20;
      const avgB = behaviors.length > 0 ? behaviors.reduce((a, b) => a + b, 0) / behaviors.length : 0;
      const avgP = participations.length > 0 ? participations.reduce((a, b) => a + b, 0) / participations.length : 0;
      const rawPB = ((avgB + avgP) / 2) / 10 * maxPB;
      const participationBehaviorScore = Math.min(maxPB, parseFloat(rawPB.toFixed(2)));
      
      const total = statuses.length;
      const done = statuses.filter(s => s === 'Fait').length;
      const partial = statuses.filter(s => s === 'Partiellement Fait').length;
      const nonFait = statuses.filter(s => s === 'Non Fait').length;
      const homeworkRate = total > 0 ? Math.round(((done + partial * 0.5) / total) * 100) : 100;
      const homeworkScore = Math.min(20, parseFloat(((homeworkRate / 100) * 20).toFixed(2)));

      const participationRate = Math.round((avgP / 10) * 100);
      const behaviorRate = Math.round((avgB / 10) * 100);

      // Calcul de la progression globale sur 100% : Devoirs (40%), Participation (30%), Comportement (30%)
      let overallProgress = 0;
      if (total > 0 && (behaviors.length > 0 || participations.length > 0)) {
        overallProgress = Math.round(homeworkRate * 0.40 + participationRate * 0.30 + behaviorRate * 0.30);
      } else if (behaviors.length > 0 || participations.length > 0) {
        overallProgress = Math.round((participationRate + behaviorRate) / 2);
      } else if (total > 0) {
        overallProgress = homeworkRate;
      } else {
        overallProgress = 100;
      }
      overallProgress = Math.min(100, Math.max(0, overallProgress));

      return {
        participationBehaviorScore,
        homeworkScore,
        maxPB,
        maxHW: 20,
        avgB: parseFloat(avgB.toFixed(1)),
        avgP: parseFloat(avgP.toFixed(1)),
        participationRate,
        behaviorRate,
        homeworkRate,
        overallProgress,
        totalHw: total,
        doneCount: done,
        partialCount: partial,
        nonFaitCount: nonFait
      };
    }

    const results = Object.values(studentEvaluations).map(sd => {
      const isPEI1 = sd.classe === 'PEI1';
      const maxPB = isPEI1 ? 30 : 20;
      const global = calcScores(sd.behaviors, sd.participations, sd.statuses, isPEI1);
      const subjectScores = {};
      for (const [subj, data] of Object.entries(sd.bySubject)) {
        subjectScores[subj] = calcScores(data.behaviors, data.participations, data.statuses, isPEI1);
      }
      return {
        classe: sd.classe,
        student: sd.student,
        isPEI1, maxPB, maxHW: 20,
        participationBehaviorScore: global.participationBehaviorScore,
        homeworkScore: global.homeworkScore,
        totalScore: parseFloat((global.participationBehaviorScore + global.homeworkScore).toFixed(2)),
        totalMax: maxPB + 20,
        overallProgress: global.overallProgress,
        homeworkRate: global.homeworkRate,
        participationRate: global.participationRate,
        behaviorRate: global.behaviorRate,
        avgParticipation: global.avgP,
        avgBehavior: global.avgB,
        totalHomeworks: global.totalHw,
        doneCount: global.doneCount,
        partialCount: global.partialCount,
        nonFaitCount: global.nonFaitCount,
        subjectScores
      };
    });

    res.status(200).json(results);
  } catch (e) {
    console.error('Erreur /api/general-evaluations:', e);
    res.status(500).json([]);
  }
});

app.get('/api/plans/:week', async (req, res) => {
  const weekNumber = parseInt(req.params.week, 10);
  const section = req.query.section || 'garcons';
  if (isNaN(weekNumber)) return res.status(400).json({ message: 'Semaine invalide.' });
  try {
    const db = await connectToDatabase();
    
    let planDocument = await db.collection('plans').findOne({
      $or: [
        { _id: `${section}_${weekNumber}` },
        { _id: `${section}_${String(weekNumber)}` },
        { week: weekNumber, section: section },
        { week: String(weekNumber), section: section }
      ]
    });
    
    if (planDocument) {
      const lessonPlans = await db.collection('lessonPlans')
        .find({ week: weekNumber, section: section }, { projection: { _id: 1 } })
        .toArray();
      
      const availableLessonPlanIds = new Set(lessonPlans.map(lp => lp._id));
      
      const weeklyPlans = await db.collection('weeklyLessonPlans')
        .find({ week: weekNumber, section: section }, { projection: { classe: 1 } })
        .toArray();
      
      const availableWeeklyPlans = weeklyPlans.map(p => p.classe);
      
      console.log(`📋 Plans disponibles pour S${weekNumber} (${section}):`, Array.from(availableLessonPlanIds));
      
      let rawData = planDocument.data || [];
      // Filtrage strict par section pour garantir qu'aucun enseignant de la mauvaise section ne figure dans le plan
      if (section === 'garcons') {
        rawData = rawData.filter(row => {
          const enseignant = (row[findKey(row, 'Enseignant')] || '').trim();
          if (isDualMusicTeacher(enseignant)) return true;
          return !femaleTeachers.some(f => f.toLowerCase() === enseignant.toLowerCase()) &&
                 !primaireTeachers.some(p => p.toLowerCase() === enseignant.toLowerCase());
        });
      } else if (section === 'filles') {
        rawData = rawData.filter(row => {
          const enseignant = (row[findKey(row, 'Enseignant')] || '').trim();
          if (isDualMusicTeacher(enseignant)) return true;
          return !maleTeachers.some(m => m.toLowerCase() === enseignant.toLowerCase()) &&
                 !primaireTeachers.some(p => p.toLowerCase() === enseignant.toLowerCase());
        });
      } else if (section === 'primaire') {
        rawData = rawData.filter(row => {
          const enseignant = (row[findKey(row, 'Enseignant')] || '').trim();
          if (isDualMusicTeacher(enseignant)) return true;
          return !maleTeachers.some(m => m.toLowerCase() === enseignant.toLowerCase()) &&
                 !femaleTeachers.some(f => f.toLowerCase() === enseignant.toLowerCase());
        });
      }

      const enrichedData = rawData.map(row => {
        const enseignant = row[findKey(row, 'Enseignant')] || '';
        const classe = row[findKey(row, 'Classe')] || '';
        const matiere = row[findKey(row, 'Matière')] || '';
        const periode = row[findKey(row, 'Période')] || '';
        const jour = row[findKey(row, 'Jour')] || '';
        
        const potentialLessonPlanId = `${section}_${weekNumber}_${enseignant}_${classe}_${matiere}_${periode}_${jour}`.replace(/\s+/g, '_');
        const fallbackId = `${weekNumber}_${enseignant}_${classe}_${matiere}_${periode}_${jour}`.replace(/\s+/g, '_');
        
        if (availableLessonPlanIds.has(potentialLessonPlanId)) {
          return { ...row, lessonPlanId: potentialLessonPlanId };
        } else if (availableLessonPlanIds.has(fallbackId)) {
          return { ...row, lessonPlanId: fallbackId };
        }
        return row;
      });
      
      // Statut de publication aux parents
      const pubDoc = await db.collection('published_plans').findOne({
        $or: [
          { _id: `${section}_${weekNumber}` },
          { _id: `${section}_${String(weekNumber)}` },
          { week: weekNumber, section: section },
          { week: String(weekNumber), section: section },
          { _id: `all_${weekNumber}` },
          { week: weekNumber, section: 'all' }
        ]
      });
      const isPublishedToParents = (pubDoc && (pubDoc.published !== undefined || pubDoc.isPublishedToParents !== undefined))
        ? Boolean(pubDoc.published ?? pubDoc.isPublishedToParents)
        : (enrichedData && enrichedData.length > 0);

      // Récupérer les journées spéciales / fusionnées pour cette semaine et section
      const specialDays = await db.collection('special_days').find({ 
        section: section, 
        week: weekNumber 
      }).toArray();

      res.status(200).json({ 
          planData: enrichedData, 
          classNotes: planDocument.classNotes || {},
          availableWeeklyPlans: availableWeeklyPlans,
          isPublishedToParents: isPublishedToParents,
          specialDays: specialDays || []
      });
    } else {
      const pubDoc = await db.collection('published_plans').findOne({
        $or: [
          { _id: `${section}_${weekNumber}` },
          { _id: `${section}_${String(weekNumber)}` },
          { week: weekNumber, section: section },
          { week: String(weekNumber), section: section },
          { _id: `all_${weekNumber}` },
          { week: weekNumber, section: 'all' }
        ]
      });
      const isPublishedToParents = pubDoc ? Boolean(pubDoc.published ?? pubDoc.isPublishedToParents) : false;
      const specialDays = await db.collection('special_days').find({ 
        section: section, 
        week: weekNumber 
      }).toArray();
      res.status(200).json({ planData: [], classNotes: {}, availableWeeklyPlans: [], isPublishedToParents, specialDays: specialDays || [] });
    }
  } catch (error) {
    console.error('Erreur MongoDB /plans/:week:', error);
    res.status(500).json({ message: 'Erreur serveur.' });
  }
});

app.post('/api/save-plan', async (req, res) => {
  const weekNumber = parseInt(req.body.week, 10);
  const data = req.body.data;
  const rawSection = String(req.body.section || 'garcons').toLowerCase().trim();
  const section = ['garcons', 'filles', 'primaire'].includes(rawSection) ? rawSection : 'garcons';
  if (isNaN(weekNumber) || !Array.isArray(data)) return res.status(400).json({ message: 'Données invalides.' });
  try {
    const db = await connectToDatabase();
    const docId = `${section}_${weekNumber}`;
    const now = new Date();

    // Récupérer le plan existant pour préserver les notes, leçons et devoirs saisis par les enseignants
    const existingDoc = await db.collection('plans').findOne({ _id: docId });
    const existingData = (existingDoc && Array.isArray(existingDoc.data)) ? existingDoc.data : [];

    const mergedData = data.map(item => {
      if (!item || typeof item !== 'object') return item;
      const stamped = { ...item, _section: section };
      const match = existingData.find(oldRow => matchPlanRow(oldRow, stamped));
      if (match) {
        const preserved = { ...stamped };
        ['Leçon', 'Devoirs', 'Remarques', 'Notes', 'Travaux de classe', 'Support', 'Observation'].forEach(field => {
          if ((!preserved[field] || String(preserved[field]).trim() === '') && match[field] && String(match[field]).trim() !== '') {
            preserved[field] = match[field];
          }
        });
        return preserved;
      }
      return stamped;
    });

    await db.collection('plans').updateOne(
      { _id: docId },
      { 
        $set: { 
          _id: docId,
          week: weekNumber, 
          section: section, 
          data: mergedData, 
          updatedAt: now 
        } 
      },
      { upsert: true }
    );
    console.log(`💾 [Save Plan] S${weekNumber} (${section}): ${mergedData.length} lignes enregistrées (notes enseignants préservées).`);
    res.status(200).json({ 
      success: true,
      message: `Plan S${weekNumber} pour la section ${section} enregistré avec succès.`,
      section: section,
      week: weekNumber
    });
  } catch (error) {
    console.error('Erreur MongoDB /save-plan:', error);
    res.status(500).json({ message: 'Erreur serveur.' });
  }
});

// Enregistrement d'un plan Excel vers plusieurs semaines pour chaque section séparée
app.post('/api/save-multiple-weeks', async (req, res) => {
  try {
    const { weeks, data, section: rawSection = 'garcons' } = req.body;
    const cleanSection = String(rawSection || 'garcons').toLowerCase().trim();
    const section = ['garcons', 'filles', 'primaire'].includes(cleanSection) ? cleanSection : 'garcons';

    if (!Array.isArray(weeks) || weeks.length === 0 || !Array.isArray(data) || data.length === 0) {
      return res.status(400).json({ message: 'Données ou liste de semaines invalides.' });
    }
    const validWeeks = weeks.map(w => parseInt(w, 10)).filter(w => !isNaN(w) && w >= 1 && w <= 38);
    if (validWeeks.length === 0) {
      return res.status(400).json({ message: 'Aucune semaine valide sélectionnée.' });
    }
    const db = await connectToDatabase();
    const now = new Date();

    // Récupérer les documents existants pour ces semaines afin de PRÉSERVER les notes et données saisies par les enseignants !
    const existingDocs = await db.collection('plans').find({ _id: { $in: validWeeks.map(w => `${section}_${w}`) } }).toArray();
    const existingMap = new Map();
    existingDocs.forEach(d => existingMap.set(d._id, d));

    const operations = validWeeks.map(w => {
      const docId = `${section}_${w}`;
      const existingDoc = existingMap.get(docId);
      const existingData = (existingDoc && Array.isArray(existingDoc.data)) ? existingDoc.data : [];

      // Fusionner les données pour ne JAMAIS supprimer ou écraser les notes, leçons ou devoirs saisis par les enseignants
      const mergedData = data.map(newItem => {
        if (!newItem || typeof newItem !== 'object') return newItem;
        const stamped = { ...newItem, _section: section };

        // Trouver la ligne existante correspondante
        const match = existingData.find(oldRow => matchPlanRow(oldRow, stamped));
        if (match) {
          const preserved = { ...stamped };
          ['Leçon', 'Devoirs', 'Remarques', 'Notes', 'Travaux de classe', 'Support', 'Observation'].forEach(field => {
            if ((!preserved[field] || String(preserved[field]).trim() === '') && match[field] && String(match[field]).trim() !== '') {
              preserved[field] = match[field];
            }
          });
          return preserved;
        }
        return stamped;
      });

      return {
        updateOne: {
          filter: { _id: docId },
          update: { 
            $set: { 
              _id: docId,
              week: w, 
              section: section, 
              data: mergedData, 
              updatedAt: now 
            }
          },
          upsert: true
        }
      };
    });

    await db.collection('plans').bulkWrite(operations);
    console.log(`[Multi-Weeks Upload] ${data.length} lignes appliquées aux semaines ${validWeeks.join(', ')} (notes enseignants 100% préservées).`);
    res.status(200).json({ 
      success: true,
      message: `Fichier Excel appliqué avec succès à ${validWeeks.length} semaine(s) pour la section ${section} avec préservation des notes.`,
      savedWeeks: validWeeks,
      section: section
    });
  } catch (error) {
    console.error('Erreur MongoDB /api/save-multiple-weeks:', error);
    res.status(500).json({ message: 'Erreur lors de l\'enregistrement multi-semaines: ' + error.message });
  }
});

app.post('/api/save-notes', async (req, res) => {
  const weekNumber = parseInt(req.body.week, 10);
  const { classe, notes, section = 'garcons' } = req.body;
  if (isNaN(weekNumber) || !classe) return res.status(400).json({ message: 'Données invalides.' });
  try {
    const db = await connectToDatabase();
    const docId = `${section}_${weekNumber}`;
    const existingDoc = await db.collection('plans').findOne({ _id: docId });
    const existingNote = (existingDoc && existingDoc.classNotes && existingDoc.classNotes[classe]) ? existingDoc.classNotes[classe] : '';
    
    // Si la nouvelle note est nulle/indéfinie, préserver l'existante
    let finalNote = notes !== undefined && notes !== null ? String(notes) : existingNote;

    await db.collection('plans').updateOne(
      { _id: docId },
      { $set: { week: weekNumber, section: section, [`classNotes.${classe}`]: finalNote, updatedAt: new Date() } },
      { upsert: true }
    );
    res.status(200).json({ message: 'Notes enregistrées.', notes: finalNote });
  } catch (error) {
    console.error('Erreur MongoDB /save-notes:', error);
    res.status(500).json({ message: 'Erreur serveur.' });
  }
});

// Verrouillage asynchrone par document pour éviter les écrasements concurrents (Race Conditions)
const planLocks = new Map();

function withPlanLock(docId, asyncFn) {
  const prevPromise = planLocks.get(docId) || Promise.resolve();
  const currentPromise = prevPromise
    .catch(() => {})
    .then(async () => {
      return await asyncFn();
    });
  planLocks.set(docId, currentPromise);
  currentPromise.finally(() => {
    if (planLocks.get(docId) === currentPromise) {
      planLocks.delete(docId);
    }
  });
  return currentPromise;
}

// Fonction de correspondance tolérante et sécurisée pour les lignes d'un plan
function matchPlanRow(elem, criteria) {
  if (!elem || !criteria) return false;
  
  // 1. Identifiant explicite
  if (criteria._rowId && elem._rowId && String(criteria._rowId) === String(elem._rowId)) return true;
  if (criteria._id && elem._id && String(criteria._id) === String(elem._id)) return true;
  if (criteria.rowId && elem.rowId && String(criteria.rowId) === String(elem.rowId)) return true;

  const getF = (obj, field) => {
    const k = findKey(obj, field);
    return k ? String(obj[k] || '').trim().toLowerCase() : '';
  };

  const ensE = getF(elem, 'Enseignant');
  const ensC = getF(criteria, 'Enseignant');
  const clsE = getF(elem, 'Classe');
  const clsC = getF(criteria, 'Classe');
  const jourE = getF(elem, 'Jour');
  const jourC = getF(criteria, 'Jour');
  const perE = getF(elem, 'Période');
  const perC = getF(criteria, 'Période');
  const matE = getF(elem, 'Matière');
  const matC = getF(criteria, 'Matière');

  // Correspondance exacte des 5 critères principaux
  if (ensE && clsE && jourE && perE && matE) {
    if (ensE === ensC && clsE === clsC && jourE === jourC && perE === perC && matE === matC) {
      return true;
    }
  }

  // Correspondance 4 critères (Enseignant, Classe, Jour, Période) - protège contre les modifications d'intitulé de matière
  if (ensE && clsE && jourE && perE) {
    if (ensE === ensC && clsE === clsC && jourE === jourC && perE === perC) {
      return true;
    }
  }

  // Correspondance alternative (Classe, Jour, Période, Matière)
  if (clsE && jourE && perE && matE) {
    if (clsE === clsC && jourE === jourC && perE === perC && matE === matC) {
      return true;
    }
  }

  return false;
}

app.post('/api/save-row', async (req, res) => {
  const weekNumber = parseInt(req.body.week, 10);
  const rowData = req.body.data;
  const originalData = req.body.originalData;
  const section = req.body.section || 'garcons';
  if (isNaN(weekNumber) || typeof rowData !== 'object') {
    return res.status(400).json({ message: 'Données invalides.' });
  }

  try {
    const db = await connectToDatabase();
    const docId = `${section}_${weekNumber}`;
    const now = new Date();

    const result = await withPlanLock(docId, async () => {
      let planDoc = await db.collection('plans').findOne({ _id: docId });
      if (!planDoc) {
        planDoc = { _id: docId, section: section, week: weekNumber, data: [], updatedAt: now };
      }
      if (!Array.isArray(planDoc.data)) {
        planDoc.data = [];
      }

      let targetIdx = -1;
      // 1. Chercher avec originalData si fourni
      if (originalData) {
        targetIdx = planDoc.data.findIndex(elem => matchPlanRow(elem, originalData));
      }
      // 2. Chercher avec rowData si non trouvé
      if (targetIdx === -1) {
        targetIdx = planDoc.data.findIndex(elem => matchPlanRow(elem, rowData));
      }

      if (targetIdx !== -1) {
        planDoc.data[targetIdx] = {
          ...planDoc.data[targetIdx],
          ...rowData,
          updatedAt: now
        };
      } else {
        // Si la ligne n'existait pas encore, l'ajouter directement pour ne jamais perdre de saisie
        planDoc.data.push({
          ...rowData,
          updatedAt: now
        });
      }

      await db.collection('plans').updateOne(
        { _id: docId },
        { $set: { week: weekNumber, section: section, data: planDoc.data, updatedAt: now } },
        { upsert: true }
      );

      return { updatedAt: now };
    });

    res.status(200).json({
      message: 'Ligne enregistrée avec succès.',
      updatedData: { updatedAt: result.updatedAt }
    });
  } catch (error) {
    console.error('Erreur /save-row:', error);
    res.status(500).json({ message: 'Erreur serveur.' });
  }
});

// Enregistrement groupé (batch) ultra-rapide et atomique de toutes les lignes affichées
app.post('/api/save-rows-batch', async (req, res) => {
  const weekNumber = parseInt(req.body.week, 10);
  const rows = req.body.rows;
  const section = req.body.section || 'garcons';

  if (isNaN(weekNumber) || !Array.isArray(rows)) {
    return res.status(400).json({ message: 'Données ou liste de lignes invalides.' });
  }

  try {
    const db = await connectToDatabase();
    const docId = `${section}_${weekNumber}`;
    const now = new Date();

    const result = await withPlanLock(docId, async () => {
      let planDoc = await db.collection('plans').findOne({ _id: docId });
      if (!planDoc) {
        planDoc = { _id: docId, section: section, week: weekNumber, data: [], updatedAt: now };
      }
      if (!Array.isArray(planDoc.data)) {
        planDoc.data = [];
      }

      let updatedCount = 0;
      let insertedCount = 0;

      rows.forEach(item => {
        const rowData = item.data || item;
        const originalData = item.originalData || null;

        let targetIdx = -1;
        if (originalData) {
          targetIdx = planDoc.data.findIndex(elem => matchPlanRow(elem, originalData));
        }
        if (targetIdx === -1) {
          targetIdx = planDoc.data.findIndex(elem => matchPlanRow(elem, rowData));
        }

        if (targetIdx !== -1) {
          planDoc.data[targetIdx] = {
            ...planDoc.data[targetIdx],
            ...rowData,
            updatedAt: now
          };
          updatedCount++;
        } else {
          planDoc.data.push({
            ...rowData,
            updatedAt: now
          });
          insertedCount++;
        }
      });

      await db.collection('plans').updateOne(
        { _id: docId },
        { $set: { week: weekNumber, section: section, data: planDoc.data, updatedAt: now } },
        { upsert: true }
      );

      return { total: rows.length, updatedCount, insertedCount, updatedAt: now };
    });

    res.status(200).json({
      success: true,
      message: `${result.total} ligne(s) enregistrée(s) avec succès.`,
      updatedCount: result.updatedCount,
      insertedCount: result.insertedCount,
      updatedAt: result.updatedAt
    });
  } catch (error) {
    console.error('Erreur /api/save-rows-batch:', error);
    res.status(500).json({ message: 'Erreur serveur lors de l\'enregistrement groupé.' });
  }
});

// --------------------- Gestion des Journées Spéciales / Fusion des Jours & Photos ---------------------

app.get('/api/special-days', async (req, res) => {
  try {
    const { section, week } = req.query;
    const db = await connectToDatabase();
    const query = {};
    if (section && section !== 'all') {
      query.section = section;
    } else if (!section) {
      query.section = 'garcons';
    }
    if (week) {
      const weekNum = parseInt(week, 10);
      query.$or = [{ week: weekNum }, { week: String(weekNum) }, { week: String(week) }];
    }
    const days = await db.collection('special_days').find(query).toArray();
    res.status(200).json(days || []);
  } catch (error) {
    console.error('Erreur /api/special-days GET:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/special-days', async (req, res) => {
  try {
    const { section = 'garcons', week, day, classe = 'all', type = 'no_courses', title, description, message, isNoSchool = true, photos = [] } = req.body;
    const weekNum = parseInt(week, 10);
    if (!day || isNaN(weekNum)) {
      return res.status(400).json({ error: 'Jour et Semaine requis.' });
    }
    
    // Normalisation de la classe ('all', 'ALL', 'toutes' -> 'all')
    const rawClass = String(classe || 'all').trim();
    const normClass = (rawClass.toLowerCase() === 'all' || rawClass.toLowerCase() === 'toutes' || rawClass === '') ? 'all' : rawClass;

    // Normalisation du jour
    const rawDay = String(day).trim();
    const dayMap = {
      'dimanche': 'Dimanche', 'أحد': 'Dimanche', 'الأحد': 'Dimanche',
      'lundi': 'Lundi', 'إثنين': 'Lundi', 'الاثنين': 'Lundi',
      'mardi': 'Mardi', 'ثلاثاء': 'Mardi', 'الثلاثاء': 'Mardi',
      'mercredi': 'Mercredi', 'أربعاء': 'Mercredi', 'الأربعاء': 'Mercredi',
      'jeudi': 'Jeudi', 'خميس': 'Jeudi', 'الخميس': 'Jeudi'
    };
    const normDay = dayMap[rawDay.toLowerCase()] || (rawDay.charAt(0).toUpperCase() + rawDay.slice(1));

    // Nettoyage et formatage des photos
    const cleanedPhotos = (Array.isArray(photos) ? photos : []).map(p => {
      if (typeof p === 'string' && p.trim()) {
        return { url: p.trim(), caption: '' };
      }
      if (p && typeof p === 'object' && (p.url || p.src || p.data)) {
        return {
          url: String(p.url || p.src || p.data || '').trim(),
          caption: String(p.caption || p.name || '').trim()
        };
      }
      return null;
    }).filter(p => p && p.url);

    const db = await connectToDatabase();
    const docId = `${section}_${weekNum}_${normDay}_${normClass}`;
    const doc = {
      _id: docId,
      section,
      week: weekNum,
      day: normDay,
      classe: normClass,
      type: type || 'no_courses',
      title: title || 'Journée Sans Cours',
      description: description || message || '',
      message: message || description || '',
      isNoSchool: Boolean(isNoSchool),
      photos: cleanedPhotos,
      updatedAt: new Date()
    };
    await db.collection('special_days').updateOne(
      { _id: docId },
      { $set: doc },
      { upsert: true }
    );
    console.log(`[Special Day] Journée ${normDay} S${weekNum} (${section}, classe: ${normClass}) enregistrée: "${title}" avec ${cleanedPhotos.length} photo(s).`);
    res.status(200).json({ success: true, message: 'Journée spéciale enregistrée avec succès.', specialDay: doc });
  } catch (error) {
    console.error('Erreur /api/special-days POST:', error);
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/special-days/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const db = await connectToDatabase();
    await db.collection('special_days').deleteOne({ _id: id });
    console.log(`[Special Day] Journée spéciale supprimée: ${id}`);
    res.status(200).json({ success: true, message: 'Journée spéciale supprimée.' });
  } catch (error) {
    console.error('Erreur /api/special-days/:id DELETE:', error);
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/special-days', async (req, res) => {
  try {
    const { id, section, week, day, classe = 'all' } = (req.body && Object.keys(req.body).length > 0) ? req.body : req.query;
    const db = await connectToDatabase();
    let query = {};
    if (id) {
      query = { _id: id };
    } else if (section && week && day) {
      query = { _id: `${section}_${parseInt(week, 10)}_${day}_${classe || 'all'}` };
    } else {
      return res.status(400).json({ error: 'Identifiant manquant.' });
    }
    await db.collection('special_days').deleteOne(query);
    console.log(`[Special Day] Journée spéciale supprimée:`, query);
    res.status(200).json({ success: true, message: 'Journée spéciale supprimée.' });
  } catch (error) {
    console.error('Erreur /api/special-days DELETE:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/all-classes', async (req, res) => {
  try {
    const section = req.query.section || 'garcons';
    const db = await connectToDatabase();
    const classes = await db.collection('plans').distinct('data.Classe', { section: section, 'data.Classe': { $nin: [null, ""] } });
    res.status(200).json((classes || []).sort());
  } catch (error) {
    console.error('Erreur MongoDB /api/all-classes:', error);
    res.status(500).json({ message: 'Erreur serveur.' });
  }
});

// --------------------- Gestion & Réorganisation de l'Emploi du Temps ---------------------

app.get('/api/admin/schedule-class', async (req, res) => {
  try {
    const section = req.query.section || 'garcons';
    const week = parseInt(req.query.week, 10) || 1;
    const classe = req.query.classe || '';

    const db = await connectToDatabase();
    const docId = `${section}_${week}`;

    let planDoc = await db.collection('plans').findOne({
      $or: [
        { _id: docId },
        { _id: `${section}_${String(week)}` },
        { week: week, section: section },
        { week: String(week), section: section }
      ]
    });

    let sourceRows = [];
    if (planDoc && Array.isArray(planDoc.data)) {
      sourceRows = planDoc.data;
    } else {
      const fallbackDoc = await db.collection('plans').findOne({
        section: section,
        'data.Classe': { $exists: true }
      });
      if (fallbackDoc && Array.isArray(fallbackDoc.data)) {
        sourceRows = fallbackDoc.data;
      }
    }

    const classRows = classe
      ? sourceRows.filter(r => {
          const c = r[findKey(r, 'Classe')];
          return c && isClassMatchServer(c, classe);
        })
      : [];

    const dayValuesOrder = { "Dimanche": 1, "Lundi": 2, "Mardi": 3, "Mercredi": 4, "Jeudi": 5 };
    const getDayOrd = (j) => dayValuesOrder[extractDayNameFromString(j) || j] || 99;
    const getPerNum = (p) => { const n = parseInt(p, 10); return isNaN(n) ? 99 : n; };

    const slots = classRows.map(row => {
      const rawJour = row[findKey(row, 'Jour')] || '';
      const day = extractDayNameFromString(rawJour) || rawJour;
      const rawPer = row[findKey(row, 'Période')] || '1';
      const per = String(rawPer).replace(/[^0-9]/g, '') || rawPer;
      const mat = row[findKey(row, 'Matière')] || '';
      const ens = row[findKey(row, 'Enseignant')] || '';
      const lec = (row[findKey(row, 'Leçon')] || '').trim();
      const dev = (row[findKey(row, 'Devoirs')] || '').trim();
      const obj = (row[findKey(row, 'Objectifs')] || '').trim();
      const hasContent = Boolean(lec || dev || obj);

      return {
        jour: day,
        periode: per,
        matiere: mat,
        enseignant: ens,
        hasContent,
        lessonPreview: lec ? lec.substring(0, 50) : '',
        homeworkPreview: dev ? dev.substring(0, 50) : ''
      };
    });

    slots.sort((a, b) => {
      const dDiff = getDayOrd(a.jour) - getDayOrd(b.jour);
      if (dDiff !== 0) return dDiff;
      return getPerNum(a.periode) - getPerNum(b.periode);
    });

    const distinctSubjects = Array.from(new Set(sourceRows.map(r => r[findKey(r, 'Matière')]).filter(Boolean))).sort();

    let teachers = [];
    try {
      const users = await db.collection('users').find({
        role: { $ne: 'admin' },
        $or: [{ section: section }, { section: 'all' }]
      }).toArray();
      teachers = users.map(u => u.nom || u.username).filter(Boolean);
    } catch (e) {}

    if (teachers.length === 0) {
      teachers = Array.from(new Set(sourceRows.map(r => r[findKey(r, 'Enseignant')]).filter(Boolean)));
    }
    teachers.sort();

    const distinctClasses = Array.from(new Set(sourceRows.map(r => r[findKey(r, 'Classe')]).filter(Boolean))).sort();
    const filledSlotsCount = slots.filter(s => s.hasContent).length;

    res.status(200).json({
      success: true,
      section,
      week,
      classe,
      slots,
      teachers,
      distinctSubjects,
      distinctClasses,
      filledSlotsCount,
      totalSlots: slots.length
    });
  } catch (error) {
    console.error('Erreur /api/admin/schedule-class:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/admin/reorganize-schedule', async (req, res) => {
  try {
    const {
      section = 'garcons',
      classe: targetClasse,
      startWeek = 1,
      endWeek = 1,
      targetMode = 'single',
      slots = [],
      classSchedules = {}
    } = req.body;

    const sWeek = parseInt(startWeek, 10);
    let eWeek = parseInt(endWeek, 10);
    if (isNaN(sWeek) || sWeek < 1) {
      return res.status(400).json({ error: 'Semaine de départ invalide.' });
    }
    if (targetMode === 'remaining') {
      eWeek = 38;
    } else if (isNaN(eWeek) || eWeek < sWeek) {
      eWeek = sWeek;
    }

    const schedulesToApply = {};
    if (targetClasse && Array.isArray(slots) && slots.length > 0) {
      schedulesToApply[targetClasse] = slots;
    }
    if (classSchedules && typeof classSchedules === 'object') {
      for (const [cls, clsSlots] of Object.entries(classSchedules)) {
        if (Array.isArray(clsSlots) && clsSlots.length > 0) {
          schedulesToApply[cls] = clsSlots;
        }
      }
    }

    if (Object.keys(schedulesToApply).length === 0) {
      return res.status(400).json({ error: 'Aucun créneau d\'emploi du temps fourni.' });
    }

    const db = await connectToDatabase();
    const dayValuesOrder = { "Dimanche": 1, "Lundi": 2, "Mardi": 3, "Mercredi": 4, "Jeudi": 5 };
    const getDayOrd = (j) => dayValuesOrder[extractDayNameFromString(j) || j] || 99;
    const getPerNum = (p) => { const n = parseInt(p, 10); return isNaN(n) ? 99 : n; };

    for (const [cls, clsSlots] of Object.entries(schedulesToApply)) {
      clsSlots.sort((a, b) => {
        const dDiff = getDayOrd(a.jour) - getDayOrd(b.jour);
        if (dDiff !== 0) return dDiff;
        return getPerNum(a.periode) - getPerNum(b.periode);
      });
    }

    let affectedWeeksCount = 0;
    let totalUpdatedRows = 0;
    const now = new Date();

    for (let w = sWeek; w <= eWeek; w++) {
      const docId = `${section}_${w}`;

      await withPlanLock(docId, async () => {
        let planDoc = await db.collection('plans').findOne({
          $or: [
            { _id: docId },
            { _id: `${section}_${String(w)}` },
            { week: w, section: section },
            { week: String(w), section: section }
          ]
        });

        let weekRows = planDoc && Array.isArray(planDoc.data) ? [...planDoc.data] : [];
        let weekModified = false;

        for (const [clsName, newSlots] of Object.entries(schedulesToApply)) {
          const isTargetClass = (row) => {
            const rowCls = row[findKey(row, 'Classe')];
            return rowCls && isClassMatchServer(rowCls, clsName);
          };

          const oldClassRows = weekRows.filter(isTargetClass);
          const otherRows = weekRows.filter(r => !isTargetClass(r));

          if (oldClassRows.length === 0) {
            const newClassRows = newSlots.map(slot => ({
              "Enseignant": slot.enseignant || '',
              "Jour": slot.jour,
              "Période": String(slot.periode),
              "Classe": clsName,
              "Matière": slot.matiere,
              "Leçon": "",
              "Objectifs": "",
              "Travaux de classe": "",
              "Devoirs": "",
              "Support": "",
              "_section": section,
              "updatedAt": now
            }));
            weekRows = [...otherRows, ...newClassRows];
            weekModified = true;
            totalUpdatedRows += newClassRows.length;
            continue;
          }

          const normSubj = (s) => String(s || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

          const oldRowsBySubject = new Map();
          oldClassRows.forEach(row => {
            const rawSub = row[findKey(row, 'Matière')] || '';
            const key = normSubj(rawSub);
            if (!oldRowsBySubject.has(key)) {
              oldRowsBySubject.set(key, []);
            }
            oldRowsBySubject.get(key).push(row);
          });

          const newSlotsBySubject = new Map();
          newSlots.forEach(slot => {
            const key = normSubj(slot.matiere);
            if (!newSlotsBySubject.has(key)) {
              newSlotsBySubject.set(key, []);
            }
            newSlotsBySubject.get(key).push(slot);
          });

          const remappedClassRows = [];
          const usedOldRowIndices = new Set();

          for (const [subjKey, slotsList] of newSlotsBySubject.entries()) {
            const existingSubjectRows = oldRowsBySubject.get(subjKey) || [];

            slotsList.forEach((slot, slotIdx) => {
              if (slotIdx < existingSubjectRows.length) {
                const existingRow = existingSubjectRows[slotIdx];
                usedOldRowIndices.add(existingRow);

                const jourKey = findKey(existingRow, 'Jour') || 'Jour';
                const perKey = findKey(existingRow, 'Période') || 'Période';
                const ensKey = findKey(existingRow, 'Enseignant') || 'Enseignant';
                const matKey = findKey(existingRow, 'Matière') || 'Matière';

                const updatedRow = {
                  ...existingRow,
                  [jourKey]: slot.jour,
                  [perKey]: String(slot.periode),
                  [matKey]: slot.matiere,
                  updatedAt: now
                };

                if (slot.enseignant && slot.enseignant.trim()) {
                  updatedRow[ensKey] = slot.enseignant.trim();
                }

                remappedClassRows.push(updatedRow);
              } else {
                const sampleRow = oldClassRows[0] || {};
                const jourKey = findKey(sampleRow, 'Jour') || 'Jour';
                const perKey = findKey(sampleRow, 'Période') || 'Période';
                const ensKey = findKey(sampleRow, 'Enseignant') || 'Enseignant';
                const matKey = findKey(sampleRow, 'Matière') || 'Matière';
                const clsKey = findKey(sampleRow, 'Classe') || 'Classe';
                const lecKey = findKey(sampleRow, 'Leçon') || 'Leçon';
                const objKey = findKey(sampleRow, 'Objectifs') || 'Objectifs';
                const traKey = findKey(sampleRow, 'Travaux de classe') || 'Travaux de classe';
                const devKey = findKey(sampleRow, 'Devoirs') || 'Devoirs';
                const supKey = findKey(sampleRow, 'Support') || 'Support';

                const newRow = {
                  [ensKey]: slot.enseignant || '',
                  [jourKey]: slot.jour,
                  [perKey]: String(slot.periode),
                  [clsKey]: clsName,
                  [matKey]: slot.matiere,
                  [lecKey]: '',
                  [objKey]: '',
                  [traKey]: '',
                  [devKey]: '',
                  [supKey]: '',
                  _section: section,
                  updatedAt: now
                };
                remappedClassRows.push(newRow);
              }
            });
          }

          oldClassRows.forEach(oldRow => {
            if (!usedOldRowIndices.has(oldRow)) {
              const lec = (oldRow[findKey(oldRow, 'Leçon')] || '').trim();
              const dev = (oldRow[findKey(oldRow, 'Devoirs')] || '').trim();
              const obj = (oldRow[findKey(oldRow, 'Objectifs')] || '').trim();
              const hasTeacherData = Boolean(lec || dev || obj);

              if (hasTeacherData) {
                remappedClassRows.push(oldRow);
              }
            }
          });

          remappedClassRows.sort((a, b) => {
            const jA = a[findKey(a, 'Jour')];
            const jB = b[findKey(b, 'Jour')];
            const pA = a[findKey(a, 'Période')];
            const pB = b[findKey(b, 'Période')];
            const dDiff = getDayOrd(jA) - getDayOrd(jB);
            if (dDiff !== 0) return dDiff;
            return getPerNum(pA) - getPerNum(pB);
          });

          weekRows = [...otherRows, ...remappedClassRows];
          weekModified = true;
          totalUpdatedRows += remappedClassRows.length;
        }

        if (weekModified) {
          await db.collection('plans').updateOne(
            { _id: docId },
            {
              $set: {
                week: w,
                section: section,
                data: weekRows,
                updatedAt: now
              }
            },
            { upsert: true }
          );
          affectedWeeksCount++;
        }
      });
    }

    res.status(200).json({
      success: true,
      message: `Emploi du temps réorganisé avec succès sur ${affectedWeeksCount} semaine(s).`,
      affectedWeeksCount,
      totalUpdatedRows,
      startWeek: sWeek,
      endWeek: eWeek,
      targetMode
    });
  } catch (error) {
    console.error('Erreur /api/admin/reorganize-schedule:', error);
    res.status(500).json({ error: 'Erreur lors de la réorganisation de l\'emploi du temps: ' + error.message });
  }
});

// --------------------- Génération Word (plan hebdo) ---------------------

app.post('/api/generate-word', async (req, res) => {
  try {
    const { week, classe, data, notes, section: rawSection = 'garcons' } = req.body;
    const section = ['garcons', 'filles', 'primaire'].includes(String(rawSection).toLowerCase()) ? String(rawSection).toLowerCase() : 'garcons';
    const weekNumber = Number(week);
    if (!Number.isInteger(weekNumber) || !classe || !Array.isArray(data)) {
      return res.status(400).json({ message: 'Données invalides.' });
    }

    let templateBuffer;
    try {
      templateBuffer = await getWordTemplateBuffer();
    } catch (e) {
      console.error("Erreur de récupération du modèle Word:", e);
      return res.status(500).json({ message: `Erreur récupération modèle Word.` });
    }

    const zip = new PizZip(templateBuffer);
    const doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      nullGetter: () => "",
    });

    const groupedByDay = {};
    const dayOrder = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi"];
    const datesNode = specificWeekDateRangesNode[weekNumber];
    let weekStartDateNode = null;
    if (datesNode?.start) {
      weekStartDateNode = new Date(datesNode.start + 'T00:00:00Z');
    }
    if (!weekStartDateNode || isNaN(weekStartDateNode.getTime())) {
      return res.status(500).json({ message: `Dates serveur manquantes pour S${weekNumber}.` });
    }

    const sampleRow = data[0] || {};
    const defaultJourKey = findKey(sampleRow, 'Jour') || 'Jour',
          defaultPeriodeKey = findKey(sampleRow, 'Période') || 'Période',
          defaultMatiereKey = findKey(sampleRow, 'Matière') || 'Matière',
          defaultLeconKey = findKey(sampleRow, 'Leçon') || 'Leçon',
          defaultTravauxKey = findKey(sampleRow, 'Travaux de classe') || 'Travaux de classe',
          defaultSupportKey = findKey(sampleRow, 'Support') || 'Support',
          defaultDevoirsKey = findKey(sampleRow, 'Devoirs') || 'Devoirs';

    data.forEach(item => {
      const rawDay = item[findKey(item, 'Jour')] || item[defaultJourKey] || '';
      const day = extractDayNameFromString(rawDay) || rawDay;
      if (day && dayOrder.includes(day)) {
        if (!groupedByDay[day]) groupedByDay[day] = [];
        groupedByDay[day].push(item);
      }
    });

    const joursData = dayOrder.map(dayName => {
      if (!groupedByDay[dayName]) return null;

      const dateOfDay = getDateForDayNameNode(weekStartDateNode, dayName);
      const formattedDate = dateOfDay ? formatDateFrenchNode(dateOfDay) : dayName;
      const sortedEntries = groupedByDay[dayName].sort((a, b) => {
        const pA = a[findKey(a, 'Période')] || a[defaultPeriodeKey] || 0;
        const pB = b[findKey(b, 'Période')] || b[defaultPeriodeKey] || 0;
        return (parseInt(pA, 10) || 0) - (parseInt(pB, 10) || 0);
      });

      const matieres = sortedEntries.map(item => ({
        matiere: item[findKey(item, 'Matière')] || item[defaultMatiereKey] || "",
        Lecon: formatTextForWord(item[findKey(item, 'Leçon')] || item[defaultLeconKey], { color: 'FF0000' }),
        travailDeClasse: formatTextForWord(item[findKey(item, 'Travaux de classe')] || item[defaultTravauxKey]),
        Support: formatTextForWord(item[findKey(item, 'Support')] || item[defaultSupportKey], { color: 'FF0000', italic: true }),
        devoirs: formatTextForWord(item[findKey(item, 'Devoirs')] || item[defaultDevoirsKey], { color: '0000FF', italic: true })
      }));

      return { jourDateComplete: formattedDate, matieres: matieres };
    }).filter(Boolean);

    let plageSemaineText = `Semaine ${weekNumber}`;
    if (datesNode?.start && datesNode?.end) {
      const startD = new Date(datesNode.start + 'T00:00:00Z');
      const endD = new Date(datesNode.end + 'T00:00:00Z');
      if (!isNaN(startD.getTime()) && !isNaN(endD.getTime())) {
        plageSemaineText = `du ${formatDateFrenchNode(startD)} à ${formatDateFrenchNode(endD)}`;
      }
    }

    const templateData = {
      semaine: weekNumber,
      classe: classe,
      jours: joursData,
      notes: formatTextForWord(notes),
      plageSemaine: plageSemaineText
    };

    doc.render(templateData);

    const buf = doc.getZip().generate({ type: 'nodebuffer', compression: 'DEFLATE' });
    const filename = `Plan_hebdomadaire_S${weekNumber}_${classe.replace(/[^a-z0-9]/gi, '_')}.docx`;

    // 1. Enregistrement du plan de leçon dans MongoDB
    try {
      const db = await connectToDatabase();
      const lessonPlanId = `${section}_S${weekNumber}_${classe.replace(/[^a-z0-9]/gi, '_')}`;
      
      await db.collection('weeklyLessonPlans').updateOne(
          { _id: lessonPlanId },
          { 
              $set: { 
                  week: weekNumber, 
                  classe: classe, 
                  section: section,
                  filename: filename, 
                  fileData: buf, 
                  updatedAt: new Date() 
              },
              $setOnInsert: { createdAt: new Date() }
          },
          { upsert: true }
      );
      console.log(`✅ Plan de leçon ${lessonPlanId} (${section}) enregistré dans MongoDB.`);
    } catch (dbError) {
      console.error(`❌ Erreur lors de l'enregistrement du plan de leçon dans MongoDB:`, dbError);
      // On continue pour envoyer le fichier même en cas d'échec de l'enregistrement
    }
    // Fin 1. Enregistrement du plan de leçon dans MongoDB
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.send(buf);

  } catch (error) {
    console.error('❌ Erreur serveur /generate-word:', error);
    if (!res.headersSent) {
      res.status(500).json({ message: 'Erreur interne /generate-word.' });
    }
	  }
	});

	// --------------------- Génération ZIP (Plans de Leçon Multiples) ---------------------

	app.post('/api/generate-weekly-plans-zip', async (req, res) => {
	  try {
	    const { week, classes, data, notes, section: rawSection = 'garcons' } = req.body;
	    const section = ['garcons', 'filles', 'primaire'].includes(String(rawSection).toLowerCase()) ? String(rawSection).toLowerCase() : 'garcons';
	    const weekNumber = Number(week);
	    if (!Number.isInteger(weekNumber) || !Array.isArray(classes) || !Array.isArray(data)) {
	      return res.status(400).json({ message: 'Données invalides (semaine, classes ou data manquantes).' });
	    }

	    // Configuration du ZIP
	    const archive = archiver('zip', { zlib: { level: 9 } });
	    const filename = `Plans_Hebdomadaires_S${weekNumber}_${classes.length}_Classes.zip`;

	    res.setHeader('Content-Type', 'application/zip');
	    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
	    archive.pipe(res);

	    const dayOrder = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi"];
	    const datesNode = specificWeekDateRangesNode[weekNumber];
	    let weekStartDateNode = null;
	    if (datesNode?.start) {
	      weekStartDateNode = new Date(datesNode.start + 'T00:00:00Z');
	    }
	    if (!weekStartDateNode || isNaN(weekStartDateNode.getTime())) {
	      archive.abort();
	      return res.status(500).json({ message: `Dates serveur manquantes pour S${weekNumber}.` });
	    }

	    let templateBuffer;
	    try {
	      templateBuffer = await getWordTemplateBuffer();
	    } catch (e) {
	      console.error("Erreur de récupération du modèle Word:", e);
	      archive.abort();
	      return res.status(500).json({ message: `Erreur récupération modèle Word.` });
	    }

	    let plageSemaineText = `Semaine ${weekNumber}`;
	    if (datesNode?.start && datesNode?.end) {
	      const startD = new Date(datesNode.start + 'T00:00:00Z');
	      const endD = new Date(datesNode.end + 'T00:00:00Z');
	      if (!isNaN(startD.getTime()) && !isNaN(endD.getTime())) {
	        plageSemaineText = `du ${formatDateFrenchNode(startD)} à ${formatDateFrenchNode(endD)}`;
	      }
	    }

	    const sampleRow = data[0] || {};
	    const jourKey = findKey(sampleRow, 'Jour'),
	          periodeKey = findKey(sampleRow, 'Période'),
	          matiereKey = findKey(sampleRow, 'Matière'),
	          leconKey = findKey(sampleRow, 'Leçon'),
	          travauxKey = findKey(sampleRow, 'Travaux de classe'),
	          supportKey = findKey(sampleRow, 'Support'),
	          devoirsKey = findKey(sampleRow, 'Devoirs');

	    for (const classe of classes) {
	      const classData = data.filter(item => {
	        const itemClass = item[findKey(item, 'Classe')] || item.Classe || item.classe;
	        return itemClass && (itemClass === classe || isClassMatchServer(itemClass, classe));
	      });
	      const classNotes = notes[classe] || '';

	      if (classData.length === 0) {
	        console.warn(`Aucune donnée trouvée pour la classe ${classe}. Sautée.`);
	        continue;
	      }

	      const groupedByDay = {};
	      classData.forEach(item => {
	        const day = item[jourKey];
	        if (day && dayOrder.includes(day)) {
	          if (!groupedByDay[day]) groupedByDay[day] = [];
	          groupedByDay[day].push(item);
	        }
	      });

	      const joursData = dayOrder.map(dayName => {
	        if (!groupedByDay[dayName]) return null;

	        const dateOfDay = getDateForDayNameNode(weekStartDateNode, dayName);
	        const formattedDate = dateOfDay ? formatDateFrenchNode(dateOfDay) : dayName;
	        const sortedEntries = groupedByDay[dayName].sort((a, b) => (parseInt(a[periodeKey], 10) || 0) - (parseInt(b[periodeKey], 10) || 0));

	        const matieres = sortedEntries.map(item => ({
	          matiere: item[matiereKey] ?? "",
	          Lecon: formatTextForWord(item[leconKey], { color: 'FF0000' }),
	          travailDeClasse: formatTextForWord(item[travauxKey]),
	          Support: formatTextForWord(item[supportKey], { color: 'FF0000', italic: true }),
	          devoirs: formatTextForWord(item[devoirsKey], { color: '0000FF', italic: true })
	        }));

	        return { jourDateComplete: formattedDate, matieres: matieres };
	      }).filter(Boolean);

	      const templateData = {
	        semaine: weekNumber,
	        classe: classe,
	        jours: joursData,
	        notes: formatTextForWord(classNotes),
	        plageSemaine: plageSemaineText
	      };

	      // Créer une nouvelle instance de Docxtemplater pour chaque classe
	      const zip = new PizZip(templateBuffer);
	      const doc = new Docxtemplater(zip, {
	        paragraphLoop: true,
	        nullGetter: () => "",
	      });

	      doc.render(templateData);

	      const buf = doc.getZip().generate({ type: 'nodebuffer', compression: 'DEFLATE' });
	      const docxFilename = `Plan_hebdomadaire_S${weekNumber}_${classe.replace(/[^a-z0-9]/gi, '_')}.docx`;

	      // Enregistrement du plan de leçon dans MongoDB (comme dans /api/generate-word)
	      try {
	        const db = await connectToDatabase();
	        const lessonPlanId = `${section}_S${weekNumber}_${classe.replace(/[^a-z0-9]/gi, '_')}`;
	        
	        await db.collection('weeklyLessonPlans').updateOne(
	            { _id: lessonPlanId },
	            { 
	                $set: { 
	                    week: weekNumber, 
	                    classe: classe, 
	                    section: section,
	                    filename: docxFilename, 
	                    fileData: buf, 
	                    updatedAt: new Date() 
	                },
	                $setOnInsert: { createdAt: new Date() }
	            },
	            { upsert: true }
	        );
	        console.log(`✅ Plan de leçon ${lessonPlanId} (${section}) enregistré dans MongoDB.`);
	      } catch (dbError) {
	        console.error(`❌ Erreur lors de l'enregistrement du plan de leçon dans MongoDB:`, dbError);
	      }
	      
	      // Ajouter le DOCX au ZIP
	      archive.append(buf, { name: docxFilename });
	    }

	    archive.finalize();

	  } catch (error) {
	    console.error('❌ Erreur serveur /generate-weekly-plans-zip:', error);
	    if (!res.headersSent) {
	      res.status(500).json({ message: 'Erreur interne /generate-weekly-plans-zip.' });
	    }
	  }
	});

	// --------------------- Génération Plan Hebdomadaire Stylisé (Design & PDF) ---------------------

	app.post('/api/generate-design-plan', async (req, res) => {
	  try {
	    const { week, classe, data, notes, section: rawSection = 'garcons', theme = 'indigo', showPhotos = true, download = false } = req.body;
	    const section = ['garcons', 'filles', 'primaire'].includes(String(rawSection).toLowerCase()) ? String(rawSection).toLowerCase() : 'garcons';
	    const weekNumber = Number(week);
	    if (!Number.isInteger(weekNumber) || !classe) {
	      return res.status(400).json({ message: 'Numéro de semaine et classe obligatoires pour la génération du plan stylisé.' });
	    }

	    const db = await connectToDatabase();

	    let planData = Array.isArray(data) ? data : [];
	    if (planData.length === 0) {
	      let planDoc = await db.collection('plans').findOne({ week: weekNumber, section: section });
	      if (!planDoc) {
	        planDoc = await db.collection('plans').findOne({ _id: `${section}_${weekNumber}` });
	      }
	      if (!planDoc) {
	        planDoc = await db.collection('plans').findOne({ week: weekNumber });
	      }
	      planData = planDoc ? (planDoc.data || planDoc.planData || []) : [];
	    }

	    // Règle 5 : Traiter chaque classe SEULE de façon strictement isolée
	    if (classe && typeof classe === 'string' && !['toutes', 'all', 'classe'].includes(classe.trim().toLowerCase())) {
	      const targetNorm = classe.trim().toLowerCase().replace(/[\s\-_]+/g, '');
	      planData = planData.filter(r => {
	        const c = String(r[findKey(r, 'Classe')] || r.Classe || r.classe || '').trim().toLowerCase().replace(/[\s\-_]+/g, '');
	        return c === targetNorm || c.includes(targetNorm) || targetNorm.includes(c);
	      });
	    }

	    let classNotes = '';
	    // 1. Si `notes` a été fourni directement en chaîne
	    if (typeof notes === 'string' && notes.trim() !== '') {
	      classNotes = notes.trim();
	    } else if (notes && typeof notes === 'object') {
	      // 2. Si `notes` a été fourni en dictionnaire (ex: { "PEI2 Garçons": "..." })
	      if (notes[classe] && typeof notes[classe] === 'string' && notes[classe].trim() !== '') {
	        classNotes = notes[classe].trim();
	      } else {
	        const normTarget = String(classe).toLowerCase().replace(/[\s\-_]+/g, '');
	        for (const [k, v] of Object.entries(notes)) {
	          if (typeof v === 'string' && v.trim() !== '') {
	            const normK = String(k).toLowerCase().replace(/[\s\-_]+/g, '');
	            if (normK === normTarget || normK.includes(normTarget) || normTarget.includes(normK)) {
	              classNotes = v.trim();
	              break;
	            }
	          }
	        }
	      }
	    }

	    // 3. Si toujours non trouvé, chercher dans la collection 'plans' (où /api/save-notes enregistre classNotes)
	    if (!classNotes) {
	      try {
	        const planDocs = await db.collection('plans').find({
	          $or: [
	            { _id: `${section}_${weekNumber}` },
	            { _id: `${section}_${String(weekNumber)}` },
	            { week: weekNumber, section: section },
	            { week: String(weekNumber), section: section },
	            { week: weekNumber }
	          ]
	        }).toArray();

	        for (const pDoc of planDocs) {
	          const cNotes = pDoc.classNotes || pDoc.notes;
	          if (cNotes && typeof cNotes === 'object') {
	            if (cNotes[classe] && typeof cNotes[classe] === 'string' && cNotes[classe].trim() !== '') {
	              classNotes = cNotes[classe].trim();
	              break;
	            }
	            const normTarget = String(classe).toLowerCase().replace(/[\s\-_]+/g, '');
	            for (const [k, v] of Object.entries(cNotes)) {
	              if (typeof v === 'string' && v.trim() !== '') {
	                const normK = String(k).toLowerCase().replace(/[\s\-_]+/g, '');
	                if (normK === normTarget || normK.includes(normTarget) || normTarget.includes(normK)) {
	                  classNotes = v.trim();
	                  break;
	                }
	              }
	            }
	            if (classNotes) break;
	          }
	        }
	      } catch (ne) {
	        console.warn('Erreur lecture classNotes depuis plans:', ne.message);
	      }
	    }

	    // 4. Repli sur 'weekly_notes' si existant
	    if (!classNotes) {
	      try {
	        const notesDoc = await db.collection('weekly_notes').findOne({ week: weekNumber, section: section });
	        if (notesDoc && notesDoc.notes && notesDoc.notes[classe]) {
	          classNotes = notesDoc.notes[classe];
	        }
	      } catch (ne) {
	        console.warn('Erreur lecture weekly_notes:', ne.message);
	      }
	    }

	    // Récupérer les journées spéciales / fusionnées
	    let specialDays = [];
	    try {
	      specialDays = await db.collection('special_days').find({ 
	        section: section, 
	        week: weekNumber 
	      }).toArray();
	    } catch (sde) {
	      console.warn('Erreur lecture special_days dans generate-design-plan:', sde.message);
	    }

	    const photosDocs = await db.collection('teachers_photos').find({}).toArray();
	    const teachersPhotos = {};
	    photosDocs.forEach(d => {
	      if (d.teacherName && d.photoUrl) teachersPhotos[d.teacherName] = d.photoUrl;
	    });
	    const usersWithPhotos = await db.collection('users').find({ photoUrl: { $exists: true, $ne: '' } }).toArray();
	    usersWithPhotos.forEach(u => {
	      if (u.username && u.photoUrl && !teachersPhotos[u.username]) teachersPhotos[u.username] = u.photoUrl;
	      if (u.tableTeacherName && u.photoUrl && !teachersPhotos[u.tableTeacherName]) teachersPhotos[u.tableTeacherName] = u.photoUrl;
	    });

	    const datesNode = specificWeekDateRangesNode[weekNumber];
	    let weekStartDateNode = null;
	    let plageSemaineText = '';
	    if (datesNode?.start) {
	      weekStartDateNode = new Date(datesNode.start + 'T00:00:00Z');
	      if (datesNode?.end) {
	        const startD = new Date(datesNode.start + 'T00:00:00Z');
	        const endD = new Date(datesNode.end + 'T00:00:00Z');
	        if (!isNaN(startD.getTime()) && !isNaN(endD.getTime())) {
	          plageSemaineText = `du ${formatDateFrenchNode(startD)} à ${formatDateFrenchNode(endD)}`;
	        }
	      }
	    }

	    const html = generateDesignPlanHtml({
	      week: weekNumber,
	      classe,
	      data: planData,
	      notes: classNotes,
	      section,
	      theme,
	      showPhotos,
	      teachersPhotos,
	      weekStartDate: weekStartDateNode,
	      weekDateRange: plageSemaineText,
	      semester: 1,
	      specialDays: specialDays || []
	    });

	    if (download) {
	      const filename = `Plan_Hebdomadaire_Design_S${weekNumber}_${classe.replace(/[^a-z0-9]/gi, '_')}.html`;
	      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
	      res.setHeader('Content-Type', 'text/html; charset=utf-8');
	      return res.send(html);
	    }

	    res.setHeader('Content-Type', 'text/html; charset=utf-8');
	    return res.send(html);
	  } catch (error) {
	    console.error('❌ Erreur /api/generate-design-plan:', error);
	    res.status(500).json({ message: 'Erreur lors de la génération du plan stylisé: ' + error.message });
	  }
	});

	// --------------------- Proxy Sécurisé Photos Google Drive ---------------------
	app.get('/api/proxy-drive-image/:id', async (req, res) => {
	  try {
	    const fileId = req.params.id;
	    if (!fileId || !/^[a-zA-Z0-9_-]+$/.test(fileId)) {
	      return res.status(400).send('ID Drive invalide');
	    }
	    const directUrl = `https://lh3.googleusercontent.com/d/${fileId}=s400`;
	    const driveResp = await fetch(directUrl, {
	      headers: {
	        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
	      }
	    });
	    if (driveResp.ok) {
	      const contentType = driveResp.headers.get('content-type') || 'image/jpeg';
	      res.setHeader('Content-Type', contentType);
	      res.setHeader('Cache-Control', 'public, max-age=86400');
	      return driveResp.body.pipe(res);
	    }
	    // Repli vers uc?export=view
	    const fallbackUrl = `https://drive.google.com/uc?export=view&id=${fileId}`;
	    const fbResp = await fetch(fallbackUrl);
	    if (fbResp.ok) {
	      const contentType = fbResp.headers.get('content-type') || 'image/jpeg';
	      res.setHeader('Content-Type', contentType);
	      res.setHeader('Cache-Control', 'public, max-age=86400');
	      return fbResp.body.pipe(res);
	    }
	    return res.status(404).send('Photo non trouvée sur Drive');
	  } catch (err) {
	    console.warn('Proxy image Drive warn:', err.message);
	    return res.status(500).send('Erreur proxy image');
	  }
	});

	// --------------------- Téléchargement Plan de Leçon (DOCX) ---------------------

	app.get('/api/download-weekly-plan/:week/:classe', async (req, res) => {
	  try {
	    const weekNumber = Number(req.params.week);
	    const classe = req.params.classe;
	    const rawSection = String(req.query.section || 'garcons').toLowerCase().trim();
	    const section = ['garcons', 'filles', 'primaire'].includes(rawSection) ? rawSection : 'garcons';
	    if (!Number.isInteger(weekNumber) || !classe) {
	      return res.status(400).json({ message: 'Semaine ou classe invalide.' });
	    }

	    const lessonPlanId = `${section}_S${weekNumber}_${classe.replace(/[^a-z0-9]/gi, '_')}`;
	    const db = await connectToDatabase();
	    let planDocument = await db.collection('weeklyLessonPlans').findOne({ _id: lessonPlanId });
	    if (!planDocument) {
	      planDocument = await db.collection('weeklyLessonPlans').findOne({ week: weekNumber, classe: classe, section: section });
	    }
	    if (!planDocument) {
	      planDocument = await db.collection('weeklyLessonPlans').findOne({ _id: `S${weekNumber}_${classe.replace(/[^a-z0-9]/gi, '_')}` });
	    }

	    if (!planDocument || !planDocument.fileData) {
	      console.log(`⚠️ Plan de leçon non trouvé pour ${lessonPlanId}`);
	      return res.status(404).json({ message: 'Plan de leçon non généré ou non trouvé.' });
	    }

	    console.log(`✅ Plan de leçon trouvé pour ${lessonPlanId}. Envoi du fichier.`);
	    res.setHeader('Content-Disposition', `attachment; filename="${planDocument.filename}"`);
	    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
	    res.send(planDocument.fileData.buffer); // fileData est un BSON Binary, on utilise .buffer pour le Buffer Node.js

	  } catch (error) {
	    console.error('❌ Erreur serveur /download-weekly-plan:', error);
	    if (!res.headersSent) {
	      res.status(500).json({ message: 'Erreur interne /download-weekly-plan.' });
	    }
	  }
	});

	// --------------------- Génération Excel (workbook) ---------------------

app.post('/api/generate-excel-workbook', async (req, res) => {
  try {
    const weekNumber = Number(req.body.week);
    const section = (req.body.section || 'garcons').toLowerCase().trim();
    const requestedClass = req.body.classe ? String(req.body.classe).trim() : null;
    const customData = req.body.data;
    const customNotes = req.body.notes;

    if (!Number.isInteger(weekNumber)) return res.status(400).json({ message: 'Semaine invalide.' });

    const db = await connectToDatabase();
    let planData = [];
    let classNotes = {};

    if (Array.isArray(customData) && customData.length > 0) {
      planData = customData;
      if (customNotes && typeof customNotes === 'object') classNotes = customNotes;
    } else {
      const docId = `${section}_${weekNumber}`;
      let planDocument = await db.collection('plans').findOne({ _id: docId });
      if (!planDocument) {
        planDocument = await db.collection('plans').findOne({ week: weekNumber, section: section });
      }

      if (!planDocument?.data?.length) {
        return res.status(404).json({ message: `Aucune donnée pour la Semaine ${weekNumber} (${section}).` });
      }
      planData = planDocument.data;
      classNotes = planDocument.classNotes || {};
    }

    const finalHeaders = [ 'Enseignant', 'Jour', 'Période', 'Classe', 'Matière', 'Leçon', 'Travaux de classe', 'Support', 'Devoirs' ];
    const norm = (s) => String(s || '').replace(/\s+/g, '').toLowerCase();

    const formatRows = (rows) => {
      return rows.map(item => {
        const row = {};
        finalHeaders.forEach(header => {
          const itemKey = findKey(item, header);
          row[header] = itemKey ? (item[itemKey] || '') : '';
        });
        return row;
      });
    };

    const workbook = XLSX.utils.book_new();

    if (requestedClass && requestedClass !== 'ALL') {
      // 1. Export INDÉPENDANT d'une classe unique
      const classRows = planData.filter(row => {
        const clsVal = row[findKey(row, 'Classe')] || row['Classe'] || row['classe'];
        return clsVal && isClassMatchServer(clsVal, requestedClass);
      });

      if (classRows.length === 0) {
        return res.status(404).json({ message: `Aucune séance trouvée pour la classe '${requestedClass}' en Semaine ${weekNumber}.` });
      }

      const formatted = formatRows(classRows);
      const worksheet = XLSX.utils.json_to_sheet(formatted, { header: finalHeaders });
      worksheet['!cols'] = [
        { wch: 22 }, { wch: 14 }, { wch: 10 }, { wch: 12 }, { wch: 22 },
        { wch: 45 }, { wch: 45 }, { wch: 25 }, { wch: 45 }
      ];
      const safeSheetName = requestedClass.substring(0, 30).replace(/[*?:/\\\[\]]/g, '_');
      XLSX.utils.book_append_sheet(workbook, worksheet, safeSheetName);

      const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' });
      const filename = `Plan_Hebdomadaire_S${weekNumber}_${section}_${requestedClass.replace(/[^a-z0-9]/gi, '_')}.xlsx`;
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      return res.send(buffer);
    } else {
      // 2. Export COMPLET de la section : onglets par classe + onglet Global
      const distinctClasses = [];
      planData.forEach(row => {
        const clsVal = row[findKey(row, 'Classe')];
        if (clsVal && !distinctClasses.includes(clsVal.trim())) {
          distinctClasses.push(clsVal.trim());
        }
      });
      distinctClasses.sort();

      // Onglet Global
      const formattedGlobal = formatRows(planData);
      const wsGlobal = XLSX.utils.json_to_sheet(formattedGlobal, { header: finalHeaders });
      wsGlobal['!cols'] = [
        { wch: 22 }, { wch: 14 }, { wch: 10 }, { wch: 12 }, { wch: 22 },
        { wch: 45 }, { wch: 45 }, { wch: 25 }, { wch: 45 }
      ];
      XLSX.utils.book_append_sheet(workbook, wsGlobal, `Global_${section}`);

      // Onglets dédiés par classe
      distinctClasses.forEach(clsName => {
        const cRows = planData.filter(row => {
          const clsVal = row[findKey(row, 'Classe')];
          return clsVal && norm(clsVal) === norm(clsName);
        });
        if (cRows.length > 0) {
          const formattedCls = formatRows(cRows);
          const wsCls = XLSX.utils.json_to_sheet(formattedCls, { header: finalHeaders });
          wsCls['!cols'] = [
            { wch: 22 }, { wch: 14 }, { wch: 10 }, { wch: 12 }, { wch: 22 },
            { wch: 45 }, { wch: 45 }, { wch: 25 }, { wch: 45 }
          ];
          const safeSheetName = clsName.substring(0, 30).replace(/[*?:/\\\[\]]/g, '_');
          XLSX.utils.book_append_sheet(workbook, wsCls, safeSheetName);
        }
      });

      const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' });
      const filename = `Plan_Hebdomadaire_S${weekNumber}_${section}_Complet.xlsx`;
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      return res.send(buffer);
    }
  } catch (error) {
    console.error('❌ Erreur serveur /generate-excel-workbook:', error);
    if (!res.headersSent) res.status(500).json({ message: 'Erreur interne Excel.' });
  }
});

// --------------- Rapport Excel par classe (toutes semaines) ------------

app.post('/api/full-report-by-class', async (req, res) => {
  try {
    const { classe: requestedClass, section = 'garcons' } = req.body;
    if (!requestedClass) return res.status(400).json({ message: 'Classe requise.' });

    const db = await connectToDatabase();
    let allPlans = await db.collection('plans').find({ section: section }).sort({ week: 1 }).toArray();
    if (!allPlans || allPlans.length === 0) return res.status(404).json({ message: 'Aucune donnée.' });

    const dataBySubject = {};
    const monthsFrench = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];

    allPlans.forEach(plan => {
      const weekNumber = plan.week;
      let monthName = 'N/A';
      const weekDates = specificWeekDateRangesNode[weekNumber];
      if (weekDates?.start) {
        try {
          const startDate = new Date(weekDates.start + 'T00:00:00Z');
          monthName = monthsFrench[startDate.getUTCMonth()];
        } catch (e) {}
      }

      (plan.data || []).forEach(item => {
        const itemClassKey = findKey(item, 'classe');
        const itemSubjectKey = findKey(item, 'matière');
        if (itemClassKey && item[itemClassKey] === requestedClass && itemSubjectKey && item[itemSubjectKey]) {
          const subject = item[itemSubjectKey];
          if (!dataBySubject[subject]) dataBySubject[subject] = [];
          const row = {
            'Mois': monthName,
            'Semaine': weekNumber,
            'Période': item[findKey(item, 'période')] || '',
            'Leçon': item[findKey(item, 'leçon')] || '',
            'Travaux de classe': item[findKey(item, 'travaux de classe')] || '',
            'Support': item[findKey(item, 'support')] || '',
            'Devoirs': item[findKey(item, 'devoirs')] || ''
          };
          dataBySubject[subject].push(row);
        }
      });
    });

    const subjectsFound = Object.keys(dataBySubject);
    if (subjectsFound.length === 0) return res.status(404).json({ message: `Aucune donnée pour la classe '${requestedClass}'.` });

    const workbook = XLSX.utils.book_new();
    const headers = ['Mois', 'Semaine', 'Période', 'Leçon', 'Travaux de classe', 'Support', 'Devoirs'];

    subjectsFound.sort().forEach(subject => {
      const safeSheetName = subject.substring(0, 30).replace(/[*?:/\\\[\]]/g, '_');
      const worksheet = XLSX.utils.json_to_sheet(dataBySubject[subject], { header: headers });
      worksheet['!cols'] = [
        { wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 40 }, { wch: 40 }, { wch: 25 }, { wch: 40 }
      ];
      XLSX.utils.book_append_sheet(workbook, worksheet, safeSheetName);
    });

    const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' });
    const filename = `Rapport_Complet_${section}_${requestedClass.replace(/[^a-z0-9]/gi, '_')}.xlsx`;
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buffer);
  } catch (error) {
    console.error('❌ Erreur serveur /full-report-by-class:', error);
    if (!res.headersSent) res.status(500).json({ message: 'Erreur interne du rapport.' });
  }
});

// // ======================= GESTION MULTI-CLÉS IA (GROQ & GEMINI) ==================

function getAllGroqApiKeys() {
  const keys = [];
  const addKeyStr = (str) => {
    if (!str) return;
    str.split(/[\n,;]+/).forEach(k => {
      const trimmed = k.trim();
      if (trimmed.length > 10) {
        keys.push(trimmed);
      }
    });
  };

  addKeyStr(process.env.GROQ_API_KEYS);
  addKeyStr(process.env.GROQ_API_KEY);
  addKeyStr(process.env.GROQ_API_KEY_BACKUP);
  for (let i = 1; i <= 30; i++) {
    addKeyStr(process.env[`GROQ_API_KEY_${i}`]);
    addKeyStr(process.env[`GROQ_API_KEY_${i}_BACKUP`]);
  }
  return Array.from(new Set(keys));
}

function getAllGeminiApiKeys() {
  const keys = [];
  const addKeyStr = (str) => {
    if (!str) return;
    str.split(/[\n,;]+/).forEach(k => {
      const trimmed = k.trim();
      if (trimmed.length > 10) {
        keys.push(trimmed);
      }
    });
  };

  addKeyStr(process.env.GEMINI_API_KEYS);
  addKeyStr(process.env.GEMINI_API_KEY);
  addKeyStr(process.env.GEMINI_API_KEY_BACKUP);
  addKeyStr(process.env.GOOGLE_API_KEY);
  addKeyStr(process.env.GEMINI_KEY);
  for (let i = 1; i <= 30; i++) {
    addKeyStr(process.env[`GEMINI_API_KEY_${i}`]);
    addKeyStr(process.env[`GEMINI_API_KEY_${i}_BACKUP`]);
    addKeyStr(process.env[`GOOGLE_API_KEY_${i}`]);
  }
  return Array.from(new Set(keys));
}

let globalGroqKeyIndex = 0;
let globalGeminiKeyIndex = 0;

/**
 * Appelle les APIs IA avec rotation circulaire infinie entre toutes les clés configurées
 * (GEMINI 1..N et GROQ 1..N, boucle continue avec basculement automatique et repli multi-modèles)
 */
async function callAiWithKeyRotation(prompt, contextLog = 'Lesson Plan') {
  const groqKeys = getAllGroqApiKeys();
  const geminiKeys = getAllGeminiApiKeys();

  if (groqKeys.length === 0 && geminiKeys.length === 0) {
    throw new Error("Aucune clé API IA (GEMINI ou GROQ) n'est configurée sur le serveur. Veuillez ajouter vos clés dans les variables d'environnement.");
  }

  let lastError = null;

  // 1. Tenter les clés GEMINI configurées en boucle circulaire
  if (geminiKeys.length > 0) {
    const totalGemini = geminiKeys.length;
    for (let attempt = 0; attempt < totalGemini; attempt++) {
      const gIdx = (globalGeminiKeyIndex + attempt) % totalGemini;
      const currentGeminiKey = geminiKeys[gIdx];
      const keyDisplay = `GEMINI #${gIdx + 1}/${totalGemini} (...${currentGeminiKey.slice(-4)})`;

      console.log(`🤖 [${contextLog}] Tentative avec ${keyDisplay}`);

      // Essayer les modèles standard les plus fiables sur Generative Language API
      const geminiConfigs = [
        { model: 'gemini-2.0-flash', apiVersion: 'v1beta' },
        { model: 'gemini-1.5-flash', apiVersion: 'v1beta' },
        { model: 'gemini-1.5-flash', apiVersion: 'v1' },
        { model: 'gemini-1.5-pro', apiVersion: 'v1beta' },
        { model: 'gemini-2.5-flash', apiVersion: 'v1beta' }
      ];

      let keyHasQuotaError = false;

      for (const cfg of geminiConfigs) {
        try {
          // Utiliser le SDK @google/genai si disponible
          if (GoogleGenAI) {
            try {
              const ai = new GoogleGenAI({ apiKey: currentGeminiKey });
              const aiResp = await ai.models.generateContent({
                model: cfg.model,
                contents: prompt,
              });
              const aiText = aiResp?.text ? aiResp.text.trim() : null;
              if (aiText) {
                globalGeminiKeyIndex = (gIdx + 1) % totalGemini;
                console.log(`✅ [${contextLog}] Succès avec SDK @google/genai ${keyDisplay} (modèle: ${cfg.model})`);
                return { content: aiText, provider: `GEMINI (clé ${gIdx + 1}/${totalGemini})`, model: cfg.model };
              }
            } catch (sdkErr) {
              // Si erreur 429 quota, marquer et propager
              if (sdkErr.status === 429 || (sdkErr.message && sdkErr.message.includes('429'))) {
                lastError = new Error(`Quota GEMINI clé #${gIdx + 1} épuisé (429)`);
                keyHasQuotaError = true;
                break;
              }
            }
          }

          const url = `https://generativelanguage.googleapis.com/${cfg.apiVersion}/models/${cfg.model}:generateContent?key=${currentGeminiKey}`;
          const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ role: 'user', parts: [{ text: prompt }] }]
            })
          });

          if (response.ok) {
            const data = await response.json();
            let content = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
            if (!content && Array.isArray(data?.candidates?.[0]?.content?.parts)) {
              content = data.candidates[0].content.parts.map(p => p.text || '').join('').trim();
            }
            if (content) {
              globalGeminiKeyIndex = (gIdx + 1) % totalGemini;
              console.log(`✅ [${contextLog}] Succès avec ${keyDisplay} (modèle: ${cfg.model})`);
              return { content, provider: `GEMINI (clé ${gIdx + 1}/${totalGemini})`, model: cfg.model };
            }
          }

          const status = response.status;
          const errBody = await response.json().catch(() => ({}));
          console.warn(`⚠️ [${contextLog}] ${keyDisplay} [${cfg.model}] - HTTP ${status}: ${errBody.error?.message || response.statusText}`);

          if (status === 429) {
            lastError = new Error(`Quota GEMINI clé #${gIdx + 1} épuisé (429)`);
            keyHasQuotaError = true;
            break; // Passer directement à la clé suivante
          } else if (status === 404) {
            // Modèle non trouvé pour cette version, tester le modèle suivant sur cette clé
            continue;
          } else {
            lastError = new Error(errBody.error?.message || `Erreur GEMINI ${status}`);
          }
        } catch (geminiErr) {
          console.error(`❌ [${contextLog}] Erreur réseau ${keyDisplay}:`, geminiErr.message);
          lastError = geminiErr;
        }
      }

      if (!keyHasQuotaError && geminiConfigs.length > 0) {
        // Passer à la clé suivante si tous les modèles de cette clé ont échoué
        continue;
      }
    }
    console.warn(`⚠️ [${contextLog}] Toutes les clés GEMINI (${totalGemini}) ont été testées. Test des clés GROQ de secours si disponibles...`);
  }

  // 2. Tenter les clés GROQ disponibles en boucle circulaire
  if (groqKeys.length > 0) {
    const totalGroq = groqKeys.length;
    for (let attempt = 0; attempt < totalGroq; attempt++) {
      const keyIdx = (globalGroqKeyIndex + attempt) % totalGroq;
      const currentGroqKey = groqKeys[keyIdx];
      const keyDisplay = `GROQ #${keyIdx + 1}/${totalGroq} (...${currentGroqKey.slice(-4)})`;
      
      console.log(`🤖 [${contextLog}] Tentative avec ${keyDisplay}`);

      const modelsToTry = ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant'];

      for (const model of modelsToTry) {
        try {
          const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${currentGroqKey}`
            },
            body: JSON.stringify({
              model: model,
              messages: [{ role: 'user', content: prompt }],
              temperature: 0.7,
              max_tokens: 2048
            })
          });

          if (response.ok) {
            const data = await response.json();
            const content = data?.choices?.[0]?.message?.content?.trim();
            if (content) {
              globalGroqKeyIndex = (keyIdx + 1) % totalGroq;
              console.log(`✅ [${contextLog}] Succès avec ${keyDisplay} (modèle: ${model})`);
              return { content, provider: `GROQ (clé ${keyIdx + 1}/${totalGroq})`, model };
            }
          }

          const status = response.status;
          const errBody = await response.json().catch(() => ({}));
          console.warn(`⚠️ [${contextLog}] ${keyDisplay} - HTTP ${status}: ${errBody.error?.message || response.statusText}`);

          if (status === 429) {
            lastError = new Error(`Quota GROQ clé #${keyIdx + 1} épuisé (429)`);
            continue;
          } else {
            lastError = new Error(errBody.error?.message || `Erreur GROQ ${status}`);
            break;
          }
        } catch (fetchErr) {
          console.error(`❌ [${contextLog}] Erreur réseau ${keyDisplay}:`, fetchErr.message);
          lastError = fetchErr;
          break;
        }
      }
    }
  }

  throw new Error(`⚠️ QUOTA API ÉPUISÉ : Toutes les clés API (${geminiKeys.length} GEMINI + ${groqKeys.length} GROQ) ont atteint leur limite. Veuillez vérifier vos clés ou réessayer. Détails: ${lastError?.message || ''}`);
}

// --------------------- Helper Jour Férié & Cycle Maternelle ---------------------
function isMaternelleClassServer(className) {
  if (!className) return false;
  const c = String(className).trim().toUpperCase();
  const clean = c.replace(/[\s\-_]+/g, '');
  return clean === 'PS' || clean === 'MS' || clean === 'GS' ||
         clean === 'PETITESECTION' || clean === 'MOYENNESECTION' || clean === 'GRANDESECTION' ||
         clean.includes('MATERNELLE') ||
         clean.includes('روضة') || clean.includes('روضه') ||
         clean === 'PS1' || clean === 'MS1' || clean === 'GS1' ||
         clean === 'PS2' || clean === 'MS2' || clean === 'GS2';
}

function isHolidayRowServer(rowData, specialDaysList = [], week = null, section = null) {
  if (!rowData || typeof rowData !== 'object') return false;

  const holidayRegex = /(f[eé]ri[eé]|vacance|cong[eé]|f[eê]te|a[iï]d|eid|sans\s*cours|pas\s*de\s*cours|journ[eé]e\s*p[eé]dagogique|عطلة|إجازة|عيد|لا\s*توجد\s*دروس)/i;

  const lecon = String(rowData['Leçon'] || rowData['lecon'] || rowData['Lecon'] || '').trim();
  const travaux = String(rowData['Travaux de classe'] || rowData['travaux'] || rowData['Travaux'] || '').trim();
  const matiere = String(rowData['Matière'] || rowData['matiere'] || rowData['Matiere'] || '').trim();
  const devoirs = String(rowData['Devoirs'] || rowData['devoirs'] || '').trim();
  const objectifs = String(rowData['Objectifs'] || rowData['objectifs'] || '').trim();

  if (holidayRegex.test(lecon) || holidayRegex.test(travaux) || holidayRegex.test(matiere) || holidayRegex.test(devoirs) || holidayRegex.test(objectifs)) {
    return true;
  }

  const jour = String(rowData['Jour'] || rowData['jour'] || '').trim();
  const classe = String(rowData['Classe'] || rowData['classe'] || '').trim();

  if (Array.isArray(specialDaysList) && specialDaysList.length > 0 && jour) {
    const normDay = jour.toLowerCase().replace(/[^a-zà-ÿ]/g, '');
    const normCls = classe.toLowerCase().replace(/[\s\-_]+/g, '');
    const normSec = String(section || rowData.section || '').toLowerCase();

    const isMatch = specialDaysList.some(sd => {
      if (!sd) return false;
      if (week && sd.week && Number(sd.week) !== Number(week)) return false;
      if (normSec && sd.section && sd.section !== 'all' && sd.section.toLowerCase() !== normSec) return false;

      const sdDay = String(sd.day || '').toLowerCase().replace(/[^a-zà-ÿ]/g, '');
      if (!normDay.includes(sdDay) && !sdDay.includes(normDay)) return false;

      const sdCls = String(sd.classe || 'all').toLowerCase().replace(/[\s\-_]+/g, '');
      if (sdCls !== 'all' && sdCls !== normCls && !normCls.includes(sdCls) && !sdCls.includes(normCls)) return false;

      const isNoSchool = Boolean(sd.isNoSchool || sd.type === 'no_courses' || sd.type === 'holiday');
      const textMatch = holidayRegex.test(sd.title || '') || holidayRegex.test(sd.description || '') || holidayRegex.test(sd.message || '');
      return isNoSchool || textMatch;
    });

    if (isMatch) return true;
  }

  return false;
}

// --------------------- Génération IA (REST, v1, modèle dynamique) ------

app.post('/api/generate-ai-lesson-plan', async (req, res) => {
  let docxBufferToSend = null;
  let filenameToSend = 'plan_de_lecon.docx';
  let lessonPlanIdToSend = '';

  try {
    console.log('📝 [AI Lesson Plan] Nouvelle demande de génération');
    
    const groqKeys = getAllGroqApiKeys();
    const geminiKeys = getAllGeminiApiKeys();
    const hasAiKeys = (groqKeys.length > 0 || geminiKeys.length > 0);
    console.log(`🔧 [AI Lesson Plan] Pool IA actif: ${groqKeys.length} clé(s) GROQ, ${geminiKeys.length} clé(s) GEMINI`);

    const { week, rowData } = req.body;
    if (!rowData || typeof rowData !== 'object' || !week) {
      console.error('❌ [AI Lesson Plan] Données invalides:', { week, hasRowData: !!rowData });
      return res.status(400).json({ message: "Les données de la ligne ou de la semaine sont manquantes." });
    }

    const weekNumber = Number(week);
    const db = await connectToDatabase();

    // Règle 2 : Ne pas générer de plan de leçon si la séance tombe un jour férié ou chômé
    const specialDays = await db.collection('special_days').find({
      $or: [
        { week: weekNumber },
        { week: String(weekNumber) }
      ]
    }).toArray();

    if (isHolidayRowServer(rowData, specialDays, weekNumber, req.body.section)) {
      const cls = rowData.Classe || rowData.classe || '';
      const jr = rowData.Jour || rowData.jour || '';
      console.log(`⏸️ [AI Lesson Plan] Séance ignorée car jour férié/chômé: ${cls} - ${jr}`);
      return res.status(400).json({
        isHoliday: true,
        message: "Cette séance correspond à un jour férié ou chômé. Aucun plan de leçon n'a été généré pour cette date."
      });
    }
    
    console.log(`✅ [AI Lesson Plan] Génération pour semaine ${week}`);

    // Charger le modèle Word (depuis l'URL ou modèle intégré de secours)
    let templateBuffer;
    try {
      templateBuffer = await getLessonTemplateBuffer();
    } catch (e) {
      console.warn("⚠️ Récupération modèle distant échouée, utilisation du modèle interne:", e.message);
      templateBuffer = createDefaultLessonTemplateZip();
    }

    // Extraire données de la ligne
    const enseignant = rowData[findKey(rowData, 'Enseignant')] || '';
    const classe = rowData[findKey(rowData, 'Classe')] || '';
    const matiere = rowData[findKey(rowData, 'Matière')] || '';
    const rawLecon = rowData[findKey(rowData, 'Leçon')] || '';
    const lecon = (rawLecon && rawLecon.trim().length > 0 && rawLecon !== '-') ? rawLecon.trim() : `${matiere || 'Séance'} (${classe || ''})`;
    const jour = rowData[findKey(rowData, 'Jour')] || '';
    const seance = rowData[findKey(rowData, 'Période')] || '';
    const support = rowData[findKey(rowData, 'Support')] || 'Non spécifié';
    const travaux = rowData[findKey(rowData, 'Travaux de classe')] || 'Non spécifié';
    const devoirsPrevus = rowData[findKey(rowData, 'Devoirs')] || 'Non spécifié';
    
    console.log(`📚 [AI Lesson Plan] Données: ${enseignant} | ${classe} | ${matiere} | ${lecon}`);

    // Date formatée
    let formattedDate = "";
    const datesNode = specificWeekDateRangesNode[weekNumber];
    if (jour && datesNode?.start) {
      const weekStartDateNode = new Date(datesNode.start + 'T00:00:00Z');
      if (!isNaN(weekStartDateNode.getTime())) {
        const dayName = extractDayNameFromString(jour);
        if (dayName) {
          const dateOfDay = getDateForDayNameNode(weekStartDateNode, dayName);
          if (dateOfDay) formattedDate = formatDateFrenchNode(dateOfDay);
        }
      }
    }

    let aiData = null;
    let providerUsed = 'Modèle Pédagogique';

    // 1. Tenter la génération par l'IA si des clés sont présentes
    if (hasAiKeys) {
      const jsonStructure = `{"TitreUnite":"un titre d'unité pertinent pour la leçon","Methodes":"liste des méthodes d'enseignement","Outils":"liste des outils de travail","Objectifs":"une liste concise des objectifs d'apprentissage (compétences, connaissances), séparés par des sauts de ligne (\\\\n). Commence chaque objectif par un tiret (-).","etapes":[{"phase":"Introduction","duree":"5 min","activite":"Description de l'activité d'introduction pour l'enseignant et les élèves."},{"phase":"Activité Principale","duree":"25 min","activite":"Description de l'activité principale, en intégrant les 'travaux de classe' et le 'support' si possible."},{"phase":"Synthèse","duree":"10 min","activite":"Description de l'activité de conclusion et de vérification des acquis."},{"phase":"Clôture","duree":"5 min","activite":"Résumé rapide et annonce des devoirs."}],"Ressources":"les ressources spécifiques à utiliser.","Devoirs":"une suggestion de devoirs.","DiffLents":"une suggestion pour aider les apprenants en difficulté.","DiffTresPerf":"une suggestion pour stimuler les apprenants très performants.","DiffTous":"une suggestion de différenciation pour toute la classe."}`;

      const lessonLang = detectLessonLanguage(enseignant, matiere, lecon, travaux);
      let prompt;
      if (lessonLang === 'en') {
        prompt = `Return ONLY valid JSON. No markdown, no code fences, no commentary.
CRITICAL MANDATORY INSTRUCTION: You MUST strictly and faithfully generate the lesson plan specifically for the requested Subject: [${matiere}], Class: [${classe}], and Lesson Topic: [${lecon}].
- Subject: ${matiere}, Class: ${classe}, Lesson Topic: ${lecon}
- Planned Classwork: ${travaux}
- Mentioned Support/Materials: ${support}
- Planned Homework: ${devoirsPrevus}

STRICT PEDAGOGICAL COMPLIANCE RULES:
1. The unit title, learning objectives, methods, tools, and ALL lesson stages (Introduction, Main Activity, Synthesis, Wrap-up) MUST FOCUS DIRECTLY AND EXCLUSIVELY on this specific lesson topic: [${lecon}].
2. Explicitly incorporate the planned classwork [${travaux}] and support materials [${support}] into the main activity.
3. The homework must directly support [${devoirsPrevus}] and reinforce "${lecon}".
4. DO NOT invent, substitute, or drift to any other topic or chapter.

Use the following JSON structure with professional, concrete values in English (keys exactly as specified):
${jsonStructure}`;
      } else if (lessonLang === 'ar') {
        prompt = `أعد فقط JSON صالحًا. بدون Markdown أو أسوار كود أو تعليقات.
تعليمات أساسية وإلزامية قطعية: يجب عليك بناء وتصميم كامل خطة الدرس لعنوان وموضوع الدرس المُدخل تحديداً من قبل المعلم: [${lecon}].
- المادة: ${matiere}، الفصل: ${classe}، موضوع الدرس: [${lecon}]
- أعمال الصف المخطط لها: ${travaux}
- الدعم والمعينات التعليمية: ${support}
- الواجبات المخطط لها: ${devoirsPrevus}

قواعد بيداغوجية إلزامية صارمة:
1. يجب أن تدور جميع الأهداف التعليمية، عنوان الوحدة، الوسائل، ومراحل سير الدرس (التهيئة، بناء التعلمات، التقويم والتركيب، الخاتمة) حصراً ومباشرة حول هذا الدرس تحديداً: [${lecon}].
2. ادمج صراحة في النشاط الرئيسي أعمال الصف المحددة: [${travaux}] والسند: [${support}].
3. يجب أن تتوافق الواجبات المنزلية بدقة مع: [${devoirsPrevus}] وموضوع الدرس [${lecon}].
4. يُمنع منعاً باتاً استبدال هذا الموضوع أو الانحراف إلى درس عام أو فصل مختلف.

استخدم البنية التالية بالقيم المهنية والملموسة (المفاتيح كما هي بالإنجليزية):
${jsonStructure}`;
      } else {
        prompt = `Renvoie UNIQUEMENT du JSON valide. Pas de markdown, pas de blocs de code, pas de commentaire.
INSTRUCTION FONDAMENTALE ET ABSOLUE : Vous DEVEZ impérativement et fidèlement concevoir l'intégralité de la fiche de préparation pour le Thème de leçon EXACTEMENT saisi : « ${lecon} », pour la matière « ${matiere} » et la classe « ${classe} ».
- Matière : ${matiere}, Classe : ${classe}, Thème saisi : « ${lecon} »
- Travaux de classe : ${travaux}
- Support/Matériel : ${support}
- Devoirs prévus : ${devoirsPrevus}

RÈGLES PÉDAGOGIQUES STRICTES DE CONFORMITÉ :
1. Le titre de l'unité, les compétences/objectifs d'apprentissage, les méthodes, les outils, et toutes les étapes du déroulement (Introduction, Activité Principale, Synthèse, Clôture) DOIVENT TOUS porter DIRECTEMENT et EXCLUSIVEMENT sur la leçon « ${lecon} ».
2. Vous devez intégrer explicitement dans l'activité principale les travaux de classe : « ${travaux} » et le support : « ${support} ».
3. Les devoirs doivent être directement alignés avec « ${devoirsPrevus} » et la leçon « ${lecon} ».
4. Interdiction formelle et absolue de changer de thème, de dériver vers un autre chapitre ou d'extrapoler vers une autre leçon.

Utilise la structure JSON suivante (valeurs concrètes et professionnelles ; clés strictement identiques) :
${jsonStructure}`;
      }

      try {
        const { content: rawText, provider } = await callAiWithKeyRotation(prompt, `AI Lesson Plan (${enseignant} - ${matiere})`);
        providerUsed = provider;
        try {
          aiData = JSON.parse(rawText);
        } catch {
          const cleaned = rawText.replace(/^```json\s*|\s*```$/g, '').trim();
          aiData = JSON.parse(cleaned);
        }
      } catch (aiErr) {
        console.warn(`⚠️ [AI Lesson Plan] Quota ou indisponibilité IA (${aiErr.message}). Basculement sur le générateur pédagogique intégré.`);
      }
    }

    // 2. Si l'IA n'est pas configurée ou a échoué (quota, format JSON...), utiliser le générateur pédagogique intégré
    if (!aiData) {
      console.log(`💡 [AI Lesson Plan] Utilisation du moteur pédagogique intégré pour ${matiere} (${classe})`);
      aiData = generatePedagogicalFallbackData(matiere, classe, lecon, enseignant, travaux, support, devoirsPrevus);
      providerUsed = 'Moteur Pédagogique Intégré';
    }

    // Préparer le DOCX
    const zip = new PizZip(templateBuffer);
    const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true, nullGetter: () => "" });

    let minutageString = "";
    let contenuString = "";
    if (aiData.etapes && Array.isArray(aiData.etapes)) {
      minutageString = aiData.etapes.map(e => e.duree || "").join('\n');
      contenuString = aiData.etapes.map(e => `▶ ${e.phase || ""}:\n${e.activite || ""}`).join('\n\n');
    }

    const templateData = {
      ...aiData,
      Semaine: week,
      Lecon: lecon,
      Matiere: matiere,
      Classe: classe,
      Jour: jour,
      Seance: seance,
      NomEnseignant: enseignant,
      Date: formattedDate,
      Deroulement: minutageString,
      Contenu: contenuString,
    };

    doc.render(templateData);
    const buf = doc.getZip().generate({ type: 'nodebuffer', compression: 'DEFLATE' });

    // Format: Matière_Classe_Semaine_Séance_Enseignant.docx
    const filename = `${sanitizeForFilename(matiere || 'Cours')}_${sanitizeForFilename(classe || 'Classe')}_S${weekNumber}_P${sanitizeForFilename(seance || '1')}_${sanitizeForFilename(enseignant || 'Prof')}.docx`;
    console.log(`📄 [AI Lesson Plan] Fichier produit: ${filename} (via ${providerUsed})`);

    const rawSection = req.body.section || rowData._section || 'garcons';
    const section = ['garcons', 'filles', 'primaire'].includes(String(rawSection).toLowerCase()) ? String(rawSection).toLowerCase() : 'garcons';
    const lessonPlanId = `${section}_${weekNumber}_${enseignant}_${classe}_${matiere}_${seance}_${jour}`.replace(/\s+/g, '_');

    docxBufferToSend = buf;
    filenameToSend = filename;
    lessonPlanIdToSend = lessonPlanId;

    // Sauvegarder dans MongoDB (collection lessonPlans) pour consultation et téléchargement ultérieur
    try {
      const db = await connectToDatabase();
      await db.collection('lessonPlans').updateOne(
        { _id: lessonPlanId },
        {
          $set: {
            _id: lessonPlanId,
            week: weekNumber,
            section,
            enseignant,
            classe,
            matiere,
            periode: seance,
            jour,
            filename,
            fileBuffer: buf,
            createdAt: new Date(),
            rowData
          }
        },
        { upsert: true }
      );
      console.log(`💾 [AI Lesson Plan] Sauvegardé dans MongoDB: ${lessonPlanId} (${section})`);
    } catch (saveDbErr) {
      console.error('⚠️ [AI Lesson Plan] Erreur sauvegarde MongoDB (non bloquante):', saveDbErr.message);
    }

    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('X-Lesson-Plan-Id', lessonPlanId);
    res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition, X-Lesson-Plan-Id');
    res.send(buf);
    console.log('✅ [AI Lesson Plan] Génération terminée avec succès');

  } catch (error) {
    console.error('❌ Erreur serveur /generate-ai-lesson-plan:', error);
    if (!res.headersSent) {
      // En cas de panne imprévue, générer un fichier de secours immédiat pour éviter toute erreur utilisateur
      try {
        const emergencyZip = new PizZip(createDefaultLessonTemplateZip());
        const emergencyDoc = new Docxtemplater(emergencyZip, { paragraphLoop: true, linebreaks: true, nullGetter: () => "" });
        emergencyDoc.render({
          Matiere: req.body?.rowData?.['Matière'] || 'Matière',
          Classe: req.body?.rowData?.['Classe'] || 'Classe',
          NomEnseignant: req.body?.rowData?.['Enseignant'] || 'Enseignant',
          Semaine: req.body?.week || '1',
          Jour: req.body?.rowData?.['Jour'] || '',
          Seance: req.body?.rowData?.['Période'] || '',
          Lecon: req.body?.rowData?.['Leçon'] || 'Plan de leçon',
          TitreUnite: 'Séance pédagogique',
          Objectifs: '- Acquisition des compétences disciplinaires requises\n- Réalisation des exercices d\'application',
          Methodes: 'Pédagogie active',
          Outils: 'Manuel et cahier',
          Contenu: '▶ Introduction (5 min):\nRappel et annonce des objectifs.\n\n▶ Activité Principale (25 min):\nExercices d\'application et travaux guidés.\n\n▶ Synthèse & Clôture (15 min):\nBilan de la séance et vérification des acquis.',
          Ressources: 'Supports scolaires',
          Devoirs: req.body?.rowData?.['Devoirs'] || 'Révision de la leçon',
          DiffLents: 'Accompagnement individualisé',
          DiffTresPerf: 'Exercices d\'approfondissement',
          DiffTous: 'Pratique collective'
        });
        const emergencyBuf = emergencyDoc.getZip().generate({ type: 'nodebuffer', compression: 'DEFLATE' });
        res.setHeader('Content-Disposition', `attachment; filename="Plan_Lecon_S${req.body?.week || 1}.docx"`);
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
        res.send(emergencyBuf);
      } catch (fatalErr) {
        res.status(500).json({ message: "Erreur lors de la création du document Word." });
      }
    }
  }
});

// Sauvegarder un plan de leçon généré dans MongoDB
app.post('/api/save-lesson-plan', async (req, res) => {
  try {
    console.log('💾 [Save Lesson Plan] Sauvegarde d\'un plan de leçon');
    
    const { week, rowData, fileBuffer, filename } = req.body;
    
    if (!week || !rowData || !fileBuffer || !filename) {
      return res.status(400).json({ message: 'Données manquantes pour la sauvegarde.' });
    }
    
    const db = await connectToDatabase();
    
    // Créer ou mettre à jour le document du plan de leçon
    const enseignant = rowData[findKey(rowData, 'Enseignant')] || '';
    const classe = rowData[findKey(rowData, 'Classe')] || '';
    const matiere = rowData[findKey(rowData, 'Matière')] || '';
    const periode = rowData[findKey(rowData, 'Période')] || '';
    const jour = rowData[findKey(rowData, 'Jour')] || '';
    
    const lessonPlanId = `${week}_${enseignant}_${classe}_${matiere}_${periode}_${jour}`.replace(/\s+/g, '_');
    
    await db.collection('lessonPlans').updateOne(
      { _id: lessonPlanId },
      {
        $set: {
          week: Number(week),
          enseignant,
          classe,
          matiere,
          periode,
          jour,
          filename,
          fileBuffer: Buffer.from(fileBuffer, 'base64'),
          createdAt: new Date(),
          rowData
        }
      },
      { upsert: true }
    );
    
    console.log(`✅ [Save Lesson Plan] Plan sauvegardé: ${lessonPlanId}`);
    res.status(200).json({ success: true, message: 'Plan de leçon sauvegardé.', lessonPlanId });
    
  } catch (error) {
    console.error('❌ Erreur sauvegarde plan de leçon:', error);
    res.status(500).json({ message: 'Erreur lors de la sauvegarde du plan de leçon.' });
  }
});

// ============================================================================
// NOUVELLE ROUTE: Génération multiple de plans de leçon IA en ZIP
// ============================================================================
app.post('/api/generate-multiple-ai-lesson-plans', async (req, res) => {
  try {
    console.log('📚 [Multiple AI Lesson Plans] Nouvelle demande de génération multiple');
    
    const groqKeys = getAllGroqApiKeys();
    const geminiKeys = getAllGeminiApiKeys();
    
    if (groqKeys.length === 0 && geminiKeys.length === 0) {
      console.warn("⚠️ [Multiple AI] Clés API IA non trouvées. Le système utilisera la base de données et le générateur pédagogique autonome.");
    } else {
      console.log(`🔧 [Multiple AI] Pool IA actif: ${groqKeys.length} clé(s) GROQ, ${geminiKeys.length} clé(s) GEMINI`);
    }

    const rowsData = req.body.rowsData || req.body.rows || req.body.data || [];
    const week = req.body.week;
    if (!Array.isArray(rowsData) || rowsData.length === 0 || !week) {
      return res.status(400).json({ message: "Données invalides ou vides." });
    }

    const weekNumber = Number(week);
    console.log(`✅ [Multiple AI Lesson Plans] Génération de ${rowsData.length} plans pour semaine ${weekNumber}`);

    const db = await connectToDatabase();
    const specialDays = await db.collection('special_days').find({
      $or: [
        { week: weekNumber },
        { week: String(weekNumber) }
      ]
    }).toArray();

    // Déterminer les enseignants distincts
    const teacherKey = findKey(rowsData[0] || {}, 'Enseignant') || 'Enseignant';
    const distinctTeachers = Array.from(new Set([
      ...(Array.isArray(req.body.teachers) ? req.body.teachers : []),
      ...rowsData.map(r => (r[teacherKey] || r.Enseignant || '').trim())
    ].filter(Boolean)));

    // Préparer toutes les lignes valides (en éliminant les jours fériés)
    const validRows = [];
    const skippedRows = [];
    
    for (let i = 0; i < rowsData.length; i++) {
      const rowData = rowsData[i];
      if (rowData && typeof rowData === 'object') {
        if (isHolidayRowServer(rowData, specialDays, weekNumber, req.body.section)) {
          const cls = rowData.Classe || rowData.classe || '';
          const jr = rowData.Jour || rowData.jour || '';
          const mat = rowData.Matière || rowData.matiere || '';
          skippedRows.push({ index: i + 1, reason: `Jour férié / chômé (${cls} - ${jr} - ${mat})` });
          console.log(`⏸️ [Multiple AI] Ligne ${i + 1} ignorée (jour férié): ${cls} - ${jr} - ${mat}`);
        } else {
          validRows.push({ index: i, rowData });
        }
      } else {
        skippedRows.push({ index: i+1, reason: 'Ligne invalide' });
      }
    }
    
    console.log(`📊 [Multiple AI] ${validRows.length} lignes valides pour ${distinctTeachers.length} enseignant(s) (${skippedRows.length} ignorées)`);
    
    if (validRows.length === 0) {
      return res.status(400).json({ 
        isHoliday: true,
        message: "Toutes les séances sélectionnées correspondent à des jours fériés ou chômés. Aucun plan de leçon n'a été généré."
      });
    }

    // Charger le modèle Word une seule fois (depuis l'URL ou modèle intégré de secours)
    let templateBuffer;
    try {
      templateBuffer = await getLessonTemplateBuffer();
    } catch (e) {
      console.error("Erreur récupération modèle:", e);
      return res.status(500).json({ message: "Impossible de récupérer ou générer le modèle de leçon." });
    }

    // Nom du ZIP :
    // Si un seul enseignant : "Plan de lecon-nom d'enseignant-semaine(numero de semaine).zip"
    let zipFilename;
    if (distinctTeachers.length === 1) {
      const teacherClean = sanitizeForFilename(distinctTeachers[0]);
      zipFilename = `Plan de lecon-${teacherClean}-semaine(${weekNumber}).zip`;
    } else {
      zipFilename = `Plans_Lecons_Semaine_${weekNumber}_${distinctTeachers.length || rowsData.length}_enseignants.zip`;
    }

    // Configuration du ZIP avec gestion d'erreurs
    const archive = archiver('zip', { zlib: { level: 6 } });

    archive.on('warning', (err) => {
      console.warn('[Archiver warning]:', err);
    });
    archive.on('error', (err) => {
      console.error('[Archiver error]:', err);
      if (!res.headersSent) {
        res.status(500).json({ message: `Erreur d'archivage ZIP: ${err.message}` });
      }
    });

    const cleanAsciiFilename = zipFilename.replace(/[^\x20-\x7E]/g, '_');
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${cleanAsciiFilename}"; filename*=UTF-8''${encodeURIComponent(zipFilename)}"`);
    archive.pipe(res);

    const datesNode = specificWeekDateRangesNode[weekNumber];

    let successCount = 0;
    let errorCount = 0;
    let fromDbCount = 0;

    const lessonPlanCache = new Map();
    try {
      if (db) {
        // Pré-charger en lot les fiches déjà existantes dans MongoDB pour un batch ultra-rapide
        const allPossibleIds = [];
        validRows.forEach(({ rowData }, idx) => {
          const ens = rowData[findKey(rowData, 'Enseignant')] || rowData.Enseignant || '';
          const cls = rowData[findKey(rowData, 'Classe')] || rowData.Classe || '';
          const mat = rowData[findKey(rowData, 'Matière')] || rowData.Matière || '';
          const per = rowData[findKey(rowData, 'Période')] || rowData[findKey(rowData, 'Séance')] || rowData.Période || `${idx+1}`;
          const jr = rowData[findKey(rowData, 'Jour')] || rowData.Jour || '';
          if (rowData.lessonPlanId) allPossibleIds.push(rowData.lessonPlanId);
          allPossibleIds.push(`${weekNumber}_${ens}_${cls}_${mat}_${per}_${jr}`.replace(/\s+/g, '_'));
          allPossibleIds.push(`garcons_${weekNumber}_${ens}_${cls}_${mat}_${per}_${jr}`.replace(/\s+/g, '_'));
          allPossibleIds.push(`filles_${weekNumber}_${ens}_${cls}_${mat}_${per}_${jr}`.replace(/\s+/g, '_'));
          allPossibleIds.push(`primaire_${weekNumber}_${ens}_${cls}_${mat}_${per}_${jr}`.replace(/\s+/g, '_'));
        });

        const existingPlans = await db.collection('lessonPlans').find({
          $or: [
            { _id: { $in: allPossibleIds } },
            { week: weekNumber }
          ]
        }).toArray();

        existingPlans.forEach(p => {
          if (p._id) lessonPlanCache.set(String(p._id), p);
          const key = `${p.week}_${String(p.enseignant||'').trim().toLowerCase()}_${String(p.classe||'').trim().toLowerCase()}_${String(p.matiere||'').trim().toLowerCase()}_${String(p.periode||'').trim().toLowerCase()}`;
          lessonPlanCache.set(key, p);
        });
        console.log(`📦 [Batch Lesson Plans] ${lessonPlanCache.size} fiches existantes trouvées en cache DB.`);
      }
    } catch (dbInitErr) {
      console.warn("⚠️ Impossible de se connecter à MongoDB lors du batch:", dbInitErr.message);
    }

    const usedZipEntries = new Set();
    const getUniqueZipEntry = (name) => {
      let candidate = name;
      let counter = 2;
      while (usedZipEntries.has(candidate.toLowerCase())) {
        const dotIdx = name.lastIndexOf('.');
        if (dotIdx !== -1) {
          candidate = `${name.substring(0, dotIdx)}_${counter}${name.substring(dotIdx)}`;
        } else {
          candidate = `${name}_${counter}`;
        }
        counter++;
      }
      usedZipEntries.add(candidate.toLowerCase());
      return candidate;
    };

    // Générer chaque plan de leçon
    for (let i = 0; i < validRows.length; i++) {
      const { index: originalIndex, rowData } = validRows[i];
      let docBuffer = null;
      let fromDb = false;
      
      // Extraire données
      const enseignant = rowData[findKey(rowData, 'Enseignant')] || rowData.Enseignant || 'Enseignant';
      const classe = rowData[findKey(rowData, 'Classe')] || rowData.Classe || 'Classe';
      const matiere = rowData[findKey(rowData, 'Matière')] || rowData.Matière || 'Matière';
      let lecon = rowData[findKey(rowData, 'Leçon')] || rowData.Leçon || '';
      const jour = rowData[findKey(rowData, 'Jour')] || rowData.Jour || '';
      const seance = rowData[findKey(rowData, 'Période')] || rowData[findKey(rowData, 'Séance')] || rowData.Période || `${i+1}`;
      const support = rowData[findKey(rowData, 'Support')] || rowData['Support / Matériel'] || 'Non spécifié';
      const travaux = rowData[findKey(rowData, 'Travaux de classe')] || rowData[findKey(rowData, 'Travaux')] || 'Non spécifié';
      const devoirsPrevus = rowData[findKey(rowData, 'Devoirs')] || rowData['Devoirs prévus'] || 'Non spécifié';

      if (!lecon || lecon.trim().length < 2 || lecon.trim() === '-' || lecon.trim().toLowerCase() === 'aucun') {
        lecon = matiere ? `Séance de ${matiere} - ${classe}` : `Séance pédagogique (${classe})`;
      }

      const docFilename = `${sanitizeForFilename(matiere)}_${sanitizeForFilename(classe)}_S${weekNumber}_P${sanitizeForFilename(seance)}_${sanitizeForFilename(enseignant)}.docx`;
      // Organiser en sous-dossiers par enseignant si plusieurs enseignants dans l'archive
      const rawZipEntryName = distinctTeachers.length > 1 
        ? `${sanitizeForFilename(enseignant)}/${docFilename}` 
        : docFilename;
      const zipEntryName = getUniqueZipEntry(rawZipEntryName);

      try {
        // 1. Tenter de récupérer depuis le cache MongoDB pré-chargé
        const possibleIds = [
          rowData.lessonPlanId,
          `${weekNumber}_${enseignant}_${classe}_${matiere}_${seance}_${jour}`.replace(/\s+/g, '_'),
          `garcons_${weekNumber}_${enseignant}_${classe}_${matiere}_${seance}_${jour}`.replace(/\s+/g, '_'),
          `filles_${weekNumber}_${enseignant}_${classe}_${matiere}_${seance}_${jour}`.replace(/\s+/g, '_'),
          `primaire_${weekNumber}_${enseignant}_${classe}_${matiere}_${seance}_${jour}`.replace(/\s+/g, '_')
        ].filter(Boolean);

        let cachedPlan = null;
        for (const pid of possibleIds) {
          if (lessonPlanCache.has(pid)) {
            cachedPlan = lessonPlanCache.get(pid);
            break;
          }
        }
        if (!cachedPlan) {
          const matchKey = `${weekNumber}_${String(enseignant).trim().toLowerCase()}_${String(classe).trim().toLowerCase()}_${String(matiere).trim().toLowerCase()}_${String(seance).trim().toLowerCase()}`;
          if (lessonPlanCache.has(matchKey)) {
            cachedPlan = lessonPlanCache.get(matchKey);
          }
        }

        let isCacheMatching = false;
        if (cachedPlan && cachedPlan.fileBuffer && !req.body.forceRegenerate) {
          const curLec = String(lecon || '').trim().toLowerCase();
          const cachedLec = String(cachedPlan.rowData?.[findKey(cachedPlan.rowData, 'Leçon')] || cachedPlan.rowData?.Leçon || cachedPlan.lecon || '').trim().toLowerCase();
          if (curLec && cachedLec && curLec === cachedLec) {
            isCacheMatching = true;
          }
        }

        if (isCacheMatching) {
          const rawBuf = cachedPlan.fileBuffer;
          let b = Buffer.isBuffer(rawBuf) ? rawBuf : null;
          if (!b && rawBuf && typeof rawBuf.value === 'function') b = rawBuf.value(true);
          if (!b && rawBuf && rawBuf.buffer) b = Buffer.isBuffer(rawBuf.buffer) ? rawBuf.buffer : Buffer.from(rawBuf.buffer);
          if (!b && rawBuf) b = Buffer.from(rawBuf);

          if (b && b.length > 200) {
            docBuffer = b;
            fromDb = true;
            fromDbCount++;
          }
        }

        // 2. Si pas en base ou leçon modifiée, générer via IA ou repli pédagogique
        if (!docBuffer) {
          // Date formatée
          let formattedDate = "";
          if (jour && datesNode?.start) {
            const weekStartDateNode = new Date(datesNode.start + 'T00:00:00Z');
            if (!isNaN(weekStartDateNode.getTime())) {
              const dayName = extractDayNameFromString(jour);
              if (dayName) {
                const dateOfDay = getDateForDayNameNode(weekStartDateNode, dayName);
                if (dateOfDay) formattedDate = formatDateFrenchNode(dateOfDay);
              }
            }
          }

          // Prompt selon la langue de la leçon
          const jsonStructure = `{"TitreUnite":"un titre d'unité pertinent pour la leçon","Methodes":"liste des méthodes d'enseignement","Outils":"liste des outils de travail","Objectifs":"une liste concise des objectifs d'apprentissage (compétences, connaissances), séparés par des sauts de ligne (\\\\n). Commence chaque objectif par un tiret (-).","etapes":[{"phase":"Introduction","duree":"5 min","activite":"Description de l'activité d'introduction pour l'enseignant et les élèves."},{"phase":"Activité Principale","duree":"25 min","activite":"Description de l'activité principale, en intégrant les 'travaux de classe' et le 'support' si possible."},{"phase":"Synthèse","duree":"10 min","activite":"Description de l'activité de conclusion et de vérification des acquis."},{"phase":"Clôture","duree":"5 min","activite":"Résumé rapide et annonce des devoirs."}],"Ressources":"les ressources spécifiques à utiliser.","Devoirs":"une suggestion de devoirs.","DiffLents":"une suggestion pour aider les apprenants en difficulté.","DiffTresPerf":"une suggestion pour stimuler les apprenants très performants.","DiffTous":"une suggestion de différenciation pour toute la classe."}`;

          const lessonLang = detectLessonLanguage(enseignant, matiere, lecon, travaux);
          let prompt;
          if (lessonLang === 'en') {
            prompt = `Return ONLY valid JSON. No markdown, no code fences, no commentary.\n\nCRITICAL MANDATORY INSTRUCTION: You MUST strictly and faithfully generate the lesson plan specifically for the requested Subject: [${matiere}], Class: [${classe}], and Lesson Topic: [${lecon}].\n\n- Subject: ${matiere}, Class: ${classe}, Lesson Topic: ${lecon}\n- Planned Classwork: ${travaux}\n- Mentioned Support/Materials: ${support}\n- Planned Homework: ${devoirsPrevus}\n\nSTRICT PEDAGOGICAL COMPLIANCE RULES:\n1. The unit title, learning objectives, methods, tools, and ALL lesson stages MUST FOCUS DIRECTLY AND EXCLUSIVELY on this specific lesson topic: [${lecon}].\n2. Explicitly integrate into the main activity the planned classwork [${travaux}] and support materials [${support}].\n3. The homework must align with [${devoirsPrevus}] and "${lecon}".\n4. DO NOT invent, substitute, or drift to any other topic.\n\nUse the following JSON structure with professional, concrete values in English (keys exactly as specified):\n${jsonStructure}`;
          } else if (lessonLang === 'ar') {
            prompt = `أعد فقط JSON صالحًا. بدون Markdown أو أسوار كود أو تعليقات.\n\nتعليمات أساسية وإلزامية قطعية: يجب عليك بناء وتصميم كامل خطة الدرس لعنوان وموضوع الدرس المُدخل تحديداً من قبل المعلم: [${lecon}].\n\n- المادة: ${matiere}، الفصل: ${classe}، الموضوع: ${lecon}\n- أعمال الصف المخطط لها: ${travaux}\n- الدعم/المواد: ${support}\n- الواجبات المخطط لها: ${devoirsPrevus}\n\nقواعد بيداغوجية إلزامية صارمة:\n1. يجب أن تدور جميع الأهداف التعليمية، عنوان الوحدة، الوسائل، ومراحل سير الدرس حصراً ومباشرة حول هذا الدرس تحديداً: [${lecon}].\n2. ادمج صراحة في النشاط الرئيسي أعمال الصف: [${travaux}] والسند: [${support}].\n3. يجب أن تتوافق الواجبات بدقة مع: [${devoirsPrevus}] وموضوع الدرس [${lecon}].\n4. يُمنع منعاً باتاً استبدال هذا الموضوع أو توليد درس مختلف أو عام.\n\nاستخدم البنية التالية بالقيم المهنية والملموسة (المفاتيح كما هي بالإنجليزية):\n${jsonStructure}`;
          } else {
            prompt = `Renvoie UNIQUEMENT du JSON valide. Pas de markdown, pas de blocs de code, pas de commentaire.\n\nINSTRUCTION FONDAMENTALE ET ABSOLUE : Vous DEVEZ impérativement et fidèlement concevoir l'intégralité de la fiche de préparation pour le Thème de leçon EXACTEMENT saisi : « ${lecon} », pour la matière « ${matiere} » et la classe « ${classe} ».\n\n- Matière : ${matiere}, Classe : ${classe}, Thème : ${lecon}\n- Travaux de classe : ${travaux}\n- Support/Matériel : ${support}\n- Devoirs prévus : ${devoirsPrevus}\n\nRÈGLES PÉDAGOGIQUES STRICTES DE CONFORMITÉ :\n1. Le titre de l'unité, les objectifs d'apprentissage, les méthodes, les outils, et toutes les étapes du déroulement DOIVENT TOUS porter DIRECTEMENT et EXCLUSIVEMENT sur la leçon « ${lecon} ».\n2. Vous devez intégrer explicitement dans l'activité principale les travaux de classe : « ${travaux} » et le support : « ${support} ».\n3. Les devoirs doivent être directement alignés avec « ${devoirsPrevus} » et la leçon « ${lecon} ».\n4. Interdiction formelle et absolue de changer de thème ou de dériver vers un autre sujet.\n\nUtilise la structure JSON suivante (valeurs concrètes et professionnelles ; clés strictement identiques) :\n${jsonStructure}`;
          }

          let jsonData = null;
          // Pour les lots importants (> 6 fiches), limiter le temps d'appel IA à 4s max pour garantir la fluidité
          if ((groqKeys.length > 0 || geminiKeys.length > 0) && validRows.length <= 15) {
            try {
              const aiPromise = callAiWithKeyRotation(prompt, `Batch Lesson #${i+1}/${validRows.length} (${enseignant})`);
              const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Délai IA dépassé')), 4000));
              const { content: rawContent } = await Promise.race([aiPromise, timeoutPromise]);
              const cleanedJson = rawContent.replace(/```json\n?|```\n?/g, '').trim();
              jsonData = JSON.parse(cleanedJson);
              if (!jsonData.TitreUnite && !jsonData.Objectifs && !jsonData.etapes) {
                throw new Error('Champs essentiels manquants');
              }
            } catch (aiErr) {
              jsonData = generatePedagogicalFallbackData(matiere, classe, lecon, enseignant, travaux, support, devoirsPrevus);
            }
          } else {
            jsonData = generatePedagogicalFallbackData(matiere, classe, lecon, enseignant, travaux, support, devoirsPrevus);
          }

          // Générer le document Word
          const zip = new PizZip(templateBuffer);
          const doc = new Docxtemplater(zip, { paragraphLoop: true, nullGetter: () => "" });

          const minutageString = (jsonData.etapes || []).map(e =>
            `${e.phase || ""} (${e.duree || ""}):\n${e.activite || ""}`
          ).join('\n\n');

          const templateData = {
            TitreUnite: jsonData.TitreUnite || "",
            Methodes: jsonData.Methodes || "",
            Outils: jsonData.Outils || "",
            Objectifs: jsonData.Objectifs || "",
            Ressources: jsonData.Ressources || "",
            Devoirs: jsonData.Devoirs || "",
            DiffLents: jsonData.DiffLents || "",
            DiffTresPerf: jsonData.DiffTresPerf || "",
            DiffTous: jsonData.DiffTous || "",
            Classe: classe,
            Matiere: matiere,
            Lecon: lecon,
            Seance: seance,
            NomEnseignant: enseignant,
            Date: formattedDate,
            Deroulement: minutageString,
            Contenu: minutageString,
            Minutage: minutageString,
          };

          doc.render(templateData);
          docBuffer = doc.getZip().generate({ type: 'nodebuffer', compression: 'DEFLATE' });

          // Sauvegarde asynchrone dans MongoDB
          if (db) {
            const lessonPlanId = `${weekNumber}_${enseignant}_${classe}_${matiere}_${seance}_${jour}`.replace(/\s+/g, '_');
            db.collection('lessonPlans').updateOne(
              { _id: lessonPlanId },
              {
                $set: {
                  week: weekNumber,
                  enseignant,
                  classe,
                  matiere,
                  periode: seance,
                  jour,
                  filename: docFilename,
                  fileBuffer: docBuffer,
                  createdAt: new Date(),
                  rowData
                }
              },
              { upsert: true }
            ).catch(saveErr => console.warn('Sauvegarde async MongoDB ignorée:', saveErr.message));
          }
        }

        // Ajouter au ZIP
        archive.append(docBuffer, { name: zipEntryName });
        successCount++;

      } catch (error) {
        const classe = rowData[findKey(rowData, 'Classe')] || 'Unknown';
        const matiere = rowData[findKey(rowData, 'Matière')] || 'Unknown';
        const enseignant = rowData[findKey(rowData, 'Enseignant')] || 'Unknown';
        const lecon = rowData[findKey(rowData, 'Leçon')] || 'VIDE';
        
        console.error(`❌ Erreur pour ligne ${i+1}:`, {
          error: error.message,
          stack: error.stack,
          classe,
          matiere,
          enseignant,
          lecon: lecon.substring(0, 50) // Premiers 50 caractères
        });
        errorCount++;
        
        // Ajouter un fichier texte d'erreur DÉTAILLÉ dans le ZIP
        const errorFilename = `ERREUR_${String(i+1).padStart(2, '0')}_${sanitizeForFilename(classe)}_${sanitizeForFilename(matiere)}.txt`;
        const errorContent = `❌ ERREUR DE GÉNÉRATION - PLAN DE LEÇON IA

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📍 INFORMATIONS DE LA LIGNE
  Ligne valide    : ${i+1}/${validRows.length}
  Ligne originale : ${originalIndex+1}/${rowsData.length}
  
👤 ENSEIGNANT     : ${enseignant}
📚 CLASSE         : ${classe}
📖 MATIÈRE        : ${matiere}

📝 LEÇON (premiers 300 caractères) :
${lecon.substring(0, 300)}${lecon.length > 300 ? '...' : ''}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

⚠️  ERREUR DÉTECTÉE :
${error.message}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🔍 STACK TRACE COMPLET :
${error.stack}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📋 DONNÉES COMPLÈTES DE LA LIGNE :
${JSON.stringify(rowData, null, 2)}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

💡 SOLUTIONS POSSIBLES :
1. Vérifier que la clé API (GROQ ou GEMINI) est valide
2. Vérifier que le quota API n'est pas dépassé
3. Vérifier que la leçon contient suffisamment d'information
4. Réessayer la génération plus tard si c'est un problème de quota
5. Contacter le support si l'erreur persiste

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Date: ${new Date().toISOString()}
Provider IA: ${USE_GROQ ? 'GROQ (llama-3.3-70b-versatile)' : 'GEMINI'}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`;
        archive.append(Buffer.from(errorContent, 'utf-8'), { name: errorFilename });
      }
    }

    console.log(`📊 [Multiple AI] Résultat: ${successCount} succès, ${errorCount} erreurs`);
    
    // Ajouter un fichier récapitulatif final
    const summaryContent = `📊 RÉCAPITULATIF DE GÉNÉRATION - PLANS DE LEÇON IA
    
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📅 Date de génération : ${new Date().toLocaleString('fr-FR')}
📦 Semaine            : ${week}
🔧 Provider IA        : ${USE_GROQ ? 'GROQ (llama-3.3-70b-versatile)' : 'GEMINI (' + (MODEL_NAME || 'N/A') + ')'}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📈 STATISTIQUES :
  Lignes totales reçues  : ${rowsData.length}
  Lignes valides         : ${validRows.length}
  Lignes ignorées        : ${skippedRows.length} (leçons vides)
  
  ✅ Succès              : ${successCount}
  ❌ Erreurs             : ${errorCount}
  
  📊 Taux de réussite    : ${validRows.length > 0 ? Math.round((successCount / validRows.length) * 100) : 0}%

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

${errorCount > 0 ? `⚠️  ATTENTION : ${errorCount} erreur(s) détectée(s)
Consultez les fichiers ERREUR_XX_*.txt pour plus de détails.

💡 CAUSES POSSIBLES DES ERREURS :
- Quota API dépassé (429)
- Problème de connexion réseau
- Format de réponse invalide de l'IA
- Données de leçon insuffisantes

🔑 SOLUTION : Configurer GROQ_API_KEY sur Vercel
GROQ offre un quota gratuit plus généreux que GEMINI.
Instructions : Voir README.md du projet
` : '🎉 Toutes les générations ont réussi !'}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📁 CONTENU DU ZIP :
${skippedRows.length > 0 ? `  - 00_LIGNES_IGNOREES.txt (${skippedRows.length} lignes)\n` : ''}  - ${successCount} fichier(s) .docx (plans générés)
${errorCount > 0 ? `  - ${errorCount} fichier(s) ERREUR_*.txt (détails des erreurs)\n` : ''}  - 99_RECAPITULATIF.txt (ce fichier)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Généré par le système de gestion des plans hebdomadaires
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`;
    archive.append(Buffer.from(summaryContent, 'utf-8'), { name: '99_RECAPITULATIF.txt' });
    
    archive.finalize();

  } catch (error) {
    console.error('❌ Erreur serveur /generate-multiple-ai-lesson-plans:', error);
    if (!res.headersSent) {
      res.status(500).json({ message: `Erreur interne: ${error.message}` });
    }
  }
});

// Alias pour compatibilité avec /generate-weekly-lesson-plans
app.post('/api/generate-weekly-lesson-plans', async (req, res) => {
  req.body.rowsData = req.body.rowsData || req.body.data || req.body.rows || [];
  return app._router.handle(req, res, () => {});
});

// Télécharger un plan de leçon depuis MongoDB
app.get('/api/download-lesson-plan/:lessonPlanId', async (req, res) => {
  try {
    const { lessonPlanId } = req.params;
    console.log(`📥 [Download Lesson Plan] Téléchargement: ${lessonPlanId}`);
    
    const db = await connectToDatabase();
    let lessonPlan = await db.collection('lessonPlans').findOne({ _id: lessonPlanId });
    if (!lessonPlan) {
      // Recherche souple si l'ID a ou non le préfixe de section
      const strippedId = lessonPlanId.replace(/^(garcons|filles|primaire)_/, '');
      lessonPlan = await db.collection('lessonPlans').findOne({
        $or: [
          { _id: strippedId },
          { _id: { $regex: strippedId.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&') + '$', $options: 'i' } }
        ]
      });
    }
    
    if (!lessonPlan) {
      return res.status(404).json({ message: 'Plan de leçon introuvable.' });
    }
    
    const fileData = lessonPlan.fileBuffer;
    let bufToSend;
    if (Buffer.isBuffer(fileData)) {
      bufToSend = fileData;
    } else if (fileData && typeof fileData.value === 'function') {
      bufToSend = fileData.value(true);
    } else if (fileData && fileData.buffer) {
      bufToSend = Buffer.isBuffer(fileData.buffer) ? fileData.buffer : Buffer.from(fileData.buffer);
    } else if (fileData) {
      bufToSend = Buffer.from(fileData);
    }

    if (!bufToSend || bufToSend.length < 100) {
      console.warn(`⚠️ [Download Lesson Plan] Fichier corrompu ou vide (${bufToSend ? bufToSend.length : 0} octets) pour: ${lessonPlanId}`);
      return res.status(404).json({ message: 'Contenu du fichier invalide ou manquant.' });
    }

    res.setHeader('Content-Disposition', `attachment; filename="${lessonPlan.filename || 'plan_de_lecon.docx'}"`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.send(bufToSend);
    
    console.log(`✅ [Download Lesson Plan] Envoyé: ${lessonPlan.filename}`);
    
  } catch (error) {
    console.error('❌ Erreur téléchargement plan de leçon:', error);
    res.status(500).json({ message: 'Erreur lors du téléchargement du plan de leçon.' });
  }
});

// Obtenir la liste des plans de leçon pour une semaine spécifique
app.get('/api/lesson-plans/:week', async (req, res) => {
  try {
    const week = parseInt(req.params.week, 10);
    if (isNaN(week)) {
      return res.status(400).json({ message: 'Numéro de semaine invalide.' });
    }
    
    console.log(`📋 [Lesson Plans List] Récupération pour semaine ${week}`);
    
    const db = await connectToDatabase();
    const lessonPlans = await db.collection('lessonPlans')
      .find({ week }, { projection: { fileBuffer: 0 } }) // Exclure le buffer pour économiser la bande passante
      .toArray();
    
    console.log(`✅ [Lesson Plans List] ${lessonPlans.length} plan(s) trouvé(s)`);
    res.status(200).json(lessonPlans);
    
  } catch (error) {
    console.error('❌ Erreur récupération liste plans de leçon:', error);
    res.status(500).json({ message: 'Erreur lors de la récupération des plans de leçon.' });
  }
});

// --------------------- Test de Rappels Forcé (Semaine 17) ---------------------

app.post('/api/test-weekly-reminders', async (req, res) => {
  try {
    const { apiKey, weekNumber } = req.body;
    const targetWeek = weekNumber || 17; // Par défaut à la semaine 17
    
    // Sécurité basique avec clé API
    const CRON_API_KEY = process.env.CRON_API_KEY || 'default-cron-key-change-me';
    if (apiKey !== CRON_API_KEY) {
      return res.status(401).json({ message: 'Non autorisé. Clé API invalide.' });
    }

    console.log(`🧪 [Test Reminders] Test forcé pour la semaine ${targetWeek}`);

    // Récupérer les données de la semaine
    const db = await connectToDatabase();
    const planDocument = await db.collection('plans').findOne({ week: targetWeek });
    
    if (!planDocument || !planDocument.data || planDocument.data.length === 0) {
      return res.status(200).json({ 
        message: `Aucune donnée pour la semaine ${targetWeek}.`,
        week: targetWeek
      });
    }

    // Trouver les enseignants avec des travaux incomplets
    const incompleteTeachers = {};
    const planData = planDocument.data;
    
    planData.forEach(item => {
      const teacher = item[findKey(item, 'Enseignant')];
      const taskVal = item[findKey(item, 'Travaux de classe')];
      const className = item[findKey(item, 'Classe')];
      
      // Un enseignant est incomplet si au moins un "Travaux de classe" est vide
      if (teacher && className && (taskVal == null || String(taskVal).trim() === '')) {
        if (!incompleteTeachers[teacher]) {
          incompleteTeachers[teacher] = new Set();
        }
        incompleteTeachers[teacher].add(className);
      }
    });

    const teachersToNotify = Object.keys(incompleteTeachers);
    console.log(`📊 [Test Reminders] ${teachersToNotify.length} enseignants incomplets:`, teachersToNotify);

    if (teachersToNotify.length === 0) {
      return res.status(200).json({ 
        message: 'Tous les enseignants ont complété leurs plans.',
        week: targetWeek
      });
    }

    // Récupérer les abonnements push depuis MongoDB
    const subscriptions = await db.collection('pushSubscriptions').find({}).toArray();
    
    let notificationsSent = 0;
    const notificationResults = [];

    // Envoyer des notifications à chaque enseignant incomplet
    for (const teacher of teachersToNotify) {
      const subscription = subscriptions.find(sub => sub.username === teacher);
      
      if (subscription && subscription.subscription) {
        const classes = [...incompleteTeachers[teacher]].sort().join(', ');
        const lang = getTeacherLanguage(teacher);
        const msgs = notificationMessages[lang];
        
        // Message de rappel avec urgence
        const message = {
          title: msgs.reminderTitle,
          body: msgs.reminderBody(teacher, targetWeek),
          icon: 'https://cdn.glitch.global/1c613b14-019c-488a-a856-d55d64d174d0/al-kawthar-international-schools-jeddah-saudi-arabia-modified.png?v=1739565146299',
          badge: 'https://cdn.glitch.global/1c613b14-019c-488a-a856-d55d64d174d0/al-kawthar-international-schools-jeddah-saudi-arabia-modified.png?v=1739565146299',
          requireInteraction: true,
          vibrate: [200, 100, 200, 100, 200],
          tag: `plan-reminder-${targetWeek}-${Date.now()}`, // Tag unique pour chaque rappel
          renotify: true, // Force la réaffichage même si tag similaire
          data: {
            url: 'https://plan-hebdomadaire-2026-boys.vercel.app',
            week: targetWeek,
            teacher: teacher,
            classes: classes,
            lang: lang,
            playSound: true,
            timestamp: new Date().toISOString()
          }
        };

        try {
          const payload = JSON.stringify(message);
          await webpush.sendNotification(subscription.subscription, payload);
          
          notificationResults.push({
            teacher: teacher,
            classes: classes,
            language: lang,
            status: 'sent'
          });
          
          notificationsSent++;
          console.log(`✅ [Test Reminders] Notification envoyée à ${teacher} (${lang})`);
        } catch (error) {
          console.error(`❌ [Test Reminders] Erreur notification pour ${teacher}:`, error);
          notificationResults.push({
            teacher: teacher,
            status: 'error',
            error: error.message
          });
          
          // Si l'abonnement est invalide (410 Gone), le supprimer
          if (error.statusCode === 410) {
            console.log(`🗑️ Suppression de l'abonnement invalide pour ${teacher}`);
            await db.collection('pushSubscriptions').deleteOne({ username: teacher });
          }
        }
      } else {
        console.log(`ℹ️ [Test Reminders] ${teacher} n'a pas d'abonnement push`);
        notificationResults.push({
          teacher: teacher,
          status: 'no_subscription'
        });
      }
    }

    res.status(200).json({
      message: `Test de rappel forcé terminé pour la semaine ${targetWeek}.`,
      week: targetWeek,
      incompleteCount: teachersToNotify.length,
      notificationsSent: notificationsSent,
      results: notificationResults
    });

  } catch (error) {
    console.error('❌ [Test Reminders] Erreur:', error);
    res.status(500).json({ 
      message: 'Erreur serveur.',
      error: error.message 
    });
  }
});

// --------------------- Système de Notifications Push ---------------------

// Stocker les abonnements push (en production, utiliser une vraie DB)
const pushSubscriptions = new Map();

// Sauvegarder un abonnement push
app.post('/api/subscribe-push', async (req, res) => {
  try {
    const { username, subscription } = req.body;
    if (!username || !subscription) {
      return res.status(400).json({ message: 'Username et subscription requis.' });
    }

    // Sauvegarder dans MongoDB
    const db = await connectToDatabase();
    await db.collection('pushSubscriptions').updateOne(
      { username: username },
      { $set: { subscription: subscription, updatedAt: new Date() } },
      { upsert: true }
    );

    // Cache local
    pushSubscriptions.set(username, subscription);
    
    console.log(`✅ Abonnement push sauvegardé pour ${username}`);
    res.status(200).json({ message: 'Abonnement enregistré avec succès.' });
  } catch (error) {
    console.error('Erreur /subscribe-push:', error);
    res.status(500).json({ message: 'Erreur serveur.' });
  }
});

// Désabonner des notifications
app.post('/api/unsubscribe-push', async (req, res) => {
  try {
    const { username } = req.body;
    if (!username) {
      return res.status(400).json({ message: 'Username requis.' });
    }

    const db = await connectToDatabase();
    await db.collection('pushSubscriptions').deleteOne({ username: username });
    pushSubscriptions.delete(username);
    
    console.log(`✅ Désabonnement push pour ${username}`);
    res.status(200).json({ message: 'Désabonnement réussi.' });
  } catch (error) {
    console.error('Erreur /unsubscribe-push:', error);
    res.status(500).json({ message: 'Erreur serveur.' });
  }
});

// Messages multilingues pour les notifications
const notificationMessages = {
  fr: {
    title: '⚠️ Plan Hebdomadaire Incomplet',
    body: (teacher, week, classes) => `Bonjour ${teacher}, votre plan pour la semaine ${week} est incomplet pour: ${classes}. Veuillez le compléter.`,
    reminderTitle: '📋 Rappel: Finaliser le Plan Hebdomadaire',
    reminderBody: (teacher, week) => `Bonjour ${teacher}, n'oubliez pas de finaliser votre plan pour la semaine ${week}.`
  },
  ar: {
    title: '⚠️ الخطة الأسبوعية غير مكتملة',
    body: (teacher, week, classes) => `مرحباً ${teacher}، خطتك للأسبوع ${week} غير مكتملة للفصول: ${classes}. يرجى إكمالها.`,
    reminderTitle: '📋 تذكير: أكمل الخطة الأسبوعية',
    reminderBody: (teacher, week) => `مرحباً ${teacher}، لا تنسى إكمال خطتك للأسبوع ${week}.`
  },
  en: {
    title: '⚠️ Incomplete Weekly Plan',
    body: (teacher, week, classes) => `Hello ${teacher}, your plan for week ${week} is incomplete for: ${classes}. Please complete it.`,
    reminderTitle: '📋 Reminder: Finalize Weekly Plan',
    reminderBody: (teacher, week) => `Hello ${teacher}, don't forget to finalize your plan for week ${week}.`
  }
};

// Déterminer la langue d'un enseignant
function getTeacherLanguage(teacher) {
  if (arabicTeachers.includes(teacher)) return 'ar';
  if (englishTeachers.includes(teacher)) return 'en';
  return 'fr';
}

// Vérifier les enseignants incomplets et envoyer des notifications
// Cette route sera appelée par un CRON job chaque LUNDI (3 fois par jour)
app.all('/api/check-incomplete-and-notify', async (req, res) => {
  try {
    const apiKey = (req.body && req.body.apiKey) || req.query.apiKey || req.headers['x-cron-key'] || (req.headers['authorization'] ? req.headers['authorization'].replace(/^Bearer\s+/i, '') : null);
    
    // Sécurité avec clé API (si configurée dans l'environnement)
    const expectedKey = process.env.CRON_API_KEY || process.env.CRON_SECRET;
    if (expectedKey && apiKey !== expectedKey) {
      return res.status(401).json({ message: 'Non autorisé. Clé Cron invalide.' });
    }

    // Déterminer la semaine actuelle
    const currentDate = new Date();
    let currentWeek = null;
    
    // Trouver la semaine actuelle
    for (const [week, dates] of Object.entries(specificWeekDateRangesNode)) {
      const startDate = new Date(dates.start + 'T00:00:00Z');
      const endDate = new Date(dates.end + 'T23:59:59Z');
      
      if (currentDate >= startDate && currentDate <= endDate) {
        currentWeek = parseInt(week, 10);
        break;
      }
    }

    if (!currentWeek) {
      return res.status(200).json({ message: 'Aucune semaine active actuellement.' });
    }

    console.log(`📅 Vérification des plans incomplets pour la semaine ${currentWeek}`);

    // Récupérer les données de la semaine
    const db = await connectToDatabase();
    const planDocument = await db.collection('plans').findOne({ week: currentWeek });
    
    if (!planDocument || !planDocument.data || planDocument.data.length === 0) {
      return res.status(200).json({ message: `Aucune donnée pour la semaine ${currentWeek}.` });
    }

    // Trouver les enseignants avec des travaux incomplets
    const incompleteTeachers = {};
    const planData = planDocument.data;
    
    planData.forEach(item => {
      const teacher = item[findKey(item, 'Enseignant')];
      const taskVal = item[findKey(item, 'Travaux de classe')];
      const className = item[findKey(item, 'Classe')];
      
      if (teacher && className && (taskVal == null || String(taskVal).trim() === '')) {
        if (!incompleteTeachers[teacher]) {
          incompleteTeachers[teacher] = new Set();
        }
        incompleteTeachers[teacher].add(className);
      }
    });

    const teachersToNotify = Object.keys(incompleteTeachers);
    console.log(`📊 ${teachersToNotify.length} enseignants avec plans incomplets:`, teachersToNotify);

    // Récupérer les abonnements push depuis MongoDB
    const subscriptions = await db.collection('pushSubscriptions').find({}).toArray();
    
    let notificationsSent = 0;
    const notificationResults = [];

    // Envoyer des notifications à chaque enseignant incomplet avec leur langue
    for (const teacher of teachersToNotify) {
      const subscription = subscriptions.find(sub => sub.username === teacher);
      
      if (subscription && subscription.subscription) {
        const classes = [...incompleteTeachers[teacher]].sort().join(', ');
        const lang = getTeacherLanguage(teacher);
        const msgs = notificationMessages[lang];
        
        const message = {
          title: msgs.title,
          body: msgs.body(teacher, currentWeek, classes),
          icon: 'https://cdn.glitch.global/1c613b14-019c-488a-a856-d55d64d174d0/al-kawthar-international-schools-jeddah-saudi-arabia-modified.png?v=1739565146299',
          badge: 'https://cdn.glitch.global/1c613b14-019c-488a-a856-d55d64d174d0/al-kawthar-international-schools-jeddah-saudi-arabia-modified.png?v=1739565146299',
          requireInteraction: true,
          vibrate: [200, 100, 200, 100, 200],
          tag: `plan-reminder-${currentWeek}`,
          data: {
            url: 'https://plan-hebdomadaire-2026-boys.vercel.app',
            week: currentWeek,
            teacher: teacher,
            classes: classes,
            lang: lang,
            playSound: true
          }
        };

        try {
          // Envoyer la notification push via web-push
          const payload = JSON.stringify(message);
          
          await webpush.sendNotification(subscription.subscription, payload);
          
          notificationResults.push({
            teacher: teacher,
            classes: classes,
            language: lang,
            status: 'sent',
            message: message
          });
          
          notificationsSent++;
          console.log(`✅ Notification envoyée à ${teacher} (${lang}) pour ${classes}`);
        } catch (error) {
          console.error(`❌ Erreur notification pour ${teacher}:`, error);
          notificationResults.push({
            teacher: teacher,
            status: 'error',
            error: error.message
          });
          
          // Si l'abonnement est invalide (410 Gone), le supprimer
          if (error.statusCode === 410) {
            console.log(`🗑️ Suppression de l'abonnement invalide pour ${teacher}`);
            await db.collection('pushSubscriptions').deleteOne({ username: teacher });
          }
        }
      } else {
        console.log(`ℹ️ ${teacher} n'a pas d'abonnement push`);
        notificationResults.push({
          teacher: teacher,
          status: 'no_subscription'
        });
      }
    }

    res.status(200).json({
      message: `Vérification terminée pour la semaine ${currentWeek}.`,
      week: currentWeek,
      incompleteCount: teachersToNotify.length,
      notificationsSent: notificationsSent,
      results: notificationResults
    });

  } catch (error) {
    console.error('❌ Erreur /check-incomplete-and-notify:', error);
    res.status(500).json({ message: 'Erreur serveur.' });
  }
});

// Endpoint pour tester les notifications manuellement
app.post('/api/test-notification', async (req, res) => {
  try {
    const { username } = req.body;
    
    if (!username) {
      return res.status(400).json({ message: 'Username requis.' });
    }

    const db = await connectToDatabase();
    const subscription = await db.collection('pushSubscriptions').findOne({ username: username });
    
    if (!subscription) {
      return res.status(404).json({ message: `Aucun abonnement trouvé pour ${username}.` });
    }

    console.log(`🧪 Test de notification pour ${username}`);
    
    // Envoyer une notification de test
    const testMessage = {
      title: '🧪 Test de Notification',
      body: `Bonjour ${username}, ceci est un test de notification push. Si vous voyez ce message, les notifications fonctionnent correctement !`,
      icon: 'https://cdn.glitch.global/1c613b14-019c-488a-a856-d55d64d174d0/al-kawthar-international-schools-jeddah-saudi-arabia-modified.png?v=1739565146299',
      data: {
        url: 'https://plan-hebdomadaire-2026-boys.vercel.app',
        teacher: username
      }
    };

    try {
      const payload = JSON.stringify(testMessage);
      await webpush.sendNotification(subscription.subscription, payload);
      
      res.status(200).json({ 
        message: 'Notification de test envoyée avec succès.',
        username: username,
        hasSubscription: true
      });
    } catch (pushError) {
      console.error('❌ Erreur envoi notification test:', pushError);
      
      // Si l'abonnement est invalide (410 Gone), le supprimer
      if (pushError.statusCode === 410) {
        console.log(`🗑️ Suppression de l'abonnement invalide pour ${username}`);
        await db.collection('pushSubscriptions').deleteOne({ username: username });
      }
      
      throw new Error(`Échec d'envoi: ${pushError.message}`);
    }

  } catch (error) {
    console.error('❌ Erreur /test-notification:', error);
    res.status(500).json({ 
      message: 'Erreur serveur.',
      error: error.message 
    });
  }
});

// Endpoint pour obtenir la clé publique VAPID (nécessaire pour le frontend)
app.get('/api/vapid-public-key', (req, res) => {
  res.status(200).json({ publicKey: VAPID_PUBLIC_KEY });
});

// ✅ FONCTIONNALITÉ 3: Système d'alertes automatiques hebdomadaires
// Route pour vérifier et envoyer des alertes TOUTES LES 3 HEURES depuis le LUNDI
// Cette route peut être appelée par Vercel Cron ou un CRON job externe
app.all('/api/send-weekly-reminders', async (req, res) => {
  try {
    const apiKey = (req.body && req.body.apiKey) || req.query.apiKey || req.headers['x-cron-key'] || (req.headers['authorization'] ? req.headers['authorization'].replace(/^Bearer\s+/i, '') : null);
    
    // Sécurité avec clé API (si configurée dans l'environnement)
    const expectedKey = process.env.CRON_API_KEY || process.env.CRON_SECRET;
    if (expectedKey && apiKey !== expectedKey) {
      return res.status(401).json({ message: 'Non autorisé. Clé API invalide.' });
    }

    const now = new Date();
    const dayOfWeek = now.getDay(); // 0 = Dimanche, 1 = Lundi, ..., 6 = Samedi
    const hourOfDay = now.getHours();

    console.log(`📅 [Weekly Reminders] Vérification: ${now.toISOString()} - Jour: ${dayOfWeek}, Heure: ${hourOfDay}`);

    // ⚠️ IMPORTANT: N'envoyer des alertes QUE du LUNDI (1) au JEUDI (4)
    // Le CRON doit tourner toutes les 3 heures pendant ces jours
    if (dayOfWeek < 1 || dayOfWeek > 4) {
      return res.status(200).json({ 
        message: 'Alerte désactivée (hors période Lundi-Jeudi).',
        day: ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'][dayOfWeek],
        timestamp: now.toISOString()
      });
    }

    // Déterminer la semaine actuelle
    let currentWeek = null;
    
    for (const [week, dates] of Object.entries(specificWeekDateRangesNode)) {
      const startDate = new Date(dates.start + 'T00:00:00Z');
      const endDate = new Date(dates.end + 'T23:59:59Z');
      
      if (now >= startDate && now <= endDate) {
        currentWeek = parseInt(week, 10);
        break;
      }
    }

    if (!currentWeek) {
      return res.status(200).json({ message: 'Aucune semaine active actuellement.' });
    }

    console.log(`📅 [Weekly Reminders] Semaine active: ${currentWeek}`);

    // Récupérer les données de la semaine
    const db = await connectToDatabase();
    const planDocument = await db.collection('plans').findOne({ week: currentWeek });
    
    if (!planDocument || !planDocument.data || planDocument.data.length === 0) {
      return res.status(200).json({ 
        message: `Aucune donnée pour la semaine ${currentWeek}.`,
        week: currentWeek
      });
    }

    // Trouver les enseignants avec des travaux incomplets
    const incompleteTeachers = {};
    const planData = planDocument.data;
    
    planData.forEach(item => {
      const teacher = item[findKey(item, 'Enseignant')];
      const taskVal = item[findKey(item, 'Travaux de classe')];
      const className = item[findKey(item, 'Classe')];
      
      // Un enseignant est incomplet si au moins un "Travaux de classe" est vide
      if (teacher && className && (taskVal == null || String(taskVal).trim() === '')) {
        if (!incompleteTeachers[teacher]) {
          incompleteTeachers[teacher] = new Set();
        }
        incompleteTeachers[teacher].add(className);
      }
    });

    const teachersToNotify = Object.keys(incompleteTeachers);
    console.log(`📊 [Weekly Reminders] ${teachersToNotify.length} enseignants incomplets:`, teachersToNotify);

    if (teachersToNotify.length === 0) {
      return res.status(200).json({ 
        message: 'Tous les enseignants ont complété leurs plans.',
        week: currentWeek,
        timestamp: now.toISOString()
      });
    }

    // Récupérer les abonnements push depuis MongoDB
    const subscriptions = await db.collection('pushSubscriptions').find({}).toArray();
    
    let notificationsSent = 0;
    const notificationResults = [];

    // Envoyer des notifications à chaque enseignant incomplet
    for (const teacher of teachersToNotify) {
      const subscription = subscriptions.find(sub => sub.username === teacher);
      
      if (subscription && subscription.subscription) {
        const classes = [...incompleteTeachers[teacher]].sort().join(', ');
        const lang = getTeacherLanguage(teacher);
        const msgs = notificationMessages[lang];
        
        // Message de rappel avec urgence
        const message = {
          title: msgs.reminderTitle,
          body: msgs.reminderBody(teacher, currentWeek),
          icon: 'https://cdn.glitch.global/1c613b14-019c-488a-a856-d55d64d174d0/al-kawthar-international-schools-jeddah-saudi-arabia-modified.png?v=1739565146299',
          badge: 'https://cdn.glitch.global/1c613b14-019c-488a-a856-d55d64d174d0/al-kawthar-international-schools-jeddah-saudi-arabia-modified.png?v=1739565146299',
          requireInteraction: true,
          vibrate: [200, 100, 200, 100, 200],
          tag: `plan-reminder-${currentWeek}-${Date.now()}`, // Tag unique pour chaque rappel
          renotify: true, // Force la réaffichage même si tag similaire
          data: {
            url: 'https://plan-hebdomadaire-2026-boys.vercel.app',
            week: currentWeek,
            teacher: teacher,
            classes: classes,
            lang: lang,
            playSound: true,
            timestamp: now.toISOString()
          }
        };

        try {
          const payload = JSON.stringify(message);
          await webpush.sendNotification(subscription.subscription, payload);
          
          notificationResults.push({
            teacher: teacher,
            classes: classes,
            language: lang,
            status: 'sent',
            timestamp: now.toISOString()
          });
          
          notificationsSent++;
          console.log(`✅ [Weekly Reminders] Notification envoyée à ${teacher} (${lang})`);
        } catch (error) {
          console.error(`❌ [Weekly Reminders] Erreur notification pour ${teacher}:`, error);
          notificationResults.push({
            teacher: teacher,
            status: 'error',
            error: error.message
          });
          
          // Si l'abonnement est invalide (410 Gone), le supprimer
          if (error.statusCode === 410) {
            console.log(`🗑️ Suppression de l'abonnement invalide pour ${teacher}`);
            await db.collection('pushSubscriptions').deleteOne({ username: teacher });
          }
        }
      } else {
        console.log(`ℹ️ [Weekly Reminders] ${teacher} n'a pas d'abonnement push`);
        notificationResults.push({
          teacher: teacher,
          status: 'no_subscription'
        });
      }
    }

    res.status(200).json({
      message: `Rappels hebdomadaires envoyés pour la semaine ${currentWeek}.`,
      week: currentWeek,
      day: 'Lundi',
      hour: hourOfDay,
      incompleteCount: teachersToNotify.length,
      notificationsSent: notificationsSent,
      timestamp: now.toISOString(),
      results: notificationResults
    });

  } catch (error) {
    console.error('❌ [Weekly Reminders] Erreur:', error);
    res.status(500).json({ 
      message: 'Erreur serveur.',
      error: error.message 
    });
  }
});
// ============================================================================
// NOUVELLE ROUTE: Notification en temps réel pour enseignants incomplets
// ============================================================================
app.post('/api/notify-incomplete-teachers', async (req, res) => {
  try {
    const { week, incompleteTeachers } = req.body;
    
    if (!week || !incompleteTeachers || typeof incompleteTeachers !== 'object') {
      return res.status(400).json({ message: 'Paramètres invalides.' });
    }

    const db = await connectToDatabase();
    const teachersToNotify = Object.keys(incompleteTeachers);
    
    if (teachersToNotify.length === 0) {
      return res.status(200).json({ 
        message: 'Aucun enseignant incomplet.',
        notificationsSent: 0 
      });
    }

    console.log(`🔔 Notification en temps réel pour ${teachersToNotify.length} enseignants incomplets`);

    // Récupérer les abonnements push depuis MongoDB
    const subscriptions = await db.collection('pushSubscriptions').find({}).toArray();
    
    let notificationsSent = 0;
    const notificationResults = [];

    // Envoyer des notifications à chaque enseignant incomplet
    for (const teacher of teachersToNotify) {
      const subscription = subscriptions.find(sub => sub.username === teacher);
      
      if (subscription && subscription.subscription) {
        const classes = Array.isArray(incompleteTeachers[teacher]) 
          ? incompleteTeachers[teacher].join(', ')
          : incompleteTeachers[teacher];
        
        const lang = getTeacherLanguage(teacher);
        const msgs = notificationMessages[lang];
        
        const message = {
          title: msgs.title,
          body: msgs.body(teacher, week, classes),
          icon: 'https://cdn.glitch.global/1c613b14-019c-488a-a856-d55d64d174d0/al-kawthar-international-schools-jeddah-saudi-arabia-modified.png?v=1739565146299',
          badge: 'https://cdn.glitch.global/1c613b14-019c-488a-a856-d55d64d174d0/al-kawthar-international-schools-jeddah-saudi-arabia-modified.png?v=1739565146299',
          requireInteraction: true,
          vibrate: [200, 100, 200, 100, 200],
          tag: `plan-alert-${week}-${Date.now()}`,
          data: {
            url: 'https://plan-hebdomadaire-2026-boys.vercel.app',
            week: week,
            teacher: teacher,
            classes: classes,
            lang: lang,
            playSound: true
          }
        };

        try {
          const payload = JSON.stringify(message);
          await webpush.sendNotification(subscription.subscription, payload);
          
          notificationResults.push({
            teacher: teacher,
            classes: classes,
            language: lang,
            status: 'sent'
          });
          
          notificationsSent++;
          console.log(`✅ Notification envoyée à ${teacher} (${lang})`);
        } catch (error) {
          console.error(`❌ Erreur notification pour ${teacher}:`, error);
          notificationResults.push({
            teacher: teacher,
            status: 'error',
            error: error.message
          });
          
          // Si l'abonnement est invalide, le supprimer
          if (error.statusCode === 410) {
            console.log(`🗑️ Suppression abonnement invalide pour ${teacher}`);
            await db.collection('pushSubscriptions').deleteOne({ username: teacher });
          }
        }
      } else {
        console.log(`⚠️ Pas d'abonnement push pour ${teacher}`);
        notificationResults.push({
          teacher: teacher,
          status: 'no_subscription'
        });
      }
    }

    res.status(200).json({
      message: `Notifications envoyées: ${notificationsSent}/${teachersToNotify.length}`,
      notificationsSent: notificationsSent,
      totalIncomplete: teachersToNotify.length,
      results: notificationResults
    });

  } catch (error) {
    console.error('❌ Erreur /notify-incomplete-teachers:', error);
    res.status(500).json({ 
      message: 'Erreur serveur.',
      error: error.message 
    });
  }
});

// Middleware de gestion d'erreur global et fallback si base de données déconnectée
app.use((err, req, res, next) => {
  if (err.name === 'MongooseError' || err.name === 'MongoNetworkError' || err.name === 'MongoServerSelectionError' || (err.message && err.message.includes('buffering timed out'))) {
    console.warn('[AI Studio] Base de données hors ligne — réponse de secours renvoyée');
    if (req.method === 'GET') {
      return res.json(req.path.endsWith('s') || req.path.endsWith('s/') ? [] : {});
    }
    return res.status(503).json({ error: 'Service temporairement indisponible (base de données hors ligne)' });
  }
  console.error('Erreur non gérée:', err);
  if (!res.headersSent) {
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
});

// Configuration Port et Host
const PORT = 3000;
const HOST = '0.0.0.0';

// Ne démarrer le serveur d'écoute HTTP que si on n'est pas sur une fonction Serverless Vercel
if (!process.env.VERCEL) {
  app.listen(PORT, HOST, () => {
    console.log(`✅ Server is running and listening on http://${HOST}:${PORT}`);
    console.log(`🚀 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`🔑 IA Provider: ${USE_GROQ ? 'GROQ (llama-3.3-70b)' : 'GEMINI'}`);
    console.log(`📊 MongoDB: ${MONGO_URL ? '✅ Configured' : '❌ Missing'}`);
    console.log(`📄 Templates: ${LESSON_TEMPLATE_URL && WORD_TEMPLATE_URL ? '✅ Configured' : '❌ Missing'}`);
  });
}

// Enregistrer l'instance globale pour éviter les rechargements multiples
global.appInstance = app;

// Export obligatoire pour Vercel Serverless Functions
module.exports = app;

