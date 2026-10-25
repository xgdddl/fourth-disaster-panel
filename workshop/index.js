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
  const KINDS = ['奇遇', '副本', 'NPC', '生物', '组织', '地区'];
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
    assert(KINDS.includes(input.category), '请选择奇遇、副本、NPC、生物、组织或地区。');
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
globalThis.FourthWorkshopCSS="#fourth-workshop-panel{--fdw-ink:#e9e3d3;--fdw-muted:#a8b6b3;--fdw-line:#8b967d40;--fdw-gold:#d0b578;--fdw-paper:#132b2c;position:absolute;inset:0;z-index:8;display:flex;flex-direction:column;min-width:0;background:linear-gradient(120deg,#172c2b,#102229);color:var(--fdw-ink);font:13px/1.7 'Microsoft YaHei',sans-serif;overflow:hidden;text-align:left}\n#fourth-workshop-panel[hidden]{display:none!important}#fourth-workshop-panel *{box-sizing:border-box}#fourth-workshop-panel button,#fourth-workshop-panel input,#fourth-workshop-panel select,#fourth-workshop-panel textarea{font:inherit;color:inherit}#fourth-workshop-panel button{border:1px solid var(--fdw-line);background:#b1b2900a;border-radius:3px;padding:7px 12px;cursor:pointer}#fourth-workshop-panel button:hover{border-color:var(--fdw-gold);background:#c0a66b12}#fourth-workshop-panel button:focus-visible,#fourth-workshop-panel input:focus-visible,#fourth-workshop-panel textarea:focus-visible,#fourth-workshop-panel select:focus-visible{outline:2px solid var(--fdw-gold);outline-offset:2px}#fourth-workshop-panel .fdw-primary{background:#ac925a;border-color:#cfb77f;color:#111e20;font-weight:bold}#fourth-workshop-panel [hidden]{display:none!important}\n.fdw-heading{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:20px 28px 15px;border-bottom:1px solid var(--fdw-line)}.fdw-heading h1{font:600 26px/1.4 'SimSun','Songti SC',serif;letter-spacing:4px;margin:3px 0 0}.fdw-eyebrow{font:10px/1.6 'Bahnschrift',sans-serif;letter-spacing:2px;color:var(--fdw-gold)}.fdw-tabs{display:flex;flex-wrap:wrap;gap:6px;padding:12px 28px 0}.fdw-tabs>button[aria-current=page]{background:#b4aa7219;border-color:#b4aa72;color:#ead8a6}.fdw-notice{display:block;flex:none;padding:0 28px;color:#d9bd7a;overflow-wrap:anywhere}.fdw-notice:not(:empty){padding-top:10px;padding-bottom:10px;border-bottom:1px solid var(--fdw-line)}.fdw-body{overflow:auto;flex:1;min-height:0;padding:12px 28px 32px;overscroll-behavior:contain}.fdw-intro{display:flex;align-items:center;justify-content:space-between;gap:24px;padding:25px 0 30px;border-bottom:1px solid var(--fdw-line);margin-bottom:20px}.fdw-intro h2{font:500 30px/1.6 'SimSun',serif;margin:8px 0;color:#f0e2c2}.fdw-intro p,.fdw-section-heading p,.fdw-note{color:var(--fdw-muted);margin:6px 0;overflow-wrap:anywhere}.fdw-stamp{flex:none;width:100px;text-align:center;border:1px solid #b1a27366;padding:14px 8px;color:var(--fdw-gold);font:12px/1.5 'SimSun',serif;transform:rotate(3deg)}.fdw-stamp b{display:block;font:34px/1.2 'Georgia',serif}.fdw-stamp small{font-size:10px}.fdw-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(260px,100%),1fr));gap:16px;margin:20px 0}.fdw-card{display:flex;flex-direction:column;min-width:0;border:1px solid var(--fdw-line);background:linear-gradient(130deg,#acc3b50a,transparent);padding:20px;box-shadow:0 5px 18px #0001}.fdw-card-cap{display:flex;justify-content:space-between;font-size:11px;color:var(--fdw-gold)}.fdw-card h3{font:500 21px/1.7 'SimSun',serif;margin:12px 0 6px}.fdw-card p{color:var(--fdw-muted);margin:0 0 20px;flex:1;white-space:pre-wrap;overflow-wrap:anywhere}.fdw-card footer{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:8px;font-size:11px;color:var(--fdw-muted)}.fdw-actions{display:flex;align-items:center;flex-wrap:wrap;gap:8px;margin:15px 0}.fdw-section-heading{padding:10px 0 8px}.fdw-section-heading h2{font:500 25px/1.5 'SimSun',serif;margin:0 0 8px}.fdw-empty{padding:30px 10px;color:var(--fdw-muted)}.fdw-installed{border-top:1px solid var(--fdw-line);display:flex;flex-wrap:wrap;justify-content:space-between;gap:8px;padding:18px 0}.fdw-installed h3{margin:0;font:500 20px/1.7 'SimSun',serif}.fdw-installed p{margin:0;color:var(--fdw-muted)}.fdw-detail h2{font:500 29px/1.7 'SimSun',serif;margin:12px 0}.fdw-detail dl{display:grid;grid-template-columns:70px 1fr;border-block:1px solid var(--fdw-line);padding:15px 0;gap:6px}.fdw-detail dt{color:var(--fdw-muted)}.fdw-detail dd{margin:0;overflow-wrap:anywhere}.fdw-detail details{border-bottom:1px solid var(--fdw-line);padding:15px 0}.fdw-detail summary{cursor:pointer;font-size:16px;color:var(--fdw-gold)}.fdw-detail pre{white-space:pre-wrap;overflow-wrap:anywhere;font:13px/1.9 inherit;padding:10px 0}.fdw-detail small{font-size:10px;color:var(--fdw-muted);margin-left:12px}\n#fourth-workshop-panel input,#fourth-workshop-panel select,#fourth-workshop-panel textarea{border:1px solid var(--fdw-line);background:#07191d66;border-radius:3px;padding:9px 12px;min-width:0}#fourth-workshop-panel input{width:100%}#fourth-workshop-panel select option{background:var(--fdw-paper);color:var(--fdw-ink)}#fourth-workshop-panel [data-fdw-search]{display:flex;gap:8px}#fourth-workshop-panel [data-fdw-search]>input{flex:1}#fourth-workshop-panel textarea{display:block;width:100%;min-height:370px;resize:vertical;font:12px/1.8 'Consolas',monospace;margin-top:8px}#fourth-workshop-panel label{display:block}#fourth-workshop-panel label>input{display:block;margin:8px 0}#aelderan-unified-shell [data-fdw-open]{color:#c9bd96}#aelderan-unified-shell [data-fdw-open][aria-pressed=true]{background:#a99b6022;color:#e6d49c;border-color:#aa945e}\n#aelderan-unified-shell[data-theme=light] #fourth-workshop-panel{--fdw-ink:#283d3b;--fdw-muted:#566d68;--fdw-line:#6d806c44;--fdw-gold:#78602d;--fdw-paper:#edece0;background:linear-gradient(120deg,#eff0e6,#dedfd2)}#aelderan-unified-shell[data-theme=light] .fdw-intro h2{color:#304c43}#aelderan-unified-shell[data-theme=light] #fourth-workshop-panel input,#aelderan-unified-shell[data-theme=light] #fourth-workshop-panel textarea{background:#fff8}\n@media(max-width:600px){.fdw-heading{padding:14px 15px}.fdw-heading h1{font-size:23px}.fdw-tabs{padding:10px 15px 0;gap:5px}.fdw-tabs>button{font-size:11px!important;padding:6px 8px!important}.fdw-body{padding:10px 15px 24px}.fdw-notice{padding-inline:15px}.fdw-intro{gap:12px;padding:18px 0}.fdw-intro h2{font-size:24px}.fdw-stamp{display:none}.fdw-grid{grid-template-columns:1fr;gap:12px}.fdw-card{padding:16px}.fdw-detail h2{font-size:24px}#fourth-workshop-panel [data-fdw-search]{flex-wrap:wrap}#fourth-workshop-panel [data-fdw-search]>input{flex-basis:100%}.fdw-detail dl{grid-template-columns:52px 1fr}.fdw-heading>button{font-size:11px!important;padding:6px 8px!important}}\n.fdw-form-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px 18px;margin:12px 0}.fdw-form-grid label{min-width:0}.fdw-form-grid label:has(textarea){grid-column:1/-1}#fourth-workshop-panel .fdw-form-grid textarea{min-height:90px;font:13px/1.8 inherit}#fourth-workshop-panel [name=content]{min-height:230px}#fourth-workshop-panel .fdw-form-grid select{display:block;width:100%;margin:8px 0}@media(max-width:600px){.fdw-form-grid{grid-template-columns:1fr}}\r\n\n#aelderan-unified-shell[data-fdw-opened=true] [data-aeu-section-tabs]{display:none!important}\n/* Native forum has a high-z-index root: opening an owned page must remove its\n   old sibling from layout/hit testing, not try to cover it with a darker sheet. */\n#aelderan-unified-shell[data-fdw-opened=true] .aeu-content > [data-aeu-slot]{display:none!important;pointer-events:none!important}\n#aelderan-unified-shell[data-fdw-opened=true] :is([data-aeu-route],[data-aeu-hud],[data-aeu-identity],[data-aeu-run],[data-aeu-failure],[data-aeu-resume],[data-aeu-back]){display:none!important}\n.fdw-shell-route{display:none}\n#aelderan-unified-shell[data-fdw-opened=true] .fdw-shell-route{display:inline}\n";
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
  const btn=(action,label,id='',extra='')=>`<button type="button" data-fdw-action="${action}" data-id="${esc(id)}" ${extra}>${label}</button>`;
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
  function card(p){return `<article class="fdw-card"><div class="fdw-card-cap"><span>${esc(p.category)}</span><small>v${p.version}</small></div><h3>${esc(p.title)}</h3><p>${esc(p.summary||'暂无简介')}</p><footer><small>${esc(p.author||'离线示例')}</small>${btn('detail','查看作品 →',p.id)}${tab==='mine'?btn('withdraw','撤回',p.id):''}</footer></article>`;}
  function editorForm(){
    if(!draft)draft=newDraft();if(advanced||!Array.isArray(draft.entries)||draft.entries.length!==1||draft.entries[0].strategy?.type==='vectorized')return '<label class="fdw-editor-label">完整作品包 JSON<textarea name="package" spellcheck="false" aria-label="作品包 JSON">'+esc(rawDraft||JSON.stringify(draft,null,2))+'</textarea></label>';
    const e=draft.entries[0],field=(name,label,value,area=false)=>'<label>'+label+(area?'<textarea name="'+name+'">'+esc(value)+'</textarea>':'<input name="'+name+'" value="'+esc(value)+'">')+'</label>';
    return '<div class="fdw-form-grid">'+field('title','作品名称',draft.title)+'<label>内容类别<select name="category">'+C.KINDS.map(k=>'<option '+(draft.category===k?'selected':'')+'>'+k+'</option>').join('')+'</select></label>'+field('summary','作品简介',draft.summary,true)+field('tags','标签（逗号分隔）',(draft.tags||[]).join(', '))+field('compatibility','适用说明',draft.compatibility)+field('dependencies','依赖说明',draft.dependencies)+'</div><div class="fdw-form-grid">'+field('entryName','条目名称',e.name)+'<label>触发方式<select name="trigger"><option value="selective" '+(e.strategy?.type!=='constant'?'selected':'')+'>关键词</option><option value="constant" '+(e.strategy?.type==='constant'?'selected':'')+'>常驻</option></select></label></div>'+field('keys','触发关键词（逗号分隔）',(e.strategy?.keys||[]).filter(x=>typeof x==='string').join(', '))+field('content','设定正文',e.content,true);
  }
  function render(){if(!panel||disposed)return;let body='';
    if(detail)body=`<div class="fdw-detail"><div class="fdw-eyebrow">${esc(detail.category)} / VERSION ${detail.version}</div><h2>${esc(detail.title)}</h2><p>${esc(detail.summary)}</p><dl><dt>适用</dt><dd>${esc(detail.compatibility)}</dd><dt>依赖</dt><dd>${esc(detail.dependencies)}</dd><dt>安装目标</dt><dd>本角色独立扩展世界书，新增条目默认停用</dd></dl>${detail.entries.map(e=>`<details open><summary>${esc(e.name)} <small>${e.strategy.type==='constant'?'常驻':'关键词'}</small></summary><pre>${esc(e.content)}</pre></details>`).join('')}<div class="fdw-actions">${btn('install','预览安装 / 更新','','class="fdw-primary"')}${btn('export','导出 JSON')}${btn('installOverwrite','更新并覆盖本地修改')}${btn('fork',tab==='mine'?'编辑新版本':'另存为我的草稿')}${btn('back','返回列表')}</div></div>`;
    else if(tab==='browse'||tab==='mine')body=`<section class="fdw-intro"><div><div class="fdw-eyebrow">AELDERAN · COMMUNITY WORKSHOP</div><h2>让世界多一种可能。</h2><p>${service&&!offline?'浏览游玩者分享的内容扩展，选择属于这段冒险的故事。':'当前为离线模式。可体验示例、导入作品、创作并导出分享。'}</p></div><div class="fdw-stamp">内容扩展<br><b>Ⅰ</b><small>第四天灾 3.2</small></div></section><form data-fdw-search><input name="query" aria-label="搜索作品" placeholder="搜索作品、作者或标签" value="${esc(query)}"><select name="category" aria-label="作品类别"><option value="">全部类别</option>${C.KINDS.map(k=>`<option ${category===k?'selected':''}>${k}</option>`).join('')}</select><button>查找</button></form><div class="fdw-grid">${items.length?items.map(card).join(''):'<p class="fdw-empty">这里还没有作品。可以先导入一个内容包。</p>'}</div><div class="fdw-actions">${service&&page?btn('prev','上一页'):''}${service&&!offline?`<small>第 ${page+1} 页</small>`:''}${service&&items.length===20?btn('next','下一页'):''}${btn('refresh','刷新')}${btn(offline?'online':'offline',offline?'返回在线目录':'查看离线示例')}${btn('import','导入作品')}</div>`;
    else if(tab==='installed'){const groups=new Map();entries.forEach(e=>{const m=e.extra?.[C.MARK];if(m){if(!groups.has(m.packageId))groups.set(m.packageId,[]);groups.get(m.packageId).push(e);}});body=`<div class="fdw-section-heading"><h2>我的扩展内容</h2><p>${esc(book||'尚未连接扩展世界书')}</p></div><div class="fdw-actions">${btn('prepare','创建 / 重新绑定扩展书')}${btn('refresh','刷新')}${btn('backup','导出恢复备份')}${btn('restore','恢复上次操作')}</div><p class="fdw-note">扩展书绑定在当前角色；该角色的其他聊天也会读取其中的启用条目。若后台已手选世界书，请把此扩展书加入所选范围。</p>${[...groups].map(([id,list])=>`<article class="fdw-installed"><div><h3>${esc(list[0].extra[C.MARK].title)}</h3><p>${list.length} 条 · 启用 ${list.filter(e=>e.enabled).length} 条 · 版本 ${[...new Set(list.map(e=>e.extra[C.MARK].version))].join(' / ')}</p></div><div class="fdw-actions">${btn('enable','启用',id)}${btn('disable','停用',id)}${btn('update','检查更新',id)}${btn('uninstall','卸载',id)}</div></article>`).join('')||'<p class="fdw-empty">还没有安装扩展内容。</p>'}`;}
    else if(tab==='editor')body=`<div class="fdw-section-heading"><h2>作品编辑台</h2><p>首版支持奇遇、副本、NPC、生物、组织和地区。JSON 中的条目编号用于后续更新，请保留。</p></div><div class="fdw-actions">${btn('new','新建作品')}${btn('import','导入作品')}${btn('saveDraft','保存草稿')}${btn('advanced',advanced?'返回表单':'完整包 JSON')}${btn('exportDraft','校验并导出')}${btn('publish','发布新版本','','class="fdw-primary"')}</div>${editorForm()}<p class="fdw-note">格式：${C.FORMAT}。NPC 正文以“NPC-姓名”开头；生物以“生物-名称”开头；地区、势力或阵营建议在条目名使用相应前缀。地图标记和数值结算不由内容包自动创建。</p>`;
    else body=`<div class="fdw-section-heading"><h2>账号与连接</h2><p>${account?'已登录 · '+esc(account.name):'浏览、导入、安装与离线创作无需登录。发布作品使用 Discord 身份。'}</p></div><label>共享服务地址<input name="service" type="url" placeholder="https://你的工坊地址" value="${esc(service)}"></label><div class="fdw-actions">${btn('service','保存并检查连接')}${btn('login',login?'继续 Discord 登录':'登录 Discord','','class="fdw-primary"')}${btn('logout','退出登录')}${login?btn('cancelLogin','取消等待'):''}</div><p class="fdw-note">凭据、草稿与操作备份保存在当前浏览器，不随脚本或角色卡导出。已安装条目保存在酒馆世界书。</p>`;
    panel.innerHTML=`<header class="fdw-heading"><div><span class="fdw-eyebrow">FOURTH DISASTER</span><h1>创意工坊</h1></div>${btn('close','返回冒险 ↗')}</header><nav class="fdw-tabs" aria-label="工坊功能">${[['browse','发现作品'],['installed','已安装'],['editor','创作台'],['mine','我的发布'],['account','账号与连接']].map(([id,label])=>`<button data-fdw-tab="${id}" aria-current="${tab===id?'page':'false'}">${label}</button>`).join('')}</nav><output class="fdw-notice" data-fdw-notice role="status">${esc(notice)}</output><div class="fdw-body">${body}</div><input type="file" data-fdw-file accept=".json,application/json" hidden>`;
  }
  async function install(mode='keep'){const p=C.normalize(detail),preview=await manager.preview(p),n=preview.added.length,u=preview.owned.length;
    if(!host.confirm(`《${p.title}》v${p.version}\n目标：${preview.book}\n新增 ${n} 条，已有 ${u} 条，本地修改 ${preview.conflicts.length} 条，新版移除 ${preview.removed.length} 条。\n新增默认停用。${mode==='overwrite'?'将覆盖该作品的本地修改，并删除作者新版移除的条目。':'本地改动及新版移除的旧条目保留。'}\n确认安装 / 更新？`))return;
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
    if(name==='withdraw'){if(host.confirm('撤回此作品？公开列表会移除，已安装内容保留。')){await remote('withdraw',{id});await refresh();status('作品已撤回。');}return;}
    if(name==='export'){download(C.normalize(detail),detail.title);return;}
    if(name==='fork'){draft=tab==='mine'?C.clone(detail):{...C.clone(detail),id:crypto.randomUUID(),version:1,title:detail.title+' · 我的改编'};if(tab==='mine')await store.set('base:'+draft.id,draft.version);rawDraft='';advanced=false;await store.remove('draftRaw');await store.set('draft',draft);tab='editor';detail=null;render();return;}
    if(name==='new'){await capture();draft=newDraft();rawDraft='';advanced=false;await store.remove('draftRaw');await store.set('draft',draft);render();return;}
    if(['saveDraft','exportDraft','publish'].includes(name)){await capture();const raw=panel.querySelector('[name=package]')?.value;if(raw!=null)draft=JSON.parse(raw);await store.set('draft',draft);if(name==='saveDraft'){status('草稿已保存到当前浏览器。');return;}const p=C.normalize(draft);if(name==='exportDraft'){download(p,p.title);status('作品包校验通过并已导出。');return;}C.assert(token,'请先到账号页登录 Discord。');if(!host.confirm(`公开发布《${p.title}》的 ${p.entries.length} 条内容？只上传这份作品包。`))return;const r=await remote('publish',{package:p,baseVersion:await store.get('base:'+p.id)||0});draft=r.package;rawDraft=JSON.stringify(draft,null,2);await store.set('draftRaw',rawDraft);await store.set('base:'+p.id,draft.version);await store.set('draft',draft);render();status('发布成功，版本 '+draft.version);return;}
    if(name==='prepare'){if(!host.confirm('创建或重新绑定本角色专用的扩展世界书？核心世界书保持原样；启用条目也会影响此角色的其他聊天。'))return;book=await manager.prepare(ctx().name2||'角色');await refresh();status('扩展世界书已绑定：'+book);return;}
    if(name==='install'){await install();return;}
    if(['enable','disable','uninstall'].includes(name)){if(!host.confirm(`${name==='enable'?'启用':name==='disable'?'停用':'卸载'}该扩展包？${name==='uninstall'?'已自行修改的条目会保留为普通条目。':''}`))return;await manager.manage(id,name);await refresh();status('操作已保存并回读确认。');return;}
    if(name==='backup'){const r=await manager.recovery();C.assert(r,'当前聊天没有恢复备份。');download(r,'第四天灾工坊-恢复备份');return;}
    if(name==='restore'){if(host.confirm('恢复上次工坊操作前的扩展世界书？如果之后有其他修改，将停止恢复。')){await manager.restore();await refresh();status('恢复已保存并回读确认。');}return;}
    if(name==='service'){const value=panel.querySelector('[name=service]').value.trim();const u=new URL(value);C.assert(u.protocol==='https:'||(u.protocol==='http:'&&['127.0.0.1','localhost'].includes(u.hostname)),'共享服务使用 HTTPS；本地调试可使用 localhost。');const result=await fetch(new URL('/api/health',u),{signal:AbortSignal.timeout(15000)});const info=await result.json();C.assert(result.ok&&info.format===C.FORMAT,'这个地址不是兼容的第四天灾工坊服务。');if(service&&service!==u.origin){token='';login=null;account=null;await store.remove('token');await store.remove('login');}service=u.origin;await store.set('service',service);status(info.discord?'服务连接成功，Discord 已配置。':'服务连接成功，服务器还未配置 Discord。');return;}
    if(name==='logout'){if(token&&service)await remote('logout',{});token='';account=null;login=null;await store.remove('token');await store.remove('login');render();status('已退出。');return;}
    if(name==='cancelLogin'){login=null;await store.remove('login');render();return;}
    if(name==='login'){C.assert(service,'请先保存共享服务地址。');const popup=host.open('about:blank','fourth-disaster-login','popup,width=540,height=760');C.assert(popup,'请允许工坊打开登录窗口。');try{const bytes=crypto.getRandomValues(new Uint8Array(32));const nextToken=Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');const proof=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(nextToken))),b=>b.toString(16).padStart(2,'0')).join('');login={token:nextToken,nonce:crypto.randomUUID(),expires:Date.now()+600000};await store.set('login',login);const u=new URL('/api/discord/start',service);u.search=new URLSearchParams({proof,nonce:login.nonce,origin:host.location.origin});popup.location.href=u.href;render();status('在 Discord 页面授权后回到这里，登录会自动完成。');}catch(e){popup.close();throw e;}return;}
  }
  async function checkLogin(){if(!login||checking||doc.hidden||disposed)return;checking=true;try{if(login.expires<Date.now()){login=null;await store.remove('login');if(tab==='account')render();return;}const pending=login,r=await remote('login-status',null,{},pending.token);if(login!==pending||!r.account)return;token=pending.token;account=r.account;await store.set('token',token);await store.remove('login');login=null;if(tab==='account')render();status('Discord 登录成功。');}catch(e){if(opened)status(e.message);}finally{checking=false;}}
  function close(){pageView.close();capture()?.catch(e=>status(e.message));opened=false;if(panel)panel.hidden=true;button?.setAttribute('aria-pressed','false');}
  function open(){mount();C.assert(panel,'请先启用并打开第四天灾统一面板，再使用工坊。');pageView.open(shell);opened=true;panel.hidden=false;button.setAttribute('aria-pressed','true');render();run(refresh);}
  function click(e){const target=e.target.closest?.('[data-fdw-action],[data-fdw-tab],[data-fdw-open]');if(!target)return;if(target.hasAttribute('data-fdw-open')){e.preventDefault();e.stopPropagation();open();return;}if(!panel?.contains(target))return;e.preventDefault();if(target.dataset.fdwTab){run(async()=>{await capture();generation++;tab=target.dataset.fdwTab;page=0;detail=null;render();if(['browse','mine','installed'].includes(tab))await refresh();});}else run(()=>action(target.dataset.fdwAction,target.dataset.id));}
  function mount(){if(disposed)return;const next=doc.getElementById('aelderan-unified-shell');if(next===shell&&panel?.isConnected)return;close();pageView.dispose();panel?.remove();button?.remove();shell=next;panel=button=null;if(!shell?.querySelector('.aeu-content'))return;
    panel=doc.createElement('section');panel.id='fourth-workshop-panel';panel.hidden=true;panel.setAttribute('aria-label','第四天灾创意工坊');shell.querySelector('.aeu-content').append(panel);
    button=doc.createElement('button');button.type='button';button.dataset.fdwOpen='';button.setAttribute('aria-pressed','false');button.innerHTML='<span class="aeu-menu-medallion"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="m3 9 9-6 9 6v12H3ZM8 21v-8h8v8M3 9h18M12 3v6"/></svg></span><span>工坊</span>';const nav=shell.querySelector('.aeu-game-nav');if(nav)nav.insertBefore(button,nav.querySelector('[data-aeu-page="tools"]'));
    panel.addEventListener('submit',e=>{if(e.target.matches('[data-fdw-search]')){e.preventDefault();query=e.target.querySelector('[name=query]').value;category=e.target.querySelector('[name=category]').value;page=0;run(refresh);}});
    panel.addEventListener('change',e=>{if(e.target.matches('[data-fdw-file]'))run(()=>importFile(e.target.files[0]));});
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
