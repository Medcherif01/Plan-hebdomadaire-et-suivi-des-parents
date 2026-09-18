// ==================== NOUVELLES FONCTIONS PLANS DE LEÇON (AVEC CHECKBOXES) ====================

// Ouvrir la modal de génération de plans de leçon
function openLessonPlanModal(defaultTab = 'teachers') {
    const modal = document.getElementById('lessonPlanModal');
    if (!modal) {
        console.error('Modal lessonPlanModal non trouvée');
        return;
    }
    
    // Peupler les enseignants et les classes/matières
    populateLessonPlanTeachers();
    populateLessonPlanClasses();
    
    // Activer l'onglet par défaut (enseignants ou classes)
    switchLessonPlanModalTab(defaultTab);
    
    // Afficher la modal
    modal.style.display = 'block';
}

// Basculer entre les onglets Enseignants et Classes
function switchLessonPlanModalTab(tabName) {
    const tabTeachers = document.getElementById('lessonPlanTabTeachers');
    const tabClasses = document.getElementById('lessonPlanTabClasses');
    const btnTeachers = document.getElementById('tabBtnTeachersSelection');
    const btnClasses = document.getElementById('tabBtnClassesSelection');

    if (tabName === 'teachers') {
        if (tabTeachers) tabTeachers.style.display = 'block';
        if (tabClasses) tabClasses.style.display = 'none';
        if (btnTeachers) {
            btnTeachers.style.background = '#0D9488';
            btnTeachers.style.color = 'white';
            btnTeachers.style.border = 'none';
        }
        if (btnClasses) {
            btnClasses.style.background = '#F1F5F9';
            btnClasses.style.color = '#475569';
            btnClasses.style.border = '1px solid #CBD5E1';
        }
    } else {
        if (tabTeachers) tabTeachers.style.display = 'none';
        if (tabClasses) tabClasses.style.display = 'block';
        if (btnClasses) {
            btnClasses.style.background = '#2563EB';
            btnClasses.style.color = 'white';
            btnClasses.style.border = 'none';
        }
        if (btnTeachers) {
            btnTeachers.style.background = '#F1F5F9';
            btnTeachers.style.color = '#475569';
            btnTeachers.style.border = '1px solid #CBD5E1';
        }
    }
}

