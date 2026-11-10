/* AEU MVU SCHEMA BRIDGE BEGIN — read-only access to this card's real Schema. */
(() => {
  const host=window.parent||window,owner=JSON.stringify([SillyTavern.getContext().characterId,SillyTavern.getContext().groupId]);
  const body=()=>typeof SchemaBody!=='undefined'?SchemaBody:Schema;
  function documents(){
    const result=[];
    for(const io of ['output','input'])try{const root=z.toJSONSchema(body(),{io,unrepresentable:'any'});if(root&&typeof root==='object')result.push(root);}catch{}
    return result;
  }
  function variants(node,root,seen=new Set(),depth=0){
    if(!node||typeof node!=='object'||Array.isArray(node)||depth>30||seen.has(node))return [];
    const nextSeen=new Set(seen);nextSeen.add(node);
    if(node.$ref){
      if(!node.$ref.startsWith('#/'))return [];
      const target=node.$ref.slice(2).split('/').reduce((v,k)=>v?.[k.replace(/~1/g,'/').replace(/~0/g,'~')],root);
      return variants(target,root,nextSeen,depth+1);
    }
    return [node,...['anyOf','oneOf','allOf'].flatMap(k=>(Array.isArray(node[k])?node[k]:[]).flatMap(n=>variants(n,root,nextSeen,depth+1)))];
  }
  function nodesAt(root,path){
    let nodes=[root];
    for(const key of path){
      nodes=nodes.flatMap(n=>variants(n,root)).flatMap(n=>{
        if(n.properties&&Object.hasOwn(n.properties,key))return [n.properties[key]];
        if(n.additionalProperties&&typeof n.additionalProperties==='object')return [n.additionalProperties];
        if(/^\d+$/.test(String(key))&&n.items&&typeof n.items==='object'&&!Array.isArray(n.items))return [n.items];
        return [];
      });
      if(!nodes.length)return [];
    }
    return nodes.flatMap(n=>variants(n,root));
  }
  const bridge={version:3,owner,
    validate(value){try{const result=Schema.safeParse(JSON.parse(JSON.stringify(value)));return result.success?{success:true,data:result.data}:{success:false,error:result.error.issues.slice(0,15).map(i=>i.path.join('.')+': '+i.message+(i.values?'；允许值 '+JSON.stringify(i.values):'')).join('\n')};}catch(error){return {success:false,error:String(error.message||error)};}},
    keysAt(path){try{return [...new Set(documents().flatMap(root=>nodesAt(root,path).flatMap(n=>Object.keys(n.properties||{}))))];}catch{return [];}},
    describe(paths){try{
      const docs=documents(),keys=[...new Set(paths.map(p=>p[0]).filter(Boolean))];
      if(!docs.length)throw Error('无可读结构');
      const views=docs.map(root=>{const properties=Object.assign({},...variants(root,root).map(n=>n.properties||{}));return {type:'object',properties:Object.fromEntries((keys.length?keys:Object.keys(properties)).filter(k=>Object.hasOwn(properties,k)).map(k=>[k,properties[k]])),...(root.$defs?{$defs:root.$defs}:{})};});
      return JSON.stringify({现用字段结构:views[0],...(views[1]?{输入兼容结构:views[1]}:{})}).slice(0,18000);
    }catch{return '必须通过本卡现用ZOD校验；只修格式，不修改枚举含义、名称或数值。';}}
  };
  host.__AEU_MVU_SCHEMA__=bridge;
  window.addEventListener('pagehide',()=>{if(host.__AEU_MVU_SCHEMA__===bridge)delete host.__AEU_MVU_SCHEMA__;},{once:true});
})();
/* AEU MVU SCHEMA BRIDGE END */
