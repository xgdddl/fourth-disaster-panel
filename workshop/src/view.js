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
