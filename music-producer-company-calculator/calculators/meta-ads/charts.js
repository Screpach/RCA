(function (global) {
  'use strict';

  const NS='http://www.w3.org/2000/svg';
  const compact=new Intl.NumberFormat('ru-RU',{notation:'compact',maximumFractionDigits:1});
  const number=new Intl.NumberFormat('ru-RU',{maximumFractionDigits:1});
  const svgEl=(name,attrs={})=>{const e=document.createElementNS(NS,name);Object.entries(attrs).forEach(([k,v])=>e.setAttribute(k,String(v)));return e;};

  function extent(values) {
    const finite=values.filter(Number.isFinite);
    if(!finite.length)return [0,1];
    let min=Math.min(...finite),max=Math.max(...finite);
    if(min===max){min=Math.min(0,min);max=max||1;}
    return [min,max];
  }
  function niceMax(v){if(v<=0)return 1;const p=10**Math.floor(Math.log10(v));return Math.ceil(v/p/2)*2*p;}
  function fmt(v){return Math.abs(v)>=10000?compact.format(v):number.format(v);}

  function render(target,config) {
    target.innerHTML='';
    const width=Math.max(320,target.clientWidth||700),height=config.height||300;
    const pad={l:62,r:config.rightAxis?62:24,t:22,b:48};
    const pw=width-pad.l-pad.r,ph=height-pad.t-pad.b;
    const allX=config.series.flatMap(s=>s.data.map(p=>p.x)).concat(config.points?.map(p=>p.x)||[],config.refs?.map(r=>r.x)||[]);
    let [xMin,xMax]=config.xDomain||extent(allX);if(xMin===xMax)xMax=xMin+1;
    const leftY=config.series.filter(s=>s.axis!=='right').flatMap(s=>s.data.map(p=>p.y));
    const rightY=config.series.filter(s=>s.axis==='right').flatMap(s=>s.data.map(p=>p.y));
    config.bands?.forEach(b=>{leftY.push(...b.low.map(p=>p.y),...b.high.map(p=>p.y));});
    let yMax=niceMax((config.yDomain?.[1]??Math.max(...leftY,1))*1.03),yMin=config.yDomain?.[0]??0;
    let y2Max=niceMax((config.y2Domain?.[1]??Math.max(...rightY,1))*1.03),y2Min=config.y2Domain?.[0]??0;
    const logX=!!config.logX&&xMin>=0;
    const lx=v=>Math.log10(Math.max(v,0)+1);
    const x0=logX?lx(xMin):xMin,x1=logX?lx(xMax):xMax;
    const X=v=>pad.l+((logX?lx(v):v)-x0)/Math.max(1e-9,x1-x0)*pw;
    const Y=v=>pad.t+ph-(v-yMin)/Math.max(1e-9,yMax-yMin)*ph;
    const Y2=v=>pad.t+ph-(v-y2Min)/Math.max(1e-9,y2Max-y2Min)*ph;

    const svg=svgEl('svg',{viewBox:`0 0 ${width} ${height}`,role:'img','aria-label':config.ariaLabel||config.title||'Chart',tabindex:'0'});
    svg.style.width='100%';svg.style.height=`${height}px`;
    const title=svgEl('title');title.textContent=config.ariaLabel||config.title||'Chart';svg.appendChild(title);
    const desc=svgEl('desc');desc.textContent=config.description||'';svg.appendChild(desc);

    if(config.zones)config.zones.forEach(z=>svg.appendChild(svgEl('rect',{x:X(z.x0),y:pad.t,width:Math.max(0,X(z.x1)-X(z.x0)),height:ph,fill:z.fill||'rgba(55,88,249,.05)'})));

    for(let i=0;i<=4;i++){
      const y=pad.t+ph*i/4;
      svg.appendChild(svgEl('line',{x1:pad.l,y1:y,x2:width-pad.r,y2:y,stroke:'#e8edf4','stroke-width':1}));
      const text=svgEl('text',{x:pad.l-9,y:y+3,'text-anchor':'end',fill:'#758098','font-size':10});text.textContent=fmt(yMax*(1-i/4));svg.appendChild(text);
      if(config.rightAxis){const t2=svgEl('text',{x:width-pad.r+9,y:y+3,'text-anchor':'start',fill:'#a04caf','font-size':10});t2.textContent=fmt(y2Max*(1-i/4));svg.appendChild(t2);}
    }

    const ticks=config.xTicks||[xMin,(xMin+xMax)/2,xMax];
    ticks.forEach(v=>{const t=svgEl('text',{x:X(v),y:height-pad.b+20,'text-anchor':'middle',fill:'#758098','font-size':10});t.textContent=config.xFormat?config.xFormat(v):fmt(v);svg.appendChild(t);});

    if(config.xLabel){const t=svgEl('text',{x:pad.l+pw/2,y:height-5,'text-anchor':'middle',fill:'#566078','font-size':10,'font-weight':700});t.textContent=config.xLabel;svg.appendChild(t);}
    if(config.yLabel){const t=svgEl('text',{x:12,y:pad.t+ph/2,transform:`rotate(-90 12 ${pad.t+ph/2})`,'text-anchor':'middle',fill:'#566078','font-size':10,'font-weight':700});t.textContent=config.yLabel;svg.appendChild(t);}
    if(config.y2Label){const t=svgEl('text',{x:width-8,y:pad.t+ph/2,transform:`rotate(90 ${width-8} ${pad.t+ph/2})`,'text-anchor':'middle',fill:'#a04caf','font-size':10,'font-weight':700});t.textContent=config.y2Label;svg.appendChild(t);}

    config.bands?.forEach(b=>{
      const pts=b.high.map(p=>`${X(p.x)},${Y(p.y)}`).concat([...b.low].reverse().map(p=>`${X(p.x)},${Y(p.y)}`)).join(' ');
      svg.appendChild(svgEl('polygon',{points:pts,fill:b.fill||'rgba(55,88,249,.09)',stroke:'none'}));
    });

    config.series.forEach(s=>{
      if(!s.data.length)return;
      const mapY=s.axis==='right'?Y2:Y;
      const d=s.data.map((p,i)=>`${i?'L':'M'}${X(p.x).toFixed(2)},${mapY(p.y).toFixed(2)}`).join(' ');
      svg.appendChild(svgEl('path',{d,fill:'none',stroke:s.color||'#3758f9','stroke-width':s.width||2.2,'stroke-dasharray':s.dash||'', 'stroke-linejoin':'round','stroke-linecap':'round',opacity:s.opacity??1}));
      if(s.markers)s.data.forEach(p=>svg.appendChild(svgEl('circle',{cx:X(p.x),cy:mapY(p.y),r:s.markerSize||3,fill:s.color||'#172033'})));
    });

    config.points?.forEach(p=>svg.appendChild(svgEl('circle',{cx:X(p.x),cy:Y(p.y),r:p.r||3.2,fill:p.color||'#172033','data-tooltip':p.label||''})));
    config.refs?.forEach(r=>{
      const x=X(r.x);svg.appendChild(svgEl('line',{x1:x,y1:pad.t,x2:x,y2:pad.t+ph,stroke:r.color||'#7d8799','stroke-width':1.2,'stroke-dasharray':'5 5'}));
      const t=svgEl('text',{x:clampLabel(x,pad.l,width-pad.r),y:pad.t+12,'text-anchor':x>width-pad.r-45?'end':x<pad.l+45?'start':'middle',fill:r.color||'#566078','font-size':10,'font-weight':700});t.textContent=r.label||'';svg.appendChild(t);
    });

    const overlay=svgEl('rect',{x:pad.l,y:pad.t,width:pw,height:ph,fill:'transparent'});svg.appendChild(overlay);
    const guide=svgEl('line',{x1:pad.l,y1:pad.t,x2:pad.l,y2:pad.t+ph,stroke:'#172033','stroke-width':1,opacity:0});svg.appendChild(guide);
    const tooltip=document.createElement('div');tooltip.className='chart-tooltip';target.appendChild(svg);target.appendChild(tooltip);
    const hoverData=config.hoverData||config.series[0]?.data||[];
    overlay.addEventListener('pointermove',e=>{
      if(!hoverData.length)return;
      const rect=svg.getBoundingClientRect(),px=(e.clientX-rect.left)*width/rect.width;
      const raw=logX?Math.pow(10,x0+(px-pad.l)/pw*(x1-x0))-1:xMin+(px-pad.l)/pw*(xMax-xMin);
      let nearest=hoverData[0];for(const p of hoverData)if(Math.abs(p.x-raw)<Math.abs(nearest.x-raw))nearest=p;
      const gx=X(nearest.x);guide.setAttribute('x1',gx);guide.setAttribute('x2',gx);guide.setAttribute('opacity','0.35');
      const lines=config.tooltip?config.tooltip(nearest.x):[`${nearest.x}: ${fmt(nearest.y)}`];
      tooltip.innerHTML=lines.map(x=>`<div>${escapeHtml(x)}</div>`).join('');tooltip.hidden=false;
      tooltip.style.left=`${Math.min(target.clientWidth-170,Math.max(8,e.clientX-target.getBoundingClientRect().left+12))}px`;tooltip.style.top='18px';
    });
    overlay.addEventListener('pointerleave',()=>{guide.setAttribute('opacity',0);tooltip.hidden=true;});
    target.__chartConfig={svg,config};
    return svg;
  }

  function clampLabel(v,a,b){return Math.min(b-4,Math.max(a+4,v));}
  function escapeHtml(s){return String(s).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}
  function download(blob,name){const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}
  function exportSvg(target,name){const svg=target.__chartConfig?.svg;if(!svg)return;const text=new XMLSerializer().serializeToString(svg);download(new Blob([text],{type:'image/svg+xml;charset=utf-8'}),name+'.svg');}
  function exportPng(target,name){const svg=target.__chartConfig?.svg;if(!svg)return;const text=new XMLSerializer().serializeToString(svg),url=URL.createObjectURL(new Blob([text],{type:'image/svg+xml'})),img=new Image();img.onload=()=>{const canvas=document.createElement('canvas');canvas.width=svg.viewBox.baseVal.width*2;canvas.height=svg.viewBox.baseVal.height*2;const ctx=canvas.getContext('2d');ctx.scale(2,2);ctx.drawImage(img,0,0);canvas.toBlob(b=>download(b,name+'.png'),'image/png');URL.revokeObjectURL(url);};img.src=url;}

  global.MetaCharts={render,exportSvg,exportPng,fmt};
})(window);
