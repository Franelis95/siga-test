/* =====================================================================
   DOCUMENTS et SYSTÈME : GED, rapports, circuits, audit, archivage, administration
   ===================================================================== */
mod('ged', {group:'Documents', label:'Documents (GED)', icon:'folder', render(){
  const tab = UI.tab.ged || 'docs';
  let body='';
  if(tab==='docs') body = table([{h:'N°',f:d=>`<b class="mono">${esc(d.number)}</b>${EX(d)}`},{h:'Type',f:d=>esc(d.type)},{h:'Intitulé',f:d=>esc(d.title)},{h:'Version',r:1,f:d=>'v'+d.version},
    {h:'Empreinte SHA-256',f:d=>`<span class="mono" title="${esc(d.hash)}">${esc(d.hash.slice(0,16))}…</span>`},{h:'Vérification',f:d=>`<span class="mono">${esc(d.code)}</span>`},{h:'Statut',f:d=>tag(d.status, /Signé|rendue/.test(d.status)?'t-ok':'t-gold')}], S.docs, {emptyTitle:'Aucun document'});
  if(tab==='verify') body = `<div class="pad grid" style="max-width:640px"><p style="margin:0">Toute personne qui reçoit un acte peut vérifier son authenticité avec le code imprimé en pied de page. SIGA recalcule l’empreinte du fichier présenté et la compare à celle enregistrée.</p>
    <label class="f" for="vc">Code de vérification<input class="inp mono" id="vc" placeholder="VRF-XXXXXX"></label><div><button class="btn pri" data-a="verifyDoc">Vérifier</button></div><div id="vr"></div></div>`;
  if(tab==='tpl') body = table([{h:'Modèle',f:t=>`<b>${esc(t[0])}</b>`},{h:'Format',f:()=>'DOCX → PDF'},{h:'Variables',f:t=>t[1].map(v=>`<span class="mono tag t-n plain">${v}</span>`).join(' ')},{h:'Source',f:t=>tag(t[2]?'Canevas DGREH reçu':'À fournir', t[2]?'t-ok':'t-warn')}],
    [['Ordre de mission',['numero','agents','destination','date_depart','date_retour','vehicule','chauffeur','financement'],false],
     ['Fiche de demande de jouissance de congé',['nom','prenoms','matricule','emploi','fonction','service','duree','date_debut','avis_superieur','avis_directeur','decision_dg'],true],
     ['Fiche de demande d’autorisation d’absence',['nom','prenoms','matricule','emploi','fonction','service','heures','debut','motif','decision'],true],
     ['Note de service d’intérim',['numero','poste','titulaire','interimaire','du','au'],false],
     ['Fiche d’imputation',['numero_arrivee','expediteur','objet','destinataires','mentions','echeance'],false],
     ['Bordereau d’envoi',['numero','destinataire','pieces','quantites'],false],['Certificat administratif',['à définir'],false]]);
  return pageHead('Documents','Gestion électronique des documents','Chaque acte généré porte un numéro sans discontinuité, une empreinte SHA-256 et un code de vérification. Le logo SIGA n’apparaît jamais sur les actes.')
  + `<div class="kpis">${kpi('Documents',S.docs.length,'')}${kpi('Signés',S.docs.filter(d=>/Signé/.test(d.status)).length,'','good')}${kpi('En signature',S.docs.filter(d=>/signature|signer/i.test(d.status)).length,'','warn')}${kpi('Modèles',7,'2 canevas reçus')}</div>
  <div class="panel"><div class="tabs">${[['docs','Documents'],['verify','Vérifier un acte'],['tpl','Modèles']].map(([k,l])=>`<button class="${tab===k?'on':''}" data-a="tab" data-x="ged:${k}">${l}</button>`).join('')}</div>${body}</div>`;
}});
ACT.verifyDoc = () => { const c = val('vc').toUpperCase(); const d = S.docs.find(x=>x.code===c);
  $('#vr').innerHTML = d ? `<div class="note ok"><b>Acte authentique.</b> ${esc(d.type)} n° ${esc(d.number)}, version ${d.version}, émis le ${dtfr(d.at)}. Empreinte : <span class="mono">${esc(d.hash.slice(0,32))}…</span></div>`
    : `<div class="note warn"><b>Code inconnu.</b> Vérifiez la saisie ; un acte modifié après génération ne correspond plus à son empreinte.</div>`; };

