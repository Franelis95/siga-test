/* =====================================================================
   PILOTAGE : vue d'ensemble, tableau de bord, mes tâches, notifications, recherche
   ===================================================================== */
function myTasks(me=S.me){
  const t = [];
  const push = (kind, title, sub, link, sev, due) => t.push({kind, title, sub, link, sev:sev||'info', due});
  S.missions.forEach(m => {
    const s = activeStep(m);
    if(m.status==='PENDING_CONSENT' && m.initiator===me) push('OM', 'Donner votre accord : '+(m.number||m.ref), 'Modification proposée par '+nm(m.pending.by), 'om:'+m.id, 'warn');
    if(s && m.status==='IN_APPROVAL' && (s.actor===me || (s.unit && canActForUnit(me, s.unit)))) push('OM', (s.code==='BCMS'?'Affecter les moyens : ':s.code==='SAF'?'Confirmer le financement : ':s.code==='SG_SIGNATURE'?'Déposer l’OM signé : ':'Valider l’OM : ')+(m.number||m.ref), m.subject+' · '+nm(m.initiator), 'om:'+m.id, missionConflicts(m).length?'bad':'warn');
    if(m.status==='PENDING_CORRECTION' && m.initiator===me) push('OM', 'Corriger l’OM '+m.ref, (m.steps.find(x=>x.status==='RETURNED')||{}).comment, 'om:'+m.id, 'warn');
    if(m.steps.some(s=>s.status==='AWAITING') && can('ADMIN',me)) push('Circuit', 'Acteur à désigner : '+m.ref, 'Poste vacant ou autorité extérieure', 'om:'+m.id, 'bad');
    if(can('BCMS_ASSIGN_RESOURCES',me) && missionConflicts(m).length && m.status==='IN_APPROVAL') push('BCMS', 'Arbitrer un conflit : '+m.ref, missionConflicts(m).map(c=>c.kind+' '+c.res).join(', '), 'om:'+m.id, 'bad');
  });
  S.requests.forEach(r => { const s = activeStep(r);
    if(s && (s.actor===me || canActForUnit(me, s.unit, s.nature==='OPINION'?'REQUEST_OPINION':'REQUEST_DECIDE'))) push('Demande', (s.nature==='OPINION'?'Donner un avis : ':'Statuer : ')+REQ_TYPES[r.type].short.toLowerCase()+' de '+nm(r.requester), period(r), 'demandes:'+r.id, 'warn');
    if(r.status==='DRAFT' && r.requester===me) push('Demande', 'Brouillon à soumettre : '+r.ref, period(r), 'demandes:'+r.id);
  });
  S.mail.forEach(m => {
    if(m.status==='AWAITING_IMPUTATION' && (can('MAIL_IMPUTE',me) || canActForUnit(me,'DGREH','MAIL_IMPUTE'))) push('Courrier', 'Imputer le courrier '+m.num, m.conf?'Pli confidentiel · '+m.corr:m.subject, 'courrier:'+m.id, 'warn');
    if(m.status==='REGISTERED' && can('MAIL_REGISTER',me)) push('Courrier', 'Numériser et remettre '+m.num, m.corr, 'courrier:'+m.id);
    m.targets.filter(x=>x.status==='OPEN' && canActForUnit(me,x.unit,'MAIL_ASSIGN') && !m.assignments.some(a=>a.target===x.id && a.status!=='CANCELLED') && !m.targets.some(c=>c.parent===x.id)).forEach(x =>
      push('Courrier', 'Transmettre le courrier '+m.num+' ('+x.unit+')', (x.role==='LEAD'?'Unité pilote':'Copie')+' · '+INSTR[x.instr], 'courrier:'+m.id, overdue(m)?'bad':'info', x.due));
    m.assignments.filter(a=>a.to===me && a.status==='OPEN').forEach(a => push('Courrier', 'Traiter le courrier '+m.num, INSTR[a.instr]+' · '+(canReadMail(m,me)?m.subject:'confidentiel'), 'courrier:'+m.id, a.due&&a.due<TODAY?'bad':'info', a.due));
    if(m.status==='AWAITING_SIGNATURE' && me===DG_ID) push('Courrier', 'Signer le départ : '+m.subject, m.corr, 'courrier:'+m.id);
    if(m.status==='SIGNED' && can('MAIL_REGISTER',me)) push('Courrier', 'Enregistrer au départ : '+m.subject, m.corr, 'courrier:'+m.id);
  });
  if(can('HR_MANAGE',me) || can('INTERIM_DESIGNATE',me))
    S.requests.filter(r=>r.type==='LEAVE' && r.status==='APPROVED' && UNIT[AGENT[r.requester].unit].head===r.requester && r.endsOn>=TODAY && !S.interims.some(i=>i.unit===AGENT[r.requester].unit && i.from<=r.startsOn && i.to>=r.endsOn))
      .forEach(r => push('Personnel', 'Désigner un intérimaire : '+AGENT[r.requester].unit, nm(r.requester)+' en congé du '+dfr(r.startsOn)+' au '+dfr(r.endsOn), 'demandes:'+r.id, 'warn'));
  if(can('BACKUP',me) && !S.backups.some(b=>b.kind==='Test de restauration')) push('Sauvegarde', 'Réaliser le test de restauration trimestriel', 'Aucun test consigné : une sauvegarde jamais restaurée n’est pas une sauvegarde', 'archivage', 'bad');
  return t;
}
ACT.taskGo = x => { const [k,id] = x.split(':'); if(id){ if(k==='om') UI.sel.om=id; if(k==='demandes') UI.sel.req=id; if(k==='courrier') UI.sel.mail=id; } go(k); };
const SEV_IC = {bad:['alert','t-bad'], warn:['clock','t-warn'], info:['tasks','t-info']};
const taskList = ts => ts.length ? `<div class="list">${ts.map(t=>`<a class="li" href="#" data-a="taskGo" data-x="${esc(t.link)}"><span class="ic ${SEV_IC[t.sev][1]}">${ico(SEV_IC[t.sev][0])}</span>
  <span class="bd"><b>${esc(t.title)}</b><span>${esc(t.sub||'')}</span></span><span class="rt">${esc(t.kind)}${t.due?'<br>'+dfr(t.due):''}</span></a>`).join('')}</div>`
  : `<div class="empty"><b>Rien à traiter</b>Aucune action n’attend ce profil.</div>`;

