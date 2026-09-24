/* =====================================================================
   Module DEMANDES ET ACTES ADMINISTRATIFS (canevas DGREH)
   ===================================================================== */
const REQ_TYPES = {
  LEAVE:{label:'Jouissance de congé administratif', short:'Congé', wf:'LEAVE', unit:'jours', form:'FICHE DE DEMANDE DE JOUISSANCE DE CONGE ADMINISTRATIF'},
  ABSENCE:{label:'Autorisation d’absence', short:'Absence', wf:'ABSENCE', unit:'heures', form:'FICHE DE DEMANDE D’AUTORISATION D’ABSENCE'},
  ATTESTATION:{label:'Attestation', short:'Attestation', wf:null},
  CERTIFICATE:{label:'Certificat', short:'Certificat', wf:null},
  TRAINING:{label:'Formation', short:'Formation', wf:null}
};
const REASONS = {FAMILY:['Famille',false], PERSONAL:['Personnelle',false], SICKNESS:['Maladie',true]};
const REQ_STATUS = {DRAFT:['Brouillon','t-n'], IN_APPROVAL:['En circuit','t-info'], APPROVED:['Accordée','t-ok'], REJECTED:['Refusée','t-bad'],
  WITHDRAWN:['Retirée','t-n'], CANCELLED:['Annulée','t-bad']};
const reqTag = r => tag(...(REQ_STATUS[r.status]||[r.status,'t-n']));

