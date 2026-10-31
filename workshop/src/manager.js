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