/* ---------------- Vue d'ensemble des 16 modules ---------------- */
const MODULE_MAP = [
  ['accueil','Vue d’ensemble','Tous les modules et le profil qui les ouvre','grid',null],
  ['tableau','Tableaux de bord','Indicateurs propres à chaque profil','chart','DG'],
  ['taches','Mes tâches','Toutes les actions qui vous attendent, tous modules confondus','tasks','DG'],
  ['notifications','Notifications','Centre de notifications, canaux, relances','bell','DG'],
  ['recherche','Recherche globale','Agents, OM, courriers, documents, véhicules, dans vos droits','search','DG'],
  ['om','Ordres de mission','Demande, circuit, moyens, financement, acte signé','mission','Agent'],
  ['demandes','Demandes et actes','Congé, absence, attestations selon les canevas','form','Agent'],
  ['courrier','Courrier et secrétariat','Registres, imputation, distribution, bordereaux','mail','Secrétariat DG'],
  ['rh','Personnel','Référentiel, organigramme, intérims, décisions de congé','people','Ressources humaines'],
  ['bcms','BCMS · logistique','Parc, chauffeurs, planning, stocks, patrimoine','car','BCMS'],
  ['saf','Finances','Financement des OM, budget, barème des frais','coins','Service financier'],
  ['ged','Documents (GED)','Actes générés, versions, empreintes, vérification','folder','DG'],
  ['rapports','Rapports et exports','Statistiques par période et par structure','chart','DG'],
  ['circuits','Circuits de validation','Étapes, avis, décisions, délais : paramétrables','flow','Administrateur'],
  ['audit','Audit et sécurité','Journal chaîné, sessions, changements de droits','shield','Contrôle interne'],
  ['archivage','Archivage et sauvegarde','Conservation, sauvegardes, tests de restauration','archive','Administrateur'],
  ['admin','Administration','Organisation, comptes, rôles, numérotation, paramètres','gear','Administrateur']
];
mod('accueil', {group:'Pilotage', label:'Vue d’ensemble', icon:'grid', render(){
  const quick = Object.fromEntries(QUICK());
  return pageHead('SIGA · DGREH','Vue d’ensemble',
    'Les 16 modules de SIGA sur un socle commun : organigramme, personnel, circuits, documents, audit. Chaque carte ouvre le module ; changez de profil pour le voir avec d’autres droits.')
  + `<div class="grid g21"><div class="panel"><div class="panel-h">Modules</div><div class="pad"><div class="mod-grid">
    ${MODULE_MAP.filter(x=>x[0]!=='accueil').map(([k,l,d,ic,prof]) => { const ok = !MODS[k].visible || MODS[k].visible();
      return `<a class="mod" href="#${ok?k:''}" ${ok?'':`data-a="openAs" data-x="${k}|${quick[prof]||'ADMIN'}"`}><span class="ic">${ico(ic)}</span><span><b>${esc(l)}</b><span>${esc(d)}</span>${ok?'':`<br><span class="tag t-warn plain" style="margin-top:6px">Ouvrir en tant que ${esc(prof)}</span>`}</span></a>`; }).join('')}
  </div></div></div>
  <div class="grid"><div class="panel"><div class="panel-h">Vos actions <span class="cnt-b">${myTasks().length}</span><span class="sp"></span><a href="#taches" class="btn sm">Tout voir</a></div>${taskList(myTasks().slice(0,5))}</div>
  <div class="panel"><div class="panel-h">Parcours à essayer</div><div class="list">
    ${[['Suivre un congé de bout en bout','Déposer en tant qu’agent, puis passer au directeur et au DG','demandes'],['Imputer un courrier','En tant que DG, imputer puis transmettre en tant que directeur','courrier'],['Affecter un véhicule','En tant que BCMS : conflit détecté, décision humaine','om'],['Désigner un intérim','En tant que RH : note de service générée','rh']]
      .map(([t,d,k])=>`<a class="li" href="#${k}"><span class="ic t-info">${ico('flow')}</span><span class="bd"><b>${t}</b><span>${d}</span></span></a>`).join('')}</div></div></div></div>`;
}});
ACT.openAs = x => { const [k,id] = x.split('|'); S.me=id; save(); go(k); toast('Profil : '+nm(id)); };