mod('rapports', {group:'Documents', label:'Rapports et exports', icon:'chart', visible:()=>can('REPORTS')||can('ADMIN'), render(){
  const byMonth = Array.from({length:6},(_,i)=>{ const d=new Date(); d.setMonth(d.getMonth()-5+i); const k=iso(d).slice(0,7);
    return [d.toLocaleDateString('fr-FR',{month:'long'}), S.missions.filter(m=>m.from.slice(0,7)===k).length]; });
  const delays = S.mail.filter(m=>m.transmittedAt && m.imputedAt).map(m=>days(m.transmittedAt.slice(0,10), m.imputedAt.slice(0,10)));
  return pageHead('Documents','Rapports et exports','Rapports par période et par structure, exportables en Excel et en PDF depuis le serveur. Les chiffres ci-dessous portent sur les données de la maquette.',
    `<button class="btn" data-a="exportCsv">${ico('down')}Exporter les OM (CSV)</button>`)
  + `<div class="grid g2">
    <div class="panel"><div class="panel-h">Missions par mois de départ</div><div class="pad">${bars(byMonth,'w')}</div></div>
    <div class="panel"><div class="panel-h">Courrier arrivée par statut</div><div class="pad">${bars(Object.entries(MAIL_ST).map(([k,[l]])=>[l,S.mail.filter(m=>m.dir==='IN'&&m.status===k).length]).filter(x=>x[1]))}</div></div>
    <div class="panel"><div class="panel-h">Parc par état</div><div class="pad">${bars(['Bon','Passable','En panne','En réparation','À réformer','Non renseigné'].map(e=>[e, VEH.filter(v=>VEH_ETAT(v)[0]===e).length, e==='Bon'?'':e==='Passable'?'w':'a']))}</div></div>
    <div class="panel"><div class="panel-h">Délais mesurés</div><div class="pad kv">
      <div><span>Remise → imputation (courrier)</span><b>${delays.length?(delays.reduce((a,b)=>a+b,0)/delays.length).toFixed(1)+' j':'—'}</b></div>
      <div><span>Déclaré par le secrétariat</span><b>2 jours</b></div><div><span>Objectif OM</span><b>4 h ouvrées</b></div>
      <div><span>Mesure</span><b>Minutes ouvrées, pause déduite</b></div></div></div></div>
  <div class="panel"><div class="panel-h">Catalogue des rapports</div>${table([{h:'Rapport',f:r=>`<b>${r[0]}</b>`},{h:'Profil',f:r=>esc(r[1])},{h:'Formats',f:r=>r[2]}],
    [['Activité des missions par structure','DG, directeurs','Excel, PDF'],['Délais du circuit OM et du courrier','DG, contrôle interne','Excel'],['Congés et absences par période','RH','Excel'],['Utilisation du parc et consommation','BCMS','Excel, PDF'],['Engagements par ligne budgétaire','Service financier','Excel'],['Registre arrivée et départ','Secrétariat','PDF'],['Journal des accès et des droits','Contrôle interne, administrateur','Excel']])}</div>`;
}});
ACT.exportCsv = () => {
  const rows = [['Référence','N° officiel','Objet','Destination','Départ','Retour','Initiateur','Statut'], ...S.missions.map(m=>[m.ref,m.number||'',m.subject,m.dest,m.from,m.to,nm(m.initiator),(OM_STATUS[m.status]||[m.status])[0]])];
  const csv = rows.map(r=>r.map(c=>'"'+String(c).replace(/"/g,'""')+'"').join(';')).join('\n');
  modal('Export CSV', `<p class="muted" style="margin:0">Copiez le contenu ci-dessous dans un tableur. Dans SIGA, l’export est produit par le serveur et journalisé.</p><textarea class="inp mono" rows="10" id="csvout" readonly>${esc(csv)}</textarea>`,
  `<button class="btn pri" data-a="copyCsv">Copier</button>`); audit('EXPORT', 'MISSIONS', rows.length-1+' lignes'); save(); };
ACT.copyCsv = () => { const t=$('#csvout'); try{ navigator.clipboard.writeText(t.value).then(()=>toast('Copié'),()=>{ t.select(); toast('Sélectionné : Ctrl+C pour copier'); }); }catch(e){ t.select(); } };

mod('circuits', {group:'Système', label:'Circuits de validation', icon:'flow', visible:()=>can('WORKFLOW_READ'), render(){
  const edit = can('WORKFLOW_MANAGE');
  const RES = {UNIT_HEAD:'Chef de l’unité du demandeur', SUPERIOR:'Supérieur hiérarchique immédiat', DIRECTOR:'Directeur de rattachement', DG:'Directeur Général', 'UNIT:BCMS':'Chef du BCMS', 'UNIT:SF':'Chef du service financier', 'UNIT:SDG':'Secrétariat DG'};
  const sample = UI.sel.wfAgent || AG.find(a=>a.unit==='DIH'&&!a.isHead).id;
  return pageHead('Système','Circuits de validation','Les circuits sont des données : on les modifie sans redéployer. Chaque étape désigne un poste, jamais une personne ; l’acteur est résolu au moment du dossier (intérim, puis titulaire, puis délégataires).')
  + Object.entries(S.workflows).map(([code,w]) => `<div class="panel"><div class="panel-h">${esc(w.label)} <span class="mono muted" style="font-weight:400">${code}</span></div>
    ${table([{h:'#',f:s=>w.steps.indexOf(s)+1},{h:'Étape',f:s=>`<b>${esc(s.label)}</b>${s.when?'<span class="sub">si un véhicule est demandé</span>':''}`},{h:'Acteur',f:s=>esc(RES[s.res]||s.res)},
      {h:'Nature',f:s=>edit?`<select class="inp" data-ch="wfNature" data-k="${code}:${w.steps.indexOf(s)}" aria-label="Nature">${['VALIDATION','OPINION','DECISION'].map(n=>`<option ${s.nature===n?'selected':''} value="${n}">${{VALIDATION:'Validation',OPINION:'Avis',DECISION:'Décision'}[n]}</option>`).join('')}</select>`:esc(s.nature)},
      {h:'Si le demandeur tient ce poste',f:s=>({AUTO:'Franchie (§36bis)',SKIP:'Sans objet',EXTERNAL:'Autorité extérieure'})[s.self]},
      {h:'Délai indicatif',r:1,f:s=>s.sla?s.sla+' min':'<span class="muted">non fixé</span>'}], w.steps)}</div>`).join('')
  + `<div class="panel"><div class="panel-h">Simuler un circuit</div><div class="toolbar"><label class="f" for="wfa" style="flex:1;max-width:420px">Demandeur<select class="inp" id="wfa" data-ch="wfAgent">${AG.filter(a=>!a.driver).map(a=>`<option value="${a.id}" ${a.id===sample?'selected':''}>${esc(a.name)} · ${esc(a.fn)} · ${a.unit}</option>`).join('')}</select></label></div>
    <div class="grid g3 pad">${['MISSION_ORDER','LEAVE','ABSENCE'].map(c=>`<div><b>${esc(S.workflows[c].label)}</b><div style="margin-top:10px">${circuitHtml(planCircuit(c, sample, {needsVehicle:true}))}</div></div>`).join('')}</div></div>`;
}});
ACT.wfAgent = v => { UI.sel.wfAgent = v; rerender(); };
ACT.wfNature = (v, el) => { const [c,i] = el.dataset.k.split(':'); S.workflows[c].steps[i].nature = v; audit('WORKFLOW_CHANGED', c, 'étape '+(+i+1)+' : '+v); commit('Circuit modifié : s’applique aux prochains dossiers'); };

mod('audit', {group:'Système', label:'Audit et sécurité', icon:'shield', visible:()=>can('AUDIT_READ'), render(){
  const tab = UI.tab.audit || 'log';
  const broken = verifyAudit();
  let body='';
  if(tab==='log') body = `<div class="toolbar"><span>${broken?tag('Chaîne rompue à la ligne '+broken,'t-bad'):tag('Chaîne intègre : '+S.audit.length+' lignes vérifiées','t-ok')}</span><span class="sp"></span>
      <button class="btn" data-a="auditVerify">Vérifier la chaîne</button>${can('ADMIN')?`<button class="btn dng" data-a="auditTamper">Simuler une falsification</button>`:''}</div>`
    + table([{h:'N°',r:1,f:r=>r.seq},{h:'Horodatage',f:r=>dtfr(r.at)},{h:'Acteur',f:r=>esc(r.actor==='SYSTEM'?'Système':nm(r.actor))},{h:'Action',f:r=>`<span class="mono">${esc(r.action)}</span>`},{h:'Objet',f:r=>`<span class="mono">${esc(r.target)}</span>`},{h:'Empreinte',f:r=>`<span class="mono muted">${esc(r.hash.slice(0,12))}…</span>`}], S.audit.slice().reverse().slice(0,120));
  if(tab==='sessions') body = table([{h:'Utilisateur',f:s=>esc(nm(s[0]))},{h:'Appareil',f:s=>esc(s[1])},{h:'Plateforme',f:s=>s[2]},{h:'Dernière activité',f:s=>s[3]},{h:'',f:()=>`<button class="btn sm" data-a="noop">Révoquer</button>`}],
    [[S.me,'Poste de travail','Web','maintenant'],[DG_ID,'Téléphone Android','Android','il y a 2 h'],[UNIT.SDG.head,'Poste du secrétariat','Web','il y a 20 min']])
    + `<div class="pad"><div class="note">Authentification déléguée à l’annuaire Windows (AD), habilitations gérées dans SIGA. Verrouillage après échecs répétés, révocation immédiate des sessions.</div></div>`;
  if(tab==='rights') body = table([{h:'Date',f:r=>dtfr(r.at)},{h:'Par',f:r=>esc(nm(r.actor))},{h:'Changement',f:r=>`<span class="mono">${esc(r.action)}</span> ${esc(r.target)} ${esc(r.detail)}`}], S.audit.filter(r=>/INTERIM|DELEGATION|ROLE|WORKFLOW/.test(r.action)).reverse(), {emptyTitle:'Aucun changement de droits'});
  return pageHead('Système','Audit et sécurité','Journal en ajout seul : chaque ligne porte l’empreinte de la précédente. Une modification directe en base est détectée à la ligne exacte.')
  + `<div class="panel"><div class="tabs">${[['log','Journal chaîné'],['rights','Changements de droits'],['sessions','Sessions et appareils']].map(([k,l])=>`<button class="${tab===k?'on':''}" data-a="tab" data-x="audit:${k}">${l}</button>`).join('')}</div>${body}</div>`;
}});
ACT.noop = () => toast('Action simulée dans la maquette');
ACT.auditVerify = () => { const b = verifyAudit(); toast(b?'Falsification détectée à la ligne '+b:'Chaîne intègre'); };
ACT.auditTamper = () => { if(S.audit.length<3) return; S.audit[Math.floor(S.audit.length/2)].detail += ' (modifié hors application)'; save(); rerender(); toast('Une ligne a été modifiée « en base » : la vérification la repère'); };

mod('archivage', {group:'Système', label:'Archivage et sauvegarde', icon:'archive', visible:()=>can('ARCHIVE_MANAGE')||can('BACKUP'), render(){
  const tested = S.backups.find(b=>b.kind==='Test de restauration');
  return pageHead('Système','Archivage et sauvegarde','Durées de conservation par nature de dossier, sauvegarde complète hebdomadaire, différentielle quotidienne, journal continu. Une sauvegarde n’est prouvée que restaurée.',
    can('BACKUP')?`<button class="btn" data-a="restoreTest">Consigner un test de restauration</button>`:'')
  + (!tested?`<div class="note warn"><b>Aucun test de restauration consigné.</b> Le test trimestriel sur un environnement dédié est la condition de mise en service.</div>`:'')
  + `<div class="grid g2"><div class="panel"><div class="panel-h">Politiques de conservation</div>${table([{h:'Nature',f:p=>`<b>${p[0]}</b>`},{h:'Durée active',f:p=>p[1]},{h:'Sort final',f:p=>p[2]}],
      [['Ordres de mission','5 ans','Archives'],['Courrier arrivée et départ','10 ans','Tri'],['Dossiers du personnel','Carrière + 5 ans','Archives'],['Pièces comptables BCMS','10 ans','Archives'],['Journal d’audit','10 ans','Conservation']])}
      <div class="pad"><p class="muted" style="margin:0">Durées à valider avec le Service des Archives et de la Documentation.</p></div></div>
    <div class="panel"><div class="panel-h">Sauvegardes</div>${table([{h:'Date',f:b=>dtfr(b.at)},{h:'Type',f:b=>esc(b.kind)},{h:'Taille',r:1,f:b=>b.size||'—'},{h:'Résultat',f:b=>tag(b.ok?'Réussie':'Échec', b.ok?'t-ok':'t-bad')+EX(b)}], S.backups)}</div></div>`;
}});
ACT.restoreTest = () => { S.backups.unshift({at:nowIso(), kind:'Test de restauration', size:'', ok:true}); audit('RESTORE_TEST', 'PGBACKREST', 'environnement dédié'); commit('Test de restauration consigné'); };

mod('admin', {group:'Système', label:'Administration', icon:'gear', visible:()=>can('ADMIN'), render(){
  const tab = UI.tab.admin || 'org';
  let body='';
  if(tab==='org') body = `<div class="pad kv"><div><span>Organisation</span><b>Direction Générale des Ressources en Eau et de l’Hydraulique</b></div><div><span>Sigle</span><b>DGREH</b></div>
    <div><span>Rattachement</span><b>Ministère de l’Agriculture, de l’Eau, des Ressources Animales et Halieutiques</b></div><div><span>Hébergement</span><b>Serveur interne</b></div>
    <div><span>Annuaire</span><b>Windows (AD) · à confirmer avec le point focal</b></div><div><span>Fuseau</span><b>Africa/Ouagadougou</b></div></div>
    <div class="pad"><div class="note">Plateforme multi-organisations : une autre direction générale s’ajoute avec ses propres structures, circuits et modèles. L’isolation est garantie par la base elle-même.</div></div>`;
  if(tab==='roles'){ const roles = Object.keys(PERMS); const perms = [...new Set(Object.values(PERMS).flat())].sort();
    body = `<div class="tbl-w"><table class="t matrix"><thead><tr><th>Permission</th>${roles.map(r=>`<th>${esc(ROLE_LABEL[r])}</th>`).join('')}</tr></thead><tbody>
      ${perms.map(p=>`<tr><td class="mono">${p}</td>${roles.map(r=>`<td>${PERMS[r].includes(p)?'<span class="yes">●</span>':''}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`; }
  if(tab==='comptes') body = table([{h:'Agent',f:a=>`<b>${esc(a.name)}</b><span class="sub mono">${esc(a.mat)}</span>`},{h:'Profils',f:a=>rolesOf(a.id).map(r=>tag(ROLE_LABEL[r],'t-n')).join(' ')},{h:'Compte',f:a=>a.driver?'<span class="muted">Sans compte</span>':tag('Annuaire','t-ok')},{h:'',f:a=>a.driver?'':`<button class="btn sm" data-a="setUser" data-x="${a.id}">Voir en tant que</button>`}], AG.slice(0,60))
    + '<div class="pad muted">60 premiers agents affichés.</div>';
  if(tab==='num') body = table([{h:'Série',f:n=>`<b>${n[0]}</b>`},{h:'Format',f:n=>`<span class="mono">${n[1]}</span>`},{h:'Prochain',f:n=>`<span class="mono">${n[2]}</span>`},{h:'',f:n=>n[3]?tag('À confirmer','t-warn'):''}],
    [['Ordre de mission','OM/{annee}/{sigle}/{seq:0000}','OM/2026/DGREH/'+pad((S.counters['OM|2026']||0)+1,4),false],['Arrivée','{seq:0000}/{annee}',REG_FMT.ARRIVEE((S.counters['ARRIVEE|2026']||0)+1),true],
     ['Départ','{seq:0000}/{sigle}/{annee}',REG_FMT.DEPART((S.counters['DEPART|2026']||0)+1),true],['Bordereau','BE-{seq:0000}/{annee}',REG_FMT.BORDEREAU((S.counters['BORDEREAU|2026']||0)+1),true],['Note de service','NS/{seq:000}/{annee}/{sigle}','NS/'+pad((S.counters['NOTE|2026']||0)+1,3)+'/2026/DGREH',true]])
    + '<div class="pad"><div class="note">Numéros attribués dans la transaction : une annulation ne consomme aucun numéro, un numéro attribué n’est jamais réutilisé.</div></div>';
  if(tab==='params') body = `<div class="pad grid" style="max-width:720px">
    <label class="f" for="p1">Distribution du courrier<select class="inp" id="p1" data-ch="setParam" data-k="mail_policy"><option value="HIERARCHICAL" ${S.settings.mail_policy==='HIERARCHICAL'?'selected':''}>Hiérarchique : le chef transmet à ses agents</option><option value="DIRECT" ${S.settings.mail_policy==='DIRECT'?'selected':''}>Directe : un chef atteint tout agent de son sous-arbre</option></select><small>Réponse d’un agent : « que le Directeur passe par le chef de service ».</small></label>
    <label class="f" for="p2">Décompte des jours de congé<select class="inp" id="p2" data-ch="setParam" data-k="leave_count"><option value="CALENDAR" ${S.settings.leave_count==='CALENDAR'?'selected':''}>Jours consécutifs</option><option value="BUSINESS" ${S.settings.leave_count==='BUSINESS'?'selected':''}>Jours ouvrés</option></select><small>À confirmer par la RH.</small></label>
    <div class="kv"><div><span>Horaires ouvrés</span><b>07:30 – 16:00, pause 12:30 – 13:30</b></div><div><span>Jours ouvrés</span><b>Lundi à vendredi</b></div><div><span>Objectif du circuit OM</span><b>4 h ouvrées</b></div></div></div>`;
  return pageHead('Système','Administration','Organisation, comptes, rôles et permissions, numérotation, paramètres. Aucune valeur métier codée en dur.')
  + `<div class="panel"><div class="tabs">${[['org','Organisation'],['comptes','Comptes'],['roles','Rôles et permissions'],['num','Numérotation'],['params','Paramètres']].map(([k,l])=>`<button class="${tab===k?'on':''}" data-a="tab" data-x="admin:${k}">${l}</button>`).join('')}</div>${body}</div>`;
}});
ACT.setParam = (v, el) => { S.settings[el.dataset.k] = v; audit('SETTING_CHANGED', el.dataset.k, v); commit('Paramètre enregistré'); };