// Fonction pour peupler les enseignants avec checkboxes
function populateLessonPlanTeachers() {
    const container = document.getElementById('lessonPlanTeachersList');
    if (!container) return;
    container.innerHTML = '';

    if (!planData || planData.length === 0) {
        container.innerHTML = '<p style="color: #94A3B8; padding: 10px;">Aucune donnée disponible pour cette semaine.</p>';
        updateTeacherSelectionInfo();
        return;
    }

    const enseignantKey = findHKey('Enseignant');
    if (!enseignantKey) {
        container.innerHTML = '<p style="color: #EF4444; padding: 10px;">Colonne Enseignant non trouvée.</p>';
        updateTeacherSelectionInfo();
        return;
    }

    // Calcul du nombre de séances/leçons par enseignant
    const teacherCounts = {};
    planData.forEach(row => {
        if (!row || row.isReadOnlyCrossSection) return;
        const t = (row[enseignantKey] || '').trim();
        if (t) {
            teacherCounts[t] = (teacherCounts[t] || 0) + 1;
        }
    });

    const isTeacherOnly = loggedInUser && !isUserAdminOrSupervisor(loggedInUser, currentUserRole);
    let teachers = Object.keys(teacherCounts).sort((a, b) => a.localeCompare(b, 'fr', { sensitivity: 'base' }));

    if (isTeacherOnly) {
        teachers = teachers.filter(t => 
            isRowForLoggedInTeacher(t, loggedInUser, loggedInTeacherTable) ||
            t.toLowerCase() === String(loggedInUser || '').trim().toLowerCase()
        );
        if (teachers.length === 0 && loggedInUser) {
            teachers = [loggedInUser];
            teacherCounts[loggedInUser] = 0;
        }
    }

    if (teachers.length === 0) {
        container.innerHTML = '<p style="color: #94A3B8; padding: 10px;">Aucun enseignant trouvé dans les données actuelles.</p>';
        updateTeacherSelectionInfo();
        return;
    }

    teachers.forEach((teacher, idx) => {
        const count = teacherCounts[teacher] || 0;
        const pill = document.createElement('label');
        pill.className = 'teacher-plan-pill';
        pill.dataset.teacherName = teacher.toLowerCase();

        const chk = document.createElement('input');
        chk.type = 'checkbox';
        chk.className = 'lesson-plan-teacher-chk';
        chk.value = teacher;
        chk.dataset.count = count;
        // Par défaut coché si enseignant unique ou enseignant connecté
        if (isTeacherOnly || teachers.length === 1) {
            chk.checked = true;
            pill.classList.add('checked');
        }

        chk.addEventListener('change', () => {
            if (chk.checked) pill.classList.add('checked');
            else pill.classList.remove('checked');
            updateTeacherSelectionInfo();
        });

        const icon = document.createElement('i');
        icon.className = 'fas fa-user-tie';
        icon.style.color = '#0D9488';

        const nameSpan = document.createElement('span');
        nameSpan.style.fontWeight = '600';
        nameSpan.style.fontSize = '0.9rem';
        nameSpan.style.color = '#1E293B';
        nameSpan.style.flex = '1';
        nameSpan.textContent = teacher;

        const countBadge = document.createElement('span');
        countBadge.style.fontSize = '0.75rem';
        countBadge.style.background = '#E0F2FE';
        countBadge.style.color = '#0369A1';
        countBadge.style.padding = '2px 7px';
        countBadge.style.borderRadius = '10px';
        countBadge.style.fontWeight = '700';
        countBadge.textContent = `${count} cours`;

        pill.appendChild(chk);
        pill.appendChild(icon);
        pill.appendChild(nameSpan);
        pill.appendChild(countBadge);
        container.appendChild(pill);
    });

    updateTeacherSelectionInfo();
}

// Filtrer les enseignants dans la modale
function filterTeachersInLessonModal(query) {
    const q = (query || '').toLowerCase().trim();
    const pills = document.querySelectorAll('#lessonPlanTeachersList .teacher-plan-pill');
    pills.forEach(pill => {
        const name = pill.dataset.teacherName || '';
        if (!q || name.includes(q)) {
            pill.style.display = 'flex';
        } else {
            pill.style.display = 'none';
        }
    });
}

// Sélectionner tous les enseignants
function selectAllTeachersInLessonModal() {
    const chks = document.querySelectorAll('#lessonPlanTeachersList input.lesson-plan-teacher-chk');
    chks.forEach(c => {
        const pill = c.closest('.teacher-plan-pill');
        if (!pill || pill.style.display !== 'none') {
            c.checked = true;
            if (pill) pill.classList.add('checked');
        }
    });
    updateTeacherSelectionInfo();
}

// Désélectionner tous les enseignants
function deselectAllTeachersInLessonModal() {
    const chks = document.querySelectorAll('#lessonPlanTeachersList input.lesson-plan-teacher-chk');
    chks.forEach(c => {
        c.checked = false;
        const pill = c.closest('.teacher-plan-pill');
        if (pill) pill.classList.remove('checked');
    });
    updateTeacherSelectionInfo();
}