function entitlementLeft(e, exclude){
  return e.days - S.requests.filter(r => r.ent===e.id && r.id!==exclude && ['IN_APPROVAL','APPROVED'].includes(r.status)).reduce((s,r)=>s+r.duration,0);
}
function createRequest(p){
  const n = nextNum('DMD', 2026);
  const r = Object.assign({id:uid('r'), ref:'DMD-2026-'+pad(n,6), status:'DRAFT', steps:[], createdAt:nowIso(), channel:'SELF', ex:false}, p);
  if(r.type==='LEAVE'){ r.endsOn = S.settings.leave_count==='BUSINESS' ? addBusiness(r.startsOn, r.duration) : addDays(r.startsOn, r.duration-1); }
  if(r.type==='ABSENCE'){ r.startsOn = r.startsAt.slice(0,10); const d = new Date(r.startsAt); d.setMinutes(d.getMinutes()+r.duration*60);
    r.endsAt = iso(d)+'T'+pad(d.getHours())+':'+pad(d.getMinutes()); r.endsOn = r.endsAt.slice(0,10); }
  S.requests.push(r); return r;
}
function addBusiness(s, n){ let d=s, left=n; while(true){ const w=new Date(d+'T12:00:00').getDay(); if(w!==0&&w!==6){ left--; if(!left) return d; } d=addDays(d,1); } }
function checkRequest(r){
  if(r.type==='LEAVE'){
    if(!r.attached) return 'Joindre la décision de congé : le canevas l’exige.';
    const e = S.entitlements.find(x=>x.id===r.ent);
    if(e && r.duration > entitlementLeft(e, r.id)) return `Jours demandés (${r.duration}) supérieurs au solde de la décision (${entitlementLeft(e,r.id)}).`;
    const ov = S.requests.find(x => x.id!==r.id && x.requester===r.requester && x.type==='LEAVE' && ['IN_APPROVAL','APPROVED'].includes(x.status) && !(x.startsOn>r.endsOn || x.endsOn<r.startsOn));
    if(ov) return 'Un congé couvre déjà tout ou partie de cette période ('+ov.ref+').';
  }
  if(r.type==='ABSENCE' && !r.reason) return 'Choisissez le motif de l’absence.';
  return '';
}
function submitRequest(r, by){
  const err = checkRequest(r); if(err) return err;
  const a = AGENT[r.requester];
  r.snap = {name:a.name, mat:a.mat, job:a.job, fn:(UNIT[a.unit].head===a.id?a.fn:(a.fn||'Agent')), unit:unitName(a.unit)};
  r.steps = planCircuit(REQ_TYPES[r.type].wf, r.requester);
  r.status='IN_APPROVAL'; r.submittedAt=nowIso();
  audit('REQUEST_SUBMITTED', r.ref, r.type, by);
  const s = activateNext(r.steps); if(s && s.status==='ACTIVE') notify(s.actor, (REQ_TYPES[r.type].short)+' à examiner : '+nm(r.requester), s.label, 'demandes');
  return '';
}
function requestAct(r, opinion, comment, by=S.me){
  const s = activeStep(r);
  s.opinion = opinion; s.comment = comment; s.at = nowIso(); s.by = by;
  if(s.nature==='OPINION'){ s.status='OPINION_GIVEN'; audit('OPINION_GIVEN', r.ref, opinion, by);
    const nx = activateNext(r.steps); if(nx && nx.status==='ACTIVE') notify(nx.actor, 'Demande à examiner : '+nm(r.requester), nx.label, 'demandes'); }
  else { s.status = opinion==='FAVORABLE'?'APPROVED':'REJECTED'; r.status = opinion==='FAVORABLE'?'APPROVED':'REJECTED'; r.decidedAt=nowIso(); r.decision=opinion;
    audit('REQUEST_DECIDED', r.ref, opinion, by);
    notify(r.requester, (REQ_TYPES[r.type].short)+(opinion==='FAVORABLE'?' accordé':' refusé'), r.ref, 'demandes', 'INFORMATION');
    if(r.status==='APPROVED' && r.type==='LEAVE'){
      S.docs.unshift({id:uid('d'), type:'Fiche de congé', number:r.ref, title:'Congé de '+nm(r.requester), subject:r.id, kind:'REQ', at:nowIso(), version:1, status:'Décision rendue', hash:sha256(r.ref+r.startsOn+r.duration), code:'VRF-'+sha256(r.ref).slice(0,6).toUpperCase(), ex:r.ex});
    }
  }
}
/* Le motif Maladie n'est lisible que du demandeur, de son circuit et de la RH */
function canSeeReason(r, me=S.me){
  if(!r.reason || !REASONS[r.reason][1]) return true;
  return r.requester===me || r.steps.some(s => s.actor===me && s.status!=='PENDING') || can('HR_READ_SENSITIVE', me);
}
const reasonLabel = r => !r.reason ? '—' : canSeeReason(r) ? REASONS[r.reason][0] : 'Motif confidentiel';
function reqVisible(r){
  return r.requester===S.me || r.enteredBy===S.me || r.steps.some(s=>s.actor===S.me) || can('HR_READ') || can('ADMIN');
}
const period = r => r.type==='LEAVE' ? `${r.duration} jours · ${dfr(r.startsOn)} au ${dfr(r.endsOn)}` : r.type==='ABSENCE' ? `${r.duration} h · ${dtfr(r.startsAt)} → ${r.endsAt.slice(11)}` : '—';