/* ---------------- Tableau de bord par profil ---------------- */
mod('tableau', {group:'Pilotage', label:'Tableau de bord', icon:'chart', render(){
  const r = mainRole(S.me), me = person(S.me);
  const tasks = myTasks();
  const myUnitCodes = UNITS.filter(u => ancestors(u.code).some(a=>a.code===me.unit)).map(u=>u.code);
  const inScope = id => r==='DG'||r==='ADMIN' ? true : AGENT[id] && myUnitCodes.includes(AGENT[id].unit);
  const oms = S.missions.filter(m=>inScope(m.initiator));
  const onMission = new Set(S.missions.filter(m=>['SIGNED','PENDING_SG_SIGNATURE'].includes(m.status) && m.from<=TODAY && m.to>=TODAY).flatMap(m=>m.participants));
  const absent = new Set(S.requests.filter(q=>q.status==='APPROVED' && q.startsOn<=TODAY && q.endsOn>=TODAY).map(q=>q.requester));
  const staff = AG.filter(a=>inScope(a.id));
  let k = '';
  if(['DG','DIRECTOR','HEAD'].includes(r)){
    k = kpi('Effectif', staff.length, r==='DG'?'toute la DGREH':unitName(me.unit)) + kpi('En mission', staff.filter(a=>onMission.has(a.id)).length, 'aujourd’hui')
      + kpi('En congé ou absent', staff.filter(a=>absent.has(a.id)).length, 'aujourd’hui') + kpi('Mes validations en attente', tasks.length, '', tasks.length?'warn':'good','taches')
      + kpi('OM en circuit', oms.filter(m=>m.status==='IN_APPROVAL').length, 'périmètre '+ (r==='DG'?'DGREH':me.unit)) + kpi('Courriers en retard', S.mail.filter(m=>overdue(m) && (r==='DG'||m.targets.some(t=>myUnitCodes.includes(t.unit)))).length, '', '', 'courrier');
  } else if(r==='SECRETARIAT'){
    k = kpi('Arrivées 2026', S.mail.filter(m=>m.dir==='IN').length, 'registre arrivée') + kpi('À numériser ou remettre', S.mail.filter(m=>m.status==='REGISTERED').length, '', 'warn') + kpi('En attente d’imputation', S.mail.filter(m=>m.status==='AWAITING_IMPUTATION').length, 'chez le DG')
      + kpi('Départs à enregistrer', S.mail.filter(m=>m.status==='SIGNED').length, '') + kpi('OM à déposer signés', S.missions.filter(m=>m.status==='PENDING_SG_SIGNATURE').length, '', 'warn','om');
  } else if(r==='RH'){
    k = kpi('Agents', AG.length, '') + kpi('En congé aujourd’hui', absent.size, '') + kpi('Intérims à désigner', tasks.filter(t=>t.kind==='Personnel').length, '', 'warn') + kpi('Décisions de congé', S.entitlements.length, 'enregistrées') + kpi('Demandes en circuit', S.requests.filter(q=>q.status==='IN_APPROVAL').length, '');
  } else if(r==='BCMS'){
    k = kpi('Véhicules disponibles', VEH.filter(vehicleOk).length, 'sur '+VEH.length,'good') + kpi('Moyens à affecter', S.missions.filter(m=>(activeStep(m)||{}).code==='BCMS').length, '', 'warn','om') + kpi('Conflits', S.missions.filter(m=>missionConflicts(m).length).length, '', 'bad') + kpi('Chauffeurs', AG.filter(a=>a.driver).length, '');
  } else if(r==='SAF'){
    k = kpi('Financements à confirmer', S.missions.filter(m=>(activeStep(m)||{}).code==='SAF').length, '', 'warn','om') + kpi('OM financés', S.missions.filter(m=>m.funding).length, '') + kpi('Barème', 'À saisir', 'décret n° 2012-735', 'warn','saf');
  } else if(r==='ADMIN'){
    k = kpi('Comptes actifs', AG.filter(a=>!a.driver).length+1, 'dont 1 technique') + kpi('Journal d’audit', S.audit.length, verifyAudit()?'chaîne rompue':'chaîne intègre', verifyAudit()?'bad':'good','audit') + kpi('Circuits paramétrés', Object.keys(S.workflows).length, '') + kpi('Dernière sauvegarde', S.backups.length?dfr(S.backups[0].at):'—', '', '', 'archivage');
  } else {
    const mine = S.missions.filter(m=>m.participants.includes(S.me));
    k = kpi('Mes OM', mine.length, mine.filter(m=>m.status==='IN_APPROVAL').length+' en circuit') + kpi('Mes demandes', S.requests.filter(q=>q.requester===S.me).length, '') + kpi('Courriers attribués', S.mail.filter(m=>m.assignments.some(a=>a.to===S.me&&a.status==='OPEN')).length, '')
      + kpi('Solde de congé', S.entitlements.filter(e=>e.agent===S.me).reduce((s,e)=>s+entitlementLeft(e),0)+' j', '');
  }
  const byUnit = UNITS.filter(u=>u.type!=='DG').map(u=>[u.code, S.missions.filter(m=>AGENT[m.initiator].unit===u.code).length]).filter(x=>x[1]).sort((a,b)=>b[1]-a[1]);
  const byStatus = Object.entries(OM_STATUS).map(([s,[l]])=>[l, S.missions.filter(m=>m.status===s).length]).filter(x=>x[1]);
  return pageHead('Pilotage', 'Tableau de bord · '+(ROLE_LABEL[r]||''), 'Indicateurs calculés sur les mêmes données que les modules, dans le périmètre de '+esc(me.name)+'.')
  + `<div class="kpis">${k}</div>
  <div class="grid g2"><div class="panel"><div class="panel-h">À faire <span class="cnt-b">${tasks.length}</span></div>${taskList(tasks.slice(0,6))}</div>
  <div class="panel"><div class="panel-h">Ordres de mission par statut</div><div class="pad">${byStatus.length?bars(byStatus,'w'):'<div class="empty">Aucun OM</div>'}</div></div>
  <div class="panel"><div class="panel-h">OM par structure initiatrice</div><div class="pad">${byUnit.length?bars(byUnit):'<div class="empty">Aucun OM</div>'}</div></div>
  <div class="panel"><div class="panel-h">Effectif par structure</div><div class="pad">${bars(UNITS.map(u=>[u.code, AG.filter(a=>a.unit===u.code).length]).sort((a,b)=>b[1]-a[1]))}</div></div></div>`;
}});

