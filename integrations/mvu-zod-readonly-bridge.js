/* AEU MVU SCHEMA BRIDGE BEGIN — read-only access to this card's real Schema. */
(() => {
  const host=window.parent||window,owner=JSON.stringify([SillyTavern.getContext().characterId,SillyTavern.getContext().groupId]);
  const inputSchema=()=>z.toJSONSchema(typeof SchemaBody!=='undefined'?SchemaBody:Schema,{io:'input',unrepresentable:'any'});
  const resolve=(node,root)=>{for(let n=0;node?.$ref&&n<12;n++){if(!node.$ref.startsWith('#/'))return {};node=node.$ref.slice(2).split('/').reduce((v,k)=>v?.[k.replace(/~1/g,'/').replace(/~0/g,'~')],root);}return node||{};};
  const bridge={version:2,owner,
    validate(value){try{const result=Schema.safeParse(JSON.parse(JSON.stringify(value)));return result.success?{success:true,data:result.data}:{success:false,error:result.error.issues.slice(0,15).map(i=>i.path.join('.')+': '+i.message+(i.values?'；允许值 '+JSON.stringify(i.values):'')).join('\n')};}catch(error){return {success:false,error:String(error.message||error)};}},
    keysAt(path){try{const full=inputSchema();let node=full;for(const key of path){node=resolve(node,full);node=node.properties?.[key]||node.additionalProperties||node.items;if(!node||typeof node!=='object')return [];}return Object.keys(resolve(node,full).properties||{});}catch{return [];}},
    describe(paths){try{const full=inputSchema(),keys=[...new Set(paths.map(p=>p[0]).filter(Boolean))],properties=full.properties||{};return JSON.stringify({type:'object',properties:Object.fromEntries((keys.length?keys:Object.keys(properties)).filter(k=>Object.hasOwn(properties,k)).map(k=>[k,properties[k]])),$defs:full.$defs}).slice(0,18000);}catch{return '必须通过本卡现用ZOD校验；只修格式，不修改枚举含义、名称或数值。';}}
  };
  host.__AEU_MVU_SCHEMA__=bridge;
  window.addEventListener('pagehide',()=>{if(host.__AEU_MVU_SCHEMA__===bridge)delete host.__AEU_MVU_SCHEMA__;},{once:true});
})();
/* AEU MVU SCHEMA BRIDGE END */