mod('demandes', {group:'Processus', label:'Demandes et actes', icon:'form', render(){
  if(UI.sel.req) return reqDetail(S.requests.find(r=>r.id===UI.sel.req));
  const tab = UI.tab.req || 'todo';
  const vis = S.requests.filter(reqVisible);
  const lists = {todo: vis.filter(r=>canActOnStep(activeStep(r))), mine: vis.filter(r=>r.requester===S.me), all: vis};
  const rows = lists[tab].slice().sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
  const ents = S.entitlements.filter(e=>e.agent===S.me);
  return pageHead('Processus','Demandes et actes administratifs',
    'Congé et autorisation d’absence selon les canevas DGREH : avis des niveaux intermédiaires, décision du dernier niveau. Attestation, certificat et formation attendent leurs canevas.',
    `<button class="btn pri" data-a="reqNew" data-x="LEAVE">${ico('plus')}Demande de congé</button><button class="btn" data-a="reqNew" data-x="ABSENCE">Autorisation d’absence</button>${can('REQUEST_ENTER_FOR_OTHER')?`<button class="btn" data-a="reqNew" data-x="LEAVE:OTHER">Saisir pour un agent sans compte</button>`:''}`)
  + `<div class="kpis">${kpi('À examiner par moi', lists.todo.length, 'avis ou décisions', lists.todo.length?'warn':'')}
     ${kpi('Mes demandes', lists.mine.length, lists.mine.filter(r=>r.status==='IN_APPROVAL').length+' en circuit')}
     ${kpi('Solde de congé', ents.length?ents.reduce((s,e)=>s+entitlementLeft(e),0)+' j':'—', ents.length?'selon '+ents.length+' décision(s) enregistrée(s)':'aucune décision enregistrée', ents.length?'good':'')}
     ${kpi('Types de démarches', Object.keys(REQ_TYPES).length, '2 actives, 3 en attente de canevas')}</div>
  <div class="panel"><div class="tabs">${[['todo','À examiner',lists.todo.length],['mine','Mes demandes',lists.mine.length],['all','Toutes',vis.length]].map(([k,l,n])=>`<button class="${tab===k?'on':''}" data-a="tab" data-x="req:${k}">${l} <span class="cnt-b">${n}</span></button>`).join('')}</div>
  ${table([
    {h:'Référence', f:r=>`<b class="mono">${esc(r.ref)}</b>${EX(r)}`},
    {h:'Demande', f:r=>`${esc(REQ_TYPES[r.type].label)}<span class="sub">${period(r)}</span>`},
    {h:'Demandeur', f:r=>`${esc(nm(r.requester))}<span class="sub">${esc(unitShort(AGENT[r.requester].unit))}${r.channel!=='SELF'?' · saisie par le '+(r.channel==='SECRETARIAT'?'secrétariat':'service RH'):''}</span>`},
    {h:'Motif', f:r=>esc(reasonLabel(r))},
    {h:'Étape', f:r=>{const s=activeStep(r); return s?`${esc(s.label)}<span class="sub">${esc(nm(s.actor))}</span>`:'—';}},
    {h:'Statut', f:reqTag}
  ], rows, {click:'reqOpen', emptyTitle:'Aucune demande', empty:' dans cette vue.'})}</div>
  <div class="panel"><div class="panel-h">Démarches disponibles</div>${table([
    {h:'Démarche',f:t=>`<b>${esc(t[1].label)}</b>`},{h:'Circuit',f:t=>t[1].wf?esc(S.workflows[t[1].wf].steps.map(s=>s.label).join(' → ')):'<span class="muted">À définir : canevas non fourni</span>'},
    {h:'État',f:t=>t[1].wf?tag('Active','t-ok'):tag('En attente','t-warn')}], Object.entries(REQ_TYPES))}</div>`;
}});
ACT.reqOpen = id => { UI.sel.req = id; render(); window.scrollTo(0,0); };
ACT.reqBack = () => { UI.sel.req = null; render(); };

