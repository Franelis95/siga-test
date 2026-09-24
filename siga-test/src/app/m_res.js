/* =====================================================================
   Modules RESSOURCES : Personnel (RH), BCMS, Finances (SAF)
   ===================================================================== */
const VEH = VEHICLES.map(([plate,type,brand,model,cond,usage,situation]) => ({plate, type, brand, model, cond, usage, situation,
  label:[brand, model].filter(Boolean).join(' ') + (type && !type.startsWith(brand)?' · '+type:'')}));
const VEH_ETAT = v => v.situation==='A_REFORMER' ? ['À réformer','t-bad'] : ['GARAGE','EN_REPARATION'].includes(v.situation) ? ['En réparation','t-warn']
  : (v.situation==='REPARABLE' || v.cond==='PANNE') ? ['En panne','t-bad'] : v.cond==='PASSABLE' ? ['Passable','t-info'] : v.cond==='BON' ? ['Bon','t-ok'] : ['Non renseigné','t-n'];

/* ---------------- PERSONNEL ---------------- */
mod('rh', {group:'Ressources', label:'Personnel', icon:'people', render(){
  const full = can('HR_READ');
  const tab = UI.tab.rh || (full?'agents':'moi');
  const tabs = full ? [['agents','Référentiel du personnel'],['org','Organigramme'],['interims','Intérims et délégations'],['conges','Décisions de congé'],['actes','Actes administratifs'],['import','Import Excel']]
                    : [['moi','Mon dossier'],['org','Organigramme']];
  let body = '';
  if(tab==='moi'){ const a = AGENT[S.me]; body = a ? agentCard(a) : '<div class="empty">Compte technique sans dossier agent.</div>'; }
  if(tab==='agents'){
    const f = UI.filter.rh || {}; const q = (UI.q.rh||'').toLowerCase();
    const rows = AG.filter(a => (!f.unit || a.unit===f.unit) && (!f.cat || (a.cat||'').startsWith(f.cat)) && (!q || (a.name+' '+a.mat+' '+a.job).toLowerCase().includes(q)));
    body = `<div class="toolbar"><input class="inp" id="rhq" placeholder="Nom, matricule, emploi" value="${esc(UI.q.rh||'')}" data-in="rhFilter" style="flex:1;max-width:320px">
      <select class="inp" data-ch="rhUnit" aria-label="Structure"><option value="">Toutes les structures</option>${UNITS.map(u=>`<option value="${u.code}" ${f.unit===u.code?'selected':''}>${u.code} · ${esc(u.name)}</option>`).join('')}</select>
      <select class="inp" data-ch="rhCat" aria-label="Catégorie"><option value="">Toutes catégories</option>${['A','B','C','D','E'].map(c=>`<option ${f.cat===c?'selected':''}>${c}</option>`).join('')}</select>
      <span class="sp"></span><span class="muted">${rows.length} agent(s)</span></div>`
    + table([{h:'Matricule',f:a=>`<span class="mono">${esc(a.mat)}</span>`},{h:'Nom et prénom(s)',f:a=>`<b>${esc(a.name)}</b>`},{h:'Emploi',f:a=>`${esc(a.job)}<span class="sub">Catégorie ${esc(a.cat||'—')}</span>`},
      {h:'Fonction',f:a=>esc(a.fn)+(a.isHead?' '+tag('Responsable','t-info'):'')+(a.driver?' '+tag('Chauffeur','t-n'):'')},{h:'Structure',f:a=>esc(a.unit)},{h:'Compte SIGA',f:a=>a.driver?'<span class="muted">Sans compte</span>':tag('Actif','t-ok')}], rows, {click:'agentOpen'});
  }
  if(tab==='org') body = `<div class="pad"><p class="muted" style="margin-top:0">Organigramme tiré de la liste du personnel au 01/09/2026. Les services internes aux directions ne figurent pas dans la liste : ils s’ajoutent ici sans migration.</p>${orgTree('DGREH')}</div>`;
  if(tab==='interims'){
    body = `<div class="toolbar"><span class="muted">Intérim : remplacement total, borné dans le temps, avec note de service. Délégation : actes précis, révocable, active aussi pendant un intérim.</span><span class="sp"></span>${can('HR_MANAGE')||can('INTERIM_DESIGNATE')?`<button class="btn pri" data-a="interimNew">${ico('plus')}Désigner un intérimaire</button><button class="btn" data-a="delegNew">Nouvelle délégation</button>`:''}</div>
    <div class="panel-h">Intérims</div>${table([{h:'Poste',f:i=>'Chef · '+esc(unitName(i.unit))},{h:'Titulaire',f:i=>esc(nm(UNIT[i.unit].head))},{h:'Intérimaire',f:i=>`<b>${esc(nm(i.agent))}</b>`},{h:'Période',f:i=>dfr(i.from)+' au '+dfr(i.to)},{h:'Note de service',f:i=>`<span class="mono">${esc(i.note||'—')}</span>`},{h:'État',f:i=>tag(i.status==='ACTIVE'?(i.from>TODAY?'Programmé':'En cours'):'Terminé', i.status==='ACTIVE'?'t-ok':'t-n')+EX(i)}], S.interims)}
    <div class="panel-h">Délégations</div>${table([{h:'Poste',f:d=>'Chef · '+esc(unitName(d.unit))},{h:'Délégataire',f:d=>`<b>${esc(nm(d.to))}</b>`},{h:'Actes délégués',f:d=>d.perms.map(p=>tag(p,'t-n')).join(' ')},{h:'Depuis',f:d=>dfr(d.from)},{h:'État',f:d=>tag(d.status==='ACTIVE'?'Active':'Révoquée', d.status==='ACTIVE'?'t-ok':'t-n')+EX(d)+(d.status==='ACTIVE'&&can('HR_MANAGE')?` <button class="btn sm" data-a="delegRevoke" data-x="${d.id}">Révoquer</button>`:'')}], S.delegations)}
    <div class="pad"><div class="note">Actes non délégables : annuler un acte signé, modifier les habilitations, désigner un intérimaire. Un intérimaire les exerce, puisqu’il remplace le titulaire.</div></div>`;
  }
  if(tab==='conges'){
    body = `<div class="toolbar"><span class="muted">Le nombre de jours vient de la décision de congé, jamais d’un barème calculé par SIGA.</span><span class="sp"></span>${can('HR_MANAGE_ENTITLEMENT')?`<button class="btn pri" data-a="entNew">${ico('plus')}Enregistrer une décision</button>`:''}</div>`
    + table([{h:'Agent',f:e=>`<b>${esc(nm(e.agent))}</b><span class="sub">${esc(AGENT[e.agent].unit)}</span>`},{h:'Décision',f:e=>esc(e.act)+EX(e)},{h:'Année',f:e=>e.year},{h:'Accordés',r:1,f:e=>e.days},
      {h:'Engagés',r:1,f:e=>e.days-entitlementLeft(e)},{h:'Solde',r:1,f:e=>`<b>${entitlementLeft(e)}</b>`}], S.entitlements)
    + (()=>{ const need = S.requests.filter(r=>r.type==='LEAVE' && r.status==='APPROVED' && UNIT[AGENT[r.requester].unit].head===r.requester && !S.interims.some(i=>i.unit===AGENT[r.requester].unit && i.from<=r.startsOn && i.to>=r.endsOn));
      return need.length?`<div class="pad"><div class="note warn"><b>${need.length} responsable(s) en congé sans intérim.</b> ${need.map(r=>`${esc(nm(r.requester))} (${esc(AGENT[r.requester].unit)}, ${dfr(r.startsOn)} au ${dfr(r.endsOn)}) <button class="btn sm" data-a="interimNew" data-x="${AGENT[r.requester].unit}|${r.startsOn}|${r.endsOn}">Désigner</button>`).join(' · ')}</div></div>`:''; })();
  }
  if(tab==='actes') body = table([{h:'Acte',f:x=>`<b>${esc(x[0])}</b>`},{h:'Circuit',f:x=>esc(x[1])},{h:'Modèle',f:x=>x[2]?tag('Reçu','t-ok'):tag('À fournir','t-warn')}],
    [['Décision de congé','RH, DG',false],['Note de service d’intérim','Générée par SIGA, signée par le DG',true],['Prise de service','RH, DG',false],['Cessation de service','RH, DG',false],['Affectation','RH, DG',false],['Attestation de travail','RH',false],['Certificat administratif','À préciser',false]])
    + `<div class="pad"><div class="note">Les actes s’inscrivent dans l’historique de carrière de l’agent, sans jamais écraser l’état précédent. Les canevas manquants sont demandés à la RH.</div></div>`;
  if(tab==='import') body = `<div class="pad grid"><div class="note ok">Dernier import : « Liste actualisée des agents de la DGREH au 01/09/2026 » · 160 lignes valides · 0 rejet.</div>
    ${table([{h:'Colonne du fichier',f:x=>`<span class="mono">${esc(x[0])}</span>`},{h:'Champ SIGA',f:x=>esc(x[1])},{h:'Contrôle',f:x=>esc(x[2])}],
    [['MATRICULE','Matricule','Unique, obligatoire'],['NOM ET PRENOM','Nom et prénom(s)','Obligatoire'],['SEXE','Sexe','M ou F'],['EMPLOI','Emploi','Texte'],['CATEGORIE','Catégorie','A1 à E'],['FONCTION','Fonction','Détecte les responsables'],['DIRECTION /SERVICE','Structure','Rapprochée de l’organigramme'],['DATE DE PRISE DE SERVICE A LA DGREH','Prise de service','Date']])}
    <p class="muted" style="margin:0">Import en trois temps : dépôt, aperçu des écarts, confirmation. Aucun compte n’est créé d’office.</p></div>`;
  return pageHead('Ressources','Personnel', full?`${AG.length} agents, ${UNITS.length} structures, ${AG.filter(a=>a.isHead).length} responsables. Référentiel commun à tous les modules.`:'Votre dossier administratif et l’organigramme.')
  + (full?`<div class="kpis">${kpi('Agents',AG.length,'au 01/09/2026')}${kpi('Femmes',AG.filter(a=>a.sex==='F').length, Math.round(AG.filter(a=>a.sex==='F').length/AG.length*100)+' % de l’effectif')}
     ${kpi('Catégorie A',AG.filter(a=>(a.cat||'').startsWith('A')).length,'cadres')}${kpi('Chauffeurs',AG.filter(a=>a.driver).length,'sans compte SIGA')}
     ${kpi('Intérims en cours',S.interims.filter(i=>i.status==='ACTIVE'&&i.from<=TODAY&&i.to>=TODAY).length,'')}</div>`:'')
  + `<div class="panel"><div class="tabs">${tabs.map(([k,l])=>`<button class="${tab===k?'on':''}" data-a="tab" data-x="rh:${k}">${l}</button>`).join('')}</div>${body}</div>`;
}});
INP.rhFilter = v => { UI.q.rh=v; rerender(); const i=$('#rhq'); if(i){ i.focus(); i.setSelectionRange(v.length,v.length);} };
ACT.rhUnit = v => { UI.filter.rh = Object.assign(UI.filter.rh||{}, {unit:v}); rerender(); };
ACT.rhCat = v => { UI.filter.rh = Object.assign(UI.filter.rh||{}, {cat:v}); rerender(); };
function orgTree(code){
  const u = UNIT[code]; const kids = UNITS.filter(x=>x.parent===code);
  const n = AG.filter(a=>a.unit===code).length;
  return `<ul><li><span class="node" data-a="unitOpen" data-x="${code}"><span><span class="ty">${esc(TYPE_LABEL[u.type])} · ${code}</span><br><b>${esc(u.name)}</b><br><span class="muted" style="font-size:12px">${esc(u.head?nm(u.head):'Poste vacant')} · ${n} agent(s)</span></span></span>
    ${kids.length?kids.sort((a,b)=>a.type.localeCompare(b.type)).map(k=>orgTree(k.code)).join(''):''}</li></ul>`.replace(/<\/ul><ul>/g,'');
}
ACT.unitOpen = code => { UI.filter.rh = {unit:code}; UI.tab.rh='agents'; if(can('HR_READ')) rerender(); else toast(unitName(code)); };
function agentCard(a){
  const reqs = S.requests.filter(r=>r.requester===a.id), oms = S.missions.filter(m=>m.participants.includes(a.id));
  const ents = S.entitlements.filter(e=>e.agent===a.id);
  return `<div class="pad grid"><div class="kv">
    <div><span>Matricule</span><b class="mono">${esc(a.mat)}</b></div><div><span>Nom et prénom(s)</span><b>${esc(a.name)}</b></div><div><span>Sexe</span><b>${esc(a.sex||'—')}</b></div>
    <div><span>Emploi</span><b>${esc(a.job)}</b></div><div><span>Catégorie</span><b>${esc(a.cat||'—')}</b></div><div><span>Fonction</span><b>${esc(a.fn)}</b></div>
    <div><span>Structure</span><b>${esc(unitName(a.unit))}</b></div><div><span>Prise de service à la DGREH</span><b>${dfr(a.since)}</b></div>
    <div><span>Supérieur hiérarchique</span><b>${esc(nm((actorOfUnit(resolvePosition('SUPERIOR',a.id))||{}).id))}</b></div></div>
    <div class="grid g3"><div class="panel"><div class="panel-h">Carrière</div><div class="list"><div class="li"><div class="bd"><b>Prise de service à la DGREH</b><span>${esc(unitName(a.unit))}</span></div><span class="rt">${dfr(a.since)}</span></div>${a.isHead?`<div class="li"><div class="bd"><b>Nomination : ${esc(a.fn)}</b><span>Acte à rattacher</span></div></div>`:''}</div></div>
    <div class="panel"><div class="panel-h">Missions <span class="cnt-b">${oms.length}</span></div><div class="list">${oms.map(m=>`<div class="li"><div class="bd"><b>${esc(m.number||m.ref)}</b><span>${esc(m.dest)} · ${dfr(m.from)}</span></div></div>`).join('')||'<div class="empty">Aucune</div>'}</div></div>
    <div class="panel"><div class="panel-h">Congés et absences <span class="cnt-b">${reqs.length}</span></div><div class="list">${reqs.map(r=>`<div class="li"><div class="bd"><b>${esc(REQ_TYPES[r.type].short)} · ${period(r)}</b><span>${esc((REQ_STATUS[r.status]||[''])[0])}</span></div></div>`).join('')}${ents.map(e=>`<div class="li"><div class="bd"><b>Solde ${entitlementLeft(e)} jours</b><span>${esc(e.act)}</span></div></div>`).join('')||(reqs.length?'':'<div class="empty">Aucun</div>')}</div></div></div></div>`;
}
ACT.agentOpen = id => modal('Dossier · '+nm(id), agentCard(AGENT[id]), '', true);
ACT.interimNew = x => { const [u,f,t] = (x||'||').split('|');
  modal('Désigner un intérimaire', `<div class="fg">
    <label class="f full" for="iu">Poste à couvrir<select class="inp" id="iu">${UNITS.filter(z=>z.head).map(z=>`<option value="${z.code}" ${z.code===u?'selected':''}>Chef · ${esc(z.name)} (${esc(nm(z.head))})</option>`).join('')}</select></label>
    <label class="f full" for="ia">Intérimaire<select class="inp" id="ia">${AG.filter(a=>!a.driver).map(a=>`<option value="${a.id}">${esc(a.name)} · ${esc(a.unit)}</option>`).join('')}</select></label>
    <label class="f" for="if">Du<input class="inp" type="date" id="if" value="${f||TODAY}"></label><label class="f" for="it">Au<input class="inp" type="date" id="it" value="${t||addDays(TODAY,14)}"></label></div>
    <div class="note">Une note de service d’intérim est générée, numérotée et versée à la GED. Les étapes de circuit à venir passent à l’intérimaire ; celles déjà ouvertes ne bougent pas.</div>`,
  `<button class="btn" data-a="closeModal">Annuler</button><button class="btn pri" data-a="interimDo">Désigner</button>`, true); };
