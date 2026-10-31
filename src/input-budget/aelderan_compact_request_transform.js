/* Build-time text assembly only; never executes a plugin, model or checker. */
const fs=require('node:fs'),path=require('node:path');
const read=name=>fs.readFileSync(path.join(__dirname,name),'utf8').replace(/\r\n/g,'\n').trimEnd();
function replaceFunction(source,name,replacement){
  const expression=new RegExp('^  (?:async )?function '+name+'\\(', 'm'),match=expression.exec(source);
  if(!match)throw Error('未找到待编辑函数：'+name);
  const start=match.index,next=/^  (?:async )?function /gm;next.lastIndex=start+match[0].length;
  const end=next.exec(source)?.index;if(end==null)throw Error('未找到函数尾部：'+name);
  return source.slice(0,start)+replacement.trimEnd()+'\n\n'+source.slice(end);
}
function editFunction(source,name,edit){
  const expression=new RegExp('^  (?:async )?function '+name+'\\(', 'm'),match=expression.exec(source);
  if(!match)throw Error('未找到待编辑函数：'+name);
  const next=/^  (?:async )?function /gm;next.lastIndex=match.index+match[0].length;
  const end=next.exec(source)?.index;if(end==null)throw Error('未找到函数尾部：'+name);
  return source.slice(0,match.index)+edit(source.slice(match.index,end))+source.slice(end);
}
function compactWorldRequests(source){
  const alreadyCompacted=source.includes('/* AEU INPUT COMPACTION 20261030 */');
  source=source.replace(/\r\n/g,'\n');
  const marker='/* Request-only projections. Full saves, lore, evidence and UI records stay local. */';
  const existing=source.indexOf(marker),old=source.indexOf('/* Original implementation: shared continuity input, not a second model request.');
  const start=existing>=0?existing:old,end=source.indexOf('  function originalModuleCallContext(',start);
  if(start<0||end<0)throw Error('未找到统一面板上下文编辑范围');
  source=source.slice(0,start)+read('aelderan_unified_input_budget.js')+'\n'+read('aelderan_unified_continuity.js')+'\n'+source.slice(end);
  // Keep each module's scheduling vocabulary identical to its content validator.
  // Without this, events can return a plausible "事件检查" row that is always rejected.
  source=editFunction(source,'callModuleSchema',body=>{
    if(body.includes('/* AEU MODULE SCHEDULE TYPES */'))return body;
    return body.replace("    const actionKey = id === 'npc'",()=>`    /* AEU MODULE SCHEDULE TYPES */
    if (properties.调度说明) {
      properties.调度说明 = clone(properties.调度说明);
      const scheduleKinds = id === 'actors' ? ACTOR_KINDS : id === 'events' ? ['事件'] : id === 'npc' ? ['NPC'] : id === 'players' ? ['玩家'] : id === 'organizations' ? ['阵营','势力','公会', ...(legacy ? ['事件'] : [])] : ['世界'];
      properties.调度说明.items.properties.类型.enum = scheduleKinds;
    }
    const actionKey = id === 'npc'`);
  });
  if(alreadyCompacted)return require('./aelderan_community_range_transform').communityRangeWorld(source);
  source=replaceFunction(source,'forumSystemPrompt','  function forumSystemPrompt(identity = {}, root = defaultRoot()) {\n    return aeuCompactForumPrompt(identity,root);\n  }');
  source=replaceFunction(source,'refreshNarrativeInjection',read('aelderan_unified_narrative_budget.js'));
  source=editFunction(source,'reserveAiCall',body=>body.replace('kind, input) {','kind, input, inputSize = {}) {')
    .replace('    root.工作流.调用统计 = stats;',`    const total=Number(inputSize.合计字符数)||text(input).length;
    stats.完整输入字符数=(Number(stats.完整输入字符数)||0)+total;
    const field=kind==='修复'?'格式修复输入字符数':kind==='重试'?'重试输入字符数':'首次输入字符数';
    stats[field]=(Number(stats[field])||0)+total;
    stats.输入组成={...safeObject(stats.输入组成)};
    for(const key of ['上下文字符数','规则字符数','结构字符数'])stats.输入组成[key]=(Number(stats.输入组成[key])||0)+(Number(inputSize[key])||0);
    root.工作流.调用统计 = stats;`));
  const repairSystem='你是严格的JSON格式修复器。只能修复语法、字段名、字段类型与缺失的空容器，不得补写新事实、推断剧情或改变原意。只输出满足目标结构的JSON。';
  source=editFunction(source,'runAiStage',body=>body
    .replace('      const requestTime = nowIso();',"      const requestTime = nowIso();\n      const inputSize=aeuMeasureInput(system,attemptInput,schema,'aew-'+expected);")
    .replace('请求字符数: attemptInput.length, 输入来源:', '请求字符数: inputSize.上下文字符数, 输入统计: inputSize, 输入来源:')
    .replace("reserveAiCall(root, originalAttempt === 1 ? '首次' : '重试', attemptInput);","reserveAiCall(root, originalAttempt === 1 ? '首次' : '重试', attemptInput, inputSize);")
    .replace("              updateAiDiagnostic(root, {\n                状态: `格式修复",()=>"              const repairSize=aeuMeasureInput("+JSON.stringify(repairSystem)+",repairInput,schema,'aew-repair-'+expected);\n              updateAiDiagnostic(root, {\n                请求字符数:repairSize.上下文字符数,输入统计:repairSize,\n                状态: `格式修复")
    .replace("reserveAiCall(root, '修复', repairInput);","reserveAiCall(root, '修复', repairInput, repairSize);"));
  source=editFunction(source,'updateAiDiagnostic',body=>body
    .replace('错误: patch.错误, 请求字符数: patch.请求字符数,','错误: patch.错误, 请求字符数: patch.请求字符数, 输入统计: patch.输入统计,')
    .replace('请求字符数: Number(next.请求字符数) || 0,','请求字符数: Number(next.请求字符数) || 0, 输入统计: safeObject(next.输入统计),'));
  const oldCount='${Number(item.请求字符数) || 0}</dd><dt>解析</dt>';
  const newCount='${Number(item.请求字符数) || 0}</dd>${item.输入统计 ? `<dt>总输入</dt><dd>${Number(item.输入统计.合计字符数)||0} 字符（非实际token）</dd><dt>组成</dt><dd>上下文 ${Number(item.输入统计.上下文字符数)||0} · 规则 ${Number(item.输入统计.规则字符数)||0} · 结构 ${Number(item.输入统计.结构字符数)||0}</dd>` : \'\'}<dt>解析</dt>';
  source=source.replace(oldCount,()=>newCount);
  const totalLine='最近一次运行 · 实际请求 ${Number(stats.总数) || 0} 次';
  source=source.replace(totalLine,()=>totalLine+'${stats.完整输入字符数 ? ` · 总输入 ${Number(stats.完整输入字符数)} 字符（非实际token）` : \'\'}');
  return require('./aelderan_community_range_transform').communityRangeWorld('/* AEU INPUT COMPACTION 20261030 */\n'+source);
}
module.exports={compactWorldRequests};
