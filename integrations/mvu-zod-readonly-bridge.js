/* AEU MVU SCHEMA BRIDGE BEGIN — read-only access to this card's real Schema. */
(() => {
  const host=window.parent||window,owner=JSON.stringify([SillyTavern.getContext().characterId,SillyTavern.getContext().groupId]);
  const bridge={version:1,owner,
    validate(value){try{const result=Schema.safeParse(JSON.parse(JSON.stringify(value)));return result.success?{success:true,data:result.data}:{success:false,error:result.error.issues.slice(0,15).map(i=>i.path.join('.')+': '+i.message+(i.values?'；允许值 '+JSON.stringify(i.values):'')).join('\n')};}catch(error){return {success:false,error:String(error.message||error)};}},
    describe(paths){try{const full=z.toJSONSchema(Schema,{io:'input',unrepresentable:'any'}),keys=[...new Set(paths.map(p=>p[0]).filter(Boolean))],properties=full.properties||{};return JSON.stringify({type:'object',properties:Object.fromEntries(keys.filter(k=>Object.hasOwn(properties,k)).map(k=>[k,properties[k]]))}).slice(0,18000);}catch{return '必须通过本卡现用ZOD校验；只修格式，不修改枚举含义、名称或数值。';}}
  };
  host.__AEU_MVU_SCHEMA__=bridge;
  window.addEventListener('pagehide',()=>{if(host.__AEU_MVU_SCHEMA__===bridge)delete host.__AEU_MVU_SCHEMA__;},{once:true});
})();
/* AEU MVU SCHEMA BRIDGE END */
