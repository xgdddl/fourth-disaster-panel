/* Phone navigation edition. All destinations call the existing native buttons.
   No game state, model requests, storage, polling or extra observers. */
(() => {
  globalThis.__AEU_MOBILE_NAV__?.dispose?.();
  const win=window.parent||window,doc=win.document,proxies=new Map(),sectionTexts=new Map(),learningButtons=new Map(),learningFields=new Map(),railDecorations=new Map(),railSources=new Map();
  let learningNote,decorationFrame,railFocusFrame;
  let sectionButton,dock,dialog,returnFocus,disposed=false,selectedSection,railDirty=true,rail,shelf,portraitFooter,railFilters,railToggle,railCollapsed=false;
  const css=/* PHONE_CSS */ null;
  const style=doc.createElement('style');style.id='aeu-phone-final-css';style.textContent=css;
  doc.getElementById(style.id)?.remove();doc.head.appendChild(style);
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const list=nav=>nav?[...nav.children].filter(e=>e.matches('button,.inner-tab-btn')&&!e.hidden&&e.style.display!=='none'):[];
  const active=items=>items.find(e=>e.getAttribute('aria-pressed')==='true'||e.classList.contains('active'))||items[0];
  const label=e=>{const text=e?.textContent.replace(/[▲▼]/g,'').replace(/\s+/g,' ').trim()||'';return({'NPC接触':'NPC','玩家接触':'玩家'})[text]||text;};
  // Short captions only; native labels, route IDs and picker names stay complete.
  const shelfCaption=e=>({'等级榜':'等级','成就榜':'成就','死亡榜':'死亡','纪元与版本':'版本','剧情参考':'剧情','阵营与势力':'阵营势力','我的公会':'公会','据点与驻地':'据点驻地','生物记录':'生物','伙伴记录':'伙伴','全部地点':'全部','城镇据点':'城镇','建设驻地':'驻地'})[label(e)]||label(e);
  const attr=(el,key,value)=>{if(el&&el.getAttribute(key)!==value)el.setAttribute(key,value);};
  const scheduleDecoration=()=>{if(decorationFrame==null)decorationFrame=win.requestAnimationFrame(()=>{decorationFrame=null;decorate();});};
  const icon=e=>e?.querySelector('.aeu-menu-medallion svg')?.outerHTML||'';
  const descriptions={character:'属性 · 装备 · 技能',quests:'任务与冒险日志',actors:'关系 · 伙伴 · 人物档案',organizations:'归属 · 阵营 · 势力 · 公会',world:'地图 · 地点 · 纪元 · 世界事件',ranks:'个人榜与公会榜',community:'讨论 · 攻略 · 招募 · 交易',tools:'连接 · 变量 · 修复 · 推演设置'};
  const actorSections={
    social:{label:'接触记录',description:'正文中结识的人物、往来与关系'},
    pet:{label:'生物与伙伴',description:'已记录的生物与同行伙伴'},
    npc:{label:'NPC档案',description:'原住民的当前动向与人物资料'},
    players:{label:'玩家档案',description:'异人玩家的当前动向与人物资料'},
    creatures:{label:'生物档案',description:'生物的当前动向与完整资料'}
  };
  const railGlyphs={char:'helmet',gear:'crossSwords',skill:'star',social:'people',pet:'paw',npc:'person',players:'helmet',creatures:'fang',camp:'flag',factions:'guild',forces:'sword',guilds:'hall',map:'map',world:'location',expac:'hourglass',overview:'world',events:'scroll',personal:'crown',guild:'guild',repair:'hammer',variables:'book',connection:'thread',settings:'settings',impact:'eye',diagnostic:'scroll',all:'people',chat:'scroll',guide:'book',party:'people',market:'coin',battle:'crossSwords',lore:'eye',stream:'eye',journal:'map','tab-rcv':'scroll','tab-pub':'flag'};
  const railCaptions={'角色状态':['角色','状态'],'装备与行囊':['装备与','行囊'],'接触记录':['接触','记录'],'生物与伙伴':['生物与','伙伴'],'NPC档案':['NPC','档案'],'玩家档案':['玩家','档案'],'生物档案':['生物','档案'],'我的归属':['我的','归属'],'世界地图':['世界','地图'],'地点档案':['地点','档案'],'当前纪元':['当前','纪元'],'世界状态':['世界','状态'],'世界事件':['世界','事件'],'个人榜':['个人','榜'],'公会榜':['公会','榜'],'MVU修复':['MVU','修复'],'全局变量':['全局','变量'],'API连接':['API','连接'],'后台推演':['后台','推演'],'正文线索':['正文','线索'],'运行记录':['运行','记录']};
  function restoreRailButton(button,state){
    // Only remove our own decoration. A native redraw may already own new text.
    if(!button.isConnected||button.querySelector('.aeu-rail-caption')!==state.caption)return;
    button.replaceChildren(...state.nodes);
    for(const [key,value]of [['aria-label',state.ariaLabel],['title',state.title]])if(value===null)button.removeAttribute(key);else button.setAttribute(key,value);
  }
  function syncRailDecorations(choices,enabled){
    const current=new Set(choices);
    for(const [button,state]of railDecorations)if(!enabled||!current.has(button)||!button.isConnected||button.querySelector('.aeu-rail-caption')!==state.caption){restoreRailButton(button,state);railDecorations.delete(button);}
    if(!enabled)return;
    for(const button of choices){
      if(railDecorations.has(button))continue;
      const full=label(button),key=button.dataset.aeuRailGlyph||button.dataset.aeuCategory||button.dataset.aeuView;
      const engraving=globalThis.__AEU_GLYPHS__?.render?.(railGlyphs[key]||'book')||'<svg viewBox="0 0 32 32" aria-hidden="true"><path class="aeu-glyph-body" d="M16 3 27 10v12l-11 7L5 22V10Zm0 5-7 5v7l7 4 7-4v-7Z"/></svg>';
      const emblem=doc.createElement('i');emblem.className='aeu-rail-emblem';emblem.setAttribute('aria-hidden','true');emblem.innerHTML=engraving;
      const caption=doc.createElement('span');caption.className='aeu-rail-caption';
      const lines=railCaptions[full]||({'已接任务':['已接','任务'],'发布记录':['发布','记录'],'全部讨论':['全部','讨论'],'闲聊吐槽':['闲聊','吐槽'],'攻略与求助':['攻略与','求助'],'组队与招募':['组队与','招募'],'交易市场':['交易','市场'],'战报实录':['战报','实录'],'剧情考据':['剧情','考据'],'主播与直播':['主播与','直播'],'冒险手记':['冒险','手记']})[full]||[full];
      for(const line of lines){const part=doc.createElement('span');part.textContent=line;if(/^[A-Z]+$/.test(line))part.className='aeu-rail-latin';caption.appendChild(part);}
      railDecorations.set(button,{nodes:[...button.childNodes],caption,ariaLabel:button.getAttribute('aria-label'),title:button.getAttribute('title')});
      button.replaceChildren(emblem,caption);attr(button,'aria-label',full);attr(button,'title',full);
    }
  }
  const bookRoutes={
    quest:{page:'quests',kind:'quests',title:'任务分类'},
    social:{page:'actors',view:'social',kind:'social',title:'接触人物'},
    pet:{page:'actors',view:'pet',kind:'pet',title:'生物与伙伴分类'},
    camp:{page:'organizations',view:'camp',kind:'camp',title:'归属分类'},
    expac:{page:'world',view:'expac',kind:'expac',title:'纪元分类'},
    gear:{page:'character',view:'gear',kind:'gear',title:'战备分类',selector:'.inner-tabs[data-parent="gear"]'},
    skill:{page:'character',view:'skill',kind:'skill',title:'技能分类',selector:'.inner-tabs[data-parent="skill"]'}
  };
  function actorSection(button){
    if(!button?.parentElement?.matches('[data-aeu-section-tabs]')||button.closest('#aelderan-unified-shell')?.dataset.page!=='actors')return null;
    return actorSections[button.dataset.aeuCategory||button.dataset.aeuView]||null;
  }
  function syncActorLabels(shell,sections){
    const phoneActors=win.innerWidth<=700&&shell.dataset.page==='actors';
    for(const [button,text]of sectionTexts){
      if(!button.isConnected){sectionTexts.delete(button);continue;}
      if(!phoneActors||button.parentElement!==sections){if(button.textContent!==text)button.textContent=text;sectionTexts.delete(button);}
    }
    if(!phoneActors)return;
    // Labels are presentation only. The native route IDs and handlers stay intact.
    for(const button of list(sections)){
      const info=actorSection(button);if(!info)continue;
      if(!sectionTexts.has(button))sectionTexts.set(button,button.textContent);
      if(button.textContent!==info.label)button.textContent=info.label;
    }
  }
  const optionDescription=(button,drawer)=>drawer?descriptions[button.dataset.aeuPage]||(label(button)==='工坊'?'创意工坊':''):actorSection(button)?.description||'';
  const menuGlyph='<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/></svg>';
  function shelfSource(shell){
    const page=shell.dataset.page;
    const type=shell.querySelector('#aelderan-terminal-wrapper')?.dataset.aeuTab,book=bookRoutes[type];
    if(book&&page===book.page&&(!book.view||shell.dataset.view===book.view)){
      const nav=shell.querySelector(book.selector||`[data-aeu-record-book="${type}"] .aeu-record-categories`);
      if(nav)return{kind:book.kind,nav,items:list(nav),title:book.title,book:!book.selector,status:true,action:type==='skill'?nav.querySelector('.aeu-skill-actions>button'):null};
    }
    if(page==='community'){
      const nav=shell.querySelector('[data-aew-page="community"] .aew-board-tabs');
      if(nav)return{kind:'community',nav,items:list(nav),title:'社区板块'};
    }
    if(page==='world'&&shell.dataset.view==='overview'){
      const nav=shell.querySelector('.aew-world-domain-nav');
      if(nav)return{kind:'world',nav,items:list(nav),title:'世界领域',picker:true};
    }
    if(page==='world'&&shell.dataset.view==='world'){
      const nav=shell.querySelector('.aeu-location-types');
      if(nav)return{kind:'locations',nav,items:list(nav),title:'地点类型',status:true};
    }
    if(page==='organizations'&&shell.dataset.view==='organizations'){
      const nav=shell.querySelector('.aew-body .aeu-org-library .aeu-org-source-nav');
      if(nav)return{kind:'org-source',nav,items:list(nav),title:nav.getAttribute('aria-label')||'档案范围'};
    }
    if(page==='ranks'&&shell.querySelector('[data-aeu-section-tabs]>[data-aeu-category="personal"][aria-pressed="true"]')){
      const nav=shell.querySelector('.aew-rank-categories[data-aew-subgroup="rank-personal"]');
      if(nav)return{kind:'ranks',nav,items:list(nav),title:'排行榜分类'};
    }
    return null;
  }
  function activateShelf(shell,index){
    const source=shelfSource(shell),destination=source?.items[index];if(!destination||destination.disabled)return;
    if(destination===active(source.items))return;
    destination.click();
    const scroller=shell.querySelector(source.status?'#aelderan-content-area':'.aew-body');if(scroller)scroller.scrollTop=0;
    scheduleDecoration();
  }
  function markRailSources(elements){
    const current=new Set(elements.filter(Boolean));
    for(const [element,previous]of railSources)if(!current.has(element)||!element.isConnected){if(previous===null)element.removeAttribute('data-aeu-phone-rail-source');else attr(element,'data-aeu-phone-rail-source',previous);railSources.delete(element);}
    for(const element of current){if(!railSources.has(element))railSources.set(element,element.getAttribute('data-aeu-phone-rail-source'));attr(element,'data-aeu-phone-rail-source','true');}
  }
  function shelfFilters(shell,source){
    if(!source?.status)return[];
    if(source.kind==='locations')return [...shell.querySelectorAll('.aeu-location-filter-group:not([hidden]) [data-aeu-location-filter]')].flatMap(row=>[...row.children].filter(e=>e.matches('button,[role="button"]')));
    const target=active(source.items)?.dataset.aeuNativeTarget;
    const page=target?doc.getElementById(target):null;
    return page?[...page.querySelectorAll('.aeu-record-toolbar [role="group"]>button,.aeu-record-toolbar [role="group"]>[role="button"]')]:[];
  }
  function syncRailFilters(shell,filters,sections){
    attr(shell,'data-aeu-phone-record-filters',String(!!filters.length));
    if(!filters.length){if(railFilters)railFilters.hidden=true;return;}
    if(!railFilters?.isConnected){
      railFilters=doc.createElement('div');railFilters.className='aeu-rail-filters';railFilters.setAttribute('role','group');railFilters.setAttribute('aria-label','记录筛选');
      railFilters.addEventListener('click',event=>{
        const button=event.target.closest('[data-aeu-shelf-filter]');if(!button)return;
        event.stopPropagation();
        const current=shelfSource(shell),controls=shelfFilters(shell,current),index=Number(button.dataset.aeuShelfFilter);
        for(let i=index;i<controls.length;i+=3){const destination=controls[i];if(destination&&!destination.disabled&&destination.getAttribute('aria-pressed')!=='true')destination.click();}
        scheduleDecoration();
      });
    }
    const stage=shell.querySelector('.aeu-stage');if(railFilters.parentElement!==stage)stage.appendChild(railFilters);
    railFilters.hidden=false;
    if(!railFilters.children.length)railFilters.innerHTML=[[0,'全部'],[2,'置顶'],[1,'回收站']].map(([index,name])=>`<button type="button" data-aeu-shelf-filter="${index}" aria-label="${name}" aria-pressed="false">${name}</button>`).join('');
    for(const button of railFilters.children){const index=Number(button.dataset.aeuShelfFilter);attr(button,'aria-pressed',String(filters.filter((_,i)=>i%3===index).every(e=>e.getAttribute('aria-pressed')==='true')));}
  }
  function syncRailToggle(shell,enabled){
    if(!railToggle?.isConnected){
      railToggle=doc.createElement('button');railToggle.type='button';railToggle.className='aeu-phone-rail-toggle';railToggle.setAttribute('aria-controls','aeu-phone-section-rail');
      railToggle.innerHTML='<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path class="aeu-rail-grip" d="M10 7v10m4-10v10"/><path class="aeu-rail-direction" d="m14 7-5 5 5 5"/></svg>';
      railToggle.addEventListener('click',()=>{
        // Folding touches attributes only: no routing, data reads or DOM rebuild.
        railCollapsed=!railCollapsed;attr(shell,'data-aeu-phone-rail-collapsed',String(railCollapsed));
        attr(railToggle,'aria-expanded',String(!railCollapsed));attr(railToggle,'aria-label',railCollapsed?'展开左侧分类':'收起左侧分类');attr(railToggle,'title',railCollapsed?'展开左侧分类':'收起左侧分类');
        const sections=shell.querySelector('[data-aeu-section-tabs]');
        if(railCollapsed)attr(sections,'inert','');else sections?.removeAttribute('inert');
      });
      shell.querySelector('.aeu-stage').appendChild(railToggle);
    }
    railToggle.hidden=!enabled||!!shell.querySelector('#fourth-workshop-panel:not([hidden])');
    attr(shell,'data-aeu-phone-rail-collapsed',String(railCollapsed));attr(railToggle,'aria-expanded',String(!railCollapsed));
    attr(railToggle,'aria-label',railCollapsed?'展开左侧分类':'收起左侧分类');attr(railToggle,'title',railCollapsed?'展开左侧分类':'收起左侧分类');
    const sections=shell.querySelector('[data-aeu-section-tabs]');attr(sections,'id','aeu-phone-section-rail');
    if(enabled&&railCollapsed)attr(sections,'inert','');else sections.removeAttribute('inert');
  }
  function syncShelf(shell){
    const source=win.innerWidth<=700?shelfSource(shell):null,sections=shell.querySelector('[data-aeu-section-tabs]');
    attr(shell,'data-aeu-phone-book',String(!!source?.book));
    attr(shell,'data-aeu-phone-native',String(!!source?.status));
    // All mobile categories occupy one left column; there is no second top row.
    attr(shell,'data-aeu-phone-has-shelf','false');
    if(!source?.items.length){if(shelf)shelf.hidden=true;syncRailFilters(shell,[],sections);markRailSources([]);attr(shell,'data-aeu-phone-shelf','none');return;}
    const filters=shelfFilters(shell,source);
    syncRailFilters(shell,filters,sections);
    markRailSources([source.nav,source.nav.previousElementSibling?.matches('.aeu-mobile-subselect')?source.nav.previousElementSibling:null,...filters.map(e=>e.closest('.aeu-record-toolbar,.aeu-location-toolbar'))]);
    if(!shelf?.isConnected){
      shelf=doc.createElement('div');shelf.className='aeu-phone-shelf';shelf.setAttribute('role','group');
      shelf.addEventListener('click',event=>{
        const button=event.target.closest('button');if(!button)return;
        event.stopPropagation();
        const current=shelfSource(shell);if(!current)return;
        if(button.hasAttribute('data-aeu-shelf-native-action')){if(current.action&&!current.action.hidden&&!current.action.disabled)current.action.click();}
        else if(button.hasAttribute('data-aeu-shelf-choice'))activateShelf(shell,Number(button.dataset.aeuShelfChoice));
      });
      // This is a separate proxy row; the existing native tab-strip key handler
      // still owns only its original rows. Do not bind it twice to native tabs.
      shelf.addEventListener('keydown',event=>{
        if(!['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
        const buttons=[...shelf.querySelectorAll('button:not([disabled])')],index=buttons.indexOf(doc.activeElement);if(index<0)return;
        event.preventDefault();event.stopPropagation();const next=event.key==='Home'?0:event.key==='End'?buttons.length-1:Math.max(0,Math.min(buttons.length-1,index+(['ArrowDown','ArrowRight'].includes(event.key)?1:-1)));buttons[next].focus({preventScroll:true});buttons[next].click();
      });
    }
    const roots=list(sections),anchor=active(roots);
    if(shelf.parentElement!==sections||shelf.previousElementSibling!==anchor){if(anchor)anchor.after(shelf);else sections.appendChild(shelf);}
    shelf.hidden=false;attr(shell,'data-aeu-phone-shelf',source.kind);attr(shelf,'aria-label',source.title);
    attr(shelf,'data-aeu-rail-level',roots.length>1?'nested':'primary');
    const nativeAction=source.action&&!source.action.hidden?source.action:null;
    const signature=source.kind+'|'+source.items.map(label).join('|')+(nativeAction?'|action:'+label(nativeAction):'');
    if(shelf.dataset.signature!==signature){
      shelf.dataset.signature=signature;
      shelf.innerHTML=source.items.map((item,index)=>`<button type="button" data-aeu-shelf-choice="${index}" data-aeu-rail-glyph="${esc(item.dataset.aewCommunityBoard||item.dataset.aeuNativeTarget||'book')}" aria-label="${esc(label(item))}" title="${esc(label(item))}" aria-pressed="false">${esc(shelfCaption(item))}</button>`).join('');
      if(nativeAction)shelf.insertAdjacentHTML('beforeend',`<button type="button" data-aeu-shelf-native-action aria-label="${esc(nativeAction.getAttribute('aria-label')||label(nativeAction))}" title="${esc(label(nativeAction))}" aria-haspopup="dialog">学习</button>`);
    }
    const actionButton=shelf.querySelector('[data-aeu-shelf-native-action]');if(actionButton){if(actionButton.disabled!==!!nativeAction?.disabled)actionButton.disabled=!!nativeAction?.disabled;attr(actionButton,'aria-label',nativeAction?.getAttribute('aria-label')||label(nativeAction));}
    const selected=active(source.items);
    for(const button of shelf.querySelectorAll('[data-aeu-shelf-choice]'))attr(button,'aria-pressed',String(source.items[Number(button.dataset.aeuShelfChoice)]===selected));
  }
  function syncPortrait(shell){
    const content=shell.querySelector('#aelderan-terminal-wrapper[data-aeu-tab="char"] #aelderan-content-area'),identity=content?.querySelector('[data-aeu-role="identity"]');
    if(win.innerWidth>700||shell.dataset.page!=='character'||shell.dataset.view!=='char'||!identity){if(portraitFooter)portraitFooter.hidden=true;return;}
    if(!portraitFooter?.isConnected){
      portraitFooter=doc.createElement('footer');portraitFooter.className='aeu-phone-portrait-footer';portraitFooter.setAttribute('aria-label','立绘管理');
      portraitFooter.innerHTML='<button type="button" data-aeu-phone-portrait-open></button>';
      portraitFooter.addEventListener('click',event=>{if(!event.target.closest('[data-aeu-phone-portrait-open]'))return;const original=identity.querySelector('[data-aeu-open-portrait]');if(original&&!original.disabled)original.click();});
      content.appendChild(portraitFooter);
    }
    portraitFooter.hidden=false;
    const open=identity.querySelector('[data-aeu-open-portrait]'),ownOpen=portraitFooter.querySelector('[data-aeu-phone-portrait-open]');
    const text=open?.textContent||'上传立绘';if(ownOpen.textContent!==text)ownOpen.textContent=text;
  }
  // Keep the native form, validation and write lock. Only its visible fields
  // change; hidden defaults still travel through the original FormData path.
  function simplifyLearningDialog(){
    const edit=doc.getElementById('aeu-skill-edit'),learn=edit?.querySelector('[data-learn]');
    if(!edit?.open||!learn||learn.hidden)return;
    for(const [name,value]of [['rank','学徒'],['current','0'],['needed','100']]){
      const field=learn.querySelector(`[name="${name}"]`),holder=field?.closest('label');if(!holder)continue;
      if(!learningFields.has(holder))learningFields.set(holder,holder.hidden);
      field.value=value;holder.hidden=true;
    }
    const note=edit.querySelector('[data-note]');
    if(note){learningNote={element:note,text:note.textContent};note.textContent='';}
    attr(edit,'data-aeu-skill-simple','true');
  }
  function syncLearningButtons(shell){
    for(const [button,listener]of learningButtons)if(!button.isConnected){button.removeEventListener('click',listener);learningButtons.delete(button);}
    for(const button of shell.querySelectorAll('.aeu-skill-actions>button'))if(!learningButtons.has(button)){
      button.addEventListener('click',simplifyLearningDialog);learningButtons.set(button,simplifyLearningDialog);
    }
  }
  function close(){
    const old=dialog,focus=returnFocus;dialog=null;returnFocus=null;
    if(old?.open)old.close();old?.remove();
    for(const trigger of doc.querySelectorAll('[aria-controls="aeu-mobile-menu-dialog"]'))attr(trigger,'aria-expanded','false');
    if(focus?.isConnected&&!focus.closest('[hidden]'))focus.focus({preventScroll:true});
  }
  function choose(nav,title,drawer=false){
    if(win.innerWidth>700)return;
    const focus=doc.activeElement;close();const items=list(nav);if(!items.length)return;
    returnFocus=focus;
    dialog=doc.createElement('dialog');dialog.id='aeu-mobile-menu-dialog';dialog.className='aeu-mobile-picker'+(drawer?' aeu-mobile-drawer':'')+(actorSection(items[0])?' aeu-mobile-actor-picker':'');
    dialog.dataset.theme=doc.getElementById('aelderan-unified-shell')?.dataset.theme||'dark';
    dialog.setAttribute('aria-labelledby','aeu-mobile-menu-title');
    const current=active(items);
    dialog.innerHTML=`<header><div><small>${drawer?'艾尔德兰':'当前页面'}</small><h2 id="aeu-mobile-menu-title">${esc(title)}</h2></div><button type="button" aria-label="关闭菜单">关闭<span aria-hidden="true">×</span></button></header><nav class="aeu-picker-options" aria-label="${esc(title)}">${items.map((e,i)=>`<button type="button" data-aeu-picker-index="${i}" aria-pressed="${e===current}"${e===current?' aria-current="page"':''}>${drawer?`<i class="aeu-drawer-glyph" aria-hidden="true">${icon(e)}</i>`:''}<span><b>${esc(label(e))}</b>${optionDescription(e,drawer)?`<small>${esc(optionDescription(e,drawer))}</small>`:''}</span>${e===current?'<em>当前</em>':'<em aria-hidden="true">›</em>'}</button>`).join('')}</nav>`;
    if(drawer){
      const shell=doc.getElementById('aelderan-unified-shell'),run=shell?.querySelector('[data-aeu-run]');
      const actions=doc.createElement('div');actions.className='aeu-drawer-actions';
      // Keep the original footer nodes for the core. Only their available actions
      // get drawer proxies; resource readouts do not get copied into the menu.
      const footerActions=[['diagnostic','推演未完成'],['resume','续跑'],['back','返回世界线']].map(([action,fallback])=>{
        const original=shell?.querySelector(`.aeu-footer [data-aeu-${action}]`);
        if(!original||original.hidden)return '';
        const text=original.querySelector('[data-aeu-failure-text]')?.textContent?.trim()||fallback;
        return `<button type="button" data-aeu-phone-action="${action}"${original.disabled?' disabled':''}>${esc(text)}</button>`;
      }).join('');
      actions.innerHTML=`${run&&!run.hidden?`<button type="button" data-aeu-phone-action="run"${run.disabled?' disabled':''}>推进世界</button>`:''}${footerActions}<details><summary>界面设置</summary><div><button type="button" data-aeu-phone-action="theme">明暗主题</button></div></details>`;
      dialog.appendChild(actions);
      actions.addEventListener('click',event=>{
        const trigger=event.target.closest('[data-aeu-phone-action]');if(!trigger||trigger.disabled)return;
        const destination=shell?.querySelector(`[data-aeu-${trigger.dataset.aeuPhoneAction}]`);
        close();if(destination&&!destination.disabled&&!destination.hidden)destination.click();
      });
    }
    dialog.querySelector('header button').addEventListener('click',close);
    dialog.addEventListener('click',event=>{
      const button=event.target.closest('[data-aeu-picker-index]');if(!button)return;
      const chosen=items[Number(button.dataset.aeuPickerIndex)];
      // A native redraw may replace a section strip while the dialog is open.
      const latest=nav.isConnected?nav:nav.matches('[data-aeu-section-tabs]')?doc.querySelector('#aelderan-unified-shell [data-aeu-section-tabs]'):null;
      const destination=chosen?.isConnected?chosen:list(latest).find(e=>label(e)===label(chosen));
      close();if(destination&&!destination.hidden&&!destination.disabled)destination.click();decorate();
    });
    dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
    dialog.addEventListener('click',event=>{if(event.target!==dialog)return;const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)close();});
    doc.body.appendChild(dialog);dialog.showModal();
    if(focus?.getAttribute('aria-controls')===dialog.id)attr(focus,'aria-expanded','true');
    dialog.querySelector('[aria-current="page"]')?.focus({preventScroll:true});
  }
  function decorate(){
    if(disposed)return;
    const shell=doc.getElementById('aelderan-unified-shell');if(!shell){close();return;}
    if(shell.hidden&&dialog)close();
    const main=shell.querySelector('.aeu-game-nav'),sections=shell.querySelector('[data-aeu-section-tabs]');if(!main||!sections)return;
    attr(shell,'data-aeu-phone-edition','final');
    syncLearningButtons(shell);
    syncActorLabels(shell,sections);
    if(!dock?.isConnected){
      dock=doc.createElement('nav');dock.className='aeu-mobile-dock';dock.setAttribute('aria-label','常用栏目');
      dock.innerHTML=[['character','角色'],['actors','人物'],['world','世界'],['quests','任务'],['menu','菜单']].map(([id,text])=>`<button type="button" data-aeu-dock="${id}"${id==='menu'?' aria-haspopup="dialog" aria-expanded="false" aria-controls="aeu-mobile-menu-dialog"':' aria-pressed="false"'}><i class="aeu-dock-glyph" aria-hidden="true">${id==='menu'?menuGlyph:icon(main.querySelector(`[data-aeu-page="${id}"]`))}</i><span>${text}</span></button>`).join('');
      shell.querySelector('.aeu-workspace').appendChild(dock);
      dock.addEventListener('click',event=>{const button=event.target.closest('[data-aeu-dock]');if(!button)return;if(button.dataset.aeuDock==='menu')choose(main,'游戏菜单',true);else if(button.getAttribute('aria-pressed')!=='true')main.querySelector(`[data-aeu-page="${button.dataset.aeuDock}"]`)?.click();});
    }
    const primary=active(list(main));let visible=0,primaryInDock=false;
    for(const button of dock.children){
      const id=button.dataset.aeuDock;if(id==='menu')continue;
      const original=main.querySelector(`[data-aeu-page="${id}"]`),shown=!!original&&!original.hidden&&original.style.display!=='none';
      if(button.hidden===shown)button.hidden=!shown;if(shown)visible++;
      const selected=shown&&original===primary;primaryInDock||=selected;attr(button,'aria-pressed',String(selected));
    }
    attr(dock,'style',`--aeu-dock-count:${visible+1}`);attr(dock.querySelector('[data-aeu-dock="menu"]'),'data-current',String(!primaryInDock));
    const choices=list(sections),secondary=active(choices);
    // A repeat tap must not invoke the native full-page compositor again.
    if(!sections.hasAttribute('data-aeu-phone-repeat-guard')){sections.setAttribute('data-aeu-phone-repeat-guard','');sections.addEventListener('click',guardRailRepeat,true);}
    if(rail!==sections){rail=sections;railDirty=true;}
    const layout=choices.length>3?'scroll':choices.length>1?'inline':'single';
    attr(sections,'data-aeu-mobile-layout',layout);attr(sections,'data-aeu-phone-count',String(choices.length));
    attr(shell,'data-aeu-phone-scroll',String(layout==='scroll'));
    if(!sectionButton?.isConnected){
      sectionButton=doc.createElement('button');sectionButton.type='button';sectionButton.className='aeu-phone-all-sections';
      sectionButton.setAttribute('aria-haspopup','dialog');sectionButton.setAttribute('aria-expanded','false');sectionButton.setAttribute('aria-controls','aeu-mobile-menu-dialog');sectionButton.setAttribute('aria-label','查看全部分类');
      sectionButton.innerHTML='<b></b><span aria-hidden="true">⌄</span><small>切换栏目</small>';sections.after(sectionButton);
      sectionButton.addEventListener('click',()=>choose(shell.querySelector('[data-aeu-section-tabs]'),shell.dataset.page==='actors'?'人物分类':'页面分类'));
    }
    const sectionName=label(secondary);
    if(sectionButton.querySelector('b').textContent!==sectionName)sectionButton.querySelector('b').textContent=sectionName;
    attr(sectionButton,'aria-label',`${sectionName}，切换栏目`);attr(sectionButton,'title',sectionName);
    // Keep the selected item within the left rail without scrolling the content.
    if(win.innerWidth<=700&&(selectedSection!==secondary||railDirty)){
      selectedSection=secondary;railDirty=false;
      if(railFocusFrame==null)railFocusFrame=win.requestAnimationFrame(()=>{railFocusFrame=null;const current=selectedSection;if(disposed||railCollapsed||!rail?.isConnected||!current?.isConnected)return;const r=rail.getBoundingClientRect(),s=current.getBoundingClientRect();if(s.top<r.top)rail.scrollTop-=r.top-s.top;else if(s.bottom>r.bottom)rail.scrollTop+=s.bottom-r.bottom;});
    }
    const seen=new Set();
    for(const nav of shell.querySelectorAll('[data-aeu-tab-strip]')){
      if(nav===main||nav===sections||nav.closest('.aeu-mobile-route'))continue;
      const items=list(nav);attr(nav,'data-aeu-mobile-small',String(items.length>1&&items.length<4));if(items.length<4)continue;seen.add(nav);
      let state=proxies.get(nav);
      if(!state){
        const proxy=doc.createElement('button');proxy.type='button';proxy.className='aeu-mobile-subselect';
        proxy.setAttribute('aria-haspopup','dialog');proxy.setAttribute('aria-controls','aeu-mobile-menu-dialog');proxy.setAttribute('aria-expanded','false');
        proxy.innerHTML='<small></small><b></b><span></span>';nav.before(proxy);state={proxy};proxies.set(nav,state);
        proxy.addEventListener('click',()=>choose(nav,proxy.querySelector('small').textContent));nav.setAttribute('data-aeu-mobile-condensed','');
      }
      const board=nav.matches('.aew-board-tabs'),world=nav.matches('.aew-world-domain-nav');
      const prefix=world?'世界领域':board?'社区板块':nav.matches('.aew-rank-categories')?'榜单分类':'分类';
      const action=board?'选择板块':world?'切换领域':'切换分类';
      const current=label(active(items));
      for(const [selector,value]of [['small',prefix],['b',current],['span',action]])if(state.proxy.querySelector(selector).textContent!==value)state.proxy.querySelector(selector).textContent=value;
      attr(state.proxy,'aria-label',`${current}，${action}`);
    }
    for(const [nav,state]of proxies)if(!nav.isConnected||!seen.has(nav)){nav.removeAttribute('data-aeu-mobile-condensed');state.proxy.remove();proxies.delete(nav);}
    syncShelf(shell);
    for(const directory of shell.querySelectorAll('.aeu-location-directory'))attr(directory,'data-aeu-phone-single-location',String(directory.querySelectorAll('.aeu-location-choice').length<=1));
    syncPortrait(shell);
    // Main and local destinations share the same persistent, scrollable rail.
    const phone=win.innerWidth<=700,hasShelf=!!shelf&&!shelf.hidden;
    const sideRail=phone&&choices.length>1,oneLine=phone&&(sideRail||hasShelf);
    attr(shell,'data-aeu-phone-one-line',String(oneLine));attr(shell,'data-aeu-phone-split','false');
    attr(shell,'data-aeu-phone-side-rail',String(sideRail||phone&&hasShelf));
    syncRailToggle(shell,phone&&(sideRail||hasShelf));
    attr(sections,'data-aeu-phone-single-root',String(choices.length<2&&hasShelf));
    syncRailDecorations([...choices,...(hasShelf&&choices.length<2?shelf.querySelectorAll('[data-aeu-shelf-choice]'):[])],phone&&(sideRail||hasShelf));
    sectionButton.hidden=true;
  }
  function guardRailRepeat(event){const button=event.target.closest('button');if(win.innerWidth<=700&&button?.parentElement?.matches('[data-aeu-section-tabs]')&&button.getAttribute('aria-pressed')==='true'){event.preventDefault();event.stopImmediatePropagation();}}
  const resized=()=>{railDirty=true;if(win.innerWidth>700)close();decorate();};
  const focusMusic=()=>doc.querySelector('#aelderan-unified-shell [data-aeu-music]')?.focus({preventScroll:true});
  const panelClose=event=>{if(event.target.closest('#aelderan-unified-shell [data-aeu-close]'))close();if(win.innerWidth<=700&&event.target.closest('[data-music-close]'))focusMusic();};
  const musicEscape=event=>{if(win.innerWidth<=700&&event.key==='Escape'&&event.target.closest('#aeu-music-panel')&&doc.getElementById('aeu-music-panel')?.hidden)focusMusic();};
  win.addEventListener('resize',resized,{passive:true});doc.addEventListener('click',panelClose);doc.addEventListener('keydown',musicEscape,true);
  function dispose(){
    if(decorationFrame!=null)win.cancelAnimationFrame(decorationFrame);
    if(railFocusFrame!=null)win.cancelAnimationFrame(railFocusFrame);
    disposed=true;close();sectionButton?.remove();dock?.remove();shelf?.remove();portraitFooter?.remove();railFilters?.remove();railToggle?.remove();sectionButton=dock=shelf=portraitFooter=railFilters=railToggle=null;style.remove();markRailSources([]);
    for(const [button,state]of railDecorations)restoreRailButton(button,state);railDecorations.clear();
    for(const [button,text]of sectionTexts)if(button.isConnected&&button.textContent!==text)button.textContent=text;sectionTexts.clear();
    for(const [button,listener]of learningButtons)button.removeEventListener('click',listener);learningButtons.clear();
    for(const [holder,hidden]of learningFields)if(holder.isConnected)holder.hidden=hidden;learningFields.clear();
    if(learningNote?.element.isConnected&&learningNote.element.textContent==='')learningNote.element.textContent=learningNote.text;
    doc.getElementById('aeu-skill-edit')?.removeAttribute('data-aeu-skill-simple');
    for(const [nav,state]of proxies){nav.removeAttribute('data-aeu-mobile-condensed');state.proxy.remove();}proxies.clear();
    doc.getElementById('aelderan-unified-shell')?.removeAttribute('data-aeu-phone-edition');
    doc.getElementById('aelderan-unified-shell')?.removeAttribute('data-aeu-phone-scroll');
    doc.getElementById('aelderan-unified-shell')?.removeAttribute('data-aeu-phone-shelf');
    doc.getElementById('aelderan-unified-shell')?.removeAttribute('data-aeu-phone-book');
    doc.getElementById('aelderan-unified-shell')?.removeAttribute('data-aeu-phone-native');
    doc.getElementById('aelderan-unified-shell')?.removeAttribute('data-aeu-phone-has-shelf');
    doc.getElementById('aelderan-unified-shell')?.removeAttribute('data-aeu-phone-one-line');
    doc.getElementById('aelderan-unified-shell')?.removeAttribute('data-aeu-phone-split');
    doc.getElementById('aelderan-unified-shell')?.removeAttribute('data-aeu-phone-side-rail');
    doc.getElementById('aelderan-unified-shell')?.removeAttribute('data-aeu-phone-record-filters');
    doc.getElementById('aelderan-unified-shell')?.removeAttribute('data-aeu-phone-rail-collapsed');
    const sections=doc.querySelector('#aeu-phone-section-rail');sections?.removeEventListener('click',guardRailRepeat,true);sections?.removeAttribute('data-aeu-phone-repeat-guard');sections?.removeAttribute('inert');sections?.removeAttribute('id');sections?.removeAttribute('data-aeu-phone-single-root');
    doc.querySelectorAll('[data-aeu-phone-single-location]').forEach(e=>e.removeAttribute('data-aeu-phone-single-location'));
    rail=null;
    doc.querySelectorAll('[data-aeu-mobile-layout],[data-aeu-mobile-small],[data-aeu-phone-count]').forEach(el=>{for(const name of ['data-aeu-mobile-layout','data-aeu-mobile-small','data-aeu-phone-count'])el.removeAttribute(name);});
    win.removeEventListener('resize',resized);doc.removeEventListener('click',panelClose);doc.removeEventListener('keydown',musicEscape,true);win.removeEventListener('pagehide',dispose);
  }
  globalThis.__AEU_MOBILE_NAV__={decorate,dispose};win.addEventListener('pagehide',dispose,{once:true});decorate();
})();
