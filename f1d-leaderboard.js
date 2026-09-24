/* Optional community board. Scores are client-reported, not cheat-proof. */
(function () {
  'use strict';
  const L = window.F1DLeaderboard = {}, ranks = new Map();
  const read = key => { try { return JSON.parse(localStorage.getItem(key)); } catch (_) { return null; } };
  const write = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch (_) {} };
  const game = () => { try { return State.game; } catch (_) { return null; } };
  const signed = () => { try { return !!CloudSave.isSignedIn(); } catch (_) { return false; } };
  const user = () => { try { return CloudSave._user?.id || null; } catch (_) { return null; } };
  const track = (name, ch, extra) => { try { window.__f1dEv(name, Object.assign({ challenge_id:ch.id, week_key:ch.weekKey || '', signed_in:signed() }, extra)); } catch (_) {} };
  // Insert English source text; the existing DOM observer translates and can restore it.
  const el = (tag, text, parent) => { const node=document.createElement(tag); if(text!=null)node.textContent=text; if(parent)parent.appendChild(node); return node; };
  const button = (text, parent, action) => { const b=el('button',text,parent); b.type='button'; b.className='btn btn-outline'; b.onclick=action; return b; };
  const bestKey = id => 'f1d_challenge_best:' + id;
  L.cleanName = value => String(value || '').normalize('NFKC').replace(/[\u0000-\u001f\u007f-\u009f<>@\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g,'').replace(/\s+/g,' ').trim().slice(0,30);
  L.best = ch => read(bestKey(ch.id));
  function better(a,b) { return !b || a.score>b.score || (a.score===b.score && a.seconds!=null && (b.seconds==null || a.seconds<b.seconds)); }
  L.remember = function (g) {
    const ch=g?.weeklyChallenge; if(!ch?.done || !Number.isFinite(ch.score) || ch.score<0)return null;
    const index=(g.calendar||[]).findIndex(r=>r.name===ch.gp), rounds=index+1;
    const elapsed=Math.round((ch.finishedAt-ch.startedAt)/1000);
    const rules=g.scoringRules||{}, defaultRace=[25,18,15,12,10,8,6,4,2,1], defaultSprint=[8,7,6,5,4,3,2,1];
    const standard=(!g.customPoints||JSON.stringify(g.customPoints)===JSON.stringify(defaultRace)) &&
      (!g.customSprintPoints||JSON.stringify(g.customSprintPoints)===JSON.stringify(defaultSprint)) &&
      !rules.fastestLap && !rules.polePoints && !rules.doublePointsFinale;
    const entry={id:ch.id,weekKey:ch.weekKey,gp:ch.gp,weekShort:ch.weekShort,teamId:ch.teamId,
      score:ch.score,seconds:Number.isFinite(elapsed)&&elapsed>=1&&elapsed<=31536000?elapsed:null,
      format:ch.format||'run-in',rounds,difficulty:g.gameDifficulty,
      eligible:standard&&g.gameDifficulty==='hard'&&g.playerTeamId===ch.teamId&&rounds>0&&
        (g.calendar||[]).slice(0,rounds).every(r=>r.raceDone), managerName:L.cleanName(g.managerName),
      finishedAt:ch.finishedAt};
    const old=L.best(ch); if(better(entry,old))write(bestKey(ch.id),entry);
    // Keep a separate eligible best so a custom-scoring local PB never blocks a valid submission.
    const publicKey=bestKey(ch.id)+':eligible', previous=read(publicKey);
    if(entry.eligible&&entry.seconds&&better(entry,previous))write(publicKey,entry);
    return L.best(ch)||entry;
  };
  L.rank = ch => {
    const r=ranks.get(ch.id);
    // A rank belongs to the signed-in player's submitted score, not every replay or account.
    return r && r.user===user() && r.score===ch.score && r.seconds===Math.round((ch.finishedAt-ch.startedAt)/1000) ? r.rank : null;
  };
  L.shareText = ch => (ch.shareText||('F1 Dynasty Weekly Challenge: '+ch.score+' points\nf1dynasty.com  #F1DynastyChallenge'))+
    (L.rank(ch)?'\nWeekly rank: #'+L.rank(ch):'');
  async function rpc(name,args) {
    if(!window.__cloud || navigator.onLine===false)throw new Error('unavailable');
    const controller=new AbortController(); let timer;
    try {
      let request=window.__cloud.rpc(name,args); if(request.abortSignal)request=request.abortSignal(controller.signal);
      const response=await Promise.race([request,new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(new Error('timeout'));},10000);})]);
      if(response.error || !response.data)throw new Error('unavailable');
      return response.data;
    } finally { clearTimeout(timer); }
  }
  function rememberRank(ch,data,identity) {
    if(identity!==user())return; // Ignore responses arriving after an account switch.
    if(data.me){ranks.set(ch.id,{rank:Number(data.me.rank),score:Number(data.me.score),seconds:Number(data.me.completion_seconds),user:identity});
      track('challenge_rank_viewed',ch,{score:Number(data.me.score),rank:Number(data.me.rank)});
    } else ranks.delete(ch.id);
    const live=game()?.weeklyChallenge,label=document.querySelector('#f1d-ch-modal [data-weekly-rank]');
    if(label&&live?.id===ch.id)label.textContent=L.rank(live)?'Weekly rank: #'+L.rank(live):'Weekly rank: not submitted';
  }
  L.fetch = async function(ch,view='top') {
    const identity=user(),data=await rpc('get_weekly_leaderboard',{p_challenge_id:ch.id,p_view:view});
    rememberRank(ch,data,identity); return data;
  };
  L.submit = async function (ch,name) {
    const entry=read(bestKey(ch.id)+':eligible'),clean=L.cleanName(name);
    track('challenge_score_submit_started',ch,{score:entry?.score});
    try {
      if(!signed()||!entry?.eligible||clean.length<2||!entry.seconds||!Number.isFinite(entry.score)||
        entry.score<0||entry.score>entry.rounds*60||Math.round(entry.score*10)!==entry.score*10)throw new Error('validation');
      write('f1d_leaderboard_name',clean);
      const identity=user(),data=await rpc('submit_weekly_challenge',{
        p_challenge_id:entry.id,p_week_key:entry.weekKey,p_display_name:clean,p_team_id:entry.teamId,
        p_score:entry.score,p_completion_seconds:entry.seconds,p_format:entry.format,p_rounds:entry.rounds,p_difficulty:entry.difficulty
      });
      rememberRank(ch,data,identity);
      track('challenge_score_submitted',ch,{score:entry.score,rank:data.me?.rank,submission_result:data.submission_result});return data;
    } catch(error) {
      track('challenge_score_submit_failed',ch,{score:entry?.score,submission_result:error.message==='validation'?'invalid_or_unsigned':'unavailable'});
      throw error;
    }
  };
  function personal(parent,ch) {
    const best=L.best(ch),p=el('p',null,parent);
    el('span','Local personal best',p);p.append(': '+(best?best.score+' pts':'—'));
  }
  function duration(seconds){const s=Number(seconds);return Math.floor(s/3600)+'h '+Math.floor(s%3600/60)+'m '+s%60+'s';}
  L.open = function (ch) {
    ch=ch||game()?.weeklyChallenge||window._f1dChallenge?.current(); if(!ch)return;
    if(game()?.weeklyChallenge?.id===ch.id)L.remember(game());
    document.getElementById('f1d-leaderboard')?.remove();
    const focus=document.activeElement,overlay=el('div',null,document.body);overlay.id='f1d-leaderboard';overlay.className='modal-overlay';
    overlay.style.cssText='position:fixed;inset:0;z-index:100002;background:#0009;display:flex;align-items:center;justify-content:center;padding:12px';
    const panel=el('section',null,overlay);panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','true');panel.setAttribute('aria-labelledby','f1d-board-title');
    panel.style.cssText='box-sizing:border-box;width:100%;max-width:640px;max-height:90dvh;overflow:auto;background:var(--bg2,#fff);color:var(--tx,#18202c);padding:20px;border-radius:14px;box-shadow:0 20px 70px #0008';
    const close=()=>{overlay.remove();focus?.focus();};
    button('Close',panel,close).style.float='right'; el('h2','WEEKLY LEADERBOARD',panel).id='f1d-board-title';
    el('p','Community scores are reported by players.',panel);
    const label=el('p',ch.weekShort||ch.weekKey||'',panel);label.append(' · '+(ch.gp||ch.id));label.style.fontSize='12px';
    personal(panel,ch);
    const status=el('p','Loading leaderboard…',panel);status.setAttribute('role','status');
    const tabs=el('div',null,panel);tabs.style.cssText='display:flex;flex-wrap:wrap;gap:8px;margin:12px 0';
    const list=el('div',null,panel),mine=el('p',null,panel);let generation=0;
    async function load(view){
      const request=++generation;status.textContent='Loading leaderboard…';
      try{
        const data=await L.fetch(ch,view);if(!overlay.isConnected||request!==generation)return;
        list.replaceChildren();status.textContent=data.total+' '+'submitted results';
        mine.textContent=data.me?'Weekly rank'+': #'+data.me.rank+' · '+data.me.score+' pts':'Weekly rank: not submitted';
        if(!data.entries.length)el('p',view==='around'?'Submit a result to see players around you.':'No results yet.',list);
        data.entries.forEach(row=>{
          const line=el('div',null,list);line.style.cssText='display:grid;grid-template-columns:40px minmax(0,1fr) auto;gap:8px;padding:10px 0;border-bottom:1px solid var(--bd,#ddd);font-size:13px';
          el('strong','#'+row.rank,line);const identity=el('div',null,line),name=el('strong',null,identity);
          name.textContent=row.display_name;name.translate=false;
          const team=el('div',null,identity);team.textContent=row.team_name;team.translate=false;team.style.fontSize='11px';
          const score=el('div',row.score+' pts',line);score.style.textAlign='end';el('small',duration(row.completion_seconds),score).style.display='block';
          if(row.is_me)line.style.borderLeft='3px solid #c0012e';
        });
        if(data.me)around.disabled=false;
      }catch(_){if(request===generation&&overlay.isConnected){status.textContent='Public leaderboard unavailable. Your local career and best score are safe.';list.replaceChildren();}}
    }
    button('Top 10',tabs,()=>load('top'));const around=button('Around Me',tabs,()=>load('around'));around.disabled=!signed();
    button('My Best',tabs,()=>{if(signed())load('mine');else{++generation;list.replaceChildren();personal(list,ch);status.textContent='Sign in to submit to the public board.';}});
    const entry=read(bestKey(ch.id)+':eligible');
    if(entry&&signed()){
      const form=el('form',null,panel),label=el('label','Leaderboard manager name',form);label.htmlFor='f1d-board-name';label.style.display='block';
      const input=el('input',null,form);input.id='f1d-board-name';input.maxLength=30;input.minLength=2;input.required=true;
      input.value=L.cleanName(read('f1d_leaderboard_name')||entry.managerName||'Manager');input.style.cssText='width:100%;box-sizing:border-box;margin:8px 0;padding:10px';
      el('p','Submit your best eligible result'+': '+entry.score+' pts',form);
      const submit=button('Submit score',form,()=>{});submit.type='submit';submit.className='btn btn-red';
      form.onsubmit=async e=>{e.preventDefault();if(submit.disabled)return;submit.disabled=true;
        try{const result=await L.submit(ch,input.value);await load('top');status.textContent=result.submission_result==='accepted'?'Score submitted.':'Your existing best score was kept.';}
        catch(_){status.textContent='Could not submit. Check your connection, sign-in and challenge settings, then retry.';}
        finally{submit.disabled=false;}
      };
    }else if(!signed()){
      el('p','Sign in to submit to the public board.',panel);
      button('Sign in with Google',panel,async()=>{try{await CloudSave.signInWithGoogle();}catch(_){status.textContent='Sign-in unavailable. You can keep playing locally.';}});
    }else if(L.best(ch))el('p','This local result is not eligible for public submission. Use the standard challenge settings and scoring.',panel);
    overlay.addEventListener('click',e=>{if(e.target===overlay)close();});
    overlay.addEventListener('keydown',e=>{if(e.key==='Escape')close();if(e.key==='Tab'){
      const nodes=[...panel.querySelectorAll('button:not(:disabled),input')],first=nodes[0],last=nodes.at(-1);
      if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
    }});
    panel.querySelector('button').focus();track('challenge_leaderboard_viewed',ch);load('top');
  };
  L.enhanceResult = function(overlay,g){
    const ch=g.weeklyChallenge;L.remember(g);overlay.style.zIndex='100000';overlay.firstElementChild.style.maxHeight='90dvh';overlay.firstElementChild.style.overflow='auto';
    const share=overlay.querySelector('#f1d-ch-share'),section=el('div');share.before(section);
    el('strong','Your score'+': '+ch.score,section);const rank=el('p','Weekly rank: not submitted',section);rank.dataset.weeklyRank='';
    button('View Leaderboard',section,()=>L.open(ch)).style.cssText='width:100%;margin-bottom:12px';
    button('Share result card',section,()=>L.shareCard(ch)).style.cssText='width:100%;margin-bottom:12px';
    L.fetch(ch).then(()=>{if(L.rank(ch))rank.textContent='Weekly rank'+': #'+L.rank(ch);}).catch(()=>{rank.textContent='Weekly rank: unavailable';});
  };
  L.shareCard = function(ch){
    const g=game();if(!g||!ch.done)return;
    const team=State.getPlayerTeam()||{},pg=window._f1dChallenge.progress()||{};
    window.shareResult('challenge',{gp:ch.gp,score:ch.score,teamName:team.name,teamColor:team.color,weekShort:ch.weekShort||pg.weekShort,
      completedRounds:pg.completedRounds,targetRound:pg.targetRound,mini:ch.format==='mini',rounds:ch.rounds,raceLine:ch.raceLine,weekendPts:ch.weekendPts,rank:L.rank(ch)});
  };
  function mount(doc){
    doc.querySelectorAll('.hqchallenge').forEach(host=>{
      if(host.querySelector('[data-f1d-board]'))return;
      const ch=game()?.weeklyChallenge;if(!ch)return;
      L.remember(game());
      const box=doc.createElement('div');box.dataset.f1dBoard='';box.style.cssText='border-top:1px solid #d9dde4;margin-top:12px;padding-top:10px;font:12px system-ui';
      const title=doc.createElement('strong');title.textContent='WEEKLY LEADERBOARD';box.appendChild(title);
      const best=L.best(ch),info=doc.createElement('p');info.textContent='Local personal best'+': '+(best?best.score+' pts':'—');box.appendChild(info);
      const b=doc.createElement('button');b.type='button';b.textContent='View Leaderboard';b.className='btn btn-outline';b.style.cssText='padding:9px 12px;border:1px solid #c0012e;border-radius:7px;background:transparent;color:#c0012e;cursor:pointer';b.onclick=()=>L.open(ch);box.appendChild(b);host.appendChild(box);
    });
  }
  L.attach=function(doc){
    if(!doc?.body||doc.__f1dBoardObserved)return;
    const surfaces=doc.querySelectorAll('[data-screen="dashboard"]');if(!surfaces.length)return;
    doc.__f1dBoardObserved=true;let pending=false;
    const observer=new MutationObserver(()=>{if(pending)return;pending=true;requestAnimationFrame(()=>{pending=false;mount(doc);});});
    surfaces.forEach(surface=>observer.observe(surface,{childList:true,subtree:true}));mount(doc);
  };
  function scan(){L.attach(document);document.querySelectorAll('iframe').forEach(frame=>{try{L.attach(frame.contentDocument);}catch(_){}if(!frame.__f1dBoardLoad){frame.__f1dBoardLoad=true;frame.addEventListener('load',scan);}});}
  let attempts=0;scan();const discovery=setInterval(()=>{scan();if(++attempts===30)clearInterval(discovery);},500);
})();