ACT.interimDo = () => { const i = {id:uid('i'), unit:val('iu'), agent:val('ia'), from:val('if'), to:val('it'), status:'ACTIVE'};
  if(i.agent===UNIT[i.unit].head) return toast('L’intérimaire ne peut pas être le titulaire.');
  if(i.to<i.from) return toast('La fin précède le début.');
  if(S.interims.some(x=>x.unit===i.unit && x.status==='ACTIVE' && !(x.from>i.to||x.to<i.from))) return toast('Un intérim couvre déjà cette période pour ce poste.');
  const n = nextNum('NOTE',2026); i.note = 'NS/'+pad(n,3)+'/2026/DGREH';
  S.interims.push(i); S.docs.unshift({id:uid('d'), type:'Note de service', kind:'NOTE', number:i.note, title:'Intérim de '+unitName(i.unit)+' par '+nm(i.agent)+' du '+dfr(i.from)+' au '+dfr(i.to), at:nowIso(), version:1, status:'À signer', hash:sha256(i.note+i.agent+i.from), code:'VRF-'+sha256(i.note).slice(0,6).toUpperCase()});
  notify(i.agent,'Vous êtes désigné(e) intérimaire', unitName(i.unit)+' du '+dfr(i.from)+' au '+dfr(i.to),'rh','INFORMATION');
  audit('INTERIM_DESIGNATED', i.unit, nm(i.agent)); closeModal(); commit('Intérim désigné · note '+i.note); };
