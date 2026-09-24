        console.log("Script principal démarré.");

        // Variables globales
        let loggedInUser = null;
        let currentUserRole = localStorage.getItem('userRole') || null;
        let loggedInTeacherTable = localStorage.getItem('tableTeacherName') || '';
        let currentUserLanguage = 'fr';
        let currentSection = localStorage.getItem('selectedSection') || localStorage.getItem('currentSection') || 'garcons';
        let planData = [];
        let filteredAndSortedData = [];
        let uploadedPlanData = null;
        let headers = [];
        let currentWeek = null;
        let weekStartDate = null;
        let weeklyClassNotes = {};
        let weeklyClassNotesPhotos = {};
        let alertTimeoutId = null;
        let incompleteTeachersInfo = {};
        let currentSortColumn = null;
        let currentSortOrder = 'asc';
        let showCrossSectionView = false;

        // Formateur d'URL Google Drive universel
        function formatDriveImageUrl(url) {
            if (!url || typeof url !== 'string') return '';
            const trimmed = url.trim();
            const idMatch = trimmed.match(/\/d\/([a-zA-Z0-9_-]+)/) ||
                            trimmed.match(/id=([a-zA-Z0-9_-]+)/) ||
                            trimmed.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
            if (idMatch && idMatch[1]) {
                return `https://drive.google.com/thumbnail?id=${idMatch[1]}&sz=w1000`;
            }
            return trimmed;
        }
        window.formatDriveImageUrl = formatDriveImageUrl;

        // Cache global des photos des enseignants pour l'ensemble de l'application (Discussion Parents, Fiches, etc.)
        window.globalTeachersPhotosMap = {};

        // Helper Cycle Maternelle (Règle utilisateur 3 : PS, MS, GS semaine actuelle = semaine des autres - 1)
        function isMaternelleClass(className) {
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
        window.isMaternelleClass = isMaternelleClass;

        // Helper Jour Férié (Règle utilisateur 2 : ne pas générer de plan pour les jours fériés)
        function isHolidayRow(rowData, specialDaysList = [], week = null, section = null) {
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

            const list = Array.isArray(specialDaysList) && specialDaysList.length > 0 ? specialDaysList : (window.parentSpecialDays || []);
            if (Array.isArray(list) && list.length > 0 && jour) {
                const normDay = jour.toLowerCase().replace(/[^a-zà-ÿ]/g, '');
                const normCls = classe.toLowerCase().replace(/[\s\-_]+/g, '');
                const normSec = String(section || rowData._section || currentSection || '').toLowerCase();

                const isMatch = list.some(sd => {
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
        window.isHolidayRow = isHolidayRow;

        async function fetchGlobalTeachersPhotos() {
            try {
                const res = await fetch('/api/teachers-photos');
                if (res.ok) {
                    const data = await res.json();
                    window.globalTeachersPhotosMap = (data && data.photos) ? data.photos : {};
                }
            } catch (e) {
                console.warn('Erreur chargement photos enseignants:', e);
            }
            return window.globalTeachersPhotosMap;
        }

        function getTeacherDirectPhotoUrl(teacherName) {
            if (!teacherName || typeof teacherName !== 'string') return '';
            const clean = teacherName.trim();
            if (!window.globalTeachersPhotosMap || Object.keys(window.globalTeachersPhotosMap).length === 0) return '';
            if (window.globalTeachersPhotosMap[clean]) {
                return formatGoogleDriveImageUrl(window.globalTeachersPhotosMap[clean]);
            }
            const lower = clean.toLowerCase();
            const foundKey = Object.keys(window.globalTeachersPhotosMap).find(k => k.toLowerCase() === lower);
            if (foundKey) {
                return formatGoogleDriveImageUrl(window.globalTeachersPhotosMap[foundKey]);
            }
            return '';
        }

        // Listes strictes des enseignants par section
        const maleTeachersList = [
            'Mohamed', 'Abas', 'Jaber', 'Imad', 'Kamel', 'Majed', 'Mohamed Ali', 'Morched', 
            'Saeed', 'Sami', 'Sylvano', 'Tonga', 'Oumarou', 'Zine', 'Youssouf'
        ];

        const femaleTeachersList = [
            'Amina', 'Fatima', 'Khadija', 'Mariam', 'Salma', 'Zainab', 'Nour', 'Houda', 
            'Leila', 'Sarah', 'Zohra', 'Farah', 'Music', 'Musique', 'Amal', 'Amal Arabe'
        ];

        const primaireTeachersList = [
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

        const isDualSectionTeacher = (username) => {
            if (!username) return false;
            return isMusicTeacher(username) || isAmalSoleTeacher(username);
        };

        function isUserAdminOrSupervisor(user, role) {
            const u = String(user || (typeof loggedInUser !== 'undefined' ? loggedInUser : '')).trim().toLowerCase();
            const r = String(role || (typeof currentUserRole !== 'undefined' ? currentUserRole : '')).trim().toLowerCase();
            return u === 'med01' || u === 'racha' || r === 'admin' || r === 'supervisor';
        }

        function isRowForLoggedInTeacher(rowTeacher, user, tableTeacher) {
            if (!user || isUserAdminOrSupervisor(user)) return true;
            if (!rowTeacher) return false;
            const rT = String(rowTeacher).trim().toLowerCase();
            const u = String(user).trim().toLowerCase();
            const tT = tableTeacher ? String(tableTeacher).trim().toLowerCase() : '';
            
            // 1. Enseignante Musique (Farah)
            if (isMusicTeacher(u) || (tT && isMusicTeacher(tT))) {
                return isMusicTeacher(rT) || rT === u || (tT && rT === tT);
            }

            // 2. Amal (Seule / non arabe)
            if (isAmalSoleTeacher(u) || (tT && isAmalSoleTeacher(tT))) {
                return isAmalSoleTeacher(rT);
            }

            // 3. Amal Arabe
            if (isAmalArabeTeacher(u) || (tT && isAmalArabeTeacher(tT))) {
                return isAmalArabeTeacher(rT);
            }
            
            if (rT === u || (tT && rT === tT)) return true;
            if (u && (rT.includes(u) || u.includes(rT))) return true;
            if (tT && (rT.includes(tT) || tT.includes(rT))) return true;
            return false;
        }

        function isTeacherMatch(rowTeacher, filterTeacher) {
            if (!filterTeacher) return true;
            if (!rowTeacher) return false;
            const r = String(rowTeacher).trim().toLowerCase();
            const f = String(filterTeacher).trim().toLowerCase();
            if (r === f) return true;
            if (isMusicTeacher(f)) return isMusicTeacher(r);
            if (isAmalArabeTeacher(f)) return isAmalArabeTeacher(r);
            if (isAmalSoleTeacher(f)) return isAmalSoleTeacher(r);
            return r.includes(f) || f.includes(r);
        }

        function setSortColumn(colName) {
            if (currentSortColumn === colName) {
                currentSortOrder = (currentSortOrder === 'asc') ? 'desc' : 'asc';
            } else {
                currentSortColumn = colName;
                currentSortOrder = 'asc';
            }
            sortAndDisplay();
        }

        const subjectEquivalenceGroups = [
            // 1. Français
            ['français', 'francais', 'french', 'langue française', 'langue francaise', 'fr', 'لغة فرنسية', 'فرنسي', 'فرنسية', 'الفرنسية', 'اللغة الفرنسية'],
            // 2. Mathématiques
            ['mathématiques', 'mathematiques', 'maths', 'math', 'mathématique', 'mathematique', 'mathematics', 'الرياضيات', 'رياضيات', 'حساب'],
            // 3. Anglais
            ['anglais', 'english', 'langue anglaise', 'eng', 'اللغة الإنجليزية', 'اللغة الانجليزية', 'الانجليزية', 'الانكليزية', 'انجليزي', 'انكليزي'],
            // 4. Arabe
            ['arabe', 'arabic', 'اللغة العربية', 'عربي', 'عربية', 'لغة عربية', 'قراءة', 'نصوص', 'تعبير', 'املاء', 'قواعد', 'العربية'],
            // 5. Éducation Islamique
            ['islamique', 'education islamique', 'éducation islamique', 'التربية الإسلامية', 'تربية إسلامية', 'إسلاميات', 'اسلاميات', 'قرآن', 'القرآن', 'حديث', 'الحديث', 'فقه', 'الفقه', 'توحيد', 'التوحيد', 'تجويد', 'التجويد', 'سيرة', 'السيرة', 'الدراسات الإسلامية', 'الدراسات الاسلامية', 'دراسات إسلامية', 'دراسات اسلامية', 'التربية الدينية', 'تربية دينية', 'دين', 'الدين'],
            // 6. Histoire-Géo / Social Studies
            ['histoire-géo', 'histoire-geo', 'histoire - géographie', 'histoire - geographie', 'histoire', 'géographie', 'geographie', 'social studies', 'اجتماعيات', 'الاجتماعيات', 'الدراسات الاجتماعية', 'دراسات اجتماعية', 'تاريخ', 'التاريخ', 'جغرافيا', 'الجغرافيا'],
            // 7. Physique / Chimie (Strictement distinct de SVT)
            ['physique', 'chimie', 'physique - chimie', 'physique-chimie', 'physics', 'chemistry', 'فيزياء', 'الفيزياء', 'كيمياء', 'الكيمياء', 'الفيزياء والكيمياء', 'فيزياء وكيمياء', 'علوم فيزيائية', 'العلوم الفيزيائية', 'sciences physiques', 'sciences physique', 'spc'],
            // 8. SVT / Biologie / Sciences Naturelles (Strictement distinct de Physique-Chimie)
            ['svt', 'sciences de la vie et de la terre', 'biologie', 'biology', 'sciences naturelles', 'sciences de la vie', 'علوم طبيعية', 'العلوم الطبيعية', 'علوم الحياة والأرض', 'علوم الحياة والارض', 'علوم الطبيعة والحياة', 'أحياء', 'الأحياء', 'احياء', 'ايقاظ علمي', 'إيقاظ علمي'],
            // 9. Arts Plastiques
            ['arts plastiques', 'art', 'arts', 'visual arts', 'فنون', 'الفنون', 'تربية فنية', 'التربية الفنية', 'رسم', 'الرسم'],
            // 10. Musique
            ['musique', 'music', 'موسيقى', 'الموسيقى', 'تربية موسيقية', 'التربية الموسيقية'],
            // 11. EPS / Sport
            ['eps', 'sport', 'education physique', 'éducation physique', 'éducation physique et sportive', 'تربية بدنية', 'التربية البدنية', 'رياضة', 'الرياضة'],
            // 12. Informatique / Design
            ['design', 'informatique', 'technologie', 'computer science', 'it', 'تكنولوجيا', 'التكنولوجيا', 'حاسوب', 'الحاسوب', 'اعلام آلي', 'إعلام آلي'],
            // 13. Philosophie
            ['philosophie', 'philo', 'philosophy', 'فلسفة', 'الفلسفة']
        ];

        function normalizeSubjectStr(s) {
            if (!s) return '';
            return String(s)
                .trim()
                .toLowerCase()
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '')
                .replace(/[\u064B-\u065F\u0670]/g, '')
                .replace(/[أإآ]/g, 'ا')
                .replace(/ة/g, 'ه')
                .replace(/ى/g, 'ي')
                .replace(/[\s\-_()[\]{}:/.,+&]/g, '');
        }

        function isPhysicalScienceSubject(s) {
            if (!s) return false;
            const norm = normalizeSubjectStr(s);
            if (!norm) return false;
            const physKeywords = ['physique', 'chimie', 'physics', 'chemistry', 'فيزياء', 'فيزيائ', 'كيمياء', 'كيميائ', 'spc'];
            return physKeywords.some(k => norm.includes(normalizeSubjectStr(k)));
        }

        function isLifeScienceSubject(s) {
            if (!s) return false;
            if (isPhysicalScienceSubject(s)) return false; // Strictement exclusif
            const norm = normalizeSubjectStr(s);
            if (!norm) return false;
            const lifeKeywords = ['svt', 'biologie', 'biology', 'احياء', 'حياه', 'طبيعيه', 'طبيعه', 'ايقاظ', 'life'];
            return lifeKeywords.some(k => norm.includes(normalizeSubjectStr(k))) || (norm === 'sciences' || norm === 'science' || norm === 'علوم');
        }

        function getSubjectCategoryCode(sub) {
            if (!sub) return '';
            const norm = normalizeSubjectStr(sub);
            if (isPhysicalScienceSubject(sub)) return 'physique_chimie';
            if (isLifeScienceSubject(sub)) return 'svt_biologie';
            for (let i = 0; i < subjectEquivalenceGroups.length; i++) {
                const group = subjectEquivalenceGroups[i];
                if (group.some(item => {
                    const ni = normalizeSubjectStr(item);
                    return norm === ni || (norm.length > 3 && norm.includes(ni)) || (ni.length > 3 && ni.includes(norm));
                })) {
                    return `group_${i}`;
                }
            }
            return norm;
        }

        function isEquivalentSubject(sub1, sub2) {
            if (!sub1 || !sub2) return false;
            const a = String(sub1).trim();
            const b = String(sub2).trim();
            if (a.toLowerCase() === b.toLowerCase()) return true;

            // Règle d'or: Séparer formellement Physique/Chimie de Biologie/SVT
            const isPhys1 = isPhysicalScienceSubject(a);
            const isPhys2 = isPhysicalScienceSubject(b);
            if (isPhys1 !== isPhys2) {
                // L'un est Physique/Chimie et l'autre non -> JAMAIS équivalents
                return false;
            }
            if (isPhys1 && isPhys2) return true; // Tous deux Physique/Chimie

            const isBio1 = isLifeScienceSubject(a);
            const isBio2 = isLifeScienceSubject(b);
            if (isBio1 !== isBio2) {
                // L'un est SVT/Biologie et l'autre non -> JAMAIS équivalents
                return false;
            }
            if (isBio1 && isBio2) return true; // Tous deux SVT/Biologie

            const cat1 = getSubjectCategoryCode(a);
            const cat2 = getSubjectCategoryCode(b);
            if (cat1 && cat2 && cat1 === cat2) return true;

            const n1 = normalizeSubjectStr(a);
            const n2 = normalizeSubjectStr(b);
            if (n1 === n2) return true;
            return false;
        }

        // Récupère les couples (Matière, Classe) enseignés par l'enseignant connecté
        function getTeacherTeachingAssignments(allData, user, teacherTable) {
            const ensK = findHKey('Enseignant');
            const matK = findHKey('Matière');
            const clsK = findHKey('Classe');
            const assignments = [];
            if (!allData || !ensK || !matK || !clsK) return assignments;
            
            allData.forEach(row => {
                if (row && !row.isReadOnlyCrossSection && isRowForLoggedInTeacher(row[ensK], user, teacherTable)) {
                    const s = row[matK] ? String(row[matK]).trim() : '';
                    const c = row[clsK] ? String(row[clsK]).trim() : '';
                    if (s && c) {
                        const exists = assignments.some(a => isEquivalentSubject(a.subject, s) && isClassMatch(a.classe, c));
                        if (!exists) {
                            assignments.push({ subject: s, classe: c });
                        }
                    }
                }
            });
            return assignments;
        }

        // Vérifie si une ligne de l'autre section correspond STRICTEMENT à l'un des couples (Matière, Classe) enseignés ensemble par l'enseignant
        function isCrossSectionRowMatchingTeacherAssignments(row, assignments) {
            if (!row || !assignments || assignments.length === 0) return true;
            const matK = findHKey('Matière');
            const clsK = findHKey('Classe');
            const rowMat = matK && row[matK] ? String(row[matK]).trim() : '';
            const rowCls = clsK && row[clsK] ? String(row[clsK]).trim() : '';
            if (!rowMat || !rowCls) return false;

            return assignments.some(assign => {
                const matchSubject = isEquivalentSubject(assign.subject, rowMat);
                const matchClass = isClassMatch(assign.classe, rowCls);
                return matchSubject && matchClass;
            });
        }

        async function handleCrossSectionToggle(isChecked) {
            showCrossSectionView = !!isChecked;
            if (currentWeek) {
                await fetchPlanData(currentWeek);
            }
        }

        function updateCrossSectionToggleUI() {
            const toggleContainer = document.getElementById('crossSectionToggleWrapper') || document.getElementById('crossSectionToggleContainer');
            const toggleCheckbox = document.getElementById('toggleCrossSectionView') || document.getElementById('crossSectionToggle');
            const toggleLabelText = document.getElementById('crossSectionToggleText') || document.querySelector('#crossSectionToggleLabel span') || document.getElementById('crossSectionToggleLabel');
            if (!toggleContainer || !toggleCheckbox) return;

            // Afficher le commutateur pour les enseignants et administrateurs
            toggleContainer.style.display = 'inline-flex';
            toggleCheckbox.checked = !!showCrossSectionView;

            let otherSectionLabelFr = (currentSection === 'garcons') ? 'Section Filles' : (currentSection === 'filles' ? 'Section Garçons' : 'Section Secondaire');
            let otherSectionLabelAr = (currentSection === 'garcons') ? 'قسم البنات' : (currentSection === 'filles' ? 'قسم البنين' : 'القسم الثانوي');
            let otherSectionLabelEn = (currentSection === 'garcons') ? 'Girls Section' : (currentSection === 'filles' ? 'Boys Section' : 'Secondary Section');

            if (toggleLabelText) {
                if (currentUserLanguage === 'ar') {
                    toggleLabelText.textContent = `👁️ عرض مساهمات ${otherSectionLabelAr} (قراءة فقط)`;
                } else if (currentUserLanguage === 'en') {
                    toggleLabelText.textContent = `👁️ View ${otherSectionLabelEn} entries (Read-only)`;
                } else {
                    toggleLabelText.textContent = `👁️ Voir les saisies de la ${otherSectionLabelFr} (Lecture seule)`;
                }
            }
        }

        const teachersSectionMap = {
            garcons: maleTeachersList,
            filles: femaleTeachersList,
            primaire: primaireTeachersList
        };

        const sectionClassesMap = {
            garcons: ["PEI1", "PEI2", "PEI3", "PEI4", "PEI5", "DP1", "DP2"],
            filles: ["PEI1", "PEI2", "PEI3", "PEI4", "PEI5", "DP1", "DP2"],
            primaire: ["PS", "MS", "GS", "PP1", "PP2", "PP3", "PP4", "PP5"]
        };

        function getSectionClasses(sec) {
            return sectionClassesMap[sec || currentSection] || sectionClassesMap.garcons;
        }

        // --- Fonctions de Gestion de Section et Accueil ---
        function showHomeStep(step) {
            const mainStep = document.getElementById('home-step-main');
            const parentStep = document.getElementById('home-step-parent');
            const teacherStep = document.getElementById('home-step-teacher');
            
            if (mainStep) mainStep.style.display = (step === 'main' || !step) ? 'block' : 'none';
            if (parentStep) parentStep.style.display = (step === 'parent') ? 'block' : 'none';
            if (teacherStep) teacherStep.style.display = (step === 'teacher') ? 'block' : 'none';
        }

        function chooseSection(section) {
            currentSection = section;
            localStorage.setItem('selectedSection', section);
            localStorage.setItem('currentSection', section);
            applyParentUIMode(false);
            updateSectionBadges();
            
            const adminUploadSec = document.getElementById('adminUploadSectionSelect');
            if (adminUploadSec) adminUploadSec.value = section;
            if (typeof updateUploadTargetInfo === 'function') updateUploadTargetInfo();

            const sectionSelectionEl = document.getElementById('section-selection');
            if (sectionSelectionEl) sectionSelectionEl.style.display = 'none';
            
            if (loggedInUser) {
                document.getElementById('main-content').style.display = 'block';
                document.getElementById('login-form').style.display = 'none';
                if (currentWeek) {
                    fetchPlanData(currentWeek);
                }
            } else {
                document.getElementById('login-form').style.display = 'block';
                document.getElementById('main-content').style.display = 'none';
            }
        }

        // ============================================================================
        // GESTION DU DEEP LINKING (LIENS DIRECTS PARENTS) & NOTIFICATIONS
        // ============================================================================
        function updateParentURL(section, viewName) {
            try {
                const sec = section || currentSection || 'garcons';
                const url = new URL(window.location.href);
                url.searchParams.set('space', 'parent');
                url.searchParams.set('section', sec);
                if (viewName && viewName !== 'parent-selection') {
                    url.searchParams.set('view', viewName);
                } else {
                    url.searchParams.delete('view');
                }
                window.history.replaceState({ space: 'parent', section: sec, view: viewName }, '', url.toString());
            } catch (e) {
                console.warn('Impossible de mettre à jour l\'URL:', e);
            }
        }

        function clearParentURL() {
            try {
                const url = new URL(window.location.href);
                url.searchParams.delete('space');
                url.searchParams.delete('section');
                url.searchParams.delete('view');
                url.searchParams.delete('espace');
                window.history.replaceState({}, '', url.pathname);
            } catch (e) {
                console.warn('Impossible de nettoyer l\'URL:', e);
            }
        }

        function showToastNotification(message, type = 'success') {
            let toastContainer = document.getElementById('app-toast-container');
            if (!toastContainer) {
                toastContainer = document.createElement('div');
                toastContainer.id = 'app-toast-container';
                toastContainer.style.cssText = 'position:fixed; bottom:25px; right:25px; z-index:100000; display:flex; flex-direction:column; gap:10px; pointer-events:none; max-width:420px;';
                document.body.appendChild(toastContainer);
            }
            const toast = document.createElement('div');
            const isAr = currentUserLanguage === 'ar' || (typeof containsArabic === 'function' && containsArabic(message));
            const bg = type === 'error' ? 'linear-gradient(135deg, #DC2626, #B91C1C)' : (type === 'warning' ? 'linear-gradient(135deg, #D97706, #B45309)' : 'linear-gradient(135deg, #059669, #047857)');
            const icon = type === 'error' ? 'fas fa-exclamation-circle' : (type === 'warning' ? 'fas fa-exclamation-triangle' : 'fas fa-check-circle');
            
            toast.style.cssText = `background:${bg}; color:white; padding:14px 20px; border-radius:12px; box-shadow:0 10px 25px rgba(0,0,0,0.25); font-weight:600; font-size:0.95rem; display:flex; align-items:center; gap:12px; pointer-events:auto; direction:${isAr ? 'rtl' : 'ltr'}; opacity:0; transform:translateY(20px); transition:all 0.3s ease;`;
            toast.innerHTML = `<i class="${icon}" style="font-size:1.3rem;"></i><span style="flex:1;">${escapeHtml(message)}</span>`;
            
            toastContainer.appendChild(toast);
            requestAnimationFrame(() => {
                toast.style.opacity = '1';
                toast.style.transform = 'translateY(0)';
            });
            
            setTimeout(() => {
                toast.style.opacity = '0';
                toast.style.transform = 'translateY(20px)';
                setTimeout(() => toast.remove(), 350);
            }, 4500);
        }

        function copyParentDirectLink(explicitSection = null) {
            const sec = explicitSection || currentSection || 'garcons';
            const url = new URL(window.location.origin + window.location.pathname);
            url.searchParams.set('space', 'parent');
            url.searchParams.set('section', sec);
            const linkToCopy = url.toString();
            
            const secNameFr = sec === 'garcons' ? 'Section Garçons 👦' : (sec === 'filles' ? 'Section Filles 👧' : 'Section Primaire & Maternelle 👶🎒');
            const secNameAr = sec === 'garcons' ? 'قسم البنين 👦' : (sec === 'filles' ? 'قسم البنات 👧' : 'قسم الابتدائي والروضة 👶🎒');

            const copySuccess = () => {
                const msg = currentUserLanguage === 'ar'
                    ? `تم نسخ رابط (${secNameAr}) بنجاح! يمكنك إرساله مباشرة لأولياء الأمور.`
                    : `Lien direct copié pour la ${secNameFr} ! Vous pouvez l'envoyer directement aux parents.`;
                showToastNotification(msg, 'success');
                if (typeof displayAlert === 'function') {
                    displayAlert(msg, false);
                }
            };

            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(linkToCopy).then(copySuccess).catch(() => {
                    fallbackCopy(linkToCopy, copySuccess);
                });
            } else {
                fallbackCopy(linkToCopy, copySuccess);
            }
        }

        function fallbackCopy(text, cb) {
            const ta = document.createElement('textarea');
            ta.value = text;
            ta.style.position = 'fixed';
            ta.style.opacity = '0';
            document.body.appendChild(ta);
            ta.select();
            try {
                document.execCommand('copy');
                if (cb) cb();
            } catch (err) {
                console.error('Échec de la copie:', err);
            }
            document.body.removeChild(ta);
        }

        function resetSectionChoice() {
            // RÈGLE STRICTE : Si un parent est dans une section, il ne peut pas aller vers les autres sections
            if (isParentMode || sessionStorage.getItem('lockedParentSection') || localStorage.getItem('lockedParentSection')) {
                showHomeworkView('parent-selection');
                return;
            }
            clearParentURL();
            const sectionSelectionEl = document.getElementById('section-selection');
            if (sectionSelectionEl) sectionSelectionEl.style.display = 'flex';
            document.getElementById('login-form').style.display = 'none';
            document.getElementById('main-content').style.display = 'none';
            showHomeStep('main');
        }

        function updateSectionBadges() {
            const isBoys = currentSection === 'garcons';
            const isGirls = currentSection === 'filles';
            const isPrimaire = currentSection === 'primaire';
            
            let badgeText = 'Section Garçons 👦';
            let badgeClass = 'section-badge badge-garcons';
            let toggleText = 'Section Garçons 👦';
            
            if (isGirls) {
                badgeText = 'Section Filles 👧';
                badgeClass = 'section-badge badge-filles';
                toggleText = currentUserLanguage === 'ar' ? 'قسم البنات 👧' : 'Section Filles 👧';
            } else if (isPrimaire) {
                badgeText = 'Section Primaire & Maternelle 👶🎒';
                badgeClass = 'section-badge badge-primaire';
                toggleText = currentUserLanguage === 'ar' ? 'الابتدائي والروضة 👶🎒' : 'Primaire & Maternelle 👶🎒';
            } else {
                toggleText = currentUserLanguage === 'ar' ? 'قسم البنين 👦' : 'Section Garçons 👦';
            }
            
            const loginBadge = document.getElementById('loginSectionBadge');
            if (loginBadge) {
                loginBadge.textContent = badgeText;
                loginBadge.className = badgeClass;
            }
            
            const mainBadge = document.getElementById('mainSectionBadge');
            if (mainBadge) {
                mainBadge.textContent = badgeText;
                mainBadge.className = badgeClass;
            }

            document.querySelectorAll('.parentSectionBadgeDisplay').forEach(el => {
                el.className = `parentSectionBadgeDisplay ${badgeClass}`;
            });

            document.querySelectorAll('.parentSectionToggleText').forEach(el => {
                el.textContent = toggleText;
            });

            const adminFilter = document.getElementById('adminSectionFilter');
            if (adminFilter) {
                adminFilter.value = currentSection;
            }

            const adminStudFilter = document.getElementById('adminStudentSectionFilter');
            if (adminStudFilter) {
                adminStudFilter.value = currentSection;
            }

            // Mettre à jour l'état visuel des boutons commutateurs de section admin
            document.querySelectorAll('.admin-sec-toggle-btn').forEach(btn => {
                btn.classList.remove('active');
            });
            const activeAdminBtn = document.getElementById(`adminSecBtn_${currentSection}`);
            if (activeAdminBtn) activeAdminBtn.classList.add('active');

            // Mettre à jour les sélecteurs de classe pour la section active
            if (typeof renderParentClassButtons === 'function') renderParentClassButtons();
            if (typeof updateClassDropdowns === 'function') updateClassDropdowns();
            updateDualTeacherSectionButtons();
            if (typeof updateCrossSectionToggleUI === 'function') updateCrossSectionToggleUI();
        }

        // Mettre à jour l'affichage du commutateur de section pour les enseignantes multi-sections (Farah, Amal)
        function updateDualTeacherSectionButtons() {
            const isDual = (typeof isDualSectionTeacher === 'function') && isDualSectionTeacher(loggedInUser);
            const dualSecSwitch = document.getElementById('dualTeacherSectionSwitch');
            const dualBanner = document.getElementById('dualTeacherNoticeBanner');
            
            if (dualSecSwitch) {
                dualSecSwitch.style.display = isDual ? 'inline-flex' : 'none';
            }
            if (dualBanner) {
                dualBanner.style.display = isDual ? 'flex' : 'none';
            }

            if (isDual) {
                const teacherDisplayName = (typeof loggedInTeacherTable !== 'undefined' && loggedInTeacherTable) ? loggedInTeacherTable : loggedInUser;
                const isMusic = (typeof isMusicTeacher === 'function') && isMusicTeacher(loggedInUser);
                const teacherIcon = isMusic ? 'fas fa-music' : 'fas fa-chalkboard-teacher';
                
                const secLabel = document.getElementById('dualSecTeacherLabel');
                if (secLabel) {
                    secLabel.innerHTML = `<i class="${teacherIcon}"></i> <span>${teacherDisplayName}</span> :`;
                }

                const bannerTeacherName = document.getElementById('dualBannerTeacherName');
                if (bannerTeacherName) {
                    bannerTeacherName.textContent = teacherDisplayName;
                }

                const bannerIcon = document.getElementById('dualBannerIcon');
                if (bannerIcon) {
                    bannerIcon.innerHTML = `<i class="${teacherIcon}"></i>`;
                }
            }

            // Mise à jour des boutons dans l'en-tête
            const btnFilles = document.getElementById('teacherSecBtn_filles');
            const btnPrimaire = document.getElementById('teacherSecBtn_primaire');
            if (btnFilles) btnFilles.classList.toggle('active', currentSection === 'filles');
            if (btnPrimaire) btnPrimaire.classList.toggle('active', currentSection === 'primaire');

            // Mise à jour des boutons dans la bannière
            const bannerBtnFilles = document.getElementById('dualBannerBtn_filles');
            const bannerBtnPrimaire = document.getElementById('dualBannerBtn_primaire');
            if (bannerBtnFilles) bannerBtnFilles.classList.toggle('active', currentSection === 'filles');
            if (bannerBtnPrimaire) bannerBtnPrimaire.classList.toggle('active', currentSection === 'primaire');

            // Mise à jour du texte de statut dans la bannière
            const statusText = document.getElementById('dualCurrentSectionText');
            if (statusText) {
                if (currentSection === 'primaire') {
                    statusText.innerHTML = `Section active : <span class="active-sec-pill pill-primaire">Section Primaire & Maternelle 👶🎒</span>`;
                } else {
                    statusText.innerHTML = `Section active : <span class="active-sec-pill pill-filles">Section Filles 👧</span>`;
                }
            }
        }

        // Permet aux enseignantes multi-sections (Farah, Amal) de basculer instantanément entre Section Filles et Section Primaire & Maternelle
        async function switchDualTeacherSection(newSection) {
            if (!newSection) return;
            if (newSection !== 'filles' && newSection !== 'primaire') {
                newSection = 'filles';
            }
            if (newSection === currentSection) return;
            
            console.log(`🔄 Enseignante Multi-sections (${loggedInUser}) - Basculement de section: ${currentSection} ➔ ${newSection}`);
            currentSection = newSection;
            localStorage.setItem('selectedSection', newSection);
            localStorage.setItem('currentSection', newSection);
            
            updateSectionBadges();
            updateDualTeacherSectionButtons();
            
            if (typeof updateClassDropdowns === 'function') updateClassDropdowns();
            if (typeof populateNotesClassSelector === 'function') populateNotesClassSelector();
            
            // Recharger le plan de travail de la nouvelle section sélectionnée
            if (currentWeek) {
                await fetchPlanData(currentWeek);
            }
            
            const secLabel = newSection === 'primaire' ? 'Section Primaire & Maternelle 👶🎒' : 'Section Filles 👧';
            displayAlert(`Section active : <strong>${secLabel}</strong>. Vous pouvez maintenant remplir et modifier le plan de cette section.`, false);
        }

        // Basculer la section de travail de l'administrateur sans déconnexion
        function switchAdminActiveSection(newSection) {
            if (!newSection) return;
            
            currentSection = newSection;
            localStorage.setItem('selectedSection', newSection);
            localStorage.setItem('currentSection', newSection);
            
            updateSectionBadges();
            
            // Mettre à jour les filtres d'onglets de gestion admin
            const adminFilter = document.getElementById('adminSectionFilter');
            if (adminFilter) adminFilter.value = newSection;
            
            const adminStudFilter = document.getElementById('adminStudentSectionFilter');
            if (adminStudFilter) adminStudFilter.value = newSection;

            const adminUploadSec = document.getElementById('adminUploadSectionSelect');
            if (adminUploadSec) adminUploadSec.value = newSection;
            if (typeof updateUploadTargetInfo === 'function') updateUploadTargetInfo();
            
            // Recharger l'onglet admin actuellement actif
            const activeTabBtn = document.querySelector('.admin-tab-btn.active');
            const activeTab = activeTabBtn ? activeTabBtn.id.replace('tabBtn_', '') : 'upload';
            if (activeTab === 'teachers') {
                loadAdminUsersList();
            } else if (activeTab === 'students') {
                if (typeof loadAdminStudentsList === 'function') loadAdminStudentsList();
            } else if (activeTab === 'reports') {
                if (typeof populateAdminReportClassSelector === 'function') populateAdminReportClassSelector();
            }
            
            // Recharger le tableau du plan hebdomadaire de la semaine en cours si ouvert
            if (typeof currentWeek !== 'undefined' && currentWeek) {
                if (typeof fetchPlanData === 'function') fetchPlanData(currentWeek);
            }
            
            const secLabel = newSection === 'garcons' ? 'Section Garçons 👦' : (newSection === 'primaire' ? 'Section Primaire & Maternelle 👶🎒' : 'Section Filles 👧');
            displayAlert(`Section active de travail : <strong>${secLabel}</strong> (basculement immédiat)`, false);
        }

        function cycleAdminSection() {
            let nextSec = 'garcons';
            if (currentSection === 'garcons') nextSec = 'filles';
            else if (currentSection === 'filles') nextSec = 'primaire';
            else nextSec = 'garcons';
            switchAdminActiveSection(nextSec);
        }
        
        // Version d'authentification pour forcer la déconnexion
        const AUTH_VERSION = 2; // Incrémenter pour forcer tous les utilisateurs à se reconnecter

        const arabicTeachers = ['Majed', 'Jaber', 'Imad'];
        const englishTeachers = ['Kamel'];
        const isArabicUser = () => currentUserLanguage === 'ar';
        
        // Version du code pour vérifier le déploiement
        console.log('%c🚀 VERSION DÉPLOYÉE: 2026-01-23 15:30 - Garçons', 'background: #0066CC; color: white; padding: 5px 10px; border-radius: 5px; font-weight: bold;');
        console.log('📋 Enseignants Arabes:', arabicTeachers);
        console.log('📋 Enseignants Anglais:', englishTeachers);

        // Traductions
        const translations = {
            fr: { 
                login_title: "Connexion", login_username_label: "Nom d'utilisateur (Enseignant) :", login_password_label: "Mot de passe (idem Nom) :", login_button_text: "Se connecter", remember_me: "Rester connecté", logout_button: "Déconnecter", main_page_title: "Plans Hebdomadaires", week_label: "Semaine:", select_week: "-- Sélectionnez une semaine --", please_select_week: "Veuillez sélectionner une semaine.", admin_actions_title: "Actions Administrateur", admin_excel_label: "Fichier Excel :", admin_save_button: "Charger et Enregistrer dans la DB", generate_word_button: "Générer Word par Classe", generate_excel_button: "Générer Excel (1 Fichier)", save_all_button: "Enregistrer Lignes Affichées", filter_teacher_label: "Enseignant:", filter_class_label: "Classe:", filter_material_label: "Matière:", filter_period_label: "Période:", filter_day_label: "Jour:", all: "Tous", all_f: "Toutes", day_sun: "Dimanche", day_mon: "Lundi", day_tue: "Mardi", day_wed: "Mercredi", day_thu: "Jeudi", days: ["Dim", "Lun", "Mar", "Mer", "Jeu"], fullDays: ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi"], months: ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"], headers: { 'Leçon': 'Leçon', 'Travaux de classe': 'Travaux de classe', 'Support': 'Support', 'Devoirs': 'Devoirs', 'Enseignant': 'Enseignant', 'Classe': 'Classe', 'Matière': 'Matière', 'Période': 'Période', 'Jour': 'Jour' }, actions: "Actions", updated_at: "Mis à jour", notes_for_class: "Notes pour la classe :", select_class: "-- Sélectionnez une classe --", select_class_placeholder: "Sélectionnez une classe pour voir ou ajouter des notes...", notes_placeholder: "Notes pour {classText}...", save_notes_button: "Enregistrer Notes", saving: "Enregistrement...", saved: "Enregistré", saving_notes_for: "Enregistrement notes pour {class} S{week}", notes_saved_success: "Notes enregistrées pour {class}, S{week}.", error_saving_notes: "Erreur d'enregistrement des notes: {error}", display_incomplete: "Afficher Incomplets", hide_incomplete: "Masquer Incomplets", incomplete_teachers_title: "Enseignants Incomplets", loading: "Chargement...", no_data: "Aucune donnée.", all_complete: "Tout complet!", error_config_columns: "Erreur config colonnes.", welcome_user: "Bienvenue {user} ! Veuillez sélectionner une semaine.", connected_as: "Connecté: {user}", loading_data_week: "Chargement données S{week}...", data_loaded_week: "Données S{week} chargées.", no_data_found_week: "Aucune donnée trouvée pour S{week}.", error_loading_week: "Erreur chargement S{week}: {error}", select_week_to_display: "Veuillez sélectionner une semaine pour afficher les données.", error_structure: "Erreur: Structure de données non définie.", no_data_to_display_filters: "Aucune donnée à afficher avec les filtres actuels.", save_row_title: "Enregistrer cette ligne", invalid_row: "Ligne invalide.", error_saving_row: "Erreur enregistrement ligne: {error}", no_rows_to_save: "Aucune ligne affichée à enregistrer.", confirm_save_all: "Confirmer l'enregistrement des {count} lignes affichées pour la S{week}?", save_all_cancelled: "Enregistrement annulé.", saving_all_displayed: "Enregistrement des {count} lignes en cours...", save_all_success: "{count} lignes enregistrées avec succès.", save_all_partial: "Enregistrement terminé: {success} succès, {error} erreurs.", generating_word: "Génération de {count} document(s) Word...", generating_word_success: "{count} document(s) Word généré(s).", generating_word_partial: "Génération Word terminée: {ok} succès, {err} erreurs.", generating_word_failed: "Échec de la génération Word ({err} erreurs).", generating_excel: "Génération du fichier Excel S{week}...", generating_excel_success: "Fichier Excel '{filename}' généré.", error_generating_excel: "Erreur génération Excel: {error}", no_file_selected: "Aucun fichier sélectionné.", reading_file: "Lecture du fichier {fileName}...", file_read_success: "Fichier {fileName} lu ({count} lignes).", file_error: "Erreur lecture fichier: {error}", invalid_file_type: "Type de fichier invalide (.xlsx ou .xls requis).", saving_uploaded_data: "Enregistrement des données chargées pour S{week}...", uploaded_data_saved: "Données chargées enregistrées pour S{week}.", uploaded_data_error: "Erreur enregistrement données chargées: {error}", no_word_dates: "Génération Word: Dates manquantes côté serveur pour la semaine S{week}.",
                generate_ai_lesson_plan_button: "Plan de Leçon (IA)", generating_ai_lesson_plan: "Génération du plan de leçon IA...", error_generating_ai_lesson_plan: "Erreur génération plan IA: {error}", ai_lesson_plan_generated: "Plan de leçon IA généré.", quota_exceeded: "⚠️ Quota API épuisé ! La limite d'utilisation gratuite de l'IA a été atteinte aujourd'hui. Veuillez réessayer demain ou contacter l'administrateur.",
                generate_weekly_lessons_button: "Générer Plans de Leçons (Semaine)", generating_weekly_lessons: "Génération des plans de leçons pour la semaine...", weekly_lessons_generated: "Plans de leçons hebdomadaires générés.",
                admin_report_class_label: "Choisir une Classe :", generate_full_report_button: "Générer Rapport Complet par Classe", loading_classes: "-- Chargement des classes --", select_report_class: "-- Sélectionnez une classe pour le rapport --", no_classes_found: "-- Aucune classe trouvée --", generating_full_report: "Génération du rapport complet pour la classe {classe}...", generating_full_report_success: "Rapport complet pour {classe} généré.", generating_full_report_error: "Erreur génération du rapport pour {classe}: {error}", please_select_class_for_report: "Veuillez sélectionner une classe pour générer le rapport."
            },
            ar: { 
                login_title: "تسجيل الدخول", login_username_label: "اسم المستخدم (المعلم):", login_password_label: "كلمة المرور (نفس الاسم):", login_button_text: "تسجيل الدخول", remember_me: "تذكرني", logout_button: "تسجيل الخروج", main_page_title: "الخطط الأسبوعية", week_label: "الأسبوع:", select_week: "-- اختر أسبوع --", please_select_week: "يرجى اختيار أسبوع.", admin_actions_title: "إجراءات المسؤول", admin_excel_label: "ملف اكسل:", admin_save_button: "تحميل وحفظ في قاعدة البيانات", generate_word_button: "إنشاء ملف وورد حسب الفصل", generate_excel_button: "إنشاء ملف اكسل (ملف واحد)", save_all_button: "حفظ الصفوف المعروضة", filter_teacher_label: "المعلم:", filter_class_label: "الفصل:", filter_material_label: "المادة:", filter_period_label: "الحصة:", filter_day_label: "اليوم:", all: "الكل", all_f: "الكل", day_sun: "الأحد", day_mon: "الاثنين", day_tue: "الثلاثاء", day_wed: "الأربعاء", day_thu: "الخميس", days: ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس"], fullDays: ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس"], months: ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"], headers: { 'Leçon': 'الدرس', 'Travaux de classe': 'أعمال الفصل', 'Support': 'الدعم', 'Devoirs': 'الواجبات', 'Enseignant': 'المعلم', 'Classe': 'الفصل', 'Matière': 'المادة', 'Période': 'الحصة', 'Jour': 'اليوم' }, actions: "إجراءات", updated_at: "آخر تحديث", notes_for_class: "ملاحظات للفصل:", select_class: "-- اختر فصل --", select_class_placeholder: "اختر فصلًا لعرض أو إضافة ملاحظات...", notes_placeholder: "ملاحظات ل {classText}...", save_notes_button: "حفظ الملاحظات", saving: "جاري الحفظ...", saved: "تم الحفظ", saving_notes_for: "جاري حفظ الملاحظات ل {class} أسبوع {week}", notes_saved_success: "تم حفظ الملاحظات ل {class}، أسبوع {week}.", error_saving_notes: "خطأ في حفظ الملاحظات: {error}", display_incomplete: "إظهار غير المكتمل", hide_incomplete: "إخفاء غير المكتمل", incomplete_teachers_title: "المعلمون غير المكتملين", loading: "جاري التحميل...", no_data: "لا توجد بيانات.", all_complete: "الكل مكتمل!", error_config_columns: "خطأ في إعداد الأعمدة.", welcome_user: "مرحباً {user}! يرجى اختيار أسبوع.", connected_as: "متصل: {user}", loading_data_week: "جاري تحميل بيانات الأسبوع {week}...", data_loaded_week: "تم تحميل بيانات الأسبوع {week}.", no_data_found_week: "لم يتم العثور على بيانات للأسبوع {week}.", error_loading_week: "خطأ في تحميل الأسبوع {week}: {error}", select_week_to_display: "يرجى اختيار أسبوع لعرض البيانات.", error_structure: "خطأ: هيكل البيانات غير محدد.", no_data_to_display_filters: "لا توجد بيانات لعرضها مع الفلاتر الحالية.", save_row_title: "حفظ هذا السطر", invalid_row: "سطر غير صالح.", error_saving_row: "خطأ في حفظ السطر: {error}", no_rows_to_save: "لا توجد أسطر معروضة للحفظ.", confirm_save_all: "تأكيد حفظ {count} أسطر معروضة للأسبوع {week}؟", save_all_cancelled: "تم إلغاء الحفظ.", saving_all_displayed: "جاري حفظ {count} أسطر...", save_all_success: "تم حفظ {count} أسطر بنجاح.", save_all_partial: "اكتمل الحفظ: {success} نجاح، {error} أخطاء.", generating_word: "جاري إنشاء {count} مستند (مستندات) وورد...", generating_word_success: "تم إنشاء {count} مستند (مستندات) وورد.", generating_word_partial: "اكتمل إنشاء الوورد: {ok} نجاح، {err} أخطاء.", generating_word_failed: "فشل إنشاء الوورد ({err} أخطاء).", generating_excel: "جاري إنشاء ملف اكسل للأسبوع {week}...", generating_excel_success: "تم إنشاء ملف اكسل '{filename}'.", error_generating_excel: "خطأ في إنشاء اكسل: {error}", no_file_selected: "لم يتم اختيار ملف.", reading_file: "قراءة الملف {fileName}...", file_read_success: "تمت قراءة الملف {fileName} ({count} أسطر).", file_error: "خطأ في قراءة الملف: {error}", invalid_file_type: "نوع الملف غير صالح (مطلوب .xlsx أو .xls).", saving_uploaded_data: "جاري حفظ البيانات المحملة للأسبوع {week}...", uploaded_data_saved: "تم حفظ البيانات المحملة للأسبوع {week}.", uploaded_data_error: "خطأ في حفظ البيانات المحملة: {error}", no_word_dates: "توليد وورد: التواريخ مفقودة على الخادم للأسبوع {week}.",
                generate_ai_lesson_plan_button: "خطة الدرس (AI)", generating_ai_lesson_plan: "جاري إنشاء خطة الدرس بالذكاء الاصطناعي...", error_generating_ai_lesson_plan: "خطأ في إنشاء خطة الدرس بالذكاء الاصطناعي: {error}", ai_lesson_plan_generated: "تم إنشاء خطة الدرس بالذكاء الاصطناعي.", quota_exceeded: "⚠️ تم استنفاد حصة API! تم الوصول إلى حد الاستخدام المجاني للذكاء الاصطناعي اليوم. يرجى المحاولة غدًا أو الاتصال بالمسؤول.",
                generate_weekly_lessons_button: "إنشاء خطط دروس الأسبوع", generating_weekly_lessons: "جاري إنشاء خطط دروس الأسبوع...", weekly_lessons_generated: "تم إنشاء خطط دروس الأسبوع.",
                admin_report_class_label: "اختر فصل:", generate_full_report_button: "إنشاء تقرير كامل حسب الفصل", loading_classes: "-- جاري تحميل الفصول --", select_report_class: "-- اختر فصل للتقرير --", no_classes_found: "-- لم يتم العثور على فصول --", generating_full_report: "جاري إنشاء التقرير الكامل للفصل {classe}...", generating_full_report_success: "تم إنشاء التقرير الكامل للفصل {classe}.", generating_full_report_error: "خطأ في إنشاء التقرير للفصل {classe}: {error}", please_select_class_for_report: "يرجى اختيار فصل لإنشاء التقرير."
            },
            en: { 
                login_title: "Login", login_username_label: "Username (Teacher):", login_password_label: "Password (same as Name):", login_button_text: "Login", remember_me: "Remember me", logout_button: "Logout", main_page_title: "Weekly Plans", week_label: "Week:", select_week: "-- Select a week --", please_select_week: "Please select a week.", admin_actions_title: "Administrator Actions", admin_excel_label: "Excel File:", admin_save_button: "Load and Save to DB", generate_word_button: "Generate Word by Class", generate_excel_button: "Generate Excel (1 File)", save_all_button: "Save Displayed Rows", filter_teacher_label: "Teacher:", filter_class_label: "Class:", filter_material_label: "Subject:", filter_period_label: "Period:", filter_day_label: "Day:", all: "All", all_f: "All", day_sun: "Sunday", day_mon: "Monday", day_tue: "Tuesday", day_wed: "Wednesday", day_thu: "Thursday", days: ["Sun", "Mon", "Tue", "Wed", "Thu"], fullDays: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday"], months: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"], headers: { 'Leçon': 'Lesson', 'Travaux de classe': 'Classwork', 'Support': 'Support', 'Devoirs': 'Homework', 'Enseignant': 'Teacher', 'Classe': 'Class', 'Matière': 'Subject', 'Période': 'Period', 'Jour': 'Day' }, actions: "Actions", updated_at: "Updated At", notes_for_class: "Notes for class:", select_class: "-- Select a class --", select_class_placeholder: "Select a class to view or add notes...", notes_placeholder: "Notes for {classText}...", save_notes_button: "Save Notes", saving: "Saving...", saved: "Saved", saving_notes_for: "Saving notes for {class} W{week}", notes_saved_success: "Notes saved for {class}, W{week}.", error_saving_notes: "Error saving notes: {error}", display_incomplete: "Show Incomplete", hide_incomplete: "Hide Incomplete", incomplete_teachers_title: "Incomplete Teachers", loading: "Loading...", no_data: "No data.", all_complete: "All complete!", error_config_columns: "Column config error.", welcome_user: "Welcome {user}! Please select a week.", connected_as: "Connected: {user}", loading_data_week: "Loading data W{week}...", data_loaded_week: "Data W{week} loaded.", no_data_found_week: "No data found for W{week}.", error_loading_week: "Error loading W{week}: {error}", select_week_to_display: "Please select a week to display data.", error_structure: "Error: Data structure undefined.", no_data_to_display_filters: "No data to display with current filters.", save_row_title: "Save this row", invalid_row: "Invalid row.", error_saving_row: "Error saving row: {error}", no_rows_to_save: "No displayed rows to save.", confirm_save_all: "Confirm saving the {count} displayed rows for W{week}?", save_all_cancelled: "Save cancelled.", saving_all_displayed: "Saving {count} rows...", save_all_success: "{count} rows saved successfully.", save_all_partial: "Save complete: {success} success, {error} errors.", generating_word: "Generating {count} Word document(s)...", generating_word_success: "{count} Word document(s) generated.", generating_word_partial: "Word generation complete: {ok} success, {err} errors.", generating_word_failed: "Word generation failed ({err} errors).", generating_excel: "Generating Excel file W{week}...", generating_excel_success: "Excel file '{filename}' generated.", error_generating_excel: "Error generating Excel: {error}", no_file_selected: "No file selected.", reading_file: "Reading file {fileName}...", file_read_success: "File {fileName} read ({count} rows).", file_error: "Error reading file: {error}", invalid_file_type: "Invalid file type (requires .xlsx or .xls).", saving_uploaded_data: "Saving uploaded data for W{week}...", uploaded_data_saved: "Uploaded data saved for W{week}.", uploaded_data_error: "Error saving uploaded data: {error}", no_word_dates: "Word generation: Server-side dates missing for week W{week}.",
                generate_ai_lesson_plan_button: "Lesson Plan (AI)", generating_ai_lesson_plan: "Generating AI lesson plan...", error_generating_ai_lesson_plan: "Error generating AI lesson plan: {error}", ai_lesson_plan_generated: "AI lesson plan generated.", quota_exceeded: "⚠️ API Quota Exceeded! The free AI usage limit has been reached today. Please try again tomorrow or contact the administrator.",
                generate_weekly_lessons_button: "Generate Weekly Lesson Plans", generating_weekly_lessons: "Generating weekly lesson plans...", weekly_lessons_generated: "Weekly lesson plans generated.",
                admin_report_class_label: "Choose a Class:", generate_full_report_button: "Generate Full Report by Class", loading_classes: "-- Loading classes --", select_report_class: "-- Select a class for the report --", no_classes_found: "-- No classes found --", generating_full_report: "Generating full report for class {classe}...", generating_full_report_success: "Full report for {classe} generated.", generating_full_report_error: "Error generating report for {classe}: {error}", please_select_class_for_report: "Please select a class to generate the report."
            }
        };
        const t = (key, params = {}) => { let text = translations[currentUserLanguage]?.[key] || translations.fr[key] || key; for (const p in params) { text = text.replace(`{${p}}`, params[p]); } return text; };

        // Ordre/Traductions Classes (Maternelle, Primaire, Collège, Lycée)
        const classOrder = ["PS", "MS", "GS", "PP1", "PP2", "PP3", "PP4", "PP5", "PEI1", "PEI2", "PEI3", "PEI4", "PEI5", "DP1", "DP2"];
        const classTranslations = { 
            'PS': 'الروضة الصغرى',
            'MS': 'الروضة المتوسطة',
            'GS': 'الروضة الكبرى',
            'PP1': 'الابتدائي الأول',
            'PP2': 'الابتدائي الثاني',
            'PP3': 'الابتدائي الثالث',
            'PP4': 'الابتدائي الرابع',
            'PP5': 'الابتدائي الخامس',
            'PEI1': 'السادس', 
            'PEI2': 'الاول متوسط', 
            'PEI3': 'الثاني متوسط', 
            'PEI4': 'الثالث متوسط', 
            'PEI5': 'الأول ثانوي', 
            'DP1': 'الثاني ثانوي', 
            'DP2': 'الثالث ثانوي' 
        };
        function getClassLabel(cls) {
            const ar = classTranslations[cls];
            return ar ? `${ar} (${cls})` : cls;
        }
        function getClassCanonicalIndex(cls) {
            if (!cls) return 999;
            const norm = normalizeClassString(cls);
            if (!norm) return 999;
            const orderCodes = ["ps", "ms", "gs", "pp1", "pp2", "pp3", "pp4", "pp5", "pei1", "pei2", "pei3", "pei4", "pei5", "dp1", "dp2"];
            const directIdx = orderCodes.indexOf(norm);
            if (directIdx !== -1) return directIdx;
            for (let i = 0; i < canonicalClassEquivalents.length; i++) {
                const grp = canonicalClassEquivalents[i];
                if (norm === grp.code || grp.names.some(n => {
                    const nNorm = normalizeClassString(n);
                    return norm === nNorm || (nNorm.length > 1 && (norm.includes(nNorm) || nNorm.includes(norm)));
                })) {
                    const idx = orderCodes.indexOf(grp.code);
                    return idx !== -1 ? idx : i;
                }
            }
            return 999;
        }

        function compareClasses(a, b) {
            const idxA = getClassCanonicalIndex(a);
            const idxB = getClassCanonicalIndex(b);
            if (idxA !== 999 && idxB !== 999) {
                if (idxA !== idxB) return idxA - idxB;
            } else if (idxA !== 999) {
                return -1;
            } else if (idxB !== 999) {
                return 1;
            }
            return String(a || '').localeCompare(String(b || ''), 'fr', { sensitivity: 'base' });
        }

        const canonicalClassEquivalents = [
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

        function normalizeClassString(str) {
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

        function isClassMatch(classA, classB) {
            if (!classA || !classB) return false;
            const a = String(classA).trim();
            const b = String(classB).trim();
            if (a.toLowerCase() === b.toLowerCase()) return true;

            const normA = normalizeClassString(a);
            const normB = normalizeClassString(b);
            if (!normA || !normB) return false;
            if (normA === normB) return true;

            if (normA.includes(normB) || normB.includes(normA)) return true;

            for (const group of canonicalClassEquivalents) {
                const matchA = (normA === group.code) || group.names.some(n => {
                    const nNorm = normalizeClassString(n);
                    return normA === nNorm || normA.includes(nNorm) || nNorm.includes(normA);
                });
                const matchB = (normB === group.code) || group.names.some(n => {
                    const nNorm = normalizeClassString(n);
                    return normB === nNorm || normB.includes(nNorm) || nNorm.includes(normB);
                });
                if (matchA && matchB) return true;
            }
            return false;
        }

        function getCanonicalClassCode(str) {
            if (!str) return '';
            const s = String(str).trim();
            const match = s.match(/\b(PEI[1-5]|DP[1-2]|PP[1-5]|PS|MS|GS)\b/i);
            if (match) return match[1].toUpperCase();
            const norm = normalizeClassString(s);
            for (const group of canonicalClassEquivalents) {
                if (norm === group.code || group.names.some(n => {
                    const nNorm = normalizeClassString(n);
                    return norm === nNorm || (nNorm.length > 1 && (norm.includes(nNorm) || nNorm.includes(norm)));
                })) {
                    return group.code.toUpperCase();
                }
            }
            return s.replace(/\s*(garçons|garcons|filles|primaire)\s*/gi, '').trim();
        }

        function normalizeClientName(str) {
            if (!str) return '';
            let s = String(str).trim();
            s = s.replace(/[\u064B-\u0652\u0640]/g, '');
            s = s.replace(/[أإآٱ]/g, 'ا');
            s = s.replace(/ى/g, 'ي');
            s = s.replace(/ة/g, 'ه');
            s = s.replace(/ؤ/g, 'و');
            s = s.replace(/ئ/g, 'ي');
            s = s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
            return s.toLowerCase().replace(/\s+/g, ' ');
        }

        function renderParentClassButtons() {
            const container = document.getElementById('parent-class-buttons');
            if (!container) return;
            const classes = getSectionClasses(currentSection);
            if (!classes.includes(currentActiveClassName)) {
                currentActiveClassName = classes[0];
            }
            container.innerHTML = classes.map(cls => {
                const isActive = (cls === currentActiveClassName);
                const label = getClassLabel(cls);
                return `<button class="pro-button ${isActive ? 'primary-button active' : ''}" onclick="loadClassStudents('${cls}')">${label}</button>`;
            }).join(' ');
        }

        function updateClassDropdowns() {
            const classes = getSectionClasses(currentSection);
            
            // Parent Class Selector
            const parentClassSel = document.getElementById('parentClassSelector');
            if (parentClassSel) {
                const prevVal = parentClassSel.value;
                parentClassSel.innerHTML = classes.map(cls => `<option value="${cls}">${getClassLabel(cls)}</option>`).join('');
                if (classes.includes(prevVal)) {
                    parentClassSel.value = prevVal;
                } else {
                    parentClassSel.value = classes[0];
                }
            }
            
            // Teacher Filter Class
            const teacherFilter = document.getElementById('teacherFilterClass');
            if (teacherFilter) {
                const prevVal = teacherFilter.value;
                let html = '<option value="all">Toutes les classes</option>';
                html += classes.map(cls => `<option value="${cls}">${getClassLabel(cls)}</option>`).join('');
                teacherFilter.innerHTML = html;
                if (prevVal === 'all' || classes.includes(prevVal)) {
                    teacherFilter.value = prevVal;
                }
            }
            
            // Admin Student Class Filter
            const adminStudClassFilter = document.getElementById('adminStudentClassFilter');
            const adminSelectedSection = document.getElementById('adminStudentSectionFilter')?.value || currentSection;
            const adminClasses = getSectionClasses(adminSelectedSection);
            if (adminStudClassFilter) {
                const prevVal = adminStudClassFilter.value;
                let html = '<option value="all">-- Toutes les classes --</option>';
                html += adminClasses.map(cls => `<option value="${cls}">${getClassLabel(cls)}</option>`).join('');
                adminStudClassFilter.innerHTML = html;
                if (prevVal === 'all' || adminClasses.includes(prevVal)) {
                    adminStudClassFilter.value = prevVal;
                }
            }
        }

        // Dates et Configuration des 38 semaines de l'année scolaire 2026/2027
        let weeksConfig = {
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

        const specificWeekDateRanges = {};
        for (const [wNum, wData] of Object.entries(weeksConfig)) {
          specificWeekDateRanges[wNum] = { start: wData.start, end: wData.end };
        }

        function formatWeekDateRangeText(weekNum) {
          const w = weeksConfig[weekNum] || { title: `Semaine ${weekNum}`, titleAr: `الأسبوع ${weekNum}`, start: '', end: '' };
          const title = (isArabicUser() ? (w.titleAr || `الأسبوع ${weekNum}`) : (w.title || `Semaine ${weekNum}`));
          if (!w.start || !w.end) return title;
          try {
            const s = new Date(w.start + 'T00:00:00Z');
            const e = new Date(w.end + 'T00:00:00Z');
            const monthsFr = ["Janv.", "Févr.", "Mars", "Avr.", "Mai", "Juin", "Juil.", "Août", "Sept.", "Oct.", "Nov.", "Déc."];
            const monthsAr = ["جانفي", "فيفري", "مارس", "أفريل", "ماي", "جوان", "جويلية", "أوت", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
            if (isArabicUser()) {
              return `${title} (${s.getUTCDate()} ${monthsAr[s.getUTCMonth()]} - ${e.getUTCDate()} ${monthsAr[e.getUTCMonth()]})`;
            }
            return `${title} (${s.getUTCDate()} ${monthsFr[s.getUTCMonth()]} - ${e.getUTCDate()} ${monthsFr[e.getUTCMonth()]})`;
          } catch(err) {
            return `${title} (${w.start} - ${w.end})`;
          }
        }

        async function fetchWeeksConfiguration() {
          try {
            const res = await fetch('/api/weeks-config');
            if (res.ok) {
              const data = await res.json();
              if (data && data.weeks) {
                weeksConfig = { ...weeksConfig, ...data.weeks };
                for (const [wNum, wData] of Object.entries(weeksConfig)) {
                  specificWeekDateRanges[wNum] = { start: wData.start, end: wData.end };
                }
              }
            }
          } catch (e) {
            console.warn('Erreur chargement weeks-config depuis le serveur, utilisation de la config locale:', e);
          }
          populateMainWeekSelector();
          populateParentWeekSelector();
          populateAdminUploadWeekSelector();
          populateAdminWeekSelectToEdit();
          renderAdminWeeksTable();
        }

        function populateAdminUploadWeekSelector() {
          const sel = document.getElementById('adminUploadWeekSelect');
          const rangeFrom = document.getElementById('uploadRangeFromWeek');
          const rangeTo = document.getElementById('uploadRangeToWeek');
          const grid = document.getElementById('uploadWeeksCheckboxesGrid');
          const specialWeekSel = document.getElementById('specialDayWeek');
          
          const sortedWeekNums = Object.keys(weeksConfig).map(n => parseInt(n, 10)).sort((a, b) => a - b);
          let optionsHtml = '';
          sortedWeekNums.forEach(wNum => {
            const label = formatWeekDateRangeText(wNum);
            optionsHtml += `<option value="${wNum}">${label}</option>`;
          });

          if (sel) {
            const currentVal = sel.value;
            sel.innerHTML = optionsHtml;
            if (currentVal && weeksConfig[currentVal]) {
              sel.value = currentVal;
            } else if (currentWeek && weeksConfig[currentWeek]) {
              sel.value = currentWeek;
            }
          }

          if (rangeFrom) {
            const curFrom = rangeFrom.value || "1";
            rangeFrom.innerHTML = optionsHtml;
            rangeFrom.value = curFrom;
          }
          if (rangeTo) {
            const curTo = rangeTo.value || "38";
            rangeTo.innerHTML = optionsHtml;
            rangeTo.value = curTo;
          }

          if (specialWeekSel) {
            const curSpec = specialWeekSel.value || (currentWeek || "1");
            specialWeekSel.innerHTML = optionsHtml;
            specialWeekSel.value = curSpec;
          }

          if (grid) {
            let gridHtml = '';
            for (let i = 1; i <= 38; i++) {
              gridHtml += `
                <label style="display:flex; align-items:center; gap:4px; font-size:0.8rem; font-weight:700; color:#334155; padding:4px 6px; border-radius:6px; background:#F8FAFC; border:1px solid #E2E8F0; cursor:pointer; user-select:none;">
                  <input type="checkbox" class="upload-week-checkbox" value="${i}" onchange="updateUploadTargetInfo()" style="cursor:pointer;">
                  <span>S${i}</span>
                </label>
              `;
            }
            grid.innerHTML = gridHtml;
          }

          updateUploadTargetInfo();
        }

        function toggleUploadWeekMode(mode) {
          const singleBox = document.getElementById('uploadModeSingleContainer');
          const multiBox = document.getElementById('uploadModeMultipleContainer');
          const rangeBox = document.getElementById('uploadModeRangeContainer');

          if (singleBox) singleBox.style.display = (mode === 'single') ? 'block' : 'none';
          if (multiBox) multiBox.style.display = (mode === 'multiple') ? 'block' : 'none';
          if (rangeBox) rangeBox.style.display = (mode === 'range') ? 'block' : 'none';

          updateUploadTargetInfo();
        }

        function selectUploadWeeksPreset(preset) {
          const checkboxes = document.querySelectorAll('.upload-week-checkbox');
          checkboxes.forEach(cb => {
            const wNum = parseInt(cb.value, 10);
            if (preset === 'all') {
              cb.checked = true;
            } else if (preset === 'p1') {
              cb.checked = (wNum >= 1 && wNum <= 12);
            } else if (preset === 'p2') {
              cb.checked = (wNum >= 13 && wNum <= 24);
            } else if (preset === 'p3') {
              cb.checked = (wNum >= 25 && wNum <= 38);
            } else if (preset === 'none') {
              cb.checked = false;
            }
          });
          updateUploadTargetInfo();
        }

        function getUploadTargetWeeks() {
          const modeRadio = document.querySelector('input[name="uploadWeekMode"]:checked');
          const mode = modeRadio ? modeRadio.value : 'single';

          if (mode === 'single') {
            const sel = document.getElementById('adminUploadWeekSelect');
            const mainSel = document.getElementById('weekSelector');
            const val = (sel && sel.value) ? parseInt(sel.value, 10) : (mainSel ? parseInt(mainSel.value, 10) : null);
            return val ? [val] : [];
          } else if (mode === 'multiple') {
            const checked = [];
            document.querySelectorAll('.upload-week-checkbox:checked').forEach(cb => {
              const num = parseInt(cb.value, 10);
              if (!isNaN(num)) checked.push(num);
            });
            checked.sort((a, b) => a - b);
            return checked;
          } else if (mode === 'range') {
            const fromSel = document.getElementById('uploadRangeFromWeek');
            const toSel = document.getElementById('uploadRangeToWeek');
            const fromW = fromSel ? parseInt(fromSel.value, 10) : 1;
            const toW = toSel ? parseInt(toSel.value, 10) : 38;
            const minW = Math.min(fromW, toW);
            const maxW = Math.max(fromW, toW);
            const range = [];
            for (let i = minW; i <= maxW; i++) {
              range.push(i);
            }
            return range;
          }
          return [];
        }

        function updateUploadTargetInfo() {
          const weeks = getUploadTargetWeeks();
          const countEl = document.getElementById('uploadMultiSelectedCount');
          const summaryEl = document.getElementById('uploadTargetSummaryText');
          const secSelect = document.getElementById('adminUploadSectionSelect');
          const sec = secSelect ? secSelect.value : (currentSection || 'garcons');
          const secBadge = (sec === 'garcons') 
            ? '<span style="background:#DBEAFE; color:#1D4ED8; padding:2px 8px; border-radius:6px; font-weight:700;">👦 Section Garçons</span>' 
            : (sec === 'primaire' 
              ? '<span style="background:#FEF3C7; color:#B45309; padding:2px 8px; border-radius:6px; font-weight:700;">👶🎒 Section Primaire & Maternelle</span>' 
              : '<span style="background:#FCE7F3; color:#BE185D; padding:2px 8px; border-radius:6px; font-weight:700;">👧 Section Filles</span>');

          if (countEl) {
            countEl.textContent = `${weeks.length} semaine(s) sélectionnée(s)`;
          }

          if (summaryEl) {
            if (weeks.length === 0) {
              summaryEl.innerHTML = `<span style="color:#EF4444;"><i class="fas fa-exclamation-triangle"></i> Aucune semaine sélectionnée</span> pour la ${secBadge}.`;
            } else if (weeks.length === 1) {
              summaryEl.innerHTML = `<i class="fas fa-shield-alt" style="color:#10B981;"></i> L'import s'enregistrera <strong>UNIQUEMENT</strong> dans la ${secBadge} pour la <strong>Semaine S${weeks[0]}</strong> (les 2 autres sections restent strictement inchangées).`;
            } else {
              const weeksList = weeks.length <= 8 ? weeks.map(w => `S${w}`).join(', ') : `S${weeks[0]}...S${weeks[weeks.length-1]} (${weeks.length} semaines)`;
              summaryEl.innerHTML = `<i class="fas fa-shield-alt" style="color:#10B981;"></i> L'import s'enregistrera <strong>UNIQUEMENT</strong> dans la ${secBadge} sur <strong>${weeks.length} semaines</strong> (${weeksList}) (les 2 autres sections restent strictement inchangées).`;
            }
          }
        }

        function populateMainWeekSelector() {
          const sel = document.getElementById('weekSelector');
          if (!sel) return;
          const currentVal = sel.value;
          const defaultText = t('select_week') || '-- Sélectionnez une semaine --';
          
          let html = `<option value="">${defaultText}</option>`;
          const sortedWeekNums = Object.keys(weeksConfig).map(n => parseInt(n, 10)).sort((a, b) => a - b);
          
          sortedWeekNums.forEach(wNum => {
            const label = formatWeekDateRangeText(wNum);
            html += `<option value="${wNum}">${label}</option>`;
          });
          
          sel.innerHTML = html;
          if (currentVal && weeksConfig[currentVal]) {
            sel.value = currentVal;
          }
        }

        function populateAdminWeekSelectToEdit() {
          const sel = document.getElementById('adminWeekSelectToEdit');
          if (!sel) return;
          const currentVal = sel.value || "1";
          let html = '';
          const sortedWeekNums = Object.keys(weeksConfig).map(n => parseInt(n, 10)).sort((a, b) => a - b);
          sortedWeekNums.forEach(wNum => {
            const w = weeksConfig[wNum];
            html += `<option value="${wNum}">Semaine ${wNum} : ${w?.title || ''} (${w?.start || ''} au ${w?.end || ''})</option>`;
          });
          sel.innerHTML = html;
          sel.value = weeksConfig[currentVal] ? currentVal : (sortedWeekNums[0] || "1");
          onAdminSelectWeekToEdit();
        }

        function onAdminSelectWeekToEdit() {
          const sel = document.getElementById('adminWeekSelectToEdit');
          if (!sel) return;
          const wNum = sel.value;
          const w = weeksConfig[wNum];
          if (w) {
            const titleInput = document.getElementById('adminWeekTitleInput');
            const titleArInput = document.getElementById('adminWeekTitleArInput');
            const startInput = document.getElementById('adminWeekStartDateInput');
            const endInput = document.getElementById('adminWeekEndDateInput');
            if (titleInput) titleInput.value = w.title || `Semaine ${wNum}`;
            if (titleArInput) titleArInput.value = w.titleAr || `الأسبوع ${wNum}`;
            if (startInput) startInput.value = w.start || '';
            if (endInput) endInput.value = w.end || '';
          }
        }

        async function adminSaveSingleWeekConfig() {
          const sel = document.getElementById('adminWeekSelectToEdit');
          const statusDiv = document.getElementById('adminWeekConfigStatus');
          const wNum = sel?.value;
          if (!wNum) return;

          const title = document.getElementById('adminWeekTitleInput')?.value?.trim();
          const titleAr = document.getElementById('adminWeekTitleArInput')?.value?.trim();
          const start = document.getElementById('adminWeekStartDateInput')?.value?.trim();
          const end = document.getElementById('adminWeekEndDateInput')?.value?.trim();

          if (!title || !start || !end) {
            if (statusDiv) statusDiv.innerHTML = '<span style="color:#EF4444;"><i class="fas fa-exclamation-circle"></i> Veuillez renseigner le titre et les deux dates (du ... au ...).</span>';
            return;
          }

          if (statusDiv) statusDiv.innerHTML = '<span style="color:#2563EB;"><i class="fas fa-spinner fa-spin"></i> Enregistrement en cours...</span>';

          try {
            const res = await fetch('/api/admin/weeks-config', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ week: wNum, title, titleAr, start, end })
            });
            const data = await res.json();
            if (res.ok && data.success) {
              weeksConfig[wNum] = {
                title: title,
                titleAr: titleAr || `الأسبوع ${wNum}`,
                start: start,
                end: end
              };
              specificWeekDateRanges[wNum] = { start, end };
              
              if (statusDiv) {
                statusDiv.innerHTML = `<span style="color:#10B981;"><i class="fas fa-check-circle"></i> Semaine ${wNum} mise à jour avec succès ! (${start} au ${end})</span>`;
                setTimeout(() => { if (statusDiv) statusDiv.innerHTML = ''; }, 4000);
              }
              
              populateMainWeekSelector();
              populateParentWeekSelector();
              populateAdminWeekSelectToEdit();
              renderAdminWeeksTable();
              if (currentWeek && String(currentWeek) === String(wNum)) {
                updateDynamicUIElements();
              }
              displayAlert(`Semaine ${wNum} mise à jour avec succès !`, false);
            } else {
              throw new Error(data.message || 'Erreur enregistrement');
            }
          } catch (err) {
            console.error('Erreur adminSaveSingleWeekConfig:', err);
            if (statusDiv) statusDiv.innerHTML = `<span style="color:#EF4444;"><i class="fas fa-times-circle"></i> Erreur: ${err.message}</span>`;
          }
        }

        async function adminResetWeeksToDefault() {
          const confirmReset = confirm('Êtes-vous sûr de vouloir réinitialiser toutes les 38 semaines aux dates officielles du calendrier scolaire 2026/2027 ?');
          if (!confirmReset) return;

          const statusDiv = document.getElementById('adminWeekConfigStatus');
          if (statusDiv) statusDiv.innerHTML = '<span style="color:#2563EB;"><i class="fas fa-spinner fa-spin"></i> Réinitialisation du calendrier...</span>';

          try {
            const res = await fetch('/api/admin/weeks-config', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ resetToDefault: true })
            });
            const data = await res.json();
            if (res.ok && data.success) {
              if (data.weeks) {
                weeksConfig = { ...data.weeks };
                for (const [wNum, wData] of Object.entries(weeksConfig)) {
                  specificWeekDateRanges[wNum] = { start: wData.start, end: wData.end };
                }
              }
              if (statusDiv) {
                statusDiv.innerHTML = '<span style="color:#10B981;"><i class="fas fa-check-circle"></i> Calendrier scolaire 2026/2027 réinitialisé avec succès !</span>';
                setTimeout(() => { if (statusDiv) statusDiv.innerHTML = ''; }, 4000);
              }
              populateMainWeekSelector();
              populateParentWeekSelector();
              populateAdminWeekSelectToEdit();
              renderAdminWeeksTable();
              if (currentWeek) updateDynamicUIElements();
              displayAlert('Calendrier réinitialisé avec succès !', false);
            } else {
              throw new Error(data.message || 'Erreur réinitialisation');
            }
          } catch (err) {
            console.error('Erreur adminResetWeeksToDefault:', err);
            if (statusDiv) statusDiv.innerHTML = `<span style="color:#EF4444;"><i class="fas fa-times-circle"></i> Erreur: ${err.message}</span>`;
          }
        }

        function renderAdminWeeksTable() {
          const container = document.getElementById('weeksTableContainer');
          if (!container) return;

          const sortedWeekNums = Object.keys(weeksConfig).map(n => parseInt(n, 10)).sort((a, b) => a - b);
          if (sortedWeekNums.length === 0) {
            container.innerHTML = '<p style="text-align:center; padding:15px; color:#64748B;">Aucune semaine configurée.</p>';
            return;
          }

          let html = `
            <table class="users-table" style="width:100%; border-collapse:collapse; font-size:0.88rem;">
              <thead>
                <tr style="background:#F1F5F9; color:#1E293B; border-bottom:2px solid #CBD5E1; text-align:left;">
                  <th style="padding:8px 12px; width:60px;">#</th>
                  <th style="padding:8px 12px;">Titre (Français)</th>
                  <th style="padding:8px 12px;">Titre (Arabe)</th>
                  <th style="padding:8px 12px;">Date Début (Du)</th>
                  <th style="padding:8px 12px;">Date Fin (Au)</th>
                  <th style="padding:8px 12px; text-align:center; width:90px;">Action</th>
                </tr>
              </thead>
              <tbody>
          `;

          sortedWeekNums.forEach(wNum => {
            const w = weeksConfig[wNum];
            html += `
              <tr style="border-bottom:1px solid #E2E8F0; hover:background:#F8FAFC;">
                <td style="padding:8px 12px; font-weight:700; color:#2563EB;">S${wNum}</td>
                <td style="padding:8px 12px; font-weight:600; color:#1E1B4B;">${w.title || `Semaine ${wNum}`}</td>
                <td style="padding:8px 12px; font-weight:600; color:#4338CA;" dir="rtl">${w.titleAr || `الأسبوع ${wNum}`}</td>
                <td style="padding:8px 12px; color:#0F766E;"><i class="far fa-calendar-alt"></i> ${w.start || '-'}</td>
                <td style="padding:8px 12px; color:#0F766E;"><i class="far fa-calendar-check"></i> ${w.end || '-'}</td>
                <td style="padding:8px 12px; text-align:center;">
                  <button type="button" class="pro-button primary-button" onclick="selectWeekForEditing(${wNum})" style="padding:4px 8px; font-size:0.8rem;">
                    <i class="fas fa-edit"></i> Modifier
                  </button>
                </td>
              </tr>
            `;
          });

          html += `
              </tbody>
            </table>
          `;
          container.innerHTML = html;
        }

        function selectWeekForEditing(wNum) {
          const sel = document.getElementById('adminWeekSelectToEdit');
          if (sel) {
            sel.value = String(wNum);
            onAdminSelectWeekToEdit();
            sel.scrollIntoView({ behavior: 'smooth', block: 'center' });
            sel.focus();
          }
        }

        // --- Utilitaires ---
        function escapeHtml(str) {
            if (str === null || str === undefined) return '';
            return String(str)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#039;');
        }
        window.escapeHtml = escapeHtml;
        window.escapeHTML = escapeHtml;
        function showProgressBar(initialText = '') { 
            const container = document.getElementById('progress-bar-container'); 
            const bar = document.getElementById('progress-bar');
            const sub = document.getElementById('progress-bar-subtext');
            if (container) container.style.display = 'block'; 
            if (bar) {
                bar.style.width = '0%'; 
                bar.textContent = '0%'; 
            }
            if (sub) {
                if (initialText) {
                    sub.textContent = initialText;
                    sub.style.display = 'block';
                } else {
                    sub.textContent = '';
                    sub.style.display = 'none';
                }
            }
        }
        function updateProgressBar(p, text = '') { 
            const clampedP = Math.min(100, Math.max(0, p)); 
            const bar = document.getElementById('progress-bar');
            const sub = document.getElementById('progress-bar-subtext');
            if (bar) {
                bar.style.width = clampedP + '%'; 
                bar.textContent = clampedP + '%'; 
            }
            if (sub) {
                if (text) {
                    sub.textContent = text;
                    sub.style.display = 'block';
                }
            }
        }
        function hideProgressBar() { 
            setTimeout(() => { 
                const container = document.getElementById('progress-bar-container');
                const sub = document.getElementById('progress-bar-subtext');
                if (container) container.style.display = 'none'; 
                if (sub) sub.style.display = 'none';
            }, 800); 
        }
        function displayAlert(msgKey, isErr = false, params = {}) { if (!msgKey) { const div=document.getElementById('message-alerte'); div.style.display='none'; div.textContent=''; div.className=''; if(alertTimeoutId) clearTimeout(alertTimeoutId); alertTimeoutId = null; return; } const msg = t(msgKey, params); console.log(`Alert:${isErr?'ERR':'OK'}-${msg}`); const div=document.getElementById('message-alerte'); div.textContent=msg; div.className = isErr ? 'alert-error' : (msgKey.includes('warn') || msgKey.includes('partial') ? 'alert-warning' : 'alert-success'); div.classList.add('message-alert-base'); div.style.display='block'; if(alertTimeoutId) clearTimeout(alertTimeoutId); alertTimeoutId=setTimeout(()=>{ if(div.textContent===msg){div.style.display='none'; div.textContent=''; div.className='';} alertTimeoutId=null; }, isErr ? 8000 : 5000); }
        function setButtonLoading(btnId, isLoading, iconClass) { const btn=document.getElementById(btnId); if(!btn) return; btn.disabled=isLoading; const icon=btn.querySelector('i'); if(icon) icon.className=isLoading ? 'fas fa-spinner fa-spin' : iconClass; }
        function containsArabic(text) { if (typeof text !== 'string') return false; const arabicRegex = /[\u0600-\u06FF]/; return arabicRegex.test(text); }
        function applyRTLToElement(element, content) { if (containsArabic(content)) { element.classList.add('arabic-content'); } else { element.classList.remove('arabic-content'); } }
        function formatDateForDisplay(d) { if (!d || isNaN(d.getTime())) return "Invalid Date"; const dayIndex = d.getUTCDay(); if (dayIndex === 5) { console.warn(`⚠️ Vendredi détecté (${d.toISOString().split('T')[0]}), remplacement par Jeudi`); d.setUTCDate(d.getUTCDate() - 1); } else if (dayIndex === 6) { console.warn(`⚠️ Samedi détecté (${d.toISOString().split('T')[0]}), remplacement par Dimanche suivant`); d.setUTCDate(d.getUTCDate() + 1); } const days = translations[currentUserLanguage].fullDays || translations.fr.fullDays; const months = translations[currentUserLanguage].months || translations.fr.months; const correctedDayIndex = d.getUTCDay(); const dayName = days[correctedDayIndex] || `Jour ${correctedDayIndex}`; const dayOfMonth = String(d.getUTCDate()).padStart(2, '0'); const monthName = months[d.getUTCMonth()]; const year = d.getUTCFullYear(); if (currentUserLanguage === 'en') { return `${dayName}, ${monthName} ${dayOfMonth}, ${year}`; } else { return `${dayName} ${dayOfMonth} ${monthName} ${year}`; } }
        
        const fieldKeyAliases = {
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

        const findHKey = (targetHeader) => {
            if (!targetHeader) return null;
            const targetLower = targetHeader.trim().toLowerCase();
            const targetNorm = targetLower.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
            if (headers && headers.length > 0) {
                const direct = headers.find(h => h && h.trim().toLowerCase() === targetLower);
                if (direct) return direct;
                const normH = headers.find(h => h && h.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '') === targetNorm);
                if (normH) return normH;
                const aliases = fieldKeyAliases[targetNorm] || [];
                const aliasH = headers.find(h => {
                    if (!h) return false;
                    const hNorm = h.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
                    return aliases.includes(hNorm);
                });
                if (aliasH) return aliasH;
            }
            return targetHeader;
        };

        function getRowField(row, fieldName, fallback = '') {
            if (!row || typeof row !== 'object') return fallback;
            if (row[fieldName] !== undefined && row[fieldName] !== null) return row[fieldName];
            
            const targetLower = String(fieldName).trim().toLowerCase();
            const targetNorm = targetLower.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
            const keys = Object.keys(row);
            
            // 1. Direct match case-insensitive
            const directKey = keys.find(k => k.trim().toLowerCase() === targetLower);
            if (directKey && row[directKey] !== undefined && row[directKey] !== null) return row[directKey];
            
            // 2. Normalized match
            const normKey = keys.find(k => k.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '') === targetNorm);
            if (normKey && row[normKey] !== undefined && row[normKey] !== null) return row[normKey];
            
            // 3. Aliases
            const aliases = fieldKeyAliases[targetNorm] || [];
            for (const k of keys) {
                const kNorm = k.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
                if (aliases.includes(kNorm) && row[k] !== undefined && row[k] !== null) {
                    return row[k];
                }
            }
            return fallback;
        }

        function normalizeDayName(dayStr) {
            if (!dayStr || typeof dayStr !== 'string') return null;
            const trimmed = dayStr.trim();
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
                if (lower.startsWith(k.toLowerCase())) return v;
            }
            const parsed = parseDateFromJourColumn(trimmed);
            if (parsed) {
                const dayNames = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];
                return dayNames[parsed.getUTCDay()];
            }
            return null;
        }

        function getDateForDayName(dayNameFrench) { if(!weekStartDate || isNaN(weekStartDate.getTime())) return null; const dayMapFr = {"Dimanche":0, "Lundi":1, "Mardi":2, "Mercredi":3, "Jeudi":4}; const offset = dayMapFr[dayNameFrench]; if(offset === undefined) return null; const dt = new Date(Date.UTC(weekStartDate.getUTCFullYear(), weekStartDate.getUTCMonth(), weekStartDate.getUTCDate())); dt.setUTCDate(dt.getUTCDate() + offset); return dt; }
        function parseDateFromJourColumn(jourValue) { if (!jourValue || typeof jourValue !== 'string') return null; const trimmed = jourValue.trim(); const dayMapFr = {"Dimanche":0, "Lundi":1, "Mardi":2, "Mercredi":3, "Jeudi":4}; if (dayMapFr.hasOwnProperty(trimmed)) { return getDateForDayName(trimmed); } const frenchDateRegex = /^(Dimanche|Lundi|Mardi|Mercredi|Jeudi)\s+(\d{1,2})\s+(Janvier|Février|Mars|Avril|Mai|Juin|Juillet|Août|Septembre|Octobre|Novembre|Décembre)\s+(\d{4})$/i; const frenchMatch = trimmed.match(frenchDateRegex); if (frenchMatch) { const day = parseInt(frenchMatch[2], 10); const monthNames = ["Janvier","Février","Mars","Avril","Mai","Juin","Juillet","Août","Septembre","Octobre","Novembre","Décembre"]; const month = monthNames.findIndex(m => m.toLowerCase() === frenchMatch[3].toLowerCase()); const year = parseInt(frenchMatch[4], 10); if (month !== -1) { return new Date(Date.UTC(year, month, day)); } } const frenchDateNoDay = /^(\d{1,2})\s+(Janvier|Février|Mars|Avril|Mai|Juin|Juillet|Août|Septembre|Octobre|Novembre|Décembre)\s+(\d{4})$/i; const noDayMatch = trimmed.match(frenchDateNoDay); if (noDayMatch) { const day = parseInt(noDayMatch[1], 10); const monthNames = ["Janvier","Février","Mars","Avril","Mai","Juin","Juillet","Août","Septembre","Octobre","Novembre","Décembre"]; const month = monthNames.findIndex(m => m.toLowerCase() === noDayMatch[2].toLowerCase()); const year = parseInt(noDayMatch[3], 10); if (month !== -1) { return new Date(Date.UTC(year, month, day)); } } const isoRegex = /^(\d{4})-(\d{2})-(\d{2})$/; const isoMatch = trimmed.match(isoRegex); if (isoMatch) { const year = parseInt(isoMatch[1], 10); const month = parseInt(isoMatch[2], 10) - 1; const day = parseInt(isoMatch[3], 10); return new Date(Date.UTC(year, month, day)); } const dmyRegex = /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/; const dmyMatch = trimmed.match(dmyRegex); if (dmyMatch) { const day = parseInt(dmyMatch[1], 10); const month = parseInt(dmyMatch[2], 10) - 1; const year = parseInt(dmyMatch[3], 10); return new Date(Date.UTC(year, month, day)); } const numValue = parseFloat(trimmed); if (!isNaN(numValue) && numValue > 0) { const excelEpoch = new Date(Date.UTC(1899, 11, 30)); const date = new Date(excelEpoch.getTime() + numValue * 86400000); if (!isNaN(date.getTime())) { return date; } } try { const attemptDate = new Date(trimmed); if (!isNaN(attemptDate.getTime())) { return attemptDate; } } catch (e) {} return null; }
        function extractDayName(jourValue) { if (!jourValue || typeof jourValue !== 'string') return null; const trimmed = jourValue.trim(); const dayNames = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi"]; if (dayNames.includes(trimmed)) { return trimmed; } const frenchDateRegex = /^(Dimanche|Lundi|Mardi|Mercredi|Jeudi)\s+/i; const match = trimmed.match(frenchDateRegex); if (match) { return match[1]; } const parsed = parseDateFromJourColumn(trimmed); if (parsed) { return dayNames[parsed.getUTCDay()]; } return null; }
        function formatUpdatedAt(dS) { if(!dS) return ''; try{const d=new Date(dS); if(isNaN(d.getTime())) return ''; return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`; } catch(e){return '';} }

        // --- Fonctions Admin ---
        function handleFileUpload(event) { const file = event.target.files[0]; const statusSpan = document.getElementById('file-upload-status'); const saveBtn = document.getElementById('saveUploadedDataBtn'); uploadedPlanData = null; saveBtn.disabled = true; statusSpan.textContent = ''; if (!file) { statusSpan.textContent = t('no_file_selected'); return; } console.log(`[Admin Upload] Fichier: ${file.name}`); statusSpan.textContent = t('reading_file', { fileName: file.name }); if (!/\.(xlsx|xls)$/i.test(file.name)) { displayAlert("invalid_file_type", true); statusSpan.textContent = "Type invalide."; event.target.value = ''; return; } const reader = new FileReader(); reader.onload = function(e) { try { const data = e.target.result; const workbook = XLSX.read(data, { type: 'array' }); const firstSheetName = workbook.SheetNames[0]; const worksheet = workbook.Sheets[firstSheetName]; const jsonDataRaw = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: null, raw: false }); if (!jsonDataRaw || jsonDataRaw.length < 1) throw new Error("Feuille Excel vide."); const headersRaw = jsonDataRaw[0]; if (!headersRaw || !Array.isArray(headersRaw) || headersRaw.length === 0) throw new Error("En-têtes non trouvés."); const extractedHeaders = headersRaw.map(h => h ? String(h).trim().replace(/\s+/g, ' ') : null).filter(Boolean); if (extractedHeaders.length === 0) throw new Error("Aucun en-tête valide."); const dataRows = jsonDataRaw.slice(1); uploadedPlanData = dataRows.map((row) => { if (!Array.isArray(row)) return null; const obj = {}; extractedHeaders.forEach((header, index) => { obj[header] = (row && index < row.length) ? row[index] : null; }); return Object.values(obj).some(val => val != null && String(val).trim() !== '') ? obj : null; }).filter(Boolean); console.log(`[Admin Upload] ${uploadedPlanData.length} lignes extraites.`); statusSpan.textContent = t('file_read_success', { count: uploadedPlanData.length }).replace(file.name, ''); displayAlert('file_read_success', false, { fileName: file.name, count: uploadedPlanData.length }); saveBtn.disabled = false; } catch (error) { console.error("Erreur lecture Excel:", error); displayAlert('file_error', true, { error: error.message }); statusSpan.textContent = t('file_error', { error: '' }).replace(': {error}', '.'); uploadedPlanData = null; saveBtn.disabled = true; event.target.value = ''; } }; reader.onerror = function(e) { console.error("Erreur FileReader:", e); displayAlert('file_error', true, { error: "Erreur FileReader" }); statusSpan.textContent = t('file_error', { error: '' }).replace(': {error}', '.'); uploadedPlanData = null; saveBtn.disabled = true; event.target.value = ''; }; reader.readAsArrayBuffer(file); }
        async function saveUploadedData() {
            const targetWeeks = (typeof getUploadTargetWeeks === 'function') ? getUploadTargetWeeks() : [];
            const adminSectionSelect = document.getElementById('adminUploadSectionSelect');
            const targetSection = (adminSectionSelect && adminSectionSelect.value) ? adminSectionSelect.value : (currentSection || 'garcons');
            const statusSpan = document.getElementById('file-upload-status');

            if (!targetWeeks || targetWeeks.length === 0) {
                displayAlert("please_select_week", true);
                if (statusSpan) statusSpan.innerHTML = '<span style="color:#EF4444;"><i class="fas fa-exclamation-circle"></i> Veuillez sélectionner au moins une semaine.</span>';
                return;
            }
            if (!uploadedPlanData || uploadedPlanData.length === 0) {
                displayAlert("no_data_to_save", true);
                if (statusSpan) statusSpan.innerHTML = '<span style="color:#EF4444;"><i class="fas fa-exclamation-circle"></i> Aucun fichier Excel chargé ou fichier vide.</span>';
                return;
            }

            const secLabel = targetSection === 'garcons' ? 'Garçons 👦' : (targetSection === 'primaire' ? 'Primaire & Maternelle 👶🎒' : 'Filles 👧');
            const isMulti = targetWeeks.length > 1;
            const weeksStr = isMulti ? `${targetWeeks.length} semaines (${targetWeeks.map(w => `S${w}`).join(', ')})` : `Semaine S${targetWeeks[0]}`;

            console.log(`[Admin Save] Enregistrement ${uploadedPlanData.length} lignes pour ${weeksStr} (Section ${targetSection}).`);
            displayAlert(`Enregistrement en cours pour ${weeksStr} (${secLabel})...`, false);
            setButtonLoading('saveUploadedDataBtn', true, 'fas fa-database');
            showProgressBar();
            updateProgressBar(15);

            try {
                const cleanData = uploadedPlanData.map(row => {
                    if (!row || typeof row !== 'object') return null;
                    return { ...row, _section: targetSection };
                }).filter(Boolean);

                let response, result;
                if (isMulti) {
                    response = await fetch('/api/save-multiple-weeks', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ weeks: targetWeeks, data: cleanData, section: targetSection })
                    });
                } else {
                    response = await fetch('/api/save-plan', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ week: targetWeeks[0], data: cleanData, section: targetSection })
                    });
                }

                updateProgressBar(85);
                result = await response.json();
                if (!response.ok) throw new Error(result.message || `Erreur serveur ${response.status}`);
                updateProgressBar(100);

                const successMsg = isMulti 
                    ? `Données appliquées avec succès sur ${targetWeeks.length} semaines pour la section ${secLabel} !`
                    : `Données de la semaine S${targetWeeks[0]} pour la section ${secLabel} enregistrées avec succès !`;

                displayAlert(successMsg, false);
                if (statusSpan) statusSpan.innerHTML = `<span style="color:#10B981;"><i class="fas fa-check-circle"></i> ${successMsg}</span>`;
                
                uploadedPlanData = null;
                const fileInputEl = document.getElementById('excelFileInput');
                if (fileInputEl) fileInputEl.value = '';
                const saveBtn = document.getElementById('saveUploadedDataBtn');
                if (saveBtn) saveBtn.disabled = true;
                
                if (targetSection === currentSection && targetWeeks.map(String).includes(String(currentWeek))) {
                    console.log("[Admin Save] Rechargement automatique de la semaine courante...");
                    await fetchPlanData(currentWeek);
                }
            } catch (error) {
                console.error("Erreur enregistrement upload:", error);
                displayAlert('uploaded_data_error', true, { error: error.message });
                if (statusSpan) statusSpan.innerHTML = `<span style="color:#EF4444;"><i class="fas fa-times-circle"></i> Erreur: ${error.message}</span>`;
                updateProgressBar(0);
            } finally {
                hideProgressBar();
                setButtonLoading('saveUploadedDataBtn', false, 'fas fa-database');
            }
        }
        async function populateAdminReportClassSelector() { const select = document.getElementById('adminReportClassSelector'); if (!select) return; select.innerHTML = `<option value="">${t('loading_classes')}</option>`; select.disabled = true; try { const response = await fetch(`/api/all-classes?section=${currentSection}`); if (!response.ok) throw new Error(`Erreur serveur ${response.status}`); const classes = await response.json(); if (classes && classes.length > 0) { select.innerHTML = `<option value="">${t('select_report_class')}</option>`; classes.sort(compareClasses).forEach(cls => { const opt = document.createElement('option'); opt.value = cls; const ar = classTranslations[cls]; opt.textContent = ar ? `${ar} (${cls})` : cls; select.appendChild(opt); }); select.disabled = false; } else { select.innerHTML = `<option value="">${t('no_classes_found')}</option>`; } } catch (error) { console.error("Erreur chargement des classes pour le rapport:", error); select.innerHTML = `<option value="">Erreur chargement</option>`; displayAlert('error', true, { error: 'Erreur chargement des classes.' }); } }
        async function generateFullReportByClass() { const classSelector = document.getElementById('adminReportClassSelector'); const selectedClass = classSelector.value; if (!selectedClass) { displayAlert('please_select_class_for_report', true); return; } console.log(`Demande de rapport complet pour la classe : ${selectedClass}`); displayAlert('generating_full_report', false, { classe: selectedClass }); setButtonLoading('generateFullReportBtn', true, 'fas fa-file-invoice'); showProgressBar(); updateProgressBar(10); try { const response = await fetch('/api/full-report-by-class', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ classe: selectedClass }) }); updateProgressBar(80); if (response.ok) { const blob = await response.blob(); const contentDisposition = response.headers.get('content-disposition'); let filename = `Rapport_Complet_${selectedClass}.xlsx`; if (contentDisposition) { const filenameMatch = contentDisposition.match(/filename="?(.+?)"?(;|$)/i); if (filenameMatch && filenameMatch[1]) { filename = filenameMatch[1]; } } saveAs(blob, filename); updateProgressBar(100); displayAlert('generating_full_report_success', false, { classe: selectedClass }); } else { const errorResult = await response.json().catch(() => ({ message: "Erreur inconnue du serveur." })); throw new Error(errorResult.message || `Erreur serveur ${response.status}`); } } catch (error) { console.error('Erreur lors de la génération du rapport complet:', error); displayAlert('generating_full_report_error', true, { classe: selectedClass, error: error.message }); updateProgressBar(0); } finally { hideProgressBar(); setButtonLoading('generateFullReportBtn', false, 'fas fa-file-invoice'); } }
        
        function populateNotesClassSelector() {
            const sel = document.getElementById('notesClassSelector');
            const txt = document.getElementById('notesInput');
            const btn = document.getElementById('saveNotesBtn');
            if (!sel) return;
            sel.innerHTML = `<option value="">${t('select_class')}</option>`;
            const clsK = findHKey('Classe');
            const ensK = findHKey('Enseignant');
            if (!clsK || !planData || planData.length === 0) {
                if (txt) { txt.disabled = true; txt.placeholder = t('no_data'); }
                if (btn) btn.disabled = true;
                return;
            }
            let teacherData = planData;
            const isTeacherOnly = loggedInUser && !isUserAdminOrSupervisor(loggedInUser, currentUserRole);
            if (isTeacherOnly && ensK) {
                teacherData = planData.filter(i => {
                    if (!i || !i[ensK]) return false;
                    return isRowForLoggedInTeacher(i[ensK], loggedInUser, loggedInTeacherTable);
                });
            }
            const uniqueCls = [...new Set(teacherData.map(i => i[clsK]).filter(Boolean))].sort(compareClasses);
            uniqueCls.forEach(cls => {
                const opt = document.createElement('option');
                opt.value = cls;
                const ar = classTranslations[cls];
                opt.textContent = ar ? `${ar} (${cls})` : cls;
                sel.appendChild(opt);
            });
            if (txt) { txt.value = ''; txt.disabled = true; txt.placeholder = t('select_class_placeholder'); }
            if (btn) btn.disabled = true;
        }
        function displayClassNotes() {
            const sel = document.getElementById('notesClassSelector');
            const txt = document.getElementById('notesInput');
            const btn = document.getElementById('saveNotesBtn');
            const photoInput = document.getElementById('notesPhotoUrlInput');
            const selCls = sel.value;
            if (selCls && weeklyClassNotes) {
                const note = weeklyClassNotes[selCls];
                txt.value = note || '';
                txt.disabled = false;
                btn.disabled = false;
                applyRTLToElement(txt, note || "");
                const selText = sel.options[sel.selectedIndex].text;
                txt.placeholder = t('notes_placeholder', { classText: selText });
                if (photoInput) {
                    const currentPhoto = (typeof weeklyClassNotesPhotos !== 'undefined' && weeklyClassNotesPhotos[selCls]) || '';
                    photoInput.value = currentPhoto;
                    photoInput.disabled = false;
                    previewNotesPhoto();
                }
            } else {
                txt.value = '';
                txt.disabled = true;
                btn.disabled = true;
                txt.placeholder = selCls ? t('no_data') : t('select_class_placeholder');
                if (photoInput) {
                    photoInput.value = '';
                    photoInput.disabled = true;
                    previewNotesPhoto();
                }
            }
            document.getElementById('notes-save-status').textContent = '';
        }

        function previewNotesPhoto() {
            const input = document.getElementById('notesPhotoUrlInput');
            const preview = document.getElementById('notesPhotoPreview');
            const img = document.getElementById('notesPhotoPreviewImg');
            if (!input || !preview || !img) return;
            const val = input.value.trim();
            if (val) {
                const formatted = (typeof formatDriveImageUrl === 'function') ? formatDriveImageUrl(val) : val;
                img.src = formatted;
                preview.style.display = 'flex';
            } else {
                preview.style.display = 'none';
                img.src = '';
            }
        }
        window.previewNotesPhoto = previewNotesPhoto;

        function clearNotesPhoto() {
            const input = document.getElementById('notesPhotoUrlInput');
            if (input) {
                input.value = '';
                previewNotesPhoto();
            }
        }
        window.clearNotesPhoto = clearNotesPhoto;

        async function saveNotes() {
            const statusEl = document.getElementById('notes-save-status');
            const classSel = document.getElementById('notesClassSelector');
            const selCls = classSel.value;
            if (!selCls) { displayAlert("select_class", true); return; }
            if (!currentWeek) { displayAlert("please_select_week", true); return; }
            statusEl.textContent = t('saving');
            displayAlert('');
            setButtonLoading('saveNotesBtn', true, 'fas fa-save');
            const notesVal = document.getElementById('notesInput').value;
            const photoVal = document.getElementById('notesPhotoUrlInput')?.value?.trim() || '';
            console.log(t('saving_notes_for', { class: selCls, week: currentWeek }));
            try {
                const response = await fetch('/api/save-notes', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        week: currentWeek,
                        classe: selCls,
                        notes: notesVal,
                        photoUrl: photoVal,
                        section: currentSection
                    })
                });
                const result = await response.json();
                if (!response.ok) { throw new Error(result.message || `Erreur ${response.status}`); }
                weeklyClassNotes[selCls] = notesVal;
                if (typeof weeklyClassNotesPhotos !== 'undefined') {
                    weeklyClassNotesPhotos[selCls] = photoVal;
                }
                displayAlert('notes_saved_success', false, { class: selCls, week: currentWeek });
                statusEl.textContent = t('saved');
                setTimeout(() => { statusEl.textContent = ''; }, 3000);
            } catch (error) {
                console.error('Err saveNotes:', error);
                displayAlert('error_saving_notes', true, { error: error.message });
                statusEl.textContent = `${t('error_saving_notes', { error: '' }).replace(': {error}', '')}: ${error.message}`;
            } finally {
                setButtonLoading('saveNotesBtn', false, 'fas fa-save');
            }
        }
        function getCurrentWeekNumber(refDate = new Date()) {
            const date = new Date(refDate);
            // Si c'est Jeudi après 15h00, Vendredi ou Samedi : la semaine d'affichage courante bascule sur la semaine scolaire suivante (du Dimanche au Jeudi prochain)
            const dayOfWeek = date.getDay(); // 0: Dimanche, 1: Lundi, ..., 4: Jeudi, 5: Vendredi, 6: Samedi
            const hours = date.getHours();

            let targetSunday = new Date(date);
            targetSunday.setHours(0, 0, 0, 0);

            if (dayOfWeek === 4) { // Jeudi
                if (hours >= 15) {
                    // À partir de Jeudi 15:00, basculer sur le dimanche prochain (+3 jours)
                    targetSunday.setDate(targetSunday.getDate() + 3);
                } else {
                    // Avant 15:00, on est dans la semaine actuelle (dimanche passé -4 jours)
                    targetSunday.setDate(targetSunday.getDate() - 4);
                }
            } else if (dayOfWeek === 5) { // Vendredi
                // Basculer sur le dimanche prochain (+2 jours)
                targetSunday.setDate(targetSunday.getDate() + 2);
            } else if (dayOfWeek === 6) { // Samedi
                // Basculer sur le dimanche prochain (+1 jour)
                targetSunday.setDate(targetSunday.getDate() + 1);
            } else { // Dimanche (0) à Mercredi (3)
                // Le dimanche de début de la semaine actuelle
                targetSunday.setDate(targetSunday.getDate() - dayOfWeek);
            }

            const y = targetSunday.getFullYear();
            const m = String(targetSunday.getMonth() + 1).padStart(2, '0');
            const d = String(targetSunday.getDate()).padStart(2, '0');
            const targetSundayStr = `${y}-${m}-${d}`;

            const config = (typeof weeksConfig !== 'undefined' && weeksConfig && Object.keys(weeksConfig).length > 0)
                ? weeksConfig
                : (typeof specificWeekDateRanges !== 'undefined' ? specificWeekDateRanges : {});

            const sortedWeeks = Object.keys(config)
                .map(k => parseInt(k, 10))
                .filter(n => !isNaN(n))
                .sort((a, b) => a - b);

            if (sortedWeeks.length === 0) return 1;

            // Chercher la semaine dont la date de début correspond exactement au dimanche cible
            for (const weekNum of sortedWeeks) {
                if (config[weekNum]?.start === targetSundayStr) {
                    return weekNum;
                }
            }

            // Sinon chercher par plage inclusive
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

        // Pour les enseignants : sélectionne automatiquement par défaut la SEMAINE PROCHAINE (N+1) pour préparer les cours
        function getTeacherDefaultWeekNumber() {
            const currentW = getCurrentWeekNumber();
            const maxWeek = (typeof weeksConfig !== 'undefined' && Object.keys(weeksConfig).length > 0)
                ? Math.max(...Object.keys(weeksConfig).map(Number))
                : 38;
            if (typeof currentW === 'number' && !isNaN(currentW)) {
                return Math.min(currentW + 1, maxWeek);
            }
            return 1;
        }

        // Détermine le jour scolaire actif d'aujourd'hui pour les parents selon la règle :
        // - Lié à la date du jour (ex: si aujourd'hui est 13/09/2026 -> affiche par défaut ce jour : Dimanche à Jeudi)
        // - Vendredi : affiche un jour avant (Jeudi)
        // - Samedi : affiche un jour après (Dimanche : s'il est déjà disponible dans le plan, sinon Jeudi dernier)
        function getTodaySchoolDayName(classRows = null) {
            const today = new Date();
            const dayIdx = today.getDay(); // 0=Dimanche, 1=Lundi, 2=Mardi, 3=Mercredi, 4=Jeudi, 5=Vendredi, 6=Samedi
            const schoolDays = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi"];

            // Si aujourd'hui est entre Dimanche (0) et Jeudi (4) : affiche ce jour
            if (dayIdx >= 0 && dayIdx <= 4) {
                return schoolDays[dayIdx];
            }

            // Si aujourd'hui est Vendredi (5) : un jour avant -> Jeudi
            if (dayIdx === 5) {
                return "Jeudi";
            }

            // Si aujourd'hui est Samedi (6) : un jour après (Dimanche) s'il est déjà disponible, sinon Jeudi dernier
            if (dayIdx === 6) {
                const targetRows = (classRows && Array.isArray(classRows) && classRows.length > 0)
                    ? classRows
                    : (typeof parentRawPlanData !== 'undefined' && Array.isArray(parentRawPlanData) ? parentRawPlanData : []);

                if (targetRows && targetRows.length > 0) {
                    const hasSunday = targetRows.some(r => {
                        if (!r) return false;
                        const j = String(getRowField(r, 'Jour') || '').trim().toLowerCase();
                        const isSun = j.startsWith('dim') || j.includes('الأحد') || j.includes('dimanche');
                        if (!isSun) return false;
                        const lecon = String(getRowField(r, 'Leçon') || '').trim();
                        const dev = String(getRowField(r, 'Devoir') || getRowField(r, 'Devoirs') || '').trim();
                        const mat = String(getRowField(r, 'Matière') || '').trim();
                        return (lecon !== '' || dev !== '' || mat !== '');
                    });

                    if (hasSunday) {
                        return "Dimanche";
                    }
                }
                return "Jeudi";
            }

            return "Dimanche";
        }

        // Calcule la date initiale pour les devoirs (vendredi et samedi basculent automatiquement sur le jeudi précédent)
        function getInitialHomeworkDate() {
            const today = new Date();
            const dayIdx = today.getDay(); // 0=Dimanche, 5=Vendredi, 6=Samedi
            if (dayIdx === 5) { // Vendredi -> Jeudi (-1 jour)
                today.setDate(today.getDate() - 1);
            } else if (dayIdx === 6) { // Samedi -> Jeudi (-2 jours)
                today.setDate(today.getDate() - 2);
            }
            return today.toISOString().split('T')[0];
        }

        // Fonction pour envoyer des notifications push aux enseignants incomplets
        async function notifyIncompleteTeachers(week, incompleteTeachersInfo) {
            if (!week || !incompleteTeachersInfo || Object.keys(incompleteTeachersInfo).length === 0) {
                return;
            }

            try {
                // Convertir Set en Array pour l'API
                const teachersData = {};
                for (const [teacher, classesSet] of Object.entries(incompleteTeachersInfo)) {
                    teachersData[teacher] = Array.from(classesSet);
                }

                console.log(`🔔 Envoi de notifications aux enseignants incomplets:`, teachersData);

                const response = await fetch('/api/notify-incomplete-teachers', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        week: week,
                        incompleteTeachers: teachersData
                    })
                });

                if (response.ok) {
                    const result = await response.json();
                    console.log(`✅ Notifications envoyées: ${result.notificationsSent}/${result.totalIncomplete}`);
                } else {
                    console.warn(`⚠️ Erreur envoi notifications:`, await response.text());
                }
            } catch (error) {
                console.error('❌ Erreur lors de l\'envoi des notifications:', error);
            }
        }

        function checkAndDisplayIncompleteTeachers() { console.log("checkIncomplete"); incompleteTeachersInfo={}; const list=document.getElementById('incompleteList'); list.innerHTML=''; if(!planData||planData.length===0){list.innerHTML=`<li>${t('no_data')}</li>`; return;} const teacherKey=findHKey('Enseignant'); const classKey=findHKey('Classe'); const leconKey=findHKey('Leçon'); const taskKey=findHKey('Travaux de classe'); const supportKey=findHKey('Support'); const devoirsKey=findHKey('Devoirs'); if(!teacherKey||!classKey){console.warn("Manque cols Ens/Cls"); list.innerHTML=`<li>${t('error_config_columns')}</li>`; return;} planData.forEach(item=>{const teacher=item[teacherKey]; const clsName=item[classKey]; if(!teacher||!clsName) return; const leconVal=item[leconKey]; const taskVal=item[taskKey]; const supportVal=item[supportKey]; const devoirsVal=item[devoirsKey]; const isLeconEmpty=(leconVal==null||String(leconVal).trim()===''); const isTaskEmpty=(taskVal==null||String(taskVal).trim()===''); const isSupportEmpty=(supportVal==null||String(supportVal).trim()===''); const isDevoirsEmpty=(devoirsVal==null||String(devoirsVal).trim()===''); if(isLeconEmpty&&isTaskEmpty&&isSupportEmpty&&isDevoirsEmpty){if(!incompleteTeachersInfo[teacher]){incompleteTeachersInfo[teacher]=new Set();} incompleteTeachersInfo[teacher].add(clsName);}}); let teachers=Object.keys(incompleteTeachersInfo); const isAdmin=(isUserAdminOrSupervisor(loggedInUser, currentUserRole) || loggedInUser==='Mohamed'||loggedInUser==='Zohra'||loggedInUser==='Imad'); if(!isAdmin&&loggedInUser){teachers=teachers.filter(t=>t===loggedInUser);} if(teachers.length===0){list.innerHTML=`<li>${t('all_complete')}</li>`;} else { teachers.sort().forEach(teacher=>{ const classes=[...incompleteTeachersInfo[teacher]].sort().join(', '); const li=document.createElement('li'); li.innerHTML = `<span class="incomplete-teacher-name">${teacher}</span> (<span class="incomplete-class-list">${classes}</span>)`; list.appendChild(li); }); } }
        function toggleIncompleteList() { const listDiv=document.getElementById('incompleteTeachersDisplay'); const btn=document.getElementById('toggleIncompleteBtn'); const btnTextSpan = btn.querySelector('.btn-text'); if(listDiv.style.display==='none'||listDiv.style.display===''){ listDiv.style.display='block'; btn.querySelector('i').className = 'fas fa-xmark'; if(btnTextSpan) btnTextSpan.textContent = t('hide_incomplete'); } else { listDiv.style.display='none'; btn.querySelector('i').className = 'fas fa-list-check'; if(btnTextSpan) btnTextSpan.textContent = t('display_incomplete'); } }
        async function fetchPlanData(week) { 
            if (!week || isNaN(parseInt(week, 10))) { 
                console.warn("fetchPlanData sans semaine valide."); 
                displayPlanTable([]); 
                document.getElementById('weekDateRange').textContent = t('please_select_week'); 
                return; 
            } 
            if (!loggedInUser) { 
                console.warn("Tentative chargement non connecté."); 
                displayAlert("login_title", true); 
                return; 
            } 
            console.log(`fetchPlanData S${week} (${currentSection}) pour ${loggedInUser}, crossSection=${showCrossSectionView}`); 
            displayAlert('loading_data_week', false, { week: week }); 
            showProgressBar(); 
            updateProgressBar(10); 
            currentWeek = week; 
            const weekNum = parseInt(week, 10); 
            const dateRangeEl = document.getElementById('weekDateRange'); 
            weekStartDate = null; 
            planData = []; 
            headers = []; 
            weeklyClassNotes = {}; 
            dateRangeEl.textContent = `${t('week_label')} ${week}: ${t('loading')}`; 
            displayPlanTable([]); 
            updateActionButtonsState(false); 
            updateCrossSectionToggleUI();

            const dates = specificWeekDateRanges[weekNum]; 
            if (dates?.start && dates?.end) {
                try {
                    const s = new Date(dates.start + 'T00:00:00Z'); 
                    const e = new Date(dates.end + 'T00:00:00Z'); 
                    if (!isNaN(s.getTime()) && !isNaN(e.getTime())) { 
                        weekStartDate = s; 
                        dateRangeEl.textContent = `${t('week_label')} ${week} : ${isArabicUser() ? 'من' : (currentUserLanguage === 'en' ? 'from' : 'du')} ${formatDateForDisplay(s)} ${isArabicUser() ? 'إلى' : (currentUserLanguage === 'en' ? 'to' : 'à')} ${formatDateForDisplay(e)}`;
                    } else throw new Error();
                } catch(e) {
                    dateRangeEl.textContent = `S ${week} (Err dates)`; 
                    weekStartDate = null;
                }
            } else {
                dateRangeEl.textContent = `${t('week_label')} ${week} (${t('no_data')}: dates non définies)`; 
                weekStartDate = null;
            } 
            updateProgressBar(30); 

            try {
                // 1. Charger les données de la section active
                const r = await fetch(`/api/plans/${week}?section=${currentSection}`); 
                updateProgressBar(60); 
                if (!r.ok) {
                    const d = await r.json().catch(() => null); 
                    throw new Error(d?.message || `Err ${r.status}`);
                } 
                const fetched = await r.json(); 
                let primaryRows = [];
                if (fetched && typeof fetched === 'object') {
                    primaryRows = fetched.planData || []; 
                    weeklyClassNotes = fetched.classNotes || {}; 
                    weeklyClassNotesPhotos = fetched.classNotesPhotos || {};
                    window.availableWeeklyPlans = fetched.availableWeeklyPlans || [];
                } 

                primaryRows.forEach(row => {
                    if (row) {
                        row._section = currentSection;
                        row.isReadOnlyCrossSection = false;
                    }
                });

                let combinedRows = [...primaryRows];

                // 2. Si la vue inter-section est activée, charger les données de l'autre section en lecture seule
                if (showCrossSectionView) {
                    const otherSection = (currentSection === 'garcons') ? 'filles' : 'garcons';
                    try {
                        const rOther = await fetch(`/api/plans/${week}?section=${otherSection}`);
                        if (rOther.ok) {
                            const fetchedOther = await rOther.json();
                            const otherRows = (fetchedOther && fetchedOther.planData) || [];
                            otherRows.forEach(row => {
                                if (row) {
                                    row._section = otherSection;
                                    row.isReadOnlyCrossSection = true;
                                }
                            });
                            combinedRows = combinedRows.concat(otherRows);
                        }
                    } catch (errOther) {
                        console.warn("Erreur chargement cross-section:", errOther);
                    }
                }

                planData = combinedRows;
                updateProgressBar(90); 

                if (planData.length > 0) {
                    const sample = planData.find(r => r && typeof r === 'object') || {};
                    headers = Object.keys(sample).filter(h => 
                        h !== '_id' && h !== 'id' && h !== '_originalCopy' && h !== 'lessonPlanId' && 
                        h !== '__v' && h !== '_section' && h !== 'isReadOnlyCrossSection' && !h.startsWith('_')
                    ); 
                    
                    if (loggedInUser === 'Imad') {
                        const enseignantKey = findHKey('Enseignant');
                        const originalCount = planData.length;
                        if (enseignantKey) {
                            planData = planData.filter(row => arabicTeachers.includes(row[enseignantKey]));
                            console.log(`[Imad Admin] Data filtered for Arabic teachers. ${planData.length}/${originalCount} rows remain.`);
                        }
                    } 
                    displayAlert('data_loaded_week', false, { week: week });
                } else {
                    headers = []; 
                    displayAlert('no_data_found_week', false, { week: week });
                } 

                createTableHeader(); 
                populateFilterOptions(); 
                populateNotesClassSelector(); 
                sortAndDisplay(); 
                displayClassNotes(); 
                checkAndDisplayIncompleteTeachers(); 
                updateActionButtonsState(planData.length > 0); 
                updateProgressBar(100); 
            } catch(e) { 
                console.error("Err fetchPlanData:", e); 
                displayAlert('error_loading_week', true, { week: week, error: e.message }); 
                planData = []; 
                headers = []; 
                weeklyClassNotes = {}; 
                createTableHeader(); 
                populateFilterOptions(); 
                populateNotesClassSelector(); 
                sortAndDisplay(); 
                displayClassNotes(); 
                checkAndDisplayIncompleteTeachers(); 
                updateProgressBar(0); 
                updateActionButtonsState(false); 
            } finally {
                hideProgressBar();
            } 
        }
        
        function makeTableColumnsResizable() {
            const table = document.getElementById('planTable');
            if (!table) return;
            const ths = table.querySelectorAll('thead th');
            ths.forEach(th => {
                const existing = th.querySelector('.col-resizer');
                if (existing) existing.remove();

                const resizer = document.createElement('div');
                resizer.className = 'col-resizer';
                th.appendChild(resizer);

                resizer.addEventListener('mousedown', function(e) {
                    e.preventDefault();
                    e.stopPropagation();
                    const startX = e.pageX;
                    const startWidth = th.offsetWidth;
                    resizer.classList.add('resizing');
                    document.body.style.cursor = 'col-resize';
                    document.body.style.userSelect = 'none';

                    function onMouseMove(e) {
                        const diffX = e.pageX - startX;
                        const newWidth = Math.max(50, startWidth + diffX);
                        th.style.width = newWidth + 'px';
                        th.style.minWidth = newWidth + 'px';
                    }

                    function onMouseUp() {
                        resizer.classList.remove('resizing');
                        document.body.style.cursor = '';
                        document.body.style.userSelect = '';
                        document.removeEventListener('mousemove', onMouseMove);
                        document.removeEventListener('mouseup', onMouseUp);
                    }

                    document.addEventListener('mousemove', onMouseMove);
                    document.addEventListener('mouseup', onMouseUp);
                });
            });

            if (window.syncPlanTableScrollDimensions) {
                window.syncPlanTableScrollDimensions();
            }
        }

        function initPlanTableScrollSync() {
            const topScroll = document.getElementById('planTableTopScrollbar');
            const topInner = document.getElementById('planTableTopScrollbarInner');
            const bottomScroll = document.getElementById('planTableResponsiveWrapper');
            const table = document.getElementById('planTable');

            if (!topScroll || !topInner || !bottomScroll || !table) return;

            window.syncPlanTableScrollDimensions = function() {
                const tableWidth = table.scrollWidth || table.offsetWidth;
                topInner.style.width = tableWidth + 'px';
                if (tableWidth <= bottomScroll.clientWidth + 5) {
                    topScroll.style.display = 'none';
                } else {
                    topScroll.style.display = 'block';
                }
            };

            let isSyncingTop = false;
            let isSyncingBottom = false;

            topScroll.addEventListener('scroll', () => {
                if (!isSyncingTop) {
                    isSyncingBottom = true;
                    bottomScroll.scrollLeft = topScroll.scrollLeft;
                }
                isSyncingTop = false;
            });

            bottomScroll.addEventListener('scroll', () => {
                if (!isSyncingBottom) {
                    isSyncingTop = true;
                    topScroll.scrollLeft = bottomScroll.scrollLeft;
                }
                isSyncingBottom = false;
            });

            window.addEventListener('resize', () => {
                if (window.syncPlanTableScrollDimensions) window.syncPlanTableScrollDimensions();
            });

            if (window.ResizeObserver) {
                const observer = new ResizeObserver(() => {
                    if (window.syncPlanTableScrollDimensions) window.syncPlanTableScrollDimensions();
                });
                observer.observe(table);
                observer.observe(bottomScroll);
            }

            setTimeout(() => {
                if (window.syncPlanTableScrollDimensions) window.syncPlanTableScrollDimensions();
            }, 300);
        }

        function createTableHeader() {
            const tHead = document.querySelector('#planTable thead tr');
            if (!tHead) return;
            tHead.innerHTML = '';
            const curH = headers || [];
            const hDisp = curH.filter(h => 
                h !== '_id' && h !== 'id' && h.toLowerCase() !== 'updatedat' && 
                h !== '_originalCopy' && h !== 'lessonPlanId' && h !== '__v' && 
                h !== '_section' && h !== 'isReadOnlyCrossSection' && !h.startsWith('_')
            );
            const headerTranslations = translations[currentUserLanguage]?.headers || translations.fr.headers;
            
            const isAr = (currentUserLanguage === 'ar' || arabicTeachers.includes(loggedInUser));
            const supportKey = findHKey('Support');

            if (hDisp.length > 0) {
                hDisp.forEach(h => {
                    if (isAr && h === supportKey) {
                        return;
                    }
                    
                    const th = document.createElement('th');
                    th.className = 'sortable-th';
                    th.style.cursor = 'pointer';
                    th.title = 'Cliquer pour trier par cette colonne';
                    
                    const getColIcon = (col) => {
                        const c = String(col).toLowerCase();
                        if (c.includes('enseign') || c.includes('معلم') || c.includes('teacher')) return '<i class="fas fa-chalkboard-teacher" style="margin-right:6px; color:#4F46E5;"></i>';
                        if (c.includes('class') || c.includes('صف') || c.includes('grade')) return '<i class="fas fa-graduation-cap" style="margin-right:6px; color:#059669;"></i>';
                        if (c.includes('mati') || c.includes('مادة') || c.includes('subject')) return '<i class="fas fa-book" style="margin-right:6px; color:#2563EB;"></i>';
                        if (c.includes('périod') || c.includes('period') || c.includes('حصة')) return '<i class="fas fa-clock" style="margin-right:6px; color:#D97706;"></i>';
                        if (c.includes('jour') || c.includes('يوم') || c.includes('day')) return '<i class="fas fa-calendar-day" style="margin-right:6px; color:#7C3AED;"></i>';
                        if (c.includes('leçon') || c.includes('lecon') || c.includes('درس') || c.includes('lesson')) return '<i class="fas fa-book-open" style="margin-right:6px; color:#0891B2;"></i>';
                        if (c.includes('trav') || c.includes('صفي') || c.includes('work')) return '<i class="fas fa-tasks" style="margin-right:6px; color:#64748B;"></i>';
                        if (c.includes('devoir') || c.includes('واجب') || c.includes('homework')) return '<i class="fas fa-pen-fancy" style="margin-right:6px; color:#16A34A;"></i>';
                        if (c.includes('support') || c.includes('وسائل') || c.includes('link')) return '<i class="fas fa-paperclip" style="margin-right:6px; color:#6B7280;"></i>';
                        return '';
                    };

                    const textSpan = document.createElement('span');
                    textSpan.innerHTML = `${getColIcon(h)}${escapeHtml(headerTranslations[h] || h)}`;
                    th.appendChild(textSpan);

                    const sortIcon = document.createElement('i');
                    if (currentSortColumn === h) {
                        sortIcon.className = (currentSortOrder === 'asc') ? 'fas fa-sort-up' : 'fas fa-sort-down';
                        sortIcon.style.marginLeft = '6px';
                        sortIcon.style.color = '#2563eb';
                    } else {
                        sortIcon.className = 'fas fa-sort';
                        sortIcon.style.marginLeft = '6px';
                        sortIcon.style.opacity = '0.35';
                    }
                    th.appendChild(sortIcon);

                    th.onclick = (e) => {
                        if (e.target.classList.contains('col-resizer')) return;
                        setSortColumn(h);
                    };

                    tHead.appendChild(th);
                });
                
                const actTh = document.createElement('th');
                actTh.innerHTML = `<i class="fas fa-sliders-h" style="margin-right:6px; color:#475569;"></i><span>${escapeHtml(t('actions'))}</span>`;
                actTh.classList.add('actions-column');
                tHead.appendChild(actTh);
                
                if (curH.some(h => h.toLowerCase() === 'updatedat')) {
                    const updTh = document.createElement('th');
                    updTh.innerHTML = `<i class="fas fa-history" style="margin-right:6px; color:#94A3B8;"></i><span>${escapeHtml(t('updated_at'))}</span>`;
                    updTh.classList.add('updated-at-column');
                    tHead.appendChild(updTh);
                }
            }
            const tBody = document.querySelector('#planTable tbody');
            if (tBody) tBody.innerHTML = '';
            makeTableColumnsResizable();
        }

        function updateFilterOptionDefaultTexts() { 
            const filters = [ 
                { selId: 'filterEnseignant', defaultKey: 'all' }, 
                { selId: 'filterClasse', defaultKey: 'all_f' }, 
                { selId: 'filterMatiere', defaultKey: 'all_f' }, 
                { selId: 'filterPeriode', defaultKey: 'all_f' }, 
                { selId: 'filterJour', defaultKey: 'all' }, 
                { selId: 'weekSelector', defaultKey: 'select_week' }, 
                { selId: 'notesClassSelector', defaultKey: 'select_class' } 
            ]; 
            filters.forEach(f => { 
                const select = document.getElementById(f.selId); 
                if (select) { 
                    const defaultOption = select.querySelector('option[value=""]'); 
                    if (defaultOption) { 
                        defaultOption.textContent = t(f.defaultKey); 
                    } 
                } 
            }); 
            const jSel = document.getElementById('filterJour'); 
            if (jSel) { 
                const dayOptions = jSel.querySelectorAll('option'); 
                const dayValues = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi"]; 
                const dayTransKeys = ["day_sun", "day_mon", "day_tue", "day_wed", "day_thu"]; 
                dayOptions.forEach(opt => { 
                    if (opt.value !== "") { 
                        const idx = dayValues.indexOf(opt.value); 
                        if (idx !== -1) opt.textContent = t(dayTransKeys[idx]); 
                    } 
                }); 
            } 
            const weekSel = document.getElementById('weekSelector'); 
            if (weekSel) { 
                const weekOptions = weekSel.querySelectorAll('option'); 
                weekOptions.forEach(opt => { 
                    if (opt.value && opt.value.match(/^\d+$/)) { 
                        const weekLabel = t('week_label'); 
                        opt.textContent = `${weekLabel.replace(':', '')} ${opt.value}`; 
                    } 
                }); 
            } 
        }
        
        function populateFilterOptions() { 
            const allData = planData || []; 
            const ensK = findHKey('Enseignant'); 
            const clsK = findHKey('Classe'); 
            const perK = findHKey('Période'); 
            const matK = findHKey('Matière'); 
            const isTeacherOnly = loggedInUser && !isUserAdminOrSupervisor(loggedInUser, currentUserRole);

            // Déterminer les assignations (Matière + Classe) de l'enseignant connecté
            const myAssignments = isTeacherOnly ? getTeacherTeachingAssignments(allData, loggedInUser, loggedInTeacherTable) : [];

            let filterScopeData = allData;
            if (isTeacherOnly && ensK) { 
                filterScopeData = allData.filter(i => { 
                    if (!i) return false;
                    const iE = i[ensK] ? String(i[ensK]) : ''; 
                    if (!i.isReadOnlyCrossSection) {
                        return isRowForLoggedInTeacher(iE, loggedInUser, loggedInTeacherTable);
                    } else if (showCrossSectionView) {
                        if (myAssignments.length === 0) return true;
                        return isCrossSectionRowMatchingTeacherAssignments(i, myAssignments);
                    }
                    return false;
                }); 
            } 

            const getUniq = (k) => { 
                const uniq = new Set(); 
                filterScopeData.forEach(i => { 
                    if (i && i[k] != null && String(i[k]).trim() !== '') { 
                        uniq.add(String(i[k]).trim()); 
                    } 
                }); 
                if (k?.trim().toLowerCase() === 'classe') { 
                    return [...uniq].sort(compareClasses); 
                } else { 
                    return [...uniq].sort((a, b) => String(a).localeCompare(String(b), 'fr', { sensitivity: 'base' })); 
                } 
            }; 

            let ens = ensK ? getUniq(ensK) : []; 
            if (isTeacherOnly) {
                if (ens.length === 0) {
                    ens = [loggedInTeacherTable || loggedInUser];
                }
            }
            const cls = clsK ? getUniq(clsK) : []; 
            const per = perK ? getUniq(perK) : []; 
            const mat = matK ? getUniq(matK) : []; 
            
            const updateSel = (id, opts, isCls = false) => { 
                const sel = document.getElementById(id); 
                if (!sel) return;
                const curV = sel.value; 
                const defaultOptHTML = sel.querySelector('option[value=""]')?.outerHTML || `<option value="">${t(isCls ? 'all_f' : 'all')}</option>`; 
                sel.innerHTML = defaultOptHTML; 
                opts.forEach(o => { 
                    const opt = document.createElement('option'); 
                    opt.value = o; 
                    if (isCls) { 
                        const ar = classTranslations[o]; 
                        opt.textContent = ar ? `${ar} (${o})` : o; 
                    } else { 
                        opt.textContent = o; 
                    } 
                    sel.appendChild(opt); 
                }); 
                if (opts.includes(curV)) { 
                    sel.value = curV; 
                } else { 
                    sel.value = ""; 
                } 
            }; 

            updateSel('filterEnseignant', ens); 
            updateSel('filterClasse', cls, true); 
            updateSel('filterPeriode', per); 
            updateSel('filterMatiere', mat); 
            updateFilterOptionDefaultTexts(); 

            const filterEnsSelect = document.getElementById('filterEnseignant'); 
            if (filterEnsSelect) {
                if (isTeacherOnly) { 
                    if (showCrossSectionView) {
                        // Lorsque la consultation inter-section est activée, l'enseignant peut choisir "Tous" (pour voir son travail et celui de son homologue) ou filtrer
                        filterEnsSelect.disabled = false;
                    } else {
                        const matchingOption = Array.from(filterEnsSelect.options).find(o => 
                            (o.value && isRowForLoggedInTeacher(o.value, loggedInUser, loggedInTeacherTable))
                        );
                        if (matchingOption) {
                            filterEnsSelect.value = matchingOption.value;
                        } else if (filterEnsSelect.options.length > 1) {
                            filterEnsSelect.selectedIndex = 1;
                        } else {
                            const opt = document.createElement('option');
                            opt.value = loggedInTeacherTable || loggedInUser;
                            opt.textContent = loggedInTeacherTable || loggedInUser;
                            filterEnsSelect.appendChild(opt);
                            filterEnsSelect.value = opt.value;
                        }
                        filterEnsSelect.disabled = true; 
                    }
                } else { 
                    filterEnsSelect.disabled = false; 
                } 
            }
        }

        function sortAndDisplay() { 
            const isTeacherOnly = loggedInUser && !isUserAdminOrSupervisor(loggedInUser, currentUserRole);
            const filterEnsSelect = document.getElementById('filterEnseignant'); 
            if (filterEnsSelect) {
                if (isTeacherOnly && !showCrossSectionView) { 
                    const matchingOption = Array.from(filterEnsSelect.options).find(o => 
                        (o.value && isRowForLoggedInTeacher(o.value, loggedInUser, loggedInTeacherTable))
                    );
                    if (matchingOption) {
                        filterEnsSelect.value = matchingOption.value;
                    } else if (filterEnsSelect.options.length > 1) {
                        filterEnsSelect.selectedIndex = 1;
                    } else {
                        filterEnsSelect.value = loggedInTeacherTable || loggedInUser; 
                    }
                    filterEnsSelect.disabled = true; 
                } else { 
                    filterEnsSelect.disabled = false; 
                } 
            }

            const ensF = filterEnsSelect ? filterEnsSelect.value.trim() : ''; 
            const clsF = document.getElementById('filterClasse')?.value || ''; 
            const matF = document.getElementById('filterMatiere')?.value || ''; 
            const perF = document.getElementById('filterPeriode')?.value || ''; 
            const jF = document.getElementById('filterJour')?.value || ''; 
            const ensK = findHKey('Enseignant'); 
            const clsK = findHKey('Classe'); 
            const matK = findHKey('Matière'); 
            const perK = findHKey('Période'); 
            const jK = findHKey('Jour'); 

            // Identifier les assignations (Matière + Classe) de l'enseignant connecté
            const myAssignments = isTeacherOnly ? getTeacherTeachingAssignments(planData, loggedInUser, loggedInTeacherTable) : [];
            
            filteredAndSortedData = planData.filter(i => { 
                if (!i) return false; 
                const iE = ensK && i.hasOwnProperty(ensK) ? String(i[ensK]).trim() : ''; 
                const iC = clsK && i.hasOwnProperty(clsK) ? String(i[clsK]).trim() : ''; 
                const iM = matK && i.hasOwnProperty(matK) ? String(i[matK]).trim() : ''; 
                const iP = perK && i.hasOwnProperty(perK) ? String(i[perK]).trim() : ''; 
                const iJ = jK && i.hasOwnProperty(jK) ? String(i[jK]).trim() : ''; 
                
                // Si enseignant connecté (non admin)
                if (isTeacherOnly) {
                    if (!i.isReadOnlyCrossSection) {
                        // Section propre: n'afficher que les séances de l'enseignant
                        if (!isRowForLoggedInTeacher(iE, loggedInUser, loggedInTeacherTable)) {
                            return false;
                        }
                    } else {
                        // Autre section (cross-section): afficher UNIQUEMENT les séances correspondant
                        // STRICTEMENT à la matière ET à la classe enseignées ensemble par l'enseignant
                        if (!showCrossSectionView) return false;
                        if (myAssignments.length > 0 && !isCrossSectionRowMatchingTeacherAssignments(i, myAssignments)) {
                            return false;
                        }
                    }
                } else {
                    // Si mode Admin / Superviseur
                    if (i.isReadOnlyCrossSection && !showCrossSectionView) {
                        return false;
                    }
                }
                
                // Filtre Enseignant :
                let pE = true;
                if (!i.isReadOnlyCrossSection) {
                    // Pour ses propres cours
                    pE = !ensF || (iE === ensF) || isTeacherMatch(iE, ensF);
                } else {
                    // Pour les cours de l'autre section
                    if (!ensF) {
                        // "Tous" sélectionné -> afficher
                        pE = true;
                    } else if (isRowForLoggedInTeacher(ensF, loggedInUser, loggedInTeacherTable)) {
                        // L'enseignant a sélectionné son propre nom -> ne pas afficher les lignes du collègue
                        pE = false;
                    } else {
                        // Un enseignant spécifique a été choisi dans le filtre
                        pE = (iE === ensF) || isTeacherMatch(iE, ensF);
                    }
                }

                const pC = !clsF || (iC === clsF) || isClassMatch(iC, clsF); 
                const pM = !matF || (iM === matF) || (iM.toLowerCase() === matF.toLowerCase()) || isEquivalentSubject(iM, matF); 
                const pP = !perF || (iP === perF) || (String(iP).trim() === String(perF).trim()); 
                const dayNameFromData = iJ ? extractDayName(iJ) : null; 
                const pJ = !jF || dayNameFromData === jF || (iJ && iJ.includes(jF)); 
                return pE && pC && pM && pP && pJ; 
            }); 
            
            const dayValuesFr = { "Dimanche": 1, "Lundi": 2, "Mardi": 3, "Mercredi": 4, "Jeudi": 5 }; 
            
            filteredAndSortedData.sort((a, b) => { 
                // 1. Si une colonne spécifique a été cliquée pour le tri
                if (currentSortColumn) {
                    const colA = a ? a[currentSortColumn] : null;
                    const colB = b ? b[currentSortColumn] : null;
                    let primaryComp = 0;

                    if (currentSortColumn === clsK) {
                        primaryComp = compareClasses(colA, colB);
                    } else if (currentSortColumn === jK) {
                        const jA = colA ? extractDayName(String(colA)) : null;
                        const jB = colB ? extractDayName(String(colB)) : null;
                        primaryComp = (dayValuesFr[jA] || 99) - (dayValuesFr[jB] || 99);
                    } else if (currentSortColumn === perK) {
                        const piA = parseInt(colA, 10);
                        const piB = parseInt(colB, 10);
                        primaryComp = (!isNaN(piA) && !isNaN(piB)) ? (piA - piB) : String(colA || '').localeCompare(String(colB || ''));
                    } else {
                        primaryComp = String(colA || '').localeCompare(String(colB || ''), 'fr', { sensitivity: 'base' });
                    }

                    if (primaryComp !== 0) {
                        return (currentSortOrder === 'asc') ? primaryComp : -primaryComp;
                    }
                }

                // 2. Tri hiérarchique standard : Classe -> Jour -> Période -> Matière -> Enseignant
                const classA = (clsK && a.hasOwnProperty(clsK)) ? a[clsK] : null; 
                const classB = (clsK && b.hasOwnProperty(clsK)) ? b[clsK] : null; 
                const classComp = compareClasses(classA, classB); 
                if (classComp !== 0) return classComp; 
                
                const jA_fr = (jK && a.hasOwnProperty(jK)) ? extractDayName(String(a[jK])) : null; 
                const jB_fr = (jK && b.hasOwnProperty(jK)) ? extractDayName(String(b[jK])) : null; 
                const dayOrdA = dayValuesFr[jA_fr] || 99; 
                const dayOrdB = dayValuesFr[jB_fr] || 99; 
                const dC = dayOrdA - dayOrdB; 
                if (dC !== 0) return dC; 
                
                const pA = (perK && a.hasOwnProperty(perK)) ? a[perK] : null; 
                const pB = (perK && b.hasOwnProperty(perK)) ? b[perK] : null; 
                const piA = parseInt(pA, 10); 
                const piB = parseInt(pB, 10); 
                if (!isNaN(piA) && !isNaN(piB) && piA !== piB) { 
                    return piA - piB; 
                } else if (isNaN(piA) || isNaN(piB)) { 
                    const sA = pA == null ? '' : String(pA); 
                    const sB = pB == null ? '' : String(pB); 
                    const pComp = sA.localeCompare(sB);
                    if (pComp !== 0) return pComp;
                }

                const matA = (matK && a.hasOwnProperty(matK)) ? String(a[matK] || '') : '';
                const matB = (matK && b.hasOwnProperty(matK)) ? String(b[matK] || '') : '';
                const matComp = matA.localeCompare(matB, 'fr', { sensitivity: 'base' });
                if (matComp !== 0) return matComp;

                const ensA = (ensK && a.hasOwnProperty(ensK)) ? String(a[ensK] || '') : '';
                const ensB = (ensK && b.hasOwnProperty(ensK)) ? String(b[ensK] || '') : '';
                return ensA.localeCompare(ensB, 'fr', { sensitivity: 'base' });
            }); 

            displayPlanTable(filteredAndSortedData); 
            updateActionButtonsState(filteredAndSortedData.length > 0); 
        }
        
        function displayPlanTable(data) {
            const tBody = document.querySelector('#planTable tbody');
            const tHead = document.querySelector('#planTable thead tr');
            if (!tBody) return;
            tBody.innerHTML = '';
            const actualHdrCount = tHead ? tHead.querySelectorAll('th').length : 0;
            const colspanVal = actualHdrCount > 0 ? actualHdrCount : 10;
            const curH = headers || [];
            const hDisp = curH.filter(h => 
                h !== '_id' && h.toLowerCase() !== 'updatedat' && h !== 'id' && 
                h !== '_originalCopy' && h !== 'lessonPlanId' && h !== '__v' && 
                h !== '_section' && h !== 'isReadOnlyCrossSection' && !h.startsWith('_')
            );
            const jK = findHKey('Jour');
            const clsK = findHKey('Classe');
            const ensK = findHKey('Enseignant');
            const updK = findHKey('updatedAt');
            
            const isAdmin = isUserAdminOrSupervisor(loggedInUser, currentUserRole);
            let allowedEditNames = ['Leçon', 'Travaux de classe', 'Support', 'Devoirs'];
            if (isAdmin) {
                allowedEditNames = ['Enseignant', 'Jour', 'Période', 'Classe', 'Matière', 'Leçon', 'Travaux de classe', 'Support', 'Devoirs'];
            }
            const editHdrKeys = allowedEditNames.map(k => findHKey(k)).filter(Boolean);

            const isAr = (currentUserLanguage === 'ar' || arabicTeachers.includes(loggedInUser));
            const supportKey = findHKey('Support');
            const initialRow = document.getElementById('initial-table-row');
            if (initialRow) initialRow.remove();
            if (!currentWeek) {
                tBody.innerHTML = `<tr id="initial-table-row"><td colspan="${colspanVal}" class="table-message">${t('select_week_to_display')}</td></tr>`;
                return;
            }
            if (curH.length === 0 && currentWeek) {
                tBody.innerHTML = `<tr id="initial-table-row"><td colspan="${colspanVal}" class="table-message">${t('error_structure')}</td></tr>`;
                return;
            }
            if (!data || data.length === 0) {
                tBody.innerHTML = `<tr id="initial-table-row"><td colspan="${colspanVal}" class="table-message">${t('no_data_to_display_filters')}</td></tr>`;
                return;
            }

            data.forEach((rowObj, rIdx) => {
                if (rowObj && !rowObj._originalCopy) {
                    rowObj._originalCopy = { ...rowObj };
                }
                const tr = document.createElement('tr');
                tr.dataset.rowIndex = rIdx;
                if (rowObj && rowObj._id) {
                    tr.dataset.id = String(rowObj._id);
                }

                const isCrossReadOnly = !!(rowObj && rowObj.isReadOnlyCrossSection);
                if (isCrossReadOnly) {
                    tr.classList.add('cross-section-row');
                    if (rowObj._section === 'filles') {
                        tr.classList.add('cross-section-row-filles');
                    } else {
                        tr.classList.add('cross-section-row-garcons');
                    }
                }

                hDisp.forEach(header => {
                    if (isAr && header === supportKey) {
                        return;
                    }
                    
                    const td = document.createElement('td');
                    let content = rowObj ? (rowObj[header] ?? '') : '';
                    td.setAttribute('dir', 'auto');
                    td.dataset.header = header;
                    
                    // Une ligne d'une autre section est TOUJOURS en lecture seule (non éditable)
                    const isEditable = !isCrossReadOnly && editHdrKeys.includes(header);

                    if (header === ensK && isCrossReadOnly) {
                        const secLabel = (rowObj._section === 'filles') ? '👧 Filles' : '👦 Garçons';
                        const badgeClass = (rowObj._section === 'filles') ? 'badge-filles' : 'badge-garcons';
                        td.innerHTML = `<span class="cross-sec-badge ${badgeClass}">${secLabel}</span> ${escapeHtml(content)}`;
                    } else if (header === jK && content && !isAdmin) {
                        const dt = parseDateFromJourColumn(content);
                        td.textContent = dt ? formatDateForDisplay(dt) : content;
                    } else if (header === clsK && content && !isAdmin) {
                        const ar = classTranslations[content];
                        td.textContent = ar ? `${ar} (${content})` : content;
                    } else if (isEditable) {
                        td.contentEditable = true;
                        td.classList.add('editable');
                        td.textContent = content;
                        td.spellcheck = true;
                        applyRTLToElement(td, content);
                        
                        td.addEventListener('paste', (e) => {
                            e.preventDefault();
                            const text = (e.clipboardData || window.clipboardData).getData('text');
                            const cleanedText = text.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
                            document.execCommand('insertText', false, cleanedText);
                        });
                        
                        td.addEventListener('input', (e) => {
                            if (rowObj) {
                                rowObj[header] = e.target.textContent;
                                applyRTLToElement(e.target, e.target.textContent);
                            }
                            const parentTR = e.target.closest('tr');
                            if (parentTR) {
                                parentTR.classList.add('modified');
                                const indicator = parentTR.querySelector('.save-indicator');
                                if (indicator) indicator.style.display = 'none';
                                updateTeacherCounters();
                            }
                        });
                    } else {
                        td.textContent = content;
                    }
                    tr.appendChild(td);
                });

                const actTd = document.createElement('td');
                actTd.classList.add('actions-column');

                if (isCrossReadOnly) {
                    // Badge indicatif lecture seule pour les lignes de l'autre section
                    const readOnlyBadge = document.createElement('span');
                    readOnlyBadge.className = 'badge-readonly-lock';
                    readOnlyBadge.innerHTML = `<i class="fas fa-lock"></i> ${currentUserLanguage === 'ar' ? 'للاطلاع' : 'Lecture seule'}`;
                    readOnlyBadge.title = 'Contribution de l\'autre section (non modifiable)';
                    actTd.appendChild(readOnlyBadge);
                } else {
                    const saveBtn = document.createElement('button');
                    saveBtn.innerHTML = '<i class="fas fa-check"></i>';
                    saveBtn.title = t('save_row_title');
                    saveBtn.classList.add('save-row-button');
                    saveBtn.onclick = () => saveRow(rowObj, tr);
                    actTd.appendChild(saveBtn);

                    const indicatorSpan = document.createElement('span');
                    indicatorSpan.className = 'save-indicator';
                    indicatorSpan.innerHTML = '<i class="fas fa-check-circle"></i>';
                    indicatorSpan.style.display = rowObj && updK && rowObj[updK] ? 'inline-block' : 'none';
                    actTd.appendChild(indicatorSpan);
                    
                    // Bouton disquette pour générer le plan de leçon IA pour cette ligne
                    const teacherKey = findHKey('Enseignant');
                    const rowTeacher = teacherKey ? rowObj[teacherKey] : null;
                    const isRowTeacherMatch = !rowTeacher || 
                        isRowForLoggedInTeacher(rowTeacher, loggedInUser, loggedInTeacherTable) || 
                        String(rowTeacher).trim().toLowerCase() === String(loggedInUser || '').trim().toLowerCase() ||
                        (loggedInTeacherTable && String(rowTeacher).trim().toLowerCase() === String(loggedInTeacherTable).trim().toLowerCase());
                    const canGenerate = !rowObj.isReadOnlyCrossSection && (isUserAdminOrSupervisor(loggedInUser, currentUserRole) || isRowTeacherMatch);
                    
                    if (canGenerate) {
                        const aiGenBtn = document.createElement('button');
                        aiGenBtn.innerHTML = '<i class="fas fa-save"></i>';
                        aiGenBtn.title = 'Générer Plan de Leçon de cette séance';
                        aiGenBtn.classList.add('ai-lesson-plan-button');
                        aiGenBtn.style.marginLeft = '5px';
                        
                        if (rowObj && rowObj.lessonPlanId) {
                            aiGenBtn.classList.add('lesson-plan-exists');
                            aiGenBtn.title = 'Plan de Leçon déjà généré - Régénérer';
                        }
                        
                        aiGenBtn.onclick = () => generateAILessonPlan(rowObj, tr);
                        actTd.appendChild(aiGenBtn);
                    }
                    
                    // Bouton pour télécharger le plan de leçon et badge d'état
                    if (rowObj && rowObj.lessonPlanId) {
                        tr.classList.add('has-lesson-plan');
                        if (rowObj.lessonPlanDownloaded) {
                            tr.classList.add('row-plan-downloaded');
                        }
                        const canDownload = isUserAdminOrSupervisor(loggedInUser, currentUserRole) || isRowTeacherMatch || !rowObj.isReadOnlyCrossSection;
                        if (canDownload) {
                            const lessonBtn = document.createElement('button');
                            lessonBtn.innerHTML = '<i class="fas fa-file-download"></i>';
                            lessonBtn.title = 'Télécharger Plan de Leçon';
                            lessonBtn.classList.add('lesson-plan-button');
                            lessonBtn.style.marginLeft = '5px';
                            lessonBtn.onclick = () => downloadLessonPlan(rowObj);
                            actTd.appendChild(lessonBtn);
                        }

                        const statusBadge = document.createElement('span');
                        statusBadge.className = 'plan-status-badge ' + (rowObj.lessonPlanDownloaded ? 'badge-downloaded' : 'badge-ready');
                        statusBadge.innerHTML = rowObj.lessonPlanDownloaded
                            ? '<i class="fas fa-check-double"></i> Téléchargé'
                            : '<i class="fas fa-check-circle"></i> Prêt';
                        statusBadge.title = rowObj.lessonPlanDownloaded ? 'Plan de leçon déjà téléchargé' : 'Plan de leçon disponible';
                        actTd.appendChild(statusBadge);
                    }
                }

                tr.appendChild(actTd);
                if (updK && tHead && tHead.querySelector('.updated-at-column')) {
                    const updTd = document.createElement('td');
                    updTd.classList.add('updated-at-column');
                    const updContent = rowObj && rowObj.hasOwnProperty(updK) ? (rowObj[updK] ?? '') : '';
                    updTd.textContent = formatUpdatedAt(updContent);
                    tr.appendChild(updTd);
                }
                tBody.appendChild(tr);
            });
            makeTableColumnsResizable();
            updateTeacherCounters();
        }

        function findTableRowElement(rowData, fallbackIndex = null) {
            if (!rowData) return null;
            const tableBody = document.querySelector('#planTable tbody');
            if (!tableBody) return null;
            
            // 1. Recherche par identifiant unique MongoDB _id
            if (rowData._id) {
                const tr = tableBody.querySelector(`tr[data-id="${rowData._id}"]`);
                if (tr) return tr;
            }

            // 2. Recherche par index précis dans filteredAndSortedData
            if (typeof filteredAndSortedData !== 'undefined' && Array.isArray(filteredAndSortedData)) {
                const exactIdx = filteredAndSortedData.indexOf(rowData);
                if (exactIdx !== -1) {
                    const tr = tableBody.querySelector(`tr[data-row-index="${exactIdx}"]`);
                    if (tr) return tr;
                }
            }
            
            // 3. Recherche sémantique par colonnes clés
            const teacherK = findHKey('Enseignant');
            const classK = findHKey('Classe');
            const dayK = findHKey('Jour');
            const periodK = findHKey('Période');
            const subjectK = findHKey('Matière');
            
            const rows = tableBody.querySelectorAll('tr[data-row-index]');
            for (let tr of rows) {
                const idx = parseInt(tr.getAttribute('data-row-index'), 10);
                if (!isNaN(idx) && filteredAndSortedData && filteredAndSortedData[idx]) {
                    const candidate = filteredAndSortedData[idx];
                    if (candidate === rowData) return tr;
                    if (
                        (!teacherK || candidate[teacherK] === rowData[teacherK]) &&
                        (!classK || candidate[classK] === rowData[classK]) &&
                        (!dayK || candidate[dayK] === rowData[dayK]) &&
                        (!periodK || String(candidate[periodK]) === String(rowData[periodK])) &&
                        (!subjectK || candidate[subjectK] === rowData[subjectK])
                    ) {
                        return tr;
                    }
                }
            }

            // 4. Dernier recours : index de secours si fourni
            if (fallbackIndex !== null && fallbackIndex !== undefined) {
                const tr = tableBody.querySelector(`tr[data-row-index="${fallbackIndex}"]`);
                if (tr) return tr;
            }

            return null;
        }

        function updateTeacherCounters() {
            const countEl = document.getElementById('teacherRowCountTxt');
            const modEl = document.getElementById('teacherModifiedCountTxt');
            const saveBtn = document.getElementById('saveAllDisplayedBtn');
            if (!countEl || !modEl) return;
            
            const displayedCount = (filteredAndSortedData || []).filter(r => r && !r.isReadOnlyCrossSection).length;
            const modifiedRows = document.querySelectorAll('#planTable tbody tr.modified').length;
            
            const isAr = currentUserLanguage === 'ar';
            countEl.textContent = isAr 
                ? `${displayedCount} حصة معروضة` 
                : `${displayedCount} cours affiché(s)`;
                
            if (modifiedRows > 0) {
                modEl.innerHTML = isAr 
                    ? `<span style="color:#DC2626; font-weight:800;">⚠️ ${modifiedRows} تعديل غير محفوظ</span>` 
                    : `<span style="color:#DC2626; font-weight:800;">⚠️ ${modifiedRows} modification(s) non enregistrée(s)</span>`;
                if (saveBtn) {
                    saveBtn.classList.add('has-pending-saves');
                    saveBtn.disabled = false;
                }
            } else {
                modEl.innerHTML = isAr 
                    ? `<span style="color:#059669; font-weight:700;">✅ الكل محفوظ</span>` 
                    : `<span style="color:#059669; font-weight:700;">Tout est enregistré ✅</span>`;
                if (saveBtn) {
                    saveBtn.classList.remove('has-pending-saves');
                }
            }
        }

        function resetTeacherFilters() {
            const selMatiere = document.getElementById('filterMatiere');
            const selPeriode = document.getElementById('filterPeriode');
            const selJour = document.getElementById('filterJour');
            if (selMatiere) selMatiere.value = '';
            if (selPeriode) selPeriode.value = '';
            if (selJour) selJour.value = '';
            sortAndDisplay();
            showToastNotification(currentUserLanguage === 'ar' ? 'تمت إعادة ضبط جميع التصفِيات' : 'Filtres réinitialisés, tous les cours sont affichés.', 'success');
        }
        
        async function generateAILessonPlan(rowData, tableRowElement) {
            if (!rowData || typeof rowData !== 'object') {
                displayAlert('invalid_row', true);
                return;
            }
            if (!currentWeek) {
                displayAlert("please_select_week", true);
                return;
            }

            // Synchroniser fidèlement les valeurs actuelles affichées dans la ligne du tableau
            if (tableRowElement) {
                const cells = tableRowElement.querySelectorAll('td[data-header]');
                if (cells.length > 0) {
                    cells.forEach(cell => {
                        const hName = cell.dataset.header;
                        if (hName && cell.classList.contains('editable')) {
                            const cellText = (cell.textContent || '').trim();
                            rowData[hName] = cellText;
                        }
                    });
                }
            }
            
            console.log("Generating AI Lesson Plan for:", rowData);
            displayAlert('generating_ai_lesson_plan', false);
            
            const aiButton = tableRowElement?.querySelector('.ai-lesson-plan-button');
            let originalButtonHtml = '';
            let originalButtonDisabledState = false;
            
            if (aiButton) {
                originalButtonHtml = aiButton.innerHTML;
                originalButtonDisabledState = aiButton.disabled;
                aiButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
                aiButton.disabled = true;
            }
            
            // Règle 2 : Ne pas générer de plan de leçon pour les jours fériés ou chômés
            if (isHolidayRow(rowData, window.parentSpecialDays, currentWeek, currentSection)) {
                console.log("Séance sur jour férié, génération ignorée:", rowData);
                displayAlert("⚠️ Cette séance correspond à un jour férié ou chômé. Aucun plan de leçon n'a été généré.", true);
                if (aiButton) {
                    aiButton.innerHTML = originalButtonHtml;
                    aiButton.disabled = originalButtonDisabledState;
                }
                return;
            }

            try {
                const response = await fetch('/api/generate-ai-lesson-plan', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        week: currentWeek, 
                        rowData: rowData,
                        section: rowData._section || currentSection || 'garcons'
                    })
                });
                
                if (response.ok) {
                    const blob = await response.blob();
                    const contentDisposition = response.headers.get('content-disposition');
                    let filename = `plan_lecon_S${currentWeek}_AI_genere.docx`;
                    
                    if (contentDisposition) {
                        const filenameMatch = contentDisposition.match(/filename="?(.+?)"?(;|$)/i);
                        if (filenameMatch && filenameMatch[1]) {
                            filename = filenameMatch[1];
                        }
                    }
                    
                    const planIdHeader = response.headers.get('x-lesson-plan-id');
                    if (rowData) {
                        rowData.lessonPlanId = planIdHeader || rowData.lessonPlanId || 'generated';
                        rowData.lessonPlanDownloaded = true;
                    }

                    saveAs(blob, filename);
                    displayAlert('ai_lesson_plan_generated', false);
                    
                    // Mettre à jour le bouton disquette en VERT (plan généré)
                    if (aiButton) {
                        aiButton.classList.add('lesson-plan-exists');
                        aiButton.title = 'Plan de Leçon déjà généré - Régénérer';
                    }

                    if (tableRowElement) {
                        tableRowElement.classList.add('has-lesson-plan');
                        const actTd = tableRowElement.querySelector('.actions-column');
                        if (actTd) {
                            if (!tableRowElement.querySelector('.lesson-plan-button')) {
                                const lessonBtn = document.createElement('button');
                                lessonBtn.innerHTML = '<i class="fas fa-file-download"></i>';
                                lessonBtn.title = 'Télécharger Plan de Leçon';
                                lessonBtn.classList.add('lesson-plan-button');
                                lessonBtn.style.marginLeft = '5px';
                                lessonBtn.onclick = () => downloadLessonPlan(rowData);
                                actTd.appendChild(lessonBtn);
                            }
                            let badge = tableRowElement.querySelector('.plan-status-badge');
                            if (!badge) {
                                badge = document.createElement('span');
                                actTd.appendChild(badge);
                            }
                            badge.className = 'plan-status-badge badge-downloaded';
                            badge.innerHTML = '<i class="fas fa-check-double"></i> Téléchargé';
                            badge.title = 'Plan de leçon généré et téléchargé';
                        }
                    }
                } else {
                    const errorResult = await response.json().catch(() => ({ message: "Erreur inconnue du serveur." }));
                    if (errorResult.isHoliday) {
                        displayAlert(`⚠️ ${errorResult.message || "Jour férié : aucun plan de leçon généré."}`, true);
                        return;
                    }
                    throw new Error(errorResult.message || `Erreur serveur ${response.status}`);
                }
            } catch (error) {
                console.error('Error generating AI lesson plan:', error);
                // Détecter si c'est une erreur de quota épuisé
                if (error.message && (error.message.includes('QUOTA') || error.message.includes('429') || error.message.includes('Limite') || error.message.includes('quota'))) {
                    displayAlert('quota_exceeded', true);
                } else {
                    displayAlert('error_generating_ai_lesson_plan', true, { error: error.message });
                }
            } finally {
                if (aiButton) {
                    aiButton.innerHTML = originalButtonHtml;
                    aiButton.disabled = originalButtonDisabledState;
                }
            }
        }
        
        // ==================== GÉNÉRATION PLANS DE LEÇON IA ====================
        


        // Fonction pour générer tous les plans de leçon des lignes affichées dans le tableau (Ligne par ligne)
        async function generateAllDisplayedLessonPlans() {
            if (!currentWeek) {
                displayAlert("Veuillez d'abord sélectionner une semaine.", true);
                return;
            }
            if (!filteredAndSortedData || filteredAndSortedData.length === 0) {
                displayAlert("Aucune donnée à afficher. Utilisez les filtres pour afficher des données.", true);
                return;
            }

            const teacherKey = findHKey('Enseignant');
            const lessonKey = findHKey('Leçon');
            const subjectKey = findHKey('Matière');
            const classKey = findHKey('Classe');
            const periodKey = findHKey('Période');
            const dayKey = findHKey('Jour');

            // Filtrer les lignes que l'utilisateur a le droit de générer
            const isTeacherOnly = loggedInUser && !isUserAdminOrSupervisor(loggedInUser, currentUserRole);
            const eligibleRows = filteredAndSortedData.filter(row => {
                if (!row || typeof row !== 'object') return false;
                if (row.isReadOnlyCrossSection) return false;
                if (!isTeacherOnly) return true; // Admin et superviseurs peuvent tout générer
                const rowTeacher = teacherKey ? row[teacherKey] : null;
                return !rowTeacher || 
                       isRowForLoggedInTeacher(rowTeacher, loggedInUser, loggedInTeacherTable) || 
                       String(rowTeacher).trim().toLowerCase() === String(loggedInUser || '').trim().toLowerCase() ||
                       (loggedInTeacherTable && String(rowTeacher).trim().toLowerCase() === String(loggedInTeacherTable).trim().toLowerCase());
            });

            if (eligibleRows.length === 0) {
                if (filteredAndSortedData.length > 0 && isTeacherOnly && filteredAndSortedData.every(r => r && r.isReadOnlyCrossSection)) {
                    displayAlert("Les séances affichées appartiennent à l'autre section (consultation seule). Basculez sur votre section pour générer vos plans de leçon.", true);
                } else {
                    displayAlert("Aucune ligne modifiable/générable pour votre compte dans la sélection actuelle.", true);
                }
                return;
            }

            const confirmation = confirm(`Générer les plans de leçon pour ${eligibleRows.length} ligne(s) affichée(s) ?\n\n- Semaine: S${currentWeek}\n- Mode: Génération ligne par ligne avec suivi en direct\n- Marquage visuel de chaque séance générée et téléchargée\n- Archive ZIP groupée téléchargée à la fin.`);
            if (!confirmation) {
                return;
            }

            console.log(`[Batch AI] Début de la génération ligne par ligne de ${eligibleRows.length} plan(s) de leçon`);
            displayAlert(`🤖 Démarrage de la génération de ${eligibleRows.length} plan(s) de leçon...`, false);

            const btn = document.getElementById('generateAllDisplayedPlansBtn');
            const originalHTML = btn ? btn.innerHTML : '';
            if (btn) {
                btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> <span class="btn-text">Génération en cours...</span>';
                btn.disabled = true;
            }

            showProgressBar(`Initialisation (0 / ${eligibleRows.length})...`);
            updateProgressBar(0, `Initialisation (0 / ${eligibleRows.length})...`);

            const zip = (typeof JSZip !== 'undefined') ? new JSZip() : null;
            const processedFiles = [];
            let generatedCount = 0;
            let existingCount = 0;
            let skippedCount = 0;
            let errorCount = 0;

            try {
                for (let i = 0; i < eligibleRows.length; i++) {
                    const rowObj = eligibleRows[i];
                    const tr = findTableRowElement(rowObj, i);

                    // Synchroniser fidèlement avec les cellules éditées affichées dans la ligne du tableau
                    if (tr) {
                        const cells = tr.querySelectorAll('td[data-header]');
                        cells.forEach(cell => {
                            const hName = cell.dataset.header;
                            if (hName && cell.classList.contains('editable')) {
                                rowObj[hName] = (cell.textContent || '').trim();
                            }
                        });
                    }

                    const teacherVal = (teacherKey && rowObj[teacherKey]) ? String(rowObj[teacherKey]).trim() : '';
                    const classVal = (classKey && rowObj[classKey]) ? String(rowObj[classKey]).trim() : '';
                    const subjectVal = (subjectKey && rowObj[subjectKey]) ? String(rowObj[subjectKey]).trim() : '';
                    const lessonVal = (lessonKey && rowObj[lessonKey]) ? String(rowObj[lessonKey]).trim() : '';
                    const periodVal = (periodKey && rowObj[periodKey]) ? String(rowObj[periodKey]).trim() : '';
                    const dayVal = (dayKey && rowObj[dayKey]) ? String(rowObj[dayKey]).trim() : '';

                    const shortLesson = lessonVal.length > 25 ? (lessonVal.substring(0, 25) + '...') : (lessonVal || 'Sans titre');
                    const progressPct = Math.round((i / eligibleRows.length) * 100);
                    const statusMsg = `Ligne ${i + 1}/${eligibleRows.length} (${progressPct}%) : ${classVal} - ${subjectVal} [${shortLesson}]`;
                    
                    updateProgressBar(progressPct, statusMsg);

                    // Mettre en évidence visuelle la ligne en cours de traitement
                    if (tr) {
                        tr.classList.add('row-generating');
                        try {
                            tr.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                        } catch (e) {}
                    }

                    // Règle 2 : Ignorer la génération si la séance tombe sur un jour férié ou chômé
                    if (isHolidayRow(rowObj, window.parentSpecialDays, currentWeek, rowObj._section || currentSection)) {
                        console.log(`[Batch AI] Ligne ${i + 1} ignorée (jour férié): ${classVal} - ${dayVal} - ${subjectVal}`);
                        skippedCount++;
                        if (tr) tr.classList.remove('row-generating');
                        continue;
                    }

                    // Gérer le thème de la leçon (générer un thème adapté si absent pour éviter toute erreur)
                    let effectiveLessonVal = lessonVal;
                    if (!effectiveLessonVal || effectiveLessonVal.length < 2 || effectiveLessonVal === '-' || effectiveLessonVal.toLowerCase() === 'aucun') {
                        effectiveLessonVal = subjectVal ? `Séance de ${subjectVal} - ${classVal}` : `Séance pédagogique (${classVal})`;
                        if (lessonKey) {
                            rowObj[lessonKey] = effectiveLessonVal;
                        }
                    }

                    let docxBlob = null;
                    let docxFilename = '';
                    let isFromDb = false;

                    // 1. Tenter de récupérer depuis la base de données si déjà présent
                    // MAIS si la ligne a été modifiée dans le tableau, régénérer pour respecter la saisie
                    const isRowModified = tr && tr.classList.contains('modified');
                    if (rowObj.lessonPlanId && !isRowModified) {
                        try {
                            const checkRes = await fetch(`/api/download-lesson-plan/${encodeURIComponent(rowObj.lessonPlanId)}`);
                            if (checkRes.ok) {
                                docxBlob = await checkRes.blob();
                                if (docxBlob && docxBlob.size > 200) {
                                    const cd = checkRes.headers.get('content-disposition');
                                    if (cd) {
                                        const match = cd.match(/filename="?(.+?)"?(;|$)/i);
                                        if (match && match[1]) docxFilename = match[1];
                                    }
                                    if (!docxFilename) {
                                        docxFilename = `${subjectVal}_${classVal}_S${currentWeek}_P${periodVal}_${teacherVal}.docx`.replace(/[\s/\\?%*:|"<>]/g, '_');
                                    }
                                    isFromDb = true;
                                    existingCount++;
                                    console.log(`[Batch AI] Ligne ${i + 1}: Plan existant récupéré (${docxFilename})`);
                                } else {
                                    docxBlob = null;
                                }
                            }
                        } catch (errDb) {
                            console.warn(`[Batch AI] Erreur récupération DB pour ligne ${i + 1}:`, errDb);
                            docxBlob = null;
                        }
                    }

                    // 2. Si pas en base de données, générer par l'IA
                    if (!docxBlob) {
                        try {
                            const genRes = await fetch('/api/generate-ai-lesson-plan', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    week: currentWeek,
                                    rowData: rowObj,
                                    section: rowObj._section || currentSection || 'garcons'
                                })
                            });

                            if (genRes.ok) {
                                docxBlob = await genRes.blob();
                                const cd = genRes.headers.get('content-disposition');
                                if (cd) {
                                    const match = cd.match(/filename="?(.+?)"?(;|$)/i);
                                    if (match && match[1]) docxFilename = match[1];
                                }
                                if (!docxFilename) {
                                    docxFilename = `${subjectVal}_${classVal}_S${currentWeek}_P${periodVal}_${teacherVal}.docx`.replace(/[\s/\\?%*:|"<>]/g, '_');
                                }
                                const returnedPlanId = genRes.headers.get('x-lesson-plan-id');
                                if (returnedPlanId) {
                                    rowObj.lessonPlanId = returnedPlanId;
                                } else if (!rowObj.lessonPlanId) {
                                    rowObj.lessonPlanId = `${rowObj._section || currentSection || 'garcons'}_${currentWeek}_${teacherVal}_${classVal}_${subjectVal}_${periodVal}_${dayVal}`.replace(/\s+/g, '_');
                                }
                                generatedCount++;
                                console.log(`[Batch AI] Ligne ${i + 1}: Plan IA généré avec succès (${docxFilename})`);
                                // Pause de courtoisie pour ménager les quotas de l'API
                                await new Promise(res => setTimeout(res, 800));
                            } else {
                                const errData = await genRes.json().catch(() => ({}));
                                console.error(`[Batch AI] Échec génération ligne ${i + 1}:`, errData);
                                errorCount++;
                            }
                        } catch (errGen) {
                            console.error(`[Batch AI] Exception génération ligne ${i + 1}:`, errGen);
                            errorCount++;
                        }
                    }

                    // 3. Traiter le fichier obtenu et mettre à jour le DOM de la ligne
                    if (docxBlob) {
                        rowObj.lessonPlanDownloaded = false; // Sera marqué téléchargé dès la fin du zip
                        processedFiles.push({ filename: docxFilename, blob: docxBlob, rowObj: rowObj, tr: tr });
                        if (zip) {
                            zip.file(docxFilename, docxBlob);
                        }

                        if (tr) {
                            tr.classList.remove('row-generating', 'row-plan-error');
                            tr.classList.add('has-lesson-plan');

                            const actTd = tr.querySelector('.actions-column');
                            if (actTd) {
                                // Bouton disquette en vert
                                const aiBtn = tr.querySelector('.ai-lesson-plan-button');
                                if (aiBtn) {
                                    aiBtn.classList.add('lesson-plan-exists');
                                    aiBtn.title = 'Plan de Leçon déjà généré - Régénérer';
                                }

                                // Bouton de téléchargement direct
                                let dlBtn = tr.querySelector('.lesson-plan-button');
                                if (!dlBtn) {
                                    dlBtn = document.createElement('button');
                                    dlBtn.innerHTML = '<i class="fas fa-file-download"></i>';
                                    dlBtn.title = 'Télécharger Plan de Leçon';
                                    dlBtn.classList.add('lesson-plan-button');
                                    dlBtn.style.marginLeft = '5px';
                                    dlBtn.onclick = () => downloadLessonPlan(rowObj);
                                    actTd.appendChild(dlBtn);
                                }

                                // Badge d'état "Prêt"
                                let badge = tr.querySelector('.plan-status-badge');
                                if (!badge) {
                                    badge = document.createElement('span');
                                    actTd.appendChild(badge);
                                }
                                badge.className = 'plan-status-badge badge-ready';
                                badge.innerHTML = isFromDb ? '<i class="fas fa-check-circle"></i> Prêt (Existant)' : '<i class="fas fa-check-circle"></i> Généré';
                                badge.title = isFromDb ? 'Plan existant en base de données' : 'Plan généré avec succès par l\'IA';
                            }
                        }
                    } else {
                        // Échec pour cette ligne
                        if (tr) {
                            tr.classList.remove('row-generating');
                            tr.classList.add('row-plan-error');
                            const actTd = tr.querySelector('.actions-column');
                            if (actTd) {
                                let badge = tr.querySelector('.plan-status-badge');
                                if (!badge) {
                                    badge = document.createElement('span');
                                    actTd.appendChild(badge);
                                }
                                badge.className = 'plan-status-badge badge-error';
                                badge.innerHTML = '<i class="fas fa-exclamation-triangle"></i> Échec';
                                badge.title = 'Erreur lors de la génération IA de cette séance';
                            }
                        }
                    }
                }

                updateProgressBar(100, `Finalisation de l'archive (${processedFiles.length} plans)...`);

                // 4. Télécharger l'archive ZIP si des fichiers ont été produits
                if (processedFiles.length > 0) {
                    let zipSuccess = false;
                    if (zip && typeof JSZip !== 'undefined') {
                        try {
                            const zipBlob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
                            const teachersInZip = [...new Set(processedFiles.map(f => getRowField(f.rowObj, 'Enseignant')).filter(Boolean))];
                            const zipFilename = teachersInZip.length === 1
                                ? `Plan de lecon-${teachersInZip[0]}-semaine(${currentWeek}).zip`
                                : `Plans_Lecon_S${currentWeek}_${processedFiles.length}_cours.zip`;
                            if (typeof saveAs === 'function') {
                                saveAs(zipBlob, zipFilename);
                            } else {
                                const link = document.createElement('a');
                                link.href = window.URL.createObjectURL(zipBlob);
                                link.download = zipFilename;
                                document.body.appendChild(link);
                                link.click();
                                document.body.removeChild(link);
                                window.URL.revokeObjectURL(link.href);
                            }
                            zipSuccess = true;
                        } catch (zipErr) {
                            console.error('[Batch AI] Erreur compression ZIP:', zipErr);
                        }
                    }

                    if (!zipSuccess && processedFiles.length > 0) {
                        for (const item of processedFiles) {
                            if (typeof saveAs === 'function') {
                                saveAs(item.blob, item.filename);
                            } else {
                                const link = document.createElement('a');
                                link.href = window.URL.createObjectURL(item.blob);
                                link.download = item.filename;
                                document.body.appendChild(link);
                                link.click();
                                document.body.removeChild(link);
                                window.URL.revokeObjectURL(link.href);
                            }
                            await new Promise(r => setTimeout(r, 150));
                        }
                    }

                    // Marquer toutes les lignes traitées comme "Téléchargé"
                    processedFiles.forEach(item => {
                        item.rowObj.lessonPlanDownloaded = true;
                        if (item.tr) {
                            item.tr.classList.remove('row-generating', 'row-plan-error');
                            item.tr.classList.add('has-lesson-plan', 'row-plan-downloaded');
                            const badge = item.tr.querySelector('.plan-status-badge');
                            if (badge) {
                                badge.className = 'plan-status-badge badge-downloaded';
                                badge.innerHTML = '<i class="fas fa-check-double"></i> Téléchargé';
                                badge.title = 'Plan de leçon généré et inclus dans l\'archive téléchargée';
                            }
                        }
                    });

                    const summaryMsg = `✅ Génération terminée avec succès !\n\n` +
                        `• Plans traités : ${processedFiles.length} (${generatedCount} généré(s), ${existingCount} déjà existant(s))\n` +
                        (skippedCount ? `• Leçons vides ignorées : ${skippedCount}\n` : '') +
                        (errorCount ? `• Erreurs : ${errorCount}\n` : '') +
                        `• Fichier ZIP téléchargé automatiquement.`;

                    displayAlert(summaryMsg, false);
                } else {
                    displayAlert(`⚠️ Aucun plan n'a pu être généré ou téléchargé (${skippedCount} leçon(s) vide(s), ${errorCount} erreur(s)).`, true);
                }

            } catch (globalError) {
                console.error("[Batch AI] Erreur globale lors du processus:", globalError);
                displayAlert(`❌ Erreur pendant le traitement : ${globalError.message}`, true);
            } finally {
                setTimeout(() => {
                    hideProgressBar();
                }, 2000);

                if (btn) {
                    btn.innerHTML = originalHTML;
                    btn.disabled = false;
                    updateActionButtonsState(filteredAndSortedData.length > 0);
                }
            }
        }
        
        async function generateWeeklyLessonPlans() { 
            if (!currentWeek) { displayAlert("please_select_week", true); return; } 
            if (!filteredAndSortedData || filteredAndSortedData.length === 0) { displayAlert("no_data_to_display_filters", true); return; } 
            const confirmation = confirm(t("Voulez-vous générer les plans de leçons pour toutes les données affichées de la semaine " + currentWeek + " ?")); 
            if (!confirmation) return; 

            // Synchroniser fidèlement toutes les cellules modifiées affichées dans le tableau avant l'envoi
            const tableBody = document.querySelector('#planTable tbody');
            if (tableBody) {
                const trList = tableBody.querySelectorAll('tr[data-row-index]');
                trList.forEach(tr => {
                    const rIdx = parseInt(tr.dataset.rowIndex, 10);
                    const rowObj = filteredAndSortedData[rIdx];
                    if (rowObj) {
                        const cells = tr.querySelectorAll('td[data-header]');
                        cells.forEach(cell => {
                            const hName = cell.dataset.header;
                            if (hName && cell.classList.contains('editable')) {
                                rowObj[hName] = (cell.textContent || '').trim();
                            }
                        });
                    }
                });
            }

            console.log("Generating Weekly Lesson Plans for week:", currentWeek); 
            displayAlert("generating_weekly_lessons", false); 
            setButtonLoading("generateWeeklyLessonsBtn", true, "fas fa-robot"); 
            showProgressBar(); 
            updateProgressBar(10); 
            try { 
                const response = await fetch("/api/generate-weekly-lesson-plans", { 
                    method: "POST", 
                    headers: { "Content-Type": "application/json" }, 
                    body: JSON.stringify({ 
                        week: currentWeek, 
                        data: filteredAndSortedData,
                        section: currentSection,
                        forceRegenerate: true
                    }) 
                }); 
                updateProgressBar(80); 
                if (response.ok) { 
                    const blob = await response.blob(); 
                    const contentDisposition = response.headers.get("content-disposition"); 
                    let filename = `plans_lecons_semaine_${currentWeek}.zip`; 
                    if (contentDisposition) { 
                        const filenameMatch = contentDisposition.match(/filename="?(.+?)"?(;|$)/i); 
                        if (filenameMatch && filenameMatch[1]) { 
                            filename = filenameMatch[1]; 
                        } 
                    } 
                    saveAs(blob, filename); 
                    updateProgressBar(100); 
                    displayAlert("weekly_lessons_generated", false); 
                } else { 
                    const errorResult = await response.json().catch(() => ({ message: "Erreur inconnue du serveur." })); 
                    throw new Error(errorResult.message || `Erreur serveur ${response.status}`); 
                } 
            } catch (error) { 
                console.error("Error generating weekly lesson plans:", error); 
                displayAlert("error_generating_ai_lesson_plan", true, { error: error.message }); 
                updateProgressBar(0); 
            } finally { 
                hideProgressBar(); 
                setButtonLoading("generateWeeklyLessonsBtn", false, "fas fa-robot"); 
            } 
        }
        function updateActionButtonsState(isEnabled) { 
            document.getElementById('generateWordBtn').disabled = !isEnabled; 
            document.getElementById('generateExcelBtn').disabled = !isEnabled; 
            const saveAllBtn = document.getElementById('saveAllDisplayedBtn'); 
            if (saveAllBtn) { 
                saveAllBtn.disabled = !isEnabled || !filteredAndSortedData || filteredAndSortedData.length === 0; 
            } 
            const generateAllDisplayedPlansBtn = document.getElementById('generateAllDisplayedPlansBtn'); 
            if (generateAllDisplayedPlansBtn) { 
                generateAllDisplayedPlansBtn.disabled = !isEnabled || !filteredAndSortedData || filteredAndSortedData.length === 0; 
                generateAllDisplayedPlansBtn.style.display = ''; 
            }
            const openLessonPlanModalBtn = document.getElementById('openLessonPlanModalBtn');
            if (openLessonPlanModalBtn) {
                openLessonPlanModalBtn.disabled = !isEnabled || !planData || planData.length === 0;
            }
        }
        async function saveRow(rowData, tableRowElement) { 
            if(!rowData||typeof rowData!=='object'){displayAlert('invalid_row',true); return;} 
            if(rowData.isReadOnlyCrossSection) {
                displayAlert(currentUserLanguage === 'ar' ? 'لا يمكن تعديل بيانات القسم الآخر (للاطلاع فقط)' : 'Impossible de modifier une ligne appartenant à l\'autre section (lecture seule).', true);
                return;
            }
            if(!tableRowElement) {
                tableRowElement = findTableRowElement(rowData);
            }
            // Synchroniser fidèlement les valeurs éditées de la ligne
            if (tableRowElement) {
                const cells = tableRowElement.querySelectorAll('td[data-header]');
                cells.forEach(cell => {
                    const hName = cell.dataset.header;
                    if (hName && cell.classList.contains('editable')) {
                        rowData[hName] = (cell.textContent || '').trim();
                    }
                });
            }
            console.log("saveRow:",JSON.stringify(rowData).substring(0,100)+'...'); 
            displayAlert(''); 
            const btn=tableRowElement?.querySelector('.save-row-button'); 
            const indicator=tableRowElement?.querySelector('.save-indicator'); 
            const origBtnIcon = btn ? btn.querySelector('i')?.className || 'fas fa-check' : 'fas fa-check'; 
            if(indicator) indicator.style.display='none'; 
            if(btn){btn.innerHTML='<i class="fas fa-spinner fa-spin"></i>'; btn.disabled=true;} 
            try{ 
                if(!currentWeek){throw new Error(t('please_select_week'));} 
                const response=await fetch('/api/save-row',{
                    method:'POST',
                    headers:{'Content-Type':'application/json'},
                    body:JSON.stringify({
                        week:currentWeek,
                        data:rowData,
                        originalData: rowData._originalCopy || null,
                        section: rowData._section || currentSection
                    })
                }); 
                const result=await response.json(); 
                if(!response.ok){throw new Error(result.message||`Erreur ${response.status}`);} 
                rowData._originalCopy = { ...rowData };
                if(tableRowElement){
                    tableRowElement.classList.remove('modified');
                    tableRowElement.style.backgroundColor = '';
                } 
                if(indicator) indicator.style.display='inline-block'; 
                if(result.updatedData?.updatedAt&&tableRowElement){ 
                    const updK=findHKey('updatedAt'); 
                    if(updK){ 
                        rowData[updK]=result.updatedData.updatedAt; 
                        const updCell=tableRowElement.querySelector('.updated-at-column'); 
                        if(updCell){updCell.textContent=formatUpdatedAt(result.updatedData.updatedAt);} 
                    } 
                } 
                updateTeacherCounters();
            } catch(e){ 
                console.error('Erreur saveRow:',e); 
                displayAlert('error_saving_row', true, { error: e.message }); 
                if(indicator) indicator.style.display='none'; 
                if(tableRowElement) {
                    tableRowElement.style.backgroundColor = '#f8d7da';
                    tableRowElement.classList.add('modified');
                }
                updateTeacherCounters();
            } finally{
                if(btn){btn.innerHTML=`<i class="${origBtnIcon}"></i>`; btn.disabled=false;} 
                checkAndDisplayIncompleteTeachers();
            } 
        }

        async function saveAllDisplayedRows() { 
            const rowsToSave = (filteredAndSortedData || []).filter(r => r && !r.isReadOnlyCrossSection);
            if (!rowsToSave || rowsToSave.length === 0) { displayAlert('no_rows_to_save', true); return; } 
            if (!currentWeek) { displayAlert("please_select_week", true); return; } 
            const totalRows = rowsToSave.length; 
            const confirmation = confirm(t('confirm_save_all', { count: totalRows, week: currentWeek })); 
            if (!confirmation) { displayAlert('save_all_cancelled', false); return; } 
            displayAlert('saving_all_displayed', false, { count: totalRows }); 
            setButtonLoading('saveAllDisplayedBtn', true, 'fas fa-save'); 
            showProgressBar(); 
            updateProgressBar(15); 
            
            const tableBody = document.querySelector('#planTable tbody'); 
            if (tableBody) {
                const trList = tableBody.querySelectorAll('tr[data-row-index]');
                trList.forEach(tr => {
                    const rIdx = parseInt(tr.dataset.rowIndex, 10);
                    const rowObj = (filteredAndSortedData || [])[rIdx];
                    if (rowObj) {
                        const cells = tr.querySelectorAll('td[data-header]');
                        cells.forEach(cell => {
                            const hName = cell.dataset.header;
                            if (hName && cell.classList.contains('editable')) {
                                rowObj[hName] = (cell.textContent || '').trim();
                            }
                        });
                    }
                });
            }

            // 1. Tenter la sauvegarde atomique par lot via /api/save-rows-batch
            try {
                const batchResponse = await fetch('/api/save-rows-batch', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        week: currentWeek,
                        section: currentSection,
                        rows: rowsToSave.map(r => ({
                            data: r,
                            originalData: r._originalCopy || null
                        }))
                    })
                });

                if (batchResponse.ok) {
                    const batchResult = await batchResponse.json();
                    const savedAt = batchResult.savedAt || new Date().toISOString();
                    const updK = findHKey('updatedAt');

                    rowsToSave.forEach(rowData => {
                        rowData._originalCopy = { ...rowData };
                        if (updK) rowData[updK] = savedAt;
                    });

                    if (tableBody) {
                        const trList = tableBody.querySelectorAll('tr');
                        trList.forEach(tr => {
                            tr.classList.remove('modified');
                            tr.style.backgroundColor = '';
                            const indicator = tr.querySelector('.save-indicator');
                            if (indicator) indicator.style.display = 'inline-block';
                            const updCell = tr.querySelector('.updated-at-column');
                            if (updCell) updCell.textContent = formatUpdatedAt(savedAt);
                        });
                    }

                    updateProgressBar(100);
                    hideProgressBar();
                    setButtonLoading('saveAllDisplayedBtn', false, 'fas fa-save');
                    const successMsg = currentUserLanguage === 'ar'
                        ? `تم حفظ جميع الأسطر (${batchResult.updatedCount || totalRows}) بنجاح تام!`
                        : `Toutes les lignes (${batchResult.updatedCount || totalRows}) ont été enregistrées avec succès !`;
                    displayAlert(successMsg, false);
                    showToastNotification(successMsg, 'success');
                    updateTeacherCounters();
                    checkAndDisplayIncompleteTeachers();
                    return;
                }
            } catch (batchErr) {
                console.warn('Sauvegarde par lot indisponible, exécution séquentielle de repli:', batchErr);
            }

            // 2. Mode de repli résilient : enregistrement séquentiel sécurisé
            let successCount = 0; 
            let errorCount = 0; 
            for (let i = 0; i < totalRows; i++) { 
                const rowData = rowsToSave[i]; 
                updateProgressBar(Math.round(20 + ((i + 1) / totalRows) * 75)); 
                try { 
                    const response = await fetch('/api/save-row', { 
                        method: 'POST', 
                        headers: { 'Content-Type': 'application/json' }, 
                        body: JSON.stringify({ 
                            week: currentWeek, 
                            data: rowData, 
                            originalData: rowData._originalCopy || null,
                            section: rowData._section || currentSection 
                        }) 
                    }); 
                    const result = await response.json(); 
                    if (!response.ok) { throw new Error(result.message || `Erreur ${response.status} L${i + 1}`); } 
                    rowData._originalCopy = { ...rowData };
                    successCount++; 
                    const tr = findTableRowElement(rowData, i); 
                    if (tr) { 
                        tr.classList.remove('modified'); 
                        tr.style.backgroundColor = ''; 
                        const indicator = tr.querySelector('.save-indicator'); 
                        if (indicator) indicator.style.display = 'inline-block'; 
                        if (result.updatedData?.updatedAt) { 
                            const updK = findHKey('updatedAt'); 
                            if (updK) { 
                                rowData[updK] = result.updatedData.updatedAt; 
                                const updCell = tr.querySelector('.updated-at-column'); 
                                if (updCell) updCell.textContent = formatUpdatedAt(result.updatedData.updatedAt); 
                            } 
                        } 
                    } 
                } catch (error) { 
                    console.error(`Err L${i + 1}:`, error); 
                    errorCount++; 
                    const tr = findTableRowElement(rowData, i); 
                    if(tr) { 
                        tr.style.backgroundColor = '#f8d7da'; 
                        tr.classList.add('modified'); 
                        const indicator = tr.querySelector('.save-indicator'); 
                        if(indicator) indicator.style.display = 'none'; 
                    } 
                } 
            } 
            updateProgressBar(100); 
            hideProgressBar(); 
            setButtonLoading('saveAllDisplayedBtn', false, 'fas fa-save'); 
            if (errorCount === 0) { 
                displayAlert('save_all_success', false, { count: successCount }); 
                showToastNotification(`${successCount} lignes enregistrées avec succès !`, 'success');
            } else { 
                displayAlert('save_all_partial', true, { success: successCount, error: errorCount }); 
                showToastNotification(`${successCount} lignes sauvegardées, ${errorCount} erreurs.`, 'warning');
            } 
            updateTeacherCounters();
            checkAndDisplayIncompleteTeachers(); 
        }
        async function generateWordByClasse() { 
            const dataGen = (filteredAndSortedData || []).filter(i => i && !i.isReadOnlyCrossSection); 
            if(!dataGen || dataGen.length === 0){ displayAlert("no_data_to_display_filters", true); return; } 
            if(!currentWeek){displayAlert("please_select_week",true); return;} 
            setButtonLoading('generateWordBtn', true, 'fas fa-file-word'); 
            const dataCls = {}; 
            const clsK = findHKey('Classe'); 
            if (!clsK) { displayAlert("error_config_columns", true); setButtonLoading('generateWordBtn', false, 'fas fa-file-word'); return; } 
            dataGen.forEach(i => { if (!i || !i[clsK]) return; const cl = i[clsK]; if (!dataCls[cl]) { dataCls[cl] = []; } dataCls[cl].push(i); }); 
            const clsGen = Object.keys(dataCls); 
            if (clsGen.length === 0) { displayAlert("no_data", true); setButtonLoading('generateWordBtn', false, 'fas fa-file-word'); return; } 
            displayAlert('generating_word', false, { count: clsGen.length }); 
            showProgressBar(); 
            updateProgressBar(0); 
            let ok = 0, err = 0; 
            const total = clsGen.length; 
            for (let i = 0; i < total; i++) { 
                const cl = clsGen[i]; 
                const clData = dataCls[cl]; 
                const clNote = weeklyClassNotes[cl] || ""; 
                updateProgressBar(Math.round(((i + 1) / total) * 100)); 
                try { 
                    const payload = { week: currentWeek, classe: cl, data: clData, notes: clNote, section: currentSection }; 
                    const r = await fetch('/api/generate-word', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }); 
                    if (r.ok) { 
                        const blob = await r.blob(); 
                        const cd = r.headers.get('content-disposition'); 
                        let filename = `plan_s${currentWeek}_${cl.replace(/[^a-z0-9]/gi, '_')}.docx`; 
                        if (cd) { 
                            const m = cd.match(/filename="?(.+?)"?(;|$)/i); 
                            if (m && m[1]) filename = m[1]; 
                        } 
                        if (typeof saveAs === 'function') { 
                            try { 
                                saveAs(blob, filename); 
                                ok++; 
                            } catch (e) { 
                                err++; 
                                console.error(`SaveAs ${cl}:`, e); 
                                displayAlert(t('error', {error: `Err sauvegarde ${cl}: ${e.message}`}), true); 
                            } 
                        } else { 
                            err++; 
                            console.error("saveAs non défini!"); 
                            displayAlert(t('error', {error: "saveAs non trouvé."}), true); 
                            break; 
                        } 
                    } else { 
                        const d = await r.json().catch(() => ({ message: `Erreur ${r.status}` })); 
                        console.error(`Err Word ${cl}:`, r.status, d); 
                        if (d.message && d.message.includes('Dates non trouvées côté serveur')) { 
                            displayAlert('no_word_dates', true, {week: currentWeek}); 
                            err++; 
                        } else { 
                            displayAlert('error_generating_word_for', true, {classe: cl, error: (d.message || 'Inconnue')}); 
                            err++; 
                        } 
                    } 
                } catch (e) { 
                    err++; 
                    console.error(`Err Fetch Word ${cl}:`, e); 
                    displayAlert('error', true, { error: `Erreur réseau Word ${cl}: ${e.message}` }); 
                } 
            } 
            hideProgressBar(); 
            setButtonLoading('generateWordBtn', false, 'fas fa-file-word'); 
            if (ok > 0 && err === 0) { displayAlert('generating_word_success', false, { count: ok }); } 
            else if (ok > 0 && err > 0) { displayAlert('generating_word_partial', true, { ok: ok, err: err }); } 
            else if (ok === 0 && err > 0) { if (err > 1) { displayAlert('generating_word_failed', true, {err: err}); } } 
            else if (ok === 0 && err === 0) { displayAlert("no_data", true); } 
        }
        async function generateExcelWorkbook() {
            if (!currentWeek) { displayAlert("please_select_week", true); return; }
            const section = currentSection || 'garcons';
            const selClass = document.getElementById('filterClasse')?.value || '';
            const dataToExport = (filteredAndSortedData && filteredAndSortedData.length > 0) 
                ? filteredAndSortedData.filter(i => i && !i.isReadOnlyCrossSection) 
                : undefined;

            setButtonLoading('generateExcelBtn', true, 'fas fa-file-excel');
            displayAlert('generating_excel', false, { week: currentWeek });
            showProgressBar();
            updateProgressBar(10);
            let err = 0;
            try {
                const payload = {
                    week: Number(currentWeek),
                    section: section,
                    classe: selClass || undefined,
                    data: dataToExport,
                    notes: weeklyClassNotes
                };
                const r = await fetch('/api/generate-excel-workbook', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                updateProgressBar(70);
                if (r.ok) {
                    const blob = await r.blob();
                    const cd = r.headers.get('content-disposition');
                    let filename = `Plan_Hebdomadaire_S${currentWeek}_${section}${selClass ? '_' + selClass : '_Complet'}.xlsx`;
                    if (cd) {
                        const m = cd.match(/filename="?(.+?)"?(;|$)/i);
                        if (m && m[1]) filename = m[1];
                    }
                    if (typeof saveAs === 'function') {
                        try {
                            saveAs(blob, filename);
                            updateProgressBar(100);
                            displayAlert('generating_excel_success', false, { filename: filename });
                        } catch (e) {
                            err++;
                            console.error(`SaveAs Excel:`, e);
                            displayAlert(t('error', { error: `Err sauvegarde Excel: ${e.message}` }), true);
                            updateProgressBar(0);
                        }
                    } else {
                        const url = window.URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.style.display = 'none';
                        a.href = url;
                        a.download = filename;
                        document.body.appendChild(a);
                        a.click();
                        window.URL.revokeObjectURL(url);
                        document.body.removeChild(a);
                        updateProgressBar(100);
                        displayAlert('generating_excel_success', false, { filename: filename });
                    }
                } else {
                    const d = await r.json().catch(() => ({ message: `Err ${r.status}` }));
                    console.error(`Err Excel Wb:`, r.status, d);
                    displayAlert('error_generating_excel', true, { error: (d.message || 'Inconnue') });
                    updateProgressBar(0);
                    err++;
                }
            } catch (e) {
                err++;
                console.error(`Err Fetch Excel Wb:`, e);
                displayAlert('error', { error: `Err réseau Excel: ${e.message}` }, true);
                updateProgressBar(0);
            } finally {
                hideProgressBar();
                setButtonLoading('generateExcelBtn', false, 'fas fa-file-excel');
            }
        }
        async function loadPlanForWeek() { const sel = document.getElementById('weekSelector'); if (sel) { const wk = sel.value; if (wk) { await fetchPlanData(wk); } else { currentWeek = null; planData = []; headers = []; weeklyClassNotes = {}; filteredAndSortedData = []; createTableHeader(); displayPlanTable([]); document.getElementById('weekDateRange').textContent = ""; updateActionButtonsState(false); populateFilterOptions(); populateNotesClassSelector(); checkAndDisplayIncompleteTeachers(); displayAlert(''); } } else { console.error("#weekSelector absent"); displayAlert("error_structure", true); } }
        function applyLanguageSettings() { console.log(`Applying language: ${currentUserLanguage}`); document.documentElement.lang = currentUserLanguage; document.body.dir = (currentUserLanguage === 'ar') ? 'rtl' : 'ltr'; updateStaticUIElements(); if (currentWeek) { updateDynamicUIElements(); } else { document.getElementById('weekDateRange').textContent = ""; const initialTableMsg = document.getElementById('initial-table-message'); if (initialTableMsg) { initialTableMsg.textContent = t('select_week_to_display'); } else { const tBody = document.querySelector('#planTable tbody'); const colspanVal = document.querySelector('#planTable thead tr')?.querySelectorAll('th').length || 10; if (tBody) { tBody.innerHTML = `<tr id="initial-table-row"><td colspan="${colspanVal}" class="table-message">${t('select_week_to_display')}</td></tr>`; } } } if (document.getElementById('login-form').style.display !== 'none') { updateLoginUIElements(); } }
        function updateStaticUIElements() { console.log("Updating static UI for lang:", currentUserLanguage); if (document.getElementById('main-content').style.display !== 'none') { document.title = t('main_page_title'); } else { document.title = t('login_title'); } updateLoginUIElements(); const mainTitle = document.getElementById('main-title'); if(mainTitle) mainTitle.textContent = t('main_page_title'); const logoutBtnText = document.querySelector('#logout-button .btn-text'); if(logoutBtnText) logoutBtnText.textContent = t('logout_button'); const toggleBtn = document.getElementById('toggleIncompleteBtn'); if (toggleBtn) { const btnTextSpan = toggleBtn.querySelector('.btn-text'); const listDiv=document.getElementById('incompleteTeachersDisplay'); if (btnTextSpan) { btnTextSpan.textContent = (listDiv && listDiv.style.display !== 'none') ? t('hide_incomplete') : t('display_incomplete'); } } const incompleteH4 = document.querySelector('#incompleteTeachersDisplay h4'); if(incompleteH4) incompleteH4.textContent = t('incomplete_teachers_title'); const incompleteLi = document.querySelector('#incompleteList li'); if(incompleteLi && incompleteLi.textContent.match(/(Chargement|Loading|جاري التحميل)/)) incompleteLi.textContent = t('loading'); const weekLabel = document.querySelector('label[for="weekSelector"]'); if(weekLabel) weekLabel.innerHTML = `<i class="fas fa-calendar-week"></i> ${t('week_label')}`; const adminTitle = document.getElementById('admin-title'); if(adminTitle) adminTitle.textContent = t('admin_actions_title'); const adminExcelLabel = document.getElementById('admin-excel-label'); if(adminExcelLabel) adminExcelLabel.innerHTML = `<i class="fas fa-file-excel"></i> ${t('admin_excel_label')}`; const saveUploadedDataBtnText = document.querySelector('#saveUploadedDataBtn .btn-text'); if(saveUploadedDataBtnText) saveUploadedDataBtnText.textContent = t('admin_save_button'); const genWordBtnText = document.querySelector('#generateWordBtn .btn-text'); if(genWordBtnText) genWordBtnText.textContent = t('generate_word_button'); const genExcelBtnText = document.querySelector('#generateExcelBtn .btn-text'); if(genExcelBtnText) genExcelBtnText.textContent = t('generate_excel_button'); const saveAllBtnText = document.querySelector('#saveAllDisplayedBtn .btn-text'); if(saveAllBtnText) saveAllBtnText.textContent = t('save_all_button'); const weeklyLessonsBtnText = document.querySelector('#generateWeeklyLessonsBtn .btn-text'); if(weeklyLessonsBtnText) weeklyLessonsBtnText.textContent = t('generate_weekly_lessons_button'); const filterEnsLabel = document.getElementById('filter-enseignant-label'); if(filterEnsLabel) filterEnsLabel.innerHTML = `<i class="fas fa-user-tie"></i> ${t('filter_teacher_label')}`; const filterClsLabel = document.getElementById('filter-classe-label'); if(filterClsLabel) filterClsLabel.innerHTML = `<i class="fas fa-chalkboard-user"></i> ${t('filter_class_label')}`; const filterMatLabel = document.getElementById('filter-matiere-label'); if(filterMatLabel) filterMatLabel.innerHTML = `<i class="fas fa-book"></i> ${t('filter_material_label')}`; const filterPerLabel = document.getElementById('filter-periode-label'); if(filterPerLabel) filterPerLabel.innerHTML = `<i class="fas fa-clock"></i> ${t('filter_period_label')}`; const filterJourLabel = document.getElementById('filter-jour-label'); if(filterJourLabel) filterJourLabel.innerHTML = `<i class="fas fa-calendar-day"></i> ${t('filter_day_label')}`; const notesClsLabel = document.getElementById('notes-class-label'); if(notesClsLabel) notesClsLabel.innerHTML = `<i class="fas fa-sticky-note"></i> ${t('notes_for_class')}`; const notesInput = document.getElementById('notesInput'); if(notesInput && notesInput.placeholder.match(/(Sélectionnez|اختر|Select)/)){ notesInput.placeholder = t('select_class_placeholder'); } const saveNotesBtnText = document.querySelector('#saveNotesBtn .btn-text'); if(saveNotesBtnText) saveNotesBtnText.textContent = t('save_notes_button'); updateFilterOptionDefaultTexts(); const adminReportLabel = document.getElementById('admin-report-class-label'); if (adminReportLabel) adminReportLabel.innerHTML = `<i class="fas fa-school"></i> ${t('admin_report_class_label')}`; const adminReportBtnText = document.querySelector('#generateFullReportBtn .btn-text'); if (adminReportBtnText) adminReportBtnText.textContent = t('generate_full_report_button'); }
        function updateLoginUIElements() { const loginH1 = document.querySelector('#login-form h1'); if(loginH1) loginH1.textContent = t('login_title'); const userLabel = document.querySelector('label[for="username"]'); if(userLabel) userLabel.textContent = t('login_username_label'); const passLabel = document.querySelector('label[for="password"]'); if(passLabel) passLabel.textContent = t('login_password_label'); const rememberLabel = document.getElementById('remember-me-label'); if(rememberLabel) rememberLabel.textContent = t('remember_me'); const loginBtnText = document.querySelector('#login-button .btn-text'); if(loginBtnText) loginBtnText.textContent = t('login_button_text'); if (document.getElementById('login-form').style.display !== 'none') { document.title = t('login_title'); } }
        function updateDynamicUIElements() { console.log("Updating dynamic UI for lang:", currentUserLanguage); const dateRangeEl=document.getElementById('weekDateRange'); const weekNum = parseInt(currentWeek, 10); const dates = specificWeekDateRanges[weekNum]; if(weekStartDate && dates?.end){ const s = weekStartDate; const e = new Date(dates.end+'T00:00:00Z'); if(!isNaN(s.getTime())&&!isNaN(e.getTime())){ dateRangeEl.textContent = `${t('week_label')} ${currentWeek} : ${isArabicUser() ? 'من' : (currentUserLanguage === 'en' ? 'From' : 'Du')} ${formatDateForDisplay(s)} ${isArabicUser() ? 'إلى' : (currentUserLanguage === 'en' ? 'to' : 'à')} ${formatDateForDisplay(e)}`; } else { dateRangeEl.textContent=`${t('week_label')} ${currentWeek} (Err dates)`; } } else { dateRangeEl.textContent=`${t('week_label')} ${currentWeek} (${t('no_data')}: dates non définies)`; } createTableHeader(); displayPlanTable(filteredAndSortedData); const notesInput = document.getElementById('notesInput'); const notesClassSel = document.getElementById('notesClassSelector'); if (notesInput && notesClassSel) { if (notesClassSel.value) { const selText = notesClassSel.options[notesClassSel.selectedIndex].text; notesInput.placeholder = t('notes_placeholder', { classText: selText }); } else { notesInput.placeholder = t('select_class_placeholder'); } } }

        function switchAdminTab(tabName) {
            const tabs = ['upload', 'teachers', 'calendar', 'students', 'reports', 'messages', 'publication', 'special_days', 'schedule', 'teachers_photos'];
            tabs.forEach(t => {
                const contentEl = document.getElementById(`adminTab_${t}`);
                const btnEl = document.getElementById(`tabBtn_${t}`);
                if (contentEl) contentEl.style.display = (t === tabName) ? 'block' : 'none';
                if (btnEl) {
                    if (t === tabName) btnEl.classList.add('active');
                    else btnEl.classList.remove('active');
                }
            });
            if (tabName === 'teachers') {
                const filterEl = document.getElementById('adminSectionFilter');
                if (filterEl && (!filterEl.value || filterEl.value === '')) {
                    filterEl.value = currentSection || 'garcons';
                }
                if (typeof loadAdminUsersList === 'function') loadAdminUsersList();
            } else if (tabName === 'teachers_photos') {
                if (typeof renderAdminTeachersPhotosGallery === 'function') renderAdminTeachersPhotosGallery();
            } else if (tabName === 'calendar') {
                populateAdminWeekSelectToEdit();
                renderAdminWeeksTable();
            } else if (tabName === 'students') {
                if (typeof loadAdminStudentsList === 'function') loadAdminStudentsList();
            } else if (tabName === 'reports') {
                populateAdminReportClassSelector();
            } else if (tabName === 'upload') {
                const secSelect = document.getElementById('adminUploadSectionSelect');
                if (secSelect && currentSection) {
                    secSelect.value = currentSection;
                }
                populateAdminUploadWeekSelector();
                updateUploadTargetInfo();
            } else if (tabName === 'messages') {
                if (typeof loadAdminAllMessages === 'function') loadAdminAllMessages();
            } else if (tabName === 'publication') {
                if (typeof loadAdminPublicationStatus === 'function') loadAdminPublicationStatus();
            } else if (tabName === 'special_days') {
                if (typeof populateAdminSpecialDaysForm === 'function') populateAdminSpecialDaysForm();
                if (typeof loadAdminSpecialDaysList === 'function') loadAdminSpecialDaysList();
            } else if (tabName === 'schedule') {
                if (typeof initAdminScheduleTab === 'function') initAdminScheduleTab();
            }
        }

        function initializeApp(username, customLang, role, tableTeacherName) {
            loggedInUser = username;
            if (typeof tableTeacherName !== 'undefined') {
                loggedInTeacherTable = tableTeacherName || '';
                localStorage.setItem('tableTeacherName', loggedInTeacherTable);
            } else {
                loggedInTeacherTable = localStorage.getItem('tableTeacherName') || '';
            }
            currentUserRole = role || localStorage.getItem('userRole') || (username === 'Med01' ? 'admin' : (username === 'Racha' ? 'supervisor' : 'teacher'));
            localStorage.setItem('userRole', currentUserRole);
            
            if (customLang && ['fr', 'ar', 'en'].includes(customLang)) {
                currentUserLanguage = customLang;
            } else {
                const storedLang = localStorage.getItem('userLanguage');
                if (storedLang && ['fr', 'ar', 'en'].includes(storedLang)) {
                    currentUserLanguage = storedLang;
                } else if (arabicTeachers.includes(loggedInUser)) {
                    currentUserLanguage = 'ar';
                } else if (englishTeachers.includes(loggedInUser)) {
                    currentUserLanguage = 'en';
                } else {
                    currentUserLanguage = 'fr';
                }
            }
            
            if (isDualSectionTeacher(loggedInUser)) {
                if (currentSection !== 'filles' && currentSection !== 'primaire') {
                    currentSection = 'filles';
                    localStorage.setItem('selectedSection', 'filles');
                    localStorage.setItem('currentSection', 'filles');
                }
            }

            console.log(`Initialisation pour ${loggedInUser} (Role: ${currentUserRole}, Section: ${currentSection}, Lang: ${currentUserLanguage})`);
            
            // Mode enseignant/admin actif (verrouillage de la section choisie et restriction espace parent)
            applyParentUIMode(false);
            
            const sectionSel = document.getElementById('section-selection');
            if (sectionSel) sectionSel.style.display = 'none';
            document.getElementById('login-form').style.display = 'none';
            document.getElementById('main-content').style.display = 'block';
            
            updateSectionBadges();
            updateDualTeacherSectionButtons();
            applyLanguageSettings();
            
            const roleBadge = currentUserRole === 'admin' ? ' [Administrateur Principal]' : (currentUserRole === 'supervisor' ? ' [Superviseur Direction]' : '');
            document.getElementById('loggedInUserInfo').textContent = t('connected_as', { user: loggedInUser }) + roleBadge;
            if (typeof loadCurrentUserAvatar === 'function') loadCurrentUserAvatar(loggedInUser);
            
            const isAdminUser = (currentUserRole === 'admin' || loggedInUser === 'Med01');
            const isSupervisorUser = (currentUserRole === 'supervisor' || loggedInUser === 'Racha');
            const hasAdminAccess = isAdminUser || isSupervisorUser;

            if (hasAdminAccess) { 
                const adminActionsEl = document.getElementById('admin-actions');
                if (adminActionsEl) adminActionsEl.style.display = 'block';

                const tabUpload = document.getElementById('tabBtn_upload');
                const tabTeachers = document.getElementById('tabBtn_teachers');
                const tabCalendar = document.getElementById('tabBtn_calendar');
                const tabStudents = document.getElementById('tabBtn_students');
                const tabReports = document.getElementById('tabBtn_reports');
                const tabMessages = document.getElementById('tabBtn_messages');
                const tabPublication = document.getElementById('tabBtn_publication');
                const tabPhotos = document.getElementById('tabBtn_teachers_photos');

                if (isSupervisorUser && !isAdminUser) {
                    // Masquer pour Racha les 5 boutons spécifiés
                    if (tabUpload) tabUpload.style.display = 'none';
                    if (tabTeachers) tabTeachers.style.display = 'none';
                    if (tabCalendar) tabCalendar.style.display = 'none';
                    if (tabStudents) tabStudents.style.display = 'none';
                    if (tabReports) tabReports.style.display = 'none';
                    if (tabPhotos) tabPhotos.style.display = 'none';
                    if (tabMessages) tabMessages.style.display = 'inline-flex';
                    if (tabPublication) tabPublication.style.display = 'inline-flex';

                    switchAdminTab('messages');
                } else {
                    // Admin Med01 voit l'ensemble des onglets
                    if (tabUpload) tabUpload.style.display = 'inline-flex';
                    if (tabTeachers) tabTeachers.style.display = 'inline-flex';
                    if (tabCalendar) tabCalendar.style.display = 'inline-flex';
                    if (tabStudents) tabStudents.style.display = 'inline-flex';
                    if (tabReports) tabReports.style.display = 'inline-flex';
                    if (tabMessages) tabMessages.style.display = 'inline-flex';
                    if (tabPublication) tabPublication.style.display = 'inline-flex';
                    if (tabPhotos) tabPhotos.style.display = 'inline-flex';

                    const adminSecSel = document.getElementById('adminUploadSectionSelect');
                    if (adminSecSel && currentSection) {
                        adminSecSel.value = currentSection;
                    }
                    populateAdminUploadWeekSelector();
                    switchAdminTab('upload');
                }

                const lessonPlanGen = document.getElementById('lesson-plan-generator');
                if (lessonPlanGen) lessonPlanGen.style.display = 'flex';
            } else {
                const adminActionsEl = document.getElementById('admin-actions');
                if (adminActionsEl) adminActionsEl.style.display = 'none';
                const lessonPlanGen = document.getElementById('lesson-plan-generator');
                if (lessonPlanGen) lessonPlanGen.style.display = 'flex';
            }
            
            currentWeek = null;
            planData = [];
            headers = [];
            weeklyClassNotes = {};
            filteredAndSortedData = [];
            document.getElementById('weekSelector').value = "";
            
            createTableHeader();
            displayPlanTable([]);
            populateFilterOptions();
            populateNotesClassSelector();
            checkAndDisplayIncompleteTeachers();
            updateActionButtonsState(false);
            
            displayAlert('welcome_user', false, { user: loggedInUser });
            
            // Charger automatiquement la SEMAINE PROCHAINE par défaut pour les enseignants (pour qu'ils préparent les cours à l'avance)
            const defaultWeekNum = getTeacherDefaultWeekNumber();
            if (defaultWeekNum) {
                const weekToLoad = defaultWeekNum;
                
                console.log(`📅 Espace Enseignant - Semaine par défaut (Semaine prochaine): Semaine ${weekToLoad} (L'enseignant peut toujours changer de semaine)`);
                document.getElementById('weekSelector').value = weekToLoad;
                setTimeout(async () => {
                    await loadPlanForWeek();
                    if (Object.keys(incompleteTeachersInfo).length > 0) {
                        const listDiv = document.getElementById('incompleteTeachersDisplay');
                        const btn = document.getElementById('toggleIncompleteBtn');
                        // Règle 6 : Laisser par défaut la liste des manques NON affichée
                        if (listDiv && btn) {
                            listDiv.style.display = 'none';
                            btn.querySelector('i').className = 'fas fa-list-check';
                            const btnTextSpan = btn.querySelector('.btn-text');
                            if (btnTextSpan) btnTextSpan.textContent = t('display_incomplete');
                        }

                        // Règle 6 : Réduire l'alerte à au maximum UNE SEULE FOIS PAR JOUR
                        const todayDateStr = new Date().toISOString().slice(0, 10);
                        const alertStorageKey = 'last_incomplete_alert_date_' + (loggedInUser || 'user') + '_' + weekToLoad;
                        const lastAlertDate = localStorage.getItem(alertStorageKey);

                        if (lastAlertDate !== todayDateStr) {
                            displayAlert(`⚠️ Attention: ${Object.keys(incompleteTeachersInfo).length} enseignant(s) n'ont pas encore terminé leurs travaux de classe pour cette semaine!`, true);
                            await notifyIncompleteTeachers(weekToLoad, incompleteTeachersInfo);
                            localStorage.setItem(alertStorageKey, todayDateStr);
                        } else {
                            console.log(`ℹ️ [Alerte Incomplets] Alerte quotidienne déjà affichée aujourd'hui (${todayDateStr}) pour la semaine ${weekToLoad}.`);
                        }
                    }
                }, 500);
            }
            
            if (typeof window.NotificationManager !== 'undefined') {
                console.log('🔔 Initialisation des notifications push...');
                setTimeout(() => {
                    window.NotificationManager.initialize(loggedInUser).catch(err => {
                        console.error('❌ Erreur initialisation notifications:', err);
                    });
                }, 1000);
            }
            if (typeof checkTeacherUnreadMessagesNotification === 'function') {
                checkTeacherUnreadMessagesNotification();
            }
        }
        
        async function handleLogin() {
            const usernameInput = document.getElementById('username');
            const passwordInput = document.getElementById('password');
            const loginButton = document.getElementById('login-button');
            const errorDiv = document.getElementById('login-error');
            const username = usernameInput.value.trim();
            const password = passwordInput.value;
            
            if (!username || !password) {
                errorDiv.textContent = "Entrez nom d'utilisateur et mot de passe.";
                errorDiv.style.display = 'block';
                return;
            }
            
            errorDiv.style.display = 'none';
            setButtonLoading('login-button', true, 'fas fa-sign-in-alt');
            
            try {
                console.log(`Tentative de connexion pour ${username} (Section: ${currentSection})`);
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 10000);
                
                const response = await fetch('/api/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, password, section: currentSection }),
                    signal: controller.signal
                });
                
                clearTimeout(timeoutId);
                
                const result = await response.json();
                console.log("Réponse serveur:", response.status, result);
                
                if (response.ok && result.success) {
                    localStorage.setItem('loggedInUser', result.username);
                    localStorage.setItem('tableTeacherName', result.tableTeacherName || '');
                    loggedInTeacherTable = result.tableTeacherName || '';
                    localStorage.setItem('authVersion', AUTH_VERSION.toString());
                    if (result.role) {
                        localStorage.setItem('userRole', result.role);
                    }
                    if (result.language) {
                        localStorage.setItem('userLanguage', result.language);
                    }
                    if (result.section) {
                        currentSection = result.section;
                        localStorage.setItem('selectedSection', result.section);
                    }
                    initializeApp(result.username, result.language, result.role, result.tableTeacherName);
                } else {
                    errorDiv.textContent = result.message || "Échec connexion.";
                    errorDiv.style.display = 'block';
                    localStorage.removeItem('loggedInUser');
                    localStorage.removeItem('tableTeacherName');
                    loggedInTeacherTable = '';
                    localStorage.removeItem('userRole');
                }
            } catch (error) {
                console.error("Erreur connexion fetch:", error);
                
                if (error.name === 'AbortError') {
                    errorDiv.textContent = "Délai d'attente dépassé. Le serveur ne répond pas. Vérifiez votre connexion Internet ou contactez l'administrateur.";
                } else if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
                    errorDiv.textContent = "Erreur réseau. Impossible de contacter le serveur. Vérifiez votre connexion Internet ou que le serveur est déployé correctement.";
                } else {
                    errorDiv.textContent = "Erreur communication serveur: " + error.message;
                }
                errorDiv.style.display = 'block';
            } finally {
                setButtonLoading('login-button', false, 'fas fa-sign-in-alt');
            }
        }

        function handleLogout() {
            console.log("Déconnexion par:", loggedInUser);
            localStorage.removeItem('loggedInUser');
            localStorage.removeItem('tableTeacherName');
            localStorage.removeItem('userRole');
            localStorage.removeItem('authVersion');
            localStorage.removeItem('userLanguage');
            
            loggedInUser = null;
            loggedInTeacherTable = '';
            currentUserRole = null;
            currentWeek = null;
            planData = [];
            headers = [];
            weeklyClassNotes = {};
            filteredAndSortedData = [];
            incompleteTeachersInfo = {};
            uploadedPlanData = null;
            
            document.getElementById('main-content').style.display = 'none';
            document.getElementById('login-form').style.display = 'none';
            const sectionSel = document.getElementById('section-selection');
            if (sectionSel) sectionSel.style.display = 'flex';
            
            document.getElementById('username').value = '';
            document.getElementById('password').value = '';
            document.getElementById('login-error').textContent = '';
            document.getElementById('login-error').style.display = 'none';
            
            currentUserLanguage = 'fr';
            applyLanguageSettings();
            displayAlert('');
            hideProgressBar();

            const headerBtn = document.getElementById('teacherHeaderMsgBtn');
            if (headerBtn) headerBtn.style.display = 'none';
            const headerBadge = document.getElementById('teacherHeaderMsgBadge');
            if (headerBadge) headerBadge.style.display = 'none';
            
            console.log("État appli réinitialisé après logout.");
        }

        // --- Fonctions Admin de Supervision ---
        let allAdminUsersCache = [];

        async function loadAdminUsersList() {
            const filterEl = document.getElementById('adminSectionFilter');
            const targetSection = (filterEl && filterEl.value) ? filterEl.value : (currentSection || 'garcons');
            const container = document.getElementById('usersTableContainer');
            if (!container) return;
            
            container.innerHTML = '<p style="text-align:center; padding:15px;"><i class="fas fa-spinner fa-spin"></i> Chargement de la liste des enseignants...</p>';
            
            try {
                const response = await fetch(`/api/admin/users?section=${targetSection}`);
                if (!response.ok) throw new Error(`Erreur ${response.status}`);
                const users = await response.json();
                allAdminUsersCache = users || [];
                renderAdminUsersTable(allAdminUsersCache);
            } catch (err) {
                console.error("Erreur chargement utilisateurs:", err);
                container.innerHTML = `<p style="color:red; padding:15px; text-align:center;">Erreur: ${err.message}</p>`;
            }
        }

        function renderAdminUsersTable(users) {
            const container = document.getElementById('usersTableContainer');
            if (!container) return;

            if (!users || users.length === 0) {
                container.innerHTML = '<p class="table-message" style="text-align:center; padding:15px;">Aucun enseignant trouvé pour cette section.</p>';
                return;
            }
            
            const langLabels = {
                fr: { flag: '🇫🇷', label: 'Français', cls: 'lang-badge-fr' },
                ar: { flag: '🇸🇦', label: 'العربية', cls: 'lang-badge-ar' },
                en: { flag: '🇬🇧', label: 'English', cls: 'lang-badge-en' }
            };

            let html = `
                <table class="users-table">
                    <thead>
                        <tr>
                            <th>Nom d'utilisateur (Accès)</th>
                            <th>Nom de l'Enseignant (Tableau & Tri)</th>
                            <th>Mot de passe</th>
                            <th>Section</th>
                            <th>Langue par défaut</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
            `;
            
            users.forEach(u => {
                const secLabel = u.section === 'garcons' ? '👦 Garçons' : (u.section === 'primaire' ? '👶🎒 Primaire' : '👧 Filles');
                const userLang = u.language || (arabicTeachers.includes(u.username) ? 'ar' : (englishTeachers.includes(u.username) ? 'en' : 'fr'));
                const langInfo = langLabels[userLang] || langLabels.fr;
                const safeUsername = (u.username || '').replace(/'/g, "\\'");
                const safeTableTeacher = (u.tableTeacherName || '').replace(/'/g, "\\'");
                const safePassword = (u.password || '').replace(/'/g, "\\'");
                const safePhotoUrl = (u.photoUrl || '').replace(/'/g, "\\'");
                
                const photoThumb = u.photoUrl ? `<img src="${formatGoogleDriveImageUrl(u.photoUrl)}" style="width:26px; height:26px; border-radius:50%; object-fit:cover; margin-right:6px; vertical-align:middle; border:1.5px solid #3B82F6;" alt="Photo" onerror="this.style.display='none'">` : `<span style="width:26px; height:26px; border-radius:50%; background:#E2E8F0; color:#64748B; display:inline-flex; align-items:center; justify-content:center; font-size:0.75rem; margin-right:6px; vertical-align:middle;"><i class="fas fa-user"></i></span>`;
                
                const hasCustomTableTeacher = u.tableTeacherName && u.tableTeacherName.trim() !== '' && u.tableTeacherName.trim().toLowerCase() !== u.username.trim().toLowerCase();
                const tableTeacherBadge = hasCustomTableTeacher
                    ? `<span style="background:#EEF2FF; color:#3730A3; border:1px solid #C7D2FE; font-weight:700; padding:4px 9px; border-radius:6px; display:inline-flex; align-items:center; gap:5px;"><i class="fas fa-chalkboard-teacher" style="color:#4F46E5;"></i> ${escapeHtml(u.tableTeacherName)} <span style="font-size:0.72rem; background:#4F46E5; color:white; padding:1px 5px; border-radius:4px; margin-left:3px;">Tableau</span></span>`
                    : `<span style="color:#475569; font-size:0.88rem; display:inline-flex; align-items:center; gap:4px;"><i class="fas fa-check-circle" style="color:#10B981;"></i> ${escapeHtml(u.username)} <span style="color:#64748B; font-size:0.75rem;">(Même nom)</span></span>`;
                
                html += `
                    <tr>
                        <td><strong>${photoThumb}${escapeHtml(u.username)}</strong></td>
                        <td>${tableTeacherBadge}</td>
                        <td><code style="background:#F1F5F9; padding:3px 8px; border-radius:6px; font-weight:700; color:#0F172A;">${escapeHtml(u.password || 'Non défini')}</code></td>
                        <td><span style="font-weight:600;">${secLabel}</span></td>
                        <td>
                            <span class="lang-badge ${langInfo.cls}">
                                ${langInfo.flag} ${langInfo.label}
                            </span>
                        </td>
                        <td>
                            <button type="button" class="pro-button primary-button" onclick="adminEditUserPrefill('${safeUsername}', '${safePassword}', '${u.section}', '${userLang}', '${safeTableTeacher}', '${safePhotoUrl}')" style="padding:4px 9px; font-size:0.8rem; margin-right:5px;">
                                <i class="fas fa-edit"></i> Modifier
                            </button>
                            <button type="button" class="btn-sm-delete" onclick="adminDeleteUser('${safeUsername}', '${u.section}')" style="padding:4px 9px; font-size:0.8rem;">
                                <i class="fas fa-trash-alt"></i> Supprimer
                            </button>
                        </td>
                    </tr>
                `;
            });
            
            html += `</tbody></table>`;
            container.innerHTML = html;
        }

        function filterAdminTeachersTable() {
            const searchInput = document.getElementById('adminTeacherSearchInput');
            const query = searchInput ? searchInput.value.toLowerCase().trim() : '';
            if (!query) {
                renderAdminUsersTable(allAdminUsersCache);
                return;
            }
            const filtered = allAdminUsersCache.filter(u => 
                (u.username && u.username.toLowerCase().includes(query)) ||
                (u.tableTeacherName && u.tableTeacherName.toLowerCase().includes(query)) ||
                (u.language && u.language.toLowerCase().includes(query)) ||
                (u.password && u.password.toLowerCase().includes(query))
            );
            renderAdminUsersTable(filtered);
        }

        function adminEditUserPrefill(username, password, section, language, tableTeacherName, photoUrl) {
            const userInput = document.getElementById('adminNewUsername');
            const tableTeacherInput = document.getElementById('adminNewTableTeacherName');
            const passInput = document.getElementById('adminNewPassword');
            const langSelect = document.getElementById('adminNewUserLanguage');
            const photoInput = document.getElementById('adminNewUserPhoto');
            const filterEl = document.getElementById('adminSectionFilter');
            
            if (userInput) userInput.value = username;
            if (tableTeacherInput) {
                tableTeacherInput.value = tableTeacherName || username;
                tableTeacherInput.dataset.customized = (tableTeacherName && tableTeacherName.trim().toLowerCase() !== username.trim().toLowerCase()) ? "true" : "";
            }
            if (passInput) passInput.value = password;
            if (langSelect) langSelect.value = language || 'fr';
            if (photoInput) photoInput.value = photoUrl || '';
            if (typeof updateAdminFormPhotoPreview === 'function') updateAdminFormPhotoPreview(photoUrl || '');
            if (filterEl && section) filterEl.value = section;
            
            if (userInput) {
                userInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
                if (passInput) passInput.focus();
            }
            const statusDiv = document.getElementById('adminUsersStatus');
            if (statusDiv) {
                const diffInfo = (tableTeacherName && tableTeacherName !== username) ? ` (Nom de tableau pour le tri: <strong>${tableTeacherName}</strong>)` : '';
                statusDiv.innerHTML = `<span style="color:#2563EB;"><i class="fas fa-info-circle"></i> Modification du compte pour <strong>${username}</strong>${diffInfo}. Modifiez les informations puis cliquez sur 'Enregistrer Compte'.</span>`;
            }
        }

        async function adminAddOrUpdateUser() {
            const userInput = document.getElementById('adminNewUsername');
            const tableTeacherInput = document.getElementById('adminNewTableTeacherName');
            const passInput = document.getElementById('adminNewPassword');
            const langSelect = document.getElementById('adminNewUserLanguage');
            const photoInput = document.getElementById('adminNewUserPhoto');
            const filterEl = document.getElementById('adminSectionFilter');
            const statusDiv = document.getElementById('adminUsersStatus');
            
            let username = userInput ? userInput.value.trim() : '';
            let tableTeacherName = tableTeacherInput ? tableTeacherInput.value.trim() : '';
            const password = passInput ? passInput.value.trim() : '';
            const language = langSelect ? langSelect.value : 'fr';
            const photoUrl = photoInput ? photoInput.value.trim() : '';
            const section = filterEl ? filterEl.value : currentSection;
            
            // Si l'un des deux noms est renseigné, l'autre prend la même valeur par défaut s'il est vide
            if (!username && tableTeacherName) {
                username = tableTeacherName;
                if (userInput) userInput.value = username;
            }
            if (!tableTeacherName && username) {
                tableTeacherName = username;
            }
            
            if (!username || !password) {
                if (statusDiv) {
                    statusDiv.innerHTML = '<span style="color:#EF4444;"><i class="fas fa-exclamation-circle"></i> Veuillez renseigner le nom d\'utilisateur (ou enseignant) et le mot de passe.</span>';
                }
                return;
            }
            
            if (statusDiv) statusDiv.innerHTML = '<span style="color:#2563EB;"><i class="fas fa-spinner fa-spin"></i> Enregistrement en cours...</span>';
            
            try {
                const response = await fetch('/api/admin/users', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, password, section, language, tableTeacherName, photoUrl })
                });
                const res = await response.json();
                if (response.ok) {
                    if (statusDiv) {
                        statusDiv.innerHTML = `<span style="color:#10B981;"><i class="fas fa-check-circle"></i> ${res.message}</span>`;
                        setTimeout(() => { if (statusDiv) statusDiv.innerHTML = ''; }, 4000);
                    }
                    if (userInput) userInput.value = '';
                    if (tableTeacherInput) {
                        tableTeacherInput.value = '';
                        tableTeacherInput.dataset.customized = "";
                    }
                    if (passInput) passInput.value = '';
                    if (photoInput) photoInput.value = '';
                    if (typeof updateAdminFormPhotoPreview === 'function') updateAdminFormPhotoPreview('');
                    loadAdminUsersList();
                } else {
                    throw new Error(res.message);
                }
            } catch (err) {
                if (statusDiv) {
                    statusDiv.innerHTML = `<span style="color:#EF4444;"><i class="fas fa-times-circle"></i> Erreur: ${err.message}</span>`;
                }
            }
        }

        async function adminDeleteUser(username, section) {
            if (!confirm(`Voulez-vous vraiment supprimer l'enseignant '${username}' de la section ${section} ?`)) return;
            
            try {
                const response = await fetch('/api/admin/users', {
                    method: 'DELETE',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, section })
                });
                const res = await response.json();
                if (response.ok) {
                    loadAdminUsersList();
                } else {
                    alert(`Erreur: ${res.message}`);
                }
            } catch (err) {
                alert(`Erreur: ${err.message}`);
            }
        }

        function togglePasswordVisibility() { const passwordInput = document.getElementById('password'); const toggleIcon = document.getElementById('togglePassword'); if (!passwordInput || !toggleIcon) return; const type = passwordInput.getAttribute('type') === 'password' ? 'text' : 'password'; passwordInput.setAttribute('type', type); toggleIcon.className = (type === 'password') ? 'fas fa-eye password-toggle-icon' : 'fas fa-eye-slash password-toggle-icon'; }

        // --- Initialisation ---
        document.addEventListener('DOMContentLoaded', () => {
            console.log("DOM chargé.");
            fetchGlobalTeachersPhotos();
            fetchWeeksConfiguration();
            updateSectionBadges();
            initPlanTableScrollSync();

            const loginButton = document.getElementById('login-button');
            const passwordInput = document.getElementById('password');
            const usernameInput = document.getElementById('username');
            const logoutButton = document.getElementById('logout-button');
            const togglePasswordIcon = document.getElementById('togglePassword');
            
            if (loginButton) {
                loginButton.addEventListener('click', handleLogin);
                if (passwordInput) { passwordInput.addEventListener('keypress', function(e) { if (e.key === 'Enter') { loginButton.click(); } }); }
                if (usernameInput) { usernameInput.addEventListener('keypress', function(e) { if (e.key === 'Enter') { loginButton.click(); } }); }
            } else { console.error("Btn connexion absent!"); }
            
            if (logoutButton) { logoutButton.addEventListener('click', handleLogout); } else { console.error("Btn déconnexion absent!"); }
            if (togglePasswordIcon) { togglePasswordIcon.addEventListener('click', togglePasswordVisibility); } else { console.error("Icone pwd absente!"); }
            
            // Support RTL pour les notes
            const notesInput = document.getElementById("notesInput");
            if (notesInput) {
                notesInput.addEventListener("input", function(e) {
                    applyRTLToElement(e.target, e.target.value);
                });
            }

            // Synchronisation automatique par défaut entre Nom d'utilisateur et Nom de l'Enseignant dans le formulaire Admin
            const adminUserField = document.getElementById('adminNewUsername');
            const adminTeacherField = document.getElementById('adminNewTableTeacherName');
            if (adminUserField && adminTeacherField) {
                adminUserField.addEventListener('input', () => {
                    if (!adminTeacherField.dataset.customized || adminTeacherField.dataset.customized !== "true") {
                        adminTeacherField.value = adminUserField.value;
                    }
                });
                adminTeacherField.addEventListener('input', () => {
                    if (adminTeacherField.value.trim() !== '' && adminTeacherField.value !== adminUserField.value) {
                        adminTeacherField.dataset.customized = "true";
                    } else if (adminTeacherField.value.trim() === '') {
                        adminTeacherField.dataset.customized = "";
                    }
                });
            }
            
            // Raccourci clavier Ctrl+S / Cmd+S pour les enseignants (enregistrer toutes les modifications affichées)
            window.addEventListener('keydown', (e) => {
                if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                    const planTab = document.getElementById('planTable');
                    if (planTab && planTab.offsetParent !== null) {
                        e.preventDefault();
                        const saveAllBtn = document.getElementById('saveAllDisplayedBtn');
                        if (saveAllBtn && !saveAllBtn.disabled) {
                            saveAllDisplayedRows();
                        }
                    }
                }
            });

            // Détection du Deep Linking (Lien direct Espace Parents sans authentification préalable requise)
            const urlParams = new URLSearchParams(window.location.search);
            const spaceParam = urlParams.get('space') || urlParams.get('espace');
            const sectionParam = urlParams.get('section');
            const viewParam = urlParams.get('view');
            const savedUser = localStorage.getItem('loggedInUser');
            const savedAuthVersion = localStorage.getItem('authVersion');

            const isParentDirectLink = (spaceParam === 'parent') || (!savedUser && (sectionParam === 'garcons' || sectionParam === 'filles' || sectionParam === 'primaire'));

            if (isParentDirectLink) {
                const targetSec = (sectionParam === 'filles' || sectionParam === 'primaire') ? sectionParam : 'garcons';
                console.log(`🔗 Accès direct Espace Parents détecté pour la section : ${targetSec}`);
                currentUserLanguage = localStorage.getItem('parentLanguage') || 'fr';
                enterParentSpaceWithSection(targetSec);
                if (viewParam && viewParam !== 'parent-selection') {
                    setTimeout(() => showHomeworkView(viewParam), 150);
                }
                return;
            }
            
            // Vérifier la version d'authentification
            if (savedUser && savedAuthVersion && parseInt(savedAuthVersion) === AUTH_VERSION) {
                console.log(`Utilisateur trouvé dans la session : '${savedUser}'. Connexion automatique.`);
                initializeApp(savedUser);
            } else {
                if (savedUser) {
                    console.log('🔴 Version d\'authentification obsolète. Déconnexion automatique pour mise à jour du mot de passe.');
                    localStorage.removeItem('loggedInUser');
                    localStorage.removeItem('authVersion');
                    
                    const errorDiv = document.getElementById('login-error');
                    if (errorDiv) {
                        errorDiv.textContent = '⚠️ Mise à jour de sécurité : Veuillez vous reconnecter avec le nouveau mot de passe.';
                        errorDiv.style.display = 'block';
                        errorDiv.style.backgroundColor = '#fff3cd';
                        errorDiv.style.color = '#856404';
                        errorDiv.style.borderColor = '#ffc107';
                    }
                }
                console.log("Affichage de la sélection de section.");
                const sectionSel = document.getElementById('section-selection');
                if (sectionSel) sectionSel.style.display = 'flex';
                document.getElementById('login-form').style.display = 'none';
                document.getElementById('main-content').style.display = 'none';
                currentUserLanguage = 'fr';
                applyLanguageSettings();
            }

            updateActionButtonsState(false);
            const saveAllBtn = document.getElementById('saveAllDisplayedBtn');
            if (saveAllBtn) saveAllBtn.disabled = true;
            const saveAdminBtn = document.getElementById('saveUploadedDataBtn');
            if (saveAdminBtn) saveAdminBtn.disabled = true;
            const saveNotesBtn = document.getElementById('saveNotesBtn');
            if (saveNotesBtn) saveNotesBtn.disabled = true;

            setTimeout(() => {
                if (typeof checkTeacherUnreadMessagesNotification === 'function') checkTeacherUnreadMessagesNotification();
                if (typeof checkParentUnreadMessagesNotification === 'function') checkParentUnreadMessagesNotification();
            }, 1200);
        });

        // ==================== FONCTIONS POUR PLANS DE LEÇON (COORDINATEUR) ====================
        
        // Download lesson plan for a specific row
        async function downloadLessonPlan(rowData) {
            if (!rowData || !rowData.lessonPlanId) {
                displayAlert('Aucun plan de leçon disponible pour cette ligne.', true);
                return;
            }
            
            console.log("Téléchargement du plan de leçon:", rowData.lessonPlanId);
            displayAlert('Téléchargement du plan de leçon...', false);
            
            try {
                // Télécharger depuis MongoDB
                const response = await fetch(`/api/download-lesson-plan/${rowData.lessonPlanId}`);
                
                if (response.ok) {
                    const blob = await response.blob();
                    const contentDisposition = response.headers.get('content-disposition');
                    let filename = `plan_lecon_S${currentWeek}.docx`;
                    if (contentDisposition) {
                        const filenameMatch = contentDisposition.match(/filename="?(.+?)"?(;|$)/i);
                        if (filenameMatch && filenameMatch[1]) {
                            filename = filenameMatch[1];
                        }
                    }
                    
                    if (typeof saveAs === 'function') {
                        saveAs(blob, filename);
                        displayAlert('Plan de leçon téléchargé avec succès !', false);
                    }

                    if (rowData) {
                        rowData.lessonPlanDownloaded = true;
                        const tr = findTableRowElement(rowData);
                        if (tr) {
                            tr.classList.remove('row-generating');
                            tr.classList.add('has-lesson-plan', 'row-plan-downloaded');
                            let badge = tr.querySelector('.plan-status-badge');
                            const actTd = tr.querySelector('.actions-column');
                            if (!badge && actTd) {
                                badge = document.createElement('span');
                                actTd.appendChild(badge);
                            }
                            if (badge) {
                                badge.className = 'plan-status-badge badge-downloaded';
                                badge.innerHTML = '<i class="fas fa-check-double"></i> Téléchargé';
                                badge.title = 'Plan de leçon déjà téléchargé';
                            }
                        }
                    }
                } else {
                    const errorResult = await response.json().catch(() => ({ message: "Erreur inconnue" }));
                    throw new Error(errorResult.message || `Erreur serveur ${response.status}`);
                }
            } catch (error) {
                console.error('Erreur téléchargement plan de leçon:', error);
                displayAlert('Erreur lors du téléchargement du plan de leçon: ' + error.message, true);
            }
        }
        
        console.log("Script principal terminé.");

// ============================================================================
// FONCTIONS DU PORTAIL DEVOIRS ET GESTION DES ÉLÈVES
// ============================================================================

let homeworkLang = 'fr';
let selectedStudentObj = null;
let currentHomeworkDate = (typeof getInitialHomeworkDate === 'function') ? getInitialHomeworkDate() : new Date().toISOString().split('T')[0];
let activeParentAccount = JSON.parse(localStorage.getItem('parentAccount') || 'null');

let isParentMode = false;

function getStudentFallbackAvatar(section) {
    const isGirls = (section === 'filles' || currentSection === 'filles');
    const isPrimaire = (section === 'primaire' || currentSection === 'primaire');
    const colorBg = isGirls ? '#FDF2F8' : (isPrimaire ? '#ECFDF5' : '#EFF6FF');
    const colorFill = isGirls ? '#F472B6' : (isPrimaire ? '#34D399' : '#60A5FA');
    const colorStroke = isGirls ? '#DB2777' : (isPrimaire ? '#059669' : '#2563EB');
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="100" height="100">
        <rect width="120" height="120" rx="60" fill="${colorBg}"/>
        <circle cx="60" cy="45" r="22" fill="${colorFill}"/>
        <circle cx="60" cy="43" r="16" fill="#FED7AA"/>
        <path d="M46 32 L60 22 L74 32 L60 38 Z" fill="#1E293B"/>
        <circle cx="74" cy="33" r="3" fill="#F59E0B"/>
        <path d="M26 102 C26 78, 42 70, 60 70 C78 70, 94 78, 94 102 Z" fill="${colorStroke}"/>
    </svg>`;
    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function applyParentUIMode(enabled) {
    isParentMode = enabled;
    
    const plansTabBtn = document.getElementById('tab-plans-btn');
    const goToTeacherBtn = document.getElementById('go-to-teacher');
    const goToParentBtn = document.getElementById('go-to-parent');
    const loggedInInfo = document.getElementById('loggedInUserInfo');
    const logoutBtn = document.getElementById('logout-button');
    const mainTitle = document.getElementById('main-title');
    const switchSecBtn = document.querySelector('.switch-section-btn');
    
    if (enabled) {
        if (plansTabBtn) plansTabBtn.style.display = 'none'; // Masquer l'accès aux plans enseignants
        if (goToTeacherBtn) goToTeacherBtn.style.display = 'none'; // Masquer l'accès à l'espace enseignants
        if (goToParentBtn) goToParentBtn.style.display = 'inline-flex';
        if (switchSecBtn) switchSecBtn.style.display = 'none';
        if (loggedInInfo) loggedInInfo.textContent = 'Espace Parent 👨‍👩‍👧‍👦';
        if (logoutBtn) {
            logoutBtn.style.display = 'none'; // Enlève le bouton "Retour Accueil" dans l'espace parent
        }
        document.querySelectorAll('.btn-copy-parent-link').forEach(btn => btn.style.display = 'none');
        if (mainTitle) mainTitle.textContent = 'Espace Parents - Portail Suivi & Devoirs';
    } else {
        if (plansTabBtn) plansTabBtn.style.display = 'inline-block';
        if (goToTeacherBtn) goToTeacherBtn.style.display = 'inline-flex';
        if (goToParentBtn) goToParentBtn.style.display = 'none'; // L'enseignant ne voit pas l'espace parent
        if (switchSecBtn) {
            if (isUserAdminOrSupervisor(loggedInUser, currentUserRole)) {
                switchSecBtn.style.display = 'inline-flex';
                switchSecBtn.innerHTML = '<i class="fas fa-sync-alt"></i> Changer Section';
                switchSecBtn.onclick = cycleAdminSection;
                switchSecBtn.title = "Basculer vers une autre section sans vous déconnecter";
            } else {
                switchSecBtn.style.display = 'none'; // Verrouillage de la section pour l'enseignant
            }
        }
        if (mainTitle) mainTitle.textContent = 'Plans Hebdomadaires';
        if (logoutBtn) {
            logoutBtn.style.display = 'inline-flex';
            logoutBtn.innerHTML = '<i class="fas fa-sign-out-alt"></i> <span class="btn-text">Déconnecter</span>';
            logoutBtn.onclick = handleLogout;
        }
    }
}

function switchMainTab(tab) {
    if (isParentMode && tab === 'plans') {
        tab = 'devoirs';
    }
    const plansTab = document.getElementById('plans-tab-content');
    const devoirsTab = document.getElementById('devoirs-tab-content');
    const plansBtn = document.getElementById('tab-plans-btn');
    const devoirsBtn = document.getElementById('tab-devoirs-btn');

    if (tab === 'devoirs') {
        if (plansTab) plansTab.style.display = 'none';
        if (devoirsTab) devoirsTab.style.display = 'block';
        if (plansBtn) plansBtn.classList.remove('active');
        if (devoirsBtn) devoirsBtn.classList.add('active');
        if (isParentMode) {
            showHomeworkView('parent-selection');
        } else {
            // L'enseignant accède DIRECTEMENT à son espace enseignant
            showHomeworkView('homework-teacher');
        }
    } else {
        if (plansTab) plansTab.style.display = 'block';
        if (devoirsTab) devoirsTab.style.display = 'none';
        if (plansBtn) plansBtn.classList.add('active');
        if (devoirsBtn) devoirsBtn.classList.remove('active');
    }
}

function showHomeworkView(viewName) {
    if (isParentMode && viewName === 'homework-teacher') {
        displayAlert("Accès réservé uniquement aux enseignants.", true);
        viewName = 'parent-selection';
    }
    if (!isParentMode && (viewName === 'parent-plan' || viewName === 'parent-selection' || viewName === 'student-dashboard' || viewName === 'parent-contacts')) {
        // Un enseignant connecté ne navigue pas dans les vues réservées aux parents
        viewName = 'homework-teacher';
    }
    const views = ['homework-home', 'parent-selection', 'student-dashboard', 'homework-teacher', 'parent-plan', 'parent-contacts'];
    views.forEach(v => {
        const el = document.getElementById(v + '-view');
        if (el) el.style.display = (v === viewName) ? 'block' : 'none';
    });

    if (isParentMode) {
        updateParentURL(currentSection, viewName);
    }

    // Mettre à jour l'état actif des 4 onglets dans tous les conteneurs de navigation
    const activeTabMap = {
        'parent-selection': 'students',
        'student-dashboard': 'students',
        'parent-plan': 'plan',
        'parent-contacts': 'teachers',
        'homework-home': 'photos'
    };
    const activeType = activeTabMap[viewName] || 'students';
    document.querySelectorAll('.parent-nav-tabs').forEach(tabGroup => {
        tabGroup.querySelectorAll('button').forEach(btn => {
            const isTarget = btn.classList.contains(`tab-btn-${activeType}`);
            if (isTarget) {
                btn.classList.add('primary-button', 'active');
            } else {
                btn.classList.remove('primary-button', 'active');
            }
        });
    });

    if (viewName === 'parent-plan') {
        populateParentWeekSelector();
        loadParentWeeklyPlan();
    } else if (viewName === 'parent-contacts') {
        loadTeachersContactGrid();
    } else if (viewName === 'homework-home') {
        loadHomeworkShowcase();
    } else if (viewName === 'homework-teacher') {
        loadTeacherHomeworksDashboard();
    } else if (viewName === 'parent-selection') {
        if (typeof renderParentClassButtons === 'function') {
            renderParentClassButtons();
        }
        const activeClassBtn = document.querySelector('#parent-class-buttons button.active');
        const defaultClass = activeClassBtn ? (activeClassBtn.getAttribute('onclick')?.match(/'([^']+)'/)?.[1] || 'PEI1') : (typeof getSectionClasses === 'function' ? (getSectionClasses(currentSection)[0] || 'PEI1') : 'PEI1');
        loadClassStudents(defaultClass || 'PEI1', true);
    }
}

// ============================================================================
// LOGIQUE ESPACE PARENTS (SUR LA PREMIÈRE PAGE ET EN PORTAIL DÉDIÉ)
// ============================================================================

function openParentSectionModal() {
    const modal = document.getElementById('parent-section-modal');
    if (modal) modal.style.display = 'flex';
}

function closeParentSectionModal() {
    const modal = document.getElementById('parent-section-modal');
    if (modal) modal.style.display = 'none';
}

let lockedParentSection = localStorage.getItem('lockedParentSection') || sessionStorage.getItem('lockedParentSection') || null;

function enterParentSpaceWithSection(section) {
    currentSection = section;
    lockedParentSection = section;
    sessionStorage.setItem('lockedParentSection', section);
    localStorage.setItem('lockedParentSection', section);
    localStorage.setItem('selectedSection', section);
    localStorage.setItem('currentSection', section);
    closeParentSectionModal();
    
    // Réinitialiser le cache pour éviter tout mélange entre filles, garçons et primaire
    parentRawPlanData = [];
    parentRawClassNotes = {};
    if (typeof studentsClientCache !== 'undefined') studentsClientCache.clear();
    const studentsGrid = document.getElementById('students-grid');
    if (studentsGrid) studentsGrid.innerHTML = '';
    
    // Activer le mode restriction Parent
    applyParentUIMode(true);
    
    // Afficher l'application principale
    const secSel = document.getElementById('section-selection');
    const loginForm = document.getElementById('login-form');
    const mainContent = document.getElementById('main-content');
    
    if (secSel) secSel.style.display = 'none';
    if (loginForm) loginForm.style.display = 'none';
    if (mainContent) mainContent.style.display = 'block';
    
    updateSectionBadges();
    applyParentLanguageUI();
    updateParentURL(section, 'parent-selection');
    
    // Basculer vers le portail devoirs/parents sur l'écran d'accueil du Suivi des Élèves
    switchMainTab('devoirs');
    showHomeworkView('parent-selection');
}

function toggleParentSection() {
    // RÈGLE STRICTE : Les 3 sections sont strictement séparées.
    // Si un parent accède aux garçons par exemple, il ne peut pas aller vers les autres sections.
    const isLocked = isParentMode || lockedParentSection || sessionStorage.getItem('lockedParentSection') || localStorage.getItem('lockedParentSection');
    if (isLocked) {
        console.warn('Action non autorisée: les 3 sections sont strictement séparées pour les parents.');
        return;
    }
    
    let newSection = 'garcons';
    if (currentSection === 'garcons') newSection = 'filles';
    else if (currentSection === 'filles') newSection = 'primaire';
    else newSection = 'garcons';
    
    currentSection = newSection;
    localStorage.setItem('selectedSection', newSection);
    localStorage.setItem('currentSection', newSection);
    updateSectionBadges();
    updateParentURL(newSection);
    
    // Réinitialiser le cache pour la nouvelle section
    parentRawPlanData = [];
    parentRawClassNotes = {};
    if (typeof studentsClientCache !== 'undefined') studentsClientCache.clear();
    const studentsGrid = document.getElementById('students-grid');
    if (studentsGrid) studentsGrid.innerHTML = '';
    
    const classes = getSectionClasses(currentSection);
    const defaultClass = classes[0];
    
    // Recharger la classe active
    loadClassStudents(defaultClass);
}

// Calcule la semaine par défaut pour l'espace parent :
// Le vendredi, affiche le jeudi de la semaine passée (ex: vendredi de la semaine 4 -> semaine 3 et jour Jeudi)
// Pour le cycle maternelle (PS, MS, GS) : toujours semaine des autres classes - 1 (Règle utilisateur 3)
function getParentDefaultWeekNumber(className = null) {
    const today = new Date();
    const dayOfWeek = today.getDay(); // 0=Dimanche, 5=Vendredi, 6=Samedi
    let baseWeek = 1;
    if (dayOfWeek === 5) { // Vendredi
        const prevThursday = new Date(today);
        prevThursday.setDate(prevThursday.getDate() - 1);
        prevThursday.setHours(10, 0, 0, 0);
        let w = (typeof getCurrentWeekNumber === 'function') ? getCurrentWeekNumber(prevThursday) : 1;
        const currentNextWeek = (typeof getCurrentWeekNumber === 'function') ? getCurrentWeekNumber(today) : 1;
        if (w >= currentNextWeek && currentNextWeek > 1) {
            w = currentNextWeek - 1;
        }
        baseWeek = Math.max(1, w || 1);
    } else {
        baseWeek = (typeof getCurrentWeekNumber === 'function') ? (getCurrentWeekNumber() || 1) : 1;
    }

    // Règle 3 : Pour le cycle maternelle PS, MS, GS, toujours la semaine actuelle des autres classes - 1
    if (className && isMaternelleClass(className)) {
        return Math.max(1, baseWeek - 1);
    }
    return baseWeek;
}
window.getParentDefaultWeekNumber = getParentDefaultWeekNumber;

function handleParentClassChange() {
    const classSelect = document.getElementById('parentClassSelector');
    const weekSelect = document.getElementById('parentWeekSelector');
    const selectedClass = classSelect ? classSelect.value : '';
    if (isMaternelleClass(selectedClass)) {
        const matWeek = getParentDefaultWeekNumber(selectedClass);
        if (weekSelect) {
            weekSelect.value = String(matWeek);
            window.userHasManuallySelectedParentWeek = false;
        }
    } else if (!window.userHasManuallySelectedParentWeek) {
        const stdWeek = getParentDefaultWeekNumber();
        if (weekSelect) {
            weekSelect.value = String(stdWeek);
        }
    }
    loadParentWeeklyPlan();
}
window.handleParentClassChange = handleParentClassChange;

function populateParentWeekSelector() {
    const select = document.getElementById('parentWeekSelector');
    if (!select) return;
    
    // Pour les parents : vendredi bascule sur la semaine passée (du jeudi dernier)
    const classSelect = document.getElementById('parentClassSelector');
    const selectedClass = classSelect ? classSelect.value : null;
    const defaultParentWeek = getParentDefaultWeekNumber(selectedClass);
    const activeWeek = window.userHasManuallySelectedParentWeek && select.value 
        ? parseInt(select.value, 10) 
        : defaultParentWeek;
    select.innerHTML = '';
    
    const sortedWeekNums = Object.keys(weeksConfig).map(n => parseInt(n, 10)).sort((a, b) => a - b);
    sortedWeekNums.forEach(wNum => {
        const option = document.createElement('option');
        option.value = String(wNum);
        option.textContent = formatWeekDateRangeText(wNum);
        if (wNum === activeWeek) {
            option.selected = true;
        }
        select.appendChild(option);
    });
    
    select.value = String(activeWeek);
}

let parentRawPlanData = [];
let parentRawClassNotes = {};
let parentActiveDay = (typeof getTodaySchoolDayName === 'function') ? getTodaySchoolDayName() : 'Dimanche';
const schoolDaysList = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi"];

function setParentActiveDay(dayName) {
    parentActiveDay = dayName;
    const classSelect = document.getElementById('parentClassSelector');
    if (!classSelect || !parentRawPlanData) return;
    
    const selectedClass = classSelect.value || 'PEI1';
    const norm = (s) => String(s || '').trim().toLowerCase().replace(/[\s\-_]+/g, '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const targetNormClass = norm(selectedClass);
    const classRows = parentRawPlanData.filter(row => {
        const classVal = getRowField(row, 'Classe');
        if (!classVal) return false;
        const rNorm = norm(classVal);
        return rNorm === targetNormClass || rNorm.includes(targetNormClass) || targetNormClass.includes(rNorm);
    });
    renderParentPlanCards(classRows);
}

function changeParentActiveDay(offset) {
    let idx = schoolDaysList.indexOf(parentActiveDay);
    if (idx === -1) idx = 0;
    idx = (idx + offset + schoolDaysList.length) % schoolDaysList.length;
    setParentActiveDay(schoolDaysList[idx]);
}

let parentSpecialDays = [];
let adminSpecialPhotosList = [];
let quickSpecialPhotosList = [];

async function loadParentWeeklyPlan() {
    try {
        const weekSelect = document.getElementById('parentWeekSelector');
        const classSelect = document.getElementById('parentClassSelector');
        const container = document.getElementById('parentPlanDisplayContainer');
        const statusBanner = document.getElementById('parentPlanStatusBanner');
        const notesBox = document.getElementById('parentClassNotesBox');
        const sectionToggleBtnText = document.getElementById('parentSectionToggleText');
        
        if (!weekSelect || !classSelect || !container) return;
        
        const classes = getSectionClasses(currentSection);
        const selectedClass = classSelect.value || classes[0];

        // Par défaut pour les parents : la semaine par défaut (sur semaine passée si vendredi, et N-1 pour Maternelle PS, MS, GS)
        const defaultParentW = getParentDefaultWeekNumber(selectedClass);
        if (!window.userHasManuallySelectedParentWeek) {
            weekSelect.value = String(defaultParentW);
        }
        const selectedWeek = weekSelect.value || defaultParentW;
        
        // Si les parents consultent la semaine par défaut, positionner automatiquement sur le jour d'école adéquat
        // (Le vendredi, getTodaySchoolDayName() retourne automatiquement 'Jeudi' de la semaine précédente)
        if (Number(selectedWeek) === Number(defaultParentW) && typeof getTodaySchoolDayName === 'function') {
            if (!window.userHasManuallySelectedParentDay) {
                parentActiveDay = getTodaySchoolDayName();
            }
        }
        const section = currentSection || 'garcons';
        
        if (sectionToggleBtnText) {
            sectionToggleBtnText.textContent = section === 'garcons' ? 'Section Garçons 👦' : (section === 'filles' ? 'Section Filles 👧' : 'Primaire & Maternelle 👶🎒');
        }
        
        const secLabel = section === 'garcons' ? 'Garçons' : (section === 'filles' ? 'Filles' : 'Primaire');
        container.innerHTML = `
            <div style="text-align:center; padding:40px; background:white; border-radius:16px; box-shadow:0 4px 15px rgba(0,0,0,0.05);">
                <i class="fas fa-spinner fa-spin fa-2x" style="color:#10B981; margin-bottom:12px;"></i>
                <p style="color:#4B5563; font-size:1.05rem; font-weight:600; margin:0;">Chargement du plan hebdomadaire pour la classe ${selectedClass} (${secLabel})...</p>
            </div>
        `;
        
        const [res, specRes] = await Promise.all([
            fetch(`/api/plans/${selectedWeek}?section=${section}`),
            fetch(`/api/special-days?week=${selectedWeek}&section=${section}`).catch(() => null)
        ]);

        if (specRes && specRes.ok) {
            parentSpecialDays = await specRes.json();
        } else {
            parentSpecialDays = [];
        }

        if (!res.ok) {
            container.innerHTML = `<div class="alert-error">Impossible de charger le plan hebdomadaire pour le moment.</div>`;
            return;
        }
        
        const data = await res.json();

        // Contrôle de publication admin : si non publié, afficher le message officiel aux parents
        if (data.isPublishedToParents === false) {
            container.innerHTML = `
                <div style="background:white; border:2px solid #F59E0B; border-radius:18px; padding:35px 25px; text-align:center; box-shadow:0 6px 20px rgba(0,0,0,0.06); max-width:700px; margin:20px auto;">
                    <div style="width:70px; height:70px; background:#FEF3C7; color:#D97706; border-radius:50%; display:flex; align-items:center; justify-content:center; margin:0 auto 16px auto; font-size:2rem;">
                        <i class="fas fa-clock"></i>
                    </div>
                    <h3 style="color:#1E1B4B; margin:0 0 10px 0; font-size:1.35rem; font-weight:800;">
                        Plan Hebdomadaire en Cours de Validation
                    </h3>
                    <p style="color:#64748B; font-size:0.98rem; line-height:1.6; margin:0 0 16px 0;">
                        Le plan hebdomadaire de la <strong>Semaine ${selectedWeek}</strong> pour la <strong>Section ${secLabel}</strong> est en cours de révision et de finalisation par la direction pédagogique.<br>
                        Il sera consultable dès sa publication officielle par l'administration.
                    </p>
                    <div style="display:inline-flex; align-items:center; gap:8px; background:#EFF6FF; border:1px solid #BFDBFE; color:#1D4ED8; padding:8px 16px; border-radius:10px; font-weight:600; font-size:0.9rem;">
                        <i class="fas fa-info-circle"></i> Vous pouvez consulter les semaines précédentes déjà publiées via le sélecteur ci-dessus.
                    </div>
                </div>
            `;
            if (statusBanner) statusBanner.innerHTML = '';
            if (notesBox) notesBox.style.display = 'none';
            return;
        }

        let fetchedData = data.planData || [];
        
        // Double sécurité : filtrer les enseignants des autres sections
        if (section === 'garcons') {
            fetchedData = fetchedData.filter(row => {
                const ens = (getRowField(row, 'Enseignant') || '').trim();
                if (isDualSectionTeacher(ens)) return true;
                return !femaleTeachersList.some(f => f.toLowerCase() === ens.toLowerCase()) &&
                       !primaireTeachersList.some(p => p.toLowerCase() === ens.toLowerCase());
            });
        } else if (section === 'filles') {
            fetchedData = fetchedData.filter(row => {
                const ens = (getRowField(row, 'Enseignant') || '').trim();
                if (isDualSectionTeacher(ens)) return true;
                return !maleTeachersList.some(m => m.toLowerCase() === ens.toLowerCase()) &&
                       !primaireTeachersList.some(p => p.toLowerCase() === ens.toLowerCase());
            });
        } else if (section === 'primaire') {
            fetchedData = fetchedData.filter(row => {
                const ens = (getRowField(row, 'Enseignant') || '').trim();
                if (isDualSectionTeacher(ens)) return true;
                return !maleTeachersList.some(m => m.toLowerCase() === ens.toLowerCase()) &&
                       !femaleTeachersList.some(f => f.toLowerCase() === ens.toLowerCase());
            });
        }
        
        parentRawPlanData = fetchedData;
        parentRawClassNotes = data.classNotes || {};

        if (parentRawPlanData.length > 0 && (!headers || headers.length === 0)) {
            headers = Object.keys(parentRawPlanData[0]);
        }
        
        // Filtrer les lignes pour la classe sélectionnée avec tolérance
        const norm = (s) => String(s || '').trim().toLowerCase().replace(/[\s\-_]+/g, '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        const targetNormClass = norm(selectedClass);
        const classRows = parentRawPlanData.filter(row => {
            const classVal = getRowField(row, 'Classe');
            if (!classVal) return false;
            const rNorm = norm(classVal);
            return rNorm === targetNormClass || rNorm.includes(targetNormClass) || targetNormClass.includes(rNorm);
        });
        
        // Vérifier si la saisie est complète pour cette classe
        let emptyCount = 0;
        classRows.forEach(row => {
            const leconVal = getRowField(row, 'Leçon');
            const taskVal = getRowField(row, 'Travaux de classe');
            if ((!leconVal || String(leconVal).trim() === '') && (!taskVal || String(taskVal).trim() === '')) {
                emptyCount++;
            }
        });
        
        const isComplete = (classRows.length > 0 && emptyCount === 0);
        const t = parentI18n[currentUserLanguage] || parentI18n.fr;
        
        if (statusBanner) {
            if (classRows.length === 0) {
                statusBanner.innerHTML = `
                    <div style="background:#F3F4F6; border:1px solid #D1D5DB; border-radius:14px; padding:16px 20px; color:#4B5563; font-weight:600; display:flex; align-items:center; gap:12px;">
                        <i class="fas fa-info-circle" style="font-size:1.5rem; color:#6B7280;"></i>
                        <span>${t.noPlanPublished} (${selectedClass} - Semaine ${selectedWeek})</span>
                    </div>
                `;
            } else if (isComplete) {
                statusBanner.innerHTML = `
                    <div style="background:#ECFDF5; border:2px solid #10B981; border-radius:14px; padding:16px 22px; color:#065F46; font-weight:700; box-shadow:0 4px 12px rgba(16,185,129,0.15); display:flex; align-items:center; gap:14px;">
                        <i class="fas fa-check-circle" style="font-size:1.8rem; color:#10B981;"></i>
                        <div>
                            <div style="font-size:1.1rem; color:#065F46;">${t.planCompletedTitle}</div>
                            <div style="font-size:0.88rem; font-weight:500; color:#047857; margin-top:2px;">${t.planCompletedDesc} (${selectedClass} - Semaine ${selectedWeek})</div>
                        </div>
                    </div>
                `;
            } else {
                statusBanner.innerHTML = `
                    <div style="background:#FFFBEB; border:2px solid #F59E0B; border-radius:14px; padding:16px 22px; color:#92400E; font-weight:700; box-shadow:0 4px 12px rgba(245,158,11,0.15); display:flex; align-items:center; gap:14px;">
                        <i class="fas fa-hourglass-half" style="font-size:1.8rem; color:#F59E0B;"></i>
                        <div>
                            <div style="font-size:1.1rem; color:#92400E;">${t.planInProgressTitle}</div>
                            <div style="font-size:0.88rem; font-weight:500; color:#B45309; margin-top:2px;">${t.planInProgressDesc} (${selectedClass} - Semaine ${selectedWeek})</div>
                        </div>
                    </div>
                `;
            }
        }
        
        // Remarques Générales de la Classe & Photo de la Semaine
        if (notesBox) {
            const classNote = parentRawClassNotes[selectedClass];
            const classPhoto = (data && data.classNotesPhotos && data.classNotesPhotos[selectedClass]) || '';
            if ((classNote && classNote.trim() !== '') || classPhoto) {
                notesBox.style.display = 'block';
                let photoHtml = '';
                if (classPhoto) {
                    const formattedImgUrl = (typeof formatDriveImageUrl === 'function') ? formatDriveImageUrl(classPhoto) : classPhoto;
                    photoHtml = `
                        <div style="margin-top:14px; text-align:center;">
                            <img src="${escapeHtml(formattedImgUrl)}" alt="Photo de la semaine" style="max-height:260px; max-width:100%; object-fit:contain; border-radius:12px; box-shadow:0 4px 14px rgba(0,0,0,0.12); border:2px solid #FCD34D; background:white; padding:4px;" />
                        </div>
                    `;
                }
                notesBox.innerHTML = `
                    <div style="background:#FEF3C7; border-left:6px solid #D97706; padding:16px 20px; border-radius:12px; color:#78350F; font-weight:600; box-shadow:0 2px 8px rgba(0,0,0,0.04);">
                        <div style="font-size:1.05rem; margin-bottom:6px; display:flex; align-items:center; gap:8px;">
                            <i class="fas fa-sticky-note" style="color:#D97706;"></i> ${currentUserLanguage === 'ar' ? 'ملاحظات عامة للصف' : 'Remarques Générales de la Classe'} (${selectedClass}) :
                        </div>
                        ${classNote ? `<p style="margin:0; font-weight:400; font-size:0.95rem; white-space:pre-wrap;">${escapeHtml(classNote)}</p>` : ''}
                        ${photoHtml}
                    </div>
                `;
            } else {
                notesBox.style.display = 'none';
            }
        }
        
        if (!window.userHasManuallySelectedParentDay && typeof getTodaySchoolDayName === 'function') {
            parentActiveDay = getTodaySchoolDayName(classRows);
        }
        
        renderParentPlanCards(classRows);
        
    } catch (e) {
        console.error('Erreur loadParentWeeklyPlan:', e);
    }
}

function renderParentPlanCards(rows) {
    const container = document.getElementById('parentPlanDisplayContainer');
    const t = parentI18n[currentUserLanguage] || parentI18n.fr;
    const selectedClass = document.getElementById('parentClassSelector')?.value || 'PEI1';
    const selectedWeek = document.getElementById('parentWeekSelector')?.value || (currentWeek || 1);
    const norm = (s) => String(s || '').replace(/\s+/g, '').toLowerCase();
    
    if (!container) return;
    
    // Grouper les cours par jour
    const grouped = {};
    (rows || []).forEach(r => {
        const dayVal = getRowField(r, 'Jour');
        const standardDay = normalizeDayName(dayVal) || extractDayName(dayVal) || dayVal;
        if (standardDay && schoolDaysList.includes(standardDay)) {
            if (!grouped[standardDay]) grouped[standardDay] = [];
            grouped[standardDay].push(r);
        } else {
            const fallbackDay = schoolDaysList.find(d => String(dayVal).toLowerCase().includes(d.toLowerCase())) || "Dimanche";
            if (!grouped[fallbackDay]) grouped[fallbackDay] = [];
            grouped[fallbackDay].push(r);
        }
    });
    
    if (!schoolDaysList.includes(parentActiveDay)) {
        parentActiveDay = 'Dimanche';
    }
    
    // Barre de navigation des 5 jours
    let daysNavHtml = `
        <div style="background:white; border-radius:16px; padding:14px 18px; box-shadow:0 4px 18px rgba(0,0,0,0.06); border:1px solid #E2E8F0; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; margin-bottom:20px;">
            <button type="button" class="pro-button" onclick="changeParentActiveDay(-1)" style="padding:10px 18px; font-weight:700;">
                <i class="fas fa-chevron-left"></i> <span>${t.prevDay}</span>
            </button>
            <div style="display:flex; gap:8px; flex-wrap:wrap; justify-content:center;">
    `;
    
    schoolDaysList.forEach(day => {
        const isActive = (day === parentActiveDay);
        const dayLabel = (currentUserLanguage === 'ar') ? (t.daysMap[day] || day) : day;
        const count = (grouped[day] || []).length;
        
        // Vérifier si ce jour a une fusion spéciale
        const hasSpecial = (parentSpecialDays || []).some(s => {
            const dNorm = normalizeDayName(s.day) || s.day;
            const matchesDay = (dNorm.toLowerCase() === day.toLowerCase());
            const matchesClass = (!s.classe || s.classe === 'ALL' || norm(s.classe) === norm(selectedClass));
            return matchesDay && matchesClass;
        });

        daysNavHtml += `
            <button type="button" class="pro-button ${isActive ? 'primary-button active' : ''}" onclick="setParentActiveDay('${day}')" style="padding:10px 18px; font-size:1rem; font-weight:700; border-radius:12px; transition:all 0.2s ease; ${isActive ? 'box-shadow:0 4px 12px rgba(59,130,246,0.35); transform:scale(1.03);' : 'background:#F8FAFC; color:#334155; border:1px solid #CBD5E1;'}">
                <span>${dayLabel}</span>
                ${hasSpecial ? `<span style="font-size:0.8rem; margin-left:4px;">🌟</span>` : `<span style="font-size:0.75rem; padding:2px 7px; border-radius:10px; margin-left:6px; margin-right:6px; background:${isActive ? 'rgba(255,255,255,0.25)' : '#E2E8F0'}; color:${isActive ? 'white' : '#475569'};">${count}</span>`}
            </button>
        `;
    });
    
    daysNavHtml += `
            </div>
            <button type="button" class="pro-button" onclick="changeParentActiveDay(1)" style="padding:10px 18px; font-weight:700;">
                <span>${t.nextDay}</span> <i class="fas fa-chevron-right"></i>
            </button>
        </div>
    `;
    
    // Récupérer et trier les cours du jour sélectionné
    const currentDayRows = grouped[parentActiveDay] || [];
    currentDayRows.sort((a, b) => {
        const pA = parseInt(getRowField(a, 'Période'), 10) || 0;
        const pB = parseInt(getRowField(b, 'Période'), 10) || 0;
        return pA - pB;
    });
    
    const weekStartDateNode = getDateForDayName(parentActiveDay);
    let formattedDayDate = weekStartDateNode ? formatDateForDisplay(weekStartDateNode) : parentActiveDay;
    if (currentUserLanguage === 'ar') {
        const arDay = t.daysMap[parentActiveDay] || parentActiveDay;
        formattedDayDate = `${arDay} ${weekStartDateNode ? `(${weekStartDateNode.getUTCDate()}/${weekStartDateNode.getUTCMonth() + 1})` : ''}`;
    }
    
    // Vérifier si une fusion de jour spéciale est active pour ce jour
    const activeSpecialDay = (parentSpecialDays || []).find(s => {
        if (!s) return false;
        const dNorm = (normalizeDayName(s.day) || s.day || '').trim().toLowerCase();
        const pNorm = (normalizeDayName(parentActiveDay) || parentActiveDay || '').trim().toLowerCase();
        const matchesDay = (dNorm === pNorm);
        const sClass = String(s.classe || '').trim().toLowerCase();
        const matchesClass = (!s.classe || sClass === 'all' || sClass === 'toutes' || norm(s.classe) === norm(selectedClass));
        return matchesDay && matchesClass;
    });

    let tableHtml = '';
    const isAdminUser = (loggedInUser === 'Med01' || currentUserRole === 'admin');

    if (activeSpecialDay) {
        // AFFICHAGE DU JOUR FUSIONNÉ (PAS DE COURS / PHOTOS / ÉVÉNEMENT)
        const typeLabels = {
            'no_courses': { label: 'Pas de cours', icon: 'fas fa-calendar-times', color: '#EF4444', bg: '#FEF2F2', border: '#FECACA' },
            'holiday': { label: 'Vacances / Jour Férié', icon: 'fas fa-umbrella-beach', color: '#F59E0B', bg: '#FFFBEB', border: '#FDE68A' },
            'event': { label: 'Événement / Célébration', icon: 'fas fa-award', color: '#8B5CF6', bg: '#F5F3FF', border: '#DDD6FE' },
            'activity': { label: 'Activité / Sortie Scolaire', icon: 'fas fa-futbol', color: '#10B981', bg: '#ECFDF5', border: '#A7F3D0' }
        };
        const typeCfg = typeLabels[activeSpecialDay.type] || typeLabels['no_courses'];
        const rawPhotos = Array.isArray(activeSpecialDay.photos) ? activeSpecialDay.photos : [];
        const photos = rawPhotos.filter(p => p && (typeof p === 'string' ? p.trim() : (p.url || p.src || p.data)));
        if (photos.length === 0 && /f[eê]te\s*nationale/i.test(activeSpecialDay.title || '')) {
            photos.push({
                url: 'https://drive.google.com/thumbnail?id=1tLpelITZSuch6gckvasulKDnm__aeF78&sz=w2560',
                caption: 'Célébration Fête Nationale'
            });
        }
        window.currentSpecialPhotos = photos;

        let photosGalleryHtml = '';
        if (photos.length > 0) {
            photosGalleryHtml = `
                <div style="margin-top:25px; padding-top:20px; border-top:1px solid #E2E8F0;">
                    <div style="font-weight:800; color:#1E1B4B; font-size:1.1rem; margin-bottom:14px; display:flex; align-items:center; gap:8px;">
                        <i class="fas fa-camera-retro" style="color:#3B82F6;"></i>
                        <span>${currentUserLanguage === 'ar' ? 'معرض صور هذا اليوم' : 'Photos & Souvenirs de la journée'} (${photos.length})</span>
                    </div>
                    <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(220px, 1fr)); gap:16px;">
                        ${photos.map((p, pIdx) => {
                            const rawUrl = typeof p === 'string' ? p : (p.url || p.src || p.data || '');
                            const photoUrl = (typeof formatPhotoUrl === 'function') ? formatPhotoUrl(rawUrl) : rawUrl;
                            const photoCaption = (typeof p === 'object' && p) ? (p.caption || p.name || '') : '';
                            return `
                            <div class="special-photo-card" onclick="openSpecialPhotoByIndex(${pIdx})" style="background:white; border-radius:14px; overflow:hidden; border:1px solid #E2E8F0; box-shadow:0 4px 14px rgba(0,0,0,0.06); cursor:pointer; transition:transform 0.2s ease, box-shadow 0.2s ease;">
                                <div style="height:175px; overflow:hidden; position:relative; background:#F8FAFC;">
                                    <img src="${photoUrl}" alt="${escapeHtml(photoCaption || 'Photo')}" loading="lazy" style="width:100%; height:100%; object-fit:contain; transition:transform 0.3s ease;">
                                    <div style="position:absolute; bottom:8px; right:8px; background:rgba(0,0,0,0.65); color:white; padding:4px 9px; border-radius:6px; font-size:0.75rem; display:flex; align-items:center; gap:5px;">
                                        <i class="fas fa-search-plus"></i> Agrandir
                                    </div>
                                </div>
                                ${photoCaption ? `
                                    <div style="padding:10px 12px; font-size:0.88rem; font-weight:600; color:#334155; line-height:1.4;">
                                        ${escapeHtml(photoCaption)}
                                    </div>
                                ` : ''}
                            </div>
                            `;
                        }).join('')}
                    </div>
                </div>
            `;
        }

        tableHtml = `
            <div class="parent-special-day-merged-card" style="background:white; border-radius:20px; box-shadow:0 8px 30px rgba(0,0,0,0.08); border:2px solid ${typeCfg.border}; overflow:hidden;">
                <!-- Bannière En-tête Fusionné -->
                <div style="background:linear-gradient(135deg, #1E1B4B, #312E81); color:white; padding:22px 28px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:14px;">
                    <div>
                        <div style="font-size:1.35rem; font-weight:800; display:flex; align-items:center; gap:10px;">
                            <i class="${typeCfg.icon}" style="color:${typeCfg.color};"></i>
                            <span>${formattedDayDate}</span>
                        </div>
                        <div style="font-size:0.92rem; opacity:0.9; margin-top:3px;">
                            ${selectedClass === 'ALL' ? 'Toutes les classes' : `Classe : ${selectedClass}`} • Semaine ${selectedWeek}
                        </div>
                    </div>
                    <span style="background:${typeCfg.bg}; color:${typeCfg.color}; border:1px solid ${typeCfg.border}; padding:8px 18px; border-radius:30px; font-weight:800; font-size:0.95rem; display:inline-flex; align-items:center; gap:8px;">
                        <i class="${typeCfg.icon}"></i> ${typeCfg.label}
                    </span>
                </div>

                <!-- Corps de la Fusion -->
                <div style="padding:32px 28px;">
                    <div style="background:${typeCfg.bg}; border-left:6px solid ${typeCfg.color}; border-radius:14px; padding:20px 24px; margin-bottom:20px;">
                        <h3 style="color:#1E1B4B; font-size:1.4rem; font-weight:800; margin:0 0 10px 0;">
                            ${escapeHtml(activeSpecialDay.title || 'Journée Spéciale')}
                        </h3>
                        <p style="color:#334155; font-size:1.05rem; line-height:1.7; margin:0; white-space:pre-wrap;">${escapeHtml(activeSpecialDay.description || activeSpecialDay.message || "Aucune séance de cours n'est programmée pour ce jour.")}</p>
                    </div>

                    ${photosGalleryHtml}

                    ${isAdminUser ? `
                        <div style="margin-top:25px; padding-top:16px; border-top:1px dashed #CBD5E1; display:flex; gap:10px; justify-content:flex-end;">
                            <button type="button" class="pro-button" onclick="openSpecialDayQuickModal('${parentActiveDay}', '${selectedClass}')" style="background:#EEF2FF; color:#4338CA; border:1px solid #C7D2FE; padding:8px 16px; font-size:0.9rem; font-weight:700;">
                                <i class="fas fa-edit"></i> Modifier cette fusion
                            </button>
                            <button type="button" class="pro-button" onclick="deleteAdminSpecialDay('${activeSpecialDay._id}')" style="background:#FEF2F2; color:#DC2626; border:1px solid #FECACA; padding:8px 16px; font-size:0.9rem; font-weight:700;">
                                <i class="fas fa-trash-alt"></i> Annuler la fusion
                            </button>
                        </div>
                    ` : ''}
                </div>
            </div>
        `;
    } else if (currentDayRows.length === 0) {
        // AUCUN COURS RENSEIGNÉ
        tableHtml = `
            <div style="background:white; border-radius:18px; padding:45px 24px; text-align:center; border:1px dashed #CBD5E1; box-shadow:0 4px 18px rgba(0,0,0,0.04);">
                <div style="width:70px; height:70px; background:#F1F5F9; color:#94A3B8; border-radius:50%; display:flex; align-items:center; justify-content:center; margin:0 auto 16px auto; font-size:2rem;">
                    <i class="fas fa-calendar-day"></i>
                </div>
                <h4 style="font-size:1.25rem; color:#1E1B4B; margin:0 0 8px 0; font-weight:800;">${t.noCoursesFound}</h4>
                <p style="color:#64748B; font-size:1rem; margin:0 0 20px 0;">${currentUserLanguage === 'ar' ? `لا توجد حصص مجدولة ليوم ${formattedDayDate}.` : `Aucun cours planifié pour ${formattedDayDate}.`}</p>
                
                ${isAdminUser ? `
                    <button type="button" class="pro-button primary-button" onclick="openSpecialDayQuickModal('${parentActiveDay}', '${selectedClass}')" style="padding:10px 20px; font-weight:700; border-radius:12px; display:inline-flex; align-items:center; gap:8px;">
                        <i class="fas fa-object-group"></i> <span>Fusionner ce jour & Ajouter des photos</span>
                    </button>
                ` : ''}
            </div>
        `;
    } else {
        // TABLEAU STANDARD DES COURS DU JOUR
        tableHtml = `
            <div class="parent-day-table-card" style="background:white; border-radius:18px; box-shadow:0 6px 24px rgba(0,0,0,0.06); border:1px solid #E2E8F0; overflow:hidden;">
                <!-- En-tête du jour -->
                <div style="background:linear-gradient(135deg, #1E1B4B, #312E81); color:white; padding:18px 24px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">
                    <div style="font-size:1.25rem; font-weight:800; display:flex; align-items:center; gap:10px;">
                        <i class="fas fa-calendar-check" style="color:#10B981;"></i>
                        <span>${currentUserLanguage === 'ar' ? 'جدول حصص يوم' : 'Tableau des cours du'} : ${formattedDayDate}</span>
                    </div>
                    <div style="display:flex; align-items:center; gap:10px;">
                        <span style="background:rgba(255,255,255,0.18); padding:6px 14px; border-radius:20px; font-size:0.9rem; font-weight:700;">
                            ${currentDayRows.length} ${t.sessionsCount}
                        </span>
                        ${isAdminUser ? `
                            <button type="button" class="pro-button" onclick="openSpecialDayQuickModal('${parentActiveDay}', '${selectedClass}')" title="Fusionner les cases de ce jour pour les parents (pas de cours / photos)" style="background:rgba(255,255,255,0.25); color:white; border:none; padding:6px 12px; border-radius:8px; font-size:0.85rem; font-weight:700; cursor:pointer;">
                                <i class="fas fa-object-group"></i> Fusionner ce jour
                            </button>
                        ` : ''}
                    </div>
                </div>
                
                <!-- Tableau des cours -->
                <div style="overflow-x:auto; padding:10px;">
                    <table style="width:100%; border-collapse:separate; border-spacing:0; min-width:850px;">
                        <thead>
                            <tr style="background:#F1F5F9; color:#1E1B4B; font-size:0.95rem; font-weight:700;">
                                <th style="padding:14px 12px; border-bottom:2px solid #CBD5E1; text-align:center; width:90px;">${t.colPeriod || 'Période'}</th>
                                <th style="padding:14px 14px; border-bottom:2px solid #CBD5E1; text-align:${currentUserLanguage === 'ar' ? 'right' : 'left'}; width:200px;">${t.colSubjectTeacher || 'Matière & Enseignant'}</th>
                                <th style="padding:14px 14px; border-bottom:2px solid #CBD5E1; text-align:${currentUserLanguage === 'ar' ? 'right' : 'left'};">${t.colLesson || 'Leçon & Sujet'}</th>
                                <th style="padding:14px 14px; border-bottom:2px solid #CBD5E1; text-align:${currentUserLanguage === 'ar' ? 'right' : 'left'};">${t.colClassWork || 'Travail de classe'}</th>
                                <th style="padding:14px 14px; border-bottom:2px solid #CBD5E1; text-align:${currentUserLanguage === 'ar' ? 'right' : 'left'}; width:240px; background:#ECFDF5; color:#065F46;">
                                    <i class="fas fa-pen-fancy"></i> ${t.colHomework || 'Devoirs à la maison'}
                                </th>
                                <th style="padding:14px 12px; border-bottom:2px solid #CBD5E1; text-align:center; width:100px;">${t.colSupport || 'Supports'}</th>
                            </tr>
                        </thead>
                        <tbody>
        `;
        
        currentDayRows.forEach((row, idx) => {
            const period = getRowField(row, 'Période') || (idx + 1);
            const matiere = getRowField(row, 'Matière') || 'Matière';
            const enseignant = getRowField(row, 'Enseignant') || '';
            const lecon = getRowField(row, 'Leçon') || '';
            const travaux = getRowField(row, 'Travaux de classe') || '';
            const devoirs = getRowField(row, 'Devoirs') || '';
            const support = getRowField(row, 'Support') || '';
            
            const isLessonEmpty = !lecon || String(lecon).trim() === '';
            const isHomeworkEmpty = !devoirs || String(devoirs).trim() === '';
            const bgRow = (idx % 2 === 0) ? '#FFFFFF' : '#F8FAFC';
            
            tableHtml += `
                <tr style="background:${bgRow}; border-bottom:1px solid #E2E8F0; vertical-align:middle; transition:background 0.2s ease;">
                    <!-- Période -->
                    <td style="padding:16px 12px; border-bottom:1px solid #E2E8F0; text-align:center;">
                        <span style="background:#EEF2FF; color:#4338CA; font-weight:800; padding:6px 12px; border-radius:10px; font-size:0.95rem; display:inline-block;">
                            ${period}
                        </span>
                    </td>
                    
                    <!-- Matière & Enseignant -->
                    <td style="padding:16px 14px; border-bottom:1px solid #E2E8F0;">
                        <div style="font-weight:800; color:#1E1B4B; font-size:1.05rem; margin-bottom:4px;">${escapeHtml(matiere)}</div>
                        ${enseignant ? `
                            <button type="button" onclick="openContactTeacherModal('${escapeHtml(enseignant).replace(/'/g, "\\'")}')" class="teacher-direct-msg-btn" style="background:#EEF2FF; color:#4338CA; border:1px solid #C7D2FE; padding:4px 10px; border-radius:8px; font-size:0.82rem; font-weight:700; cursor:pointer; display:inline-flex; align-items:center; gap:5px; margin-top:2px;">
                                <i class="fas fa-chalkboard-teacher"></i>
                                <span>${escapeHtml(enseignant)}</span>
                                <span style="background:#4338CA; color:white; padding:1px 5px; border-radius:4px; font-size:0.75rem;">✉️</span>
                            </button>
                        ` : ''}
                    </td>
                    
                    <!-- Leçon / Sujet -->
                    <td style="padding:16px 14px; border-bottom:1px solid #E2E8F0; font-size:0.98rem; line-height:1.5; color:${isLessonEmpty ? '#94A3B8' : '#1E293B'}; font-weight:${isLessonEmpty ? '400' : '600'};">
                        ${isLessonEmpty ? `<i>${currentUserLanguage === 'ar' ? 'غير مسجل' : 'Non renseigné'}</i>` : escapeHtml(lecon)}
                    </td>
                    
                    <!-- Travaux de classe -->
                    <td style="padding:16px 14px; border-bottom:1px solid #E2E8F0; font-size:0.95rem; line-height:1.5; color:#334155;">
                        ${travaux && String(travaux).trim() !== '' ? escapeHtml(travaux) : `<span style="color:#94A3B8;">-</span>`}
                    </td>
                    
                    <!-- Devoirs à la maison -->
                    <td style="padding:16px 14px; border-bottom:1px solid #E2E8F0; background:${isHomeworkEmpty ? 'inherit' : '#F0FDF4'};">
                        <div style="font-size:0.98rem; font-weight:${isHomeworkEmpty ? '400' : '700'}; color:${isHomeworkEmpty ? '#94A3B8' : '#065F46'}; line-height:1.4;">
                            ${isHomeworkEmpty ? `<span style="color:#94A3B8;">${t.noHomework}</span>` : `<div style="display:flex; align-items:flex-start; gap:6px;"><i class="fas fa-check" style="color:#10B981; margin-top:4px;"></i> <span>${escapeHtml(devoirs)}</span></div>`}
                        </div>
                    </td>
                    
                    <!-- Support / Liens -->
                    <td style="padding:16px 12px; border-bottom:1px solid #E2E8F0; text-align:center;">
                        ${support && String(support).trim() !== '' ? `
                            <a href="${support.startsWith('http') ? support : 'http://' + support}" target="_blank" style="background:#EFF6FF; color:#2563EB; border:1px solid #BFDBFE; padding:6px 10px; border-radius:8px; font-size:0.85rem; font-weight:700; text-decoration:none; display:inline-flex; align-items:center; gap:4px;">
                                <i class="fas fa-external-link-alt"></i> <span>Ouvrir</span>
                            </a>
                        ` : `<span style="color:#CBD5E1;">-</span>`}
                    </td>
                </tr>
            `;
        });
        
        tableHtml += `
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    }
    
    container.innerHTML = daysNavHtml + tableHtml;
}

// ----------------------------------------------------
// GESTION ADMIN DES JOURS SPÉCIAUX & PHOTOS (FUSION)
// ----------------------------------------------------

function populateAdminSpecialDaysForm() {
    const weekSelect = document.getElementById('specialDayWeek');
    if (weekSelect) {
        const curWeek = currentWeek || 1;
        weekSelect.innerHTML = '';
        for (let w = 1; w <= 40; w++) {
            const opt = document.createElement('option');
            opt.value = w;
            opt.textContent = `Semaine ${w}`;
            if (Number(w) === Number(curWeek)) opt.selected = true;
            weekSelect.appendChild(opt);
        }
        weekSelect.value = curWeek;
    }
    updateAdminSpecialDaysClassDropdown();
}

function updateAdminSpecialDaysClassDropdown() {
    const classSelect = document.getElementById('specialDayClass');
    const secSelect = document.getElementById('specialDaySection');
    if (!classSelect) return;
    const sec = secSelect ? secSelect.value : (currentSection || 'garcons');
    
    let classes = [];
    if (sec === 'garcons') {
        classes = ['PEI1', 'PEI2', 'PEI3', 'PEI4', 'PEI5', 'DP1', 'DP2'];
    } else if (sec === 'filles') {
        classes = ['PEI1', 'PEI2', 'PEI3', 'PEI4', 'PEI5', 'DP1', 'DP2'];
    } else {
        classes = ['PS', 'MS', 'GS', 'CP', 'CE1', 'CE2', 'CM1', 'CM2', '1P', '2P', '3P', '4P', '5P'];
    }

    let html = `<option value="ALL">🌟 Toutes les classes de la section</option>`;
    classes.forEach(c => {
        html += `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`;
    });
    classSelect.innerHTML = html;
}

async function loadAdminSpecialDaysList() {
    const container = document.getElementById('adminSpecialDaysListContainer');
    const tbody = document.getElementById('adminSpecialDaysTableBody');
    if (!container && !tbody) return;

    if (container) {
        container.innerHTML = `<div style="grid-column: 1/-1; text-align:center; padding:25px; color:#6B7280;"><i class="fas fa-spinner fa-spin fa-2x"></i><p style="margin-top:8px;">Chargement des journées fusionnées...</p></div>`;
    }

    try {
        const sectionEl = document.getElementById('specialDaySection');
        const section = (sectionEl ? sectionEl.value : currentSection) || 'garcons';
        const res = await fetch(`/api/special-days?section=${section}`);
        if (!res.ok) throw new Error('Erreur lors du chargement');
        const list = await res.json();

        if (!list || list.length === 0) {
            if (container) {
                container.innerHTML = `
                    <div style="grid-column:1/-1; text-align:center; padding:35px 20px; background:white; border-radius:14px; border:1px dashed #CBD5E1;">
                        <i class="fas fa-calendar-check fa-2x" style="color:#94A3B8; margin-bottom:8px;"></i>
                        <p style="color:#64748B; font-weight:600; margin:0;">Aucune journée fusionnée pour cette section.</p>
                    </div>
                `;
            }
            if (tbody) tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:20px; color:#9CA3AF;">Aucune fusion enregistrée.</td></tr>`;
            return;
        }

        if (container) {
            container.innerHTML = list.map(item => {
                const photoCount = (item.photos && item.photos.length) || 0;
                return `
                    <div style="background:white; border:1.5px solid #E2E8F0; border-radius:14px; padding:16px; box-shadow:0 2px 8px rgba(0,0,0,0.04); display:flex; flex-direction:column; justify-content:space-between;">
                        <div>
                            <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:8px; margin-bottom:10px;">
                                <div>
                                    <span style="background:#EDE9FE; color:#6D28D9; font-weight:800; font-size:0.8rem; padding:3px 8px; border-radius:6px;">Semaine ${item.week}</span>
                                    <span style="background:#F1F5F9; color:#334155; font-weight:700; font-size:0.8rem; padding:3px 8px; border-radius:6px; margin-left:4px;">${escapeHtml(item.day)}</span>
                                </div>
                                <span style="background:#FEF2F2; color:#DC2626; font-size:0.75rem; font-weight:700; padding:2px 8px; border-radius:10px;">Pas de cours</span>
                            </div>
                            <h5 style="margin:0 0 6px 0; color:#1E1B4B; font-size:1.05rem; font-weight:800;">
                                ${escapeHtml(item.title)}
                            </h5>
                            <div style="font-size:0.85rem; color:#475569; margin-bottom:8px; line-height:1.4;">
                                ${escapeHtml(item.description || item.message || '')}
                            </div>
                            <div style="font-size:0.8rem; color:#64748B; margin-bottom:10px;">
                                <i class="fas fa-users"></i> Classe : <strong>${item.classe === 'ALL' || item.classe === 'all' ? 'Toutes les classes' : escapeHtml(item.classe)}</strong>
                            </div>
                            ${photoCount > 0 ? `
                                <div style="display:flex; gap:6px; flex-wrap:wrap; margin-bottom:12px;">
                                    ${item.photos.slice(0, 3).map(p => `
                                        <img src="${escapeHtml(p.url)}" alt="Photo" style="width:48px; height:48px; border-radius:6px; object-fit:cover; border:1px solid #CBD5E1;">
                                    `).join('')}
                                    ${photoCount > 3 ? `<span style="font-size:0.75rem; color:#6D28D9; font-weight:700; align-self:center;">+${photoCount - 3}</span>` : ''}
                                </div>
                            ` : ''}
                        </div>
                        <div style="display:flex; justify-content:flex-end; border-top:1px solid #F1F5F9; padding-top:10px;">
                            <button type="button" class="pro-button" onclick="deleteAdminSpecialDay('${item._id}')" style="background:#FEF2F2; color:#DC2626; border:1px solid #FECACA; padding:5px 12px; font-size:0.8rem; font-weight:700; border-radius:8px;">
                                <i class="fas fa-trash-alt"></i> Supprimer
                            </button>
                        </div>
                    </div>
                `;
            }).join('');
        }
    } catch (e) {
        console.error('Erreur loadAdminSpecialDaysList:', e);
        if (container) container.innerHTML = `<div style="grid-column:1/-1; color:#DC2626; padding:20px;">Erreur: ${e.message}</div>`;
    }
}

// Helper pour convertir les liens d'images (notamment Google Drive) en URL directe affichable
function formatPhotoUrl(url) {
    if (!url || typeof url !== 'string') return '';
    const clean = url.trim();
    if (clean.startsWith('data:image/')) return clean;

    // Google Drive share link -> point d'accès direct thumbnail universel haute résolution (w2560)
    // Ex: https://drive.google.com/file/d/FILE_ID/view?usp=sharing
    // Ex: https://drive.google.com/open?id=FILE_ID
    // Ex: https://lh3.googleusercontent.com/d/FILE_ID
    const driveMatch = clean.match(/\/file\/d\/([a-zA-Z0-9_-]+)/) ||
                       clean.match(/\/d\/([a-zA-Z0-9_-]+)/) || 
                       clean.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    if (driveMatch && driveMatch[1]) {
        return `https://drive.google.com/thumbnail?id=${driveMatch[1]}&sz=w2560`;
    }
    return clean;
}
window.formatPhotoUrl = formatPhotoUrl;

// Helper pour compresser les photos sélectionnées afin de garantir une inclusion parfaite et rapide
function compressImageFile(file, maxWidth = 1600, maxHeight = 1200, quality = 0.85) {
    return new Promise((resolve) => {
        if (!file || !file.type.startsWith('image/')) {
            resolve(null);
            return;
        }
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                let w = img.width;
                let h = img.height;
                if (w > maxWidth || h > maxHeight) {
                    const ratio = Math.min(maxWidth / w, maxHeight / h);
                    w = Math.round(w * ratio);
                    h = Math.round(h * ratio);
                }
                const canvas = document.createElement('canvas');
                canvas.width = w;
                canvas.height = h;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, w, h);
                const dataUrl = canvas.toDataURL('image/jpeg', quality);
                resolve(dataUrl);
            };
            img.onerror = () => resolve(e.target.result);
            img.src = e.target.result;
        };
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(file);
    });
}

async function handleSpecialDayPhotosSelected(e) {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const compressed = await compressImageFile(file);
        if (compressed) {
            adminSpecialPhotosList.push({
                url: compressed,
                caption: file.name.replace(/\.[^/.]+$/, "")
            });
        }
    }
    renderAdminSpecialPhotosPreview();
    e.target.value = '';
}

function addSpecialDayPhotoFromUrl() {
    const input = document.getElementById('specialDayPhotoUrlInput') || document.getElementById('specialPhotoUrlInput');
    const url = input ? input.value.trim() : '';
    if (!url) return;

    adminSpecialPhotosList.push({
        url: formatPhotoUrl(url),
        caption: 'Photo'
    });
    if (input) input.value = '';
    renderAdminSpecialPhotosPreview();
}

function removeAdminSpecialPhoto(index) {
    adminSpecialPhotosList.splice(index, 1);
    renderAdminSpecialPhotosPreview();
}

function renderAdminSpecialPhotosPreview() {
    const container = document.getElementById('specialDayPhotosPreviewContainer') || document.getElementById('specialPhotosPreviewContainer');
    if (!container) return;

    if (adminSpecialPhotosList.length === 0) {
        container.innerHTML = '';
        return;
    }

    container.innerHTML = adminSpecialPhotosList.map((p, idx) => `
        <div style="position:relative; width:100px; height:100px; border-radius:10px; overflow:hidden; border:2px solid #CBD5E1; background:#F8FAFC;">
            <img src="${escapeHtml(formatPhotoUrl(p.url))}" alt="Photo ${idx + 1}" style="width:100%; height:100%; object-fit:cover;">
            <button type="button" onclick="removeAdminSpecialPhoto(${idx})" style="position:absolute; top:3px; right:3px; background:rgba(220,38,38,0.85); color:white; border:none; border-radius:50%; width:22px; height:22px; display:flex; align-items:center; justify-content:center; font-size:0.75rem; cursor:pointer;">
                <i class="fas fa-times"></i>
            </button>
        </div>
    `).join('');
}

async function saveAdminSpecialDay() {
    const section = document.getElementById('specialDaySection')?.value || currentSection || 'garcons';
    const week = document.getElementById('specialDayWeek')?.value;
    const day = document.getElementById('specialDayDay')?.value || document.getElementById('specialDayJour')?.value;
    const classe = document.getElementById('specialDayClass')?.value || document.getElementById('specialDayClasse')?.value || 'ALL';
    const title = document.getElementById('specialDayTitle')?.value?.trim();
    const description = (document.getElementById('specialDayDescription') || document.getElementById('specialDayMessage'))?.value?.trim() || '';

    if (!week) {
        alert('Veuillez sélectionner la semaine cible.');
        return;
    }
    if (!day) {
        alert('Veuillez sélectionner le jour.');
        return;
    }
    if (!title) {
        alert('Veuillez renseigner le titre de l\'événement.');
        return;
    }

    // Auto-capture si une URL est encore dans le champ texte sans avoir cliqué sur "+ Ajouter URL"
    const pendingUrlInput = document.getElementById('specialDayPhotoUrlInput') || document.getElementById('specialPhotoUrlInput');
    const pendingUrl = pendingUrlInput ? pendingUrlInput.value.trim() : '';
    if (pendingUrl) {
        adminSpecialPhotosList.push({
            url: formatPhotoUrl(pendingUrl),
            caption: title || 'Photo'
        });
        pendingUrlInput.value = '';
        renderAdminSpecialPhotosPreview();
    }

    // Si aucune photo et Fête Nationale, auto-ajouter l'affiche officielle
    if (adminSpecialPhotosList.length === 0 && /f[eê]te\s*nationale/i.test(title)) {
        adminSpecialPhotosList.push({
            url: 'https://drive.google.com/thumbnail?id=1tLpelITZSuch6gckvasulKDnm__aeF78&sz=w2560',
            caption: 'Célébration Fête Nationale'
        });
        renderAdminSpecialPhotosPreview();
    }

    const payload = {
        section: section,
        week: Number(week),
        day: day,
        classe: classe,
        type: 'no_courses',
        title: title,
        description: description,
        message: description,
        photos: adminSpecialPhotosList,
        isNoSchool: true
    };

    try {
        const res = await fetch('/api/special-days', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.message || "Erreur lors de l'enregistrement");
        }

        displayAlert('✅ Journée spéciale / fusion enregistrée avec succès !', false);
        adminSpecialPhotosList = [];
        renderAdminSpecialPhotosPreview();
        if (document.getElementById('specialDayTitle')) document.getElementById('specialDayTitle').value = '';
        if (document.getElementById('specialDayDescription')) document.getElementById('specialDayDescription').value = '';
        loadAdminSpecialDaysList();
        if (typeof loadParentWeeklyPlan === 'function') loadParentWeeklyPlan();
    } catch (e) {
        console.error('Erreur saveAdminSpecialDay:', e);
        alert('Erreur: ' + e.message);
    }
}

async function deleteAdminSpecialDay(id) {
    if (!confirm('Voulez-vous vraiment supprimer cette fusion de jour / journée spéciale ?')) return;

    try {
        const res = await fetch(`/api/special-days/${id}`, { method: 'DELETE' });
        if (!res.ok) throw new Error('Erreur lors de la suppression');
        displayAlert('Fusion supprimée avec succès.', false);
        loadAdminSpecialDaysList();
        if (typeof loadParentWeeklyPlan === 'function') loadParentWeeklyPlan();
    } catch (e) {
        console.error('Erreur deleteAdminSpecialDay:', e);
        alert('Erreur: ' + e.message);
    }
}

// Quick Modal de fusion depuis la vue des parents ou le bouton rapide
function openSpecialDayQuickModal(day, classe) {
    const modal = document.getElementById('specialDayQuickModal');
    if (!modal) return;

    const curWeek = document.getElementById('parentWeekSelector')?.value || document.getElementById('weekSelector')?.value || (currentWeek || 1);
    const curSection = currentSection || 'garcons';
    const curDay = day || parentActiveDay || 'Dimanche';

    const sectionSelect = document.getElementById('quickSpecialSection');
    if (sectionSelect) {
        sectionSelect.value = curSection;
    }

    const weekSelect = document.getElementById('quickSpecialWeek');
    if (weekSelect) {
        weekSelect.innerHTML = '';
        for (let w = 1; w <= 40; w++) {
            const opt = document.createElement('option');
            opt.value = w;
            opt.textContent = `Semaine ${w}`;
            if (Number(w) === Number(curWeek)) opt.selected = true;
            weekSelect.appendChild(opt);
        }
        weekSelect.value = curWeek;
    }

    const daySelect = document.getElementById('quickSpecialDay');
    if (daySelect) {
        daySelect.value = curDay;
    }

    updateQuickSpecialClassesDropdown(classe);

    // Chercher si un jour spécial existe déjà pour ce jour / classe dans la liste parentSpecialDays
    const norm = (s) => String(s || '').trim().toLowerCase().replace(/[\s\-_]+/g, '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const curDayNorm = normalizeDayName(curDay) || curDay;
    const existing = (parentSpecialDays || []).find(s => {
        if (!s) return false;
        const dNorm = normalizeDayName(s.day) || s.day;
        const matchDay = (dNorm.toLowerCase() === curDayNorm.toLowerCase());
        const sClass = String(s.classe || '').trim().toLowerCase();
        const matchClass = (!s.classe || sClass === 'all' || sClass === 'toutes' || norm(s.classe) === norm(classe));
        return matchDay && matchClass;
    });

    const titleInput = document.getElementById('quickSpecialTitle');
    const msgInput = document.getElementById('quickSpecialMessage') || document.getElementById('quickSpecialDesc');

    if (existing) {
        if (titleInput) titleInput.value = existing.title || 'Orientation';
        if (msgInput) msgInput.value = existing.message || existing.description || '';
        const rawP = Array.isArray(existing.photos) ? existing.photos : [];
        quickSpecialPhotosList = rawP.map(p => {
            if (typeof p === 'string') return { url: p, caption: '' };
            if (p && typeof p === 'object') return { url: p.url || p.src || p.data || '', caption: p.caption || '' };
            return null;
        }).filter(p => p && p.url);
    } else {
        if (titleInput && (!titleInput.value || titleInput.value.startsWith('Pas de cours'))) {
            titleInput.value = 'Orientation';
        }
        if (msgInput && !msgInput.value) {
            msgInput.value = "La Direction & L'Equipe Pédagogique\nLes Écoles Internationales Al Kawthar";
        }
        quickSpecialPhotosList = [];
    }

    const urlInput = document.getElementById('quickSpecialPhotoUrlInput');
    if (urlInput) urlInput.value = '';

    renderQuickSpecialPhotosPreview();
    modal.style.display = 'flex';
}

function addQuickSpecialPhotoFromUrl() {
    const input = document.getElementById('quickSpecialPhotoUrlInput');
    const url = input ? input.value.trim() : '';
    if (!url) return;

    const formatted = (typeof formatPhotoUrl === 'function') ? formatPhotoUrl(url) : url;
    quickSpecialPhotosList.push({
        url: formatted,
        caption: 'Photo / Affiche'
    });
    input.value = '';
    renderQuickSpecialPhotosPreview();
}

function onQuickSpecialSectionChange() {
    updateQuickSpecialClassesDropdown();
}

function updateQuickSpecialClassesDropdown(targetClass) {
    const classSelect = document.getElementById('quickSpecialClass');
    if (!classSelect) return;
    const sec = document.getElementById('quickSpecialSection')?.value || currentSection || 'garcons';
    
    let classes = [];
    if (sec === 'garcons') {
        classes = ['PEI1', 'PEI2', 'PEI3', 'PEI4', 'PEI5', 'DP1', 'DP2'];
    } else if (sec === 'filles') {
        classes = ['PEI1', 'PEI2', 'PEI3', 'PEI4', 'PEI5', 'DP1', 'DP2'];
    } else {
        classes = ['PS', 'MS', 'GS', 'CP', 'CE1', 'CE2', 'CM1', 'CM2', '1P', '2P', '3P', '4P', '5P'];
    }

    let html = `<option value="ALL">🌟 Toutes les classes (${sec === 'garcons' ? 'Garçons' : (sec === 'filles' ? 'Filles' : 'Primaire')})</option>`;
    classes.forEach(c => {
        const isSel = (targetClass && String(targetClass).toLowerCase() === String(c).toLowerCase());
        html += `<option value="${escapeHtml(c)}" ${isSel ? 'selected' : ''}>${escapeHtml(c)}</option>`;
    });
    classSelect.innerHTML = html;
}

function closeSpecialDayQuickModal() {
    const modal = document.getElementById('specialDayQuickModal');
    if (modal) modal.style.display = 'none';
}

async function handleQuickSpecialPhotosSelected(e) {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const container = document.getElementById('quickSpecialPhotosPreview');
    if (container) {
        const loadingDiv = document.createElement('div');
        loadingDiv.id = 'quickPhotosLoadingIndicator';
        loadingDiv.style.cssText = 'padding:6px 12px; background:#EFF6FF; border-radius:8px; color:#2563EB; font-size:0.85rem; font-weight:600; display:flex; align-items:center; gap:6px;';
        loadingDiv.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Traitement de ${files.length} photo(s)...`;
        container.appendChild(loadingDiv);
    }

    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        try {
            const compressed = (typeof compressImageFile === 'function') ? await compressImageFile(file, 1600, 1200, 0.82) : null;
            if (compressed) {
                quickSpecialPhotosList.push({
                    url: compressed,
                    caption: file.name.replace(/\.[^/.]+$/, "")
                });
            } else {
                const dataUrl = await new Promise((resolve) => {
                    const reader = new FileReader();
                    reader.onload = (event) => resolve(event.target.result);
                    reader.onerror = () => resolve(null);
                    reader.readAsDataURL(file);
                });
                if (dataUrl) {
                    quickSpecialPhotosList.push({
                        url: dataUrl,
                        caption: file.name.replace(/\.[^/.]+$/, "")
                    });
                }
            }
        } catch (err) {
            console.error('Erreur lecture photo:', err);
        }
    }
    renderQuickSpecialPhotosPreview();
    e.target.value = '';
}

function removeQuickSpecialPhoto(index) {
    quickSpecialPhotosList.splice(index, 1);
    renderQuickSpecialPhotosPreview();
}

function renderQuickSpecialPhotosPreview() {
    const container = document.getElementById('quickSpecialPhotosPreview');
    if (!container) return;

    if (quickSpecialPhotosList.length === 0) {
        container.innerHTML = '';
        return;
    }

    container.innerHTML = quickSpecialPhotosList.map((p, idx) => `
        <div style="position:relative; width:90px; height:90px; border-radius:10px; overflow:hidden; border:2px solid #CBD5E1; background:#F8FAFC;">
            <img src="${escapeHtml((typeof formatPhotoUrl === 'function') ? formatPhotoUrl(p.url) : p.url)}" alt="Photo ${idx + 1}" style="width:100%; height:100%; object-fit:cover;">
            <button type="button" onclick="removeQuickSpecialPhoto(${idx})" style="position:absolute; top:3px; right:3px; background:rgba(220,38,38,0.85); color:white; border:none; border-radius:50%; width:20px; height:20px; display:flex; align-items:center; justify-content:center; font-size:0.75rem; cursor:pointer;">
                <i class="fas fa-times"></i>
            </button>
        </div>
    `).join('');
}

async function saveQuickSpecialDay() {
    const section = document.getElementById('quickSpecialSection')?.value || currentSection || 'garcons';
    const week = document.getElementById('quickSpecialWeek')?.value;
    const day = document.getElementById('quickSpecialDay')?.value;
    const classe = document.getElementById('quickSpecialClass')?.value || 'ALL';
    const title = document.getElementById('quickSpecialTitle')?.value?.trim();
    const msgEl = document.getElementById('quickSpecialMessage') || document.getElementById('quickSpecialDesc');
    const message = msgEl ? msgEl.value.trim() : '';

    if (!week) {
        alert('Veuillez sélectionner la semaine.');
        return;
    }
    if (!day) {
        alert('Veuillez sélectionner le jour.');
        return;
    }
    if (!title) {
        alert("Veuillez renseigner le titre de l'événement.");
        return;
    }

    // Auto-capture si une URL est présente dans le champ texte
    const pendingQuickUrlInput = document.getElementById('quickSpecialPhotoUrlInput');
    const pendingQuickUrl = pendingQuickUrlInput ? pendingQuickUrlInput.value.trim() : '';
    if (pendingQuickUrl) {
        quickSpecialPhotosList.push({
            url: (typeof formatPhotoUrl === 'function') ? formatPhotoUrl(pendingQuickUrl) : pendingQuickUrl,
            caption: title || 'Photo'
        });
        pendingQuickUrlInput.value = '';
        renderQuickSpecialPhotosPreview();
    }

    // Si aucune photo et Fête Nationale, auto-ajouter l'affiche officielle
    if (quickSpecialPhotosList.length === 0 && /f[eê]te\s*nationale/i.test(title)) {
        quickSpecialPhotosList.push({
            url: 'https://drive.google.com/thumbnail?id=1tLpelITZSuch6gckvasulKDnm__aeF78&sz=w2560',
            caption: 'Célébration Fête Nationale'
        });
        renderQuickSpecialPhotosPreview();
    }

    const payload = {
        section: section,
        week: Number(week),
        day: day,
        classe: classe,
        type: 'no_courses',
        title: title,
        description: message,
        message: message,
        photos: quickSpecialPhotosList,
        isNoSchool: true
    };

    try {
        const res = await fetch('/api/special-days', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || err.message || "Erreur lors de l'enregistrement");
        }

        displayAlert('✅ Journée fusionnée avec succès pour les parents !', false);
        closeSpecialDayQuickModal();
        if (typeof loadParentWeeklyPlan === 'function') loadParentWeeklyPlan();
        if (typeof loadAdminSpecialDaysList === 'function') loadAdminSpecialDaysList();
    } catch (e) {
        console.error('Erreur saveQuickSpecialDay:', e);
        alert('Erreur: ' + e.message);
    }
}

// Lightbox moderne et interactive avec navigation multi-photos et raccourcis clavier
let currentLightboxIndex = 0;

function openSpecialPhotoByIndex(index) {
    const photos = window.currentSpecialPhotos || [];
    if (!photos || photos.length === 0) return;
    currentLightboxIndex = Math.max(0, Math.min(index, photos.length - 1));
    updateLightboxContent();
}
window.openSpecialPhotoByIndex = openSpecialPhotoByIndex;

function updateLightboxContent() {
    const photos = window.currentSpecialPhotos || [];
    if (!photos || photos.length === 0) return;
    const p = photos[currentLightboxIndex];
    if (!p) return;
    const rawUrl = typeof p === 'string' ? p : (p.url || p.src || p.data || '');
    const url = (typeof formatPhotoUrl === 'function') ? formatPhotoUrl(rawUrl) : rawUrl;
    const caption = (typeof p === 'object' && p) ? (p.caption || p.name || '') : '';
    
    openImageLightbox(url, caption, currentLightboxIndex + 1, photos.length);
}

function prevLightboxPhoto(e) {
    if (e) e.stopPropagation();
    const photos = window.currentSpecialPhotos || [];
    if (!photos || photos.length <= 1) return;
    currentLightboxIndex = (currentLightboxIndex - 1 + photos.length) % photos.length;
    updateLightboxContent();
}
window.prevLightboxPhoto = prevLightboxPhoto;

function nextLightboxPhoto(e) {
    if (e) e.stopPropagation();
    const photos = window.currentSpecialPhotos || [];
    if (!photos || photos.length <= 1) return;
    currentLightboxIndex = (currentLightboxIndex + 1) % photos.length;
    updateLightboxContent();
}
window.nextLightboxPhoto = nextLightboxPhoto;

function openImageLightbox(src, caption, currentNum, totalNum) {
    let lightbox = document.getElementById('appImageLightbox');
    if (!lightbox) {
        lightbox = document.createElement('div');
        lightbox.id = 'appImageLightbox';
        lightbox.className = 'app-lightbox-backdrop';
        lightbox.style.cssText = 'position:fixed; top:0; left:0; width:100vw; height:100vh; background:rgba(15, 23, 42, 0.92); backdrop-filter:blur(8px); display:flex; flex-direction:column; align-items:center; justify-content:center; z-index:99999; padding:20px; box-sizing:border-box;';
        lightbox.innerHTML = `
            <div style="position:relative; max-width:92vw; max-height:90vh; display:flex; flex-direction:column; align-items:center; justify-content:center;">
                <!-- Bouton Fermer -->
                <button type="button" onclick="closeImageLightbox()" title="Fermer (Échap)" style="position:absolute; top:-48px; right:0; background:rgba(255,255,255,0.2); color:white; border:1px solid rgba(255,255,255,0.4); width:40px; height:40px; border-radius:50%; font-size:1.2rem; cursor:pointer; font-weight:800; display:flex; align-items:center; justify-content:center; transition:background 0.2s;">
                    ✕
                </button>
                
                <!-- Boutons Précédent / Suivant si plusieurs photos -->
                <button type="button" id="lightboxPrevBtn" onclick="prevLightboxPhoto(event)" title="Photo précédente (Flèche gauche)" style="position:absolute; left:-60px; top:50%; transform:translateY(-50%); background:rgba(255,255,255,0.2); color:white; border:1px solid rgba(255,255,255,0.3); width:44px; height:44px; border-radius:50%; font-size:1.2rem; cursor:pointer; display:none; align-items:center; justify-content:center; transition:background 0.2s;">
                    <i class="fas fa-chevron-left"></i>
                </button>
                <button type="button" id="lightboxNextBtn" onclick="nextLightboxPhoto(event)" title="Photo suivante (Flèche droite)" style="position:absolute; right:-60px; top:50%; transform:translateY(-50%); background:rgba(255,255,255,0.2); color:white; border:1px solid rgba(255,255,255,0.3); width:44px; height:44px; border-radius:50%; font-size:1.2rem; cursor:pointer; display:none; align-items:center; justify-content:center; transition:background 0.2s;">
                    <i class="fas fa-chevron-right"></i>
                </button>

                <img id="lightboxImg" src="" alt="Photo" style="max-width:88vw; max-height:75vh; border-radius:14px; box-shadow:0 15px 40px rgba(0,0,0,0.6); object-fit:contain; background:#0F172A;">
                
                <div style="display:flex; justify-content:space-between; align-items:center; width:100%; margin-top:14px; gap:16px;">
                    <div id="lightboxCaption" style="color:white; font-size:1.05rem; font-weight:700; text-shadow:0 2px 4px rgba(0,0,0,0.8); flex:1;"></div>
                    <div id="lightboxCounter" style="background:rgba(255,255,255,0.2); color:white; font-size:0.85rem; font-weight:700; padding:4px 10px; border-radius:20px; display:none; white-space:nowrap;"></div>
                </div>
            </div>
        `;
        document.body.appendChild(lightbox);
        lightbox.onclick = (e) => {
            if (e.target === lightbox) closeImageLightbox();
        };

        // Navigation au clavier
        window.addEventListener('keydown', (e) => {
            const lb = document.getElementById('appImageLightbox');
            if (!lb || lb.style.display !== 'flex') return;
            if (e.key === 'Escape') closeImageLightbox();
            if (e.key === 'ArrowLeft') prevLightboxPhoto();
            if (e.key === 'ArrowRight') nextLightboxPhoto();
        });
    }

    const imgEl = document.getElementById('lightboxImg');
    const capEl = document.getElementById('lightboxCaption');
    const counterEl = document.getElementById('lightboxCounter');
    const prevBtn = document.getElementById('lightboxPrevBtn');
    const nextBtn = document.getElementById('lightboxNextBtn');

    if (imgEl) imgEl.src = src;
    if (capEl) capEl.textContent = caption || '';
    
    if (totalNum && totalNum > 1) {
        if (counterEl) {
            counterEl.textContent = `${currentNum || 1} / ${totalNum}`;
            counterEl.style.display = 'block';
        }
        if (prevBtn) prevBtn.style.display = 'flex';
        if (nextBtn) nextBtn.style.display = 'flex';
    } else {
        if (counterEl) counterEl.style.display = 'none';
        if (prevBtn) prevBtn.style.display = 'none';
        if (nextBtn) nextBtn.style.display = 'none';
    }
    lightbox.style.display = 'flex';
}
window.openImageLightbox = openImageLightbox;

function closeImageLightbox() {
    const lightbox = document.getElementById('appImageLightbox');
    if (lightbox) lightbox.style.display = 'none';
}
window.closeImageLightbox = closeImageLightbox;

function filterParentPlanByDay() {
    const classSelect = document.getElementById('parentClassSelector');
    if (!classSelect || !parentRawPlanData) return;
    
    const selectedClass = classSelect.value || 'PEI1';
    const norm = (s) => String(s || '').trim().toLowerCase().replace(/[\s\-_]+/g, '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const targetNormClass = norm(selectedClass);
    const classRows = parentRawPlanData.filter(row => {
        const classVal = getRowField(row, 'Classe');
        if (!classVal) return false;
        const rNorm = norm(classVal);
        return rNorm === targetNormClass || rNorm.includes(targetNormClass) || targetNormClass.includes(rNorm);
    });
    
    renderParentPlanCards(classRows);
}

function setHomeworkLanguage(lang) {
    homeworkLang = lang;
    displayAlert(lang === 'fr' ? 'Langue changée en Français' : 'تم تغيير اللغة إلى العربية', false);
    if (selectedStudentObj) {
        openStudentDashboard(selectedStudentObj.name, selectedStudentObj.class);
    }
}

// Cache client et jetons de synchronisation pour garantir une réactivité instantanée sans aucun décalage ni mélange
const studentsClientCache = new Map();
let activeClassFetchSeq = 0;
let currentActiveClassName = 'PEI1';

function renderStudentsGrid(students, className, section) {
    const grid = document.getElementById('students-grid');
    if (!grid) return;
    
    const secLabel = section === 'garcons' ? 'Garçons 👦' : (section === 'primaire' ? 'Primaire & Maternelle 👶🎒' : 'Filles 👧');
    const borderColor = section === 'garcons' ? '#3B82F6' : (section === 'primaire' ? '#10B981' : '#EC4899');
    
    if (!students || students.length === 0) {
        grid.innerHTML = `
            <div style="grid-column: 1/-1; text-align:center; padding:40px 20px; background:white; border-radius:16px; color:#6B7280; font-weight:600; border:1px dashed #CBD5E1; max-width:480px; margin:20px auto;">
                <i class="fas fa-user-slash fa-2x" style="display:block; margin-bottom:12px; color:#9CA3AF;"></i>
                <p style="margin:0; font-size:1rem;">${currentUserLanguage === 'ar' ? `لا يوجد طلاب مسجلين في قسم ${className}` : `Aucun élève enregistré pour la classe ${className} (${secLabel}).`}</p>
            </div>
        `;
        return;
    }

    // Tri alphabétique strict et infaillible par nom (arabe et français)
    const sortedStudents = [...students].sort((a, b) => (a.name || '').localeCompare(b.name || '', 'fr', { sensitivity: 'base', numeric: true }));

    // Garder en mémoire les élèves de la classe pour un accès instantané dans openStudentDashboard
    window.currentLoadedStudentsMap = new Map();
    sortedStudents.forEach(s => {
        if (s && s.name) {
            window.currentLoadedStudentsMap.set(s.name.trim().toLowerCase(), s);
        }
    });

    const fallbackAvatar = getStudentFallbackAvatar(section);
    grid.innerHTML = sortedStudents.map(s => {
        const safeName = (s.name || '').trim();
        const photoSrc = (s.photo && s.photo.trim() !== '') ? s.photo : fallbackAvatar;
        const escapedName = escapeHtml(safeName).replace(/'/g, "\\'");
        return `
            <div class="student-card-item teacher-contact-card" onclick="openStudentDashboard('${escapedName}', '${className}')" style="background:white; border-radius:18px; padding:22px 18px; text-align:center; cursor:pointer; box-shadow:0 4px 18px rgba(0,0,0,0.06); border:2px solid #F1F5F9; transition:all 0.25s ease; display:flex; flex-direction:column; align-items:center; justify-content:center; width:100%; max-width:220px; will-change:transform;">
                <div style="position:relative; width:96px; height:96px; margin:0 auto 12px auto; overflow:hidden; border-radius:50%;">
                    <img src="${photoSrc}" loading="lazy" decoding="async" class="student-profile-avatar teacher-contact-photo" alt="${escapeHtml(safeName)}" onerror="this.onerror=null; this.src='${fallbackAvatar}';" style="width:96px; height:96px; border-radius:50%; object-fit:cover; border:3px solid ${borderColor}; background:#F8FAFC; display:block; margin:0 auto;">
                </div>
                <h4 style="margin:6px 0 4px 0; color:#1E1B4B; font-size:1.05rem; font-weight:700; line-height:1.3; text-align:center;">${escapeHtml(safeName)}</h4>
                <span style="font-size:0.85rem; font-weight:600; color:#6B7280; background:#F1F5F9; padding:3px 10px; border-radius:12px; margin-top:4px;">${s.birthday ? '🎂 ' + s.birthday : className}</span>
            </div>
        `;
    }).join('');
}

async function loadClassStudents(className, forceRefresh = false) {
    try {
        const section = currentSection || 'garcons';
        currentActiveClassName = className;
        const mySeq = ++activeClassFetchSeq;

        // Mettre à jour l'état actif des boutons de classe immédiatement
        const classBtns = document.querySelectorAll('#parent-class-buttons button');
        classBtns.forEach(btn => {
            const btnClassMatch = btn.getAttribute('onclick')?.match(/'([^']+)'/)?.[1];
            if (btnClassMatch === className) {
                btn.classList.add('primary-button', 'active');
            } else {
                btn.classList.remove('primary-button', 'active');
            }
        });

        const cacheKey = `${section}_${className}`;
        
        // Si les données sont déjà en mémoire et qu'on ne force pas, les afficher instantanément (0ms de latence),
        // tout en effectuant un appel réseau frais en arrière-plan pour refléter les dernières modifications
        let hasRenderedCache = false;
        if (!forceRefresh && studentsClientCache.has(cacheKey)) {
            renderStudentsGrid(studentsClientCache.get(cacheKey), className, section);
            hasRenderedCache = true;
        }

        const grid = document.getElementById('students-grid');
        if (grid && !hasRenderedCache) {
            grid.innerHTML = '<div style="grid-column: 1/-1; text-align:center; padding:40px; color:#64748B; font-size:1rem;"><i class="fas fa-circle-notch fa-spin fa-2x" style="color:#3B82F6; margin-bottom:10px; display:block;"></i> Chargement des élèves...</div>';
        }

        const res = await fetch(`/api/admin/students?class=${encodeURIComponent(className)}&section=${encodeURIComponent(section)}&_t=${Date.now()}`, {
            cache: 'no-store',
            headers: { 'Cache-Control': 'no-cache' }
        });

        if (res.ok) {
            const students = await res.json();
            // Ignorer si une autre classe a été sélectionnée entre temps
            if (mySeq !== activeClassFetchSeq || currentSection !== section || currentActiveClassName !== className) {
                return;
            }
            studentsClientCache.set(cacheKey, students);
            renderStudentsGrid(students, className, section);
        }
    } catch (e) {
        console.error('Erreur loadClassStudents:', e);
    }
}

async function loadHomeworkShowcase() {
    try {
        const section = currentSection || 'garcons';

        // Lancement en parallèle non bloquant avec Promise.allSettled
        Promise.allSettled([
            fetch(`/api/student-of-the-week?section=${section}`).then(r => r.ok ? r.json() : null),
            fetch(`/api/weekly-summary?section=${section}`).then(r => r.ok ? r.json() : null),
            fetch(`/api/photo-of-the-day?section=${section}`).then(r => r.ok ? r.json() : null),
            fetch(`/api/photo-2?section=${section}`).then(r => r.ok ? r.json() : null),
            fetch(`/api/photo-3?section=${section}`).then(r => r.ok ? r.json() : null)
        ]).then(([sotwDirectRes, summaryRes, p1Res, p2Res, p3Res]) => {
            // Élève de la semaine avec photo, étoiles, mots de félicitations et animation festive
            const sotwEl = document.getElementById('sotw-content');
            if (sotwEl) {
                let st = null;
                if (sotwDirectRes.status === 'fulfilled' && sotwDirectRes.value && sotwDirectRes.value.name) {
                    st = sotwDirectRes.value;
                } else if (summaryRes.status === 'fulfilled' && summaryRes.value && summaryRes.value.studentsOfWeek && summaryRes.value.studentsOfWeek.length > 0) {
                    st = summaryRes.value.studentsOfWeek[0];
                }

                if (st && st.name) {
                    const starsCount = Math.max(1, Math.min(5, Number(st.stars) || 5));
                    let starsHtml = '';
                    for (let i = 0; i < starsCount; i++) {
                        starsHtml += '<i class="fas fa-star"></i> ';
                    }
                    // Récupérer la photo de l'élève : exactement la même que dans son profil devoirs
                    let rawPhoto = st.photoUrl || '';
                    if (!rawPhoto && window.currentLoadedStudentsMap) {
                        const norm = (st.name || '').trim().toLowerCase();
                        const stObj = window.currentLoadedStudentsMap.get(norm);
                        if (stObj && stObj.photo) {
                            rawPhoto = stObj.photo;
                        }
                    }
                    const photoSrc = rawPhoto ? (typeof formatDriveImageUrl === 'function' ? formatDriveImageUrl(rawPhoto) : rawPhoto) : getStudentFallbackAvatar(section);
                    const congratsFr = st.congratulations || "Toutes nos chaleureuses félicitations pour son excellence académique, sa régularité et son attitude exemplaire !";
                    const congratsAr = st.congratulationsAr || "ألف مبروك للطالب المتميز على تفوقه واجتهاده المستمر وأخلاقه العالية !";

                    sotwEl.innerHTML = `
                        <div class="sotw-card-wrapper">
                            <div class="sotw-photo-frame">
                                <img src="${escapeHtml(photoSrc)}" alt="${escapeHtml(st.name)}" class="sotw-photo-img" onerror="this.src='${getStudentFallbackAvatar(section)}'" />
                                <div class="sotw-crown-badge" title="Étoile d'Excellence">
                                    <i class="fas fa-crown"></i>
                                </div>
                            </div>
                            <div class="sotw-details">
                                <div class="sotw-tag-pill">
                                    <i class="fas fa-award"></i> <span>Élève de la Semaine • نجم الأسبوع</span>
                                </div>
                                <h3 class="sotw-student-name">${escapeHtml(st.name)}</h3>
                                <div class="sotw-meta-row">
                                    <span class="sotw-class-badge"><i class="fas fa-graduation-cap"></i> ${escapeHtml(st.class || '')}</span>
                                    <div class="sotw-stars" title="${starsCount} étoiles d'or">${starsHtml}</div>
                                </div>
                                <div class="sotw-congrats-box">
                                    <p class="sotw-congrats-fr">
                                        <i class="fas fa-quote-left" style="color:#F59E0B; margin-right:6px; opacity:0.8;"></i>
                                        ${escapeHtml(congratsFr)}
                                    </p>
                                    <p class="sotw-congrats-ar" dir="rtl">
                                        ${escapeHtml(congratsAr)}
                                        <i class="fas fa-quote-right" style="color:#F59E0B; margin-right:6px; opacity:0.8;"></i>
                                    </p>
                                </div>
                            </div>
                        </div>
                    `;

                    // Synchroniser les champs d'administration dans l'onglet Admin (Tab 4)
                    const syncInputs = [
                        ['adminSotwName', st.name || ''],
                        ['adminSotwClass', st.class || ''],
                        ['adminSotwStars', String(starsCount)],
                        ['adminSotwPhotoUrl', rawPhoto || ''],
                        ['adminSotwCongratsFr', st.congratulations || ''],
                        ['adminSotwCongratsAr', st.congratulationsAr || '']
                    ];
                    syncInputs.forEach(([aId, val]) => {
                        const aEl = document.getElementById(aId);
                        if (aEl && !aEl.value) aEl.value = val;
                    });
                } else {
                    sotwEl.innerHTML = `
                        <div style="padding:25px; text-align:center; color:#6B7280;">
                            <i class="fas fa-crown" style="font-size:2.2rem; color:#FCD34D; margin-bottom:10px; display:block;"></i>
                            <h4 style="margin:0 0 6px 0; color:#374151; font-size:1.15rem;">Élève de la Semaine</h4>
                            <p style="margin:0; font-size:0.92rem;">Aucun élève de la semaine sélectionné pour le moment.</p>
                        </div>
                    `;
                }
            }

            // Photos d'activités
            const el1 = document.getElementById('potd-content');
            if (el1 && p1Res.status === 'fulfilled' && p1Res.value) {
                const p1 = p1Res.value;
                el1.innerHTML = p1.url ? `<img src="${formatDriveImageUrl(p1.url)}" loading="lazy" class="potd-image"><p style="font-size:0.9em; font-weight:600; color:#374151;">${escapeHtml(p1.comment || '')}</p>` : '<p style="color:#9CA3AF;">Pas de photo enregistrée.</p>';
            }

            const el2 = document.getElementById('photo2-content');
            if (el2 && p2Res.status === 'fulfilled' && p2Res.value) {
                const p2 = p2Res.value;
                el2.innerHTML = p2.url ? `<img src="${formatDriveImageUrl(p2.url)}" loading="lazy" class="potd-image"><p style="font-size:0.9em; font-weight:600; color:#374151;">${escapeHtml(p2.comment || '')}</p>` : '<p style="color:#9CA3AF;">Pas de photo enregistrée.</p>';
            }

            const el3 = document.getElementById('photo3-content');
            if (el3 && p3Res.status === 'fulfilled' && p3Res.value) {
                const p3 = p3Res.value;
                el3.innerHTML = p3.url ? `<img src="${formatDriveImageUrl(p3.url)}" loading="lazy" class="potd-image"><p style="font-size:0.9em; font-weight:600; color:#374151;">${escapeHtml(p3.comment || '')}</p>` : '<p style="color:#9CA3AF;">Pas de photo enregistrée.</p>';
            }
        });
    } catch (e) {
        console.error('Erreur loadHomeworkShowcase:', e);
    }
}

// ---------------- GESTION ÉLÈVE DE LA SEMAINE (ADMIN & MODAL) ----------------
function openStudentOfWeekAdminModal() {
    const modal = document.getElementById('studentOfWeekAdminModal');
    if (modal) {
        modal.style.display = 'flex';
        previewModalSotwPhoto();
    }
}
window.openStudentOfWeekAdminModal = openStudentOfWeekAdminModal;

function closeStudentOfWeekAdminModal() {
    const modal = document.getElementById('studentOfWeekAdminModal');
    if (modal) modal.style.display = 'none';
}
window.closeStudentOfWeekAdminModal = closeStudentOfWeekAdminModal;

function previewModalSotwPhoto() {
    const input = document.getElementById('modalSotwPhotoUrl');
    const container = document.getElementById('modalSotwPhotoPreviewContainer');
    const img = document.getElementById('modalSotwPhotoPreviewImg');
    if (!input || !container || !img) return;
    const url = input.value.trim();
    if (url) {
        const formatted = formatDriveImageUrl(url);
        img.src = formatted;
        container.style.display = 'flex';
    } else {
        container.style.display = 'none';
        img.src = '';
    }
}
window.previewModalSotwPhoto = previewModalSotwPhoto;

async function saveStudentOfWeekFromModal() {
    const name = document.getElementById('modalSotwName')?.value?.trim();
    const cls = document.getElementById('modalSotwClass')?.value?.trim();
    const stars = Number(document.getElementById('modalSotwStars')?.value) || 5;
    const photoUrl = document.getElementById('modalSotwPhotoUrl')?.value?.trim() || '';
    const congratsFr = document.getElementById('modalSotwCongratsFr')?.value?.trim() || '';
    const congratsAr = document.getElementById('modalSotwCongratsAr')?.value?.trim() || '';
    const status = document.getElementById('modalSotwStatus');

    if (!name) {
        if (status) status.innerHTML = '<span style="color:#DC2626;">Veuillez entrer le nom de l\'élève</span>';
        return;
    }

    if (status) status.innerHTML = '<span style="color:#2563EB;"><i class="fas fa-spinner fa-spin"></i> Enregistrement...</span>';

    try {
        const section = currentSection || 'garcons';
        const res = await fetch('/api/student-of-the-week', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name,
                class: cls,
                stars,
                photoUrl,
                congratulations: congratsFr,
                congratulationsAr: congratsAr,
                section
            })
        });

        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.message || `Erreur ${res.status}`);
        }

        if (status) status.innerHTML = '<span style="color:#059669;">✅ Enregistré avec succès !</span>';
        setTimeout(() => {
            closeStudentOfWeekAdminModal();
            if (status) status.innerHTML = '';
        }, 1000);

        loadHomeworkShowcase();
        displayAlert('Élève de la semaine mis à jour avec succès !', false);
    } catch (e) {
        console.error('Erreur saveStudentOfWeekFromModal:', e);
        if (status) status.innerHTML = `<span style="color:#DC2626;">Erreur: ${e.message}</span>`;
    }
}
window.saveStudentOfWeekFromModal = saveStudentOfWeekFromModal;

async function adminSaveStudentOfTheWeek() {
    const name = document.getElementById('adminSotwName')?.value?.trim();
    const cls = document.getElementById('adminSotwClass')?.value?.trim();
    const stars = Number(document.getElementById('adminSotwStars')?.value) || 5;
    const photoUrl = document.getElementById('adminSotwPhotoUrl')?.value?.trim() || '';
    const congratsFr = document.getElementById('adminSotwCongratsFr')?.value?.trim() || '';
    const congratsAr = document.getElementById('adminSotwCongratsAr')?.value?.trim() || '';
    const status = document.getElementById('adminSotwStatus');

    if (!name) {
        displayAlert("Veuillez saisir le nom de l'élève.", true);
        return;
    }

    if (status) status.innerHTML = '<span style="color:#2563EB;"><i class="fas fa-spinner fa-spin"></i> Enregistrement...</span>';

    try {
        const section = currentSection || 'garcons';
        const res = await fetch('/api/student-of-the-week', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name,
                class: cls,
                stars,
                photoUrl,
                congratulations: congratsFr,
                congratulationsAr: congratsAr,
                section
            })
        });

        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.message || `Erreur ${res.status}`);
        }

        if (status) status.innerHTML = '<span style="color:#059669;">✅ Élève de la semaine enregistré avec succès !</span>';
        displayAlert('Élève de la semaine configuré avec succès !', false);
        loadHomeworkShowcase();
    } catch (e) {
        console.error('Erreur adminSaveStudentOfTheWeek:', e);
        if (status) status.innerHTML = `<span style="color:#DC2626;">Erreur: ${e.message}</span>`;
        displayAlert('Erreur lors de l\'enregistrement: ' + e.message, true);
    }
}
window.adminSaveStudentOfTheWeek = adminSaveStudentOfTheWeek;

/**
 * Auto-complétion de la classe et de la photo de profil de l'élève choisi (Admin Tab 4)
 * Utilise la même photo que celle affichée dans son profil devoirs
 */
async function onAdminSotwNameChange() {
    const nameInput = document.getElementById('adminSotwName');
    const classInput = document.getElementById('adminSotwClass');
    const photoInput = document.getElementById('adminSotwPhotoUrl');
    if (!nameInput || !nameInput.value.trim()) return;

    const targetName = nameInput.value.trim().toLowerCase();
    const section = currentSection || 'garcons';

    // 1. Chercher d'abord dans les élèves déjà chargés en mémoire
    if (window.currentLoadedStudentsMap) {
        for (const [k, v] of window.currentLoadedStudentsMap.entries()) {
            if (k === targetName || k.includes(targetName) || targetName.includes(k)) {
                if (classInput && !classInput.value && v.class) classInput.value = v.class;
                if (photoInput && v.photo) photoInput.value = v.photo;
                return;
            }
        }
    }

    // 2. Sinon, interroger l'API pour récupérer sa classe et sa photo de profil devoirs
    try {
        const res = await fetch(`/api/admin/students?section=${encodeURIComponent(section)}&_t=${Date.now()}`);
        if (res.ok) {
            const list = await res.json();
            const matched = list.find(s => {
                const sName = (s.name || '').trim().toLowerCase();
                return sName === targetName || sName.includes(targetName) || targetName.includes(sName);
            });
            if (matched) {
                if (classInput && !classInput.value && matched.class) classInput.value = matched.class;
                if (photoInput && matched.photo) photoInput.value = matched.photo;
            }
        }
    } catch (e) {
        console.warn('Erreur onAdminSotwNameChange:', e);
    }
}
window.onAdminSotwNameChange = onAdminSotwNameChange;

// ---------------- AFFICHAGE & IMPRESSION DU PLAN HEBDOMADAIRE POUR LES PARENTS ----------------
async function printParentWeeklyPlan() {
    const weekSel = document.getElementById('parentWeekSelector');
    const classSel = document.getElementById('parentClassSelector');
    const weekNum = (weekSel && weekSel.value) ? weekSel.value : currentWeek;
    const className = (classSel && classSel.value) ? classSel.value : '';
    if (!className) {
        displayAlert("Veuillez sélectionner une classe pour afficher et imprimer son plan hebdomadaire.", true);
        return;
    }
    const section = currentSection || 'garcons';
    // isParent = true pour n'afficher que le bouton d'impression sans sélecteur de couleurs ni bouton Enregistrer HTML
    await downloadFullClassDesign(weekNum, className, 'indigo', true, true, 'print', true);
}
window.printParentWeeklyPlan = printParentWeeklyPlan;

async function downloadParentWeeklyPlan() {
    const weekSel = document.getElementById('parentWeekSelector');
    const classSel = document.getElementById('parentClassSelector');
    const weekNum = (weekSel && weekSel.value) ? weekSel.value : currentWeek;
    const className = (classSel && classSel.value) ? classSel.value : '';
    if (!className) {
        displayAlert("Veuillez sélectionner une classe pour télécharger son plan hebdomadaire.", true);
        return;
    }
    const section = currentSection || 'garcons';
    await downloadFullClassDesign(weekNum, className, 'indigo', true, true, 'download');
}
window.downloadParentWeeklyPlan = downloadParentWeeklyPlan;

async function openStudentDashboard(studentName, className) {
    try {
        const cleanName = (typeof studentName === 'string' && studentName.includes('%')) ? decodeURIComponent(studentName).trim() : (studentName || '').trim();
        selectedStudentObj = { name: cleanName, class: className };
        showHomeworkView('student-dashboard');

        const section = currentSection || 'garcons';
        const fallbackAvatar = getStudentFallbackAvatar(section);
        const nameEl = document.getElementById('student-profile-name');
        const detailsEl = document.getElementById('student-profile-details');
        const photoEl = document.getElementById('student-profile-photo');

        if (nameEl) nameEl.innerText = cleanName;
        if (detailsEl) detailsEl.innerText = `Classe : ${className} | Section : ${section === 'garcons' ? 'Garçons 👦' : (section === 'primaire' ? 'Primaire & Maternelle 👶🎒' : 'Filles 👧')}`;
        
        // Initialisation de la photo : utiliser en priorité l'objet préchargé en mémoire
        const normKey = cleanName.toLowerCase();
        let preloadedStudent = window.currentLoadedStudentsMap?.get(normKey);
        if (!preloadedStudent && window.currentLoadedStudentsMap) {
            for (const [k, v] of window.currentLoadedStudentsMap.entries()) {
                if (k === normKey || k.includes(normKey) || normKey.includes(k)) {
                    preloadedStudent = v;
                    break;
                }
            }
        }

        const initialPhoto = (preloadedStudent && preloadedStudent.photo && preloadedStudent.photo.trim() !== '') ? preloadedStudent.photo : fallbackAvatar;
        if (photoEl) {
            photoEl.src = initialPhoto;
            photoEl.onerror = function() { this.src = fallbackAvatar; };
        }

        // Si pas de photo préchargée valide, tenter la récupération réseau fraîche
        if (!preloadedStudent || !preloadedStudent.photo) {
            fetch(`/api/admin/students?class=${encodeURIComponent(className)}&section=${encodeURIComponent(section)}&_t=${Date.now()}`, { cache: 'no-store' })
                .then(r => r.ok ? r.json() : [])
                .then(stList => {
                    const matched = stList.find(s => (s.name || '').trim().toLowerCase() === normKey);
                    if (matched && matched.photo && matched.photo.trim() !== '' && photoEl) {
                        photoEl.src = matched.photo;
                    }
                })
                .catch(() => {});
        }

        // Récupérer étoiles
        const starRes = await fetch(`/api/daily-stars?studentName=${encodeURIComponent(cleanName)}&className=${encodeURIComponent(className)}&section=${encodeURIComponent(section)}&week=true&_t=${Date.now()}`);
        let starCount = 0;
        if (starRes.ok) {
            const sData = await starRes.json();
            if (sData.stars && Array.isArray(sData.stars)) {
                starCount = sData.stars.reduce((acc, curr) => acc + (curr.earnedStar || 0), 0);
            }
        }
        const starsCountEl = document.getElementById('student-stars-count');
        if (starsCountEl) starsCountEl.innerHTML = `<i class="fas fa-star"></i> ${starCount} Étoile(s)`;

        // Évaluations 8 semaines
        loadGeneralEvaluations(cleanName, className);

        // Devoirs du jour (Date du jour par défaut, ou Jeudi si vendredi/samedi)
        currentHomeworkDate = (typeof getInitialHomeworkDate === 'function') ? getInitialHomeworkDate() : new Date().toISOString().split('T')[0];
        loadStudentHomeworksForDate(cleanName, className, currentHomeworkDate);
    } catch (e) {
        console.error('Erreur openStudentDashboard:', e);
    }
}

let lastEvaluationsData = null;
let isShowingWeeklyHomeworks = false;

function formatFrenchDate(dateStr) {
    if (!dateStr) return '';
    try {
        const parts = dateStr.split('-');
        if (parts.length === 3) {
            const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
            const daysFr = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
            const monthsFr = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
            const daysAr = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
            const monthsAr = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
            
            const isAr = (currentUserLanguage === 'ar' || homeworkLang === 'ar');
            const dayName = isAr ? daysAr[d.getDay()] : daysFr[d.getDay()];
            const monthName = isAr ? monthsAr[d.getMonth()] : monthsFr[d.getMonth()];
            return `${dayName} ${d.getDate()} ${monthName} ${d.getFullYear()}`;
        }
    } catch (e) {}
    return dateStr;
}

function isDateWeekend(dateStr) {
    if (!dateStr) return false;
    const parts = dateStr.split('-');
    if (parts.length === 3) {
        const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
        const day = d.getDay();
        return day === 5 || day === 6; // Vendredi ou Samedi
    }
    return false;
}

function renderSchoolDaysBar(schoolDays, activeDateStr, studentName, className) {
    const bar = document.getElementById('student-school-days-bar');
    if (!bar) return;

    if (!schoolDays || schoolDays.length === 0) {
        bar.style.display = 'none';
        return;
    }

    bar.style.display = 'flex';
    const isAr = (currentUserLanguage === 'ar' || homeworkLang === 'ar');
    const daysMapAr = {
        'Dimanche': 'الأحد',
        'Lundi': 'الإثنين',
        'Mardi': 'الثلاثاء',
        'Mercredi': 'الأربعاء',
        'Jeudi': 'الخميس'
    };

    bar.innerHTML = schoolDays.map(sd => {
        const isActive = (sd.date === activeDateStr);
        const dayLabel = isAr ? (daysMapAr[sd.day] || sd.day) : sd.day;
        const count = sd.count || 0;
        const countLabel = isAr ? `${count} واجب` : `${count} devoir${count > 1 ? 's' : ''}`;
        
        let dateShort = '';
        if (sd.date) {
            const parts = sd.date.split('-');
            if (parts.length === 3) dateShort = `${parts[2]}/${parts[1]}`;
        }

        return `
            <button type="button" 
                onclick="loadStudentHomeworksForDate('${encodeURIComponent(studentName).replace(/'/g, "\\'")}', '${className}', '${sd.date}', true)"
                style="flex:1; min-width:110px; padding:10px 12px; border-radius:12px; border:2px solid ${isActive ? '#3B82F6' : '#E2E8F0'}; background:${isActive ? '#EFF6FF' : '#FFFFFF'}; color:${isActive ? '#1D4ED8' : '#334155'}; cursor:pointer; display:flex; flex-direction:column; align-items:center; gap:4px; transition:all 0.2s ease; box-shadow:${isActive ? '0 4px 12px rgba(59,130,246,0.2)' : 'none'};">
                <span style="font-weight:700; font-size:0.95rem;">${dayLabel}</span>
                <span style="font-size:0.8rem; color:${isActive ? '#2563EB' : '#64748B'}; font-weight:600;">${dateShort}</span>
                <span style="font-size:0.75rem; padding:2px 8px; border-radius:10px; background:${isActive ? '#DBEAFE' : (count > 0 ? '#FEF3C7' : '#F1F5F9')}; color:${isActive ? '#1E40AF' : (count > 0 ? '#92400E' : '#94A3B8')}; font-weight:700;">
                    ${countLabel}
                </span>
            </button>
        `;
    }).join('');
}

async function loadStudentHomeworksForDate(studentName, className, dateStr, isDirectDayClick = false) {
    try {
        if (isDirectDayClick) {
            isShowingWeeklyHomeworks = false;
        }

        // Si le nom est encodé par l'attribut HTML onclick
        try {
            if (studentName.includes('%')) studentName = decodeURIComponent(studentName);
        } catch (e) {}

        currentHomeworkDate = dateStr;
        const section = currentSection || 'garcons';
        
        // Affichage de la date actuelle
        const dateDisplayEl = document.getElementById('current-homework-date-display');
        const formattedDate = formatFrenchDate(dateStr);
        const todayStr = new Date().toISOString().split('T')[0];
        const isToday = (dateStr === todayStr);
        const todayTag = isToday ? (currentUserLanguage === 'ar' ? ' (اليوم)' : ' (Aujourd\'hui)') : '';
        
        if (dateDisplayEl) {
            dateDisplayEl.innerHTML = `<i class="fas fa-calendar-day" style="margin-right:6px;"></i> ${formattedDate}${todayTag}`;
        }

        // Alerte week-end
        const weekendNoticeEl = document.getElementById('student-weekend-notice');
        if (weekendNoticeEl) {
            if (isDateWeekend(dateStr)) {
                weekendNoticeEl.style.display = 'block';
                weekendNoticeEl.innerHTML = `
                    <div style="background:#FEF3C7; border:1px solid #FCD34D; border-radius:12px; padding:12px 18px; color:#92400E; font-size:0.9rem; display:flex; align-items:center; gap:10px; margin-bottom:15px;">
                        <i class="fas fa-umbrella-beach" style="font-size:1.3rem; color:#D97706;"></i>
                        <span>${currentUserLanguage === 'ar' ? 'اليوم عطلة نهاية الأسبوع (لا توجد دروس). يمكنك الاطلاع على واجبات أيام الأسبوع من خلال الأزرار أعلاه أو النقر على "عرض جميع واجبات الأسبوع".' : 'Aujourd\'hui c\'est le week-end (pas de cours). Vous pouvez consulter les devoirs des 5 jours d\'école ci-dessus ou afficher tous les devoirs de la semaine.'}</span>
                    </div>
                `;
            } else {
                weekendNoticeEl.style.display = 'none';
            }
        }

        const grid = document.getElementById('homework-items-grid');
        if (grid) grid.innerHTML = '<div style="grid-column: 1/-1; text-align:center; padding:30px; color:#6B7280;"><i class="fas fa-spinner fa-spin fa-2x" style="color:#3B82F6; margin-bottom:10px;"></i><p>Chargement des devoirs en direct du plan hebdomadaire...</p></div>';

        const res = await fetch(`/api/evaluations?class=${className}&student=${encodeURIComponent(studentName)}&date=${dateStr}&section=${section}`);
        if (res.ok) {
            const data = await res.json();
            lastEvaluationsData = data;
            const { homeworks = [], weeklyHomeworks = [], schoolDays = [], evaluations = [], targetWeek } = data;

            // Rendre la barre des 5 jours d'école
            renderSchoolDaysBar(schoolDays, dateStr, studentName, className);

            // Mettre à jour le bouton de bascule semaine
            const toggleWeekBtnText = document.getElementById('btnToggleWeeklyHomeworksText');
            if (toggleWeekBtnText) {
                if (isShowingWeeklyHomeworks) {
                    toggleWeekBtnText.textContent = (currentUserLanguage === 'ar' || homeworkLang === 'ar') ? 'عرض واجبات اليوم المحدد' : 'Voir les devoirs de la date sélectionnée';
                } else {
                    const count = weeklyHomeworks.length;
                    toggleWeekBtnText.textContent = (currentUserLanguage === 'ar' || homeworkLang === 'ar') ? `عرض جميع واجبات الأسبوع (${count})` : `Voir tous les devoirs de la semaine (${count})`;
                }
            }

            // Choisir la liste à afficher
            const displayList = isShowingWeeklyHomeworks ? weeklyHomeworks : homeworks;

            if (displayList.length === 0) {
                const isAr = (currentUserLanguage === 'ar' || homeworkLang === 'ar');
                grid.innerHTML = `
                    <div style="grid-column: 1/-1; background:white; padding:35px 25px; border-radius:16px; text-align:center; color:#6B7280; box-shadow:0 4px 15px rgba(0,0,0,0.04); border:1px solid #E2E8F0;">
                        <div style="width:60px; height:60px; background:#ECFDF5; border-radius:50%; display:flex; align-items:center; justify-content:center; margin:0 auto 14px auto;">
                            <i class="fas fa-clipboard-check" style="font-size:2rem; color:#10B981;"></i>
                        </div>
                        <h4 style="color:#1E293B; font-size:1.15rem; margin:0 0 8px 0; font-weight:700;">
                            ${isAr ? 'لا توجد واجبات مسجلة لهذا اليوم' : 'Aucun devoir renseigné pour cette date'}
                        </h4>
                        <p style="margin:0 0 16px 0; font-size:0.92rem; color:#64748B;">
                            ${isAr ? 'لم يقم المدرسون بإضافة واجبات محددة لهذا اليوم. يمكنك مراجعة الخطة الأسبوعية الكاملة للفصل.' : 'Les enseignants n\'ont pas programmé de devoirs spécifiques pour cette date. Vous pouvez consulter le plan hebdomadaire complet de la classe.'}
                        </p>
                        <div style="display:flex; justify-content:center; gap:12px; flex-wrap:wrap;">
                            <button type="button" class="pro-button" onclick="toggleWeeklyHomeworksView()" style="padding:10px 18px; font-weight:700; background:#EFF6FF; color:#1D4ED8; border:1px solid #BFDBFE;">
                                <i class="fas fa-calendar-week"></i> <span>${isAr ? 'عرض واجبات الأسبوع بالكامل' : 'Voir les devoirs de toute la semaine'}</span>
                            </button>
                            <button type="button" class="pro-button primary-button" onclick="goToCurrentStudentClassPlan()" style="padding:10px 18px; font-weight:700;">
                                <i class="fas fa-book-open"></i> <span>${isAr ? 'الخطة الأسبوعية للفصل' : 'Consulter le Plan Hebdo'}</span>
                            </button>
                        </div>
                    </div>
                `;
                return;
            }

            grid.innerHTML = displayList.map((hw, idx) => {
                const ev = evaluations.find(e => e.subject === hw.subject) || {};
                const status = ev.status || 'Non Fait';
                const statusClass = status.toLowerCase().replace(/\s+/g, '-');
                const pVal = ev.participation || 0;
                const bVal = ev.behavior || 0;
                const comment = ev.comment || '';

                const dayBadge = hw.day ? `<span style="background:#EEF2FF; color:#4338CA; padding:3px 8px; border-radius:6px; font-size:0.75rem; font-weight:700; margin-left:6px;"><i class="fas fa-calendar-day"></i> ${hw.day}</span>` : '';
                const periodBadge = hw.period ? `<span style="background:#F1F5F9; color:#475569; padding:3px 8px; border-radius:6px; font-size:0.75rem; font-weight:600;"><i class="fas fa-clock"></i> P${hw.period}</span>` : '';
                const teacherBadge = hw.teacher ? `<span style="font-size:0.8rem; color:#64748B; display:flex; align-items:center; gap:4px;"><i class="fas fa-chalkboard-teacher"></i> ${hw.teacher}</span>` : '';

                return `
                    <div style="background:white; border-radius:16px; padding:20px; box-shadow:0 4px 15px rgba(0,0,0,0.05); border:1px solid #E2E8F0; position:relative; display:flex; flex-direction:column; justify-content:space-between;">
                        <div>
                            <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:10px; gap:8px;">
                                <div>
                                    <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
                                        <span style="font-weight:800; color:#1E40AF; font-size:1.1rem;"><i class="fas fa-book"></i> ${hw.subject}</span>
                                        ${dayBadge}
                                        ${periodBadge}
                                    </div>
                                    ${teacherBadge}
                                </div>
                                <div class="status-container">
                                    <span class="status-text ${statusClass}">${status}</span>
                                    <div class="status-lamp ${statusClass}"></div>
                                </div>
                            </div>

                            ${hw.lesson ? `
                                <div style="font-size:0.85rem; color:#475569; margin-bottom:8px; background:#F8FAFC; padding:6px 10px; border-radius:6px; border:1px dashed #CBD5E1;">
                                    <strong><i class="fas fa-graduation-cap"></i> Leçon :</strong> ${escapeHtml(hw.lesson)}
                                </div>
                            ` : ''}

                            <div style="margin:10px 0; font-size:0.95rem; color:#1F2937; background:#EFF6FF; padding:12px 14px; border-radius:10px; border-left:4px solid #3B82F6;">
                                <div style="font-weight:700; color:#1D4ED8; margin-bottom:4px; display:flex; align-items:center; gap:6px;">
                                    <i class="fas fa-pencil-alt"></i> Devoir à faire :
                                </div>
                                <div style="white-space:pre-wrap; line-height:1.5;">${escapeHtml(hw.assignment || 'Aucun devoir')}</div>
                            </div>

                            <div style="display:flex; gap:15px; font-size:0.85em; color:#4B5563; margin-top:8px; padding-top:8px; border-top:1px solid #F1F5F9;">
                                <span><i class="fas fa-hands"></i> Participation: <strong>${pVal}/10</strong></span>
                                <span><i class="fas fa-user-check"></i> Comportement: <strong>${bVal}/10</strong></span>
                            </div>

                            ${comment ? `
                                <div style="font-size:0.85em; color:#374151; background:#FFFBEB; padding:8px 10px; border-radius:6px; margin-top:8px; border-left:3px solid #F59E0B;" id="comm-box-${idx}">
                                    <strong>Remarque Enseignant :</strong> <span id="comm-text-${idx}">${escapeHtml(comment)}</span>
                                    <button type="button" onclick="translateHomeworkComment('comm-text-${idx}', '${comment.replace(/'/g, "\\'")}')" style="margin-left:8px; background:none; border:none; color:#0066CC; cursor:pointer; font-weight:bold;">
                                        🌐 Traduire
                                    </button>
                                </div>
                            ` : ''}
                        </div>

                        <div style="margin-top:14px; padding-top:10px; border-top:1px solid #F1F5F9; display:flex; justify-content:flex-end;">
                            <button type="button" onclick="goToCurrentStudentClassPlan('${hw.day || ''}')" style="background:none; border:none; color:#3B82F6; font-size:0.82rem; font-weight:700; cursor:pointer; display:flex; align-items:center; gap:4px;">
                                <span>Voir dans le Plan Hebdo</span> <i class="fas fa-arrow-right"></i>
                            </button>
                        </div>
                    </div>
                `;
            }).join('');
        }
    } catch (e) {
        console.error('Erreur loadStudentHomeworksForDate:', e);
    }
}

function toggleWeeklyHomeworksView() {
    isShowingWeeklyHomeworks = !isShowingWeeklyHomeworks;
    if (selectedStudentObj) {
        loadStudentHomeworksForDate(selectedStudentObj.name, selectedStudentObj.class, currentHomeworkDate);
    }
}

function goToCurrentStudentClassPlan(targetDay) {
    if (!selectedStudentObj) return;
    showHomeworkView('parent-plan');
    const classSelect = document.getElementById('parentClassSelector');
    if (classSelect) {
        classSelect.value = selectedStudentObj.class;
    }
    if (targetDay && schoolDaysList.includes(targetDay)) {
        parentActiveDay = targetDay;
    }
    loadParentWeeklyPlan();
}

async function translateHomeworkComment(elementId, originalText) {
    try {
        const el = document.getElementById(elementId);
        if (!el) return;
        const targetLang = (homeworkLang === 'fr') ? 'ar' : 'fr';
        const res = await fetch('/api/translate-text', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: originalText, targetLang })
        });
        if (res.ok) {
            const data = await res.json();
            el.innerText = data.translatedText || originalText;
        }
    } catch (e) {
        console.error('Erreur translation:', e);
    }
}

function changeHomeworkDate(offsetDays) {
    if (!selectedStudentObj) return;
    const curr = new Date(currentHomeworkDate);
    curr.setDate(curr.getDate() + offsetDays);
    const newDateStr = curr.toISOString().split('T')[0];
    loadStudentHomeworksForDate(selectedStudentObj.name, selectedStudentObj.class, newDateStr);
}

async function loadGeneralEvaluations(studentName, className) {
    try {
        const section = currentSection || 'garcons';
        const container = document.getElementById('general-evaluations-container');
        if (!container) return;

        const res = await fetch(`/api/general-evaluations?section=${section}`);
        if (res.ok) {
            const data = await res.json();
            const norm = (s) => String(s || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
            const targetStudentNorm = norm(studentName);
            const targetClassNorm = norm(className);

            const studentData = data.find(d => {
                const sNorm = norm(d.student);
                const cNorm = norm(d.classe);
                return (sNorm === targetStudentNorm || sNorm.includes(targetStudentNorm) || targetStudentNorm.includes(sNorm)) &&
                       (cNorm === targetClassNorm || cNorm.includes(targetClassNorm) || targetClassNorm.includes(cNorm));
            }) || data.find(d => norm(d.student) === targetStudentNorm);

            if (!studentData) {
                container.innerHTML = `
                    <div class="student-progress-card" style="padding:16px 20px; text-align:center; background:#F8FAFC; border:1px dashed #CBD5E1; border-radius:14px; margin-bottom:20px;">
                        <p style="margin:0; color:#64748B; font-size:0.92rem;">
                            <i class="fas fa-info-circle"></i> ${currentUserLanguage === 'ar' ? 'لم يتم تسجيل تقييمات عامة بعد لهذا التلميذ.' : 'Aucune évaluation générale enregistrée pour le moment pour cet élève.'}
                        </p>
                    </div>
                `;
                const badgeEl = document.getElementById('student-progress-badge');
                if (badgeEl) badgeEl.innerHTML = '';
                return;
            }

            const overall = Math.min(100, Math.max(0, Math.round(studentData.overallProgress ?? 100)));
            const hwRate = Math.min(100, Math.max(0, Math.round(studentData.homeworkRate ?? 100)));
            const partRate = Math.min(100, Math.max(0, Math.round(studentData.participationRate ?? 100)));
            const behRate = Math.min(100, Math.max(0, Math.round(studentData.behaviorRate ?? 100)));

            const avgP = studentData.avgParticipation != null ? studentData.avgParticipation : (studentData.participationBehaviorScore ? (studentData.participationBehaviorScore / 2).toFixed(1) : '10.0');
            const avgB = studentData.avgBehavior != null ? studentData.avgBehavior : (studentData.participationBehaviorScore ? (studentData.participationBehaviorScore / 2).toFixed(1) : '10.0');
            const totalHw = studentData.totalHomeworks || (studentData.doneCount || 0) + (studentData.partialCount || 0) + (studentData.nonFaitCount || 0);
            const doneCount = studentData.doneCount || 0;
            const partialCount = studentData.partialCount || 0;

            // Palette et statut selon le niveau de progression
            let progressColor = '#10B981'; // Émeraude
            let progressBg = '#ECFDF5';
            let statusTextFr = 'Progression Excellente';
            let statusTextAr = 'تقدم ممتاز';
            let statusClass = 'status-fait';

            if (overall < 50) {
                progressColor = '#EF4444'; // Rouge
                progressBg = '#FEF2F2';
                statusTextFr = 'Nécessite un suivi';
                statusTextAr = 'يحتاج إلى متابعة';
                statusClass = 'status-non-fait';
            } else if (overall < 70) {
                progressColor = '#F59E0B'; // Orange
                progressBg = '#FFFBEB';
                statusTextFr = 'Progression Moyenne';
                statusTextAr = 'تقدم متوسط';
                statusClass = 'status-partiel';
            } else if (overall < 85) {
                progressColor = '#3B82F6'; // Bleu
                progressBg = '#EFF6FF';
                statusTextFr = 'Bonne Progression';
                statusTextAr = 'تقدم جيد جداً';
                statusClass = 'status-fait';
            }

            const currentStatusText = currentUserLanguage === 'ar' ? statusTextAr : statusTextFr;

            // Mise à jour du badge dans l'en-tête de l'élève
            const badgeEl = document.getElementById('student-progress-badge');
            if (badgeEl) {
                badgeEl.className = `status-text ${statusClass}`;
                badgeEl.style.display = 'inline-block';
                badgeEl.style.fontSize = '0.9rem';
                badgeEl.innerHTML = `<i class="fas fa-chart-line"></i> ${overall}% • ${currentStatusText}`;
            }

            // Génération du détail par matière
            const subjectScores = studentData.subjectScores || {};
            const subjectEntries = Object.entries(subjectScores);
            let subjectsHtml = '';

            if (subjectEntries.length > 0) {
                subjectsHtml = `
                    <div style="margin-top:16px; padding-top:16px; border-top:1px solid #E2E8F0;">
                        <button type="button" onclick="toggleSubjectProgressDetails()" style="background:none; border:none; color:#2563EB; font-weight:700; font-size:0.92rem; cursor:pointer; display:flex; align-items:center; gap:8px; padding:4px 0; margin-bottom:12px;">
                            <i id="subject-progress-toggle-icon" class="fas fa-chevron-down"></i>
                            <span>${currentUserLanguage === 'ar' ? `تفاصيل التقدم حسب كل مادة (${subjectEntries.length} مواد)` : `Détail de progression par matière (${subjectEntries.length} matières)`}</span>
                        </button>
                        <div id="subject-progress-list" style="display:grid; grid-template-columns:repeat(auto-fill, minmax(260px, 1fr)); gap:12px;">
                            ${subjectEntries.map(([subj, sInfo]) => {
                                const sProg = Math.min(100, Math.max(0, sInfo.overallProgress ?? 100));
                                const sColor = sProg >= 75 ? '#10B981' : (sProg >= 50 ? '#F59E0B' : '#EF4444');
                                return `
                                    <div style="background:white; border:1px solid #E2E8F0; border-radius:10px; padding:12px 14px; box-shadow:0 2px 6px rgba(0,0,0,0.03);">
                                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                                            <span style="font-weight:700; color:#1E293B; font-size:0.92rem;">${escapeHtml(subj)}</span>
                                            <span style="font-weight:800; color:${sColor}; font-size:0.92rem;">${sProg}%</span>
                                        </div>
                                        <div style="width:100%; height:6px; background:#F1F5F9; border-radius:4px; overflow:hidden; margin-bottom:8px;">
                                            <div style="width:${sProg}%; height:100%; background:${sColor}; border-radius:4px; transition:width 0.6s ease;"></div>
                                        </div>
                                        <div style="display:flex; justify-content:space-between; font-size:0.78rem; color:#64748B;">
                                            <span><i class="fas fa-pencil-alt"></i> Devoirs: <strong>${sInfo.homeworkRate ?? 100}%</strong></span>
                                            <span><i class="fas fa-hands"></i> Part: <strong>${sInfo.avgP ?? '10'}/10</strong></span>
                                            <span><i class="fas fa-user-check"></i> Comp: <strong>${sInfo.avgB ?? '10'}/10</strong></span>
                                        </div>
                                    </div>
                                `;
                            }).join('')}
                        </div>
                    </div>
                `;
            }

            container.innerHTML = `
                <div class="student-progress-card" style="background:white; border-radius:16px; padding:20px 24px; box-shadow:0 4px 20px rgba(0,0,0,0.05); border:1px solid #E2E8F0; margin-bottom:20px;">
                    <!-- En-tête de progression -->
                    <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; margin-bottom:14px;">
                        <div>
                            <div style="font-size:1.15rem; font-weight:800; color:#1E293B; display:flex; align-items:center; gap:8px;">
                                <i class="fas fa-chart-line" style="color:#2563EB;"></i>
                                <span>${currentUserLanguage === 'ar' ? 'مستوى تقدم التلميذ (إجمالي 100%)' : 'Niveau de Progression de l\'Élève (sur 100%)'}</span>
                            </div>
                            <div style="font-size:0.85rem; color:#64748B; margin-top:2px;">
                                ${currentUserLanguage === 'ar' ? 'محسوب بناءً على إنجاز الواجبات، المشاركة في القسم، والسلوك في جميع المواد' : 'Calculé selon la réalisation des devoirs, la participation et le comportement dans toutes les matières'}
                            </div>
                        </div>
                        <div style="display:flex; align-items:center; gap:10px;">
                            <span style="background:${progressBg}; color:${progressColor}; border:1px solid ${progressColor}40; padding:6px 14px; border-radius:20px; font-weight:800; font-size:0.95rem;">
                                ${currentStatusText}
                            </span>
                            <span style="font-size:1.6rem; font-weight:900; color:${progressColor}; letter-spacing:-0.5px;">
                                ${overall}%
                            </span>
                        </div>
                    </div>

                    <!-- Grande barre de progression principale -->
                    <div style="width:100%; height:14px; background:#F1F5F9; border-radius:10px; overflow:hidden; box-shadow:inset 0 1px 3px rgba(0,0,0,0.1); margin-bottom:18px;">
                        <div style="width:${overall}%; height:100%; background:linear-gradient(90deg, ${progressColor}, #3B82F6); border-radius:10px; transition:width 0.8s cubic-bezier(0.4, 0, 0.2, 1);"></div>
                    </div>

                    <!-- 3 Piliers Clairs -->
                    <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(190px, 1fr)); gap:14px;">
                        <!-- Pilier 1 : Faisabilité des Devoirs -->
                        <div style="background:#F8FAFC; border:1px solid #E2E8F0; border-radius:12px; padding:12px 16px;">
                            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                                <span style="font-size:0.85rem; font-weight:700; color:#334155; display:flex; align-items:center; gap:6px;">
                                    <i class="fas fa-pencil-alt" style="color:#2563EB;"></i>
                                    <span>${currentUserLanguage === 'ar' ? 'إنجاز الواجبات' : 'Faisabilité Devoirs'}</span>
                                </span>
                                <span style="font-weight:800; color:#2563EB; font-size:0.92rem;">${hwRate}%</span>
                            </div>
                            <div style="width:100%; height:6px; background:#E2E8F0; border-radius:4px; overflow:hidden; margin-bottom:6px;">
                                <div style="width:${hwRate}%; height:100%; background:#2563EB; border-radius:4px;"></div>
                            </div>
                            <div style="font-size:0.75rem; color:#64748B;">
                                ${currentUserLanguage === 'ar' ? `${doneCount} مكتمل • ${partialCount} جزئي من ${totalHw}` : `${doneCount} fait(s), ${partialCount} partiel(s) sur ${totalHw}`}
                            </div>
                        </div>

                        <!-- Pilier 2 : Participation en Classe -->
                        <div style="background:#F8FAFC; border:1px solid #E2E8F0; border-radius:12px; padding:12px 16px;">
                            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                                <span style="font-size:0.85rem; font-weight:700; color:#334155; display:flex; align-items:center; gap:6px;">
                                    <i class="fas fa-hands" style="color:#10B981;"></i>
                                    <span>${currentUserLanguage === 'ar' ? 'المشاركة بالقسم' : 'Participation'}</span>
                                </span>
                                <span style="font-weight:800; color:#10B981; font-size:0.92rem;">${avgP}/10</span>
                            </div>
                            <div style="width:100%; height:6px; background:#E2E8F0; border-radius:4px; overflow:hidden; margin-bottom:6px;">
                                <div style="width:${partRate}%; height:100%; background:#10B981; border-radius:4px;"></div>
                            </div>
                            <div style="font-size:0.75rem; color:#64748B;">
                                ${currentUserLanguage === 'ar' ? `معدل التفاعل: ${partRate}%` : `Taux de participation : ${partRate}%`}
                            </div>
                        </div>

                        <!-- Pilier 3 : Comportement & Discipline -->
                        <div style="background:#F8FAFC; border:1px solid #E2E8F0; border-radius:12px; padding:12px 16px;">
                            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                                <span style="font-size:0.85rem; font-weight:700; color:#334155; display:flex; align-items:center; gap:6px;">
                                    <i class="fas fa-user-check" style="color:#8B5CF6;"></i>
                                    <span>${currentUserLanguage === 'ar' ? 'السلوك والانضباط' : 'Comportement'}</span>
                                </span>
                                <span style="font-weight:800; color:#8B5CF6; font-size:0.92rem;">${avgB}/10</span>
                            </div>
                            <div style="width:100%; height:6px; background:#E2E8F0; border-radius:4px; overflow:hidden; margin-bottom:6px;">
                                <div style="width:${behRate}%; height:100%; background:#8B5CF6; border-radius:4px;"></div>
                            </div>
                            <div style="font-size:0.75rem; color:#64748B;">
                                ${currentUserLanguage === 'ar' ? `معدل الانضباط: ${behRate}%` : `Discipline & respect : ${behRate}%`}
                            </div>
                        </div>
                    </div>

                    <!-- Détail par matière -->
                    ${subjectsHtml}
                </div>
            `;
        }
    } catch (e) {
        console.error('Erreur loadGeneralEvaluations:', e);
    }
}

function toggleSubjectProgressDetails() {
    const list = document.getElementById('subject-progress-list');
    const icon = document.getElementById('subject-progress-toggle-icon');
    if (!list) return;
    if (list.style.display === 'none') {
        list.style.display = 'grid';
        if (icon) icon.className = 'fas fa-chevron-down';
    } else {
        list.style.display = 'none';
        if (icon) icon.className = 'fas fa-chevron-right';
    }
}

// ============================================================================
// GESTION DES ÉLÈVES PAR L'ADMIN (ADMINISTRATION DEVOIRS & DÉPLACEMENT)
// ============================================================================

async function loadAdminStudentsList() {
    try {
        const classFilterEl = document.getElementById('adminStudentClassFilter');
        const className = classFilterEl ? classFilterEl.value : 'all';
        const section = document.getElementById('adminStudentSectionFilter')?.value || 'garcons';
        const container = document.getElementById('studentsTableContainer');
        const quickSelector = document.getElementById('adminMoveStudentSelector');
        if (!container) return;

        container.innerHTML = '<p style="color:#64748B; padding:12px;"><i class="fas fa-spinner fa-spin"></i> Chargement des élèves...</p>';

        // 1. Récupérer la liste complète des élèves pour la section (pour alimenter le sélecteur rapide de déplacement)
        const allRes = await fetch(`/api/admin/students?section=${section}`);
        let allStudents = [];
        if (allRes.ok) {
            allStudents = await allRes.json();
        }

        if (quickSelector) {
            if (allStudents && allStudents.length > 0) {
                quickSelector.innerHTML = '<option value="">-- Choisir un élève à déplacer --</option>' +
                    allStudents.map(s => `<option value="${s._id || s.name}" data-name="${s.name}" data-class="${s.class}">${s.name} (${s.class})</option>`).join('');
            } else {
                quickSelector.innerHTML = '<option value="">-- Aucun élève enregistré --</option>';
            }
        }

        // 2. Filtrer les élèves selon la classe sélectionnée
        let studentsToDisplay = allStudents;
        if (className && className !== 'all') {
            studentsToDisplay = allStudents.filter(s => s.class === className);
        }

        const secLabel = section === 'garcons' ? 'Section Garçons 👦' : (section === 'primaire' ? 'Section Primaire & Maternelle 👶🎒' : 'Section Filles 👧');
        if (!studentsToDisplay || studentsToDisplay.length === 0) {
            const classLabel = className === 'all' ? 'Toutes les classes' : className;
            container.innerHTML = `<p style="color:#64748B; padding:15px; background:#F8FAFC; border-radius:8px; border:1px solid #E2E8F0;">
                <i class="fas fa-info-circle"></i> Aucun élève trouvé pour <strong>${classLabel}</strong> (${secLabel}).
            </p>`;
            return;
        }

        const secClasses = getSectionClasses(section);
        const allClasses = secClasses.map(cls => ({
            id: cls,
            label: getClassLabel(cls)
        }));

        const moveTargetClassSelect = document.getElementById('adminMoveTargetClass');
        if (moveTargetClassSelect) {
            const curMoveVal = moveTargetClassSelect.value;
            moveTargetClassSelect.innerHTML = '<option value="">-- Choisir la nouvelle classe --</option>' +
                allClasses.map(c => `<option value="${c.id}">${c.label}</option>`).join('');
            if (curMoveVal && secClasses.includes(curMoveVal)) {
                moveTargetClassSelect.value = curMoveVal;
            }
        }

        const fallbackAvatar = getStudentFallbackAvatar(section);
        container.innerHTML = `
            <div style="margin-bottom:8px; font-size:0.85rem; color:#475569;">
                Total affiché : <strong>${studentsToDisplay.length}</strong> élève(s)
            </div>
            <table class="users-table">
                <thead>
                    <tr>
                        <th style="width:60px;">Photo</th>
                        <th>Nom de l'élève</th>
                        <th>Classe actuelle</th>
                        <th>Anniversaire</th>
                        <th>Déplacer vers une autre classe</th>
                        <th style="width:60px;">Action</th>
                    </tr>
                </thead>
                <tbody>
                    ${studentsToDisplay.map((s, idx) => {
                        const safeId = `row_${idx}_` + (s._id || s.name).replace(/[^a-zA-Z0-9_-]/g, '_');
                        const escapedName = (s.name || '').replace(/'/g, "\\'").replace(/"/g, '&quot;');
                        const photoSrc = s.photo && s.photo.trim() ? s.photo : fallbackAvatar;
                        return `
                        <tr>
                            <td>
                                <img src="${photoSrc}" 
                                     style="width:40px; height:40px; border-radius:50%; object-fit:cover; border:1px solid #CBD5E1; background:#F1F5F9;" 
                                     onerror="this.onerror=null; this.src='${fallbackAvatar}';">
                            </td>
                            <td><strong>${s.name}</strong></td>
                            <td>
                                <span style="background:#E0E7FF; color:#3730A3; padding:4px 10px; border-radius:6px; font-weight:700; font-size:0.85rem; display:inline-block;">
                                    ${s.class}
                                </span>
                            </td>
                            <td>${s.birthday || '-'}</td>
                            <td>
                                <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
                                    <select id="moveClass_${safeId}" class="move-student-select" style="padding:6px 10px; border-radius:6px; border:1px solid #CBD5E1; font-weight:600;">
                                        ${allClasses.map(c => `<option value="${c.id}" ${c.id === s.class ? 'selected' : ''}>${c.label}</option>`).join('')}
                                    </select>
                                    <button type="button" class="btn-sm-move" style="background:#2563EB; color:white; border:none; border-radius:6px; padding:6px 12px; cursor:pointer; font-weight:600; display:inline-flex; align-items:center; gap:5px;" onclick="adminMoveStudent('${s._id || ''}', '${escapedName}', '${s.class}', 'moveClass_${safeId}')">
                                        <i class="fas fa-exchange-alt"></i> Déplacer
                                    </button>
                                </div>
                            </td>
                            <td>
                                <button class="btn-sm-delete" style="background:#EF4444; color:white; border:none; border-radius:6px; padding:6px 10px; cursor:pointer;" onclick="adminDeleteStudent('${s._id || ''}', '${escapedName}', '${s.class}')" title="Supprimer l'élève">
                                    <i class="fas fa-trash-alt"></i>
                                </button>
                            </td>
                        </tr>
                        `;
                    }).join('')}
                </tbody>
            </table>
        `;
    } catch (e) {
        console.error('Erreur loadAdminStudentsList:', e);
    }
}

async function adminMoveStudent(studentId, studentName, oldClass, selectElementId) {
    try {
        const selectEl = document.getElementById(selectElementId);
        const newClass = selectEl ? selectEl.value : null;
        const section = document.getElementById('adminStudentSectionFilter')?.value || 'garcons';
        const statusEl = document.getElementById('adminStudentStatus');

        if (!newClass) {
            alert("Veuillez choisir une nouvelle classe.");
            return;
        }

        if (newClass === oldClass) {
            alert(`L'élève '${studentName}' est déjà dans la classe ${oldClass}.`);
            return;
        }

        if (!confirm(`Confirmer le déplacement de l'élève '${studentName}' de ${oldClass} vers ${newClass} ?`)) {
            return;
        }

        if (statusEl) statusEl.innerHTML = `<span style="color:#2563EB;"><i class="fas fa-spinner fa-spin"></i> Déplacement en cours de ${studentName} vers ${newClass}...</span>`;

        const res = await fetch('/api/admin/students/move', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                studentId,
                studentName,
                name: studentName,
                oldClass,
                newClass,
                section
            })
        });

        const result = await res.json().catch(() => ({}));
        if (res.ok && (result.success || result.student || !result.error)) {
            if (typeof studentsClientCache !== 'undefined') studentsClientCache.clear();
            const successMsg = result.message || `Élève '${studentName}' déplacé avec succès de ${oldClass} vers ${newClass} !`;
            if (statusEl) statusEl.innerHTML = `<span style="color:#16A34A; font-weight:700;"><i class="fas fa-check-circle"></i> ${successMsg}</span>`;
            displayAlert(successMsg, false);
            await loadAdminStudentsList();
        } else {
            const err = result.error || result.message || 'Erreur lors du déplacement de l\'élève.';
            if (statusEl) statusEl.innerHTML = `<span style="color:#DC2626; font-weight:700;"><i class="fas fa-exclamation-triangle"></i> ${err}</span>`;
            alert(`Erreur: ${err}`);
        }
    } catch (e) {
        console.error('Erreur adminMoveStudent:', e);
        alert('Erreur réseau lors du déplacement de l\'élève.');
    }
}

async function adminQuickMoveStudent() {
    try {
        const quickSelector = document.getElementById('adminMoveStudentSelector');
        const targetClassSelect = document.getElementById('adminMoveTargetClass');
        const section = document.getElementById('adminStudentSectionFilter')?.value || 'garcons';
        const statusEl = document.getElementById('adminStudentStatus');

        if (!quickSelector || !quickSelector.value) {
            alert("Veuillez sélectionner un élève à déplacer.");
            return;
        }

        const selectedOption = quickSelector.options[quickSelector.selectedIndex];
        const studentId = quickSelector.value;
        const studentName = selectedOption.getAttribute('data-name') || studentId;
        const oldClass = selectedOption.getAttribute('data-class') || '';
        const newClass = targetClassSelect ? targetClassSelect.value : null;

        if (!newClass) {
            alert("Veuillez sélectionner une classe de destination.");
            return;
        }

        if (oldClass && newClass === oldClass) {
            alert(`L'élève '${studentName}' est déjà dans la classe ${oldClass}.`);
            return;
        }

        if (!confirm(`Confirmer le déplacement de l'élève '${studentName}' ${oldClass ? 'de ' + oldClass + ' ' : ''}vers ${newClass} ?`)) {
            return;
        }

        if (statusEl) statusEl.innerHTML = `<span style="color:#2563EB;"><i class="fas fa-spinner fa-spin"></i> Déplacement en cours de ${studentName} vers ${newClass}...</span>`;

        const res = await fetch('/api/admin/students/move', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                studentId,
                studentName,
                name: studentName,
                oldClass,
                newClass,
                section
            })
        });

        const result = await res.json().catch(() => ({}));
        if (res.ok && (result.success || result.student || !result.error)) {
            if (typeof studentsClientCache !== 'undefined') studentsClientCache.clear();
            const successMsg = result.message || `Élève '${studentName}' déplacé avec succès vers ${newClass} !`;
            if (statusEl) statusEl.innerHTML = `<span style="color:#16A34A; font-weight:700;"><i class="fas fa-check-circle"></i> ${successMsg}</span>`;
            displayAlert(successMsg, false);
            await loadAdminStudentsList();
        } else {
            const err = result.error || result.message || 'Erreur lors du déplacement de l\'élève.';
            if (statusEl) statusEl.innerHTML = `<span style="color:#DC2626; font-weight:700;"><i class="fas fa-exclamation-triangle"></i> ${err}</span>`;
            alert(`Erreur: ${err}`);
        }
    } catch (e) {
        console.error('Erreur adminQuickMoveStudent:', e);
        alert('Erreur réseau lors du déplacement de l\'élève.');
    }
}

async function adminAddOrUpdateStudent() {
    try {
        const name = document.getElementById('adminStudentName')?.value;
        const photo = document.getElementById('adminStudentPhoto')?.value;
        const birthday = document.getElementById('adminStudentBirthday')?.value;
        const className = document.getElementById('adminStudentClassFilter')?.value || 'PEI1';
        const section = document.getElementById('adminStudentSectionFilter')?.value || 'garcons';
        const statusEl = document.getElementById('adminStudentStatus');

        if (!name) {
            if (statusEl) statusEl.innerHTML = '<span style="color:red;">Le nom de l\'élève est obligatoire.</span>';
            return;
        }

        const res = await fetch('/api/admin/students', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, photo, birthday, class: className, section })
        });

        if (res.ok) {
            if (typeof studentsClientCache !== 'undefined') studentsClientCache.clear();
            if (statusEl) statusEl.innerHTML = '<span style="color:green;">Élève enregistré avec succès.</span>';
            document.getElementById('adminStudentName').value = '';
            document.getElementById('adminStudentPhoto').value = '';
            document.getElementById('adminStudentBirthday').value = '';
            loadAdminStudentsList();
        } else {
            if (statusEl) statusEl.innerHTML = '<span style="color:red;">Erreur lors de l\'enregistrement.</span>';
        }
    } catch (e) {
        console.error('Erreur adminAddOrUpdateStudent:', e);
    }
}

async function adminDeleteStudent(id, name, className) {
    if (!confirm(`Voulez-vous vraiment supprimer l'élève '${name}' ?`)) return;
    try {
        const section = document.getElementById('adminStudentSectionFilter')?.value || 'garcons';
        const res = await fetch('/api/admin/students', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id, name, class: className, section })
        });
        if (res.ok) {
            if (typeof studentsClientCache !== 'undefined') studentsClientCache.clear();
            displayAlert(`Élève ${name} supprimé.`, false);
            loadAdminStudentsList();
        }
    } catch (e) {
        console.error('Erreur adminDeleteStudent:', e);
    }
}

async function adminSavePhoto(photoNum) {
    try {
        const section = document.getElementById('adminStudentSectionFilter')?.value || 'garcons';
        const urlInput = document.getElementById(`adminPhoto${photoNum}Url`);
        const commentInput = document.getElementById(`adminPhoto${photoNum}Comment`);
        if (!urlInput || !urlInput.value) {
            alert('Veuillez entrer une URL d\'image validée.');
            return;
        }

        const endpoint = photoNum === 1 ? '/api/photo-of-the-day' : (photoNum === 2 ? '/api/photo-2' : '/api/photo-3');
        const res = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ imageUrl: urlInput.value, comment: commentInput.value, section })
        });

        if (res.ok) {
            alert(`Photo ${photoNum} enregistrée avec succès !`);
            urlInput.value = '';
            commentInput.value = '';
            loadHomeworkShowcase();
        }
    } catch (e) {
        console.error('Erreur adminSavePhoto:', e);
    }
}

// ============================================================================
// BILINGUAL PARENT SPACE ENGINE & TEACHER CONTACT UTILS
// ============================================================================

currentUserLanguage = localStorage.getItem('parentLanguage') || 'fr';

const parentI18n = {
    fr: {
        langBtn: 'العربية 🇸🇦',
        homeBtn: 'Accueil',
        parentPlanTitle: 'Plan Hebdomadaire',
        studentFollowBtn: 'Suivi Élève & Contact',
        copyDirectLink: 'Copier lien direct',
        tabStudents: '1. Suivi Élèves & Devoirs',
        tabPlan: '2. Plan Hebdomadaire',
        tabTeachers: '3. Contacter Enseignants',
        tabPhotos: '4. Célébrations & Photos',
        filterWeek: 'Semaine :',
        filterClass: 'Classe :',
        filterDay: 'Jour :',
        allDays: 'Tous les jours de la semaine',
        contactTeachersTitle: 'Contacter les Enseignants',
        parentContactsHeader: 'Espace Parents - Contacter les Enseignants',
        parentPhotosHeader: 'Espace Parents - Célébrations & Photos',
        parentAuthBtn: 'Connexion / Inscription Parent',
        contactTeachersDesc: 'Cliquez sur n\'importe quel enseignant ci-dessous pour lui envoyer directement un message concernant votre enfant.',
        sendMessageBtn: 'Envoyer message',
        backToPlan: 'Plan Hebdomadaire',
        parentTitle: 'Espace Parents - Suivi des Élèves',
        selectClass: 'Sélectionner la classe :',
        backToStudents: 'Retour aux élèves',
        prevDay: 'Jour Précédent',
        nextDay: 'Jour Suivant',
        toggleWeeklyHomeworks: 'Voir tous les devoirs de la semaine',
        goToClassPlan: 'Consulter le Plan Hebdo de la classe',
        contactModalHeading: 'Contacter l\'enseignant',
        parentNameLabel: 'Votre nom (Parent) :',
        parentPhoneLabel: 'Numéro de téléphone (optionnel) :',
        messageLabel: 'Votre message :',
        sendMsgBtn: 'Envoyer le message',
        cancelBtn: 'Fermer',
        msgSentSuccess: 'Votre message a été envoyé avec succès à l\'enseignant !',
        msgEmptyErr: 'Veuillez saisir votre message avant d\'envoyer.',
        lessonTopic: 'Leçon / Sujet :',
        classWork: 'Travail de classe :',
        homeWork: 'Devoirs à la maison :',
        noHomework: 'Aucun devoir à la maison pour ce cours',
        supportLinks: 'Support :',
        periodLabel: 'Période',
        sessionsCount: 'Séance(s)',
        loadingPlan: 'Chargement du plan hebdomadaire...',
        noCoursesFound: 'Aucun cours enregistré pour cette sélection.',
        planCompletedTitle: 'Plan Hebdomadaire Officiel - Saisie terminée ✅',
        planCompletedDesc: 'Tous les enseignants ont finalisé la préparation des cours pour cette classe.',
        planInProgressTitle: 'Plan Hebdomadaire en cours de finalisation ⏳',
        planInProgressDesc: 'L\'équipe pédagogique finalise actuellement la saisie. Les cours préparés sont affichés ci-dessous.',
        noPlanPublished: 'Aucun plan publié pour cette classe.',
        daysMap: {
            "Dimanche": "Dimanche",
            "Lundi": "Lundi",
            "Mardi": "Mardi",
            "Mercredi": "Mercredi",
            "Jeudi": "Jeudi"
        }
    },
    ar: {
        langBtn: 'Français 🇫🇷',
        homeBtn: 'الرئيسية',
        parentPlanTitle: 'الخطة الأسبوعية',
        studentFollowBtn: 'متابعة الطالب والتواصل',
        copyDirectLink: 'نسخ الرابط المباشر',
        tabStudents: '١. متابعة الطلاب والواجبات',
        tabPlan: '٢. الخطة الأسبوعية',
        tabTeachers: '٣. تواصل مع المعلمين',
        tabPhotos: '٤. لوحة الأنشطة',
        filterWeek: 'الأسبوع :',
        filterClass: 'الصف :',
        filterDay: 'اليوم :',
        allDays: 'جميع أيام الأسبوع',
        contactTeachersTitle: 'التواصل المباشر مع المعلمين والمعلمات',
        parentContactsHeader: 'فضاء أولياء الأمور - تواصل مع المعلمين',
        parentPhotosHeader: 'فضاء أولياء الأمور - لوحة الأنشطة',
        parentAuthBtn: 'تسجيل دخول / حساب ولي الأمر',
        contactTeachersDesc: 'اضغط على اسم المعلم أدناه لإرسال رسالة مباشرة بخصوص متابعة مستوى ابنكم الدراسي.',
        sendMessageBtn: 'مراسلة المعلم ✉️',
        backToPlan: 'الخطة الأسبوعية',
        parentTitle: 'فضاء أولياء الأمور - متابعة الطلاب',
        selectClass: 'اختر الصف الدراسي :',
        backToStudents: 'العودة لقائمة الطلاب',
        prevDay: 'اليوم السابق',
        nextDay: 'اليوم التالي',
        toggleWeeklyHomeworks: 'عرض جميع واجبات الأسبوع',
        goToClassPlan: 'الاطلاع على الخطة الأسبوعية للفصل',
        contactModalHeading: 'مراسلة المعلم',
        parentNameLabel: 'اسم ولي الأمر :',
        parentPhoneLabel: 'رقم الهاتف (اختياري) :',
        messageLabel: 'نص الرسالة والاستفسار :',
        sendMsgBtn: 'إرسال الرسالة الآن',
        cancelBtn: 'إلغاء',
        msgSentSuccess: 'تم إرسال رسالتكم بنجاح إلى المعلم !',
        msgEmptyErr: 'يرجى كتابة نص الرسالة قبل الإرسال.',
        lessonTopic: 'الدرس / موضوع الحصة :',
        classWork: 'العمل والأنشطة الصفية :',
        homeWork: 'الواجب المنزلي :',
        noHomework: 'لا يوجد واجب منزلي لهذه الحصة',
        supportLinks: 'المراجع والروابط :',
        periodLabel: 'الحصة',
        sessionsCount: 'حصص',
        loadingPlan: 'جاري تحميل الخطة الأسبوعية...',
        noCoursesFound: 'لا توجد حصص مسجلة لهذا الاختيار.',
        planCompletedTitle: 'الخطة الأسبوعية الرسمية - مكتملة الإعداد ✅',
        planCompletedDesc: 'أنهى جميع المعلمين إعداد وتوثيق حصص هذا الأسبوع.',
        planInProgressTitle: 'الخطة الأسبوعية قيد الاستكمال ⏳',
        planInProgressDesc: 'يقوم الكادر التعليمي حالياً باستكمال إدخال الدروس. الحصص الجاهزة معروضة أدناه.',
        noPlanPublished: 'لا توجد خطة منشورة لهذا الصف حالياً.',
        daysMap: {
            "Dimanche": "الأحد",
            "Lundi": "الاثنين",
            "Mardi": "الثلاثاء",
            "Mercredi": "الأربعاء",
            "Jeudi": "الخميس"
        }
    }
};

function toggleParentLanguage() {
    currentUserLanguage = (currentUserLanguage === 'fr') ? 'ar' : 'fr';
    localStorage.setItem('parentLanguage', currentUserLanguage);
    applyParentLanguageUI();
    loadParentWeeklyPlan();
    loadTeachersContactGrid();
}

function applyParentLanguageUI() {
    const lang = currentUserLanguage;
    const t = parentI18n[lang] || parentI18n.fr;

    // Définir la direction du texte (RTL pour l'arabe, LTR pour le français)
    document.body.setAttribute('dir', lang === 'ar' ? 'rtl' : 'ltr');

    // Mettre à jour les boutons de basculement de langue
    document.querySelectorAll('.parentLangToggleLabel').forEach(el => {
        el.textContent = t.langBtn;
    });

    const setTxt = (id, txt) => {
        const el = document.getElementById(id);
        if (el) el.textContent = txt;
    };

    setTxt('btnHomeText', t.homeBtn);
    setTxt('btnHomeText2', t.homeBtn);
    setTxt('btnHomeText3', t.homeBtn);
    setTxt('btnHomeTextPhotos', t.homeBtn);
    setTxt('parentPlanViewHeader', t.parentPlanTitle);
    setTxt('parentContactsHeaderTitle', t.parentContactsHeader);
    setTxt('parentPhotosTitleText', t.parentPhotosHeader);
    setTxt('btnHeaderStudentFollow', t.studentFollowBtn);
    setTxt('btnBackToPlanText', t.backToPlan);
    setTxt('parentTitleText', t.parentTitle);
    setTxt('lblSelectClass', t.selectClass);
    setTxt('btnBackToStudentsList', t.backToStudents);
    setTxt('btnPrevDayText', t.prevDay);
    setTxt('btnNextDayText', t.nextDay);
    setTxt('btnToggleWeeklyHomeworksText', t.toggleWeeklyHomeworks);
    setTxt('btnGoToClassPlanText', t.goToClassPlan);

    setTxt('lblFilterWeek', t.filterWeek);
    setTxt('lblFilterClass', t.filterClass);
    setTxt('lblFilterDay', t.filterDay);

    setTxt('txtContactTeachersTitle', t.contactTeachersTitle);
    setTxt('txtParentAuthBtn', t.parentAuthBtn);
    setTxt('txtContactTeachersDesc', t.contactTeachersDesc);

    setTxt('contactModalTeacherHeading', t.contactModalHeading);
    setTxt('lblContactParentName', t.parentNameLabel);
    setTxt('lblContactParentPhone', t.parentPhoneLabel);
    setTxt('lblContactParentMsg', t.messageLabel);
    setTxt('btnSendParentMsgText', t.sendMsgBtn);
    setTxt('btnCancelParentMsgText', t.cancelBtn);

    document.querySelectorAll('.tab-txt-plan').forEach(el => el.textContent = t.tabPlan);
    document.querySelectorAll('.tab-txt-students').forEach(el => el.textContent = t.tabStudents);
    document.querySelectorAll('.tab-txt-teachers').forEach(el => el.textContent = t.tabTeachers);
    document.querySelectorAll('.tab-txt-photos').forEach(el => el.textContent = t.tabPhotos);
    document.querySelectorAll('.parentCopyLinkTxt').forEach(el => el.textContent = t.copyDirectLink);
    updateSectionBadges();
}

function showTeacherContactSection() {
    showHomeworkView('parent-contacts');
}

function openParentAuthModal() {
    const m = document.getElementById('parent-auth-modal');
    if (m) m.style.display = 'flex';
}

function closeParentAuthModal() {
    const m = document.getElementById('parent-auth-modal');
    if (m) m.style.display = 'none';
}

function switchParentAuthTab(tab) {
    document.getElementById('parent-login-form').style.display = (tab === 'login') ? 'block' : 'none';
    document.getElementById('parent-register-form').style.display = (tab === 'register') ? 'block' : 'none';
    document.getElementById('tab-login-btn').classList.toggle('active', tab === 'login');
    document.getElementById('tab-register-btn').classList.toggle('active', tab === 'register');
}

async function submitParentRegister() {
    const firstName = document.getElementById('parentRegFirstName').value;
    const lastName = document.getElementById('parentRegLastName').value;
    const phone = document.getElementById('parentRegPhone').value;
    const password = document.getElementById('parentRegPassword').value;
    const statusEl = document.getElementById('parent-auth-status');

    if (!firstName || !lastName || !phone || !password) {
        if (statusEl) statusEl.innerHTML = '<span style="color:red;">Tous les champs sont requis.</span>';
        return;
    }

    const res = await fetch('/api/parent-register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ firstName, lastName, phone, password, section: currentSection })
    });

    if (res.ok) {
        const data = await res.json();
        activeParentAccount = data.parent;
        localStorage.setItem('parentAccount', JSON.stringify(activeParentAccount));
        if (statusEl) statusEl.innerHTML = '<span style="color:green;">Inscription réussie ! Connexion automatique.</span>';
        setTimeout(closeParentAuthModal, 1000);
    } else {
        const err = await res.json();
        if (statusEl) statusEl.innerHTML = `<span style="color:red;">${err.error || 'Erreur d\'inscription.'}</span>`;
    }
}

async function submitParentLogin() {
    const phone = document.getElementById('parentLoginPhone').value;
    const password = document.getElementById('parentLoginPassword').value;
    const statusEl = document.getElementById('parent-auth-status');

    const res = await fetch('/api/parent-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, password })
    });

    if (res.ok) {
        const data = await res.json();
        activeParentAccount = data.parent;
        localStorage.setItem('parentAccount', JSON.stringify(activeParentAccount));
        if (statusEl) statusEl.innerHTML = '<span style="color:green;">Connexion réussie !</span>';
        setTimeout(closeParentAuthModal, 1000);
    } else {
        if (statusEl) statusEl.innerHTML = '<span style="color:red;">Identifiants incorrects.</span>';
    }
}

async function loadTeachersContactGrid() {
    try {
        const grid = document.getElementById('teachers-contact-grid');
        if (!grid) return;
        
        let teachers = (teachersSectionMap && teachersSectionMap[currentSection]) 
            ? [...teachersSectionMap[currentSection]] 
            : (currentSection === 'filles' ? [...femaleTeachersList] : [...maleTeachersList]);
        
        // Tentative de récupération des enseignants réels de la section dans la base de données
        try {
            const res = await fetch(`/api/admin/users?section=${currentSection}`);
            if (res.ok) {
                const userDocs = await res.json();
                if (userDocs && Array.isArray(userDocs) && userDocs.length > 0) {
                    teachers = userDocs.map(u => u.username).filter(name => name && name.toLowerCase() !== 'admin');
                }
            }
        } catch (fetchErr) {
            console.warn('Utilisation de la liste prédéfinie pour la section:', currentSection);
        }

        // Filtre de sécurité frontend strict pour empêcher tout mélange entre sections
        if (currentSection === 'garcons') {
            teachers = teachers.filter(t => !femaleTeachersList.some(f => f.toLowerCase() === t.toLowerCase()) && !primaireTeachersList.some(p => p.toLowerCase() === t.toLowerCase()) && !isDualSectionTeacher(t));
        } else if (currentSection === 'filles') {
            teachers = teachers.filter(t => isDualSectionTeacher(t) || (!maleTeachersList.some(m => m.toLowerCase() === t.toLowerCase()) && !primaireTeachersList.some(p => p.toLowerCase() === t.toLowerCase())));
        } else if (currentSection === 'primaire') {
            teachers = teachers.filter(t => isDualSectionTeacher(t) || (!maleTeachersList.some(m => m.toLowerCase() === t.toLowerCase()) && !femaleTeachersList.some(f => f.toLowerCase() === t.toLowerCase())));
        }

        const t = parentI18n[currentUserLanguage] || parentI18n.fr;
        const iconBg = currentSection === 'filles' ? 'linear-gradient(135deg, #EC4899, #DB2777)' : (currentSection === 'primaire' ? 'linear-gradient(135deg, #10B981, #059669)' : 'linear-gradient(135deg, #2563EB, #1D4ED8)');

        // S'assurer que le cache des photos est chargé
        if (!window.globalTeachersPhotosMap || Object.keys(window.globalTeachersPhotosMap).length === 0) {
            await fetchGlobalTeachersPhotos();
        }

        grid.innerHTML = teachers.map(teacher => {
            const photoUrl = getTeacherDirectPhotoUrl(teacher);
            const initial = teacher ? teacher.charAt(0).toUpperCase() : '?';
            return `
            <div class="teacher-contact-card" onclick="openParentMessengerModal('${teacher.replace(/'/g, "\\'")}')" style="background:#FFFFFF; border:1.5px solid #E2E8F0; border-radius:16px; padding:18px 14px; text-align:center; cursor:pointer; transition:all 0.25s ease; box-shadow:0 2px 8px rgba(0,0,0,0.04); display:flex; flex-direction:column; align-items:center;">
                <div style="width:58px; height:58px; margin:0 auto 10px auto; border-radius:50%; overflow:hidden; position:relative; box-shadow:0 3px 8px rgba(0,0,0,0.1); border:2px solid #CBD5E1;">
                    ${photoUrl ? `
                        <img src="${photoUrl}" alt="${escapeHtml(teacher)}" style="width:100%; height:100%; object-fit:cover; display:block;" onerror="this.onerror=null; this.parentElement.innerHTML='<div style=\\'width:100%; height:100%; background:${iconBg}; color:white; display:flex; align-items:center; justify-content:center; font-size:1.3rem; font-weight:700;\\'>${escapeHtml(initial)}</div>';">
                    ` : `
                        <div style="width:100%; height:100%; background:${iconBg}; color:white; display:flex; align-items:center; justify-content:center; font-size:1.3rem; font-weight:700;">
                            ${escapeHtml(initial)}
                        </div>
                    `}
                </div>
                <h4 style="margin:0 0 6px 0; color:#1E1B4B; font-size:1.02rem; font-weight:800; line-height:1.25;">${escapeHtml(teacher)}</h4>
                <div style="display:inline-flex; align-items:center; gap:5px; background:#ECFDF5; color:#065F46; padding:4px 10px; border-radius:8px; font-size:0.8rem; font-weight:700; margin-top:auto;">
                    <i class="fas fa-paper-plane"></i> <span>${t.sendMessageBtn}</span>
                </div>
            </div>
            `;
        }).join('');
    } catch (e) {
        console.error('Erreur loadTeachersContactGrid:', e);
    }
}

let targetTeacherForMessage = null;

async function openContactTeacherModal(teacherName) {
    if (typeof openParentMessengerModal === 'function') {
        openParentMessengerModal(teacherName);
        return;
    }

    targetTeacherForMessage = teacherName;
    const t = parentI18n[currentUserLanguage] || parentI18n.fr;
    
    // S'assurer que les photos sont chargées
    if (!window.globalTeachersPhotosMap || Object.keys(window.globalTeachersPhotosMap).length === 0) {
        await fetchGlobalTeachersPhotos();
    }

    const titleHeading = document.getElementById('contactModalTeacherHeading');
    if (titleHeading) {
        titleHeading.innerText = currentUserLanguage === 'ar' ? `مراسلة الأستاذ(ة) ${teacherName}` : `Contacter ${teacherName}`;
    }

    // Affichage de la photo et du nom de l'enseignant dans le modal de contact
    const modalTeacherName = document.getElementById('contactModalTeacherName');
    if (modalTeacherName) modalTeacherName.textContent = teacherName;

    const modalAvatar = document.getElementById('contactModalTeacherAvatar');
    if (modalAvatar) {
        const photoUrl = getTeacherDirectPhotoUrl(teacherName);
        const initial = teacherName ? teacherName.charAt(0).toUpperCase() : '?';
        if (photoUrl) {
            modalAvatar.innerHTML = `<img src="${photoUrl}" alt="${escapeHtml(teacherName)}" style="width:100%; height:100%; object-fit:cover; border-radius:50%; display:block;" onerror="this.onerror=null; this.parentElement.innerHTML='<span style=\\'font-weight:800;\\'>${escapeHtml(initial)}</span>';">`;
        } else {
            modalAvatar.innerHTML = `<span style="font-weight:800; font-size:1.1rem; color:#2563EB;">${escapeHtml(initial)}</span>`;
        }
    }

    // Pré-remplir les données du parent si connectées ou enregistrées
    const nameInput = document.getElementById('parentMsgSenderName');
    const phoneInput = document.getElementById('parentMsgSenderPhone');
    
    if (nameInput) {
        if (activeParentAccount && activeParentAccount.firstName) {
            nameInput.value = `${activeParentAccount.firstName} ${activeParentAccount.lastName}`;
        } else {
            nameInput.value = localStorage.getItem('parentSenderName') || '';
        }
    }
    
    if (phoneInput) {
        if (activeParentAccount && activeParentAccount.phone) {
            phoneInput.value = activeParentAccount.phone;
        } else {
            phoneInput.value = localStorage.getItem('parentSenderPhone') || '';
        }
    }

    const m = document.getElementById('contact-teacher-modal');
    if (m) m.style.display = 'flex';
}

function closeContactTeacherModal() {
    const m = document.getElementById('contact-teacher-modal');
    if (m) m.style.display = 'none';
}

async function submitParentMessage() {
    const text = document.getElementById('parentMessageText')?.value;
    const senderName = document.getElementById('parentMsgSenderName')?.value;
    const senderPhone = document.getElementById('parentMsgSenderPhone')?.value;
    const t = parentI18n[currentUserLanguage] || parentI18n.fr;

    if (!text || text.trim() === '') {
        alert(t.msgEmptyErr);
        return;
    }

    const pName = senderName && senderName.trim() !== '' ? senderName.trim() : (activeParentAccount ? `${activeParentAccount.firstName} ${activeParentAccount.lastName}` : (currentUserLanguage === 'ar' ? 'ولي أمر' : 'Parent d\'élève'));
    const pPhone = senderPhone && senderPhone.trim() !== '' ? senderPhone.trim() : (activeParentAccount ? activeParentAccount.phone : '');

    // Sauvegarder localement pour les futurs messages
    if (senderName) localStorage.setItem('parentSenderName', senderName.trim());
    if (senderPhone) localStorage.setItem('parentSenderPhone', senderPhone.trim());

    try {
        const res = await fetch('/api/send-message', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                teacherName: targetTeacherForMessage,
                parentName: pName,
                parentPhone: pPhone,
                message: text,
                section: currentSection
            })
        });

        if (res.ok) {
            alert(t.msgSentSuccess);
            if (document.getElementById('parentMessageText')) {
                document.getElementById('parentMessageText').value = '';
            }
            closeContactTeacherModal();
            if (typeof checkParentUnreadMessagesNotification === 'function') {
                checkParentUnreadMessagesNotification();
            }
        } else {
            alert(currentUserLanguage === 'ar' ? 'حدث خطأ أثناء إرسال الرسالة، يرجى المحاولة لاحقاً.' : 'Erreur lors de l\'envoi du message.');
        }
    } catch (e) {
        console.error('Erreur submitParentMessage:', e);
        alert(currentUserLanguage === 'ar' ? 'تعذر الاتصال بالخادم.' : 'Erreur réseau.');
    }
}

let currentTeacherMessages = [];
let currentTeacherMsgFilter = 'all';
let activeTeacherChatConvoKey = null;
let teacherMessengerPollTimer = null;

async function openTeacherMessagesModal(preselectedConvoKey = null) {
    const modal = document.getElementById('teacherMessagesModal');
    if (!modal) return;

    const teacherName = (typeof loggedInUser !== 'undefined' && loggedInUser && !isUserAdminOrSupervisor(loggedInUser, currentUserRole)) ? loggedInUser : 'all';
    const nameEl = document.getElementById('teacherModalTeacherName');
    if (nameEl) {
        nameEl.textContent = teacherName === 'all' ? 'Tous les enseignants (Supervision)' : teacherName;
    }

    modal.style.display = 'block';
    
    if (teacherMessengerPollTimer) clearInterval(teacherMessengerPollTimer);
    teacherMessengerPollTimer = setInterval(refreshTeacherMessagesSilently, 5000);

    await loadTeacherMessages();

    if (preselectedConvoKey) {
        selectTeacherConversation(preselectedConvoKey);
    }
}

function closeTeacherMessagesModal() {
    const modal = document.getElementById('teacherMessagesModal');
    if (modal) modal.style.display = 'none';
    if (teacherMessengerPollTimer) {
        clearInterval(teacherMessengerPollTimer);
        teacherMessengerPollTimer = null;
    }
}

async function refreshTeacherMessagesSilently() {
    const modal = document.getElementById('teacherMessagesModal');
    if (!modal || modal.style.display === 'none') return;
    try {
        const teacherName = (typeof loggedInUser !== 'undefined' && loggedInUser && !isUserAdminOrSupervisor(loggedInUser, currentUserRole)) ? loggedInUser : 'all';
        const section = (typeof currentSection !== 'undefined' && currentSection) ? currentSection : 'garcons';
        const res = await fetch(`/api/get-messages?teacherName=${encodeURIComponent(teacherName)}&section=${encodeURIComponent(section)}`);
        if (!res.ok) return;
        currentTeacherMessages = await res.json();
        updateTeacherCounters();
        renderTeacherConversationsList(true);
        if (activeTeacherChatConvoKey) {
            renderActiveTeacherChatMessages(activeTeacherChatConvoKey, true);
        }
    } catch (e) {
        // silencieux
    }
}

async function loadTeacherMessages() {
    const container = document.getElementById('teacherConversationsList');
    if (container) {
        container.innerHTML = `
            <div style="text-align:center; padding:30px; color:#64748B;">
                <i class="fas fa-spinner fa-spin fa-2x" style="color:#2563EB; margin-bottom:10px;"></i>
                <p style="font-size:0.85rem;">Chargement des messages...</p>
            </div>
        `;
    }

    try {
        const teacherName = (typeof loggedInUser !== 'undefined' && loggedInUser && !isUserAdminOrSupervisor(loggedInUser, currentUserRole)) ? loggedInUser : 'all';
        const section = (typeof currentSection !== 'undefined' && currentSection) ? currentSection : 'garcons';
        const res = await fetch(`/api/get-messages?teacherName=${encodeURIComponent(teacherName)}&section=${encodeURIComponent(section)}`);
        
        if (!res.ok) throw new Error(`Erreur ${res.status}`);
        currentTeacherMessages = await res.json();

        updateTeacherCounters();
        renderTeacherConversationsList(false);

        // Sélectionner la première conversation par défaut si aucune sélectionnée
        const convos = groupTeacherMessagesIntoConversations();
        if (activeTeacherChatConvoKey) {
            selectTeacherConversation(activeTeacherChatConvoKey);
        } else if (convos.length > 0) {
            selectTeacherConversation(convos[0].key);
        }
    } catch (err) {
        console.error('Erreur chargement messages enseignants:', err);
        if (container) {
            container.innerHTML = `
                <div style="background:#FEF2F2; color:#991B1B; padding:16px; border-radius:10px; text-align:center; font-size:0.85rem;">
                    <i class="fas fa-exclamation-triangle" style="margin-right:6px;"></i>
                    Impossible de charger les messages pour le moment.
                </div>
            `;
        }
    }
}

function updateTeacherCounters() {
    const convos = groupTeacherMessagesIntoConversations();
    const total = convos.length;
    const unread = convos.filter(c => c.unread).length;
    const replied = total - unread;

    const countAllEl = document.getElementById('countMsgAll');
    const countUnreadEl = document.getElementById('countMsgUnread');
    const countRepliedEl = document.getElementById('countMsgReplied');
    const badgeModalEl = document.getElementById('teacherModalMsgCount');
    const navBadgeEl = document.getElementById('teacher-unread-badge');

    if (countAllEl) countAllEl.textContent = total;
    if (countUnreadEl) countUnreadEl.textContent = unread;
    if (countRepliedEl) countRepliedEl.textContent = replied;
    if (badgeModalEl) badgeModalEl.textContent = total;

    if (navBadgeEl) {
        navBadgeEl.textContent = unread;
        navBadgeEl.style.display = unread > 0 ? 'inline-block' : 'none';
    }
}

function groupTeacherMessagesIntoConversations() {
    const convoMap = {};

    (currentTeacherMessages || []).forEach(m => {
        const cleanPhone = (m.parentPhone || '').trim();
        const pName = (m.parentName || "Parent d'élève").trim();
        const sName = (m.studentName || '').trim();
        const convoKey = cleanPhone ? cleanPhone : `${pName}_${sName}`;

        if (!convoMap[convoKey]) {
            convoMap[convoKey] = {
                key: convoKey,
                parentName: pName,
                parentPhone: cleanPhone,
                studentName: sName,
                studentClass: m.studentClass || '',
                messages: [],
                lastTimestamp: new Date(m.createdAt || m.date || 0).getTime(),
                lastText: m.message || m.content || '',
                unread: false,
                unreadCount: 0
            };
        }

        convoMap[convoKey].messages.push(m);
        if (m.studentName && !convoMap[convoKey].studentName) convoMap[convoKey].studentName = m.studentName;
        if (m.studentClass && !convoMap[convoKey].studentClass) convoMap[convoKey].studentClass = m.studentClass;
        if (m.parentPhone && !convoMap[convoKey].parentPhone) convoMap[convoKey].parentPhone = m.parentPhone;

        const mTime = new Date(m.createdAt || m.date || 0).getTime();
        if (mTime >= convoMap[convoKey].lastTimestamp) {
            convoMap[convoKey].lastTimestamp = mTime;
            convoMap[convoKey].lastText = m.message || m.content || '';
        }

        const hasReplies = (m.replies && m.replies.length > 0) || m.status === 'replied';
        if (!hasReplies || m.read === false) {
            convoMap[convoKey].unread = true;
            convoMap[convoKey].unreadCount++;
        }

        // Vérifier les réponses les plus récentes
        if (m.replies && Array.isArray(m.replies)) {
            m.replies.forEach(r => {
                const rTime = new Date(r.createdAt || 0).getTime();
                if (rTime >= convoMap[convoKey].lastTimestamp) {
                    convoMap[convoKey].lastTimestamp = rTime;
                    convoMap[convoKey].lastText = (r.type === 'parent' ? 'Parent: ' : 'Vous: ') + (r.replyText || r.text || '');
                }
            });
        }
    });

    return Object.values(convoMap).sort((a, b) => b.lastTimestamp - a.lastTimestamp);
}

function filterTeacherMessages(filterType) {
    currentTeacherMsgFilter = filterType;
    const btnAll = document.getElementById('btnFilterMsgAll');
    const btnUnread = document.getElementById('btnFilterMsgUnread');
    const btnReplied = document.getElementById('btnFilterMsgReplied');

    const activeStyle = "flex:1; padding:5px 4px; font-size:0.78rem; background:#2563EB; color:white; border:none; border-radius:6px; font-weight:700; cursor:pointer;";
    const inactiveStyle = "flex:1; padding:5px 4px; font-size:0.78rem; background:white; color:#475569; border:1px solid #CBD5E1; border-radius:6px; font-weight:700; cursor:pointer;";

    if (btnAll) btnAll.style.cssText = filterType === 'all' ? activeStyle : inactiveStyle;
    if (btnUnread) btnUnread.style.cssText = filterType === 'unread' ? activeStyle : inactiveStyle;
    if (btnReplied) btnReplied.style.cssText = filterType === 'replied' ? activeStyle : inactiveStyle;

    renderTeacherConversationsList(false);
}

function filterTeacherConversationsByText() {
    renderTeacherConversationsList(false);
}

function renderTeacherConversationsList(isSilent = false) {
    const container = document.getElementById('teacherConversationsList');
    if (!container) return;

    let convos = groupTeacherMessagesIntoConversations();

    // Filtre par statut
    if (currentTeacherMsgFilter === 'unread') {
        convos = convos.filter(c => c.unread);
    } else if (currentTeacherMsgFilter === 'replied') {
        convos = convos.filter(c => !c.unread);
    }

    // Filtre par recherche textuelle
    const searchVal = (document.getElementById('teacherConvoSearchInput')?.value || '').trim().toLowerCase();
    if (searchVal) {
        convos = convos.filter(c => 
            c.parentName.toLowerCase().includes(searchVal) ||
            c.studentName.toLowerCase().includes(searchVal) ||
            c.studentClass.toLowerCase().includes(searchVal) ||
            c.parentPhone.includes(searchVal)
        );
    }

    if (convos.length === 0) {
        if (!isSilent) {
            container.innerHTML = `
                <div style="text-align:center; padding:35px 15px; color:#94A3B8; background:#F8FAFC; border-radius:12px; border:1px dashed #CBD5E1; margin:6px;">
                    <i class="fas fa-inbox fa-2x" style="color:#CBD5E1; margin-bottom:10px;"></i>
                    <p style="font-size:0.92rem; font-weight:700; margin:0 0 4px 0; color:#64748B;">Aucune discussion</p>
                    <span style="font-size:0.78rem;">${currentTeacherMsgFilter === 'unread' ? 'Tous les messages reçus ont été traités !' : 'Aucun message de parent trouvé.'}</span>
                </div>
            `;
        }
        return;
    }

    let html = '';
    convos.forEach(c => {
        const isActive = (activeTeacherChatConvoKey === c.key);
        const pInitial = c.parentName ? c.parentName.charAt(0).toUpperCase() : 'P';
        let snippet = c.lastText || 'Pas de message';
        if (snippet.length > 40) snippet = snippet.substring(0, 40) + '...';
        const dateStr = c.lastTimestamp ? new Date(c.lastTimestamp).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '';

        html += `
            <div onclick="selectTeacherConversation('${escapeHtml(c.key)}')" style="cursor:pointer; padding:10px 12px; border-radius:10px; display:flex; gap:10px; align-items:center; transition:all 0.15s ease; ${isActive ? 'background:#EFF6FF; border:1.5px solid #3B82F6;' : 'background:white; border:1px solid #E2E8F0;'}">
                <div style="width:40px; height:40px; border-radius:50%; background:${isActive ? '#2563EB' : '#F1F5F9'}; color:${isActive ? 'white' : '#1E40AF'}; display:flex; align-items:center; justify-content:center; font-weight:800; font-size:1rem; flex-shrink:0;">
                    ${escapeHtml(pInitial)}
                </div>
                <div style="flex:1; min-width:0;">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:2px;">
                        <span style="font-weight:700; font-size:0.88rem; color:#1E293B; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
                            ${escapeHtml(c.parentName)}
                        </span>
                        <span style="font-size:0.72rem; color:#94A3B8; flex-shrink:0; margin-left:4px;">${dateStr}</span>
                    </div>
                    ${c.studentName ? `
                        <div style="font-size:0.74rem; color:#2563EB; font-weight:600; margin-bottom:2px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
                            Élève : ${escapeHtml(c.studentName)} ${c.studentClass ? `(${escapeHtml(c.studentClass)})` : ''}
                        </div>
                    ` : ''}
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <span style="font-size:0.78rem; color:${c.unread ? '#1E293B' : '#64748B'}; font-weight:${c.unread ? '700' : '400'}; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; flex:1;">
                            ${escapeHtml(snippet)}
                        </span>
                        ${c.unread ? `
                            <span style="background:#EF4444; color:white; border-radius:10px; font-size:0.7rem; font-weight:800; padding:1px 6px; margin-left:6px; flex-shrink:0;">
                                ${c.unreadCount || 1}
                            </span>
                        ` : ''}
                    </div>
                </div>
            </div>
        `;
    });

    container.innerHTML = html;
}

async function selectTeacherConversation(convoKey) {
    activeTeacherChatConvoKey = convoKey;

    const convos = groupTeacherMessagesIntoConversations();
    const convo = convos.find(c => c.key === convoKey);
    if (!convo) return;

    // Mise à jour de l'en-tête du volet droit
    const parentNameEl = document.getElementById('teacherActiveParentName');
    const studentSubEl = document.getElementById('teacherActiveStudentSub');
    const contactActionsEl = document.getElementById('teacherActiveContactActions');
    const quickBar = document.getElementById('teacherQuickRepliesBar');
    const inputBar = document.getElementById('teacherChatInputBar');

    if (parentNameEl) parentNameEl.textContent = convo.parentName || "Parent d'élève";
    if (studentSubEl) {
        let subText = '';
        if (convo.studentName) subText += `Élève : ${convo.studentName} `;
        if (convo.studentClass) subText += `• Classe : ${convo.studentClass} `;
        if (convo.parentPhone) subText += `• Tél : ${convo.parentPhone}`;
        studentSubEl.textContent = subText || "Parent d'élève";
    }

    if (contactActionsEl) {
        contactActionsEl.style.display = 'flex';
        let actionsHtml = '';
        if (convo.parentPhone) {
            const cleanDigits = convo.parentPhone.replace(/[^0-9]/g, '');
            actionsHtml += `
                <a href="https://wa.me/${cleanDigits}" target="_blank" rel="noopener noreferrer" class="pro-button" style="padding:6px 12px; font-size:0.8rem; background:#22C55E; color:white; border-radius:8px; text-decoration:none; font-weight:700; display:inline-flex; align-items:center; gap:5px;" title="Discuter sur WhatsApp">
                    <i class="fab fa-whatsapp"></i> WhatsApp
                </a>
                <a href="tel:${convo.parentPhone}" class="pro-button" style="padding:6px 10px; font-size:0.8rem; background:white; color:#0284C7; border:1px solid #BAE6FD; border-radius:8px; text-decoration:none; font-weight:700; display:inline-flex; align-items:center; gap:5px;" title="Appeler">
                    <i class="fas fa-phone-alt"></i>
                </a>
            `;
        }
        contactActionsEl.innerHTML = actionsHtml;
    }

    if (quickBar) quickBar.style.display = 'flex';
    if (inputBar) inputBar.style.display = 'flex';

    renderActiveTeacherChatMessages(convoKey, false);
    renderTeacherConversationsList(true);

    const input = document.getElementById('teacherChatInputText');
    if (input) input.focus();

    // Marquer les messages de cette conversation comme lus côté serveur
    try {
        const teacherName = (typeof loggedInUser !== 'undefined' && loggedInUser && !isUserAdminOrSupervisor(loggedInUser, currentUserRole)) ? loggedInUser : 'all';
        const section = (typeof currentSection !== 'undefined' && currentSection) ? currentSection : 'garcons';
        convo.messages.forEach(m => {
            if (m.read === false) {
                fetch('/api/mark-messages-read', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ messageId: m.id || m._id, teacherName, section })
                }).catch(() => {});
                m.read = true;
            }
        });
        updateTeacherCounters();
    } catch (e) {}
}

function renderActiveTeacherChatMessages(convoKey, isSilent = false) {
    const chatContainer = document.getElementById('teacherActiveChatMessages');
    if (!chatContainer) return;

    const convos = groupTeacherMessagesIntoConversations();
    const convo = convos.find(c => c.key === convoKey);
    if (!convo) return;

    // Agréger tous les événements de messages et réponses dans un ordre chronologique
    const chatEvents = [];
    convo.messages.forEach(m => {
        chatEvents.push({
            id: m.id || m._id,
            from: 'parent',
            text: m.message || m.content || '',
            date: m.createdAt || m.date,
            parentName: m.parentName,
            studentName: m.studentName,
            studentClass: m.studentClass
        });

        if (m.replies && Array.isArray(m.replies)) {
            m.replies.forEach(r => {
                chatEvents.push({
                    id: r.id || r._id,
                    from: r.type || (r.from === 'parent' ? 'parent' : 'teacher'),
                    teacherName: r.teacherName || loggedInUser || 'Enseignant',
                    parentName: r.parentName || convo.parentName,
                    text: r.replyText || r.text || '',
                    date: r.createdAt
                });
            });
        }
    });

    chatEvents.sort((a, b) => new Date(a.date || 0) - new Date(b.date || 0));

    if (chatEvents.length === 0) {
        if (!isSilent) {
            chatContainer.innerHTML = `
                <div style="text-align:center; padding:40px 20px; color:#94A3B8; margin:auto;">
                    <i class="fas fa-comments fa-3x" style="color:#CBD5E1; margin-bottom:12px;"></i>
                    <p style="font-weight:700; color:#64748B;">Début de la discussion avec ${escapeHtml(convo.parentName)}</p>
                    <span style="font-size:0.85rem;">Tapez votre réponse ou message ci-dessous.</span>
                </div>
            `;
        }
        return;
    }

    let html = '';
    let lastDateHeader = '';

    chatEvents.forEach(ev => {
        const evDate = ev.date ? new Date(ev.date) : new Date();
        const dateDay = evDate.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
        const timeStr = evDate.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

        if (dateDay !== lastDateHeader) {
            lastDateHeader = dateDay;
            html += `
                <div style="text-align:center; margin:12px 0 8px 0;">
                    <span style="background:#E2E8F0; color:#475569; font-size:0.72rem; font-weight:700; padding:2px 10px; border-radius:10px;">
                        ${dateDay}
                    </span>
                </div>
            `;
        }

        if (ev.from === 'teacher') {
            // Bulle Enseignant (droite, bleu moderne)
            html += `
                <div style="display:flex; justify-content:flex-end; margin-bottom:8px;">
                    <div style="max-width:75%; background:linear-gradient(135deg, #2563EB, #1D4ED8); color:white; padding:10px 14px; border-radius:16px 16px 4px 16px; box-shadow:0 2px 8px rgba(37,99,235,0.25);">
                        <div style="font-size:0.72rem; opacity:0.85; margin-bottom:3px; font-weight:600; display:flex; align-items:center; gap:4px;">
                            <i class="fas fa-chalkboard-teacher"></i> <span>Vous (${escapeHtml(ev.teacherName || 'Enseignant')})</span>
                        </div>
                        <div style="white-space:pre-wrap; line-height:1.45; font-size:0.92rem;">${escapeHtml(ev.text)}</div>
                        <div style="color:rgba(255,255,255,0.8); font-size:0.68rem; text-align:right; margin-top:4px;">${timeStr} <i class="fas fa-check" style="font-size:0.65rem; margin-left:2px;"></i></div>
                    </div>
                </div>
            `;
        } else {
            // Bulle Parent (gauche, blanc/bleuté)
            html += `
                <div style="display:flex; justify-content:flex-start; margin-bottom:8px;">
                    <div style="max-width:75%; background:#FFFFFF; border:1.5px solid #E2E8F0; color:#1E293B; padding:10px 14px; border-radius:16px 16px 16px 4px; box-shadow:0 2px 6px rgba(0,0,0,0.04);">
                        <div style="font-size:0.74rem; color:#2563EB; font-weight:700; margin-bottom:3px; display:flex; align-items:center; gap:5px;">
                            <i class="fas fa-user-circle"></i> <span>${escapeHtml(ev.parentName || convo.parentName || "Parent d'élève")}</span>
                            ${(ev.studentName || convo.studentName) ? `<span style="background:#EFF6FF; color:#1D4ED8; font-size:0.7rem; padding:1px 6px; border-radius:8px; margin-left:4px;">Élève : ${escapeHtml(ev.studentName || convo.studentName)}</span>` : ''}
                        </div>
                        <div style="white-space:pre-wrap; line-height:1.45; font-size:0.92rem;">${escapeHtml(ev.text)}</div>
                        <div style="color:#94A3B8; font-size:0.68rem; margin-top:4px;">${timeStr}</div>
                    </div>
                </div>
            `;
        }
    });

    chatContainer.innerHTML = html;
    if (!isSilent) {
        chatContainer.scrollTop = chatContainer.scrollHeight;
    }
}

function insertTeacherQuickReply(text) {
    const input = document.getElementById('teacherChatInputText');
    if (input) {
        input.value = text;
        input.focus();
    }
}

function handleTeacherChatKey(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendTeacherActiveChatMessage();
    }
}

async function sendTeacherActiveChatMessage() {
    const input = document.getElementById('teacherChatInputText');
    const btn = document.getElementById('btnSendTeacherChat');
    if (!input || !activeTeacherChatConvoKey) return;

    const text = input.value.trim();
    if (!text) return;

    const convos = groupTeacherMessagesIntoConversations();
    const convo = convos.find(c => c.key === activeTeacherChatConvoKey);
    if (!convo || convo.messages.length === 0) return;

    const latestMsg = convo.messages[convo.messages.length - 1];
    const messageId = String(latestMsg.id || latestMsg._id);

    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    }

    try {
        const teacherName = (typeof loggedInUser !== 'undefined' && loggedInUser) ? loggedInUser : 'Enseignant';
        const section = (typeof currentSection !== 'undefined' && currentSection) ? currentSection : 'garcons';

        const res = await fetch('/api/send-reply', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                messageId: messageId,
                replyText: text,
                teacherName: teacherName,
                parentPhone: convo.parentPhone,
                section: section
            })
        });

        if (res.ok) {
            input.value = '';
            // Ajouter localement
            if (!latestMsg.replies) latestMsg.replies = [];
            latestMsg.replies.push({
                replyText: text,
                teacherName: teacherName,
                type: 'teacher',
                createdAt: new Date().toISOString()
            });
            latestMsg.status = 'replied';

            renderActiveTeacherChatMessages(activeTeacherChatConvoKey, false);
            updateTeacherCounters();
            renderTeacherConversationsList(true);
        } else {
            const err = await res.json();
            alert(`Erreur d'envoi : ${err.message || 'Impossible d\'enregistrer la réponse'}`);
        }
    } catch (e) {
        console.error('Erreur sendTeacherActiveChatMessage:', e);
        alert('Erreur réseau lors de l\'envoi.');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-paper-plane"></i>';
        }
    }
}

// --------------------------------------------------------------------------
// MODAL NOUVEAU MESSAGE D'UN ENSEIGNANT À UN PARENT
// --------------------------------------------------------------------------

function openTeacherNewMessageModal(prefillData = null) {
    const modal = document.getElementById('teacherNewMessageModal');
    if (!modal) return;

    // Remplir les classes
    const classSelect = document.getElementById('teacherNewMsgClassSelect');
    if (classSelect) {
        let classes = [];
        if (typeof availableClasses !== 'undefined' && Array.isArray(availableClasses)) {
            classes = [...availableClasses];
        } else {
            classes = ['PEI1', 'PEI2', 'PEI3', 'PEI4', 'PEI5'];
        }
        classSelect.innerHTML = '<option value="">-- Choisir une classe --</option>' +
            classes.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
    }

    // Réinitialiser les champs
    document.getElementById('teacherNewMsgStudentSelect').innerHTML = '<option value="">-- Sélectionnez d\'abord une classe --</option>';
    document.getElementById('teacherNewMsgParentName').value = '';
    document.getElementById('teacherNewMsgParentPhone').value = '';
    document.getElementById('teacherNewMsgText').value = '';

    if (prefillData) {
        if (prefillData.studentClass && classSelect) {
            classSelect.value = prefillData.studentClass;
            onTeacherNewMsgClassChanged(prefillData.studentName);
        }
        if (prefillData.parentName) {
            document.getElementById('teacherNewMsgParentName').value = prefillData.parentName;
        }
        if (prefillData.parentPhone) {
            document.getElementById('teacherNewMsgParentPhone').value = prefillData.parentPhone;
        }
        if (prefillData.message) {
            document.getElementById('teacherNewMsgText').value = prefillData.message;
        }
    }

    modal.style.display = 'block';
}

function closeTeacherNewMessageModal() {
    const modal = document.getElementById('teacherNewMessageModal');
    if (modal) modal.style.display = 'none';
}

async function onTeacherNewMsgClassChanged(autoSelectStudent = null) {
    const classVal = document.getElementById('teacherNewMsgClassSelect')?.value;
    const studentSelect = document.getElementById('teacherNewMsgStudentSelect');
    if (!studentSelect) return;

    if (!classVal) {
        studentSelect.innerHTML = '<option value="">-- Sélectionnez d\'abord une classe --</option>';
        return;
    }

    studentSelect.innerHTML = '<option value="">Chargement des élèves...</option>';

    try {
        const res = await fetch(`/api/students?classe=${encodeURIComponent(classVal)}`);
        if (!res.ok) throw new Error('Erreur API élèves');
        const students = await res.json();

        window.currentTeacherNewMsgStudents = students;

        studentSelect.innerHTML = '<option value="">-- Choisir un élève --</option>' +
            students.map(s => `<option value="${escapeHtml(s.name)}" data-parent-name="${escapeHtml(s.parentName || '')}" data-parent-phone="${escapeHtml(s.parentPhone || '')}">${escapeHtml(s.name)}</option>`).join('');

        if (autoSelectStudent) {
            studentSelect.value = autoSelectStudent;
            onTeacherNewMsgStudentChanged();
        }
    } catch (e) {
        studentSelect.innerHTML = '<option value="">Erreur chargement élèves</option>';
    }
}

function onTeacherNewMsgStudentChanged() {
    const select = document.getElementById('teacherNewMsgStudentSelect');
    if (!select) return;
    const selectedOption = select.options[select.selectedIndex];
    if (selectedOption) {
        const pName = selectedOption.getAttribute('data-parent-name') || '';
        const pPhone = selectedOption.getAttribute('data-parent-phone') || '';
        if (pName) document.getElementById('teacherNewMsgParentName').value = pName;
        if (pPhone) document.getElementById('teacherNewMsgParentPhone').value = pPhone;
    }
}

async function submitTeacherNewMessage() {
    const classVal = document.getElementById('teacherNewMsgClassSelect')?.value;
    const studentVal = document.getElementById('teacherNewMsgStudentSelect')?.value;
    const parentName = document.getElementById('teacherNewMsgParentName')?.value;
    const parentPhone = document.getElementById('teacherNewMsgParentPhone')?.value;
    const text = document.getElementById('teacherNewMsgText')?.value;
    const btn = document.getElementById('btnSubmitTeacherNewMsg');

    if (!text || !text.trim()) {
        alert("Veuillez rédiger votre message.");
        return;
    }

    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Envoi...';
    }

    try {
        const teacherName = (typeof loggedInUser !== 'undefined' && loggedInUser && !isUserAdminOrSupervisor(loggedInUser, currentUserRole)) ? loggedInUser : 'Enseignant';
        const section = (typeof currentSection !== 'undefined' && currentSection) ? currentSection : 'garcons';

        const res = await fetch('/api/teacher-send-message', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                teacherName: teacherName,
                parentName: parentName || (studentVal ? `Parent de ${studentVal}` : "Parent d'élève"),
                parentPhone: parentPhone || '',
                studentName: studentVal || '',
                studentClass: classVal || '',
                message: text.trim(),
                section: section
            })
        });

        if (res.ok) {
            const data = await res.json();
            closeTeacherNewMessageModal();
            displayAlert('✅ Message envoyé au parent avec succès.', false, 3000);
            
            // Ouvrir ou rafraîchir la boîte de messages
            await loadTeacherMessages();
            const cleanPhone = (parentPhone || '').trim();
            const convoKey = cleanPhone ? cleanPhone : `${(parentName || '').trim()}_${(studentVal || '').trim()}`;
            selectTeacherConversation(convoKey);
        } else {
            const err = await res.json();
            alert(`Erreur : ${err.error || 'Impossible d\'envoyer le message'}`);
        }
    } catch (e) {
        console.error('Erreur submitTeacherNewMessage:', e);
        alert("Erreur de connexion lors de l'envoi du message.");
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-paper-plane"></i> Envoyer au parent';
        }
    }
}

// --------------------------------------------------------------------------
// LIEN DIRECT : DEPUIS L'ÉVALUATION DES DEVOIRS VERS LE CONTACT DU PARENT
// --------------------------------------------------------------------------
function contactParentFromEval(studentName, parentPhone, studentClass, subject, homeworkDate) {
    const prefilledText = `Bonjour, je vous informe que votre enfant ${studentName} n'a pas fait son devoir de ${subject || 'cours'} prévu pour le ${homeworkDate || 'ce jour'}. Merci de bien vouloir vérifier avec lui.`;
    openTeacherNewMessageModal({
        studentName: studentName,
        studentClass: studentClass,
        parentPhone: parentPhone,
        parentName: `Parent de ${studentName}`,
        message: prefilledText
    });
}

// ============================================================================
// NOTIFICATIONS EN ROUGE ("1" ROUGE POUR LES ENSEIGNANTS ET POUR LES PARENTS)
// ============================================================================

async function checkTeacherUnreadMessagesNotification() {
    try {
        const isConnected = (typeof loggedInUser !== 'undefined' && loggedInUser);
        const headerBtn = document.getElementById('teacherHeaderMsgBtn');
        const headerBadge = document.getElementById('teacherHeaderMsgBadge');
        const teacherViewBadge = document.getElementById('teacher-unread-badge');

        if (!isConnected) {
            if (headerBtn) headerBtn.style.display = 'none';
            if (headerBadge) headerBadge.style.display = 'none';
            if (teacherViewBadge) teacherViewBadge.style.display = 'none';
            return;
        }

        if (headerBtn) headerBtn.style.display = 'inline-flex';

        const teacherName = (typeof isUserAdminOrSupervisor === 'function' && isUserAdminOrSupervisor(loggedInUser, currentUserRole)) ? 'all' : loggedInUser;
        const section = (typeof currentSection !== 'undefined' && currentSection) ? currentSection : 'garcons';
        
        const res = await fetch(`/api/unread-count?teacherName=${encodeURIComponent(teacherName)}&section=${encodeURIComponent(section)}`);
        if (!res.ok) return;
        const data = await res.json();
        const unreadCount = data.count || 0;

        if (unreadCount > 0) {
            if (headerBadge) {
                headerBadge.textContent = unreadCount;
                headerBadge.style.display = 'inline-flex';
            }
            if (teacherViewBadge) {
                teacherViewBadge.textContent = unreadCount;
                teacherViewBadge.style.display = 'inline-flex';
            }
        } else {
            if (headerBadge) headerBadge.style.display = 'none';
            if (teacherViewBadge) teacherViewBadge.style.display = 'none';
        }
    } catch (e) {
        console.warn('checkTeacherUnreadMessagesNotification:', e);
    }
}

async function checkParentUnreadMessagesNotification() {
    try {
        const phone = localStorage.getItem('parentSenderPhone') || (typeof activeParentAccount !== 'undefined' && activeParentAccount ? activeParentAccount.phone : '');
        const floatingBtn = document.getElementById('parentFloatingMessengerBtn');
        const floatingBadge = document.getElementById('parentFloatingUnreadBadge');
        const modalBadge = document.getElementById('parentModalUnreadBadge');
        const uiBadges = document.querySelectorAll('.parent-unread-badge-ui');

        if (typeof isParentMode !== 'undefined' && isParentMode) {
            if (floatingBtn) floatingBtn.style.display = 'flex';
        }

        if (!phone) {
            if (floatingBadge) floatingBadge.style.display = 'none';
            if (modalBadge) modalBadge.style.display = 'none';
            uiBadges.forEach(b => b.style.display = 'none');
            return;
        }

        const res = await fetch(`/api/parent-unread-replies?phone=${encodeURIComponent(phone.trim())}`);
        if (!res.ok) return;
        const data = await res.json();
        const unreadCount = data.unreadCount || 0;

        if (unreadCount > 0) {
            if (floatingBadge) {
                floatingBadge.textContent = unreadCount;
                floatingBadge.style.display = 'inline-flex';
            }
            if (modalBadge) {
                modalBadge.textContent = unreadCount;
                modalBadge.style.display = 'inline-flex';
            }
            uiBadges.forEach(b => {
                b.textContent = unreadCount;
                b.style.display = 'inline-flex';
            });
        } else {
            if (floatingBadge) floatingBadge.style.display = 'none';
            if (modalBadge) modalBadge.style.display = 'none';
            uiBadges.forEach(b => b.style.display = 'none');
        }
    } catch (e) {
        console.warn('checkParentUnreadMessagesNotification:', e);
    }
}

setInterval(checkTeacherUnreadMessagesNotification, 20000);
setInterval(checkParentUnreadMessagesNotification, 20000);

// ============================================================================
// BOÎTE DE RÉCEPTION & DISCUSSION MESSENGER POUR LES PARENTS
// ============================================================================

let parentMessengerData = [];
let activeParentChatTeacher = null;
let parentMessengerPollTimer = null;

async function openParentMessengerModal(preselectedTeacher = null) {
    const modal = document.getElementById('parentMessengerModal');
    if (!modal) return;
    modal.style.display = 'flex';

    if (parentMessengerPollTimer) {
        clearInterval(parentMessengerPollTimer);
    }
    // Polling doux toutes les 4 secondes tant que le modal est ouvert
    parentMessengerPollTimer = setInterval(refreshParentMessengerSilently, 4000);

    const currentPhone = localStorage.getItem('parentSenderPhone') || (typeof activeParentAccount !== 'undefined' && activeParentAccount ? activeParentAccount.phone : '');
    const phoneLabel = document.getElementById('parentCurrentPhoneLabel');
    if (phoneLabel) {
        phoneLabel.textContent = currentPhone ? `📱 ${currentPhone}` : 'Non défini';
    }

    if (preselectedTeacher) {
        activeParentChatTeacher = preselectedTeacher;
    }

    try {
        await fetchGlobalTeachersPhotos();
    } catch (e) {
        console.warn('fetchGlobalTeachersPhotos error:', e);
    }

    populateNewChatTeacherSelect();
    await loadParentConversations();
    checkParentUnreadMessagesNotification();

    // Si un enseignant spécifique a été cliqué, s'assurer qu'il est sélectionné
    if (preselectedTeacher) {
        selectParentConversation(preselectedTeacher);
    }
}

function closeParentMessengerModal() {
    const modal = document.getElementById('parentMessengerModal');
    if (modal) modal.style.display = 'none';
    if (parentMessengerPollTimer) {
        clearInterval(parentMessengerPollTimer);
        parentMessengerPollTimer = null;
    }
}

function populateNewChatTeacherSelect() {
    const select = document.getElementById('newChatTeacherSelect');
    if (!select) return;

    let teachers = [];
    if (typeof teachersSectionMap !== 'undefined' && teachersSectionMap && teachersSectionMap[currentSection]) {
        teachers = [...teachersSectionMap[currentSection]];
    } else if (typeof currentSection !== 'undefined' && currentSection && typeof teachersBySection !== 'undefined' && teachersBySection[currentSection]) {
        teachers = [...teachersBySection[currentSection]];
    } else if (typeof femaleTeachersList !== 'undefined' && typeof maleTeachersList !== 'undefined') {
        teachers = [...maleTeachersList, ...femaleTeachersList];
    } else if (typeof allTeachers !== 'undefined' && Array.isArray(allTeachers)) {
        teachers = [...allTeachers];
    } else {
        teachers = ['Bensaad', 'Salim', 'Rida', 'Houcine', 'Amine', 'Kamel', 'Yassine', 'Adel'];
    }

    const uniqueTeachers = Array.from(new Set(teachers.filter(Boolean))).sort((a, b) => a.localeCompare(b, 'fr'));
    select.innerHTML = '<option value="">-- Choisir un enseignant --</option>' + 
        uniqueTeachers.map(t => `<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`).join('');
}

function showNewChatPicker() {
    const box = document.getElementById('newChatPickerBox') || document.getElementById('newChatPicker');
    if (box) {
        box.style.display = 'block';
        populateNewChatTeacherSelect();
    }
}

function hideNewChatPicker() {
    const box = document.getElementById('newChatPickerBox') || document.getElementById('newChatPicker');
    if (box) box.style.display = 'none';
}

function toggleNewChatPicker() {
    const box = document.getElementById('newChatPickerBox') || document.getElementById('newChatPicker');
    if (!box) return;
    box.style.display = box.style.display === 'none' ? 'block' : 'none';
    if (box.style.display === 'block') {
        populateNewChatTeacherSelect();
    }
}

function startNewChatWithSelectedTeacher() {
    const select = document.getElementById('newChatTeacherSelect');
    if (!select || !select.value) {
        alert("Veuillez sélectionner un enseignant dans la liste.");
        return;
    }
    const chosenTeacher = select.value;
    hideNewChatPicker();
    selectParentConversation(chosenTeacher);
}

function promptChangeParentPhone() {
    const current = localStorage.getItem('parentSenderPhone') || '';
    const newPhone = prompt("Entrez votre numéro de téléphone (utilisé pour retrouver vos messages et réponses de l'école) :", current);
    if (newPhone !== null && newPhone.trim() !== '') {
        const cleaned = newPhone.trim();
        localStorage.setItem('parentSenderPhone', cleaned);
        const phoneLabel = document.getElementById('parentCurrentPhoneLabel');
        if (phoneLabel) phoneLabel.textContent = `📱 ${cleaned}`;
        loadParentConversations();
        checkParentUnreadMessagesNotification();
    }
}

function saveParentMessengerPhoneManual() {
    const input = document.getElementById('manualParentPhoneInput');
    if (!input || !input.value.trim()) {
        alert("Veuillez saisir votre numéro de téléphone.");
        return;
    }
    const cleaned = input.value.trim();
    localStorage.setItem('parentSenderPhone', cleaned);
    const phoneLabel = document.getElementById('parentCurrentPhoneLabel');
    if (phoneLabel) phoneLabel.textContent = `📱 ${cleaned}`;
    loadParentConversations();
    checkParentUnreadMessagesNotification();
}

function refreshCurrentConversation() {
    loadParentConversations();
}

async function refreshParentMessengerSilently() {
    const phone = localStorage.getItem('parentSenderPhone') || (typeof activeParentAccount !== 'undefined' && activeParentAccount ? activeParentAccount.phone : '');
    const parentName = localStorage.getItem('parentSenderName') || (typeof activeParentAccount !== 'undefined' && activeParentAccount ? `${activeParentAccount.firstName} ${activeParentAccount.lastName}` : '');
    if (!phone && !parentName) return;

    try {
        const queryParams = new URLSearchParams();
        if (phone) queryParams.append('phone', phone);
        if (parentName) queryParams.append('name', parentName);

        const res = await fetch(`/api/parent-messages?${queryParams.toString()}`);
        if (!res.ok) return;
        const raw = await res.json();
        const messages = Array.isArray(raw) ? raw : (Array.isArray(raw.messages) ? raw.messages : (Array.isArray(raw.data) ? raw.data : []));

        // Vérifier s'il y a de nouveaux messages ou réponses
        const prevCount = parentMessengerData.length;
        parentMessengerData = messages;

        // Regrouper par enseignant
        const convoMap = {};
        messages.forEach(m => {
            const tName = m.teacherName || 'Enseignant';
            if (!convoMap[tName]) {
                convoMap[tName] = {
                    teacherName: tName,
                    messages: [],
                    unreadRepliesCount: 0,
                    lastTimestamp: new Date(m.createdAt || 0).getTime()
                };
            }
            convoMap[tName].messages.push(m);

            if (m.replies && Array.isArray(m.replies)) {
                m.replies.forEach(r => {
                    const rTime = new Date(r.createdAt || 0).getTime();
                    if (rTime > convoMap[tName].lastTimestamp) {
                        convoMap[tName].lastTimestamp = rTime;
                    }
                    if (r.readByParent !== true && r.type !== 'parent') {
                        convoMap[tName].unreadRepliesCount++;
                    }
                });
            }
        });

        const convos = Object.values(convoMap).sort((a, b) => b.lastTimestamp - a.lastTimestamp);
        
        // Mettre à jour la liste sans perte de sélection
        renderParentConversationsList(convos, true);

        // Si une conversation est active, rafraîchir son contenu si nouveau message
        if (activeParentChatTeacher) {
            renderChatMessagesForTeacher(activeParentChatTeacher, true);
        }
    } catch (e) {
        // En mode silencieux, ignorer les erreurs réseau temporaires
    }
}

async function loadParentConversations() {
    const listEl = document.getElementById('messengerConversationsList');
    const phone = localStorage.getItem('parentSenderPhone') || (typeof activeParentAccount !== 'undefined' && activeParentAccount ? activeParentAccount.phone : '');
    const parentName = localStorage.getItem('parentSenderName') || (typeof activeParentAccount !== 'undefined' && activeParentAccount ? `${activeParentAccount.firstName} ${activeParentAccount.lastName}` : '');

    if (!listEl) return;

    if (!phone && !parentName) {
        listEl.innerHTML = `
            <div style="padding:22px 16px; text-align:center;">
                <div style="width:46px; height:46px; border-radius:50%; background:#EFF6FF; color:#2563EB; display:inline-flex; align-items:center; justify-content:center; font-size:1.3rem; margin-bottom:12px;">
                    <i class="fas fa-phone-alt"></i>
                </div>
                <h5 style="margin:0 0 6px 0; font-size:0.95rem; color:#1E293B; font-weight:700;">Numéro de téléphone requis</h5>
                <p style="font-size:0.8rem; color:#64748B; margin:0 0 14px 0; line-height:1.4;">
                    Veuillez renseigner votre numéro de téléphone pour afficher vos échanges avec les enseignants :
                </p>
                <div style="display:flex; flex-direction:column; gap:8px;">
                    <input type="tel" id="manualParentPhoneInput" placeholder="Ex: 0550123456" style="padding:9px 12px; border:1.5px solid #CBD5E1; border-radius:8px; font-size:0.88rem; width:100%; box-sizing:border-box; text-align:center; font-weight:600;" />
                    <button type="button" class="pro-button primary-button" onclick="saveParentMessengerPhoneManual()" style="padding:9px 14px; font-size:0.85rem; font-weight:700; border-radius:8px;">
                        <i class="fas fa-check"></i> Enregistrer &amp; Voir mes messages
                    </button>
                </div>
            </div>
        `;
        return;
    }

    listEl.innerHTML = `
        <div style="text-align:center; padding:30px; color:#64748B;">
            <i class="fas fa-spinner fa-spin fa-2x" style="color:#2563EB; margin-bottom:8px;"></i>
            <p style="font-size:0.85rem;">Chargement des discussions...</p>
        </div>
    `;

    try {
        const queryParams = new URLSearchParams();
        if (phone) queryParams.append('phone', phone);
        if (parentName) queryParams.append('name', parentName);

        const res = await fetch(`/api/parent-messages?${queryParams.toString()}`);
        if (!res.ok) throw new Error(`Erreur ${res.status}`);
        const raw = await res.json();
        const messages = Array.isArray(raw) ? raw : (Array.isArray(raw.messages) ? raw.messages : (Array.isArray(raw.data) ? raw.data : []));
        parentMessengerData = messages;

        // Regrouper par enseignant
        const convoMap = {};
        messages.forEach(m => {
            const tName = m.teacherName || 'Enseignant';
            if (!convoMap[tName]) {
                convoMap[tName] = {
                    teacherName: tName,
                    messages: [],
                    unreadRepliesCount: 0,
                    lastTimestamp: new Date(m.createdAt || 0).getTime()
                };
            }
            convoMap[tName].messages.push(m);

            if (m.replies && Array.isArray(m.replies)) {
                m.replies.forEach(r => {
                    const rTime = new Date(r.createdAt || 0).getTime();
                    if (rTime > convoMap[tName].lastTimestamp) {
                        convoMap[tName].lastTimestamp = rTime;
                    }
                    if (r.readByParent !== true && r.type !== 'parent') {
                        convoMap[tName].unreadRepliesCount++;
                    }
                });
            }
        });

        const convos = Object.values(convoMap).sort((a, b) => b.lastTimestamp - a.lastTimestamp);
        renderParentConversationsList(convos);

        if (activeParentChatTeacher) {
            selectParentConversation(activeParentChatTeacher);
        } else if (convos.length > 0) {
            selectParentConversation(convos[0].teacherName);
        }
    } catch (err) {
        console.error('Erreur loadParentConversations:', err);
        listEl.innerHTML = `
            <div style="padding:20px; text-align:center; color:#DC2626; font-size:0.85rem;">
                <i class="fas fa-exclamation-circle fa-2x" style="margin-bottom:8px;"></i>
                <p>Impossible de charger vos discussions.</p>
                <button type="button" class="pro-button secondary-button" onclick="loadParentConversations()" style="font-size:0.8rem; padding:6px 12px; margin-top:8px;">
                    <i class="fas fa-redo"></i> Réessayer
                </button>
            </div>
        `;
    }
}

function renderParentConversationsList(convos, isSilentUpdate = false) {
    const listEl = document.getElementById('messengerConversationsList');
    if (!listEl) return;

    if (!convos || convos.length === 0) {
        if (!isSilentUpdate) {
            listEl.innerHTML = `
                <div style="text-align:center; padding:35px 15px; color:#94A3B8;">
                    <i class="fas fa-comments fa-2x" style="color:#CBD5E1; margin-bottom:10px;"></i>
                    <p style="font-weight:700; color:#64748B; font-size:0.9rem; margin:0 0 6px 0;">Aucune discussion active</p>
                    <p style="font-size:0.78rem; margin:0 0 14px 0;">Cliquez sur <b>+ Nouveau message</b> ci-dessus pour écrire directement à un enseignant.</p>
                    <button type="button" class="pro-button primary-button" onclick="showNewChatPicker()" style="font-size:0.82rem; padding:8px 14px; border-radius:8px;">
                        <i class="fas fa-plus"></i> Nouveau message
                    </button>
                </div>
            `;
        }
        return;
    }

    let html = '';
    convos.forEach(c => {
        const isActive = activeParentChatTeacher === c.teacherName;
        let lastSnippet = 'Aucun message';
        let lastDateFormatted = '';
        
        const allEvents = [];
        c.messages.forEach(m => {
            allEvents.push({ text: m.message || m.content || '', date: m.createdAt, from: 'parent' });
            if (m.replies && Array.isArray(m.replies)) {
                m.replies.forEach(r => {
                    allEvents.push({ text: r.replyText || r.text || '', date: r.createdAt, from: r.type || 'teacher' });
                });
            }
        });
        allEvents.sort((a, b) => new Date(a.date || 0) - new Date(b.date || 0));

        if (allEvents.length > 0) {
            const lastEv = allEvents[allEvents.length - 1];
            const prefix = lastEv.from === 'parent' ? 'Vous: ' : `${escapeHtml(c.teacherName)}: `;
            lastSnippet = prefix + escapeHtml(lastEv.text);
            if (lastSnippet.length > 38) lastSnippet = lastSnippet.substring(0, 38) + '...';
            lastDateFormatted = lastEv.date ? new Date(lastEv.date).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '';
        }

        html += `
            <div class="messenger-convo-item ${isActive ? 'active' : ''}" onclick="selectParentConversation('${escapeHtml(c.teacherName)}')" id="convoItem_${escapeHtml(c.teacherName)}" style="cursor:pointer;">
                <div style="position:relative; width:46px; height:46px; border-radius:50%; flex-shrink:0; background:#EEF2FF; border:1.5px solid #CBD5E1;">
                    ${(() => {
                        const photoUrl = getTeacherDirectPhotoUrl(c.teacherName);
                        const initial = c.teacherName ? c.teacherName.charAt(0).toUpperCase() : '?';
                        if (photoUrl) {
                            return `<img src="${photoUrl}" alt="${escapeHtml(c.teacherName)}" style="width:100%; height:100%; border-radius:50%; object-fit:cover; display:block;" onerror="this.onerror=null; this.parentElement.innerHTML='<div style=\\'width:100%; height:100%; border-radius:50%; background:linear-gradient(135deg, #2563EB, #1D4ED8); color:white; display:flex; align-items:center; justify-content:center; font-weight:700; font-size:1.1rem;\\'>${escapeHtml(initial)}</div>';">`;
                        }
                        return `<div style="width:100%; height:100%; border-radius:50%; background:linear-gradient(135deg, #2563EB, #1D4ED8); color:white; display:flex; align-items:center; justify-content:center; font-weight:700; font-size:1.1rem;">${escapeHtml(initial)}</div>`;
                    })()}
                    ${c.unreadRepliesCount > 0 ? `<span class="red-notification-badge" style="position:absolute; top:-3px; right:-3px; border:2px solid white;">${c.unreadRepliesCount}</span>` : ''}
                </div>
                <div style="flex:1; min-width:0;">
                    <div style="display:flex; justify-content:space-between; align-items:baseline; margin-bottom:3px;">
                        <span style="font-weight:700; font-size:0.92rem; color:#1E293B; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
                            ${escapeHtml(c.teacherName)}
                        </span>
                        <span style="font-size:0.72rem; color:#94A3B8; flex-shrink:0; margin-left:6px;">${lastDateFormatted}</span>
                    </div>
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <p style="margin:0; font-size:0.8rem; color:${c.unreadRepliesCount > 0 ? '#1E293B' : '#64748B'}; font-weight:${c.unreadRepliesCount > 0 ? '700' : '400'}; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
                            ${lastSnippet}
                        </p>
                        ${c.unreadRepliesCount > 0 ? `<span class="red-notification-badge" style="position:static; margin-left:6px; flex-shrink:0;">${c.unreadRepliesCount}</span>` : ''}
                    </div>
                </div>
            </div>
        `;
    });

    listEl.innerHTML = html;
}

function renderChatMessagesForTeacher(teacherName, isSilent = false) {
    const chatContainer = document.getElementById('messengerChatMessages');
    if (!chatContainer) return;

    const relevantMsgs = (parentMessengerData || []).filter(m => (m.teacherName || '').toLowerCase() === teacherName.toLowerCase());

    const chatEvents = [];
    relevantMsgs.forEach(m => {
        chatEvents.push({
            id: m.id || m._id,
            from: 'parent',
            text: m.message || m.content || '',
            date: m.createdAt || m.date,
            parentName: m.parentName,
            studentName: m.studentName,
            studentClass: m.studentClass,
            isInitial: true
        });

        if (m.replies && Array.isArray(m.replies)) {
            m.replies.forEach(r => {
                chatEvents.push({
                    id: r.id || r._id,
                    messageId: m.id || m._id,
                    from: r.type || r.from || 'teacher',
                    teacherName: r.teacherName || teacherName,
                    text: r.replyText || r.text || '',
                    date: r.createdAt,
                    readByParent: r.readByParent
                });
            });
        }
    });

    chatEvents.sort((a, b) => new Date(a.date || 0) - new Date(b.date || 0));

    if (chatEvents.length === 0) {
        if (!isSilent) {
            chatContainer.innerHTML = `
                <div style="text-align:center; padding:40px 20px; color:#94A3B8; margin:auto;">
                    <div style="width:60px; height:60px; border-radius:50%; background:#EFF6FF; color:#2563EB; display:inline-flex; align-items:center; justify-content:center; font-size:1.8rem; margin-bottom:14px; box-shadow:0 4px 12px rgba(37,99,235,0.15);">
                        <i class="fab fa-facebook-messenger"></i>
                    </div>
                    <h4 style="margin:0 0 6px 0; color:#1E293B; font-weight:800; font-size:1.05rem;">Discussion directe avec ${escapeHtml(teacherName)}</h4>
                    <p style="font-size:0.86rem; color:#64748B; margin:0 0 16px 0; max-width:380px; line-height:1.45;">
                        Posez votre question à l'enseignant concernant les devoirs, les leçons ou le suivi de votre enfant.
                    </p>
                    <div style="background:#FEF3C7; border:1px solid #FDE68A; color:#92400E; border-radius:10px; padding:8px 14px; font-size:0.8rem; display:inline-flex; align-items:center; gap:6px;">
                        <i class="fas fa-info-circle"></i> Tapez votre message ci-dessous et appuyez sur Entrée pour envoyer.
                    </div>
                </div>
            `;
        }
    } else {
        let html = '';
        let lastDateHeader = '';

        chatEvents.forEach(ev => {
            const evDate = ev.date ? new Date(ev.date) : new Date();
            const dateDay = evDate.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
            const timeStr = evDate.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

            if (dateDay !== lastDateHeader) {
                lastDateHeader = dateDay;
                html += `
                    <div style="text-align:center; margin:14px 0 10px 0;">
                        <span style="background:#E2E8F0; color:#475569; font-size:0.72rem; font-weight:700; padding:3px 10px; border-radius:10px;">
                            ${dateDay}
                        </span>
                    </div>
                `;
            }

            if (ev.from === 'parent') {
                html += `
                    <div class="messenger-row right" style="display:flex; justify-content:flex-end; margin-bottom:8px;">
                        <div class="messenger-bubble parent" style="max-width:75%; background:linear-gradient(135deg, #2563EB, #1D4ED8); color:white; padding:10px 14px; border-radius:18px 18px 4px 18px; box-shadow:0 2px 8px rgba(37,99,235,0.2);">
                            ${(ev.studentName || ev.studentClass) ? `<div style="font-size:0.72rem; opacity:0.88; margin-bottom:3px; font-weight:600;"><i class="fas fa-child"></i> Concernant : ${escapeHtml(ev.studentName || '')} ${ev.studentClass ? `(${escapeHtml(ev.studentClass)})` : ''}</div>` : ''}
                            <div style="white-space:pre-wrap; line-height:1.45; font-size:0.92rem;">${escapeHtml(ev.text)}</div>
                            <div class="messenger-time" style="color:rgba(255,255,255,0.85); font-size:0.7rem; text-align:right; margin-top:4px;">${timeStr} <i class="fas fa-check" style="font-size:0.65rem; margin-left:2px;"></i></div>
                        </div>
                    </div>
                `;
            } else {
                const replyingTeacher = ev.teacherName || teacherName;
                const bubbleTeacherPhoto = getTeacherDirectPhotoUrl(replyingTeacher);
                const bubbleTeacherInit = replyingTeacher ? replyingTeacher.charAt(0).toUpperCase() : '?';

                html += `
                    <div class="messenger-row left" style="display:flex; justify-content:flex-start; margin-bottom:8px; align-items:flex-end;">
                        <div style="width:34px; height:34px; border-radius:50%; margin-right:8px; align-self:flex-end; flex-shrink:0; overflow:hidden; border:1.5px solid #2563EB; background:#E2E8F0;">
                            ${bubbleTeacherPhoto ? `
                                <img src="${bubbleTeacherPhoto}" alt="${escapeHtml(replyingTeacher)}" style="width:100%; height:100%; object-fit:cover; display:block;" onerror="this.onerror=null; this.parentElement.innerHTML='<div style=\\'width:100%; height:100%; background:#2563EB; color:white; display:flex; align-items:center; justify-content:center; font-weight:700; font-size:0.85rem;\\'>${escapeHtml(bubbleTeacherInit)}</div>';">
                            ` : `
                                <div style="width:100%; height:100%; background:#2563EB; color:white; display:flex; align-items:center; justify-content:center; font-weight:700; font-size:0.85rem;">
                                    ${escapeHtml(bubbleTeacherInit)}
                                </div>
                            `}
                        </div>
                        <div class="messenger-bubble teacher" style="max-width:75%; background:#FFFFFF; border:1.5px solid #E2E8F0; color:#1E293B; padding:10px 14px; border-radius:18px 18px 18px 4px; box-shadow:0 2px 8px rgba(0,0,0,0.04);">
                            <div style="font-size:0.75rem; color:#2563EB; font-weight:700; margin-bottom:3px; display:flex; align-items:center; gap:5px;">
                                <i class="fas fa-chalkboard-teacher"></i> <span>${escapeHtml(replyingTeacher)}</span>
                            </div>
                            <div style="white-space:pre-wrap; line-height:1.45; font-size:0.92rem;">${escapeHtml(ev.text)}</div>
                            <div class="messenger-time" style="color:#64748B; font-size:0.7rem; margin-top:4px;">${timeStr}</div>
                        </div>
                    </div>
                `;
            }
        });

        chatContainer.innerHTML = html;
        if (!isSilent) {
            chatContainer.scrollTop = chatContainer.scrollHeight;
        }
    }
}

async function selectParentConversation(teacherName) {
    activeParentChatTeacher = teacherName;

    document.querySelectorAll('.messenger-convo-item').forEach(el => el.classList.remove('active'));
    const targetItem = document.getElementById(`convoItem_${teacherName}`);
    if (targetItem) targetItem.classList.add('active');

    const headerTitle = document.getElementById('chatTeacherName');
    const headerSub = document.getElementById('chatTeacherSub');
    const headerAvatar = document.getElementById('chatTeacherAvatar');
    const inputBar = document.getElementById('messengerInputBar');

    if (headerTitle) headerTitle.textContent = teacherName;
    if (headerSub) headerSub.textContent = "Enseignant • Messagerie directe";
    if (headerAvatar) {
        const headerPhoto = getTeacherDirectPhotoUrl(teacherName);
        const headerInit = teacherName ? teacherName.charAt(0).toUpperCase() : '?';
        if (headerPhoto) {
            headerAvatar.innerHTML = `<img src="${headerPhoto}" alt="${escapeHtml(teacherName)}" style="width:100%; height:100%; border-radius:50%; object-fit:cover; display:block;" onerror="this.onerror=null; this.parentElement.innerHTML='<span style=\\'font-weight:800; font-size:1.1rem;\\'>${escapeHtml(headerInit)}</span>';">`;
        } else {
            headerAvatar.innerHTML = `<span style="font-weight:800; font-size:1.1rem;">${escapeHtml(headerInit)}</span>`;
        }
    }
    if (inputBar) inputBar.style.display = 'flex';

    renderChatMessagesForTeacher(teacherName, false);

    const input = document.getElementById('parentChatInputText');
    if (input) input.focus();

    const phone = localStorage.getItem('parentSenderPhone') || (typeof activeParentAccount !== 'undefined' && activeParentAccount ? activeParentAccount.phone : '');
    if (phone) {
        try {
            await fetch('/api/mark-replies-read', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phone: phone.trim() })
            });
            checkParentUnreadMessagesNotification();
        } catch (e) {
            console.warn('mark-replies-read error:', e);
        }
    }
}

function handleParentChatKey(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendParentChatMessage();
    }
}

async function sendParentChatMessage() {
    const input = document.getElementById('parentChatInputText');
    const btn = document.getElementById('btnSendParentChat');
    if (!input) return;

    const text = input.value.trim();
    if (!text) return;

    if (!activeParentChatTeacher) {
        alert("Veuillez sélectionner un enseignant à qui écrire.");
        return;
    }

    let phone = localStorage.getItem('parentSenderPhone') || (typeof activeParentAccount !== 'undefined' && activeParentAccount ? activeParentAccount.phone : '');
    let parentName = localStorage.getItem('parentSenderName') || (typeof activeParentAccount !== 'undefined' && activeParentAccount ? `${activeParentAccount.firstName} ${activeParentAccount.lastName}` : '');

    if (!phone || !phone.trim()) {
        const entered = prompt("Pour envoyer votre message et recevoir la réponse de l'enseignant, veuillez renseigner votre numéro de téléphone :", "");
        if (!entered || !entered.trim()) {
            return;
        }
        phone = entered.trim();
        localStorage.setItem('parentSenderPhone', phone);
        const phoneLabel = document.getElementById('parentCurrentPhoneLabel');
        if (phoneLabel) phoneLabel.textContent = `📱 ${phone}`;
    }

    if (!parentName || !parentName.trim()) {
        parentName = currentUserLanguage === 'ar' ? 'ولي أمر' : "Parent d'élève";
    }

    // Récupérer classe et élève si sélectionnés dans le tableau de bord
    const classSelector = document.getElementById('parentClassSelector');
    const studentClass = classSelector ? classSelector.value : '';
    const studentSelect = document.getElementById('parentStudentSelect');
    const studentName = studentSelect ? studentSelect.value : '';

    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    }

    try {
        const relevantMsgs = (parentMessengerData || []).filter(m => (m.teacherName || '').toLowerCase() === activeParentChatTeacher.toLowerCase());
        
        if (relevantMsgs.length > 0) {
            const latestMsg = relevantMsgs[relevantMsgs.length - 1];
            const msgId = latestMsg.id || latestMsg._id;

            const res = await fetch('/api/parent-send-chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    messageId: msgId,
                    text: text,
                    parentName: parentName,
                    parentPhone: phone
                })
            });

            if (res.ok) {
                input.value = '';
                const chatContainer = document.getElementById('messengerChatMessages');
                if (chatContainer) {
                    const timeStr = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
                    const newBubbleHtml = `
                        <div class="messenger-row right" style="display:flex; justify-content:flex-end; margin-bottom:8px;">
                            <div class="messenger-bubble parent" style="max-width:75%; background:linear-gradient(135deg, #2563EB, #1D4ED8); color:white; padding:10px 14px; border-radius:18px 18px 4px 18px; box-shadow:0 2px 8px rgba(37,99,235,0.2);">
                                <div style="white-space:pre-wrap; line-height:1.45; font-size:0.92rem;">${escapeHtml(text)}</div>
                                <div class="messenger-time" style="color:rgba(255,255,255,0.85); font-size:0.7rem; text-align:right; margin-top:4px;">${timeStr} <i class="fas fa-check" style="font-size:0.65rem; margin-left:2px;"></i></div>
                            </div>
                        </div>
                    `;
                    chatContainer.insertAdjacentHTML('beforeend', newBubbleHtml);
                    chatContainer.scrollTop = chatContainer.scrollHeight;
                }
                setTimeout(() => refreshParentMessengerSilently(), 600);
            } else {
                alert("Erreur lors de l'envoi du message.");
            }
        } else {
            const res = await fetch('/api/send-message', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    teacherName: activeParentChatTeacher,
                    parentName: parentName,
                    parentPhone: phone,
                    studentName: studentName,
                    studentClass: studentClass,
                    message: text,
                    section: typeof currentSection !== 'undefined' ? currentSection : 'garcons'
                })
            });

            if (res.ok) {
                input.value = '';
                await loadParentConversations();
                selectParentConversation(activeParentChatTeacher);
            } else {
                alert("Erreur lors de l'envoi du message.");
            }
        }
    } catch (e) {
        console.error('Erreur sendParentChatMessage:', e);
        alert("Erreur de connexion lors de l'envoi.");
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-paper-plane"></i>';
        }
        if (input) input.focus();
    }
}

let allTeacherHomeworks = [];
let allSectionTeachersList = [];
let activeEvalHomework = null;
let activeEvalStudents = [];

let activeTeacherHwFilters = {
    teacher: '',
    section: 'all',
    week: 'all',
    classe: 'all',
    jour: 'all',
    matiere: 'all',
    status: 'all',
    search: ''
};

// Helper visuel : Icône et couleur pour chaque matière
function getSubjectIconAndColor(matiere) {
    const m = String(matiere || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (m.includes('math') || m.includes('algebre') || m.includes('geometrie') || m.includes('رياضيات')) {
        return { icon: 'fas fa-calculator', color: '#7C3AED', bg: '#F5F3FF', border: '#DDD6FE' };
    }
    if (m.includes('francais') || m.includes('grammaire') || m.includes('lecture') || m.includes('orthographe') || m.includes('conjugaison') || m.includes('فرنسية')) {
        return { icon: 'fas fa-book-open', color: '#2563EB', bg: '#EFF6FF', border: '#BFDBFE' };
    }
    if (m.includes('arabe') || m.includes('عربي') || m.includes('لغة عربية') || m.includes('اسلامية') || m.includes('quran') || m.includes('coran') || m.includes('تربية')) {
        return { icon: 'fas fa-quran', color: '#059669', bg: '#ECFDF5', border: '#A7F3D0' };
    }
    if (m.includes('anglais') || m.includes('english') || m.includes('انجليزي') || m.includes('انكليزي')) {
        return { icon: 'fas fa-globe-americas', color: '#0284C7', bg: '#F0F9FF', border: '#BAE6FD' };
    }
    if (m.includes('science') || m.includes('physique') || m.includes('svt') || m.includes('chimie') || m.includes('علوم') || m.includes('فيزياء')) {
        return { icon: 'fas fa-flask', color: '#0D9488', bg: '#F0FDFA', border: '#99F6E4' };
    }
    if (m.includes('histoire') || m.includes('geo') || m.includes('sociale') || m.includes('تاريخ') || m.includes('جغرافيا') || m.includes('اجتماعيات')) {
        return { icon: 'fas fa-landmark', color: '#D97706', bg: '#FFFBEB', border: '#FDE68A' };
    }
    if (m.includes('art') || m.includes('dessin') || m.includes('plastique') || m.includes('رسم') || m.includes('فنون')) {
        return { icon: 'fas fa-palette', color: '#EA580C', bg: '#FFF7ED', border: '#FFEDD5' };
    }
    if (m.includes('musique') || m.includes('farah') || m.includes('موسيقى')) {
        return { icon: 'fas fa-music', color: '#DB2777', bg: '#FDF2F8', border: '#FBCFE8' };
    }
    if (m.includes('sport') || m.includes('eps') || m.includes('بدنية') || m.includes('رياضة')) {
        return { icon: 'fas fa-running', color: '#16A34A', bg: '#F0FDF4', border: '#BBF7D0' };
    }
    if (m.includes('info') || m.includes('tech') || m.includes('informatique') || m.includes('حاسوب') || m.includes('تكنولوجيا')) {
        return { icon: 'fas fa-laptop-code', color: '#4F46E5', bg: '#EEF2FF', border: '#C7D2FE' };
    }
    return { icon: 'fas fa-pencil-alt', color: '#475569', bg: '#F8FAFC', border: '#E2E8F0' };
}

// Helper visuel : Icône et libellé pour chaque jour de la semaine
function getDayIconAndDetails(dayNameOrStr) {
    const raw = String(dayNameOrStr || '').trim().toLowerCase();
    if (raw.includes('dim') || raw.includes('sun') || raw.includes('احد') || raw.includes('أحد')) {
        return { key: 'Dimanche', label: 'Dimanche', ar: 'الأحد', icon: 'fas fa-sun', color: '#F59E0B' };
    }
    if (raw.includes('lun') || raw.includes('mon') || raw.includes('اثنين') || raw.includes('إثنين')) {
        return { key: 'Lundi', label: 'Lundi', ar: 'الإثنين', icon: 'fas fa-seedling', color: '#10B981' };
    }
    if (raw.includes('mar') || raw.includes('tue') || raw.includes('ثلاثاء') || raw.includes('الثلاثاء')) {
        return { key: 'Mardi', label: 'Mardi', ar: 'الثلاثاء', icon: 'fas fa-bolt', color: '#6366F1' };
    }
    if (raw.includes('mer') || raw.includes('wed') || raw.includes('اربعاء') || raw.includes('الأربعاء')) {
        return { key: 'Mercredi', label: 'Mercredi', ar: 'الأربعاء', icon: 'fas fa-leaf', color: '#06B6D4' };
    }
    if (raw.includes('jeu') || raw.includes('thu') || raw.includes('خميس') || raw.includes('الخميس')) {
        return { key: 'Jeudi', label: 'Jeudi', ar: 'الخميس', icon: 'fas fa-star', color: '#EC4899' };
    }
    return { key: dayNameOrStr, label: dayNameOrStr, ar: '', icon: 'far fa-calendar', color: '#64748B' };
}

async function loadTeacherHomeworksDashboard() {
    const container = document.getElementById('teacher-homeworks-tree-container');
    if (!container) return;

    container.innerHTML = `
        <div style="text-align:center; padding:40px; color:#475569;">
            <i class="fas fa-spinner fa-spin fa-2x" style="color:#2563EB; margin-bottom:12px;"></i>
            <p style="font-weight:600; font-size:1.05rem;">Chargement des devoirs...</p>
        </div>
    `;

    try {
        const isAdminOrSupervisor = (typeof isUserAdminOrSupervisor === 'function') 
            ? isUserAdminOrSupervisor(loggedInUser, currentUserRole) 
            : false;

        const section = activeTeacherHwFilters.section || (typeof currentSection !== 'undefined' && currentSection) || 'all';
        activeTeacherHwFilters.section = section;
        const teacherParamFromLogin = loggedInTeacherTable || (typeof loggedInUser !== 'undefined' ? loggedInUser : '');

        // Pour un enseignant régulier : STRICTEMENT VÉROUILLÉ SUR SON NOM
        if (!isAdminOrSupervisor) {
            activeTeacherHwFilters.teacher = teacherParamFromLogin;
            const adminSwitcher = document.getElementById('teacherAdminSwitcherRow');
            if (adminSwitcher) adminSwitcher.style.display = 'none';
        } else {
            // Pour un admin ou superviseur : sélecteur d'enseignant disponible
            const adminSwitcher = document.getElementById('teacherAdminSwitcherRow');
            if (adminSwitcher) adminSwitcher.style.display = 'block';
            if (!activeTeacherHwFilters.teacher) {
                activeTeacherHwFilters.teacher = teacherParamFromLogin;
            }
        }

        const tableTeacherParam = loggedInTeacherTable || '';
        const url = `/api/teacher-homeworks?teacher=${encodeURIComponent(activeTeacherHwFilters.teacher)}&tableTeacher=${encodeURIComponent(tableTeacherParam)}&section=${encodeURIComponent(section)}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Erreur ${res.status}`);

        const data = await res.json();
        allTeacherHomeworks = data.homeworks || [];
        allSectionTeachersList = data.sectionTeachers || [];

        // Si administrateur et aucun devoir trouvé pour son nom personnel, basculer sur le premier enseignant ayant des devoirs
        if (isAdminOrSupervisor && allTeacherHomeworks.length === 0 && allSectionTeachersList.length > 0 && activeTeacherHwFilters.teacher === loggedInUser) {
            activeTeacherHwFilters.teacher = allSectionTeachersList[0].name;
            const retryRes = await fetch(`/api/teacher-homeworks?teacher=${encodeURIComponent(activeTeacherHwFilters.teacher)}&section=${encodeURIComponent(section)}`);
            if (retryRes.ok) {
                const retryData = await retryRes.json();
                allTeacherHomeworks = retryData.homeworks || [];
            }
        }

        // Mettre à jour l'en-tête de l'espace enseignant
        const nameEl = document.getElementById('teacherEvalActiveName');
        if (nameEl) {
            if (isAdminOrSupervisor) {
                nameEl.textContent = `${activeTeacherHwFilters.teacher || 'Sélectionner un enseignant'} (Mode Superviseur)`;
            } else {
                nameEl.textContent = activeTeacherHwFilters.teacher || loggedInUser || 'Enseignant';
            }
        }

        const secEl = document.getElementById('teacherEvalActiveSection');
        if (secEl) {
            secEl.textContent = section === 'all'
                ? 'Toutes les Écoles / Sections'
                : (section === 'garcons' ? 'Section Garçons (بنين)' : (section === 'primaire' ? 'Section Primaire & Maternelle (ابتدائي وروضة)' : 'Section Filles (بنات)'));
        }

        // Rendu des filtres hiérarchiques : Écoles -> Semaines -> Classes -> Jours -> Matières
        renderTeacherSchoolIcons();
        if (isAdminOrSupervisor) {
            renderTeacherAdminSwitcher(allSectionTeachersList);
        }
        renderTeacherWeeksIcons();
        renderTeacherClassesIcons();
        renderTeacherDaysIcons();
        renderTeacherSubjectsIcons();

        // Rendu du tableau de bord avec les filtres actifs
        renderTeacherHomeworksDashboard();
    } catch (e) {
        console.error('Erreur loadTeacherHomeworksDashboard:', e);
        container.innerHTML = `
            <div style="background:#FEF2F2; border:1px solid #F87171; border-radius:12px; padding:20px; text-align:center; color:#991B1B;">
                <i class="fas fa-exclamation-triangle fa-2x" style="margin-bottom:8px;"></i>
                <p style="font-weight:700;">Impossible de charger les devoirs pour le moment.</p>
                <button class="pro-button" onclick="loadTeacherHomeworksDashboard()" style="margin-top:10px;">
                    <i class="fas fa-sync"></i> Réessayer
                </button>
            </div>
        `;
    }
}

// 0. Barre d'icônes : ÉCOLES / SECTIONS
function renderTeacherSchoolIcons() {
    const container = document.getElementById('teacherSchoolIconsContainer');
    if (!container) return;

    const counts = { all: allTeacherHomeworks.length, garcons: 0, filles: 0, primaire: 0 };
    allTeacherHomeworks.forEach(h => {
        const sec = (h.section || '').toLowerCase();
        if (sec.includes('garcon') || sec === 'garcons') counts.garcons += 1;
        else if (sec.includes('fille') || sec === 'filles') counts.filles += 1;
        else if (sec.includes('prim') || sec === 'primaire') counts.primaire += 1;
    });

    const bAll = document.getElementById('badgeSchoolAll');
    if (bAll) bAll.textContent = counts.all;
    const bGarcons = document.getElementById('badgeSchoolGarcons');
    if (bGarcons) bGarcons.textContent = counts.garcons;
    const bFilles = document.getElementById('badgeSchoolFilles');
    if (bFilles) bFilles.textContent = counts.filles;
    const bPrimaire = document.getElementById('badgeSchoolPrimaire');
    if (bPrimaire) bPrimaire.textContent = counts.primaire;

    const activeSec = activeTeacherHwFilters.section || 'all';
    const btns = container.querySelectorAll('.teacher-icon-btn');
    btns.forEach(b => {
        const bSchool = b.getAttribute('data-school');
        if (bSchool === activeSec) {
            b.classList.add('active');
        } else {
            b.classList.remove('active');
        }
    });

    const countLabel = document.getElementById('teacherSchoolCountLabel');
    if (countLabel) {
        if (activeSec === 'all') {
            countLabel.textContent = `Toutes les écoles (${allTeacherHomeworks.length} devoirs au total)`;
        } else {
            const secName = activeSec === 'garcons' ? 'Section Garçons (بنين)' : (activeSec === 'filles' ? 'Section Filles (بنات)' : 'Section Primaire');
            countLabel.textContent = `${secName} (${counts[activeSec] || 0} devoirs)`;
        }
    }
}

function setTeacherHwSchoolFilter(school) {
    activeTeacherHwFilters.section = school;
    // Drill down: réinitialiser semaine, classe, jour et matière pour un affichage net
    activeTeacherHwFilters.week = 'all';
    activeTeacherHwFilters.classe = 'all';
    activeTeacherHwFilters.jour = 'all';
    activeTeacherHwFilters.matiere = 'all';
    if (school !== 'all') {
        currentSection = school;
    }
    loadTeacherHomeworksDashboard();
}

// 1. Barre d'icônes : ENSEIGNANTS (Admin / Superviseur uniquement)
function renderTeacherAdminSwitcher(teachersList) {
    const container = document.getElementById('teacherAdminIconsContainer');
    if (!container) return;

    if (!teachersList || teachersList.length === 0) {
        container.innerHTML = `<span style="color:#64748B; font-size:0.85rem;">Aucun enseignant trouvé avec des devoirs dans cette section.</span>`;
        return;
    }

    let html = '';
    teachersList.forEach(t => {
        const isActive = (activeTeacherHwFilters.teacher && activeTeacherHwFilters.teacher.toLowerCase() === t.name.toLowerCase());
        const photoSrc = t.photoUrl || 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%236366F1"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>';
        
        html += `
            <button type="button" class="teacher-card-pill ${isActive ? 'active' : ''}" onclick="switchActiveTeacherForHomework('${escapeHtml(t.name)}')">
                <img src="${escapeHtml(photoSrc)}" alt="${escapeHtml(t.name)}" onerror="this.src='data:image/svg+xml;utf8,<svg xmlns=\\'http://www.w3.org/2000/svg\\' viewBox=\\'0 0 24 24\\' fill=\\'%236366F1\\'><path d=\\'M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z\\'/></svg>'">
                <span>${escapeHtml(t.name)}</span>
                <span class="hw-badge" style="${isActive ? 'background:rgba(255,255,255,0.3); color:white;' : 'background:#EEF2FF; color:#4F46E5;'}">${t.count || 0}</span>
            </button>
        `;
    });

    container.innerHTML = html;
}

function switchActiveTeacherForHomework(teacherName) {
    activeTeacherHwFilters.teacher = teacherName;
    activeTeacherHwFilters.week = 'all';
    activeTeacherHwFilters.classe = 'all';
    activeTeacherHwFilters.matiere = 'all';
    activeTeacherHwFilters.jour = 'all';
    activeTeacherHwFilters.status = 'all';
    activeTeacherHwFilters.search = '';
    const searchInput = document.getElementById('teacherHwSearchInput');
    if (searchInput) searchInput.value = '';
    loadTeacherHomeworksDashboard();
}

// 2. Barre d'icônes : SEMAINES (Hiérarchie Niveau 1 après l'École)
function renderTeacherWeeksIcons() {
    const container = document.getElementById('teacherWeeksIconsContainer');
    const countLabel = document.getElementById('teacherWeeksCountLabel');
    if (!container) return;

    // Ne prendre en compte que les devoirs de l'école/section sélectionnée
    let targetHws = allTeacherHomeworks;
    if (activeTeacherHwFilters.section !== 'all') {
        targetHws = targetHws.filter(h => {
            const sec = (h.section || '').toLowerCase();
            return sec.includes(activeTeacherHwFilters.section.toLowerCase());
        });
    }

    const weekMap = new Map();
    targetHws.forEach(h => {
        const w = String(h.week || '1');
        if (!weekMap.has(w)) {
            weekMap.set(w, { total: 0, evaluated: 0, rangeText: h.weekRangeText || '' });
        }
        const item = weekMap.get(w);
        item.total += 1;
        if (h.isEvaluated) item.evaluated += 1;
        if (!item.rangeText && h.weekRangeText) item.rangeText = h.weekRangeText;
    });

    const weeks = Array.from(weekMap.keys()).sort((a, b) => (parseInt(a) || 0) - (parseInt(b) || 0));
    if (countLabel) {
        countLabel.textContent = `(${weeks.length} semaine${weeks.length > 1 ? 's' : ''} avec devoirs)`;
    }

    if (weeks.length === 0) {
        container.innerHTML = `
            <div style="color:#64748B; font-size:0.88rem; padding:6px 0; display:flex; align-items:center; gap:8px;">
                <i class="fas fa-info-circle" style="color:#3B82F6;"></i> Aucun devoir trouvé pour cette sélection.
            </div>
        `;
        return;
    }

    let html = `
        <button type="button" class="teacher-icon-btn ${activeTeacherHwFilters.week === 'all' ? 'active' : ''}" onclick="setTeacherHwWeekFilter('all')">
            <i class="fas fa-calendar-week" style="color:#0284C7;"></i>
            <span>Toutes les Semaines</span>
            <span class="hw-badge">${targetHws.length}</span>
        </button>
    `;

    weeks.forEach(w => {
        const item = weekMap.get(w);
        const isActive = (String(activeTeacherHwFilters.week) === String(w));
        const allDone = item.evaluated === item.total && item.total > 0;
        const iconColor = isActive ? '#FFFFFF' : (allDone ? '#10B981' : '#0284C7');

        html += `
            <button type="button" class="teacher-icon-btn ${isActive ? 'active' : ''}" onclick="setTeacherHwWeekFilter('${w}')" title="${item.rangeText ? item.rangeText : 'Semaine ' + w}">
                <i class="fas ${allDone ? 'fa-check-circle' : 'fa-calendar-day'}" style="color:${iconColor};"></i>
                <span>Semaine ${w}</span>
                ${item.rangeText ? `<small style="font-size:0.75rem; opacity:0.85;">(${escapeHtml(item.rangeText)})</small>` : ''}
                <span class="hw-badge" style="${allDone ? 'background:#10B981; color:white;' : ''}">${item.evaluated}/${item.total}</span>
            </button>
        `;
    });

    container.innerHTML = html;
}

function setTeacherHwWeekFilter(week) {
    activeTeacherHwFilters.week = week;
    // Drill-down : En cliquant sur une semaine, on affine les classes et jours disponibles
    activeTeacherHwFilters.classe = 'all';
    activeTeacherHwFilters.jour = 'all';
    renderTeacherWeeksIcons();
    renderTeacherClassesIcons();
    renderTeacherDaysIcons();
    renderTeacherSubjectsIcons();
    renderTeacherHomeworksDashboard();
}

// 3. Barre d'icônes : CLASSES (Hiérarchie Niveau 2 après la Semaine)
function renderTeacherClassesIcons() {
    const container = document.getElementById('teacherClassesIconsContainer');
    const countLabel = document.getElementById('teacherClassesCountLabel');
    if (!container) return;

    // Ne filtrer que les classes de la semaine active et de l'école active
    let targetHws = allTeacherHomeworks;
    if (activeTeacherHwFilters.section !== 'all') {
        targetHws = targetHws.filter(h => {
            const sec = (h.section || '').toLowerCase();
            return sec.includes(activeTeacherHwFilters.section.toLowerCase());
        });
    }
    if (activeTeacherHwFilters.week !== 'all') {
        targetHws = targetHws.filter(h => String(h.week) === String(activeTeacherHwFilters.week));
    }

    const classMap = new Map();
    targetHws.forEach(h => {
        const c = h.classe || 'Général';
        if (!classMap.has(c)) {
            classMap.set(c, { total: 0, evaluated: 0 });
        }
        const item = classMap.get(c);
        item.total += 1;
        if (h.isEvaluated) item.evaluated += 1;
    });

    const classes = Array.from(classMap.keys()).sort(compareClasses);
    if (countLabel) {
        const weekPrefix = activeTeacherHwFilters.week !== 'all' ? `dans Semaine ${activeTeacherHwFilters.week}` : 'au total';
        countLabel.textContent = `(${classes.length} classe${classes.length > 1 ? 's' : ''} ${weekPrefix})`;
    }

    if (classes.length === 0) {
        container.innerHTML = `
            <div style="color:#64748B; font-size:0.88rem; padding:6px 0; display:flex; align-items:center; gap:8px;">
                <i class="fas fa-info-circle"></i> Aucune classe avec devoirs pour cette sélection.
            </div>
        `;
        return;
    }

    // Réinitialiser la classe active si elle n'est pas dans la liste disponible
    if (activeTeacherHwFilters.classe !== 'all' && !classMap.has(activeTeacherHwFilters.classe)) {
        activeTeacherHwFilters.classe = 'all';
    }

    let html = `
        <button type="button" class="teacher-icon-btn ${activeTeacherHwFilters.classe === 'all' ? 'active' : ''}" onclick="setTeacherHwClassFilter('all')">
            <i class="fas fa-layer-group" style="color:#2563EB;"></i>
            <span>${activeTeacherHwFilters.week !== 'all' ? 'Toutes les Classes de la Semaine' : 'Toutes les Classes'}</span>
            <span class="hw-badge">${targetHws.length}</span>
        </button>
    `;

    classes.forEach(c => {
        const item = classMap.get(c);
        const isActive = (activeTeacherHwFilters.classe === c);
        const ar = (typeof classTranslations !== 'undefined' && classTranslations[c]) ? classTranslations[c] : '';
        const displayLabel = ar ? `${c} (${ar})` : c;
        const allDone = item.evaluated === item.total && item.total > 0;

        html += `
            <button type="button" class="teacher-icon-btn ${isActive ? 'active' : ''}" onclick="setTeacherHwClassFilter('${escapeHtml(c)}')">
                <i class="fas fa-graduation-cap" style="color:${isActive ? '#FFFFFF' : (allDone ? '#10B981' : '#4F46E5')};"></i>
                <span>${escapeHtml(displayLabel)}</span>
                <span class="hw-badge" style="${allDone ? 'background:#10B981; color:white;' : ''}">${item.evaluated}/${item.total}</span>
            </button>
        `;
    });

    container.innerHTML = html;
}

function setTeacherHwClassFilter(classe) {
    activeTeacherHwFilters.classe = classe;
    // Drill-down : En choisissant la classe, on affine les jours et matières
    activeTeacherHwFilters.jour = 'all';
    renderTeacherClassesIcons();
    renderTeacherDaysIcons();
    renderTeacherSubjectsIcons();
    renderTeacherHomeworksDashboard();
}

// 4. Barre d'icônes : JOURS DE LA SEMAINE (Hiérarchie Niveau 3 après la Classe)
function renderTeacherDaysIcons() {
    const container = document.getElementById('teacherDaysIconsContainer');
    const countLabel = document.getElementById('teacherDaysCountLabel');
    if (!container) return;

    // Filtrer par école, semaine et classe
    let targetHws = allTeacherHomeworks;
    if (activeTeacherHwFilters.section !== 'all') {
        targetHws = targetHws.filter(h => {
            const sec = (h.section || '').toLowerCase();
            return sec.includes(activeTeacherHwFilters.section.toLowerCase());
        });
    }
    if (activeTeacherHwFilters.week !== 'all') {
        targetHws = targetHws.filter(h => String(h.week) === String(activeTeacherHwFilters.week));
    }
    if (activeTeacherHwFilters.classe !== 'all') {
        targetHws = targetHws.filter(h => h.classe === activeTeacherHwFilters.classe);
    }

    const dayCounts = {};
    targetHws.forEach(h => {
        const dInfo = getDayIconAndDetails(h.jour);
        dayCounts[dInfo.key] = (dayCounts[dInfo.key] || 0) + 1;
    });

    const activeDaysCount = Object.keys(dayCounts).length;
    if (countLabel) {
        const clsPrefix = activeTeacherHwFilters.classe !== 'all' ? `pour classe ${activeTeacherHwFilters.classe}` : '';
        countLabel.textContent = `(${activeDaysCount} jour${activeDaysCount > 1 ? 's' : ''} avec devoirs ${clsPrefix})`;
    }

    let html = `
        <button type="button" class="teacher-icon-btn ${activeTeacherHwFilters.jour === 'all' ? 'active' : ''}" onclick="setTeacherHwDayFilter('all')">
            <i class="fas fa-calendar-alt" style="color:#10B981;"></i>
            <span>Tous les Jours</span>
            <span class="hw-badge">${targetHws.length}</span>
        </button>
    `;

    const standardDays = [
        { key: 'Dimanche', label: 'Dimanche', ar: 'الأحد', icon: 'fas fa-sun', color: '#F59E0B' },
        { key: 'Lundi', label: 'Lundi', ar: 'الإثنين', icon: 'fas fa-seedling', color: '#10B981' },
        { key: 'Mardi', label: 'Mardi', ar: 'الثلاثاء', icon: 'fas fa-bolt', color: '#6366F1' },
        { key: 'Mercredi', label: 'Mercredi', ar: 'الأربعاء', icon: 'fas fa-leaf', color: '#06B6D4' },
        { key: 'Jeudi', label: 'Jeudi', ar: 'الخميس', icon: 'fas fa-star', color: '#EC4899' }
    ];

    standardDays.forEach(d => {
        const count = dayCounts[d.key] || 0;
        const isActive = (activeTeacherHwFilters.jour === d.key);

        html += `
            <button type="button" class="teacher-icon-btn ${isActive ? 'active' : ''}" onclick="setTeacherHwDayFilter('${d.key}')" style="${count === 0 ? 'opacity:0.55;' : 'font-weight:700;'}">
                <i class="${d.icon}" style="color:${isActive ? '#FFFFFF' : d.color};"></i>
                <span>${d.label} <small style="opacity:0.85;">(${d.ar})</small></span>
                <span class="hw-badge" style="${count > 0 ? 'background:#DBEAFE; color:#1D4ED8;' : ''}">${count}</span>
            </button>
        `;
    });

    container.innerHTML = html;
}

function setTeacherHwDayFilter(jour) {
    activeTeacherHwFilters.jour = jour;
    renderTeacherDaysIcons();
    renderTeacherSubjectsIcons();
    renderTeacherHomeworksDashboard();
}

// 5. Barre d'icônes : MATIÈRES
function renderTeacherSubjectsIcons() {
    const container = document.getElementById('teacherSubjectsIconsContainer');
    const countLabel = document.getElementById('teacherSubjectsCountLabel');
    if (!container) return;

    let targetHws = allTeacherHomeworks;
    if (activeTeacherHwFilters.section !== 'all') {
        targetHws = targetHws.filter(h => {
            const sec = (h.section || '').toLowerCase();
            return sec.includes(activeTeacherHwFilters.section.toLowerCase());
        });
    }
    if (activeTeacherHwFilters.week !== 'all') {
        targetHws = targetHws.filter(h => String(h.week) === String(activeTeacherHwFilters.week));
    }
    if (activeTeacherHwFilters.classe !== 'all') {
        targetHws = targetHws.filter(h => h.classe === activeTeacherHwFilters.classe);
    }
    if (activeTeacherHwFilters.jour !== 'all') {
        targetHws = targetHws.filter(h => getDayIconAndDetails(h.jour).key === activeTeacherHwFilters.jour);
    }

    const subjectCounts = {};
    targetHws.forEach(h => {
        const m = h.matiere || 'Matière Générale';
        subjectCounts[m] = (subjectCounts[m] || 0) + 1;
    });

    const subjects = Object.keys(subjectCounts).sort();
    if (countLabel) countLabel.textContent = `(${subjects.length} matière${subjects.length > 1 ? 's' : ''})`;

    let html = `
        <button type="button" class="teacher-icon-btn ${activeTeacherHwFilters.matiere === 'all' ? 'active' : ''}" onclick="setTeacherHwSubjectFilter('all')">
            <i class="fas fa-book" style="color:#8B5CF6;"></i>
            <span>Toutes les Matières</span>
            <span class="hw-badge">${targetHws.length}</span>
        </button>
    `;

    subjects.forEach(m => {
        const isActive = (activeTeacherHwFilters.matiere === m);
        const iconInfo = getSubjectIconAndColor(m);
        const count = subjectCounts[m] || 0;

        html += `
            <button type="button" class="teacher-icon-btn ${isActive ? 'active' : ''}" onclick="setTeacherHwSubjectFilter('${escapeHtml(m)}')">
                <i class="${iconInfo.icon}" style="color:${isActive ? '#FFFFFF' : iconInfo.color};"></i>
                <span>${escapeHtml(m)}</span>
                <span class="hw-badge">${count}</span>
            </button>
        `;
    });

    container.innerHTML = html;
}

function setTeacherHwSubjectFilter(matiere) {
    activeTeacherHwFilters.matiere = matiere;
    renderTeacherSubjectsIcons();
    renderTeacherHomeworksDashboard();
}

// 6. Statut d'évaluation
function setTeacherHwStatusFilter(status) {
    activeTeacherHwFilters.status = status;
    const btns = document.querySelectorAll('#teacherStatusIconsContainer .teacher-icon-btn');
    btns.forEach(b => {
        const bStatus = b.getAttribute('data-status');
        if (bStatus === status) {
            b.classList.add('active');
        } else {
            b.classList.remove('active');
        }
    });
    renderTeacherHomeworksDashboard();
}

// Réinitialiser tous les filtres
function resetAllTeacherHwFilters() {
    activeTeacherHwFilters.section = 'all';
    activeTeacherHwFilters.week = 'all';
    activeTeacherHwFilters.classe = 'all';
    activeTeacherHwFilters.jour = 'all';
    activeTeacherHwFilters.matiere = 'all';
    activeTeacherHwFilters.status = 'all';
    activeTeacherHwFilters.search = '';

    const searchInput = document.getElementById('teacherHwSearchInput');
    if (searchInput) searchInput.value = '';

    renderTeacherSchoolIcons();
    renderTeacherWeeksIcons();
    renderTeacherClassesIcons();
    renderTeacherDaysIcons();
    renderTeacherSubjectsIcons();
    setTeacherHwStatusFilter('all');
}

// Rendu principal des devoirs
function renderTeacherHomeworksDashboard() {
    const container = document.getElementById('teacher-homeworks-tree-container');
    if (!container) return;

    const searchInput = document.getElementById('teacherHwSearchInput');
    activeTeacherHwFilters.search = (searchInput ? searchInput.value : '').trim().toLowerCase();

    // Mettre à jour les compteurs de statut
    const totalCount = allTeacherHomeworks.length;
    const evaluatedCount = allTeacherHomeworks.filter(h => h.isEvaluated).length;
    const pendingCount = totalCount - evaluatedCount;

    const statTotal = document.getElementById('statTotalHw');
    if (statTotal) statTotal.textContent = totalCount;
    const statEval = document.getElementById('statEvaluatedHw');
    if (statEval) statEval.textContent = evaluatedCount;
    const statPending = document.getElementById('statPendingHw');
    if (statPending) statPending.textContent = pendingCount;

    const bAll = document.getElementById('badgeStatusAll');
    if (bAll) bAll.textContent = totalCount;
    const bPending = document.getElementById('badgeStatusPending');
    if (bPending) bPending.textContent = pendingCount;
    const bEval = document.getElementById('badgeStatusEvaluated');
    if (bEval) bEval.textContent = evaluatedCount;

    // Badges des filtres actifs
    const tagsContainer = document.getElementById('teacherActiveFiltersTags');
    if (tagsContainer) {
        let tagsHtml = '';
        if (activeTeacherHwFilters.section !== 'all') {
            const secName = activeTeacherHwFilters.section === 'garcons' ? 'Garçons' : (activeTeacherHwFilters.section === 'filles' ? 'Filles' : 'Primaire');
            tagsHtml += `<span style="background:#EFF6FF; color:#1D4ED8; padding:3px 8px; border-radius:6px; font-size:0.78rem; font-weight:700; display:inline-flex; align-items:center; gap:4px;"><i class="fas fa-school"></i> École: ${secName} <i class="fas fa-times" style="cursor:pointer;" onclick="setTeacherHwSchoolFilter('all')"></i></span>`;
        }
        if (activeTeacherHwFilters.week !== 'all') {
            tagsHtml += `<span style="background:#F0F9FF; color:#0284C7; padding:3px 8px; border-radius:6px; font-size:0.78rem; font-weight:700; display:inline-flex; align-items:center; gap:4px;">Semaine ${escapeHtml(activeTeacherHwFilters.week)} <i class="fas fa-times" style="cursor:pointer;" onclick="setTeacherHwWeekFilter('all')"></i></span>`;
        }
        if (activeTeacherHwFilters.classe !== 'all') {
            tagsHtml += `<span style="background:#EEF2FF; color:#4338CA; padding:3px 8px; border-radius:6px; font-size:0.78rem; font-weight:700; display:inline-flex; align-items:center; gap:4px;">Classe: ${escapeHtml(activeTeacherHwFilters.classe)} <i class="fas fa-times" style="cursor:pointer;" onclick="setTeacherHwClassFilter('all')"></i></span>`;
        }
        if (activeTeacherHwFilters.jour !== 'all') {
            tagsHtml += `<span style="background:#ECFDF5; color:#059669; padding:3px 8px; border-radius:6px; font-size:0.78rem; font-weight:700; display:inline-flex; align-items:center; gap:4px;">Jour: ${escapeHtml(activeTeacherHwFilters.jour)} <i class="fas fa-times" style="cursor:pointer;" onclick="setTeacherHwDayFilter('all')"></i></span>`;
        }
        if (activeTeacherHwFilters.matiere !== 'all') {
            tagsHtml += `<span style="background:#F5F3FF; color:#7C3AED; padding:3px 8px; border-radius:6px; font-size:0.78rem; font-weight:700; display:inline-flex; align-items:center; gap:4px;">Matière: ${escapeHtml(activeTeacherHwFilters.matiere)} <i class="fas fa-times" style="cursor:pointer;" onclick="setTeacherHwSubjectFilter('all')"></i></span>`;
        }
        if (activeTeacherHwFilters.status !== 'all') {
            const stLabel = activeTeacherHwFilters.status === 'evaluated' ? 'Évalués (Vert)' : 'À Évaluer';
            tagsHtml += `<span style="background:#FEF3C7; color:#B45309; padding:3px 8px; border-radius:6px; font-size:0.78rem; font-weight:700; display:inline-flex; align-items:center; gap:4px;">Statut: ${stLabel} <i class="fas fa-times" style="cursor:pointer;" onclick="setTeacherHwStatusFilter('all')"></i></span>`;
        }
        if (activeTeacherHwFilters.search) {
            tagsHtml += `<span style="background:#F1F5F9; color:#334155; padding:3px 8px; border-radius:6px; font-size:0.78rem; font-weight:700; display:inline-flex; align-items:center; gap:4px;">Recherche: "${escapeHtml(activeTeacherHwFilters.search)}" <i class="fas fa-times" style="cursor:pointer;" onclick="document.getElementById('teacherHwSearchInput').value=''; renderTeacherHomeworksDashboard();"></i></span>`;
        }
        tagsContainer.innerHTML = tagsHtml;
    }

    // Filtrer la liste des devoirs
    const filtered = allTeacherHomeworks.filter(hw => {
        if (activeTeacherHwFilters.section !== 'all') {
            const hwSec = (hw.section || '').toLowerCase();
            const filterSec = activeTeacherHwFilters.section.toLowerCase();
            if (!hwSec.includes(filterSec) && hwSec !== filterSec) return false;
        }

        if (activeTeacherHwFilters.week !== 'all' && String(hw.week) !== String(activeTeacherHwFilters.week)) return false;
        if (activeTeacherHwFilters.classe !== 'all' && hw.classe !== activeTeacherHwFilters.classe) return false;
        if (activeTeacherHwFilters.matiere !== 'all' && hw.matiere !== activeTeacherHwFilters.matiere) return false;
        
        if (activeTeacherHwFilters.jour !== 'all') {
            const dInfo = getDayIconAndDetails(hw.jour);
            if (dInfo.key !== activeTeacherHwFilters.jour) return false;
        }

        if (activeTeacherHwFilters.status === 'evaluated' && !hw.isEvaluated) return false;
        if (activeTeacherHwFilters.status === 'pending' && hw.isEvaluated) return false;

        if (activeTeacherHwFilters.search) {
            const q = activeTeacherHwFilters.search;
            const textMatch = (
                String(hw.devoir || '').toLowerCase().includes(q) ||
                String(hw.lecon || '').toLowerCase().includes(q) ||
                String(hw.matiere || '').toLowerCase().includes(q) ||
                String(hw.classe || '').toLowerCase().includes(q) ||
                String(hw.jour || '').toLowerCase().includes(q)
            );
            if (!textMatch) return false;
        }

        return true;
    });

    if (filtered.length === 0) {
        container.innerHTML = `
            <div style="background:white; border-radius:16px; padding:45px 20px; text-align:center; border:1px dashed #CBD5E1; color:#64748B;">
                <div style="width:60px; height:60px; background:#F1F5F9; border-radius:50%; display:inline-flex; align-items:center; justify-content:center; margin-bottom:14px;">
                    <i class="fas fa-clipboard-check fa-2x" style="color:#94A3B8;"></i>
                </div>
                <h4 style="font-size:1.15rem; color:#1E293B; margin:0 0 6px 0; font-weight:700;">Aucun devoir ne correspond à cette sélection</h4>
                <p style="font-size:0.92rem; margin:0 0 16px 0; color:#64748B;">Cliquez sur "Toutes les Semaines", "Toutes les Classes" ou réinitialisez les filtres.</p>
                <button type="button" class="pro-button primary-button" onclick="resetAllTeacherHwFilters()">
                    <i class="fas fa-undo"></i> Réinitialiser tous les filtres
                </button>
            </div>
        `;
        return;
    }

    // Fil d'Ariane (Parcours École -> Semaine -> Classe -> Jour)
    let breadcrumbsHtml = `
        <div style="background:#FFFFFF; border:1px solid #E2E8F0; border-radius:12px; padding:12px 18px; margin-bottom:22px; box-shadow:0 2px 6px rgba(0,0,0,0.02); display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:10px;">
            <div style="display:flex; align-items:center; flex-wrap:wrap; gap:8px;">
                <span style="font-weight:700; color:#64748B; font-size:0.85rem; display:inline-flex; align-items:center; gap:6px;">
                    <i class="fas fa-sitemap" style="color:#2563EB;"></i> Parcours :
                </span>

                <button type="button" onclick="setTeacherHwSchoolFilter('all')" title="Filtrer ou afficher toutes les écoles" style="background:#EFF6FF; color:#1D4ED8; border:1px solid #BFDBFE; padding:4px 10px; border-radius:8px; font-weight:700; font-size:0.82rem; cursor:pointer; display:inline-flex; align-items:center; gap:5px;">
                    <i class="fas fa-school"></i> ${activeTeacherHwFilters.section === 'all' ? 'Toutes Écoles' : (activeTeacherHwFilters.section === 'garcons' ? 'Garçons' : (activeTeacherHwFilters.section === 'filles' ? 'Filles' : 'Primaire'))}
                </button>

                <i class="fas fa-chevron-right" style="color:#CBD5E1; font-size:0.75rem;"></i>

                <button type="button" onclick="setTeacherHwWeekFilter('all')" title="Filtrer ou afficher toutes les semaines" style="background:${activeTeacherHwFilters.week !== 'all' ? '#F0F9FF' : '#F8FAFC'}; color:${activeTeacherHwFilters.week !== 'all' ? '#0284C7' : '#475569'}; border:1px solid ${activeTeacherHwFilters.week !== 'all' ? '#BAE6FD' : '#E2E8F0'}; padding:4px 10px; border-radius:8px; font-weight:700; font-size:0.82rem; cursor:pointer; display:inline-flex; align-items:center; gap:5px;">
                    <i class="fas fa-calendar-week"></i> ${activeTeacherHwFilters.week !== 'all' ? 'Semaine ' + escapeHtml(activeTeacherHwFilters.week) : 'Toutes Semaines'}
                </button>

                <i class="fas fa-chevron-right" style="color:#CBD5E1; font-size:0.75rem;"></i>

                <button type="button" onclick="setTeacherHwClassFilter('all')" title="Filtrer ou afficher toutes les classes" style="background:${activeTeacherHwFilters.classe !== 'all' ? '#EEF2FF' : '#F8FAFC'}; color:${activeTeacherHwFilters.classe !== 'all' ? '#4F46E5' : '#475569'}; border:1px solid ${activeTeacherHwFilters.classe !== 'all' ? '#C7D2FE' : '#E2E8F0'}; padding:4px 10px; border-radius:8px; font-weight:700; font-size:0.82rem; cursor:pointer; display:inline-flex; align-items:center; gap:5px;">
                    <i class="fas fa-graduation-cap"></i> ${activeTeacherHwFilters.classe !== 'all' ? 'Classe ' + escapeHtml(activeTeacherHwFilters.classe) : 'Toutes Classes'}
                </button>

                <i class="fas fa-chevron-right" style="color:#CBD5E1; font-size:0.75rem;"></i>

                <button type="button" onclick="setTeacherHwDayFilter('all')" title="Filtrer ou afficher tous les jours" style="background:${activeTeacherHwFilters.jour !== 'all' ? '#ECFDF5' : '#F8FAFC'}; color:${activeTeacherHwFilters.jour !== 'all' ? '#059669' : '#475569'}; border:1px solid ${activeTeacherHwFilters.jour !== 'all' ? '#A7F3D0' : '#E2E8F0'}; padding:4px 10px; border-radius:8px; font-weight:700; font-size:0.82rem; cursor:pointer; display:inline-flex; align-items:center; gap:5px;">
                    <i class="fas fa-calendar-day"></i> ${activeTeacherHwFilters.jour !== 'all' ? escapeHtml(activeTeacherHwFilters.jour) : 'Tous Jours'}
                </button>
            </div>

            <div style="display:flex; align-items:center; gap:8px;">
                <span style="font-weight:700; color:#1E293B; font-size:0.82rem; background:#F8FAFC; border:1px solid #E2E8F0; padding:4px 10px; border-radius:8px;">
                    ${filtered.length} devoir${filtered.length > 1 ? 's' : ''} affiché${filtered.length > 1 ? 's' : ''}
                </span>
                <button type="button" class="pro-button outline-button" onclick="resetAllTeacherHwFilters()" style="padding:4px 8px; font-size:0.78rem; height:28px;">
                    <i class="fas fa-undo"></i> Réinitialiser
                </button>
            </div>
        </div>
    `;

    // Grouper par Semaine puis par Classe
    const weeksMap = new Map();
    filtered.forEach(hw => {
        const wKey = String(hw.week || 'Sans Semaine');
        if (!weeksMap.has(wKey)) {
            weeksMap.set(wKey, {
                week: hw.week,
                weekRangeText: hw.weekRangeText || '',
                classesMap: new Map()
            });
        }
        const wObj = weeksMap.get(wKey);
        const cKey = hw.classe || 'Général';
        if (!wObj.classesMap.has(cKey)) {
            wObj.classesMap.set(cKey, []);
        }
        wObj.classesMap.get(cKey).push(hw);
    });

    // Tri des semaines
    const sortedWeeks = Array.from(weeksMap.entries()).sort((a, b) => {
        return (parseInt(a[0]) || 0) - (parseInt(b[0]) || 0);
    });

    let html = breadcrumbsHtml;

    sortedWeeks.forEach(([wKey, wData]) => {
        let totalInWeek = 0;
        let evaluatedInWeek = 0;
        wData.classesMap.forEach(hwList => {
            totalInWeek += hwList.length;
            evaluatedInWeek += hwList.filter(h => h.isEvaluated).length;
        });

        const weekPercent = totalInWeek > 0 ? Math.round((evaluatedInWeek / totalInWeek) * 100) : 0;

        html += `
            <div class="week-evaluation-card" style="background:white; border-radius:16px; margin-bottom:28px; box-shadow:0 6px 20px rgba(0,0,0,0.06); border:1px solid #E2E8F0; overflow:hidden;">
                <!-- En-tête de la Semaine -->
                <div style="background:linear-gradient(135deg, #1E293B 0%, #334155 100%); color:white; padding:16px 24px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">
                    <div style="display:flex; align-items:center; gap:12px;">
                        <span style="background:#3B82F6; color:white; padding:6px 14px; border-radius:10px; font-weight:800; font-size:1.05rem; letter-spacing:0.5px;">
                            <i class="fas fa-calendar-week"></i> SEMAINE ${wKey}
                        </span>
                        ${wData.weekRangeText ? `<span style="color:#CBD5E1; font-weight:600; font-size:0.92rem;"><i class="far fa-clock"></i> ${wData.weekRangeText}</span>` : ''}
                    </div>
                    <div style="display:flex; align-items:center; gap:15px;">
                        <div style="text-align:right;">
                            <div style="font-size:0.85rem; color:#94A3B8;">Progression Évaluations</div>
                            <div style="font-weight:700; font-size:0.95rem; color:${evaluatedInWeek === totalInWeek ? '#34D399' : '#FBBF24'};">
                                ${evaluatedInWeek} / ${totalInWeek} Évalués (${weekPercent}%)
                            </div>
                        </div>
                        <div style="width:70px; height:8px; background:rgba(255,255,255,0.2); border-radius:10px; overflow:hidden;">
                            <div style="width:${weekPercent}%; height:100%; background:${evaluatedInWeek === totalInWeek ? '#10B981' : '#F59E0B'}; border-radius:10px;"></div>
                        </div>
                    </div>
                </div>

                <!-- Contenu des classes de la Semaine -->
                <div style="padding:20px 24px;">
        `;

        // Trier les classes dans la semaine
        const sortedClasses = Array.from(wData.classesMap.entries()).sort((a, b) => compareClasses(a[0], b[0]));

        sortedClasses.forEach(([cKey, homeworksList]) => {
            const arCls = (typeof classTranslations !== 'undefined' && classTranslations[cKey]) ? classTranslations[cKey] : '';
            const classTitle = arCls ? `${arCls} (${cKey})` : cKey;

            html += `
                <div style="margin-bottom:24px; padding-bottom:16px; border-bottom:1px solid #F1F5F9;">
                    <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:14px; flex-wrap:wrap; gap:8px;">
                        <h4 style="margin:0; font-size:1.1rem; color:#1E1B4B; display:flex; align-items:center; gap:8px;">
                            <span style="display:inline-block; width:10px; height:10px; background:#4F46E5; border-radius:50%;"></span>
                            <i class="fas fa-users" style="color:#6366F1;"></i> Classe : <strong>${classTitle}</strong>
                        </h4>
                        <div style="display:flex; align-items:center; gap:8px;">
                            <span style="font-size:0.82rem; font-weight:700; color:#64748B; background:#F8FAFC; padding:4px 10px; border-radius:8px; border:1px solid #E2E8F0;">
                                ${homeworksList.length} Devoir(s)
                            </span>
                        </div>
                    </div>

                    <!-- Grille des devoirs donnés pour cette classe -->
                    <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(320px, 1fr)); gap:18px;">
            `;

            homeworksList.forEach(hw => {
                const globalIndex = allTeacherHomeworks.indexOf(hw);
                const isEvaluated = !!hw.isEvaluated;

                const cardBg = isEvaluated ? '#F0FDF4' : '#FFFFFF';
                const cardBorder = isEvaluated ? '2px solid #10B981' : '1px solid #CBD5E1';
                const shadow = isEvaluated ? '0 4px 15px rgba(16, 185, 129, 0.12)' : '0 3px 10px rgba(0,0,0,0.04)';

                const subjInfo = getSubjectIconAndColor(hw.matiere);
                const dayInfo = getDayIconAndDetails(hw.jour);

                const secBadge = hw.section === 'garcons' ? 'Garçons' : (hw.section === 'filles' ? 'Filles' : (hw.section === 'primaire' ? 'Primaire' : ''));

                html += `
                    <div style="background:${cardBg}; border:${cardBorder}; border-radius:14px; padding:18px; box-shadow:${shadow}; display:flex; flex-direction:column; justify-content:space-between; transition:transform 0.2s, box-shadow 0.2s; position:relative;">
                        
                        <!-- Ruban / Badge d'état -->
                        <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:12px; gap:8px;">
                            <div style="display:flex; flex-wrap:wrap; gap:6px; align-items:center;">
                                <span style="background:${subjInfo.bg}; color:${subjInfo.color}; border:1px solid ${subjInfo.border}; padding:3px 8px; border-radius:6px; font-weight:700; font-size:0.78rem; display:inline-flex; align-items:center; gap:5px;">
                                    <i class="${subjInfo.icon}"></i> ${escapeHtml(hw.matiere || 'Matière')}
                                </span>
                                ${hw.jour ? `<span style="background:#F8FAFC; color:#334155; border:1px solid #E2E8F0; padding:3px 8px; border-radius:6px; font-weight:600; font-size:0.78rem; display:inline-flex; align-items:center; gap:4px;"><i class="${dayInfo.icon}" style="color:${dayInfo.color};"></i> ${escapeHtml(hw.jour)}</span>` : ''}
                                ${secBadge ? `<span style="background:#EFF6FF; color:#1D4ED8; border:1px solid #BFDBFE; padding:3px 8px; border-radius:6px; font-weight:700; font-size:0.75rem;"><i class="fas fa-school"></i> ${escapeHtml(secBadge)}</span>` : ''}
                                ${hw.periode ? `<span style="background:#FEF3C7; color:#92400E; padding:3px 8px; border-radius:6px; font-weight:600; font-size:0.78rem;">Période ${escapeHtml(hw.periode)}</span>` : ''}
                            </div>

                            ${isEvaluated ? `
                                <span style="background:#10B981; color:white; padding:4px 10px; border-radius:8px; font-weight:800; font-size:0.78rem; display:inline-flex; align-items:center; gap:5px; box-shadow:0 2px 6px rgba(16,185,129,0.3);">
                                    <i class="fas fa-check-circle"></i> Évalué
                                </span>
                            ` : `
                                <span style="background:#F59E0B; color:white; padding:4px 10px; border-radius:8px; font-weight:800; font-size:0.78rem; display:inline-flex; align-items:center; gap:5px;">
                                    <i class="fas fa-clock"></i> À Évaluer
                                </span>
                            `}
                        </div>

                        <!-- Info leçon -->
                        ${hw.lecon ? `
                            <div style="font-size:0.85rem; color:#475569; margin-bottom:10px; line-height:1.35;">
                                <strong style="color:#1E293B;"><i class="fas fa-graduation-cap" style="color:#6366F1;"></i> Leçon :</strong> ${escapeHtml(hw.lecon)}
                            </div>
                        ` : ''}

                        <!-- ÉNONCÉ DU DEVOIR MIS EN ÉVIDENCE -->
                        <div style="background:${isEvaluated ? '#DCFCE7' : '#F8FAFC'}; border:1px solid ${isEvaluated ? '#86EFAC' : '#E2E8F0'}; border-left:4px solid ${isEvaluated ? '#10B981' : '#3B82F6'}; border-radius:10px; padding:12px; margin:10px 0 16px 0;">
                            <div style="font-size:0.75rem; font-weight:800; text-transform:uppercase; color:${isEvaluated ? '#047857' : '#2563EB'}; margin-bottom:4px; display:flex; align-items:center; gap:5px;">
                                <i class="fas fa-book-open"></i> Énoncé du Devoir :
                            </div>
                            <div style="font-size:0.95rem; font-weight:600; color:#0F172A; line-height:1.45; word-break:break-word;">
                                ${escapeHtml(hw.devoir || 'Aucun énoncé')}
                            </div>
                        </div>

                        <!-- Date et boutons d'action -->
                        <div style="margin-top:auto;">
                            <div style="display:flex; justify-content:space-between; align-items:center; font-size:0.8rem; color:#64748B; margin-bottom:12px;">
                                <span><i class="far fa-calendar-alt"></i> Date : <strong>${hw.formattedDateFr || hw.date}</strong></span>
                                <span><i class="fas fa-user-tie"></i> ${escapeHtml(hw.enseignant || 'Enseignant')}</span>
                            </div>

                            <div style="display:flex; gap:8px; align-items:center;">
                                <button type="button" class="pro-button ${isEvaluated ? 'success-button' : 'primary-button'}" onclick="openTeacherEvalModal(${globalIndex})" style="flex:1; padding:10px 14px; font-weight:700; font-size:0.88rem; justify-content:center; gap:8px;">
                                    <i class="fas ${isEvaluated ? 'fa-check-double' : 'fa-edit'}"></i>
                                    <span>${isEvaluated ? 'Modifier / Revoir' : 'Saisir l\'Évaluation'}</span>
                                </button>
                                <button type="button" class="pro-button" onclick="if(typeof openTeacherMessagesModal==='function'){ openTeacherMessagesModal(); } else if(typeof openParentMessengerModal==='function'){ openParentMessengerModal(); }" title="Messagerie avec les parents" style="padding:10px 13px; background:#EFF6FF; color:#1D4ED8; border:1.5px solid #BFDBFE; border-radius:10px; cursor:pointer;" onmouseover="this.style.background='#DBEAFE'" onmouseout="this.style.background='#EFF6FF'">
                                    <i class="fas fa-comment-dots"></i>
                                </button>
                            </div>
                        </div>
                    </div>
                `;
            });

            html += `
                    </div>
                </div>
            `;
        });

        html += `
                </div>
            </div>
        `;
    });

    container.innerHTML = html;
}

async function openTeacherEvalModal(hwIndex) {
    const hw = allTeacherHomeworks[hwIndex];
    if (!hw) {
        displayAlert("Devoir introuvable.", true);
        return;
    }

    activeEvalHomework = hw;
    const modal = document.getElementById('teacherEvalSheetModal');
    if (!modal) return;

    // Remplir les informations d'en-tête
    const bWeek = document.getElementById('evalModalBadgeWeek');
    const bClass = document.getElementById('evalModalBadgeClass');
    const bSubj = document.getElementById('evalModalBadgeSubject');
    const bDate = document.getElementById('evalModalBadgeDate');
    const stEl = document.getElementById('evalModalHomeworkStatement');
    const lEl = document.getElementById('evalModalLessonInfo');
    const titleEl = document.getElementById('evalModalTitle');

    const arCls = classTranslations[hw.classe];
    const classDisplay = arCls ? `${arCls} (${hw.classe})` : hw.classe;

    if (bWeek) bWeek.textContent = `Semaine ${hw.week}`;
    if (bClass) bClass.textContent = `Classe : ${classDisplay}`;
    if (bSubj) bSubj.textContent = `Matière : ${hw.matiere || 'Devoir'}`;
    if (bDate) bDate.textContent = `Date : ${hw.formattedDateFr || hw.date}`;
    if (stEl) stEl.textContent = hw.devoir || 'Aucun énoncé spécifié';
    if (lEl) lEl.textContent = hw.lecon ? `Leçon : ${hw.lecon}` : '';
    if (titleEl) titleEl.textContent = `Évaluation : ${hw.matiere || 'Devoir'} - ${classDisplay}`;

    // Afficher le modal
    modal.style.display = 'block';

    // Charger les élèves et les évaluations existantes
    const tableWrapper = document.getElementById('evalModalStudentsTableWrapper');
    if (tableWrapper) {
        tableWrapper.innerHTML = `
            <div style="text-align:center; padding:30px; color:#475569;">
                <i class="fas fa-spinner fa-spin fa-2x" style="color:#2563EB; margin-bottom:8px;"></i>
                <p>Chargement de la liste des élèves de la classe...</p>
            </div>
        `;
    }

    try {
        const section = currentSection || 'garcons';
        const canonicalClass = (typeof getCanonicalClassCode === 'function') ? getCanonicalClassCode(hw.classe) : (hw.classe || '').trim();
        const [stRes, evRes] = await Promise.all([
            fetch(`/api/admin/students?class=${encodeURIComponent(canonicalClass || hw.classe)}&section=${encodeURIComponent(section)}&_t=${Date.now()}`, { cache: 'no-store' }),
            fetch(`/api/evaluations?class=${encodeURIComponent(canonicalClass || hw.classe)}&date=${encodeURIComponent(hw.date)}&section=${encodeURIComponent(section)}&_t=${Date.now()}`, { cache: 'no-store' })
        ]);

        if (!stRes.ok) throw new Error("Erreur chargement élèves");
        const students = await stRes.json();
        activeEvalStudents = (students || []).filter(s => s && s.name);
        // Trier les élèves strictement dans le même ordre alphabétique que l'espace parent et admin
        activeEvalStudents.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'fr', { sensitivity: 'base', numeric: true }));

        let existingEvaluations = [];
        if (evRes.ok) {
            const evData = await evRes.json();
            existingEvaluations = evData.evaluations || [];
        }

        if (activeEvalStudents.length === 0) {
            tableWrapper.innerHTML = `
                <div style="background:#FEF2F2; padding:20px; border-radius:10px; text-align:center; color:#991B1B;">
                    <i class="fas fa-user-slash fa-2x" style="margin-bottom:6px;"></i>
                    <p>Aucun élève trouvé enregistré pour la classe <strong>${classDisplay}</strong>.</p>
                </div>
            `;
            return;
        }

        // Construire la table de saisie
        let tableHtml = `
            <table class="users-table" style="width:100%; border-collapse:collapse; background:white;">
                <thead>
                    <tr style="background:#F1F5F9; color:#1E293B;">
                        <th style="padding:10px; border:1px solid #E2E8F0; text-align:left;">#</th>
                        <th style="padding:10px; border:1px solid #E2E8F0; text-align:left;">Nom de l'Élève</th>
                        <th style="padding:10px; border:1px solid #E2E8F0; text-align:center; min-width:140px;">Statut du Devoir</th>
                        <th style="padding:10px; border:1px solid #E2E8F0; text-align:center; width:100px;">Participation (/10)</th>
                        <th style="padding:10px; border:1px solid #E2E8F0; text-align:center; width:100px;">Comportement (/10)</th>
                        <th style="padding:10px; border:1px solid #E2E8F0; text-align:left;">Remarque</th>
                        <th style="padding:10px; border:1px solid #E2E8F0; text-align:center; width:90px;">Parent</th>
                    </tr>
                </thead>
                <tbody>
        `;

        activeEvalStudents.forEach((st, idx) => {
            const stNorm = typeof normalizeClientName === 'function' ? normalizeClientName(st.name) : st.name.toLowerCase();
            const ev = existingEvaluations.find(e => {
                const eNorm = typeof normalizeClientName === 'function' ? normalizeClientName(e.studentName) : (e.studentName || '').toLowerCase();
                const isNameMatch = (e.studentName === st.name) || (eNorm === stNorm) || (stNorm.length >= 3 && (eNorm.includes(stNorm) || stNorm.includes(eNorm)));
                const isSubjMatch = (e.subject === hw.matiere || !e.subject || !hw.matiere);
                return isNameMatch && isSubjMatch;
            }) || {};
            const curStatus = ev.status || 'Fait';
            const curPart = (ev.participation !== undefined && ev.participation !== null) ? ev.participation : 10;
            const curBeh = (ev.behavior !== undefined && ev.behavior !== null) ? ev.behavior : 10;
            const curComm = ev.comment || '';

            tableHtml += `
                <tr style="border-bottom:1px solid #E2E8F0;">
                    <td style="padding:10px; border:1px solid #E2E8F0; font-weight:700; color:#64748B;">${idx + 1}</td>
                    <td style="padding:10px; border:1px solid #E2E8F0;">
                        <div style="font-weight:700; color:#0F172A; font-size:0.95rem;">${escapeHtml(st.name)}</div>
                    </td>
                    <td style="padding:10px; border:1px solid #E2E8F0; text-align:center;">
                        <select class="modal-eval-status" data-student="${escapeHtml(st.name)}" style="width:100%; padding:7px 10px; border-radius:6px; border:1px solid #CBD5E1; font-weight:700;">
                            <option value="Fait" ${curStatus === 'Fait' ? 'selected' : ''}>✅ Fait</option>
                            <option value="Partiellement Fait" ${curStatus === 'Partiellement Fait' ? 'selected' : ''}>⚠️ Partiellement Fait</option>
                            <option value="Non Fait" ${curStatus === 'Non Fait' ? 'selected' : ''}>❌ Non Fait</option>
                            <option value="Absent" ${curStatus === 'Absent' ? 'selected' : ''}>⚪ Absent</option>
                        </select>
                    </td>
                    <td style="padding:10px; border:1px solid #E2E8F0; text-align:center;">
                        <input type="number" min="0" max="10" value="${curPart}" class="modal-eval-part" data-student="${escapeHtml(st.name)}" style="width:75px; padding:6px; text-align:center; border-radius:6px; border:1px solid #CBD5E1; font-weight:700;">
                    </td>
                    <td style="padding:10px; border:1px solid #E2E8F0; text-align:center;">
                        <input type="number" min="0" max="10" value="${curBeh}" class="modal-eval-beh" data-student="${escapeHtml(st.name)}" style="width:75px; padding:6px; text-align:center; border-radius:6px; border:1px solid #CBD5E1; font-weight:700;">
                    </td>
                    <td style="padding:10px; border:1px solid #E2E8F0;">
                        <input type="text" value="${escapeHtml(curComm)}" class="modal-eval-comm" data-student="${escapeHtml(st.name)}" placeholder="Observation / Remarque" style="width:100%; padding:6px 10px; border-radius:6px; border:1px solid #CBD5E1;">
                    </td>
                    <td style="padding:10px; border:1px solid #E2E8F0; text-align:center;">
                        <button type="button" onclick="contactParentFromEval('${escapeHtml(st.name).replace(/'/g, "\\'")}', '${escapeHtml(st.parentPhone || '').replace(/'/g, "\\'")}', '${escapeHtml(classDisplay).replace(/'/g, "\\'")}', '${escapeHtml(hw.matiere || '').replace(/'/g, "\\'")}', '${escapeHtml(hw.formattedDateFr || hw.date || '').replace(/'/g, "\\'")}')" class="pro-button" style="padding:5px 8px; font-size:0.75rem; background:#EFF6FF; color:#1D4ED8; border:1px solid #BFDBFE; border-radius:6px; font-weight:700; white-space:nowrap; cursor:pointer;" title="Envoyer un message au parent">
                            <i class="fas fa-comment-dots"></i> Message
                        </button>
                    </td>
                </tr>
            `;
        });

        tableHtml += `
                </tbody>
            </table>
        `;

        tableWrapper.innerHTML = tableHtml;
    } catch (e) {
        console.error('Erreur chargement formulaire evaluation:', e);
        tableWrapper.innerHTML = `
            <div style="background:#FEF2F2; padding:15px; border-radius:8px; color:#991B1B;">
                Erreur lors du chargement des élèves : ${e.message}
            </div>
        `;
    }
}

function closeTeacherEvalSheetModal() {
    const modal = document.getElementById('teacherEvalSheetModal');
    if (modal) modal.style.display = 'none';
    activeEvalHomework = null;
}

function setAllStudentsStatus(statusVal, partVal, behVal) {
    const statuses = document.querySelectorAll('.modal-eval-status');
    const parts = document.querySelectorAll('.modal-eval-part');
    const behs = document.querySelectorAll('.modal-eval-beh');

    statuses.forEach(s => { s.value = statusVal; });
    if (partVal !== undefined) parts.forEach(p => { p.value = partVal; });
    if (behVal !== undefined) behs.forEach(b => { b.value = behVal; });
}

async function submitCurrentHomeworkEvaluation() {
    if (!activeEvalHomework) {
        displayAlert("Aucun devoir actif sélectionné.", true);
        return;
    }

    const btn = document.getElementById('btnSaveEvalModal');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enregistrement en cours...';
    }

    try {
        const hw = activeEvalHomework;
        const section = currentSection || 'garcons';
        const canonicalClass = (typeof getCanonicalClassCode === 'function') ? getCanonicalClassCode(hw.classe) : (hw.classe || '').trim();
        const statusEls = document.querySelectorAll('.modal-eval-status');
        const evaluations = [];

        statusEls.forEach(stEl => {
            const studentName = stEl.getAttribute('data-student');
            const status = stEl.value;
            const partEl = document.querySelector(`.modal-eval-part[data-student="${studentName}"]`);
            const behEl = document.querySelector(`.modal-eval-beh[data-student="${studentName}"]`);
            const commEl = document.querySelector(`.modal-eval-comm[data-student="${studentName}"]`);

            evaluations.push({
                studentName,
                class: canonicalClass || hw.classe,
                rawClass: hw.classe,
                date: hw.date,
                subject: hw.matiere,
                status,
                participation: parseInt(partEl?.value || 10),
                behavior: parseInt(behEl?.value || 10),
                comment: commEl?.value || '',
                section,
                evaluatedBy: loggedInUser || 'Enseignant'
            });
        });

        const res = await fetch('/api/evaluations', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ evaluations, section })
        });

        if (!res.ok) throw new Error("Échec de l'enregistrement de l'évaluation.");

        // Recalculer les étoiles journalières
        await fetch('/api/daily-stars', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ date: hw.date, section })
        }).catch(err => console.warn('Erreur recalcul daily-stars:', err));

        // Marquer le devoir comme évalué dans l'état local (Devient VERT immédiatement !)
        hw.isEvaluated = true;

        closeTeacherEvalSheetModal();
        renderTeacherHomeworksDashboard();

        displayAlert("Évaluation enregistrée avec succès ! Le devoir est désormais marqué comme Évalué (Vert).", false);
    } catch (e) {
        console.error('Erreur submitCurrentHomeworkEvaluation:', e);
        displayAlert(`Erreur : ${e.message}`, true);
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-save"></i> Enregistrer l\'Évaluation';
        }
    }
}

// Fonctions de compatibilité
async function loadTeacherHomeworks() {
    loadTeacherHomeworksDashboard();
}

async function saveTeacherEvaluations(className, dateStr) {
    submitCurrentHomeworkEvaluation();
}

// ==========================================
// 1. MODULE SUPERVISION DES MESSAGES (ADMIN)
// ==========================================
let allAdminMessagesCache = [];

async function loadAdminAllMessages() {
    const container = document.getElementById('adminMessagesListContainer');
    const secFilter = document.getElementById('adminMsgSectionFilter');
    const totalCountEl = document.getElementById('adminMsgTotalCount');
    const repliedCountEl = document.getElementById('adminMsgRepliedCount');
    const pendingCountEl = document.getElementById('adminMsgPendingCount');

    if (!container) return;

    container.innerHTML = `
        <div style="text-align:center; padding:35px; color:#64748B;">
            <i class="fas fa-spinner fa-spin fa-2x" style="color:#2563EB; margin-bottom:10px;"></i>
            <p style="font-weight:600; margin:0;">Chargement de tous les échanges enseignants - parents...</p>
        </div>
    `;

    const section = secFilter ? secFilter.value : 'all';
    try {
        const res = await fetch(`/api/admin/all-messages?section=${section}&adminUser=${encodeURIComponent(loggedInUser || 'Admin')}`);
        if (!res.ok) throw new Error(`Erreur ${res.status}`);
        const data = await res.json();
        allAdminMessagesCache = data.messages || [];

        // Mise à jour des compteurs statistiques
        if (totalCountEl) totalCountEl.textContent = (data.stats && data.stats.total !== undefined) ? data.stats.total : allAdminMessagesCache.length;
        if (repliedCountEl) repliedCountEl.textContent = (data.stats && data.stats.replied !== undefined) ? data.stats.replied : allAdminMessagesCache.filter(m => m.replies && m.replies.length > 0).length;
        if (pendingCountEl) pendingCountEl.textContent = (data.stats && data.stats.pending !== undefined) ? data.stats.pending : allAdminMessagesCache.filter(m => !m.replies || m.replies.length === 0).length;

        renderAdminMessagesList(allAdminMessagesCache);
    } catch (err) {
        console.error('Erreur loadAdminAllMessages:', err);
        container.innerHTML = `<div style="background:#FEE2E2; color:#991B1B; padding:15px; border-radius:10px; font-weight:600; text-align:center;">Erreur de chargement: ${err.message}</div>`;
    }
}

function filterAdminMessagesLocally() {
    const searchVal = (document.getElementById('adminMsgSearchInput')?.value || '').toLowerCase().trim();
    if (!searchVal) {
        renderAdminMessagesList(allAdminMessagesCache);
        return;
    }

    const filtered = allAdminMessagesCache.filter(m => {
        const parentName = (m.parentName || '').toLowerCase();
        const teacherName = (m.teacherName || '').toLowerCase();
        const phone = (m.parentPhone || '').toLowerCase();
        const msg = (m.message || '').toLowerCase();
        const replies = (m.replies || []).map(r => (r.message || '') + ' ' + (r.senderName || '')).join(' ').toLowerCase();
        return parentName.includes(searchVal) || teacherName.includes(searchVal) || phone.includes(searchVal) || msg.includes(searchVal) || replies.includes(searchVal);
    });

    renderAdminMessagesList(filtered);
}

function renderAdminMessagesList(messages) {
    const container = document.getElementById('adminMessagesListContainer');
    if (!container) return;

    if (!messages || messages.length === 0) {
        container.innerHTML = `
            <div style="text-align:center; padding:40px; background:#F8FAFC; border:1px dashed #CBD5E1; border-radius:14px; color:#64748B;">
                <i class="fas fa-inbox fa-3x" style="color:#CBD5E1; margin-bottom:12px;"></i>
                <h4 style="margin:0 0 6px 0; color:#334155;">Aucun message trouvé</h4>
                <p style="margin:0; font-size:0.9rem;">Aucun échange ne correspond aux filtres actuels.</p>
            </div>
        `;
        return;
    }

    let html = '';
    messages.forEach(msg => {
        const hasReplies = msg.replies && msg.replies.length > 0;
        const statusBadge = hasReplies
            ? `<span style="background:#ECFDF5; color:#047857; border:1px solid #A7F3D0; font-size:0.75rem; font-weight:700; padding:3px 8px; border-radius:6px;"><i class="fas fa-check-circle"></i> Répondu (${msg.replies.length})</span>`
            : `<span style="background:#FFFBEB; color:#B45309; border:1px solid #FDE68A; font-size:0.75rem; font-weight:700; padding:3px 8px; border-radius:6px;"><i class="fas fa-clock"></i> En attente de réponse</span>`;

        const secBadge = msg.section === 'garcons'
            ? `<span style="background:#EFF6FF; color:#1D4ED8; font-size:0.75rem; font-weight:700; padding:3px 8px; border-radius:6px;">👦 Garçons</span>`
            : (msg.section === 'filles'
                ? `<span style="background:#FDF2F8; color:#BE185D; font-size:0.75rem; font-weight:700; padding:3px 8px; border-radius:6px;">👧 Filles</span>`
                : `<span style="background:#ECFDF5; color:#047857; font-size:0.75rem; font-weight:700; padding:3px 8px; border-radius:6px;">👶 Primaire</span>`);

        const dateStr = msg.createdAt ? new Date(msg.createdAt).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : 'Date inconnue';

        let repliesHtml = '';
        if (hasReplies) {
            repliesHtml = `
                <div style="margin-top:12px; padding-top:12px; border-top:1px dashed #E2E8F0;">
                    <div style="font-size:0.8rem; font-weight:700; color:#475569; margin-bottom:8px; text-transform:uppercase;">
                        <i class="fas fa-reply"></i> Réponses de l'enseignant (${msg.replies.length}) :
                    </div>
                    <div style="display:flex; flex-direction:column; gap:8px;">
            `;
            msg.replies.forEach(rep => {
                const repDate = rep.createdAt ? new Date(rep.createdAt).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : '';
                repliesHtml += `
                    <div style="background:#F0FDF4; border:1px solid #DCFCE7; border-radius:8px; padding:10px 14px;">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                            <strong style="color:#166534; font-size:0.88rem;"><i class="fas fa-user-check"></i> ${escapeHtml(rep.senderName || msg.teacherName || 'Enseignant')}</strong>
                            <span style="color:#65A30D; font-size:0.75rem;">${repDate}</span>
                        </div>
                        <div style="color:#1E293B; font-size:0.92rem; line-height:1.4;">${escapeHtml(rep.message)}</div>
                    </div>
                `;
            });
            repliesHtml += `</div></div>`;
        }

        html += `
            <div style="background:white; border:1px solid #E2E8F0; border-radius:14px; padding:16px 20px; box-shadow:0 2px 8px rgba(0,0,0,0.03);">
                <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:8px; margin-bottom:10px;">
                    <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
                        ${secBadge}
                        ${statusBadge}
                        <span style="font-size:0.8rem; color:#64748B;"><i class="far fa-calendar-alt"></i> ${dateStr}</span>
                    </div>
                    <button type="button" onclick="deleteAdminMessage('${msg._id}')" class="pro-button danger-button" style="padding:4px 10px; font-size:0.75rem;" title="Supprimer ce message">
                        <i class="fas fa-trash-alt"></i> Supprimer
                    </button>
                </div>

                <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap:10px; margin-bottom:10px; background:#F8FAFC; padding:10px 14px; border-radius:10px;">
                    <div>
                        <div style="font-size:0.75rem; color:#64748B; font-weight:700; text-transform:uppercase;">Parent Émetteur</div>
                        <div style="font-weight:700; color:#1E293B; font-size:0.95rem;">👤 ${escapeHtml(msg.parentName || 'Parent')}</div>
                        ${msg.parentPhone ? `<div style="font-size:0.82rem; color:#2563EB;"><i class="fas fa-phone-alt"></i> <a href="tel:${msg.parentPhone}" style="color:#2563EB; text-decoration:none;">${escapeHtml(msg.parentPhone)}</a></div>` : ''}
                    </div>
                    <div>
                        <div style="font-size:0.75rem; color:#64748B; font-weight:700; text-transform:uppercase;">Enseignant Destinataire</div>
                        <div style="font-weight:700; color:#1E293B; font-size:0.95rem;">👨‍🏫 ${escapeHtml(msg.teacherName || 'Enseignant')}</div>
                    </div>
                </div>

                <div style="background:#FFFFFF; border:1px solid #E2E8F0; border-radius:10px; padding:12px 14px; color:#1E293B; font-size:0.95rem; line-height:1.5;">
                    <div style="font-size:0.78rem; font-weight:700; color:#475569; margin-bottom:4px; text-transform:uppercase;">Message du Parent :</div>
                    ${escapeHtml(msg.message)}
                </div>

                ${repliesHtml}
            </div>
        `;
    });

    container.innerHTML = html;
}

async function deleteAdminMessage(msgId) {
    if (!confirm("Êtes-vous sûr de vouloir supprimer définitivement ce message ?")) return;
    try {
        const res = await fetch(`/api/admin/delete-message/${msgId}?adminUser=${encodeURIComponent(loggedInUser || 'Admin')}`, {
            method: 'DELETE'
        });
        const result = await res.json();
        if (res.ok && result.success) {
            displayAlert("Message supprimé avec succès.", false);
            loadAdminAllMessages();
        } else {
            throw new Error(result.message || "Erreur lors de la suppression");
        }
    } catch (err) {
        console.error("Erreur deleteAdminMessage:", err);
        displayAlert("Erreur suppression: " + err.message, true);
    }
}

// ===============================================
// 2. MODULE PUBLICATION DES PLANS HEBDO (ADMIN)
// ===============================================
let adminPublicationStatusMap = {};

async function loadAdminPublicationStatus() {
    const grid = document.getElementById('adminPlanPublicationGrid');
    if (!grid) return;

    const sectionSel = document.getElementById('adminPublicationSectionSelector');
    let section = sectionSel ? sectionSel.value : (currentSection || 'garcons');
    if (sectionSel && !sectionSel.value) {
        sectionSel.value = section;
    }

    grid.innerHTML = `
        <div style="grid-column:1/-1; text-align:center; padding:35px; color:#64748B;">
            <i class="fas fa-spinner fa-spin fa-2x" style="color:#10B981; margin-bottom:10px;"></i>
            <p style="font-weight:600; margin:0;">Chargement des statuts d'autorisation et de publication (${section === 'garcons' ? 'Garçons' : (section === 'filles' ? 'Filles' : 'Primaire')})...</p>
        </div>
    `;

    try {
        const res = await fetch(`/api/plan-publication-status?section=${encodeURIComponent(section)}`);
        if (!res.ok) throw new Error(`Erreur HTTP ${res.status}`);
        const data = await res.json();
        
        adminPublicationStatusMap = data.statusMap || {};
        if (Array.isArray(data.publishedPlans)) {
            data.publishedPlans.forEach(p => {
                if (p.week !== undefined) {
                    adminPublicationStatusMap[p.week] = Boolean(p.published ?? p.isPublishedToParents);
                }
            });
        }

        renderAdminPublicationGrid(section);
    } catch (err) {
        console.error('Erreur loadAdminPublicationStatus:', err);
        grid.innerHTML = `<div style="grid-column:1/-1; color:#DC2626; background:#FEF2F2; border:1px solid #FECACA; border-radius:10px; padding:15px; text-align:center; font-weight:600;">Erreur: ${escapeHtml(err.message)}</div>`;
    }
}

function renderAdminPublicationGrid(section) {
    const grid = document.getElementById('adminPlanPublicationGrid');
    if (!grid) return;

    let html = '';
    const currentW = (typeof getCurrentWeekNumber === 'function' ? getCurrentWeekNumber() : (currentWeek || 1));

    for (let w = 1; w <= 38; w++) {
        const isPublished = (adminPublicationStatusMap[w] !== false);
        const isCurrent = (Number(w) === Number(currentW));

        const cardBg = isPublished ? '#F0FDF4' : '#FEF2F2';
        const borderColor = isPublished ? '#86EFAC' : '#FECACA';
        const statusText = isPublished ? 'Publié aux Parents ✅' : 'Masqué aux Parents 🔒';
        const statusColor = isPublished ? '#15803D' : '#B91C1C';

        const btnBg = isPublished ? '#EF4444' : '#10B981';
        const btnText = isPublished ? '🔒 Masquer aux Parents' : '✅ Autoriser & Publier';

        html += `
            <div style="background:${cardBg}; border:1.5px solid ${borderColor}; border-radius:14px; padding:14px 16px; display:flex; flex-direction:column; justify-content:space-between; gap:10px; box-shadow:0 2px 6px rgba(0,0,0,0.03);">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <div style="display:flex; align-items:center; gap:6px;">
                        <strong style="font-size:1.05rem; color:#1E1B4B;">Semaine ${w}</strong>
                        ${isCurrent ? '<span style="background:#3B82F6; color:white; font-size:0.7rem; font-weight:700; padding:2px 6px; border-radius:6px;">Actuelle</span>' : ''}
                    </div>
                    <span style="font-size:0.8rem; font-weight:700; color:${statusColor};">${statusText}</span>
                </div>
                <div style="font-size:0.8rem; color:#64748B; line-height:1.4;">
                    ${isPublished ? 'Visible par les parents dans leur espace.' : 'Masqué (les parents voient le message de validation).'}
                </div>
                <button type="button" onclick="togglePlanPublication(${w}, '${section}', ${!isPublished})" class="pro-button" style="background:${btnBg}; color:white; border:none; padding:8px 12px; font-size:0.85rem; font-weight:700; border-radius:8px; width:100%; cursor:pointer;">
                    ${btnText}
                </button>
            </div>
        `;
    }

    grid.innerHTML = html;
}

async function togglePlanPublication(weekNumber, section, newStatus) {
    const sec = section || document.getElementById('adminPublicationSectionSelector')?.value || currentSection || 'garcons';
    try {
        const res = await fetch('/api/admin/toggle-plan-publication', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                week: Number(weekNumber),
                weekNumber: Number(weekNumber),
                section: sec,
                published: Boolean(newStatus),
                isPublishedToParents: Boolean(newStatus),
                adminUser: loggedInUser || 'Admin'
            })
        });
        const result = await res.json();
        if (res.ok && (result.success || result.published !== undefined)) {
            adminPublicationStatusMap[weekNumber] = Boolean(newStatus);
            renderAdminPublicationGrid(sec);
            displayAlert(`Semaine ${weekNumber} : ${newStatus ? 'Publiée aux parents avec succès !' : 'Masquée aux parents avec succès.'}`, false);
        } else {
            throw new Error(result.error || result.message || "Erreur mise à jour statut");
        }
    } catch (err) {
        console.error("Erreur togglePlanPublication:", err);
        displayAlert("Erreur: " + err.message, true);
    }
}

async function bulkPublishAllWeeks(status) {
    const sec = document.getElementById('adminPublicationSectionSelector')?.value || currentSection || 'garcons';
    const sectionLabel = (sec === 'garcons' ? 'Section Garçons' : (sec === 'filles' ? 'Section Filles' : 'Section Primaire'));
    const confirmMsg = status
        ? `Voulez-vous autoriser et publier toutes les semaines (1 à 38) pour les parents (${sectionLabel}) ?`
        : `Voulez-vous masquer toutes les semaines (1 à 38) pour les parents (${sectionLabel}) ?`;
    if (!confirm(confirmMsg)) return;

    showProgressBar();
    updateProgressBar(0);
    let count = 0;

    for (let w = 1; w <= 38; w++) {
        try {
            const res = await fetch('/api/admin/toggle-plan-publication', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    week: Number(w),
                    weekNumber: Number(w),
                    section: sec,
                    published: Boolean(status),
                    isPublishedToParents: Boolean(status),
                    adminUser: loggedInUser || 'Admin'
                })
            });
            if (res.ok) {
                adminPublicationStatusMap[w] = Boolean(status);
                count++;
            }
        } catch (e) {
            console.error(`Erreur publication semaine ${w}:`, e);
        }
        updateProgressBar(Math.round((w / 38) * 100));
    }

    hideProgressBar();
    renderAdminPublicationGrid(sec);
    displayAlert(`Opération terminée : ${count}/38 semaines ${status ? 'publiées' : 'masquées'} (${sectionLabel}).`, false);
}

// =========================================================
// 3. MODULE TÉLÉCHARGEMENT PLAN COMPLET PAR CLASSE (WORD & EXCEL)
//    (Accessible à TOUS les enseignants & enseignantes pour
//     toutes les matières et tous les professeurs, totalement indépendant)
// =========================================================

function handleClassFilterChange() {
    sortAndDisplay();
    const selClass = document.getElementById('filterClasse')?.value;
    const btnQuickWord = document.getElementById('btnQuickClassFullWord');
    const btnQuickExcel = document.getElementById('btnQuickClassFullExcel');
    if (btnQuickWord) {
        if (selClass) {
            btnQuickWord.innerHTML = `<i class="fas fa-file-word" style="color:#2563EB;"></i> <span>Word (${escapeHtml(selClass)})</span>`;
            btnQuickWord.title = `Télécharger le document Word complet pour la classe ${selClass}`;
        } else {
            btnQuickWord.innerHTML = `<i class="fas fa-file-word" style="color:#2563EB;"></i> <span>Word Classe</span>`;
            btnQuickWord.title = `Choisir une classe pour télécharger le plan complet Word`;
        }
    }
    if (btnQuickExcel) {
        if (selClass) {
            btnQuickExcel.innerHTML = `<i class="fas fa-file-excel" style="color:#10B981;"></i> <span>Excel (${escapeHtml(selClass)})</span>`;
            btnQuickExcel.title = `Télécharger le fichier Excel complet pour la classe ${selClass}`;
        } else {
            btnQuickExcel.innerHTML = `<i class="fas fa-file-excel" style="color:#10B981;"></i> <span>Excel Classe</span>`;
            btnQuickExcel.title = `Choisir une classe pour télécharger le plan complet Excel`;
        }
    }

    // Synchroniser automatiquement avec le sélecteur de notes si une classe correspondante existe
    const notesSel = document.getElementById('notesClassSelector');
    if (notesSel && selClass) {
        const matchOpt = Array.from(notesSel.options).find(opt => opt.value === selClass || isClassMatch(opt.value, selClass));
        if (matchOpt && matchOpt.value) {
            notesSel.value = matchOpt.value;
            displayClassNotes();
        }
    }
}

function openFullClassWordModal(preselectedClass, preselectedWeek) {
    const modal = document.getElementById('fullClassWordModal');
    const weekSel = document.getElementById('modalWordWeekSelector');
    const classSel = document.getElementById('modalWordClassSelector');
    const chipsContainer = document.getElementById('modalWordQuickClassChips');
    if (!modal) return;

    const currentFilterClass = preselectedClass || document.getElementById('filterClasse')?.value || document.getElementById('notesClassSelector')?.value || '';
    const section = currentSection || 'garcons';
    const classes = getSectionClasses(section);

    let baseWeek = currentWeek || (typeof getCurrentWeekNumber === 'function' ? getCurrentWeekNumber() : 1) || 1;
    if (isMaternelleClass(currentFilterClass) && !preselectedWeek) {
        baseWeek = Math.max(1, baseWeek - 1);
    }
    const curWeek = preselectedWeek || baseWeek;

    if (weekSel) {
        weekSel.innerHTML = '';
        for (let i = 1; i <= 38; i++) {
            const opt = document.createElement('option');
            opt.value = i;
            opt.textContent = `Semaine ${i}` + (i == curWeek ? ' (Semaine active)' : '');
            if (i == curWeek) opt.selected = true;
            weekSel.appendChild(opt);
        }
    }

    // Identifier les classes enseignées par l'utilisateur connecté
    const teacherClasses = new Set();
    if (planData && Array.isArray(planData) && loggedInUser) {
        const norm = (s) => String(s || '').trim().toLowerCase();
        const uE = norm(loggedInUser);
        const uTable = (typeof loggedInTeacherTable !== 'undefined' && loggedInTeacherTable) ? norm(loggedInTeacherTable) : '';
        planData.forEach(row => {
            const ensVal = getRowField(row, 'Enseignant');
            const clsVal = getRowField(row, 'Classe');
            if (ensVal && (norm(ensVal) === uE || (uTable && norm(ensVal) === uTable)) && clsVal) {
                teacherClasses.add(clsVal.trim());
            }
        });
    }

    function syncWeekForWordClass(cls) {
        if (!preselectedWeek && weekSel) {
            let w = currentWeek || (typeof getCurrentWeekNumber === 'function' ? getCurrentWeekNumber() : 1) || 1;
            if (isMaternelleClass(cls)) {
                w = Math.max(1, w - 1);
            }
            weekSel.value = w;
        }
    }

    // Remplir le sélecteur déroulant
    if (classSel) {
        classSel.innerHTML = '';
        classes.forEach(c => {
            const opt = document.createElement('option');
            opt.value = c;
            const isMine = teacherClasses.has(c);
            opt.textContent = (isMine ? '⭐ ' : '') + c + (isMine ? ' (Votre classe)' : '');
            if (c === currentFilterClass) opt.selected = true;
            classSel.appendChild(opt);
        });

        classSel.onchange = () => {
            syncWeekForWordClass(classSel.value);
        };
    }

    // Remplir les puces / boutons de téléchargement rapide en 1 clic
    if (chipsContainer) {
        chipsContainer.innerHTML = '';
        classes.forEach(c => {
            const isMine = teacherClasses.has(c);
            const chipBtn = document.createElement('button');
            chipBtn.type = 'button';
            chipBtn.className = 'pro-button';
            chipBtn.style.padding = '6px 12px';
            chipBtn.style.fontSize = '0.85rem';
            chipBtn.style.fontWeight = '700';
            chipBtn.style.borderRadius = '8px';
            chipBtn.style.cursor = 'pointer';
            chipBtn.style.display = 'inline-flex';
            chipBtn.style.alignItems = 'center';
            chipBtn.style.gap = '6px';
            chipBtn.style.transition = 'all 0.2s ease';

            if (isMine) {
                chipBtn.style.background = '#EFF6FF';
                chipBtn.style.border = '1.5px solid #3B82F6';
                chipBtn.style.color = '#1D4ED8';
                chipBtn.innerHTML = `<span>⭐ ${escapeHtml(c)}</span> <i class="fas fa-arrow-down" style="font-size:0.75rem;"></i>`;
                chipBtn.title = `Sélectionner votre classe ${c}`;
            } else {
                chipBtn.style.background = '#F8FAFC';
                chipBtn.style.border = '1px solid #CBD5E1';
                chipBtn.style.color = '#334155';
                chipBtn.innerHTML = `<span>${escapeHtml(c)}</span>`;
                chipBtn.title = `Sélectionner ${c}`;
            }

            chipBtn.onclick = () => {
                if (classSel) classSel.value = c;
                syncWeekForWordClass(c);
                // Highlighting selected chip
                Array.from(chipsContainer.children).forEach(ch => ch.style.outline = 'none');
                chipBtn.style.outline = '2px solid #2563EB';
            };

            chipsContainer.appendChild(chipBtn);
        });
    }

    modal.style.display = 'flex';
}

function closeFullClassWordModal() {
    const modal = document.getElementById('fullClassWordModal');
    if (modal) modal.style.display = 'none';
}

async function downloadSelectedClassFullWord() {
    const selClass = document.getElementById('filterClasse')?.value || document.getElementById('notesClassSelector')?.value;
    if (selClass) {
        const week = currentWeek || getCurrentWeekNumber() || 1;
        await downloadFullClassWord(week, selClass);
    } else {
        openFullClassWordModal();
    }
}

async function downloadSelectedNotesClassFullWord() {
    const selClass = document.getElementById('notesClassSelector')?.value || document.getElementById('filterClasse')?.value;
    if (selClass) {
        const week = currentWeek || getCurrentWeekNumber() || 1;
        await downloadFullClassWord(week, selClass);
    } else {
        openFullClassWordModal();
    }
}

async function downloadSelectedNotesClassFullDesign() {
    const selClass = document.getElementById('notesClassSelector')?.value || document.getElementById('filterClasse')?.value;
    if (selClass) {
        const week = currentWeek || (typeof getCurrentWeekNumber === 'function' ? getCurrentWeekNumber() : 1) || 1;
        await downloadFullClassDesign(week, selClass, 'indigo', true, true, 'print');
    } else {
        openDesignPlanModal();
    }
}

async function downloadSelectedClassFullExcel() {
    const selClass = document.getElementById('filterClasse')?.value || document.getElementById('notesClassSelector')?.value;
    if (selClass) {
        const week = currentWeek || getCurrentWeekNumber() || 1;
        await downloadFullClassExcel(week, selClass);
    } else {
        openFullClassWordModal();
    }
}

async function downloadFullClassWord(weekNum, className) {
    if (!className) {
        openFullClassWordModal();
        return;
    }

    showProgressBar();
    updateProgressBar(15);
    displayAlert(`Préparation du plan complet Word de la Semaine ${weekNum} pour la classe ${className}...`, false);

    try {
        const section = currentSection || 'garcons';
        updateProgressBar(35);

        let fullPlanData = [];
        try {
            const res = await fetch(`/api/plans/${weekNum}?section=${section}`);
            if (res.ok) {
                const data = await res.json();
                fullPlanData = data.planData || [];
            }
        } catch (e) {
            console.warn("Erreur fetch plan section:", e);
        }

        // Si vide, tenter sans filtre de section ou utiliser les données en mémoire
        if (fullPlanData.length === 0 && weekNum == currentWeek && planData && planData.length > 0) {
            fullPlanData = planData;
        }

        if (fullPlanData.length === 0) {
            try {
                const resAlt = await fetch(`/api/plans/${weekNum}`);
                if (resAlt.ok) {
                    const dataAlt = await resAlt.json();
                    fullPlanData = dataAlt.planData || [];
                }
            } catch (e) {
                console.warn("Erreur fetch plan sans section:", e);
            }
        }

        if (fullPlanData.length === 0) {
            hideProgressBar();
            displayAlert(`Aucune donnée de plan enregistrée pour la Semaine ${weekNum}.`, true);
            return;
        }

        updateProgressBar(75);
        await exportClasseToWordDocx(className, fullPlanData, weekNum, section);
        updateProgressBar(100);
        displayAlert(`✅ Téléchargement réussi du plan Word complet pour ${className} !`, false);
    } catch (err) {
        console.error("Erreur downloadFullClassWord:", err);
        displayAlert("Erreur lors de la génération du plan complet: " + err.message, true);
    } finally {
        setTimeout(hideProgressBar, 800);
    }
}

async function downloadFullClassExcel(weekNum, className) {
    if (!className) {
        openFullClassWordModal();
        return;
    }

    showProgressBar();
    updateProgressBar(15);
    displayAlert(`Préparation du fichier Excel de la Semaine ${weekNum} pour la classe ${className}...`, false);

    try {
        const section = currentSection || 'garcons';
        updateProgressBar(40);

        const payload = {
            week: Number(weekNum),
            section: section,
            classe: className,
            data: (planData && planData.length > 0 && weekNum == currentWeek) ? planData : undefined,
            notes: weeklyClassNotes
        };

        const res = await fetch('/api/generate-excel-workbook', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!res.ok) {
            const errJson = await res.json().catch(() => ({ message: `Erreur ${res.status}` }));
            throw new Error(errJson.message || `Erreur serveur (${res.status})`);
        }

        updateProgressBar(80);
        const blob = await res.blob();
        const cd = res.headers.get('content-disposition');
        let filename = `Plan_Hebdomadaire_S${weekNum}_${section}_${className.replace(/[^a-zA-Z0-9]/g, '_')}.xlsx`;
        if (cd) {
            const m = cd.match(/filename="?(.+?)"?(;|$)/i);
            if (m && m[1]) filename = m[1];
        }

        if (typeof saveAs === 'function') {
            saveAs(blob, filename);
        } else {
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
        }

        updateProgressBar(100);
        displayAlert(`✅ Téléchargement réussi du plan Excel complet pour ${className} !`, false);
    } catch (err) {
        console.error("Erreur downloadFullClassExcel:", err);
        displayAlert("Erreur lors de la génération du plan Excel: " + err.message, true);
    } finally {
        setTimeout(hideProgressBar, 800);
    }
}

async function exportClasseToWordDocx(selectedClass, rawPlanData, weekNum, section) {
    if (!rawPlanData || rawPlanData.length === 0) {
        throw new Error(`Aucune donnée disponible pour la Semaine ${weekNum}.`);
    }

    // 1. Filtrer les séances de la classe avec isClassMatch
    let classRows = rawPlanData.filter(row => {
        if (!row) return false;
        const classVal = getRowField(row, 'Classe') || row['Classe'] || row['classe'] || row[findHKey('Classe')];
        return classVal && isClassMatch(classVal, selectedClass);
    });

    // 2. Si aucune séance avec isClassMatch direct, essayer avec normalisation souple
    if (classRows.length === 0) {
        const targetClean = normalizeClassString(selectedClass);
        classRows = rawPlanData.filter(row => {
            if (!row) return false;
            const classVal = getRowField(row, 'Classe') || row['Classe'] || row['classe'] || row[findHKey('Classe')];
            if (!classVal) return false;
            const cClean = normalizeClassString(classVal);
            return cClean === targetClean || cClean.includes(targetClean) || targetClean.includes(cClean);
        });
    }

    if (classRows.length === 0) {
        throw new Error(`Aucune séance trouvée pour la classe '${selectedClass}' en Semaine ${weekNum}.`);
    }

    const notes = (weeklyClassNotes && (weeklyClassNotes[selectedClass] || (classRows[0] && weeklyClassNotes[classRows[0].Classe]))) || "";

    const payload = {
        week: Number(weekNum),
        classe: selectedClass,
        data: classRows,
        notes: notes,
        section: section || currentSection || 'garcons'
    };

    const res = await fetch('/api/generate-word', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });

    if (!res.ok) {
        const errData = await res.json().catch(() => ({ message: `Erreur serveur ${res.status}` }));
        throw new Error(errData.message || `Erreur génération Word (${res.status})`);
    }

    const blob = await res.blob();
    const cd = res.headers.get('content-disposition');
    let filename = `plan_hebdo_S${weekNum}_${selectedClass.replace(/[^a-zA-Z0-9]/g, '_')}.docx`;
    if (cd) {
        const m = cd.match(/filename="?(.+?)"?(;|$)/i);
        if (m && m[1]) filename = m[1];
    }

    if (typeof saveAs === 'function') {
        saveAs(blob, filename);
    } else {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
    }
}

async function executeFullClassWordDownload(explicitClass) {
    const weekSel = document.getElementById('modalWordWeekSelector');
    const classSel = document.getElementById('modalWordClassSelector');
    const btn = document.getElementById('btnExecuteWordDownload');
    const btnText = document.getElementById('btnExecuteWordText');

    const selectedWeek = weekSel ? weekSel.value : (currentWeek || 1);
    const selectedClass = explicitClass || (classSel ? classSel.value : '');

    if (!selectedClass) {
        alert("Veuillez sélectionner une classe.");
        return;
    }

    if (btn) {
        btn.disabled = true;
        if (btnText) btnText.textContent = "Génération Word...";
    }

    try {
        const section = currentSection || 'garcons';
        displayAlert(`Chargement du plan complet de la Semaine ${selectedWeek} pour la classe ${selectedClass}...`, false);

        let fullPlanData = [];
        try {
            const res = await fetch(`/api/plans/${selectedWeek}?section=${section}`);
            if (res.ok) {
                const data = await res.json();
                fullPlanData = data.planData || [];
            }
        } catch (e) {
            console.warn("Erreur fetch plan section:", e);
        }

        if (fullPlanData.length === 0 && selectedWeek == currentWeek && planData && planData.length > 0) {
            fullPlanData = planData;
        }

        if (fullPlanData.length === 0) {
            try {
                const resAlt = await fetch(`/api/plans/${selectedWeek}`);
                if (resAlt.ok) {
                    const dataAlt = await resAlt.json();
                    fullPlanData = dataAlt.planData || [];
                }
            } catch (e) {
                console.warn("Erreur fetch plan sans section:", e);
            }
        }

        if (fullPlanData.length === 0) {
            alert(`Aucune donnée de plan enregistrée pour la Semaine ${selectedWeek} (${section}).`);
            return;
        }

        displayAlert(`Génération du document Word officiel complet pour ${selectedClass}...`, false);
        await exportClasseToWordDocx(selectedClass, fullPlanData, selectedWeek, section);
        displayAlert(`✅ Téléchargement du plan Word complet pour ${selectedClass} réussi !`, false);
        closeFullClassWordModal();
    } catch (err) {
        console.error("Erreur executeFullClassWordDownload:", err);
        alert("Erreur lors de la génération du document Word: " + err.message);
        displayAlert("Erreur génération Word: " + err.message, true);
    } finally {
        if (btn) {
            btn.disabled = false;
            if (btnText) btnText.textContent = "Télécharger Word (.docx)";
        }
    }
}

async function executeFullClassExcelDownload(explicitClass) {
    const weekSel = document.getElementById('modalWordWeekSelector');
    const classSel = document.getElementById('modalWordClassSelector');
    const btn = document.getElementById('btnExecuteExcelDownload');
    const btnText = document.getElementById('btnExecuteExcelText');

    const selectedWeek = weekSel ? weekSel.value : (currentWeek || 1);
    const selectedClass = explicitClass || (classSel ? classSel.value : '');

    if (!selectedClass) {
        alert("Veuillez sélectionner une classe.");
        return;
    }

    if (btn) {
        btn.disabled = true;
        if (btnText) btnText.textContent = "Génération Excel...";
    }

    try {
        await downloadFullClassExcel(selectedWeek, selectedClass);
        closeFullClassWordModal();
    } catch (err) {
        console.error("Erreur executeFullClassExcelDownload:", err);
        alert("Erreur lors du téléchargement Excel: " + err.message);
    } finally {
        if (btn) {
            btn.disabled = false;
            if (btnText) btnText.textContent = "Télécharger Excel (.xlsx)";
        }
    }
}


// =========================================================================
// NOUVEAU MODÈLE DESIGN STYLISÉ ET GESTION DES PHOTOS DES ENSEIGNANTS (DRIVE)
// =========================================================================

window.currentSelectedDesignTheme = 'indigo';

/**
 * Convertit un lien Google Drive ou URL classique en lien d'image direct
 */
function formatGoogleDriveImageUrl(url) {
    if (!url || typeof url !== 'string') return '';
    const cleanUrl = url.trim();
    if (!cleanUrl) return '';

    // Déjà une image directe
    if (cleanUrl.startsWith('data:image/') || cleanUrl.includes('lh3.googleusercontent.com/d/')) {
        return cleanUrl;
    }

    // Liens Google Drive
    const driveFileMatch = cleanUrl.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
    if (driveFileMatch && driveFileMatch[1]) {
        return `https://lh3.googleusercontent.com/d/${driveFileMatch[1]}`;
    }

    const driveIdMatch = cleanUrl.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    if (driveIdMatch && driveIdMatch[1]) {
        return `https://lh3.googleusercontent.com/d/${driveIdMatch[1]}`;
    }

    const driveUclink = cleanUrl.match(/\/uc\?.*id=([a-zA-Z0-9_-]+)/);
    if (driveUclink && driveUclink[1]) {
        return `https://lh3.googleusercontent.com/d/${driveUclink[1]}`;
    }

    return cleanUrl;
}

/**
 * Aperçu en direct dans le formulaire d'ajout d'enseignant
 */
function updateAdminFormPhotoPreview(url) {
    const previewImg = document.getElementById('adminNewUserPhotoPreview');
    if (!previewImg) return;
    const directUrl = formatGoogleDriveImageUrl(url);
    if (directUrl) {
        previewImg.src = directUrl;
        previewImg.style.display = 'block';
    } else {
        previewImg.src = '';
        previewImg.style.display = 'none';
    }
}

/**
 * Ouvre la boîte de dialogue pour générer le plan hebdomadaire stylisé
 */
function openDesignPlanModal(preselectedClass, preselectedWeek) {
    const modal = document.getElementById('designPlanModal');
    const weekSel = document.getElementById('designModalWeekSelector');
    const classSel = document.getElementById('designModalClassSelector');
    if (!modal) return;

    const currentFilterClass = preselectedClass || document.getElementById('filterClasse')?.value || document.getElementById('notesClassSelector')?.value || '';
    const section = currentSection || 'garcons';
    const classes = getSectionClasses(section);

    let baseWeek = currentWeek || (typeof getCurrentWeekNumber === 'function' ? getCurrentWeekNumber() : 1) || 1;
    if (isMaternelleClass(currentFilterClass) && !preselectedWeek) {
        baseWeek = Math.max(1, baseWeek - 1);
    }
    const curWeek = preselectedWeek || baseWeek;

    if (weekSel) {
        weekSel.innerHTML = '';
        for (let i = 1; i <= 38; i++) {
            const opt = document.createElement('option');
            opt.value = i;
            opt.textContent = `Semaine ${i}` + (i == curWeek ? ' (Semaine active)' : '');
            if (i == curWeek) opt.selected = true;
            weekSel.appendChild(opt);
        }
    }

    function syncWeekForDesignClass(cls) {
        if (!preselectedWeek && weekSel) {
            let w = currentWeek || (typeof getCurrentWeekNumber === 'function' ? getCurrentWeekNumber() : 1) || 1;
            if (isMaternelleClass(cls)) {
                w = Math.max(1, w - 1);
            }
            weekSel.value = w;
        }
    }

    if (classSel) {
        classSel.innerHTML = '';
        classes.forEach(c => {
            const opt = document.createElement('option');
            opt.value = c;
            opt.textContent = c;
            if (c === currentFilterClass) opt.selected = true;
            classSel.appendChild(opt);
        });

        classSel.onchange = () => {
            syncWeekForDesignClass(classSel.value);
        };
    }

    selectDesignTheme(window.currentSelectedDesignTheme || 'indigo');
    modal.style.display = 'flex';
}

function closeDesignPlanModal() {
    const modal = document.getElementById('designPlanModal');
    if (modal) modal.style.display = 'none';
}

function selectDesignTheme(theme) {
    window.currentSelectedDesignTheme = theme || 'indigo';
    const themes = ['indigo', 'emerald', 'multicolor', 'prestige'];
    themes.forEach(t => {
        const card = document.getElementById(`themeCard_${t}`);
        if (card) {
            if (t === theme) {
                card.classList.add('active');
                card.style.borderColor = '#2563EB';
                card.style.boxShadow = '0 4px 14px rgba(37,99,235,0.2)';
            } else {
                card.classList.remove('active');
                card.style.borderColor = '#CBD5E1';
                card.style.boxShadow = 'none';
            }
        }
    });
}

/**
 * Exécute l'action choisie depuis le modal Design (Aperçu / Imprimer ou Télécharger HTML)
 */
async function executeDesignPlanAction(action) {
    const weekSel = document.getElementById('designModalWeekSelector');
    const classSel = document.getElementById('designModalClassSelector');
    const showPhotosCheck = document.getElementById('designOptShowPhotos');
    const highlightHwCheck = document.getElementById('designOptHighlightHomework');

    const selectedWeek = weekSel ? weekSel.value : (currentWeek || 1);
    const selectedClass = classSel ? classSel.value : '';
    const theme = window.currentSelectedDesignTheme || 'indigo';
    const showPhotos = showPhotosCheck ? showPhotosCheck.checked : true;
    const highlightHomework = highlightHwCheck ? highlightHwCheck.checked : true;

    if (!selectedClass) {
        alert("Veuillez sélectionner une classe.");
        return;
    }

    await downloadFullClassDesign(selectedWeek, selectedClass, theme, showPhotos, highlightHomework, action || 'print');
    closeDesignPlanModal();
}

/**
 * Raccourci depuis le modal Word & Excel existant
 */
async function executeFullClassDesignDownload(explicitClass) {
    const weekSel = document.getElementById('modalWordWeekSelector');
    const classSel = document.getElementById('modalWordClassSelector');
    const selectedWeek = weekSel ? weekSel.value : (currentWeek || 1);
    const selectedClass = explicitClass || (classSel ? classSel.value : '');

    if (!selectedClass) {
        alert("Veuillez sélectionner une classe.");
        return;
    }

    closeFullClassWordModal();
    await downloadFullClassDesign(selectedWeek, selectedClass, 'indigo', true, true, 'print');
}

/**
 * Téléchargement direct en 1 clic pour la classe actuellement filtrée
 */
async function downloadSelectedClassFullDesign() {
    const selClass = document.getElementById('filterClasse')?.value || document.getElementById('notesClassSelector')?.value;
    if (selClass) {
        const week = currentWeek || getCurrentWeekNumber() || 1;
        await downloadFullClassDesign(week, selClass, 'indigo', true, true, 'print');
    } else {
        openDesignPlanModal();
    }
}

/**
 * Moteur d'appel et de génération du Plan Hebdomadaire (Design & PDF)
 */
async function downloadFullClassDesign(weekNum, className, theme, showPhotos, highlightHomework, action, isParent = false) {
    if (!className) {
        openDesignPlanModal();
        return;
    }

    showProgressBar();
    updateProgressBar(20);
    displayAlert(`Génération du Plan Hebdomadaire pour la classe ${className} (Semaine ${weekNum})...`, false);

    try {
        const section = currentSection || 'garcons';
        updateProgressBar(45);

        // Récupérer la note active de cette classe (en mémoire ou saisie en direct dans le bloc notes)
        let activeNoteForClass = '';
        if (weeklyClassNotes && weeklyClassNotes[className]) {
            activeNoteForClass = weeklyClassNotes[className];
        }
        const selClassInBox = document.getElementById('notesClassSelector')?.value;
        const noteInTextarea = document.getElementById('notesInput')?.value;
        if (!activeNoteForClass && selClassInBox === className && noteInTextarea && noteInTextarea.trim() !== '') {
            activeNoteForClass = noteInTextarea.trim();
        }

        // Récupérer la photo de la semaine de cette classe
        let activePhotoForClass = '';
        if (typeof weeklyClassNotesPhotos !== 'undefined' && weeklyClassNotesPhotos && weeklyClassNotesPhotos[className]) {
            activePhotoForClass = weeklyClassNotesPhotos[className];
        }
        const photoInInput = document.getElementById('notesPhotoUrlInput')?.value;
        if (!activePhotoForClass && selClassInBox === className && photoInInput && photoInInput.trim() !== '') {
            activePhotoForClass = photoInInput.trim();
        }

        const payload = {
            week: Number(weekNum),
            section: section,
            classe: className,
            theme: theme || 'indigo',
            showPhotos: showPhotos !== false,
            highlightHomework: highlightHomework !== false,
            notes: activeNoteForClass || weeklyClassNotes,
            notesPhoto: activePhotoForClass,
            isParent: isParent === true
        };

        const response = await fetch('/api/generate-design-plan', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const err = await response.json().catch(() => ({ message: `Erreur ${response.status}` }));
            throw new Error(err.message || `Erreur serveur (${response.status})`);
        }

        updateProgressBar(80);
        const htmlContent = await response.text();

        if (action === 'download') {
            // Téléchargement du fichier HTML autonome
            const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
            const filename = `Plan_Hebdomadaire_S${weekNum}_${section}_${className.replace(/[^a-zA-Z0-9]/g, '_')}.html`;
            if (typeof saveAs === 'function') {
                saveAs(blob, filename);
            } else {
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = filename;
                document.body.appendChild(a);
                a.click();
                URL.revokeObjectURL(url);
                document.body.removeChild(a);
            }
            displayAlert(`✅ Fichier Plan Hebdomadaire téléchargé avec succès !`, false);
        } else {
            // Aperçu interactif et boîte d'impression PDF
            const printWindow = window.open('', '_blank');
            if (printWindow) {
                printWindow.document.open();
                printWindow.document.write(htmlContent);
                printWindow.document.close();
                printWindow.focus();
                displayAlert(`✅ Plan Hebdomadaire ouvert dans un nouvel onglet avec aperçu d'impression PDF !`, false);
            } else {
                // Si le popup est bloqué par le navigateur, créer une iframe invisible pour imprimer
                const iframe = document.createElement('iframe');
                iframe.style.position = 'fixed';
                iframe.style.right = '0';
                iframe.style.bottom = '0';
                iframe.style.width = '0';
                iframe.style.height = '0';
                iframe.style.border = 'none';
                document.body.appendChild(iframe);
                iframe.contentWindow.document.open();
                iframe.contentWindow.document.write(htmlContent);
                iframe.contentWindow.document.close();
                setTimeout(() => {
                    iframe.contentWindow.focus();
                    iframe.contentWindow.print();
                    setTimeout(() => document.body.removeChild(iframe), 3000);
                }, 500);
                displayAlert(`✅ Boîte d'impression PDF prête !`, false);
            }
        }
        updateProgressBar(100);
    } catch (err) {
        console.error("Erreur downloadFullClassDesign:", err);
        displayAlert("Erreur lors de la génération du plan hebdomadaire: " + err.message, true);
    } finally {
        setTimeout(hideProgressBar, 800);
    }
}

/**
 * Galerie complète des photos d'enseignants dans l'onglet Admin 10
 */
async function renderAdminTeachersPhotosGallery() {
    const container = document.getElementById('teachersPhotosGalleryContainer');
    const filterEl = document.getElementById('adminPhotoSectionFilter');
    const statusMsg = document.getElementById('adminPhotosStatusMsg');
    if (!container) return;

    const section = (filterEl && filterEl.value) ? filterEl.value : (currentSection || 'garcons');
    container.innerHTML = '<div style="grid-column: 1/-1; text-align:center; padding:30px; color:#64748B;"><i class="fas fa-spinner fa-spin fa-2x"></i><br><br>Chargement des photos des enseignants...</div>';

    try {
        const [usersRes, photosRes] = await Promise.all([
            fetch(`/api/admin/users?section=${section}`).then(r => r.json()).catch(() => []),
            fetch(`/api/teachers-photos?section=${section}`).then(r => r.json()).catch(() => ({}))
        ]);

        const users = usersRes || [];
        const photosMap = photosRes || {};

        if (users.length === 0) {
            container.innerHTML = '<div style="grid-column: 1/-1; text-align:center; padding:30px; color:#64748B;">Aucun enseignant configuré pour cette section.</div>';
            return;
        }

        let html = '';
        users.forEach((u, idx) => {
            const tName = u.tableTeacherName || u.username;
            const currentPhoto = u.photoUrl || photosMap[tName] || photosMap[u.username] || '';
            const directImg = formatGoogleDriveImageUrl(currentPhoto);
            const safeName = escapeHtml(tName);
            const inputId = `teacherPhotoInput_${idx}`;
            const previewId = `teacherPhotoPreview_${idx}`;

            html += `
                <div class="teacher-photo-card" style="background:white; border:1.5px solid #E2E8F0; border-radius:14px; padding:16px; box-shadow:0 2px 8px rgba(0,0,0,0.04); display:flex; flex-direction:column; gap:12px; transition:transform 0.15s ease;">
                    <div style="display:flex; align-items:center; gap:12px;">
                        <div style="position:relative; width:52px; height:52px; border-radius:50%; overflow:hidden; border:2.5px solid #3B82F6; background:#F1F5F9; flex-shrink:0; display:flex; align-items:center; justify-content:center;">
                            <img id="${previewId}" src="${directImg || ''}" alt="${safeName}" style="width:100%; height:100%; object-fit:cover; display:${directImg ? 'block' : 'none'};" onerror="this.style.display='none'; document.getElementById('${previewId}_icon').style.display='block';">
                            <i id="${previewId}_icon" class="fas fa-user" style="font-size:1.4rem; color:#94A3B8; display:${directImg ? 'none' : 'block'};"></i>
                        </div>
                        <div style="min-width:0; flex:1;">
                            <div style="font-weight:800; color:#1E293B; font-size:0.95rem; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${safeName}">${safeName}</div>
                            <div style="font-size:0.78rem; color:#64748B;">Identifiant : <strong>${escapeHtml(u.username)}</strong></div>
                        </div>
                    </div>
                    <div>
                        <label style="font-size:0.8rem; font-weight:700; color:#475569; display:block; margin-bottom:4px;">
                            <i class="fab fa-google-drive" style="color:#0EA5E9;"></i> Lien Google Drive :
                        </label>
                        <input type="text" id="${inputId}" data-teacher-name="${escapeHtml(tName)}" data-user-name="${escapeHtml(u.username)}" value="${escapeHtml(currentPhoto)}" placeholder="https://drive.google.com/file/d/..." oninput="previewTeacherGalleryPhoto('${inputId}', '${previewId}')" style="width:100%; padding:8px 10px; border-radius:8px; border:1px solid #CBD5E1; font-size:0.82rem; background:#F8FAFC;">
                    </div>
                    <div style="display:flex; gap:8px; justify-content:flex-end;">
                        <button type="button" class="pro-button" onclick="previewTeacherGalleryPhoto('${inputId}', '${previewId}', true)" style="padding:6px 10px; font-size:0.78rem; background:#EFF6FF; color:#1E40AF; border:1px solid #BFDBFE; border-radius:6px; font-weight:700;">
                            <i class="fas fa-eye"></i> Tester
                        </button>
                        <button type="button" class="pro-button success-button" onclick="saveSingleTeacherPhoto('${escapeHtml(tName)}', '${inputId}')" style="padding:6px 12px; font-size:0.78rem; font-weight:700; border-radius:6px;">
                            <i class="fas fa-save"></i> Enregistrer
                        </button>
                    </div>
                </div>
            `;
        });

        container.innerHTML = html;
        if (statusMsg) statusMsg.innerHTML = '';
    } catch (err) {
        console.error("Erreur renderAdminTeachersPhotosGallery:", err);
        container.innerHTML = `<div style="grid-column: 1/-1; color:red; padding:20px; text-align:center;">Erreur: ${err.message}</div>`;
    }
}

function previewTeacherGalleryPhoto(inputId, previewId, notify) {
    const input = document.getElementById(inputId);
    const img = document.getElementById(previewId);
    const icon = document.getElementById(`${previewId}_icon`);
    if (!input || !img) return;

    const url = formatGoogleDriveImageUrl(input.value);
    if (url) {
        img.src = url;
        img.style.display = 'block';
        if (icon) icon.style.display = 'none';
        if (notify) displayAlert("✅ Lien Google Drive valide et converti en image directe !", false);
    } else {
        img.src = '';
        img.style.display = 'none';
        if (icon) icon.style.display = 'block';
        if (notify) displayAlert("⚠️ Aucun lien ou format non reconnu.", true);
    }
}

async function saveSingleTeacherPhoto(teacherName, inputId) {
    const input = document.getElementById(inputId);
    if (!input) return;

    const photoUrl = input.value.trim();
    const section = document.getElementById('adminPhotoSectionFilter')?.value || currentSection || 'garcons';
    const userName = input.dataset.userName || teacherName;

    try {
        const response = await fetch('/api/teachers-photos', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ teacherName, userName, photoUrl, section })
        });
        const res = await response.json();
        if (response.ok) {
            displayAlert(`✅ Photo enregistrée pour ${teacherName} !`, false);
        } else {
            throw new Error(res.message);
        }
    } catch (err) {
        displayAlert(`Erreur: ${err.message}`, true);
    }
}

async function saveAllTeachersPhotos() {
    const container = document.getElementById('teachersPhotosGalleryContainer');
    const statusMsg = document.getElementById('adminPhotosStatusMsg');
    if (!container) return;

    const inputs = container.querySelectorAll('input[data-teacher-name]');
    if (inputs.length === 0) return;

    if (statusMsg) statusMsg.innerHTML = '<span style="color:#2563EB;"><i class="fas fa-spinner fa-spin"></i> Enregistrement de toutes les photos en cours...</span>';

    try {
        const section = document.getElementById('adminPhotoSectionFilter')?.value || currentSection || 'garcons';
        let savedCount = 0;

        for (const input of inputs) {
            const teacherName = input.dataset.teacherName;
            const userName = input.dataset.userName;
            const photoUrl = input.value.trim();
            await fetch('/api/teachers-photos', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ teacherName, userName, photoUrl, section })
            });
            savedCount++;
        }

        if (statusMsg) {
            statusMsg.innerHTML = `<span style="color:#10B981;"><i class="fas fa-check-circle"></i> ${savedCount} photos enregistrées avec succès !</span>`;
            setTimeout(() => { if (statusMsg) statusMsg.innerHTML = ''; }, 4000);
        }
        displayAlert(`✅ Toutes les photos d'enseignants ont été enregistrées !`, false);
    } catch (err) {
        if (statusMsg) statusMsg.innerHTML = `<span style="color:#EF4444;"><i class="fas fa-times-circle"></i> Erreur: ${err.message}</span>`;
    }
}

/**
 * Modal individuel pour l'enseignant connecté
 */
async function openTeacherPhotoModal() {
    const modal = document.getElementById('teacherPhotoModal');
    const nameEl = document.getElementById('myPhotoModalTeacherName');
    const linkInput = document.getElementById('myPhotoDriveLinkInput');
    const previewImg = document.getElementById('myPhotoModalPreview');
    const placeholderIcon = document.getElementById('myPhotoModalPlaceholder');
    const statusMsg = document.getElementById('myPhotoStatusMsg');
    if (!modal) return;

    const teacherDisplayName = loggedInTeacherTable || loggedInUser || 'Enseignant';
    if (nameEl) nameEl.textContent = teacherDisplayName;
    if (statusMsg) statusMsg.innerHTML = '';

    // Préremplir la photo actuelle
    try {
        const section = currentSection || 'garcons';
        const res = await fetch(`/api/teachers-photos?section=${section}`);
        if (res.ok) {
            const data = await res.json();
            const photosMap = (data && data.photos) ? data.photos : data;
            const currentUrl = photosMap[teacherDisplayName] || photosMap[loggedInUser] || '';
            if (linkInput) linkInput.value = currentUrl;
            previewMyPhotoDriveLink(currentUrl);
        }
    } catch (e) {
        console.warn("Erreur chargement photo perso:", e);
    }

    modal.style.display = 'flex';
}

function closeTeacherPhotoModal() {
    const modal = document.getElementById('teacherPhotoModal');
    if (modal) modal.style.display = 'none';
}

function previewMyPhotoDriveLink(url) {
    const previewImg = document.getElementById('myPhotoModalPreview');
    const placeholder = document.getElementById('myPhotoModalPlaceholder');
    if (!previewImg || !placeholder) return;

    const direct = formatGoogleDriveImageUrl(url);
    if (direct) {
        previewImg.src = direct;
        previewImg.style.display = 'block';
        placeholder.style.display = 'none';
    } else {
        previewImg.src = '';
        previewImg.style.display = 'none';
        placeholder.style.display = 'block';
    }
}

async function saveMyTeacherPhoto() {
    const linkInput = document.getElementById('myPhotoDriveLinkInput');
    const statusMsg = document.getElementById('myPhotoStatusMsg');
    const photoUrl = linkInput ? linkInput.value.trim() : '';
    const section = currentSection || 'garcons';
    const teacherName = loggedInTeacherTable || loggedInUser;

    if (statusMsg) statusMsg.innerHTML = '<span style="color:#2563EB;"><i class="fas fa-spinner fa-spin"></i> Enregistrement de votre photo...</span>';

    try {
        const res = await fetch('/api/my-teacher-photo', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                username: loggedInUser,
                teacherName: teacherName,
                photoUrl: photoUrl,
                section: section
            })
        });
        const data = await res.json();
        if (res.ok) {
            if (statusMsg) {
                statusMsg.innerHTML = `<span style="color:#10B981;"><i class="fas fa-check-circle"></i> Photo enregistrée avec succès !</span>`;
            }
            loadCurrentUserAvatar(loggedInUser);
            setTimeout(() => {
                closeTeacherPhotoModal();
            }, 1200);
        } else {
            throw new Error(data.message);
        }
    } catch (err) {
        if (statusMsg) {
            statusMsg.innerHTML = `<span style="color:#EF4444;"><i class="fas fa-times-circle"></i> Erreur: ${err.message}</span>`;
        }
    }
}

/**
 * Met à jour l'avatar dans la barre d'en-tête de l'utilisateur
 */
async function loadCurrentUserAvatar(username) {
    const avatarImg = document.getElementById('headerUserAvatar');
    const avatarFallback = document.getElementById('headerUserAvatarFallback');
    if (!avatarImg || !avatarFallback) return;

    if (!username) {
        avatarImg.style.display = 'none';
        avatarFallback.style.display = 'inline-flex';
        return;
    }

    try {
        const section = currentSection || 'garcons';
        const res = await fetch(`/api/teachers-photos?section=${section}`);
        if (res.ok) {
            const data = await res.json();
            const photosMap = (data && data.photos) ? data.photos : data;
            const teacherDisplayName = loggedInTeacherTable || username;
            const photoUrl = photosMap[teacherDisplayName] || photosMap[username] || '';
            const direct = formatGoogleDriveImageUrl(photoUrl);

            if (direct) {
                avatarImg.src = direct;
                avatarImg.onload = () => {
                    avatarImg.style.display = 'block';
                    avatarFallback.style.display = 'none';
                };
                avatarImg.onerror = () => {
                    avatarImg.style.display = 'none';
                    avatarFallback.style.display = 'inline-flex';
                };
            } else {
                avatarImg.style.display = 'none';
                avatarFallback.style.display = 'inline-flex';
            }
        }
    } catch (e) {
        avatarImg.style.display = 'none';
        avatarFallback.style.display = 'inline-flex';
    }
}


// =========================================================================
// GESTION ET RÉORGANISATION DE L'EMPLOI DU TEMPS PAR L'ADMINISTRATION
// =========================================================================

window.currentAdminScheduleSlots = [];
window.adminScheduleTeachersCache = [];
window.adminScheduleSubjectsCache = [];
window.adminScheduleClassesCache = [];
window.adminScheduleMaxPeriod = 7;
window.currentEditingSlot = null;

async function initAdminScheduleTab() {
    const sectionSel = document.getElementById('adminScheduleSectionSelect');
    if (sectionSel) {
        sectionSel.value = currentSection || 'garcons';
    }

    const weekSel = document.getElementById('adminScheduleWeekSelect');
    if (weekSel) {
        weekSel.innerHTML = '';
        for (let w = 1; w <= 38; w++) {
            const opt = document.createElement('option');
            opt.value = String(w);
            opt.textContent = 'Semaine ' + w;
            if (parseInt(currentWeek, 10) === w) opt.selected = true;
            weekSel.appendChild(opt);
        }
        if (!weekSel.value) weekSel.value = "1";
    }

    updateAdminScheduleScopeInfo();
    await populateAdminScheduleClasses();
}

async function populateAdminScheduleClasses() {
    const sectionSel = document.getElementById('adminScheduleSectionSelect');
    const targetSection = (sectionSel && sectionSel.value) ? sectionSel.value : (currentSection || 'garcons');
    const classSel = document.getElementById('adminScheduleClassSelect');
    if (!classSel) return;

    classSel.innerHTML = '<option value="">-- Chargement des classes... --</option>';

    try {
        const response = await fetch('/api/all-classes?section=' + encodeURIComponent(targetSection));
        if (!response.ok) throw new Error('Erreur ' + response.status);
        const classes = await response.json();
        window.adminScheduleClassesCache = classes || [];

        classSel.innerHTML = '<option value="">-- Sélectionnez une classe --</option>';
        window.adminScheduleClassesCache.forEach(c => {
            const opt = document.createElement('option');
            opt.value = c;
            opt.textContent = c;
            classSel.appendChild(opt);
        });

        const mainClassFilter = document.getElementById('classFilter');
        if (mainClassFilter && mainClassFilter.value && window.adminScheduleClassesCache.includes(mainClassFilter.value)) {
            classSel.value = mainClassFilter.value;
        } else if (window.adminScheduleClassesCache.length > 0) {
            classSel.value = window.adminScheduleClassesCache[0];
        }

        if (classSel.value) {
            loadAdminScheduleForClass();
        } else {
            const msg = document.getElementById('adminScheduleGridMessage');
            const tbl = document.getElementById('adminScheduleTable');
            if (msg) {
                msg.style.display = 'block';
                msg.textContent = "Aucune classe trouvée pour cette section. Veuillez importer un plan ou sélectionner une autre section.";
            }
            if (tbl) tbl.style.display = 'none';
        }
    } catch (err) {
        console.error("Erreur populateAdminScheduleClasses:", err);
        classSel.innerHTML = '<option value="">Erreur chargement classes</option>';
    }
}

function onAdminScheduleSectionChange() {
    populateAdminScheduleClasses();
}

function onAdminScheduleWeekChange() {
    updateAdminScheduleScopeInfo();
    loadAdminScheduleForClass();
}

function updateAdminScheduleScopeInfo() {
    const weekSel = document.getElementById('adminScheduleWeekSelect');
    const selWeek = weekSel ? parseInt(weekSel.value, 10) || 1 : 1;
    const radios = document.getElementsByName('adminScheduleScopeRadio');
    let mode = 'single';
    for (const r of radios) {
        if (r.checked) { mode = r.value; break; }
    }

    const summaryText = document.getElementById('adminScheduleScopeSummaryText');
    if (!summaryText) return;

    if (mode === 'single') {
        summaryText.innerHTML = '📌 <strong>Semaine unique :</strong> Les modifications s\'appliqueront <u>exclusivement à la Semaine ' + selWeek + '</u>. Les autres semaines resteront inchangées.';
    } else {
        const remainingCount = 38 - selWeek + 1;
        summaryText.innerHTML = '⏩ <strong>Semaines restantes :</strong> Les modifications s\'appliqueront à <u>' + remainingCount + ' semaine(s)</u> (de la <strong>Semaine ' + selWeek + '</strong> jusqu\'à la <strong>Semaine 38</strong> incluse).';
    }
}

async function loadAdminScheduleForClass() {
    const sectionSel = document.getElementById('adminScheduleSectionSelect');
    const targetSection = (sectionSel && sectionSel.value) ? sectionSel.value : (currentSection || 'garcons');
    const weekSel = document.getElementById('adminScheduleWeekSelect');
    const selectedWeek = weekSel ? (weekSel.value || '1') : '1';
    const classSel = document.getElementById('adminScheduleClassSelect');
    const selectedClass = classSel ? classSel.value : '';

    const msgEl = document.getElementById('adminScheduleGridMessage');
    const tblEl = document.getElementById('adminScheduleTable');
    const noticeEl = document.getElementById('scheduleDataStatsNotice');

    if (!selectedClass) {
        if (msgEl) {
            msgEl.style.display = 'block';
            msgEl.innerHTML = '<i class="fas fa-info-circle"></i> Veuillez sélectionner une classe ci-dessus pour afficher et réorganiser son emploi du temps.';
        }
        if (tblEl) tblEl.style.display = 'none';
        if (noticeEl) noticeEl.innerHTML = '';
        window.currentAdminScheduleSlots = [];
        return;
    }

    if (msgEl) {
        msgEl.style.display = 'block';
        msgEl.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Chargement des créneaux de la classe ' + selectedClass + '...';
    }
    if (tblEl) tblEl.style.display = 'none';

    try {
        const response = await fetch('/api/admin/schedule-class?section=' + encodeURIComponent(targetSection) + '&week=' + encodeURIComponent(selectedWeek) + '&classe=' + encodeURIComponent(selectedClass));
        if (!response.ok) throw new Error('Erreur ' + response.status);
        const data = await response.json();

        window.currentAdminScheduleSlots = data.slots || [];
        window.adminScheduleTeachersCache = data.teachers || [];
        window.adminScheduleSubjectsCache = data.distinctSubjects || [];

        let maxP = 7;
        window.currentAdminScheduleSlots.forEach(s => {
            const pNum = parseInt(s.periode, 10);
            if (!isNaN(pNum) && pNum > maxP) maxP = pNum;
        });
        window.adminScheduleMaxPeriod = Math.max(7, maxP);

        if (noticeEl) {
            if (data.filledSlotsCount > 0) {
                noticeEl.innerHTML = '🛡️ <strong>' + data.filledSlotsCount + ' séance(s)</strong> de cette semaine ont déjà été remplies par les enseignants (leçons, devoirs). <em>Toutes leurs saisies seront intégralement conservées</em> et replacées sur le nouvel horaire.';
            } else {
                noticeEl.innerHTML = '✨ <strong>0 séance remplie</strong> pour cette semaine. L\'emploi du temps sera configuré proprement pour les futurs remplissages.';
            }
        }

        updateScheduleModalDatalists();

        if (msgEl) msgEl.style.display = 'none';
        if (tblEl) tblEl.style.display = 'table';

        renderAdminScheduleGrid();
    } catch (err) {
        console.error("Erreur loadAdminScheduleForClass:", err);
        if (msgEl) {
            msgEl.style.display = 'block';
            msgEl.innerHTML = '<span style="color:red;"><i class="fas fa-exclamation-triangle"></i> Erreur lors du chargement : ' + err.message + '</span>';
        }
    }
}

function updateScheduleModalDatalists() {
    const dl = document.getElementById('slotModalSubjectsDatalist');
    if (dl) {
        dl.innerHTML = '';
        const defaultSubjects = [
            "Mathématiques", "Français", "Langue Arabe", "Sciences", "Physique-Chimie",
            "SVT", "Histoire-Géographie", "Éducation Islamique", "Anglais", "Informatique",
            "Éducation Physique et Sportive (EPS)", "Arts Plastiques", "Éducation Civique"
        ];
        const combined = Array.from(new Set([...defaultSubjects, ...(window.adminScheduleSubjectsCache || [])])).sort();
        combined.forEach(sub => {
            const opt = document.createElement('option');
            opt.value = sub;
            dl.appendChild(opt);
        });
    }

    const tSel = document.getElementById('slotModalTeacherSelect');
    if (tSel) {
        tSel.innerHTML = '<option value="">-- Aucun enseignant spécifié --</option>';
        (window.adminScheduleTeachersCache || []).forEach(t => {
            const opt = document.createElement('option');
            opt.value = t;
            opt.textContent = t;
            tSel.appendChild(opt);
        });
    }
}

function getSubjectBadgeColor(subject) {
    const s = String(subject || '').toLowerCase();
    if (s.includes('math')) return { bg: '#EFF6FF', border: '#93C5FD', text: '#1D4ED8', dot: '#3B82F6' };
    if (s.includes('franç') || s.includes('franc') || s.includes('anglais')) return { bg: '#F0FDF4', border: '#86EFAC', text: '#15803D', dot: '#22C55E' };
    if (s.includes('arab') || s.includes('islam') || s.includes('coran')) return { bg: '#FFFBEB', border: '#FDE68A', text: '#B45309', dot: '#F59E0B' };
    if (s.includes('scienc') || s.includes('phys') || s.includes('svt') || s.includes('chim')) return { bg: '#FAF5FF', border: '#D8B4FE', text: '#7E22CE', dot: '#A855F7' };
    if (s.includes('hist') || s.includes('géo') || s.includes('geo') || s.includes('civ')) return { bg: '#FFF1F2', border: '#FECDD3', text: '#BE123C', dot: '#F43F5E' };
    if (s.includes('sport') || s.includes('eps')) return { bg: '#ECFDF5', border: '#A7F3D0', text: '#047857', dot: '#10B981' };
    if (s.includes('art') || s.includes('dessin') || s.includes('mus')) return { bg: '#FDF4FF', border: '#F5D0FE', text: '#A21CAF', dot: '#D946EF' };
    return { bg: '#F8FAFC', border: '#CBD5E1', text: '#334155', dot: '#64748B' };
}

function renderAdminScheduleGrid() {
    const tbody = document.getElementById('adminScheduleTableBody');
    if (!tbody) return;

    tbody.innerHTML = '';
    const days = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi"];
    const maxP = window.adminScheduleMaxPeriod || 7;

    for (let p = 1; p <= maxP; p++) {
        const tr = document.createElement('tr');
        tr.style.background = (p % 2 === 0) ? '#F8FAFC' : '#FFFFFF';

        const tdPeriod = document.createElement('td');
        tdPeriod.style.padding = '10px';
        tdPeriod.style.textAlign = 'center';
        tdPeriod.style.fontWeight = '800';
        tdPeriod.style.color = '#1E293B';
        tdPeriod.style.background = '#F1F5F9';
        tdPeriod.style.borderRadius = '8px';
        tdPeriod.style.border = '1px solid #CBD5E1';
        tdPeriod.innerHTML = '<span style="display:block; font-size:0.95rem; color:#0284C7;">Période ' + p + '</span><small style="color:#64748B; font-weight:600; font-size:0.75rem;">Séance ' + p + '</small>';
        tr.appendChild(tdPeriod);

        days.forEach(day => {
            const td = document.createElement('td');
            td.style.padding = '8px';
            td.style.verticalAlign = 'top';
            td.style.border = '1px solid #E2E8F0';
            td.style.borderRadius = '8px';
            td.style.minHeight = '75px';
            td.style.width = '18%';

            const slot = (window.currentAdminScheduleSlots || []).find(s => {
                const sDay = (s.jour || '').trim();
                const sPer = String(s.periode || '').replace(/[^0-9]/g, '');
                return sDay.toLowerCase().startsWith(day.toLowerCase()) && sPer === String(p);
            });

            if (slot && slot.matiere) {
                const colors = getSubjectBadgeColor(slot.matiere);
                const hasFilled = Boolean(slot.hasContent);

                td.style.background = colors.bg;
                td.style.borderColor = colors.border;

                let contentBadgeHtml = '';
                if (hasFilled) {
                    const titleText = 'Leçon: ' + (slot.lessonPreview || 'Saisie effectuée') + '&#10;Devoirs: ' + (slot.homeworkPreview || 'Non spécifiés');
                    contentBadgeHtml = '<span title="' + titleText + '" style="display:inline-flex; align-items:center; gap:3px; background:#10B981; color:white; font-size:0.7rem; font-weight:800; padding:2px 6px; border-radius:10px; margin-top:4px;">' +
                        '<i class="fas fa-check-circle" style="font-size:0.65rem;"></i> Saisie existante</span>';
                }

                const matEscaped = typeof escapeHtml === 'function' ? escapeHtml(slot.matiere) : slot.matiere;
                const ensEscaped = typeof escapeHtml === 'function' ? escapeHtml(slot.enseignant || 'Non spécifié') : (slot.enseignant || 'Non spécifié');

                td.innerHTML =
                    '<div style="display:flex; flex-direction:column; height:100%; justify-content:space-between; gap:4px;">' +
                        '<div>' +
                            '<div style="display:flex; justify-content:space-between; align-items:flex-start; gap:4px;">' +
                                '<span style="font-weight:800; font-size:0.88rem; color:' + colors.text + '; display:flex; align-items:center; gap:5px;">' +
                                    '<span style="width:8px; height:8px; border-radius:50%; background:' + colors.dot + '; display:inline-block;"></span>' +
                                    matEscaped +
                                '</span>' +
                                '<button type="button" onclick="clearScheduleSlot(\'' + day + '\', ' + p + ')" title="Vider ce créneau" style="background:none; border:none; color:#EF4444; cursor:pointer; font-size:0.8rem; padding:1px 3px;">' +
                                    '<i class="fas fa-times"></i>' +
                                '</button>' +
                            '</div>' +
                            '<div style="font-size:0.78rem; color:#475569; margin-top:2px; font-weight:600; display:flex; align-items:center; gap:4px;">' +
                                '<i class="fas fa-chalkboard-teacher" style="color:#64748B; font-size:0.75rem;"></i>' +
                                '<span>' + ensEscaped + '</span>' +
                            '</div>' +
                            contentBadgeHtml +
                        '</div>' +
                        '<div style="margin-top:6px; display:flex; justify-content:flex-end; gap:4px;">' +
                            '<button type="button" onclick="openScheduleSlotModal(\'' + day + '\', ' + p + ')" class="pro-button" style="padding:2px 7px; font-size:0.72rem; font-weight:700; background:white; color:#0284C7; border:1px solid #BAE6FD; border-radius:4px; cursor:pointer;">' +
                                '<i class="fas fa-edit"></i> Modifier' +
                            '</button>' +
                        '</div>' +
                    '</div>';
            } else {
                td.style.background = '#FAFAFA';
                td.innerHTML =
                    '<div style="display:flex; flex-direction:column; align-items:center; justify-content:center; height:100%; min-height:60px;">' +
                        '<button type="button" onclick="openScheduleSlotModal(\'' + day + '\', ' + p + ')" style="background:none; border:1px dashed #CBD5E1; border-radius:6px; padding:6px 10px; font-size:0.78rem; color:#64748B; font-weight:600; cursor:pointer; width:100%;">' +
                            '<i class="fas fa-plus" style="font-size:0.7rem;"></i> Assigner' +
                        '</button>' +
                    '</div>';
            }

            tr.appendChild(td);
        });

        tbody.appendChild(tr);
    }
}

function openScheduleSlotModal(day, period) {
    window.currentEditingSlot = { day, period };
    const modal = document.getElementById('scheduleSlotModal');
    const titleEl = document.getElementById('scheduleSlotModalTitle');
    const matInput = document.getElementById('slotModalMatiereInput');
    const tSel = document.getElementById('slotModalTeacherSelect');

    if (!modal) return;

    if (titleEl) {
        titleEl.textContent = 'Créneau : ' + day + ' - Période ' + period;
    }

    const existing = (window.currentAdminScheduleSlots || []).find(s => {
        const sDay = (s.jour || '').trim();
        const sPer = String(s.periode || '').replace(/[^0-9]/g, '');
        return sDay.toLowerCase().startsWith(day.toLowerCase()) && sPer === String(period);
    });

    if (matInput) {
        matInput.value = existing ? (existing.matiere || '') : '';
    }
    if (tSel) {
        tSel.value = existing ? (existing.enseignant || '') : '';
    }

    modal.style.display = 'flex';
    if (matInput) setTimeout(() => matInput.focus(), 100);
}

function closeScheduleSlotModal() {
    const modal = document.getElementById('scheduleSlotModal');
    if (modal) modal.style.display = 'none';
    window.currentEditingSlot = null;
}

function applyScheduleSlotModal() {
    if (!window.currentEditingSlot) return;
    const day = window.currentEditingSlot.day;
    const period = window.currentEditingSlot.period;
    const matInput = document.getElementById('slotModalMatiereInput');
    const tSel = document.getElementById('slotModalTeacherSelect');

    const matiere = matInput ? matInput.value.trim() : '';
    const enseignant = tSel ? tSel.value.trim() : '';

    if (!matiere) {
        alert("Veuillez saisir ou sélectionner une matière.");
        if (matInput) matInput.focus();
        return;
    }

    if (!window.currentAdminScheduleSlots) window.currentAdminScheduleSlots = [];

    const slotIdx = window.currentAdminScheduleSlots.findIndex(s => {
        const sDay = (s.jour || '').trim();
        const sPer = String(s.periode || '').replace(/[^0-9]/g, '');
        return sDay.toLowerCase().startsWith(day.toLowerCase()) && sPer === String(period);
    });

    if (slotIdx >= 0) {
        window.currentAdminScheduleSlots[slotIdx].matiere = matiere;
        if (enseignant) {
            window.currentAdminScheduleSlots[slotIdx].enseignant = enseignant;
        }
    } else {
        window.currentAdminScheduleSlots.push({
            jour: day,
            periode: String(period),
            matiere: matiere,
            enseignant: enseignant,
            hasContent: false
        });
    }

    closeScheduleSlotModal();
    renderAdminScheduleGrid();
}

function clearCurrentSlotFromModal() {
    if (!window.currentEditingSlot) return;
    const day = window.currentEditingSlot.day;
    const period = window.currentEditingSlot.period;
    clearScheduleSlot(day, period);
    closeScheduleSlotModal();
}

function clearScheduleSlot(day, period) {
    if (!window.currentAdminScheduleSlots) return;
    const idx = window.currentAdminScheduleSlots.findIndex(s => {
        const sDay = (s.jour || '').trim();
        const sPer = String(s.periode || '').replace(/[^0-9]/g, '');
        return sDay.toLowerCase().startsWith(day.toLowerCase()) && sPer === String(period);
    });

    if (idx >= 0) {
        const slot = window.currentAdminScheduleSlots[idx];
        if (slot.hasContent) {
            const conf = confirm("Attention : ce créneau (" + day + " P" + period + " - " + slot.matiere + ") contient des données saisies par l'enseignant. Si vous le supprimez, ses saisies seront réaffectées si la matière a d'autres créneaux. Confirmer le vidage de ce créneau ?");
            if (!conf) return;
        }
        window.currentAdminScheduleSlots.splice(idx, 1);
        renderAdminScheduleGrid();
    }
}

function applyQuickScheduleSwap() {
    const sDay = document.getElementById('swapSourceDay')?.value || 'Dimanche';
    const sPer = document.getElementById('swapSourcePeriod')?.value || '1';
    const tDay = document.getElementById('swapTargetDay')?.value || 'Lundi';
    const tPer = document.getElementById('swapTargetPeriod')?.value || '1';
    const action = document.getElementById('swapActionType')?.value || 'swap';

    if (sDay === tDay && sPer === tPer) {
        alert("Le créneau source et le créneau cible sont identiques. Veuillez choisir deux créneaux différents.");
        return;
    }

    if (!window.currentAdminScheduleSlots) window.currentAdminScheduleSlots = [];

    const sIdx = window.currentAdminScheduleSlots.findIndex(s => {
        const day = (s.jour || '').trim();
        const per = String(s.periode || '').replace(/[^0-9]/g, '');
        return day.toLowerCase().startsWith(sDay.toLowerCase()) && per === String(sPer);
    });

    const tIdx = window.currentAdminScheduleSlots.findIndex(s => {
        const day = (s.jour || '').trim();
        const per = String(s.periode || '').replace(/[^0-9]/g, '');
        return day.toLowerCase().startsWith(tDay.toLowerCase()) && per === String(tPer);
    });

    if (sIdx === -1 && tIdx === -1) {
        alert("Les deux créneaux sélectionnés sont vides dans la grille.");
        return;
    }

    if (action === 'swap') {
        if (sIdx >= 0 && tIdx >= 0) {
            window.currentAdminScheduleSlots[sIdx].jour = tDay;
            window.currentAdminScheduleSlots[sIdx].periode = String(tPer);
            window.currentAdminScheduleSlots[tIdx].jour = sDay;
            window.currentAdminScheduleSlots[tIdx].periode = String(sPer);
        } else if (sIdx >= 0 && tIdx === -1) {
            window.currentAdminScheduleSlots[sIdx].jour = tDay;
            window.currentAdminScheduleSlots[sIdx].periode = String(tPer);
        } else if (sIdx === -1 && tIdx >= 0) {
            window.currentAdminScheduleSlots[tIdx].jour = sDay;
            window.currentAdminScheduleSlots[tIdx].periode = String(sPer);
        }
    } else {
        if (sIdx >= 0) {
            if (tIdx >= 0) {
                window.currentAdminScheduleSlots.splice(tIdx, 1);
            }
            const updatedSIdx = window.currentAdminScheduleSlots.findIndex(s => {
                const day = (s.jour || '').trim();
                const per = String(s.periode || '').replace(/[^0-9]/g, '');
                return day.toLowerCase().startsWith(sDay.toLowerCase()) && per === String(sPer);
            });
            if (updatedSIdx >= 0) {
                window.currentAdminScheduleSlots[updatedSIdx].jour = tDay;
                window.currentAdminScheduleSlots[updatedSIdx].periode = String(tPer);
            }
        }
    }

    renderAdminScheduleGrid();
}

function addNewPeriodToSchedule() {
    if (window.adminScheduleMaxPeriod >= 10) {
        alert("Le nombre maximum de 10 périodes par jour est atteint.");
        return;
    }
    window.adminScheduleMaxPeriod++;
    renderAdminScheduleGrid();
}

function duplicateScheduleToOtherClassModal() {
    const classSel = document.getElementById('adminScheduleClassSelect');
    const currentClass = classSel ? classSel.value : '';
    if (!currentClass) {
        alert("Veuillez d'abord sélectionner une classe.");
        return;
    }

    const modal = document.getElementById('scheduleDuplicateModal');
    const targetSel = document.getElementById('duplicateTargetClassSelect');
    if (!modal || !targetSel) return;

    targetSel.innerHTML = '';
    const otherClasses = (window.adminScheduleClassesCache || []).filter(c => c !== currentClass);
    if (otherClasses.length === 0) {
        alert("Aucune autre classe disponible dans cette section pour la duplication.");
        return;
    }

    otherClasses.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c;
        opt.textContent = c;
        targetSel.appendChild(opt);
    });

    modal.style.display = 'flex';
}

function closeScheduleDuplicateModal() {
    const modal = document.getElementById('scheduleDuplicateModal');
    if (modal) modal.style.display = 'none';
}

async function applyDuplicateScheduleToClass() {
    const targetSel = document.getElementById('duplicateTargetClassSelect');
    const targetClass = targetSel ? targetSel.value : '';
    if (!targetClass) return;

    const classSel = document.getElementById('adminScheduleClassSelect');
    const srcClass = classSel ? classSel.value : '';

    if (!confirm('Voulez-vous dupliquer l\'emploi du temps de la classe ' + srcClass + ' vers la classe ' + targetClass + ' ?')) {
        return;
    }

    closeScheduleDuplicateModal();
    if (classSel) {
        classSel.value = targetClass;
        renderAdminScheduleGrid();
        alert('L\'agencement des créneaux a été copié pour la classe ' + targetClass + '. Cliquez sur "Enregistrer & Réorganiser" pour appliquer.');
    }
}

async function saveAndReorganizeSchedule() {
    const sectionSel = document.getElementById('adminScheduleSectionSelect');
    const targetSection = (sectionSel && sectionSel.value) ? sectionSel.value : (currentSection || 'garcons');
    const weekSel = document.getElementById('adminScheduleWeekSelect');
    const selectedWeek = weekSel ? parseInt(weekSel.value, 10) || 1 : 1;
    const classSel = document.getElementById('adminScheduleClassSelect');
    const selectedClass = classSel ? classSel.value : '';

    const radios = document.getElementsByName('adminScheduleScopeRadio');
    let targetMode = 'single';
    for (const r of radios) {
        if (r.checked) { targetMode = r.value; break; }
    }

    if (!selectedClass) {
        alert("Veuillez sélectionner une classe.");
        return;
    }

    if (!window.currentAdminScheduleSlots || window.currentAdminScheduleSlots.length === 0) {
        alert("Aucun créneau d'emploi du temps n'a été défini pour cette classe.");
        return;
    }

    const scopeDescription = (targetMode === 'single')
        ? ('la Semaine ' + selectedWeek + ' uniquement')
        : ('toutes les semaines restantes de la Semaine ' + selectedWeek + ' jusqu\'à la Semaine 38');

    const confirmMsg = 'Confirmez-vous la réorganisation de l\'emploi du temps ?\n\n' +
        '• Classe : ' + selectedClass + '\n' +
        '• Section : ' + targetSection + '\n' +
        '• Portée : ' + scopeDescription + '\n' +
        '• Nombre de créneaux hebdomadaires : ' + window.currentAdminScheduleSlots.length + '\n\n' +
        'Garantie : Toutes les informations déjà saisies par les enseignants (leçons, devoirs) seront scrupuleusement conservées et déplacées selon les nouveaux créneaux.';

    if (!confirm(confirmMsg)) return;

    const saveBtn = document.getElementById('btnSaveScheduleReorganize');
    const origBtnHtml = saveBtn ? saveBtn.innerHTML : '';
    if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Réorganisation en cours...';
    }

    try {
        const response = await fetch('/api/admin/reorganize-schedule', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                section: targetSection,
                classe: selectedClass,
                startWeek: selectedWeek,
                endWeek: targetMode === 'remaining' ? 38 : selectedWeek,
                targetMode: targetMode,
                slots: window.currentAdminScheduleSlots
            })
        });

        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(errData.error || ('Erreur serveur ' + response.status));
        }

        const resData = await response.json();

        alert('✅ Succès !\n\n' + resData.message + '\n' +
              '• Semaines mises à jour : ' + resData.affectedWeeksCount + '\n' +
              '• Lignes réorganisées : ' + resData.totalUpdatedRows + '\n\n' +
              'Toutes les saisies et devoirs des enseignants ont été préservés avec succès.');

        if (typeof fetchData === 'function') {
            await fetchData(currentWeek, currentSection);
        }

        await loadAdminScheduleForClass();
    } catch (err) {
        console.error("Erreur saveAndReorganizeSchedule:", err);
        alert('❌ Erreur lors de la réorganisation : ' + err.message);
    } finally {
        if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.innerHTML = origBtnHtml;
        }
    }
}