/* ---------------- Mes tâches ---------------- */
mod('taches', {group:'Pilotage', label:'Mes tâches', icon:'tasks', render(){
  const t = myTasks(); const kinds = [...new Set(t.map(x=>x.kind))];
  return pageHead('Pilotage','Mes tâches', 'Toutes les actions qui attendent '+esc(nm(S.me))+', tous modules confondus. Le silence ne vaut jamais accord : une échéance dépassée relance et informe le supérieur, sans transférer le droit.')
  + `<div class="kpis">${kpi('À traiter', t.length, '', t.length?'warn':'good')}${kpi('Urgentes', t.filter(x=>x.sev==='bad').length, 'retard ou conflit', t.some(x=>x.sev==='bad')?'bad':'')}${kinds.map(k=>kpi(k, t.filter(x=>x.kind===k).length, '')).join('')}</div>
  <div class="panel">${taskList(t)}</div>`;
}});

/* ---------------- Notifications ---------------- */
mod('notifications', {group:'Pilotage', label:'Notifications', icon:'bell', render(){
  const mine = S.notifs.filter(n=>n.to===S.me);
  const cat = {ACTION:['Action attendue','t-gold'], INFORMATION:['Information','t-info'], ESCALATION:['Escalade','t-bad'], REMINDER:['Relance','t-warn']};
  return pageHead('Pilotage','Notifications', 'Centre de notifications. Le contenu reste minimal : jamais le motif d’une absence ni l’objet d’un pli confidentiel.',
    `<button class="btn" data-a="notifAll">Tout marquer comme lu</button>`)
  + `<div class="grid g21"><div class="panel">${mine.length?`<div class="list">${mine.map(n=>`<a class="li" href="#${esc(n.link)}" data-a="notifRead" data-x="${n.id}" style="${S.readNotifs[n.id]?'opacity:.62':''}"><span class="ic ${cat[n.cat][1]}">${ico('bell')}</span>
    <span class="bd"><b>${esc(n.title)}</b><span>${esc(n.body)}</span></span><span class="rt">${tag(cat[n.cat][0],cat[n.cat][1])}<br>${dtfr(n.at)}</span></a>`).join('')}</div>`:'<div class="empty"><b>Aucune notification</b></div>'}</div>
  <div class="panel"><div class="panel-h">Canaux</div><div class="pad grid">
    ${table([{h:'Canal',f:c=>`<b>${c[0]}</b>`},{h:'Usage',f:c=>esc(c[1])},{h:'État',f:c=>tag(c[2],c[3])}],
     [['Dans SIGA','Toutes les notifications, temps réel','Actif','t-ok'],['Courriel','Relais des actions attendues et relances','Actif','t-ok'],['WhatsApp','Lien préparé vers l’acteur, envoyé par l’utilisateur','À valider','t-warn'],['Android','Notification sur le téléphone','Incrément suivant','t-n']])}
    <div class="note">WhatsApp est cité par 10 répondants sur 11. Proposition en attente d’arbitrage : un lien préparé, sans abonnement payant, en complément de l’alerte SIGA.</div></div></div></div>`;
}});
ACT.notifRead = id => { S.readNotifs[id]=true; save(); };
ACT.notifAll = () => { S.notifs.filter(n=>n.to===S.me).forEach(n=>S.readNotifs[n.id]=true); commit('Notifications lues'); };