ACT.delegNew = () => modal('Nouvelle délégation', `<div class="fg">
  <label class="f full" for="du2">Poste délégant<select class="inp" id="du2">${UNITS.filter(z=>z.head).map(z=>`<option value="${z.code}">Chef · ${esc(z.name)}</option>`).join('')}</select></label>
  <label class="f full" for="dt2">Délégataire<select class="inp" id="dt2">${AG.filter(a=>!a.driver).map(a=>`<option value="${a.id}">${esc(a.name)} · ${esc(a.unit)}</option>`).join('')}</select></label>
  <fieldset class="f full" style="border:0;padding:0;margin:0"><legend>Actes délégués</legend>${['MISSION_VALIDATE','REQUEST_OPINION','MAIL_ASSIGN','MAIL_IMPUTE','SAF_CONFIRM_FUNDING'].map(p=>`<label class="chk" for="dp_${p}"><input type="checkbox" id="dp_${p}" value="${p}"> ${p}</label>`).join('')}
  <label class="chk" for="dp_X"><input type="checkbox" id="dp_X" value="INTERIM_DESIGNATE"> INTERIM_DESIGNATE <small class="muted">· non délégable</small></label></fieldset></div>`,
  `<button class="btn" data-a="closeModal">Annuler</button><button class="btn pri" data-a="delegDo">Créer</button>`, true);