// Mettre à jour les informations de sélection d'enseignants
function updateTeacherSelectionInfo() {
    const chks = Array.from(document.querySelectorAll('#lessonPlanTeachersList input.lesson-plan-teacher-chk:checked'));
    const infoDiv = document.getElementById('lessonPlanTeachersSelectionInfo');
    const btnZip = document.getElementById('downloadSelectedTeachersZipBtn');

    const selectedTeachers = chks.map(c => c.value);
    let totalLessons = 0;
    chks.forEach(c => {
        totalLessons += parseInt(c.dataset.count || '0', 10);
    });

    if (selectedTeachers.length === 0) {
        if (infoDiv) {
            infoDiv.innerHTML = '<span style="color:#94A3B8;"><i class="fas fa-info-circle"></i> Sélectionnez un ou plusieurs enseignants pour télécharger leurs plans de leçons.</span>';
        }
        if (btnZip) btnZip.disabled = true;
    } else {
        if (infoDiv) {
            infoDiv.innerHTML = `
                <span style="color:#0D9488; font-weight:700;">
                    <i class="fas fa-check-circle"></i> ${selectedTeachers.length} enseignant(s) sélectionné(s) : 
                    <span style="color:#1E293B;">${selectedTeachers.slice(0, 3).join(', ')}${selectedTeachers.length > 3 ? ` et ${selectedTeachers.length - 3} autre(s)...` : ''}</span>
                    <span style="margin-left: 8px; background:#CCFBF1; color:#0F766E; padding:3px 10px; border-radius:12px; font-size:0.85rem;">${totalLessons} plan(s) de leçon</span>
                </span>
            `;
        }
        if (btnZip) btnZip.disabled = false;
    }
}

