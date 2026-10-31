(()=>{
/* Fourth Disaster workshop v1. Worldbook format/update rules adapted from the supplied
 * Yilu workshop reference; new namespace, content policy and host integration. */
(function (root, factory) {
  const value = factory();
  if (typeof module === 'object' && module.exports) module.exports = value;
  // Vite may wrap this shared file as CommonJS inside its Worker bundle.
  // The API importer also needs the explicit shared namespace in that case.
  root.FourthWorkshopCore = value;
})(globalThis, () => {
  'use strict';
  const FORMAT = 'fourth-disaster-workshop/1', MARK = 'fourthDisasterWorkshop';
  const KINDS = ['奇遇', '副本', '武器', '装备', '饰品', '特殊物品', '玩家', 'NPC', '生物', '组织', '地区'];
  const stringify = v => JSON.stringify(v, (_, x) => Object.prototype.toString.call(x) === '[object RegExp]' ? {$regex:x.source, flags:x.flags} : x);
  const clone = v => JSON.parse(stringify(v));
  const revive = v => JSON.parse(stringify(v), (_, x) => x && typeof x.$regex === 'string' ? new RegExp(x.$regex, x.flags || '') : x);
  const canonical = v => JSON.stringify(v, (_, x) => x && !Array.isArray(x) && typeof x === 'object' ? Object.fromEntries(Object.keys(x).sort().map(k => [k, x[k]])) : x);
  const assert = (ok, message) => { if (!ok) throw Error(message); };
  const text = (v, label, max, required = false) => { assert(typeof v === 'string' && v.length <= max && (!required || v.trim()), `${label}格式或长度无效。`); return v.trim(); };
  const number = (v, fallback, min = 0, max = 100000) => { if (v == null) return fallback; assert(Number.isSafeInteger(v) && v >= min && v <= max, '条目数值设置无效。'); return v; };
  function entry(input, index) {
    const e = clone(input), id = e.id || `entry-${index + 1}`;
    assert(typeof id === 'string' && /^[\w-]{1,100}$/.test(id), '条目编号无效。');
    const name = text(e.name, '条目名称', 200, true), content = text(e.content, '条目正文', 102400, true);
    assert(new TextEncoder().encode(content).length <= 102400, '单条正文不能超过 100 KiB。');
    assert(!/\[?(?:mvu_|initvar)|变量(?:初始化|更新|输出|列表)|ZOD|状态栏|正则|控制器/i.test(name), '首版工坊仅接受内容扩展，不安装核心变量规则或脚本。');
    assert(!/<%|<script\b|<UpdateVariable\b/i.test(content), '内容包不能包含执行代码或变量更新块。');
    const s = e.strategy || {}, p = e.position || {}, r = e.recursion || {}, f = e.effect || {};
    const keys = list => (list || []).map(k => {
      if (typeof k === 'string') return text(k, '关键词', 500);
      assert(k && typeof k.$regex === 'string' && k.$regex.length <= 500, '关键词格式无效。');
      new RegExp(k.$regex, k.flags || ''); return {$regex:k.$regex, flags:k.flags || ''};
    });
    const type = s.type || 'selective', logic = s.keys_secondary?.logic || 'and_any';
    assert(['constant','selective','vectorized'].includes(type), '触发方式无效。');
    assert(['and_any','and_all','not_all','not_any'].includes(logic), '次要关键词逻辑无效。');
    const position = p.type || 'after_character_definition', role = p.role || 'system';
    assert(['before_character_definition','after_character_definition','before_example_messages','after_example_messages','before_author_note','after_author_note','at_depth','outlet'].includes(position), '插入位置无效。');
    assert(['system','user','assistant'].includes(role), '消息身份无效。');
    return {id, name, content, enabled:e.enabled !== false,
      strategy:{type, keys:keys(s.keys), keys_secondary:{logic,keys:keys(s.keys_secondary?.keys)}, scan_depth:s.scan_depth === 'same_as_global' || s.scan_depth == null ? 'same_as_global' : number(s.scan_depth, 2)},
      position:{type:position,role,depth:number(p.depth,4),order:number(p.order,100,-100000)}, probability:number(e.probability,100,0,100),
      recursion:{prevent_incoming:!!r.prevent_incoming,prevent_outgoing:!!r.prevent_outgoing,delay_until:number(r.delay_until,null)},
      effect:{sticky:number(f.sticky,null),cooldown:number(f.cooldown,null),delay:number(f.delay,null)}};
  }
  function normalize(input) {
    assert(input && input.format === FORMAT, '请选择第四天灾工坊 v1 作品包；异录包不能直接安装。');
    assert(typeof input.id === 'string' && /^[\w-]{8,80}$/.test(input.id), '作品编号无效。');
    assert(KINDS.includes(input.category), '请选择'+KINDS.join('、')+'。');
    assert(Array.isArray(input.entries) && input.entries.length > 0 && input.entries.length <= 100, '每包需要 1–100 个条目。');
    assert(input.target === 'fourth-disaster/3.2', '此包未声明适配第四天灾 3.2。');
    const entries = input.entries.map(entry);
    assert(new Set(entries.map(e => e.id)).size === entries.length, '作品内条目编号重复。');
    assert(Number.isSafeInteger(input.version) && input.version > 0, '作品版本必须是正整数。');
    const result = {format:FORMAT,id:input.id,title:text(input.title,'作品名称',80,true),summary:text(input.summary || '','简介',1000),category:input.category,
      tags:(input.tags || []).map(t => text(t,'标签',30)).slice(0,8),target:input.target,compatibility:text(input.compatibility || '第四天灾 3.2 · 内容扩展','适用说明',500),
      dependencies:text(input.dependencies || '无','依赖说明',1000),version:input.version,entries};
    assert(new TextEncoder().encode(stringify(result)).length <= 1048576, '作品包不能超过 1 MiB。');
    return result;
  }
  function fingerprint(input) {
    const e = entry({...input,id:'fingerprint'},0); delete e.id; delete e.enabled;
    return canonical(e);
  }
  const owned = (all, id) => all.filter(e => e.extra?.[MARK]?.packageId === id);
  function toEntry(e,p,enabled,uid) {
    const x = revive(e); delete x.id; x.enabled = !!enabled && e.enabled;
    if (uid != null) x.uid = uid;
    x.extra = {[MARK]:{packageId:p.id,entryId:e.id,version:p.version,title:p.title,category:p.category,baseline:fingerprint(x)}};
    return x;
  }
  function plan(current,input,{mode = 'keep',enabled = false} = {}) {
    const p = normalize(input), own = owned(current,p.id), next = new Map(p.entries.map(e => [e.id,e]));
    assert(['keep','overwrite'].includes(mode), '更新方式无效。');
    assert(new Set(own.map(e => e.extra[MARK].entryId)).size === own.length, '目标存在重复来源条目，无法确定更新对象。');
    assert(!own.some(e => e.extra[MARK].version > p.version), '不能用旧版覆盖新版作品。');
    const conflicts = own.filter(e => fingerprint(e) !== e.extra[MARK].baseline);
    const removed = own.filter(e => !next.has(e.extra[MARK].entryId));
    const result = current.filter(e => !own.includes(e));
    let uid = Math.max(-1,...current.map(e => Number.isSafeInteger(e.uid) ? e.uid : -1)) + 1;
    for (const local of own) {
      const incoming = next.get(local.extra[MARK].entryId); next.delete(local.extra[MARK].entryId);
      if (mode === 'keep' && (conflicts.includes(local) || !incoming)) result.push(local);
      else if (incoming) { const updated = toEntry(incoming,p,local.enabled,local.uid); updated.extra = {...clone(local.extra),...updated.extra}; result.push(updated); }
    }
    const added = [...next.values()]; for (const e of added) result.push(toEntry(e,p,enabled,uid++));
    // Names are part of the backend identity inference. Do not silently create two candidates with one name.
    const names = new Set(); for (const e of result) { assert(!names.has(e.name), `条目名称冲突：${e.name}。请先改名或处理旧条目。`); names.add(e.name); }
    return {result,owned:own,conflicts,removed,added};
  }
  function uninstall(current,id) {
    return current.flatMap(e => {
      if (e.extra?.[MARK]?.packageId !== id) return [e];
      if (fingerprint(e) === e.extra[MARK].baseline) return [];
      const saved = clone(e); delete saved.extra[MARK]; return [revive(saved)];
    });
  }
  return {FORMAT,MARK,KINDS,stringify,canonical,clone,revive,assert,normalize,fingerprint,owned,plan,uninstall};
});

(function (root, factory) {
  const value = factory(typeof module === 'object' && module.exports ? require('./core.js') : root.FourthWorkshopCore);
  if (typeof module === 'object' && module.exports) module.exports = value;
  else root.FourthWorkshopManager = value;
})(globalThis, C => {
  'use strict';
  function create({api,identity,owner = identity,store,persist,lock = (_,fn) => fn()}) {
    let busy = false;
    const same = expected => C.assert(identity() === expected, '角色或聊天已切换，本次操作已停止。');
    const target = async () => {
      const expected = identity(), record = await store.get('target:' + owner()); same(expected);
      C.assert(record?.book?.startsWith('第四天灾扩展-'), '请先创建并绑定本角色的扩展世界书。');
      const binding = api('getCharWorldbookNames')('current');
      C.assert(binding.additional.includes(record.book), '扩展世界书已解除绑定，请重新绑定后操作。');
      return {book:record.book,expected};
    };
    async function prepare(label) {
      const expected = identity(); C.assert(expected, '请先打开第四天灾的单人角色聊天。');
      const ownerKey = owner(), old = await store.get('target:' + ownerKey); same(expected);
      if (old) {
        C.assert(api('getWorldbookNames')().includes(old.book), '原扩展世界书已被删除，请先导出记录再重新建库。');
        const binding = api('getCharWorldbookNames')('current');
        if (!binding.additional.includes(old.book)) { await api('rebindCharWorldbooks')('current',{...binding,additional:[...binding.additional,old.book]}); same(expected); }
        return old.book;
      }
      const book = '第四天灾扩展-' + label.replace(/[\\/:*?"<>|]/g,'').slice(0,32) + '-' + crypto.randomUUID().slice(0,8);
      C.assert(!api('getWorldbookNames')().includes(book), '世界书名称已存在，请重试。');
      same(expected); await api('createWorldbook')(book,[]); same(expected);
      // Save ownership before binding: a failed bind can be retried without creating another book.
      await store.set('target:' + ownerKey,{book}); same(expected);
      const binding = api('getCharWorldbookNames')('current');
      await api('rebindCharWorldbooks')('current',{...binding,additional:[...new Set([...binding.additional,book])]}); same(expected);
      C.assert(api('getCharWorldbookNames')('current').additional.includes(book), '扩展世界书绑定未确认。');
      return book;
    }
    async function mutate(packageId,transform) {
      C.assert(!busy,'已有工坊操作进行中。'); busy = true;
      try { const t = await target(); return await lock('fourth-workshop:' + t.book,async () => {
        same(t.expected); const before = await api('getWorldbook')(t.book); same(t.expected);
        const expected = transform(C.revive(before));
        const record = {book:t.book,identity:t.expected,packageId,before:C.clone(before),expected:C.clone(expected),time:Date.now(),status:'prepared'};
        await store.set('recovery:' + t.expected,record); same(t.expected);
        await api('updateWorldbookWith')(t.book,current => {
          same(t.expected); C.assert(C.stringify(current) === C.stringify(before),'世界书已被其他操作修改，请刷新后重试。'); return expected;
        },{render:'immediate'});
        // Persist the original target even if the user has switched chat after the host write.
        await persist(t.book);
        const actual = await api('getWorldbook')(t.book);
        C.assert(C.canonical(C.clone(actual)) === C.canonical(C.clone(expected)), '保存回读不一致，备份已保留，请先导出核对。');
        record.status = 'verified'; await store.set('recovery:' + t.expected,record); same(t.expected);
        return actual;
      }); } finally { busy = false; }
    }
    async function preview(p,options) { const t = await target(), all = await api('getWorldbook')(t.book); same(t.expected); return {...C.plan(all,p,options),book:t.book}; }
    async function list() { const t = await target(), all = await api('getWorldbook')(t.book); same(t.expected); return {book:t.book,entries:all}; }
    async function restore() {
      C.assert(!busy,'已有操作进行中。'); busy = true;
      try { const t = await target(), r = await store.get('recovery:' + t.expected);
        C.assert(r && r.book === t.book,'当前聊天没有可恢复的工坊操作。');
        return await lock('fourth-workshop:' + t.book,async () => {
          const current = await api('getWorldbook')(t.book); same(t.expected);
          // A failed/partial write is never called a successful rollback automatically.
          C.assert(C.canonical(C.clone(current)) === C.canonical(r.expected),'操作后世界书又有变化，停止自动恢复；请导出备份手动核对。');
          await api('updateWorldbookWith')(t.book,latest => { same(t.expected); C.assert(C.stringify(latest) === C.stringify(current),'世界书刚被修改。'); return C.revive(r.before); },{render:'immediate'});
          await persist(t.book); const actual = await api('getWorldbook')(t.book);
          C.assert(C.canonical(C.clone(actual)) === C.canonical(r.before),'恢复回读不一致，备份仍保留。');
          await store.remove('recovery:' + t.expected); same(t.expected); return actual;
        });
      } finally { busy = false; }
    }
    return {prepare,target,preview,list,restore,install:(p,o) => mutate(p.id,all => C.plan(all,p,o).result),
      manage:(id,action) => { C.assert(['enable','disable','uninstall'].includes(action),'管理操作无效。'); return mutate(id,all => action === 'uninstall' ? C.uninstall(all,id) : all.map(e => e.extra?.[C.MARK]?.packageId === id ? {...e,enabled:action === 'enable'} : e)); },
      recovery:() => store.get('recovery:' + identity())};
  }
  return {create};
});

/* Owned, reversible page takeover. Does not replace native handlers or state. */
(function (root) {
  function create(doc) {
    let owner=null, slots=[], nav=[], route=null, active=false;
    const restoreAttribute=(node,name,value)=>value===null?node.removeAttribute(name):node.setAttribute(name,value);
    function close() {
      if(!active)return;
      if(owner)delete owner.dataset.fdwOpened;
      for(const item of slots)if(item.node.isConnected){
        item.node.hidden=item.hidden;item.node.inert=item.inert;
        restoreAttribute(item.node,'aria-hidden',item.aria);
      }
      for(const [node,value]of nav)if(node.isConnected)restoreAttribute(node,'aria-pressed',value);
      slots=[];nav=[];active=false;
    }
    function open(shell) {
      if(active&&owner===shell)return;
      close();
      if(owner!==shell){route?.remove();route=null;}
      owner=shell;
      slots=[...shell.querySelectorAll('.aeu-content > [data-aeu-slot]')].map(node=>({
        node,hidden:node.hidden,inert:!!node.inert,aria:node.getAttribute('aria-hidden'),
      }));
      nav=[...shell.querySelectorAll('[data-aeu-page][aria-pressed],[data-aeu-tools][aria-pressed]')]
        .map(node=>[node,node.getAttribute('aria-pressed')]);
      for(const item of slots){item.node.hidden=true;item.node.inert=true;item.node.setAttribute('aria-hidden','true');}
      for(const [node]of nav)node.setAttribute('aria-pressed','false');
      const original=shell.querySelector('[data-aeu-route]');
      if(original&&!route){route=doc.createElement('span');route.className='fdw-shell-route';route.textContent='工坊 / 创意工坊';original.parentElement.append(route);}
      shell.dataset.fdwOpened='true';active=true;
    }
    function dispose(){close();route?.remove();route=null;owner=null;}
    return {open,close,dispose};
  }
  const api={create};root.FourthWorkshopView=api;
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);

globalThis.FourthWorkshopConfig={"service":"https://fourth-disaster-workshop-20261025.balmysquid7.chatgpt.site"};
globalThis.FourthWorkshopSamples=[{"format":"fourth-disaster-workshop/1","id":"fdw-example-harbor-001","title":"港口的一张旧航图","summary":"离线格式示例：一张等待查证的航图。不会自动创建任务或发放奖励。","category":"奇遇","tags":["示例","港口","探索"],"target":"fourth-disaster/3.2","compatibility":"第四天灾 3.2 · 可选创作示例，不宣称已发生","dependencies":"无","version":1,"entries":[{"id":"harbor-chart","name":"奇遇-港口旧航图","content":"可选奇遇素材：当正文中的角色实际走访港口旧货摊时，可以遇到一位出售旧航图的摊主。航图上的标注缺乏佐证，摊主也无法证明其真实性。是否交谈、购买或探索由游玩者选择。目的地、航路与遗迹必须与已有世界设定核对，不能凭此宣布新增地点或已经获得宝物。","enabled":true,"strategy":{"type":"selective","keys":["旧航图","港口旧货摊"],"keys_secondary":{"logic":"and_any","keys":[]},"scan_depth":"same_as_global"},"position":{"type":"after_character_definition","role":"system","depth":4,"order":100},"probability":100,"recursion":{"prevent_incoming":false,"prevent_outgoing":false,"delay_until":null},"effect":{"sticky":null,"cooldown":null,"delay":null}}]},{"format":"fourth-disaster-workshop/1","id":"fdw-example-traveler-001","title":"一位收集民谣的旅人","summary":"离线 NPC 模板：有自己的短期目标、长期目标和知情边界。不会凭安装成为主角的已接触人物。","category":"NPC","tags":["示例","NPC","旅行"],"target":"fourth-disaster/3.2","compatibility":"第四天灾 3.2 · 原创人物候选示例","dependencies":"无","version":1,"entries":[{"id":"traveler-singer","name":"人物-岚舟（工坊示例）","content":"NPC-岚舟（工坊示例）:\n身份：记录沿途民谣的普通旅人；具体物种与出现地区应由创作者按世界设定补全。\n短期目标：找到一位愿意讲述本地旧歌来历的人。\n长期目标：整理一册能分辨传说来源的旅行歌谣集。\n知情边界：只知道亲历的旅行和具名讲述者告知的内容，不了解主角隐私、远方战果或组织机密。\n互动：可以交换歌谣与路途见闻，不承诺提供任务、奖励或特殊能力。\n运行约定：这是可选候选设定；真实出场、所在地与接触关系以正文确认。","enabled":true,"strategy":{"type":"selective","keys":["岚舟","旅行歌谣"],"keys_secondary":{"logic":"and_any","keys":[]},"scan_depth":"same_as_global"},"position":{"type":"after_character_definition","role":"system","depth":4,"order":100},"probability":100,"recursion":{"prevent_incoming":false,"prevent_outgoing":false,"delay_until":null},"effect":{"sticky":null,"cooldown":null,"delay":null}}]}];
globalThis.FourthWorkshopCSS="/* Aelderan workshop — engraved metal, warm readable type, no image downloads. */\r\n#aelderan-unified-shell #fourth-workshop-panel{\r\n --fdw-ink:#eee5d4;--fdw-muted:#b8bbaf;--fdw-gold:#d0b47e;--fdw-line:#bda06b40;--fdw-paper:#19282d;--fdw-field:#172931a6;--fdw-hover:#bba47414;--fdw-title:'STKaiti','KaiTi','Songti SC','SimSun',serif;\r\n position:absolute;inset:0;z-index:8;display:grid;grid-template-columns:162px minmax(0,1fr);grid-template-rows:86px minmax(0,1fr);min-width:0;isolation:isolate;overflow:hidden;text-align:left;color:var(--fdw-ink);background:radial-gradient(ellipse at 85% 0,#53605a19,transparent 55%),linear-gradient(135deg,#1a282c,#111f25 70%,#17252b);font:15px/1.8 'Microsoft YaHei','PingFang SC',sans-serif;\r\n}\r\n#fourth-workshop-panel[hidden],#fourth-workshop-panel [hidden]{display:none!important}\r\n#fourth-workshop-panel,#fourth-workshop-panel *{box-sizing:border-box}\r\n#fourth-workshop-panel button,#fourth-workshop-panel input,#fourth-workshop-panel select,#fourth-workshop-panel textarea{font:inherit;color:inherit;letter-spacing:normal;text-shadow:none}\r\n#fourth-workshop-panel button{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:42px;padding:8px 15px;border:1px solid var(--fdw-line);border-radius:2px;background:transparent;box-shadow:none;cursor:pointer;transition:background .16s,color .16s,border-color .16s;white-space:normal;line-height:1.5}\r\n#fourth-workshop-panel button:hover{border-color:var(--fdw-gold);background:var(--fdw-hover);color:var(--fdw-ink)}\r\n#fourth-workshop-panel :is(button,input,textarea,select,summary):focus-visible{outline:2px solid var(--fdw-gold);outline-offset:3px}\r\n#fourth-workshop-panel button:disabled{opacity:.5;cursor:wait}\r\n#fourth-workshop-panel .fdw-primary{background:linear-gradient(115deg,#dbc38c,#b49b68);border-color:#dfc994;color:#172126;font-weight:700}\r\n#fourth-workshop-panel .fdw-primary:hover{background:#e2ce9f;color:#172126}\r\n#fourth-workshop-panel a{color:var(--fdw-gold);text-underline-offset:4px}\r\n#fourth-workshop-panel svg{display:block;flex:none;width:20px;height:20px}\r\n#fourth-workshop-panel .fdw-heading{grid-column:1/-1;display:flex;align-items:center;justify-content:space-between;gap:16px;padding:15px 30px 15px 23px;border-bottom:1px solid var(--fdw-line);background:linear-gradient(90deg,#b9a0750b,transparent 65%);position:relative}\r\n#fourth-workshop-panel .fdw-heading::after{content:'';position:absolute;bottom:-2px;left:24px;width:46px;height:3px;background:var(--fdw-gold);clip-path:polygon(0 50%,15% 0,85% 0,100% 50%,85% 100%,15% 100%)}\r\n#fourth-workshop-panel .fdw-heading h1{margin:0;font:500 31px/1.35 var(--fdw-title);letter-spacing:.16em;color:var(--fdw-ink)}\r\n#fourth-workshop-panel .fdw-eyebrow{display:block;color:var(--fdw-gold);font:10px/1.7 Georgia,serif;letter-spacing:.19em}\r\n#fourth-workshop-panel .fdw-heading .fdw-eyebrow{margin-bottom:4px;font-size:9px}\r\n#fourth-workshop-panel .fdw-heading>button{font-size:13px;border-color:transparent;color:var(--fdw-muted)}\r\n#fourth-workshop-panel .fdw-heading>button svg{width:17px;height:17px}\r\n#fourth-workshop-panel .fdw-tabs{grid-row:2;grid-column:1;display:flex!important;flex-direction:column!important;flex-wrap:nowrap!important;align-items:stretch!important;gap:8px!important;margin:0!important;padding:24px 12px!important;overflow:auto!important;border:0!important;border-right:1px solid var(--fdw-line)!important;border-bottom:0!important;background:linear-gradient(90deg,#080f141f,#bfa87805)!important;scrollbar-width:none;min-width:0;min-height:0}\r\n#fourth-workshop-panel .fdw-tabs>button{position:relative;display:flex;flex-direction:row;flex:none;justify-content:flex-start;gap:12px;min-width:0;min-height:54px;margin:0!important;padding:10px 12px!important;border:1px solid transparent!important;border-radius:2px!important;background:transparent!important;color:var(--fdw-muted);font-size:14px!important;line-height:1.5;white-space:nowrap;box-shadow:none!important;transform:none}\r\n#fourth-workshop-panel .fdw-tabs>button::after{display:none!important}\r\n#fourth-workshop-panel .fdw-tabs>button[aria-current=page]{border-color:#bfa47455!important;background:linear-gradient(100deg,#bda37025,#bda37007)!important;color:#ead6aa!important}\r\n#fourth-workshop-panel .fdw-tabs>button[aria-current=page]::before{content:'';position:absolute;left:-13px;top:13px;bottom:13px;width:2px;background:#d4b878;box-shadow:0 0 9px #d4b87840}\r\n#fourth-workshop-panel .fdw-tabs>button:hover{color:var(--fdw-ink);background:var(--fdw-hover)!important}\r\n#fourth-workshop-panel .fdw-tabs svg{width:20px;height:20px;color:var(--fdw-gold);opacity:.78}\r\n#fourth-workshop-panel .fdw-tabs [aria-current=page] svg{opacity:1}\r\n#fourth-workshop-panel .fdw-nav-short{display:none}\r\n#fourth-workshop-panel .fdw-rail-end{margin-top:auto;padding-top:30px;align-self:center;color:#bba37170;font-size:8px}\r\n#fourth-workshop-panel .fdw-stage{grid-row:2;grid-column:2;display:flex;flex-direction:column;min-width:0;min-height:0;overflow:hidden}\r\n#fourth-workshop-panel .fdw-notice{display:block;flex:none;margin:0;padding:0 32px;color:#e1c38e;font-size:13px;overflow-wrap:anywhere}\r\n#fourth-workshop-panel .fdw-notice:not(:empty){padding-block:10px;background:#b69a6310;border-bottom:1px solid var(--fdw-line)}\r\n#fourth-workshop-panel .fdw-body{flex:1;min-width:0;min-height:0;overflow:auto;padding:25px 32px 36px;overscroll-behavior:contain;scrollbar-width:thin;scrollbar-color:#bca57455 transparent;scroll-padding:20px}\r\n#fourth-workshop-panel .fdw-body>*{max-width:1000px;margin-inline:auto}\r\n#fourth-workshop-panel .fdw-intro{position:relative;display:flex;align-items:center;justify-content:space-between;gap:24px;margin-top:0;margin-bottom:23px;padding:0 0 24px;border-bottom:1px solid var(--fdw-line)}\r\n#fourth-workshop-panel .fdw-intro h2{font:500 32px/1.5 var(--fdw-title);letter-spacing:.08em;color:var(--fdw-ink);margin:4px 0 7px}\r\n#fourth-workshop-panel :is(.fdw-intro,.fdw-section-heading) p{color:var(--fdw-muted);margin:6px 0 0;font-size:14px;line-height:1.85;overflow-wrap:anywhere}\r\n#fourth-workshop-panel .fdw-stamp{color:var(--fdw-gold);opacity:.38;flex:none;width:104px;height:104px;margin:-6px 4px -8px 0;pointer-events:none}\r\n#fourth-workshop-panel .fdw-stamp svg{width:100%;height:100%;stroke-width:.7}\r\n#fourth-workshop-panel [data-fdw-search]{display:grid;grid-template-columns:minmax(0,1fr) 125px 68px;gap:9px;align-items:center;margin-block:0 22px}\r\n#fourth-workshop-panel :is(input,select,textarea){min-width:0;max-width:100%;border:1px solid var(--fdw-line);border-bottom-color:#c8ae766b;background:var(--fdw-field);box-shadow:inset 0 1px 0 #ffffff03;border-radius:2px;padding:10px 12px;min-height:44px;line-height:1.65}\r\n#fourth-workshop-panel input{width:100%}\r\n#fourth-workshop-panel :is(input,textarea)::placeholder{color:#b3baaf;opacity:.82}\r\n#fourth-workshop-panel select{width:100%;cursor:pointer}\r\n#fourth-workshop-panel select option{background:var(--fdw-paper);color:var(--fdw-ink)}\r\n#fourth-workshop-panel textarea{display:block;width:100%;min-height:110px;resize:vertical;margin-top:7px}\r\n#fourth-workshop-panel [name=content]{min-height:280px;line-height:1.95}\r\n#fourth-workshop-panel [name=package]{min-height:430px;font:13px/1.85 Consolas,monospace;tab-size:2}\r\n#fourth-workshop-panel label{display:block;color:var(--fdw-muted);font-size:13px;font-weight:400}\r\n#fourth-workshop-panel label>:is(input,select){display:block;margin:7px 0 0;color:var(--fdw-ink)}\r\n#fourth-workshop-panel label>textarea{color:var(--fdw-ink)}\r\n#fourth-workshop-panel .fdw-list-heading{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-block:0 10px;color:var(--fdw-gold);font-size:12px;letter-spacing:.1em}\r\n#fourth-workshop-panel .fdw-list-heading small{color:var(--fdw-muted);font-size:11px;letter-spacing:0}\r\n#fourth-workshop-panel .fdw-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(290px,100%),1fr));gap:15px;margin-block:0 20px}\r\n#fourth-workshop-panel .fdw-card{display:flex;flex-direction:column;position:relative;min-width:0;padding:19px 21px 14px;border:1px solid #bda06b33;border-top-color:#c9b18066;border-radius:2px;background:linear-gradient(125deg,#aeb9b507,transparent 60%);box-shadow:none;transition:border-color .18s,background .18s}\r\n#fourth-workshop-panel .fdw-card::before{content:'';position:absolute;top:-1px;left:20px;width:24px;height:1px;background:#d5ba83}\r\n#fourth-workshop-panel .fdw-card:hover{border-color:#c9ad7666;background:#bfa87808}\r\n#fourth-workshop-panel .fdw-card-cap{display:flex;justify-content:space-between;gap:10px;font-size:11px;color:var(--fdw-gold)}\r\n#fourth-workshop-panel .fdw-card-cap>span{letter-spacing:.08em}\r\n#fourth-workshop-panel .fdw-card-cap small{font:12px Georgia,serif;color:var(--fdw-muted)}\r\n#fourth-workshop-panel .fdw-card h3{margin:9px 0 8px;line-height:1.65}\r\n#fourth-workshop-panel .fdw-card h3>button{display:block;text-align:left;min-height:0;padding:0!important;margin:0;border:0;background:transparent!important;font:500 21px/1.65 var(--fdw-title)!important;color:var(--fdw-ink);overflow-wrap:anywhere}\r\n#fourth-workshop-panel .fdw-card h3>button:hover{color:#e5c992}\r\n#fourth-workshop-panel .fdw-card p{flex:1;margin:0 0 20px;white-space:pre-wrap;overflow-wrap:anywhere;color:var(--fdw-muted);font-size:14px;line-height:1.9}\r\n#fourth-workshop-panel .fdw-card footer{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;border-top:1px solid #bda06b24;padding-top:10px;color:var(--fdw-muted);font-size:12px}\r\n#fourth-workshop-panel .fdw-card footer small{font-size:12px;overflow-wrap:anywhere}\r\n#fourth-workshop-panel .fdw-card footer button{border:0;padding:6px 0;min-height:36px;font-size:12px;color:var(--fdw-gold)}\r\n#fourth-workshop-panel .fdw-actions{display:flex;align-items:center;flex-wrap:wrap;gap:9px;margin-block:17px}\r\n#fourth-workshop-panel .fdw-actions button{font-size:13px}\r\n#fourth-workshop-panel .fdw-actions>small{color:var(--fdw-muted);margin-right:8px}\r\n#fourth-workshop-panel .fdw-section-heading{padding:0 0 22px;border-bottom:1px solid var(--fdw-line);margin-bottom:20px}\r\n#fourth-workshop-panel .fdw-section-heading h2{font:500 29px/1.5 var(--fdw-title);letter-spacing:.08em;margin:4px 0 6px;color:var(--fdw-ink)}\r\n#fourth-workshop-panel .fdw-empty{grid-column:1/-1;position:relative;padding:28px 12px;text-align:center;color:var(--fdw-muted);border-block:1px solid #bda06b22}\r\n#fourth-workshop-panel .fdw-empty b{display:block;font:500 22px/1.7 var(--fdw-title);color:var(--fdw-gold);letter-spacing:.08em}\r\n#fourth-workshop-panel .fdw-empty p{margin:9px 0 0;font-size:13px}\r\n#fourth-workshop-panel .fdw-note{color:var(--fdw-muted);font-size:13px;line-height:1.9;overflow-wrap:anywhere;margin-block:14px}\r\n#fourth-workshop-panel .fdw-installed{padding:20px 0;border-block:1px solid var(--fdw-line);display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px}\r\n#fourth-workshop-panel .fdw-installed h3{font:500 23px/1.6 var(--fdw-title);margin:0 0 6px;color:var(--fdw-ink)}\r\n#fourth-workshop-panel .fdw-installed p{margin:0;color:var(--fdw-muted);font-size:13px}\r\n#fourth-workshop-panel .fdw-installed .fdw-actions{margin:7px 0 0}\r\n#fourth-workshop-panel .fdw-detail-back{margin-bottom:20px}\r\n#fourth-workshop-panel .fdw-detail-back button{border:0;padding:0;min-height:32px;font-size:13px;color:var(--fdw-gold)}\r\n#fourth-workshop-panel .fdw-detail h2{font:500 31px/1.6 var(--fdw-title);color:var(--fdw-ink);margin:7px 0 12px;overflow-wrap:anywhere}\r\n#fourth-workshop-panel .fdw-detail>p{color:var(--fdw-muted);line-height:1.95}\r\n#fourth-workshop-panel .fdw-detail dl{display:grid;grid-template-columns:70px minmax(0,1fr);border-block:1px solid var(--fdw-line);padding:18px 0;gap:10px 18px;font-size:13px}\r\n#fourth-workshop-panel .fdw-detail dt{color:var(--fdw-muted)}\r\n#fourth-workshop-panel .fdw-detail dd{margin:0;overflow-wrap:anywhere}\r\n#fourth-workshop-panel .fdw-detail details{border-bottom:1px solid var(--fdw-line);padding:18px 0}\r\n#fourth-workshop-panel :is(.fdw-detail,.fdw-guide-example) summary{cursor:pointer;font-size:17px;color:var(--fdw-gold);padding:5px 0;line-height:1.8}\r\n#fourth-workshop-panel .fdw-detail summary small{font:11px 'Microsoft YaHei',sans-serif;color:var(--fdw-muted);margin-left:8px}\r\n#fourth-workshop-panel .fdw-detail pre{white-space:pre-wrap;overflow-wrap:anywhere;font:15px/2 'Microsoft YaHei','PingFang SC',sans-serif;padding:8px 0 0;color:var(--fdw-ink)}\r\n#fourth-workshop-panel .fdw-form-section{margin-top:24px;padding-bottom:22px;border-bottom:1px solid var(--fdw-line)}\r\n#fourth-workshop-panel .fdw-form-section h3{display:flex;align-items:center;gap:12px;margin:0 0 16px;font:500 22px/1.6 var(--fdw-title);color:var(--fdw-gold);letter-spacing:.06em}\r\n#fourth-workshop-panel .fdw-form-section h3>span{font:12px Georgia,serif;color:var(--fdw-muted)}\r\n#fourth-workshop-panel .fdw-form-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:17px 22px;margin-block:10px 18px}\r\n#fourth-workshop-panel .fdw-form-grid label{min-width:0}\r\n#fourth-workshop-panel .fdw-form-grid label:has(textarea){grid-column:1/-1}\r\n#fourth-workshop-panel .fdw-toolbox{border-bottom:1px solid var(--fdw-line);padding:0 0 12px;margin-bottom:12px}\r\n#fourth-workshop-panel .fdw-toolbox summary{cursor:pointer;color:var(--fdw-gold);font-size:13px;padding-block:6px}\r\n#fourth-workshop-panel .fdw-editor-actions{justify-content:flex-end;padding-top:5px}\r\n#fourth-workshop-panel .fdw-editor-actions>button{min-width:120px}\r\n#fourth-workshop-panel .fdw-guide-steps{list-style:none;counter-reset:guide;padding:0;margin-block:0 20px}\r\n#fourth-workshop-panel .fdw-guide-steps>li{counter-increment:guide;position:relative;padding:20px 0 20px 45px;border-bottom:1px solid var(--fdw-line)}\r\n#fourth-workshop-panel .fdw-guide-steps>li::before{content:counter(guide,decimal-leading-zero);position:absolute;left:0;top:24px;color:var(--fdw-gold);font:15px Georgia,serif}\r\n#fourth-workshop-panel .fdw-guide-steps b{font:500 22px/1.6 var(--fdw-title);color:var(--fdw-ink)}\r\n#fourth-workshop-panel .fdw-guide-steps p{margin:7px 0 0;font-size:14px;line-height:1.95;color:var(--fdw-muted)}\r\n#fourth-workshop-panel .fdw-guide-example{border-bottom:1px solid var(--fdw-line);padding-bottom:16px}\r\n#fourth-workshop-panel .fdw-guide-example dl{display:grid;grid-template-columns:38px minmax(0,1fr);gap:15px;font-size:14px}\r\n#fourth-workshop-panel .fdw-guide-example dt{color:var(--fdw-gold)}\r\n#fourth-workshop-panel .fdw-guide-example dd{margin:0;color:var(--fdw-muted);overflow-wrap:anywhere}\r\n/* Preserve the existing reversible owned-page contract. */\r\n#aelderan-unified-shell[data-fdw-opened=true] [data-aeu-section-tabs]{display:none!important}\r\n#aelderan-unified-shell[data-fdw-opened=true] .aeu-content > [data-aeu-slot]{display:none!important;pointer-events:none!important}\r\n#aelderan-unified-shell[data-fdw-opened=true] :is([data-aeu-route],[data-aeu-hud],[data-aeu-identity],[data-aeu-run],[data-aeu-failure],[data-aeu-resume],[data-aeu-back]){display:none!important}\r\n.fdw-shell-route{display:none}\r\n#aelderan-unified-shell[data-fdw-opened=true] .fdw-shell-route{display:inline}\r\n#aelderan-unified-shell [data-fdw-open]{color:#c9bd96}\r\n#aelderan-unified-shell [data-fdw-open][aria-pressed=true]{background:#a99b6022;color:#e6d49c;border-color:#aa945e}\r\n#aelderan-unified-shell[data-theme=light] #fourth-workshop-panel{--fdw-ink:#293b3e;--fdw-muted:#55645f;--fdw-gold:#7e6034;--fdw-line:#8e764a50;--fdw-paper:#eeece1;--fdw-field:#f8f5e987;--fdw-hover:#8e764a0e;background:radial-gradient(ellipse at 85% 0,#bca77b18,transparent 55%),linear-gradient(130deg,#ecebde,#dfe4db)}\r\n#aelderan-unified-shell[data-theme=light] #fourth-workshop-panel .fdw-tabs>button[aria-current=page]{color:#67491f!important;background:#9c7c3814!important;border-color:#a88a5555!important}\r\n#aelderan-unified-shell[data-theme=light] #fourth-workshop-panel .fdw-card h3>button:hover{color:#7d5e25}\r\n#aelderan-unified-shell[data-theme=light] #fourth-workshop-panel :is(input,textarea)::placeholder{color:#67756d}\r\n#aelderan-unified-shell[data-theme=light] #fourth-workshop-panel .fdw-notice{color:#735323}\r\n@media(max-width:740px){\r\n #aelderan-unified-shell #fourth-workshop-panel{grid-template-columns:64px minmax(0,1fr);grid-template-rows:72px minmax(0,1fr);font-size:14px}\r\n #fourth-workshop-panel .fdw-heading{padding:10px 17px 11px 18px;gap:8px}\r\n #fourth-workshop-panel .fdw-heading h1{font-size:27px;letter-spacing:.13em}\r\n #fourth-workshop-panel .fdw-heading .fdw-eyebrow{font-size:8px;letter-spacing:.15em;margin-bottom:2px}\r\n #fourth-workshop-panel .fdw-heading>button{padding:8px 4px;min-height:44px;font-size:12px;gap:5px}\r\n #fourth-workshop-panel .fdw-heading>button svg{width:16px;height:16px}\r\n #fourth-workshop-panel .fdw-heading::after{left:18px;width:32px}\r\n #fourth-workshop-panel .fdw-tabs{gap:8px!important;padding:17px 6px 12px!important}\r\n #fourth-workshop-panel .fdw-tabs>button{flex-direction:column!important;justify-content:center!important;gap:5px!important;padding:9px 2px!important;min-height:62px!important;font-size:12px!important;line-height:1.2;letter-spacing:.08em}\r\n #fourth-workshop-panel .fdw-tabs>button[aria-current=page]::before{left:-7px;top:16px;bottom:16px}\r\n #fourth-workshop-panel .fdw-tabs svg{width:20px;height:20px}\r\n #fourth-workshop-panel .fdw-nav-full{display:none}\r\n #fourth-workshop-panel .fdw-nav-short{display:block}\r\n #fourth-workshop-panel .fdw-rail-end{padding-top:16px}\r\n #fourth-workshop-panel .fdw-body{padding:20px 18px 28px;scroll-padding:16px}\r\n #fourth-workshop-panel .fdw-notice{padding-inline:18px;font-size:12px}\r\n #fourth-workshop-panel .fdw-intro{margin-bottom:18px;padding-bottom:17px;gap:0}\r\n #fourth-workshop-panel .fdw-intro h2{font-size:25px;letter-spacing:.04em;margin-block:4px 7px}\r\n #fourth-workshop-panel .fdw-intro .fdw-eyebrow{font-size:8px;letter-spacing:.14em}\r\n #fourth-workshop-panel .fdw-intro p{font-size:13px;line-height:1.8}\r\n #fourth-workshop-panel .fdw-stamp{position:absolute;right:0;top:-4px;width:76px;height:76px;opacity:.08;margin:0;z-index:-1}\r\n #fourth-workshop-panel [data-fdw-search]{grid-template-columns:minmax(0,1fr) 58px;gap:8px;margin-bottom:19px}\r\n #fourth-workshop-panel [data-fdw-search]>input{grid-column:1/-1}\r\n #fourth-workshop-panel [data-fdw-search]>button{padding-inline:8px;font-size:13px;min-height:44px}\r\n #fourth-workshop-panel :is(input,select,textarea){font-size:16px;padding:9px 10px}\r\n #fourth-workshop-panel .fdw-grid{grid-template-columns:minmax(0,1fr);gap:13px;margin-bottom:17px}\r\n #fourth-workshop-panel .fdw-card{padding:15px 15px 9px}\r\n #fourth-workshop-panel .fdw-card::before{left:15px}\r\n #fourth-workshop-panel .fdw-card h3>button{font-size:20px!important;line-height:1.65}\r\n #fourth-workshop-panel .fdw-card p{font-size:13px;line-height:1.85;margin-bottom:16px}\r\n #fourth-workshop-panel .fdw-card footer{gap:5px;padding-top:6px}\r\n #fourth-workshop-panel .fdw-card footer button{min-height:44px}\r\n #fourth-workshop-panel .fdw-card footer small{font-size:11px}\r\n #fourth-workshop-panel .fdw-section-heading{padding-bottom:17px;margin-bottom:17px}\r\n #fourth-workshop-panel .fdw-section-heading h2{font-size:25px}\r\n #fourth-workshop-panel .fdw-section-heading p{font-size:13px}\r\n #fourth-workshop-panel .fdw-section-heading>.fdw-eyebrow{font-size:8px}\r\n #fourth-workshop-panel .fdw-actions{gap:8px;margin-block:15px}\r\n #fourth-workshop-panel .fdw-actions button{min-height:44px;padding:8px 11px;font-size:12px}\r\n #fourth-workshop-panel .fdw-form-grid{grid-template-columns:minmax(0,1fr);gap:16px;margin-bottom:16px}\r\n #fourth-workshop-panel .fdw-form-section{margin-top:20px;padding-bottom:18px}\r\n #fourth-workshop-panel .fdw-form-section h3{font-size:21px;gap:10px}\r\n #fourth-workshop-panel [name=content]{min-height:300px}\r\n #fourth-workshop-panel [name=package]{font-size:14px;min-height:400px}\r\n #fourth-workshop-panel .fdw-editor-actions{display:grid;grid-template-columns:1fr 1fr}\r\n #fourth-workshop-panel .fdw-editor-actions>button{min-width:0}\r\n #fourth-workshop-panel .fdw-note{font-size:12px;line-height:1.95}\r\n #fourth-workshop-panel .fdw-detail h2{font-size:26px;line-height:1.6}\r\n #fourth-workshop-panel .fdw-detail dl{grid-template-columns:52px minmax(0,1fr);gap:10px 12px;font-size:13px}\r\n #fourth-workshop-panel .fdw-detail pre{font-size:14px;line-height:2}\r\n #fourth-workshop-panel .fdw-detail .fdw-actions{display:grid;grid-template-columns:minmax(0,1fr)}\r\n #fourth-workshop-panel .fdw-detail .fdw-actions button{text-align:center}\r\n #fourth-workshop-panel .fdw-guide-steps>li{padding:17px 0 17px 30px}\r\n #fourth-workshop-panel .fdw-guide-steps>li::before{font-size:12px;top:24px}\r\n #fourth-workshop-panel .fdw-guide-steps b{font-size:21px}\r\n #fourth-workshop-panel .fdw-guide-steps p{font-size:13px}\r\n #fourth-workshop-panel .fdw-guide-example dl{grid-template-columns:minmax(0,1fr);gap:6px;font-size:13px}\r\n #fourth-workshop-panel .fdw-guide-example dd{margin-bottom:13px}\r\n #fourth-workshop-panel .fdw-empty{padding:23px 3px}\r\n #fourth-workshop-panel .fdw-empty b{font-size:21px}\r\n}\r\n/* The older phone host ships horizontal workshop rules with !important.\r\n   This owned-page boundary takes precedence only while this workshop is open. */\r\n@media(max-width:740px){\r\n #aelderan-unified-shell[data-fdw-opened][data-theme][data-aeu-phone-edition] #fourth-workshop-panel .fdw-tabs{gap:8px!important;padding:17px 6px 12px!important;overflow:auto!important;background:linear-gradient(90deg,#080f141f,#bfa87805)!important;border-bottom:0!important}\r\n #aelderan-unified-shell[data-fdw-opened][data-theme][data-aeu-phone-edition] #fourth-workshop-panel .fdw-tabs>button{min-height:62px!important;padding:9px 2px!important;gap:5px!important;border:1px solid transparent!important;border-radius:2px!important;color:var(--fdw-muted)!important;font-size:12px!important;line-height:1.2!important;box-shadow:none!important}\r\n #aelderan-unified-shell[data-fdw-opened][data-theme][data-aeu-phone-edition] #fourth-workshop-panel .fdw-tabs>button[aria-current=page]{color:var(--fdw-gold)!important;border-color:var(--fdw-line)!important;background:linear-gradient(100deg,#bda37025,#bda37007)!important;box-shadow:none!important}\r\n #aelderan-unified-shell[data-fdw-opened][data-theme][data-aeu-phone-edition] #fourth-workshop-panel .fdw-body{padding:20px 18px 28px!important}\r\n #aelderan-unified-shell[data-fdw-opened][data-theme][data-aeu-phone-edition] #fourth-workshop-panel .fdw-intro{padding:0 0 17px!important;margin-bottom:18px!important;gap:0!important}\r\n #aelderan-unified-shell[data-fdw-opened][data-theme][data-aeu-phone-edition] #fourth-workshop-panel .fdw-grid{margin:0 0 17px!important;gap:13px!important}\r\n #aelderan-unified-shell[data-fdw-opened][data-theme][data-aeu-phone-edition] #fourth-workshop-panel .fdw-card{padding:15px 15px 9px!important}\r\n #aelderan-unified-shell[data-fdw-opened][data-theme][data-aeu-phone-edition] #fourth-workshop-panel .fdw-card h3>button{font:500 20px/1.65 var(--fdw-title)!important}\r\n #aelderan-unified-shell[data-fdw-opened][data-theme][data-aeu-phone-edition] #fourth-workshop-panel .fdw-empty{padding:23px 3px!important}\r\n}\r\n@media(max-width:359px){\r\n #aelderan-unified-shell #fourth-workshop-panel{grid-template-columns:56px minmax(0,1fr)}\r\n #fourth-workshop-panel .fdw-tabs{padding-inline:5px!important}\r\n #fourth-workshop-panel .fdw-tabs>button{font-size:11px!important;min-height:60px!important}\r\n #fourth-workshop-panel .fdw-body{padding-inline:16px}\r\n #fourth-workshop-panel .fdw-heading{padding-inline:16px}\r\n #fourth-workshop-panel .fdw-heading h1{font-size:25px}\r\n #fourth-workshop-panel .fdw-card{padding-inline:13px}\r\n #fourth-workshop-panel .fdw-intro h2{font-size:23px}\r\n}\r\n@media(prefers-reduced-motion:reduce){#fourth-workshop-panel *,#fourth-workshop-panel *::before{transition:none!important;animation:none!important}}\r\n\r\n/* Async confirmation: native parent-window confirm can block embedded browsers. */\r\n#fourth-workshop-confirm{position:fixed;inset:0;z-index:2147483647;display:grid;place-items:center;padding:18px;background:#071014a8;backdrop-filter:blur(5px)}\r\n#fourth-workshop-confirm section{box-sizing:border-box;width:min(460px,100%);padding:24px;background:#182327;color:#e5dfcd;border:1px solid #a99262;box-shadow:0 22px 80px #0008;font:15px/1.7 Georgia,\"Noto Serif SC\",serif}\r\n#fourth-workshop-confirm h2{margin:0 0 15px;font-size:21px;font-weight:500;color:#dbc393}\r\n#fourth-workshop-confirm p{white-space:pre-wrap;overflow-wrap:anywhere;margin:0 0 22px}\r\n#fourth-workshop-confirm section>div{display:flex;justify-content:flex-end;gap:12px}\r\n#fourth-workshop-confirm button{min-height:42px;min-width:88px;padding:8px 16px;border:1px solid #8c825f;border-radius:3px;background:#253235;color:#eee5cf;cursor:pointer;font:inherit}\r\n#fourth-workshop-confirm [data-fdw-confirm=accept]{background:#75613e;border-color:#c1ab78}\r\n#fourth-workshop-confirm button:focus-visible{outline:2px solid #eadbb4;outline-offset:3px}\r\n";
/* Optional companion script. Adds an owned page to the existing shell; original
 * navigation, formal variables and world simulation remain with their owners. */
(async () => {
  'use strict';
  const host = window.parent || window, doc = host.document, C = globalThis.FourthWorkshopCore;
  const KEY = '__FOURTH_WORKSHOP__'; host[KEY]?.dispose?.();
  const initializing={cancelled:false,dispose(){this.cancelled=true;}};host[KEY]=initializing;
  const pageView=globalThis.FourthWorkshopView.create(doc);
  let offline=false,advanced=false,disposed=false, opened=false, busy=false, tab='browse', detail=null, page=0, query='', category='', notice='', entries=[], book='', generation=0, shell, panel, button;
  const config=globalThis.FourthWorkshopConfig || {}, samples=globalThis.FourthWorkshopSamples || [];
  const api = name => { const fn=globalThis[name] || host.TavernHelper?.[name]; C.assert(typeof fn==='function', `当前酒馆助手缺少 ${name}，请升级后再操作。`); return fn; };
  const ctx = () => host.SillyTavern?.getContext?.() || {};
  const owner = () => {const c=ctx(); C.assert(c.characterId != null && !c.groupId,'请打开第四天灾的单人角色聊天。');return String(c.characters?.[c.characterId]?.avatar || c.characterId);};
  const identity = () => JSON.stringify([owner(),ctx().getCurrentChatId?.() || '']);
  const esc = v => String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const database=await new Promise((resolve,reject)=>{const r=host.indexedDB.open('fourth-disaster-workshop-v1',1);r.onupgradeneeded=()=>r.result.createObjectStore('values');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(Error('工坊存储无法打开，请检查浏览器保存数据的权限。'));});
  if(initializing.cancelled||host[KEY]!==initializing){database.close();return;}
  const store={get:key=>new Promise((resolve,reject)=>{const r=database.transaction('values').objectStore('values').get(key);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);}),set:(key,value)=>write(key,value),remove:key=>write(key,undefined)};
  function write(key,value){return new Promise((resolve,reject)=>{const t=database.transaction('values','readwrite');if(value===undefined)t.objectStore('values').delete(key);else t.objectStore('values').put(value,key);t.oncomplete=resolve;t.onerror=t.onabort=()=>reject(Error('保存失败，原数据仍保留。'));});}
  const persist=async name=>{const c=ctx();C.assert(typeof c.loadWorldInfo==='function'&&typeof c.saveWorldInfo==='function','当前酒馆缺少立即保存世界书的接口。');await c.saveWorldInfo(name,await c.loadWorldInfo(name),true);};
  const manager=globalThis.FourthWorkshopManager.create({api,owner,identity,store,persist,lock:(key,fn)=>host.navigator.locks?host.navigator.locks.request(key,fn):fn()});
  let rawDraft=await store.get('draftRaw')||'';
  let service=await store.get('service') || config.service || '', token=await store.get('token') || '', draft=await store.get('draft') || null, login=await store.get('login') || null, account=null, items=[], lastIdentity='', checking=false;
  if(rawDraft)advanced=true;
  if(initializing.cancelled||host[KEY]!==initializing){database.close();return;}
  const download=(value,name)=>{const u=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'})),a=doc.createElement('a');a.href=u;a.download=name.replace(/[\\/:*?"<>|]/g,'_')+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(u),2000);};
  async function remote(action,data,params={},credential=token){C.assert(service,'先到「账号与连接」填写工坊服务地址。');const u=new URL('/api/workshop',service);u.search=new URLSearchParams({action,...params});const r=await fetch(u,{method:data?'POST':'GET',headers:{...(data?{'Content-Type':'application/json'}:{}),...(credential?{Authorization:'Bearer '+credential}:{})},...(data?{body:JSON.stringify(data)}:{}),signal:AbortSignal.timeout(20000)});const result=await r.json();C.assert(r.ok,result.error||'共享服务请求失败。');return result;}
  function status(message){notice=message;const n=panel?.querySelector('[data-fdw-notice]');if(n)n.textContent=message;}
  async function run(fn){if(busy)return;busy=true;panel?.setAttribute('aria-busy','true');try{await fn();}catch(e){status(e.message||String(e));}finally{busy=false;panel?.setAttribute('aria-busy','false');}}
  let pendingConfirm=null;
  function confirmAction(message){
    pendingConfirm?.(false);
    return new Promise(resolve=>{
      const previous=doc.activeElement,layer=doc.createElement('div');layer.id='fourth-workshop-confirm';
      layer.innerHTML='<section role="alertdialog" aria-modal="true" aria-labelledby="fdw-confirm-title" aria-describedby="fdw-confirm-text"><h2 id="fdw-confirm-title">确认工坊操作</h2><p id="fdw-confirm-text"></p><div><button type="button" data-fdw-confirm="cancel">取消</button><button type="button" data-fdw-confirm="accept">确认操作</button></div></section>';
      layer.querySelector('p').textContent=message;
      const finish=value=>{if(pendingConfirm!==finish)return;pendingConfirm=null;layer.remove();previous?.isConnected&&previous.focus?.();resolve(value);};pendingConfirm=finish;
      layer.addEventListener('click',e=>{const control=e.target.closest('[data-fdw-confirm]');if(control)finish(control.dataset.fdwConfirm==='accept');else if(e.target===layer)finish(false);});
      layer.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();finish(false);}if(e.key==='Tab'){const choices=[...layer.querySelectorAll('button')],at=choices.indexOf(doc.activeElement);e.preventDefault();choices[(at+(e.shiftKey?-1:1)+choices.length)%choices.length].focus();}});
      doc.body.append(layer);layer.querySelector('button').focus();
    });
  }
  const btn=(action,label,id='',extra='')=>`<button type="button" data-fdw-action="${action}" data-id="${esc(id)}" ${extra}>${label}</button>`;
  const symbols={browse:'<path d="m12 3 8 4-8 4-8-4Zm-8 9 8 4 8-4M4 17l8 4 8-4"/>',installed:'<path d="M4 8h16v12H4zM3 4h18v4H3zM9 12h6M12 12v5"/>',editor:'<path d="m15 4 5 5-10 10-7 2 2-7ZM13 6l5 5M4 4h5M4 8h3"/>',guide:'<path d="M12 5C8 2 3 4 3 4v15s5-2 9 1c4-3 9-1 9-1V4s-5-2-9 1Zm0 0v15"/>',mine:'<path d="M6 3h9l4 4v14H6ZM14 3v5h5M9 12h7M9 16h5"/>',account:'<circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2M5 21h14"/>',return:'<path d="m10 6-6 6 6 6M4 12h16"/>'};
  const icon=name=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${symbols[name]||symbols.browse}</svg>`;
  const tabs=[['browse','发现作品','发现'],['installed','已安装','安装'],['editor','创作台','创作'],['guide','上传教程','教程'],['mine','我的发布','发布'],['account','账号与连接','连接']];
  function newDraft(){return {format:C.FORMAT,id:crypto.randomUUID(),version:1,title:'',summary:'',category:'奇遇',tags:[],target:'fourth-disaster/3.2',compatibility:'第四天灾 3.2 · 内容扩展',dependencies:'无',entries:[{id:crypto.randomUUID(),name:'奇遇-未命名',content:'',strategy:{type:'selective',keys:[]}}]};}
  function capture(){
    if(tab!=='editor')return;
    if(panel?.querySelector('[name=title]')){
      const val=n=>panel.querySelector('[name='+n+']')?.value||'';
      draft={...draft,title:val('title'),summary:val('summary'),category:val('category'),tags:val('tags').split(/[,，]/).map(x=>x.trim()).filter(Boolean),compatibility:val('compatibility'),dependencies:val('dependencies')};
      draft.entries=[{...draft.entries[0],name:val('entryName'),content:val('content'),strategy:{...draft.entries[0].strategy,type:val('trigger'),keys:[...val('keys').split(/[,，]/).map(x=>x.trim()).filter(Boolean),...(draft.entries[0].strategy?.keys||[]).filter(x=>typeof x!=='string')]}}];
      rawDraft=JSON.stringify(draft,null,2);return Promise.all([store.set('draft',draft),store.set('draftRaw',rawDraft)]);
    }
    const box=panel?.querySelector('[name=package]');if(!box)return;
    rawDraft=box.value;const saved=store.set('draftRaw',rawDraft);
    try{draft=JSON.parse(rawDraft);}catch{return saved;}
    return Promise.all([saved,store.set('draft',draft)]);
  }
  async function refresh(){const n=++generation,view=tab;status('正在读取…');try{
    if(view==='browse'){items=service&&!offline?(await remote('list',null,{q:query,page:String(page),category})).items:samples.filter(p=>(!category||p.category===category)&&(!query||C.stringify(p).includes(query)));}
    if(view==='mine')items=(await remote('mine')).items;
    if(view==='installed'){const data=await manager.list();book=data.book;entries=data.entries;}
    if(n!==generation||view!==tab||disposed)return;notice='';render();
  }catch(e){if(n===generation)status(e.message);}}
  function card(p){return `<article class="fdw-card" data-kind="${esc(p.category)}"><div class="fdw-card-cap"><span>${esc(p.category)}</span><small>v${p.version}${p.status==='withdrawn'?' · 已撤回':''}</small></div><h3><button type="button" data-fdw-action="detail" data-id="${esc(p.id)}">${esc(p.title)}</button></h3><p>${esc(p.summary||'暂无简介')}</p><footer><small>${esc(p.author||'离线示例')}</small>${btn('detail','查看作品 <span aria-hidden="true">→</span>',p.id)}${tab==='mine'&&p.status!=='withdrawn'?btn('withdraw','撤回',p.id):''}</footer></article>`;}
  const itemHints={
    武器:'名称、数量、单件重量、品质、伤害、描述与效果；武器类型选近战、远程、法器或盾牌。取得后对应 MVU 分类「武器」。不要写成已经放进主角行囊。',
    装备:'防具请写名称、数量、单件重量、品质、描述、效果；护甲类型为轻甲、中甲或重甲，部位为头盔、上甲、手甲、腿甲或靴甲。取得后对应 MVU 分类「防具」，装备栏与行囊分开记录。',
    饰品:'写名称、数量、单件重量、品质、描述、效果和佩戴限制。取得后对应 MVU 分类「饰品」；放入行囊和实际佩戴是两回事。',
    特殊物品:'可写钥匙、任务信物、材料、药剂等，并说明来源、用途、消耗方式与限制。MVU 分类按实际用途选消耗品、材料或杂物，不新增「特殊物品」变量分类。'
  };
  const itemHint=kind=>itemHints[kind]||'';
  function editorForm(){
    if(!draft)draft=newDraft();if(advanced||!Array.isArray(draft.entries)||draft.entries.length!==1||draft.entries[0].strategy?.type==='vectorized')return '<label class="fdw-editor-label">完整作品包 JSON<textarea name="package" spellcheck="false" aria-label="作品包 JSON">'+esc(rawDraft||JSON.stringify(draft,null,2))+'</textarea></label>';
    const e=draft.entries[0],field=(name,label,value,area=false)=>'<label>'+label+(area?'<textarea name="'+name+'">'+esc(value)+'</textarea>':'<input name="'+name+'" value="'+esc(value)+'">')+'</label>';
    return '<section class="fdw-form-section"><h3><span>01</span>作品档案</h3><div class="fdw-form-grid">'+field('title','作品名称',draft.title)+'<label>内容类别<select name="category">'+C.KINDS.map(k=>'<option '+(draft.category===k?'selected':'')+'>'+k+'</option>').join('')+'</select></label>'+field('summary','作品简介',draft.summary,true)+field('tags','标签（逗号分隔）',(draft.tags||[]).join(', '))+field('compatibility','适用说明',draft.compatibility)+field('dependencies','依赖说明',draft.dependencies)+'</div></section><section class="fdw-form-section"><h3><span>02</span>世界书条目</h3><div class="fdw-form-grid">'+field('entryName','条目名称',e.name)+'<label>触发方式<select name="trigger"><option value="selective" '+(e.strategy?.type!=='constant'?'selected':'')+'>关键词</option><option value="constant" '+(e.strategy?.type==='constant'?'selected':'')+'>常驻</option></select></label></div>'+field('keys','触发关键词（逗号分隔）',(e.strategy?.keys||[]).filter(x=>typeof x==='string').join(', '))+field('content','设定正文',e.content,true)+'<p class="fdw-note" data-fdw-item-hint>'+esc(itemHint(draft.category))+'</p></section>';
  }
  function uploadGuide(){return `<section class="fdw-guide"><div class="fdw-section-heading"><span class="fdw-eyebrow">CREATOR'S GUIDE</span><h2>把你的设定带进世界</h2><p>先在创作台填写作品，预览无误后，再选择导出分享或在线发布。</p></div><ol class="fdw-guide-steps"><li><b>新建作品</b><p>进入「创作台」→「新建作品」。填写名称、简介和类别；武器、防具、饰品、特殊道具分别选「武器」「装备」「饰品」「特殊物品」；玩家选「玩家」，原住民选「NPC」。</p></li><li><b>写清条目与关键词</b><p>条目名称建议使用「武器-名称」「玩家-昵称」「NPC-姓名」。关键词填写实际会在对话出现的名称，多个词用逗号分隔；通常选「关键词」，不必设为常驻。</p></li><li><b>填写设定正文</b><p>写身份、外观、地点、性格或用途，以及限制。不要填写 API 密钥、聊天记录、执行代码或变量更新指令。作品只是设定，不代表已经获得装备、遇见角色或领到奖励。</p></li><li><b>保存与上传</b><p>「保存草稿」只保存在当前浏览器；「校验并导出」生成可分享的 JSON。在线上传先到「账号与连接」登录 Discord，再点「发布新版本」；公开的是当前作品包，已发布作品在「我的发布」中查看。</p></li><li><b>安装、更新与撤回</b><p>打开作品→「预览安装 / 更新」，内容会写入本角色独立扩展世界书，新增默认停用。检查后到「已安装」启用。改稿请从「我的发布」打开原作品并「编辑新版本」，保留编号；「撤回」会从公开目录隐藏，已安装内容仍保留，需另外卸载。</p></li></ol><details class="fdw-guide-example"><summary>设定正文怎么写？</summary><dl><dt>武器</dt><dd>武器-雾港短剑：普通铁制短剑，护手缠着灰布。雾港铁匠铺可按正常价格购买，无附魔；伤害与重量由正文和正式规则判定，不自动加入行囊。</dd><dt>装备 / 饰品 / 特殊物品</dt><dd>装备按 ZOD 防具字段写护甲类型、护甲部位和敏捷调修；饰品写佩戴部位、效果与限制；钥匙、任务信物等按消耗品、材料或杂物记录。通用信息包含名称、数量、单件重量、品质与描述。效果使用文字列表，不写执行代码。安装只增加设定，实际取得后由正文与 MVU 写入物品栏；穿戴另行记录。</dd><dt>玩家</dt><dd>玩家-拾灯：喜欢采集和跑图的新玩家，通常傍晚上线，近期在自由城邦寻找采药队友。性格耐心，对主角尚不认识，没有预设公会职务。</dd><dt>NPC</dt><dd>NPC-米蕾：自由城邦的修补匠，白天在东街摆摊，擅长修补旧皮甲。说话直接，按材料和工时收费；不预设已接触、已交易或对主角的好感。</dd></dl></details><p class="fdw-note">单条正文最多 100 KiB；作品包最多 1 MiB、1–100 条。普通表单编辑一条，多条合集使用「完整包 JSON」。后台若手动选择世界书，安装后请把扩展书加入读取范围。</p></section>`;}
  function render(){if(!panel||disposed)return;let body='';
    if(detail)body=`<div class="fdw-detail"><div class="fdw-detail-back">${btn('back','← 返回作品图录')}</div><div class="fdw-eyebrow">${esc(detail.category)} / VERSION ${detail.version}</div><h2>${esc(detail.title)}</h2><p>${esc(detail.summary)}</p><dl><dt>适用</dt><dd>${esc(detail.compatibility)}</dd><dt>依赖</dt><dd>${esc(detail.dependencies)}</dd><dt>安装目标</dt><dd>本角色独立扩展世界书，新增条目默认停用</dd></dl>${detail.entries.map(e=>`<details open><summary>${esc(e.name)} <small>${e.strategy.type==='constant'?'常驻':'关键词'}</small></summary><pre>${esc(e.content)}</pre></details>`).join('')}<div class="fdw-actions">${btn('install','预览安装 / 更新','','class="fdw-primary"')}${btn('export','导出 JSON')}${btn('installOverwrite','更新并覆盖本地修改')}${btn('fork',tab==='mine'?'编辑新版本':'另存为我的草稿')}${btn('back','返回列表')}</div></div>`;
    else if(tab==='browse'||tab==='mine')body=`<section class="fdw-intro"><div><div class="fdw-eyebrow">${tab==='mine'?'MY COLLECTION':'COMMUNITY CREATIONS'}</div><h2>${tab==='mine'?'我的发布':'共筑艾尔德兰'}</h2><p>${tab==='mine'?'在这里管理你分享给世界的设定。':service&&!offline?'寻找故事、人物与远方，让冒险有新的可能。':'离线图录 · 预览示例，或导入你珍藏的作品。'}</p></div><div class="fdw-stamp" aria-hidden="true"><svg viewBox="0 0 120 120" fill="none" stroke="currentColor"><circle cx="60" cy="60" r="46"/><circle cx="60" cy="60" r="38"/><path d="M60 7v16m0 74v16M7 60h16m74 0h16M27 27l9 9m48 48 9 9M27 93l9-9m48-48 9-9M60 26l9 25 25 9-25 9-9 25-9-25-25-9 25-9Z"/><path d="m60 45 15 15-15 15-15-15Z"/></svg></div></section><form data-fdw-search><input name="query" aria-label="搜索作品" placeholder="搜索作品、作者或标签" value="${esc(query)}"><select name="category" aria-label="作品类别"><option value="">全部类别</option>${C.KINDS.map(k=>`<option ${category===k?'selected':''}>${k}</option>`).join('')}</select><button type="submit">查找</button></form><div class="fdw-list-heading"><span>${tab==='mine'?'已发布作品':'作品图录'}</span><small>${offline?'离线示例':'在线目录'}</small></div><div class="fdw-grid">${items.length?items.map(card).join(''):'<div class="fdw-empty"><b>书页尚待书写</b><p>还没有找到作品，试试其他关键词，或导入一份内容包。</p></div>'}</div><div class="fdw-actions">${service&&page?btn('prev','上一页'):''}${service&&!offline?`<small>第 ${page+1} 页</small>`:''}${service&&items.length===20?btn('next','下一页'):''}${btn('refresh','刷新')}${btn(offline?'online':'offline',offline?'返回在线目录':'查看离线示例')}${btn('import','导入作品')}</div>`;
    else if(tab==='installed'){const groups=new Map();entries.forEach(e=>{const m=e.extra?.[C.MARK];if(m){if(!groups.has(m.packageId))groups.set(m.packageId,[]);groups.get(m.packageId).push(e);}});body=`<div class="fdw-section-heading"><span class="fdw-eyebrow">YOUR LIBRARY</span><h2>我的扩展内容</h2><p>${esc(book||'尚未连接扩展世界书')}</p></div><div class="fdw-actions">${btn('prepare','创建 / 重新绑定扩展书')}${btn('refresh','刷新')}${btn('backup','导出恢复备份')}${btn('restore','恢复上次操作')}</div><p class="fdw-note">扩展书绑定在当前角色；该角色的其他聊天也会读取其中的启用条目。若后台已手选世界书，请把此扩展书加入所选范围。</p>${[...groups].map(([id,list])=>`<article class="fdw-installed"><div><h3>${esc(list[0].extra[C.MARK].title)}</h3><p>${list.length} 条 · 启用 ${list.filter(e=>e.enabled).length} 条 · 版本 ${[...new Set(list.map(e=>e.extra[C.MARK].version))].join(' / ')}</p></div><div class="fdw-actions">${btn('enable','启用',id)}${btn('disable','停用',id)}${btn('update','检查更新',id)}${btn('uninstall','卸载',id)}</div></article>`).join('')||'<div class="fdw-empty"><b>收藏从一段故事开始</b><p>在发现作品中挑选设定，预览后再决定是否安装。</p></div>'}`;}
    else if(tab==='editor')body=`<div class="fdw-section-heading"><span class="fdw-eyebrow">CREATOR’S DESK</span><h2>作品编辑台</h2><p>把人物、地点与故事，写成可以分享的世界设定。</p></div><details class="fdw-toolbox"><summary>作品工具</summary><div class="fdw-actions">${btn('new','新建作品')}${btn('import','导入作品')}${btn('advanced',advanced?'返回表单':'完整包 JSON')}${btn('exportDraft','校验并导出')}</div></details>${editorForm()}<div class="fdw-actions fdw-editor-actions">${btn('saveDraft','保存草稿')}${btn('publish','发布新版本','','class="fdw-primary"')}</div><p class="fdw-note">格式：${C.FORMAT}。推荐条目名前缀：武器-、装备-、饰品-、物品-、玩家-、NPC-、生物-。地图标记和数值结算不由内容包自动创建。</p>`;
    else if(tab==='guide')body=uploadGuide();
    else body=`<div class="fdw-section-heading"><span class="fdw-eyebrow">WAYFARER’S SEAL</span><h2>账号与连接</h2><p>${account?'已登录 · '+esc(account.name):'浏览、导入、安装与离线创作无需登录。发布作品使用 Discord 身份。'}</p></div><label>共享服务地址<input name="service" type="url" placeholder="https://你的工坊地址" value="${esc(service)}"></label><div class="fdw-actions">${btn('service','保存并检查连接')}${btn('login',login?'重新打开 Discord 登录':'登录 Discord','','class="fdw-primary"')}${btn('logout','退出登录')}${login?btn('cancelLogin','取消等待'):''}</div>${login?.url?`<p class="fdw-note">登录窗口没出现？<a href="${esc(login.url)}" target="_blank" rel="noopener noreferrer">点击打开 Discord 授权页面 ↗</a>。授权完成后返回此页即可。</p>`:''}<p class="fdw-note">凭据、草稿与操作备份保存在当前浏览器，不随脚本或角色卡导出。已安装条目保存在酒馆世界书。</p>`;
    panel.dataset.view=tab;panel.dataset.detail=String(!!detail);
    panel.innerHTML=`<header class="fdw-heading"><div><span class="fdw-eyebrow">AELDERAN / WORKSHOP</span><h1>创意工坊</h1></div>${btn('close',icon('return')+'<span>返回冒险</span>','','aria-label="返回冒险"')}</header><nav class="fdw-tabs" aria-label="工坊功能">${tabs.map(([id,label,short])=>`<button type="button" data-fdw-tab="${id}" aria-label="${label}" title="${label}" aria-current="${tab===id?'page':'false'}">${icon(id)}<span class="fdw-nav-full">${label}</span><span class="fdw-nav-short" aria-hidden="true">${short}</span></button>`).join('')}<span class="fdw-rail-end" aria-hidden="true">◆</span></nav><div class="fdw-stage"><output class="fdw-notice" data-fdw-notice role="status">${esc(notice)}</output><div class="fdw-body">${body}</div></div><input type="file" data-fdw-file accept=".json,application/json" hidden>`;
  }
  async function install(mode='keep'){const p=C.normalize(detail),preview=await manager.preview(p),n=preview.added.length,u=preview.owned.length;
    if(!await confirmAction(`《${p.title}》v${p.version}\n目标：${preview.book}\n新增 ${n} 条，已有 ${u} 条，本地修改 ${preview.conflicts.length} 条，新版移除 ${preview.removed.length} 条。\n新增默认停用。${mode==='overwrite'?'将覆盖该作品的本地修改，并删除作者新版移除的条目。':'本地改动及新版移除的旧条目保留。'}\n确认安装 / 更新？`))return;
    await manager.install(p,{mode,enabled:false});tab='installed';detail=null;await refresh();status('安装已保存并回读确认。新增条目保持停用，可在这里启用。');
  }
  async function importFile(file){C.assert(file&&file.size<=1048576,'请选择不超过 1 MiB 的 JSON 作品包。');detail=C.normalize(JSON.parse(await file.text()));render();status('校验通过。预览不会安装或启用内容。');}
  async function action(name,id){
    if(name==='advanced'){await capture();if(advanced&&rawDraft){try{const parsed=JSON.parse(rawDraft);C.assert(Array.isArray(parsed.entries)&&parsed.entries.length===1,'多条作品请使用完整包编辑。');draft=parsed;}catch(e){throw Error('草稿已保留；'+e.message);}}advanced=!advanced;render();return;}
    if(name==='offline'||name==='online'){offline=name==='offline';page=0;detail=null;await refresh();return;}
    if(name==='installOverwrite'){await install('overwrite');return;}
    if(name==='close'){close();return;}if(name==='refresh'){await refresh();return;}
    if(name==='import'){panel.querySelector('[data-fdw-file]').click();return;}
    if(name==='detail'||name==='update'){detail=service&&!offline?(await remote('detail',null,{id})).package:samples.find(p=>p.id===id);C.assert(detail,'当前离线目录没有此作品。');detail=C.normalize(detail);render();return;}
    if(name==='back'){detail=null;render();return;}if(name==='prev'||name==='next'){page+=name==='next'?1:-1;await refresh();return;}
    if(name==='withdraw'){if(await confirmAction('撤回此作品？公开列表会移除，已安装内容保留。')){await remote('withdraw',{id});await refresh();status('作品已撤回。');}return;}
    if(name==='export'){download(C.normalize(detail),detail.title);return;}
    if(name==='fork'){draft=tab==='mine'?C.clone(detail):{...C.clone(detail),id:crypto.randomUUID(),version:1,title:detail.title+' · 我的改编'};if(tab==='mine')await store.set('base:'+draft.id,draft.version);rawDraft='';advanced=false;await store.remove('draftRaw');await store.set('draft',draft);tab='editor';detail=null;render();return;}
    if(name==='new'){await capture();draft=newDraft();rawDraft='';advanced=false;await store.remove('draftRaw');await store.set('draft',draft);render();return;}
    if(['saveDraft','exportDraft','publish'].includes(name)){await capture();const raw=panel.querySelector('[name=package]')?.value;if(raw!=null)draft=JSON.parse(raw);await store.set('draft',draft);if(name==='saveDraft'){status('草稿已保存到当前浏览器。');return;}const p=C.normalize(draft);if(name==='exportDraft'){download(p,p.title);status('作品包校验通过并已导出。');return;}C.assert(token,'请先到账号页登录 Discord。');if(!await confirmAction(`公开发布《${p.title}》的 ${p.entries.length} 条内容？只上传这份作品包。`))return;const r=await remote('publish',{package:p,baseVersion:await store.get('base:'+p.id)||0});draft=r.package;rawDraft=JSON.stringify(draft,null,2);await store.set('draftRaw',rawDraft);await store.set('base:'+p.id,draft.version);await store.set('draft',draft);render();status('发布成功，版本 '+draft.version);return;}
    if(name==='prepare'){if(!await confirmAction('创建或重新绑定本角色专用的扩展世界书？核心世界书保持原样；启用条目也会影响此角色的其他聊天。'))return;book=await manager.prepare(ctx().name2||'角色');await refresh();status('扩展世界书已绑定：'+book);return;}
    if(name==='install'){await install();return;}
    if(['enable','disable','uninstall'].includes(name)){if(!await confirmAction(`${name==='enable'?'启用':name==='disable'?'停用':'卸载'}该扩展包？${name==='uninstall'?'已自行修改的条目会保留为普通条目。':''}`))return;await manager.manage(id,name);await refresh();status('操作已保存并回读确认。');return;}
    if(name==='backup'){const r=await manager.recovery();C.assert(r,'当前聊天没有恢复备份。');download(r,'第四天灾工坊-恢复备份');return;}
    if(name==='restore'){if(await confirmAction('恢复上次工坊操作前的扩展世界书？如果之后有其他修改，将停止恢复。')){await manager.restore();await refresh();status('恢复已保存并回读确认。');}return;}
    if(name==='service'){const value=panel.querySelector('[name=service]').value.trim();const u=new URL(value);C.assert(u.protocol==='https:'||(u.protocol==='http:'&&['127.0.0.1','localhost'].includes(u.hostname)),'共享服务使用 HTTPS；本地调试可使用 localhost。');const result=await fetch(new URL('/api/health',u),{signal:AbortSignal.timeout(15000)});const info=await result.json();C.assert(result.ok&&info.format===C.FORMAT,'这个地址不是兼容的第四天灾工坊服务。');if(service&&service!==u.origin){token='';login=null;account=null;await store.remove('token');await store.remove('login');}service=u.origin;await store.set('service',service);status(info.discord?'服务连接成功，Discord 已配置。':'服务连接成功，服务器还未配置 Discord。');return;}
    if(name==='logout'){if(token&&service)await remote('logout',{});token='';account=null;login=null;await store.remove('token');await store.remove('login');render();status('已退出。');return;}
    if(name==='cancelLogin'){login=null;await store.remove('login');render();return;}
    if(name==='login'){C.assert(service,'请先保存共享服务地址。');const popup=host.open('about:blank','fourth-disaster-login','popup,width=540,height=760');try{const bytes=crypto.getRandomValues(new Uint8Array(32));const nextToken=Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');const proof=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(nextToken))),b=>b.toString(16).padStart(2,'0')).join('');login={token:nextToken,nonce:crypto.randomUUID(),expires:Date.now()+600000};const u=new URL('/api/discord/start',service);u.search=new URLSearchParams({proof,nonce:login.nonce,origin:host.location.origin});login.url=u.href;await store.set('login',login);if(popup)popup.location.href=u.href;render();status('在 Discord 页面授权后回到这里，登录会自动完成；窗口未出现时可点击下方授权链接。');}catch(e){popup?.close();throw e;}return;}
  }
  async function checkLogin(){if(!login||checking||doc.hidden||disposed)return;checking=true;try{if(login.expires<Date.now()){login=null;await store.remove('login');if(tab==='account')render();return;}const pending=login,r=await remote('login-status',null,{},pending.token);if(login!==pending||!r.account)return;token=pending.token;account=r.account;await store.set('token',token);await store.remove('login');login=null;if(tab==='account')render();status('Discord 登录成功。');}catch(e){if(opened)status(e.message);}finally{checking=false;}}
  function close(){pendingConfirm?.(false);pageView.close();capture()?.catch(e=>status(e.message));opened=false;if(panel)panel.hidden=true;button?.setAttribute('aria-pressed','false');}
  function open(){mount();C.assert(panel,'请先启用并打开第四天灾统一面板，再使用工坊。');if(shell.hidden)doc.getElementById('aeu-launcher')?.click();pageView.open(shell);opened=true;panel.hidden=false;button.setAttribute('aria-pressed','true');render();run(refresh);}
  function click(e){const target=e.target.closest?.('[data-fdw-action],[data-fdw-tab],[data-fdw-open]');if(!target)return;if(target.hasAttribute('data-fdw-open')){e.preventDefault();e.stopPropagation();open();return;}if(!panel?.contains(target))return;e.preventDefault();if(target.dataset.fdwTab){run(async()=>{await capture();generation++;tab=target.dataset.fdwTab;page=0;detail=null;notice='';render();if(['browse','mine','installed'].includes(tab))await refresh();});}else run(()=>action(target.dataset.fdwAction,target.dataset.id));}
  function mount(){if(disposed)return;const next=doc.getElementById('aelderan-unified-shell');if(next===shell&&panel?.isConnected)return;close();pageView.dispose();panel?.remove();button?.remove();shell=next;panel=button=null;if(!shell?.querySelector('.aeu-content'))return;
    panel=doc.createElement('section');panel.id='fourth-workshop-panel';panel.hidden=true;panel.setAttribute('aria-label','第四天灾创意工坊');shell.querySelector('.aeu-content').append(panel);
    button=doc.createElement('button');button.type='button';button.dataset.fdwOpen='';button.setAttribute('aria-pressed','false');button.innerHTML='<span class="aeu-menu-medallion"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="m3 9 9-6 9 6v12H3ZM8 21v-8h8v8M3 9h18M12 3v6"/></svg></span><span>工坊</span>';const nav=shell.querySelector('.aeu-game-nav');if(nav)nav.insertBefore(button,nav.querySelector('[data-aeu-page="tools"]'));
    panel.addEventListener('submit',e=>{if(e.target.matches('[data-fdw-search]')){e.preventDefault();query=e.target.querySelector('[name=query]').value;category=e.target.querySelector('[name=category]').value;page=0;run(refresh);}});
    panel.addEventListener('change',e=>{if(e.target.matches('[data-fdw-file]'))run(()=>importFile(e.target.files[0]));if(e.target.matches('[name=category]')){const hint=panel.querySelector('[data-fdw-item-hint]');if(hint)hint.textContent=itemHint(e.target.value);}});
    panel.addEventListener('input',()=>{capture()?.catch(e=>status(e.message));});render();}
  function originalNav(e){if(opened&&e.target.closest?.('[data-aeu-page],[data-aeu-view],[data-aeu-tools]'))close();}
  const style=doc.createElement('style');style.id='fourth-workshop-css';style.textContent=globalThis.FourthWorkshopCSS || '';doc.head.append(style);
  doc.addEventListener('click',click);doc.addEventListener('click',originalNav,true);
  const timer=setInterval(()=>{mount();let next='';try{next=identity();}catch{}if(lastIdentity&&next!==lastIdentity){close();book='';entries=[];generation++;}lastIdentity=next;checkLogin();},3000);
  const dispose=()=>{if(disposed)return;close();pageView.dispose();disposed=true;clearInterval(timer);doc.removeEventListener('click',click);doc.removeEventListener('click',originalNav,true);panel?.remove();button?.remove();style.remove();database.close();window.removeEventListener('pagehide',dispose);if(host[KEY]?.dispose===dispose)delete host[KEY];};
  host[KEY]={open,close,dispose};window.addEventListener('pagehide',dispose);mount();if(token&&service)remote('me').then(r=>{account=r.account;if(tab==='account')render();}).catch(()=>{});
  if(typeof getButtonEvent==='function'&&typeof eventOn==='function')eventOn(getButtonEvent('打开第四天灾工坊'),()=>run(async()=>open()));
})().catch(e=>{console.error('[第四天灾工坊]',e);(window.parent||window).toastr?.error?.(e.message);});

})();