ACT.delegDo = () => { const perms=[...document.querySelectorAll('[id^="dp_"]:checked')].map(c=>c.value);
  if(!perms.length) return toast('Choisissez au moins un acte.');
  if(perms.includes('INTERIM_DESIGNATE')) return toast('Acte personnel non délégable : désigner un intérimaire.');
  S.delegations.push({id:uid('g'), unit:val('du2'), to:val('dt2'), perms, from:TODAY, status:'ACTIVE'}); audit('DELEGATION_CREATED', val('du2'), perms.join(',')); closeModal(); commit('Délégation créée'); };
ACT.delegRevoke = id => { const d=S.delegations.find(x=>x.id===id); d.status='REVOKED'; audit('DELEGATION_REVOKED', d.unit, ''); commit('Délégation révoquée, effet immédiat'); };
ACT.entNew = () => modal('Enregistrer une décision de congé', `<div class="fg">
  <label class="f full" for="ea">Agent<select class="inp" id="ea">${AG.map(a=>`<option value="${a.id}">${esc(a.name)} · ${esc(a.unit)}</option>`).join('')}</select></label>
  <label class="f" for="er">N° de la décision<input class="inp" id="er"></label><label class="f" for="ey">Année<input class="inp" type="number" id="ey" value="2026"></label>
  <label class="f" for="en">Jours accordés<input class="inp" type="number" id="en" min="1" value="30"></label></div>`,
  `<button class="btn" data-a="closeModal">Annuler</button><button class="btn pri" data-a="entDo">Enregistrer</button>`);