function reqDetail(r){
  if(!r){ UI.sel.req=null; return MODS.demandes.render(); }
  const s = activeStep(r), mine = canActOnStep(s);
  let acts = '';
  if(r.status==='DRAFT' && (r.requester===S.me||r.enteredBy===S.me)) acts += `<button class="btn pri" data-a="reqSubmit" data-x="${r.id}">${ico('send')}Soumettre</button>`;
  if(mine) acts += s.nature==='OPINION'
    ? `<button class="btn pri" data-a="reqAct" data-x="${r.id}:FAVORABLE">Avis favorable</button><button class="btn dng" data-a="reqAct" data-x="${r.id}:UNFAVORABLE">Avis défavorable</button>`
    : `<button class="btn pri" data-a="reqAct" data-x="${r.id}:FAVORABLE">Accorder</button><button class="btn dng" data-a="reqAct" data-x="${r.id}:UNFAVORABLE">Refuser</button>`;
  if(['IN_APPROVAL','DRAFT'].includes(r.status) && r.requester===S.me) acts += `<button class="btn" data-a="reqWithdraw" data-x="${r.id}">Retirer</button>`;
  acts += `<button class="btn" data-a="reqForm" data-x="${r.id}">${ico('doc')}Fiche imprimable</button>`;
  const e = S.entitlements.find(x=>x.id===r.ent);
  return `<div><button class="btn ghost sm" data-a="reqBack">← Demandes</button></div>`
  + pageHead('Demande · '+r.ref, REQ_TYPES[r.type].label+' · '+nm(r.requester), period(r)+' · '+reqTag(r)+' '+EX(r), acts)
  + (s && s.nature==='OPINION' && mine?`<div class="note">Un avis, favorable ou défavorable, ne clôt pas la demande : elle monte avec votre avis jusqu’à celui qui décide. Un avis défavorable doit être motivé.</div>`:'')
  + `<div class="grid g21"><div class="grid">
    <div class="panel"><h2>Identité portée sur la fiche</h2><div class="pad kv">
      <div><span>Nom et prénom(s)</span><b>${esc(nm(r.requester))}</b></div><div><span>Matricule</span><b class="mono">${esc(AGENT[r.requester].mat)}</b></div>
      <div><span>Emploi</span><b>${esc(AGENT[r.requester].job)}</b></div><div><span>Fonction</span><b>${esc(AGENT[r.requester].fn)}</b></div>
      <div><span>En service</span><b>${esc(unitName(AGENT[r.requester].unit))}</b></div><div><span>Saisie</span><b>${r.channel==='SELF'?'Par l’agent':'Par '+esc(nm(r.enteredBy))}</b></div>
    </div></div>
    <div class="panel"><h2>Demande</h2><div class="pad kv">
      <div><span>Période</span><b>${period(r)}</b></div>
      ${r.type==='ABSENCE'?`<div><span>Motif</span><b>${esc(reasonLabel(r))}</b></div>`:''}
      ${r.type==='LEAVE'?`<div><span>Décision de congé</span><b>${e?esc(e.act)+' · solde '+entitlementLeft(e)+' j':'Non rattachée'}</b></div><div><span>Pièce jointe</span><b>${r.attached?'Décision de congé jointe':'Manquante'}</b></div>`:''}
      <div><span>Décompte</span><b>${r.type==='LEAVE'?(S.settings.leave_count==='BUSINESS'?'Jours ouvrés':'Jours consécutifs'):'Heures'}</b></div>
    </div></div>
    ${r.status==='APPROVED' && r.type==='LEAVE' && UNIT[AGENT[r.requester].unit].head===r.requester && !S.interims.some(i=>i.unit===AGENT[r.requester].unit && i.from<=r.startsOn && i.to>=r.endsOn)
      ?`<div class="note warn"><b>Responsable en congé sans intérim déclaré.</b> SIGA propose de désigner un intérimaire pour ${esc(unitName(AGENT[r.requester].unit))} ; il ne le crée jamais d’office. ${can('INTERIM_DESIGNATE')||can('HR_MANAGE')?`<button class="btn sm" data-a="interimNew" data-x="${AGENT[r.requester].unit}|${r.startsOn}|${r.endsOn}">Désigner un intérimaire</button>`:''}</div>`:''}
  </div>
  <div class="panel"><div class="panel-h">Circuit</div><div class="pad">${r.steps.length?circuitHtml(r.steps):circuitHtml(planCircuit(REQ_TYPES[r.type].wf, r.requester))+'<p class="muted" style="margin:12px 0 0">Aperçu, figé à la soumission.</p>'}</div></div></div>`;
}
ACT.reqSubmit = id => { const r = S.requests.find(x=>x.id===id); const err = submitRequest(r, S.me); if(err) return toast(err); commit('Demande soumise'); };
ACT.reqWithdraw = id => { const r = S.requests.find(x=>x.id===id); r.status='WITHDRAWN'; r.steps.forEach(s=>{ if(s.status==='ACTIVE'||s.status==='PENDING') s.status='SKIPPED_NO_HOLDER'; }); audit('REQUEST_WITHDRAWN', r.ref,'',S.me); commit('Demande retirée'); };
ACT.reqAct = x => { const [id, op] = x.split(':'); const r = S.requests.find(q=>q.id===id); const s = activeStep(r);
  modal((s.nature==='OPINION'?'Avis ':'Décision ')+(op==='FAVORABLE'?'favorable':'défavorable')+' · '+r.ref,
   `<label class="f" for="cmt">${op==='FAVORABLE'?'Observation (facultative)':'Motif (obligatoire)'}<textarea class="inp" id="cmt" rows="3"></textarea></label>`,
   `<button class="btn" data-a="closeModal">Annuler</button><button class="btn ${op==='FAVORABLE'?'pri':'dng'}" data-a="reqActDo" data-x="${x}">Signer ${s.nature==='OPINION'?'l’avis':'la décision'}</button>`); };