// Télécharger les plans de leçons par ensemble d'enseignants (Format ZIP)
async function downloadSelectedTeachersLessonPlansZip() {
    const checked = Array.from(document.querySelectorAll('#lessonPlanTeachersList input.lesson-plan-teacher-chk:checked'));
    const selectedTeachers = checked.map(c => c.value.trim());

    if (selectedTeachers.length === 0) {
        displayAlert('Veuillez sélectionner au moins un enseignant.', true);
        return;
    }

    if (!planData || planData.length === 0) {
        displayAlert('Aucune donnée hebdomadaire disponible.', true);
        return;
    }

    const enseignantKey = findHKey('Enseignant');
    if (!enseignantKey) {
        displayAlert('Erreur : Colonne Enseignant non trouvée dans le tableau.', true);
        return;
    }

    // Filtrer les lignes correspondant aux enseignants sélectionnés
    const matchedRows = planData.filter(row => {
        if (!row || row.isReadOnlyCrossSection) return false;
        const rowTeacher = (row[enseignantKey] || '').trim();
        return selectedTeachers.some(st => st.toLowerCase() === rowTeacher.toLowerCase());
    });

    if (matchedRows.length === 0) {
        displayAlert('Aucune ligne de cours trouvée pour les enseignants sélectionnés.', true);
        return;
    }

    displayAlert(`Préparation et téléchargement des plans de leçon pour ${selectedTeachers.length} enseignant(s) (${matchedRows.length} séances)...`);
    setButtonLoading('downloadSelectedTeachersZipBtn', true, 'fas fa-spinner fa-spin');
    showProgressBar(`Génération / Téléchargement des plans pour ${selectedTeachers.length} enseignant(s)...`, 10);

    try {
        const payload = {
            rowsData: matchedRows,
            rows: matchedRows,
            week: currentWeek || 1,
            section: currentSection || 'garcons',
            teachers: selectedTeachers
        };

        const response = await fetch('/api/generate-multiple-ai-lesson-plans', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        if (response.ok) {
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = url;
            
            let downloadFilename = selectedTeachers.length === 1
                ? `Plan de lecon-${selectedTeachers[0]}-semaine(${currentWeek || 1}).zip`
                : `Plans_Lecons_Semaine_${currentWeek || 1}_${selectedTeachers.length}_Enseignants.zip`;

            const contentDisposition = response.headers.get('content-disposition');
            if (contentDisposition) {
                const utf8Match = contentDisposition.match(/filename\*=UTF-8''([^;\r\n"']*)/i);
                const standardMatch = contentDisposition.match(/filename="?([^;\r\n"']*)"?/i);
                if (utf8Match && utf8Match[1]) {
                    try {
                        downloadFilename = decodeURIComponent(utf8Match[1]);
                    } catch(e) {
                        downloadFilename = utf8Match[1];
                    }
                } else if (standardMatch && standardMatch[1]) {
                    downloadFilename = standardMatch[1];
                }
            }

            a.download = downloadFilename;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);

            displayAlert(`✅ Téléchargement réussi ! Archive ZIP des plans de leçon générée (${downloadFilename}).`, false, 5000);

            // Mettre à jour l'affichage des lignes du tableau
            matchedRows.forEach(row => {
                const tr = findTableRowElement(row);
                if (tr) {
                    tr.classList.remove('row-generating', 'row-plan-error');
                    tr.classList.add('has-lesson-plan', 'row-plan-downloaded');
                    const aiBtn = tr.querySelector('.ai-lesson-plan-button');
                    if (aiBtn) {
                        aiBtn.classList.add('lesson-plan-exists');
                    }
                    const actTd = tr.querySelector('.actions-column');
                    if (actTd) {
                        let badge = tr.querySelector('.plan-status-badge');
                        if (!badge) {
                            badge = document.createElement('span');
                            actTd.appendChild(badge);
                        }
                        if (badge) {
                            badge.className = 'plan-status-badge badge-downloaded';
                            badge.innerHTML = '<i class="fas fa-check-double"></i> Téléchargé';
                        }
                    }
                }
            });

            closeLessonPlanModal();
        } else {
            const errText = await response.text();
            displayAlert(`❌ Erreur lors du téléchargement des plans : ${errText}`, true);
        }
    } catch (err) {
        console.error('Erreur downloadSelectedTeachersLessonPlansZip:', err);
        displayAlert('❌ Erreur de communication avec le serveur lors du téléchargement.', true);
    } finally {
        hideProgressBar();
        setButtonLoading('downloadSelectedTeachersZipBtn', false, 'fas fa-file-archive');
    }
}

// Fermer la modal de génération de plans de leçon
function closeLessonPlanModal() {
    const modal = document.getElementById('lessonPlanModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

// Fonction pour peupler les checkboxes des classes
function populateLessonPlanClasses() {
    const container = document.getElementById('lessonPlanClassesList');
    if (!container) return;
    
    container.innerHTML = '';
    
    if (!planData || planData.length === 0) {
        container.innerHTML = '<p style="color: #999;">Aucune donnée disponible</p>';
        updateGenerateButtonState();
        return;
    }
    
    const classKey = findHKey('Classe');
    if (!classKey) {
        container.innerHTML = '<p style="color: #999;">Erreur: colonne Classe non trouvée</p>';
        updateGenerateButtonState();
        return;
    }
    
    const isTeacherOnly = loggedInUser && !isUserAdminOrSupervisor(loggedInUser, currentUserRole);
    const enseignantKey = findHKey('Enseignant');
    
    let filteredPlanData = planData;
    if (isTeacherOnly && enseignantKey) {
        const teacherRows = planData.filter(item => {
            if (!item || item.isReadOnlyCrossSection) return false;
            const rowTeacher = item[enseignantKey];
            return isRowForLoggedInTeacher(rowTeacher, loggedInUser, loggedInTeacherTable) ||
                   String(rowTeacher || '').trim().toLowerCase() === String(loggedInUser || '').trim().toLowerCase();
        });
        if (teacherRows.length > 0) {
            filteredPlanData = teacherRows;
        }
    }

    const uniqueClasses = [...new Set(filteredPlanData.map(item => item[classKey]).filter(Boolean))];
    uniqueClasses.sort(compareClasses);
    
    if (uniqueClasses.length === 0) {
        container.innerHTML = '<p style="color: #999;">Aucune classe trouvée</p>';
        updateGenerateButtonState();
        return;
    }
    
    uniqueClasses.forEach(cls => {
        const wrapper = document.createElement('div');
        wrapper.style.marginBottom = '8px';
        
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.id = `class_${cls}`;
        checkbox.value = cls;
        checkbox.classList.add('class-checkbox');
        checkbox.addEventListener('change', () => {
            updateLessonPlanSubjects();
            updateGenerateButtonState();
        });
        
        const label = document.createElement('label');
        label.htmlFor = `class_${cls}`;
        label.style.marginLeft = '5px';
        label.style.cursor = 'pointer';
        
        const arTranslation = classTranslations[cls];
        label.textContent = arTranslation ? `${arTranslation} (${cls})` : cls;
        
        wrapper.appendChild(checkbox);
        wrapper.appendChild(label);

        // 2. Ajout du bouton de téléchargement
        const downloadBtn = document.createElement('button');
        downloadBtn.innerHTML = '<i class="fas fa-download"></i>';
        downloadBtn.style.marginLeft = '10px';
        downloadBtn.style.padding = '3px 8px';
        downloadBtn.style.fontSize = '12px';
        downloadBtn.style.cursor = 'pointer';
        downloadBtn.setAttribute('aria-label', `Télécharger le plan pour ${cls}`);

        // Vérifier si le plan est disponible
        // window.availableWeeklyPlans est rempli par la fonction loadPlanData
        if (window.availableWeeklyPlans && window.availableWeeklyPlans.includes(cls)) {
            downloadBtn.title = `Télécharger le plan hebdomadaire pour ${cls}`;
            downloadBtn.onclick = () => downloadWeeklyPlan(currentWeek, cls);
            downloadBtn.disabled = false;
            downloadBtn.style.color = '#28a745'; // Vert
            downloadBtn.style.borderColor = '#28a745';
        } else {
            downloadBtn.title = 'Le plan hebdomadaire pour cette classe n\'est pas encore généré par le coordinateur.';
            downloadBtn.disabled = true;
            downloadBtn.style.color = '#ccc';
            downloadBtn.style.borderColor = '#ccc';
        }

        wrapper.appendChild(downloadBtn);
        container.appendChild(wrapper);
    });
    
    updateLessonPlanSubjects();
    updateGenerateButtonState();
}

// Fonction pour peupler les checkboxes des matières (basé sur les classes sélectionnées)
function updateLessonPlanSubjects() {
    const container = document.getElementById('lessonPlanSubjectsList');
    if (!container) return;
    
    container.innerHTML = '';
    
    // Récupérer les classes sélectionnées
    const selectedClasses = Array.from(document.querySelectorAll('.class-checkbox:checked'))
        .map(cb => cb.value);
    
    if (selectedClasses.length === 0) {
        container.innerHTML = '<p style="color: #999;">Sélectionnez d\'abord une ou plusieurs classes</p>';
        updateGenerateButtonState();
        return;
    }
    
    if (!planData || planData.length === 0) {
        container.innerHTML = '<p style="color: #999;">Aucune donnée disponible</p>';
        updateGenerateButtonState();
        return;
    }
    
    const classKey = findHKey('Classe');
    const matiereKey = findHKey('Matière');
    const enseignantKey = findHKey('Enseignant');
    
    if (!classKey || !matiereKey) {
        container.innerHTML = '<p style="color: #999;">Erreur de configuration</p>';
        updateGenerateButtonState();
        return;
    }

    const isTeacherOnly = loggedInUser && !isUserAdminOrSupervisor(loggedInUser, currentUserRole);
    
    // Récupérer les matières des classes sélectionnées (filtrées pour l'enseignant connecté si non admin)
    let subjectsQuery = planData.filter(item => {
        if (!item || !selectedClasses.includes(item[classKey]) || !item[matiereKey]) return false;
        if (item.isReadOnlyCrossSection) return false;
        if (isTeacherOnly && enseignantKey) {
            return isRowForLoggedInTeacher(item[enseignantKey], loggedInUser, loggedInTeacherTable) ||
                   String(item[enseignantKey] || '').trim().toLowerCase() === String(loggedInUser || '').trim().toLowerCase();
        }
        return true;
    });

    if (subjectsQuery.length === 0) {
        // Repli sur toutes les matières des classes sélectionnées
        subjectsQuery = planData.filter(item => item && selectedClasses.includes(item[classKey]) && item[matiereKey] && !item.isReadOnlyCrossSection);
    }
    
    // Toutes les matières sont autorisées pour tous les enseignants
    const uniqueSubjects = [...new Set(subjectsQuery.map(item => item[matiereKey]))].sort();
    
    if (uniqueSubjects.length === 0) {
        container.innerHTML = '<p style="color: #999;">Aucune matière trouvée pour ces classes</p>';
        updateGenerateButtonState();
        return;
    }
    
    uniqueSubjects.forEach(subject => {
        const wrapper = document.createElement('div');
        wrapper.style.marginBottom = '8px';
        
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.id = `subject_${subject}`;
        checkbox.value = subject;
        checkbox.classList.add('subject-checkbox');
        checkbox.addEventListener('change', updateGenerateButtonState);
        
        const label = document.createElement('label');
        label.htmlFor = `subject_${subject}`;
        label.style.marginLeft = '5px';
        label.style.cursor = 'pointer';
        label.textContent = subject;
        
        wrapper.appendChild(checkbox);
        wrapper.appendChild(label);
        container.appendChild(wrapper);
    });
    
    updateGenerateButtonState();
}

// Fonction pour activer/désactiver le bouton de génération
function updateGenerateButtonState() {
    const btn = document.getElementById('generateAllLessonPlansBtn');
    const infoSpan = document.getElementById('lessonPlanSelectionInfo');
    
    if (!btn || !infoSpan) return;
    
    const selectedClasses = Array.from(document.querySelectorAll('.class-checkbox:checked'));
    const selectedSubjects = Array.from(document.querySelectorAll('.subject-checkbox:checked'));
    
    const classCount = selectedClasses.length;
    const subjectCount = selectedSubjects.length;
    
    if (classCount > 0 && subjectCount > 0) {
        btn.disabled = false;
        infoSpan.textContent = `${classCount} classe(s) et ${subjectCount} matière(s) sélectionnées`;
        infoSpan.style.color = '#28a745';
    } else {
        btn.disabled = true;
        if (classCount === 0) {
            infoSpan.textContent = 'Sélectionnez au moins une classe';
        } else {
            infoSpan.textContent = 'Sélectionnez au moins une matière';
        }
        infoSpan.style.color = '#999';
    }
}

// Fonctions pour sélectionner/déselectionner toutes les classes
function selectAllClasses() {
    document.querySelectorAll('.class-checkbox').forEach(cb => {
        cb.checked = true;
    });
    updateLessonPlanSubjects();
    updateGenerateButtonState();
}

function deselectAllClasses() {
    document.querySelectorAll('.class-checkbox').forEach(cb => {
        cb.checked = false;
    });
    updateLessonPlanSubjects();
    updateGenerateButtonState();
}

// Fonctions pour sélectionner/déselectionner toutes les matières
function selectAllSubjects() {
    document.querySelectorAll('.subject-checkbox').forEach(cb => {
        cb.checked = true;
    });
    updateGenerateButtonState();
}

function deselectAllSubjects() {
    document.querySelectorAll('.subject-checkbox').forEach(cb => {
        cb.checked = false;
    });
    updateGenerateButtonState();
}

// Fonction principale: Générer tous les plans de leçon IA sélectionnés
async function startGenerateAllLessonPlans() {
    if (!currentWeek) {
        displayAlert("Veuillez d'abord sélectionner une semaine.", true);
        return;
    }
    
    if (!planData || planData.length === 0) {
        displayAlert("Aucune donnée disponible pour cette semaine.", true);
        return;
    }
    
    // Récupérer les classes et matières sélectionnées
    const selectedClasses = Array.from(document.querySelectorAll('.class-checkbox:checked'))
        .map(cb => cb.value);
    const selectedSubjects = Array.from(document.querySelectorAll('.subject-checkbox:checked'))
        .map(cb => cb.value);
    
    if (selectedClasses.length === 0 || selectedSubjects.length === 0) {
        displayAlert("Veuillez sélectionner au moins une classe et une matière.", true);
        return;
    }
    
    // Confirmation
    const confirmation = confirm(
        `Générer les PLANS DE LEÇON IA (Gemini) pour :\n\n` +
        `Classes: ${selectedClasses.join(', ')}\n` +
        `Matières: ${selectedSubjects.join(', ')}\n` +
        `Semaine: ${currentWeek}\n\n` +
        `Cela générera automatiquement des plans de leçon avec IA.\n\n` +
        `Continuer ?`
    );
    
    if (!confirmation) return;
    
    // Génération des plans de leçon IA
    await generateAILessonPlansZip(selectedClasses, selectedSubjects);
}

// Générer les plans de leçon IA pour toutes les combinaisons classe/matière sélectionnées et les télécharger en ZIP
async function generateAILessonPlansZip(selectedClasses, selectedSubjects) {
    const classKey = findHKey('Classe');
    const matiereKey = findHKey('Matière');
    const leconKey = findHKey('Leçon');
    const travauxKey = findHKey('Travaux de classe');
    const supportKey = findHKey('Support');
    const devoirKey = findHKey('Devoir');
    const jourKey = findHKey('Jour');
    const seanceKey = findHKey('Séance');
    const enseignantKey = findHKey('Enseignant');
    
    // Filtrer les lignes correspondantes
    const isTeacherOnly = loggedInUser && !isUserAdminOrSupervisor(loggedInUser, currentUserRole);
    const rowsToGenerate = planData.filter(item => {
        if (!item) return false;
        if (item.isReadOnlyCrossSection) return false;
        if (!selectedClasses.includes(item[classKey])) return false;
        if (!selectedSubjects.includes(item[matiereKey])) return false;
        if (!item[leconKey]) return false; // Ne générer que pour les lignes qui ont une leçon
        if (isTeacherOnly && enseignantKey) {
            return isRowForLoggedInTeacher(item[enseignantKey], loggedInUser, loggedInTeacherTable) ||
                   String(item[enseignantKey] || '').trim().toLowerCase() === String(loggedInUser || '').trim().toLowerCase();
        }
        return true;
    });
    
    if (rowsToGenerate.length === 0) {
        displayAlert("Aucune ligne avec leçon trouvée pour ces combinaisons classe/matière.", true);
        return;
    }
    
    console.log(`Génération ZIP de ${rowsToGenerate.length} plan(s) de leçon IA...`);
    
    displayAlert(`⚙️ Génération de ${rowsToGenerate.length} plan(s) de leçon IA avec Gemini...`, false);
    setButtonLoading('generateAllLessonPlansBtn', true, 'fas fa-robot');
    showProgressBar();
    
    // Préparer les données pour l'API (format row avec headers)
    const lessonPlansData = rowsToGenerate.map(row => {
        const rowCopy = {};
        headers.forEach(header => {
            rowCopy[header] = row[header];
        });
        return rowCopy;
    });
    
    try {
        const response = await fetch('/api/generate-multiple-ai-lesson-plans', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                week: currentWeek,
                rowsData: lessonPlansData
            })
        });
        
        if (response.ok) {
            const blob = await response.blob();
            const contentDisposition = response.headers.get('content-disposition');
            
            const distinctTeachers = [...new Set(rowsToGenerate.map(r => (r[enseignantKey] || '').trim()).filter(Boolean))];
            let filename = distinctTeachers.length === 1
                ? `Plan de lecon-${distinctTeachers[0]}-semaine(${currentWeek || 1}).zip`
                : `Plans_Lecon_IA_S${currentWeek}_${lessonPlansData.length}_fichiers.zip`;
            
            if (contentDisposition) {
                const filenameMatch = contentDisposition.match(/filename\*?=['"]?(?:UTF-\d['"])?([^;\r\n"']*)['"]?/i);
                if (filenameMatch && filenameMatch[1]) {
                    try {
                        filename = decodeURIComponent(filenameMatch[1]);
                    } catch(e) {
                        filename = filenameMatch[1];
                    }
                }
            }
            
            // Téléchargement automatique du fichier ZIP
            const link = document.createElement('a');
            link.href = window.URL.createObjectURL(blob);
            link.download = filename;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            window.URL.revokeObjectURL(link.href);
            
            displayAlert(`✅ ${lessonPlansData.length} plan(s) de leçon IA générés et téléchargés avec succès ! Fichier: '${filename}'`, false, 6000);
            
            // Mettre à jour l'état des lignes dans les données et dans le tableau
            rowsToGenerate.forEach(row => {
                row.lessonPlanDownloaded = true;
                row.lessonPlanId = row.lessonPlanId || 'generated';
                if (typeof findTableRowElement === 'function') {
                    const tr = findTableRowElement(row);
                    if (tr) {
                        tr.classList.add('has-lesson-plan', 'row-plan-downloaded');
                        const aiBtn = tr.querySelector('.ai-lesson-plan-button');
                        if (aiBtn) {
                            aiBtn.classList.add('lesson-plan-exists');
                            aiBtn.title = 'Plan de Leçon déjà généré - Régénérer';
                        }
                        let dlBtn = tr.querySelector('.lesson-plan-button');
                        const actTd = tr.querySelector('.actions-column');
                        if (!dlBtn && actTd) {
                            dlBtn = document.createElement('button');
                            dlBtn.innerHTML = '<i class="fas fa-file-download"></i>';
                            dlBtn.title = 'Télécharger Plan de Leçon';
                            dlBtn.classList.add('lesson-plan-button');
                            dlBtn.style.marginLeft = '5px';
                            dlBtn.onclick = () => downloadLessonPlan(row);
                            actTd.appendChild(dlBtn);
                        }
                        let badge = tr.querySelector('.plan-status-badge');
                        if (!badge && actTd) {
                            badge = document.createElement('span');
                            actTd.appendChild(badge);
                        }
                        if (badge) {
                            badge.className = 'plan-status-badge badge-downloaded';
                            badge.innerHTML = '<i class="fas fa-check-double"></i> Téléchargé';
                            badge.title = 'Plan de leçon généré et inclus dans l\'archive téléchargée';
                        }
                    }
                }
            });

            // Fermer la modal
            closeLessonPlanModal();
            
        } else {
            const errorText = await response.text();
            let errorMessage = `Erreur serveur: ${errorText}`;
            try {
                const errorJson = JSON.parse(errorText);
                errorMessage = errorJson.message || errorMessage;
            } catch (e) {
                // Ignorer l'erreur de parsing si ce n'est pas du JSON
            }
            displayAlert(`❌ Échec de la génération des plans IA: ${errorMessage}`, true);
        }
        
    } catch (error) {
        console.error("Erreur génération plans IA:", error);
        displayAlert('❌ Erreur réseau lors de la génération des plans de leçon IA.', true);
    } finally {
        hideProgressBar();
        setButtonLoading('generateAllLessonPlansBtn', false, 'fas fa-robot');
    }
}

	// Fonction de comparaison de classes (pour le tri)
function compareClasses(a, b) {
    // Logique de tri simple (peut être ajustée si nécessaire)
    return a.localeCompare(b);
}

// Fonction de téléchargement du plan hebdomadaire
async function downloadWeeklyPlan(week, classe) {
    if (!week || !classe) {
        displayAlert('Semaine ou classe non spécifiée.', true);
        return;
    }

    const activeSec = (typeof currentSection !== 'undefined' && currentSection) ? currentSection : 'garcons';
    const url = `/api/download-weekly-plan/${week}/${classe}?section=${encodeURIComponent(activeSec)}`;
    displayAlert(`Téléchargement du plan pour ${classe}...`);

    try {
        const response = await fetch(url);

        if (response.ok) {
            const blob = await response.blob();
            const contentDisposition = response.headers.get('content-disposition');
            let filename = `Plan_hebdomadaire_S${week}_${classe}.docx`;
            if (contentDisposition) {
                const filenameMatch = contentDisposition.match(/filename="?(.+?)"?(;|$)/i);
                if (filenameMatch && filenameMatch[1]) {
                    filename = filenameMatch[1];
                }
            }

            const link = document.createElement('a');
            link.href = window.URL.createObjectURL(blob);
            link.download = filename;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            window.URL.revokeObjectURL(link.href);

            displayAlert(`Plan pour ${classe} téléchargé avec succès.`, false, 3000);
        } else {
            const errorData = await response.json();
            displayAlert(`Erreur: ${errorData.message || 'Impossible de télécharger le plan.'}`, true);
        }
    } catch (error) {
        console.error('Erreur lors du téléchargement:', error);
        displayAlert('Erreur réseau lors du téléchargement du plan.', true);
    }
}
