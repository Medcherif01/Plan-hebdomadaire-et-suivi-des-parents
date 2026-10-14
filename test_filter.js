const http = require('http');

http.get('http://localhost:3000/api/plans/1?section=garcons', (res) => {
  let d = '';
  res.on('data', c => d += c);
  res.on('end', () => {
    const json = JSON.parse(d);
    const planData = json.planData;
    console.log('planData length:', planData.length);
    
    const usersToTest = [
      { name: 'Mohamed', role: 'admin' },
      { name: 'Mohamed Ali', role: 'teacher' },
      { name: 'Abas', role: 'teacher' },
      { name: 'Imad', role: 'teacher' },
      { name: 'Majed', role: 'teacher' },
      { name: 'Saeed', role: 'teacher' },
      { name: 'Kamel', role: 'teacher' },
      { name: null, role: null }
    ];

    const currentSection = 'garcons';

    function isClassVisibleOnTable(c, sec) {
      return true;
    }
    function isRowForLoggedInTeacher(rE, loggedInUser, loggedInTeacherTable) {
      if (!loggedInUser) return false;
      const u = loggedInUser.toLowerCase().trim();
      const t = (loggedInTeacherTable || '').toLowerCase().trim();
      const r = (rE || '').toLowerCase().trim();
      return r === u || (t && r === t) || r.includes(u) || u.includes(r);
    }
    function isTeacherMatch(a, b) {
      if (!a || !b) return false;
      return a.toLowerCase().trim() === b.toLowerCase().trim();
    }

    usersToTest.forEach(u => {
      const loggedInUser = u.name;
      const currentUserRole = u.role;
      const isTeacherOnly = loggedInUser && !(currentUserRole === 'admin' || currentUserRole === 'supervisor');
      const loggedInTeacherTable = loggedInUser;

      const hasAnyTeacherAssignedRows = isTeacherOnly && Array.isArray(planData) && planData.some(r => {
        const rE = (r.Enseignant || '').trim();
        return rE && isRowForLoggedInTeacher(rE, loggedInUser, loggedInTeacherTable);
      });

      // What if filterEnsSelect has the teacher's name selected?
      // When a teacher logs in, updateTeacherFilter or HTML filterEnseignant might have options:
      // Option 1: ensF = loggedInUser
      // Option 2: ensF = ''
      [ '', loggedInUser || '' ].forEach(ensF => {
        const filtered = planData.filter(i => {
          if (!i) return false;
          const iE = (i.Enseignant || '').trim();
          const iC = (i.Classe || '').trim();

          if (iC && !isClassVisibleOnTable(iC, currentSection)) return false;
          if (i._section && currentSection && i._section !== currentSection) return false;

          if (currentSection === 'garcons') {
            if (/fille|filles|banat|بنات/i.test(iC) || /\bf\b/i.test(iC)) return false;
            const fLow = ['amina', 'fatima', 'khadija', 'mariam', 'salma', 'zainab', 'nour', 'houda', 'leila', 'sarah', 'zohra', 'nadia', 'samira', 'imane', 'mouna', 'siham', 'hajar', 'meriem', 'aicha', 'hanane'];
            if (fLow.some(f => iE.toLowerCase().includes(f)) && !iE.toLowerCase().includes('farah') && !iE.toLowerCase().includes('musique') && !iE.toLowerCase().includes('music')) return false;
          }

          if (isTeacherOnly) {
            if (hasAnyTeacherAssignedRows) {
              if (!isRowForLoggedInTeacher(iE, loggedInUser, loggedInTeacherTable)) return false;
            }
          }

          const pE = !ensF || (iE === ensF) || isTeacherMatch(iE, ensF) || (!hasAnyTeacherAssignedRows && !iE);
          return pE;
        });

        console.log('User:', loggedInUser, 'ensF:', ensF, 'hasAssigned:', hasAnyTeacherAssignedRows, 'count:', filtered.length);
      });
    });
  });
});