/* ---------------- Recherche globale ---------------- */
mod('recherche', {group:'Pilotage', label:'Recherche globale', icon:'search', render(){
  const q = (UI.q.global||'').trim(); const n = s => String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase();
  const hit = s => q.length>=2 && n(s).includes(n(q));
  const res = q.length<2 ? [] : [
    ...AG.filter(a=>hit(a.name+' '+a.mat+' '+a.job)).slice(0,12).map(a=>({k:'Agent', t:a.name, s:a.fn+' · '+a.unit, act:'agentOpen', x:a.id})),
    ...UNITS.filter(u=>hit(u.name+' '+u.code)).map(u=>({k:'Structure', t:u.name, s:u.code, act:'unitOpen', x:u.code})),
    ...S.missions.filter(m=>omVisible(m) && hit(m.subject+' '+m.ref+' '+(m.number||'')+' '+m.dest)).map(m=>({k:'Ordre de mission', t:(m.number||m.ref)+' · '+m.subject, s:m.dest, act:'taskGo', x:'om:'+m.id})),
    ...S.mail.filter(m=>canSeeLine(m) && hit((m.num||'')+' '+m.corr+' '+(canReadMail(m)?m.subject:''))).map(m=>({k:'Courrier', t:(m.num||'départ')+' · '+(canReadMail(m)?m.subject:'Courrier confidentiel'), s:m.corr, act:'taskGo', x:'courrier:'+m.id})),
    ...S.requests.filter(r=>reqVisible(r) && hit(r.ref+' '+nm(r.requester))).map(r=>({k:'Demande', t:r.ref+' · '+REQ_TYPES[r.type].label, s:nm(r.requester), act:'taskGo', x:'demandes:'+r.id})),
    ...S.docs.filter(d=>hit(d.number+' '+d.title)).map(d=>({k:'Document', t:d.number+' · '+d.title, s:d.type, act:'taskGo', x:'ged:'})),
    ...(can('BCMS_READ')?VEH.filter(v=>hit(v.plate+' '+v.label)).map(v=>({k:'Véhicule', t:v.plate, s:v.label, act:'taskGo', x:'bcms:'})):[])
  ];
  return pageHead('Pilotage','Recherche globale','Recherche sans accents ni casse, limitée à ce que votre profil a le droit de voir. L’objet d’un pli confidentiel n’est pas indexé.')
  + `<div class="panel"><div class="toolbar"><input class="inp" id="gq2" value="${esc(q)}" placeholder="Ex. forage, 0001/2026, KABORE, Hilux" data-in="globalQ" style="flex:1"></div>
    ${q.length<2?'<div class="empty"><b>Saisissez au moins deux caractères</b>Essayez « ingenieur » sans accent, un matricule ou une immatriculation.</div>'
    :res.length?`<div class="list">${res.map(r=>`<div class="li clk" data-a="${r.act}" data-x="${esc(r.x)}"><span class="ic t-n">${ico('search')}</span><span class="bd"><b>${esc(r.t)}</b><span>${esc(r.s)}</span></span><span class="rt">${esc(r.k)}</span></div>`).join('')}</div>`
    :'<div class="empty"><b>Aucun résultat dans vos droits</b></div>'}</div>`;
}});
INP.globalQ = v => { UI.q.global = v; rerender(); const i=$('#gq2'); if(i){ i.focus(); i.setSelectionRange(v.length,v.length); } };