ACT.entDo = () => { if(!val('er')) return toast('Numéro de décision obligatoire.'); S.entitlements.push({id:uid('e'), agent:val('ea'), act:val('er'), year:Number(val('ey')), days:Number(val('en'))}); closeModal(); commit('Décision enregistrée'); };

/* ---------------- BCMS ---------------- */
mod('bcms', {group:'Ressources', label:'BCMS · logistique', icon:'car', visible:()=>can('BCMS_READ')||can('ADMIN'), render(){
  const tab = UI.tab.bcms || 'parc';
  const live = S.missions.filter(m=>m.vehicle && ['IN_APPROVAL','PENDING_SG_SIGNATURE','SIGNED'].includes(m.status));
  const onMission = new Set(live.filter(m=>m.from<=TODAY&&m.to>=TODAY).map(m=>m.vehicle));
  const confl = S.missions.filter(m=>missionConflicts(m).length);
  let body='';
  if(tab==='parc'){ const f = UI.filter.veh||'';
    const rows = VEH.filter(v=>!f || VEH_ETAT(v)[0]===f);
    body = `<div class="toolbar"><select class="inp" data-ch="vehF" aria-label="État"><option value="">Tous les états</option>${['Bon','Passable','En panne','En réparation','À réformer','Non renseigné'].map(e=>`<option ${f===e?'selected':''}>${e}</option>`).join('')}</select><span class="sp"></span><span class="muted">${rows.length} véhicule(s)</span></div>`
    + table([{h:'Immatriculation',f:v=>`<b class="mono">${esc(v.plate)}</b>`},{h:'Véhicule',f:v=>esc(v.label)},{h:'État',f:v=>tag(...VEH_ETAT(v))},
      {h:'Situation',f:v=>onMission.has(v.plate)?tag('En mission','t-gold'):v.usage==='PROJET'?tag('Affecté à un projet','t-info'):tag('Au parc','t-n')},
      {h:'Réservations',f:v=>{ const b=live.filter(m=>m.vehicle===v.plate); return b.length?b.map(m=>`<span class="mono">${esc(m.number||m.ref)}</span> ${dfr(m.from)}→${dfr(m.to)}`).join('<br>'):'<span class="muted">—</span>'; }}], rows);
  }
  if(tab==='resa'){
    const d0 = TODAY, span = 28;
    const vs = [...new Set(live.map(m=>m.vehicle))];
    body = `<div class="pad"><p class="muted" style="margin-top:0">Quatre semaines à partir d’aujourd’hui. Un chevauchement est signalé au BCMS, jamais résolu d’office.</p><div class="tbl-w"><table class="t" style="min-width:760px"><thead><tr><th>Véhicule</th>${Array.from({length:span},(_,i)=>{ const d=addDays(d0,i); return `<th style="padding:6px 2px;text-align:center;font-size:10px">${d.slice(8)}</th>`; }).join('')}</tr></thead><tbody>
      ${vs.map(v=>`<tr><td class="mono" style="white-space:nowrap">${esc(v)}</td>${Array.from({length:span},(_,i)=>{ const d=addDays(d0,i); const ms=live.filter(m=>m.vehicle===v && m.from<=d && m.to>=d);
        return `<td style="padding:3px 1px"><div title="${esc(ms.map(m=>(m.number||m.ref)+' · '+m.dest).join(' / '))}" style="height:18px;border-radius:3px;background:${ms.length>1?'var(--red)':ms.length?(ms[0].status==='SIGNED'?'var(--brand)':'var(--water)'):'transparent'}"></div></td>`; }).join('')}</tr>`).join('')||`<tr><td colspan="${span+1}"><div class="empty">Aucune réservation</div></td></tr>`}
    </tbody></table></div><p class="muted" style="font-size:12px">Vert : OM signé · bleu : pré-réservé · rouge : chevauchement.</p></div>`;
  }
  if(tab==='chauffeurs'){ const dr = AG.filter(a=>a.driver);
    body = table([{h:'Chauffeur',f:a=>`<b>${esc(a.name)}</b><span class="sub mono">${esc(a.mat)}</span>`},{h:'Sorties en 2026',r:1,f:a=>S.missions.filter(m=>m.driver===a.id && m.status!=='REJECTED').length},
      {h:'Disponibilité',f:a=>{ const m=live.find(x=>x.driver===a.id && x.from<=TODAY && x.to>=TODAY); const lv=S.requests.find(r=>r.requester===a.id&&r.status==='APPROVED'&&r.startsOn<=TODAY&&r.endsOn>=TODAY); return lv?tag('En congé','t-warn'):m?tag('En mission','t-gold'):tag('Disponible','t-ok'); }}], dr)
      + `<div class="pad"><div class="note">Rotation équitable : les chauffeurs ayant le moins de sorties sur le cycle sont proposés en premier ; une sortie hors tour exige une justification écrite (règle du BCMS).</div></div>`;
  }
  if(tab==='stocks') body = `<div class="pad grid"><div class="note ok"><b>Module BCMS opérationnel.</b> Stocks, bons d’entrée et de sortie, patrimoine, inventaires semestriels, carnet de bord, carburant et distances fonctionnent déjà dans l’application BCMS hors ligne. Il sera réintégré ici sans reprise de données : même modèle, mêmes numéros de pièces.</div>
    <div class="mod-grid">${[['Stocks et mouvements','Bons d’entrée, de sortie, seuils d’alerte'],['Patrimoine','Biens inventoriés, prise en charge, décharge'],['Inventaire','Procès-verbal semestriel, état des stocks'],['Carnet de bord','Kilométrage départ et retour, écarts justifiés'],['Carburant','Fiche de dotation, retour réel, distances entre localités'],['Interventions','Réparations, pièces montées et déposées']].map(([t,d])=>`<div class="mod"><span class="ic">${ico('archive')}</span><span><b>${t}</b><span>${d}</span></span></div>`).join('')}</div></div>`;
  return pageHead('Ressources','BCMS · véhicules, chauffeurs, matières', 'Parc réel de '+VEH.length+' véhicules. Le BCMS affecte les moyens des OM ; le système détecte les conflits, le BCMS décide.')
  + `<div class="kpis">${kpi('Véhicules en état de rouler', VEH.filter(vehicleOk).length, 'sur '+VEH.length, 'good')}${kpi('Immobilisés', VEH.filter(v=>!vehicleOk(v)).length, 'panne, réparation, à réformer', 'warn')}
    ${kpi('En mission aujourd’hui', onMission.size, '')}${kpi('Conflits à arbitrer', confl.length, 'véhicule ou chauffeur', confl.length?'bad':'', 'om')}
    ${kpi('Chauffeurs', AG.filter(a=>a.driver).length, 'sans compte, planifiés par le BCMS')}</div>
  <div class="panel"><div class="tabs">${[['parc','Parc automobile'],['resa','Planning des réservations'],['chauffeurs','Chauffeurs'],['stocks','Stocks, patrimoine, carnet de bord']].map(([k,l])=>`<button class="${tab===k?'on':''}" data-a="tab" data-x="bcms:${k}">${l}</button>`).join('')}</div>${body}</div>`;
}});
ACT.vehF = v => { UI.filter.veh = v; rerender(); };