ACT.reqActDo = x => { const [id, op] = x.split(':'); const c = val('cmt'); if(op==='UNFAVORABLE' && !c) return toast('Un avis ou une décision défavorable doit être motivé.');
  const r = S.requests.find(q=>q.id===id); requestAct(r, op, c); closeModal(); commit(r.status==='IN_APPROVAL'?'Avis enregistré : la demande poursuit son circuit':'Décision enregistrée'); };

ACT.reqNew = kind => {
  const [type, other] = kind.split(':');
  const t = REQ_TYPES[type];
  const who = other ? '' : S.me;
  const ents = S.entitlements.filter(e=>e.agent===S.me);
  modal(t.label, `
  ${other?`<label class="f" for="rq_ag">Agent concerné<select class="inp" id="rq_ag">${AG.filter(a=>a.driver).concat(AG.filter(a=>!a.driver)).map(a=>`<option value="${a.id}">${esc(a.name)}${a.driver?' · chauffeur, sans compte':''}</option>`).join('')}</select><small>La demande reste celle de l’agent ; la saisie par le secrétariat ou la RH est tracée.</small></label>`:''}
  <div class="fg">
  ${type==='LEAVE'?`<label class="f" for="rq_s">À compter du<input class="inp" type="date" id="rq_s" value="${addDays(TODAY,14)}"></label>
    <label class="f" for="rq_d">Pour une période de (jours)<input class="inp" type="number" min="1" id="rq_d" value="10"></label>
    <label class="f full" for="rq_e">Décision de congé<select class="inp" id="rq_e"><option value="">Non enregistrée dans SIGA</option>${ents.map(e=>`<option value="${e.id}">${esc(e.act)} · solde ${entitlementLeft(e)} jours</option>`).join('')}</select></label>
    <label class="chk full" for="rq_att"><input type="checkbox" id="rq_att"> Décision de congé jointe (scan) <small class="muted">· exigée par le canevas</small></label>`
  :`<label class="f" for="rq_s">À compter du<input class="inp" type="datetime-local" id="rq_s" value="${addDays(TODAY,2)}T08:00"></label>
    <label class="f" for="rq_d">Durée (heures)<input class="inp" type="number" min="1" id="rq_d" value="3"></label>
    <fieldset class="f full" style="border:0;padding:0;margin:0"><legend>Pour des raisons de</legend>${Object.entries(REASONS).map(([k,v])=>`<label class="chk" for="rs_${k}"><input type="radio" name="rs" id="rs_${k}" value="${k}"> ${v[0]}${v[1]?' <small class="muted">· motif confidentiel</small>':''}</label>`).join('')}</fieldset>`}
  </div>
  ${who?`<div class="panel"><div class="panel-h">Qui donnera son avis, qui décidera</div><div class="pad">${circuitHtml(planCircuit(t.wf, S.me))}</div></div>`:''}`,
  `<button class="btn" data-a="closeModal">Annuler</button><button class="btn" data-a="reqCreate" data-x="${kind}|draft">Brouillon</button><button class="btn pri" data-a="reqCreate" data-x="${kind}|submit">Soumettre</button>`, true);
};
ACT.reqCreate = x => {
  const [kind, mode] = x.split('|'); const [type, other] = kind.split(':');
  const requester = other ? val('rq_ag') : S.me;
  const p = {type, requester, enteredBy:S.me, channel: other ? (can('HR_MANAGE')?'HR':'SECRETARIAT') : 'SELF', duration:Number(val('rq_d'))};
  if(!(p.duration>0)) return toast('Indiquez une durée.');
  if(type==='LEAVE'){ p.startsOn=val('rq_s'); p.ent=val('rq_e')||null; p.attached=val('rq_att'); }
  else { p.startsAt=val('rq_s'); const c = document.querySelector('input[name="rs"]:checked'); p.reason = c?c.value:null; }
  const r = createRequest(p);
  if(mode==='submit'){ const err = checkRequest(r); if(err){ S.requests.pop(); S.counters['DMD|2026']--; return toast(err); } submitRequest(r, S.me); }
  closeModal(); UI.sel.req = r.id; commit(mode==='submit'?'Demande soumise':'Brouillon enregistré');
};
ACT.reqForm = id => {
  const r = S.requests.find(x=>x.id===id); const t = REQ_TYPES[r.type]; const a = AGENT[r.requester];
  const box = (label, st, full) => `<div class="box ${full?'full':''}"><b>${esc(label)}</b>
    <div><span class="ck">${st&&st.opinion==='FAVORABLE'?'✓':''}</span>Favorable</div><div><span class="ck">${st&&st.opinion==='UNFAVORABLE'?'✓':''}</span>Défavorable</div>
    <div style="margin-top:6px">Date : ${st&&st.at?dfr(st.at):'……………'}</div><div>Signature : ${st&&st.at?esc(nm(st.by||st.actor)):''}</div>
    ${st&&['SKIPPED_SAME_ACTOR','SKIPPED_SELF','SKIPPED_NO_HOLDER'].includes(st.status)?`<div style="font-size:11px;font-style:italic;margin-top:4px">${esc(st.reason)}</div>`:''}</div>`;
  const st = c => r.steps.find(s=>s.code===c);
  modal('Fiche · '+r.ref, `<div class="doc">${officialHeader(t.form)}
    <p>Nom : <span class="dots">${esc(a.name.split(' ')[0])}</span> Prénom(s) : <span class="dots">${esc(a.name.split(' ').slice(1).join(' '))}</span></p>
    <p>Matricule : <span class="dots">${esc(a.mat)}</span> Emploi : <span class="dots">${esc(a.job)}</span></p>
    <p>Fonction : <span class="dots">${esc(a.fn)}</span> en service <span class="dots">${esc(unitName(a.unit))}</span></p>
    ${r.type==='LEAVE'?`<p>sollicite la jouissance de mon congé, pour une période de <span class="dots">${r.duration} jours</span> à compter du <span class="dots">${dfr(r.startsOn)}</span>.</p>`
     :`<p>sollicite une autorisation d’absence de <span class="dots">${r.duration} heures</span> à compter du <span class="dots">${dtfr(r.startsAt)}</span> pour des raisons de :</p>
       <p>${Object.entries(REASONS).map(([k,v])=>`<span class="ck">${r.reason===k&&canSeeReason(r)?'✓':''}</span>${v[0]}`).join(' &nbsp; ')}</p>`}
    <p style="text-align:right">Ouagadougou, le ${dfr(r.submittedAt||TODAY)}<br>Signature de l’intéressé(e)</p>
    <div class="boxes">${r.type==='LEAVE'?box('Avis du supérieur hiérarchique immédiat', st('SUPERIOR'))+box('Avis du Directeur de service', st('DIRECTOR'))
      +box('Décision du Directeur Général des Ressources en Eau et de l’Hydraulique', st('DG'), true)
      :box('Décision du supérieur hiérarchique immédiat', st('SUPERIOR'))}</div>
    ${r.type==='LEAVE'?'<p class="foot">N.B. : Joindre la décision de congé</p>':''}</div>
    <p class="muted" style="margin:0">Reproduction du canevas DGREH, renseignée par SIGA. Sans logo.${!canSeeReason(r)?' Le motif est masqué pour votre profil.':''}</p>`, '', true);
};
