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