/* ---------------- FINANCES (SAF) ---------------- */
mod('saf', {group:'Ressources', label:'Finances', icon:'coins', visible:()=>can('SAF_READ')||can('ADMIN'), render(){
  const tab = UI.tab.saf || 'fin';
  const omF = S.missions.filter(m=>m.funding);
  let body='';
  if(tab==='fin') body = table([{h:'OM',f:m=>`<b class="mono">${esc(m.number||m.ref)}</b>${EX(m)}`},{h:'Objet',f:m=>esc(m.subject)},{h:'Participants',r:1,f:m=>m.participants.length},{h:'Jours',r:1,f:m=>days(m.from,m.to)+1},
    {h:'Source',f:m=>esc(fundLabel(m.funding))},{h:'Frais estimés',r:1,f:()=> '<span class="muted">Barème à saisir</span>'}], omF, {click:'omFromReg', emptyTitle:'Aucun OM financé'});
  if(tab==='budget'){ const tot = S.budget.reduce((s,b)=>s+b.alloc,0), eng = S.budget.reduce((s,b)=>s+b.eng,0);
    body = `<div class="pad"><div class="kpis">${kpi('Dotation', fmt(tot)+' F','exemple')}${kpi('Engagé', fmt(eng)+' F', Math.round(eng/tot*100)+' %')}${kpi('Disponible', fmt(tot-eng)+' F','', 'good')}</div></div>`
    + table([{h:'Ligne',f:b=>`<b>${esc(b.label)}</b>${EX(b)}`},{h:'Source',f:b=>esc(b.src)},{h:'Dotation',r:1,f:b=>fmt(b.alloc)},{h:'Engagé',r:1,f:b=>fmt(b.eng)},{h:'Taux',f:b=>`<div class="bar" style="grid-template-columns:minmax(0,1fr) 44px"><div class="tr"><div class="fl ${b.eng/b.alloc>.85?'a':''}" style="width:${b.eng/b.alloc*100}%"></div></div><span class="n">${Math.round(b.eng/b.alloc*100)} %</span></div>`}], S.budget);
  }
  if(tab==='bareme') body = `<div class="pad grid"><div class="note warn"><b>Barème non chargé.</b> Le service financier applique le décret n° 2012-735. SIGA n’invente aucun taux : saisissez-les depuis le texte, puis le calcul des frais de chaque OM s’active.</div>
    ${table([{h:'Catégorie',f:c=>`<b>${c}</b>`},{h:'Indemnité journalière intérieur (F CFA)',f:c=>`<input class="inp" style="width:140px" placeholder="à saisir" aria-label="Taux ${c}">`},{h:'Hébergement (F CFA)',f:c=>`<input class="inp" style="width:140px" placeholder="à saisir" aria-label="Hébergement ${c}">`}], ['Catégorie A','Catégorie B','Catégorie C','Catégorie D','Catégorie E'])}</div>`;
  if(tab==='sources') body = table([{h:'Source',f:f=>`<b>${esc(f[1])}</b>`},{h:'OM financés',r:1,f:f=>S.missions.filter(m=>m.funding===f[0]).length}], FUNDING)
    + `<div class="pad"><p class="muted" style="margin:0">Sources déclarées par le service financier : État, projet, partenaire, ressources propres. La confirmation se fait avant la mission.</p></div>`;
  return pageHead('Ressources','Finances', 'Financement des OM, lignes budgétaires et engagements. Les montants affichés sont des exemples.')
  + `<div class="panel"><div class="tabs">${[['fin','Financement des OM'],['budget','Lignes budgétaires'],['sources','Sources de financement'],['bareme','Barème des frais de mission']].map(([k,l])=>`<button class="${tab===k?'on':''}" data-a="tab" data-x="saf:${k}">${l}</button>`).join('')}</div>${body}</div>`;
}});
