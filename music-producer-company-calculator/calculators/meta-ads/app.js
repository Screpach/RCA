(function () {
  'use strict';

  const D=window.MetaAdData,M=window.MetaAdModel,C=window.MetaCharts;
  const $=id=>document.getElementById(id);
  const ids=['language','radius','audienceCurve','breadth','ageMin','ageMax','genderControl','budget','duration','budgetMeaning','modelMode','autoExclude','paymentRoute','taxProfile','customTax','customTaxWrap','exactNumbers','forecastTitle','forecastSub','audienceValue','audienceMeta','impressionsValue','impressionsMeta','visitsValue','visitsMeta','feeValue','feeMeta','mediaSpend','cashTax','accountingVat','totalPayment','cpm','cpv','reach','repeatShare','frequency','saturation','audienceBadge','deliveryBadge','uncertaintyBadge','warningBox','forecastPlot','budgetPlot','visitsPlot','audiencePlot','frequencyPlot','anchorTable','dataTable','dataFile','resetBtn','copyBtn','csvBtn','xlsxBtn','importBtn','exportDataBtn','businessOutcomes','businessFields','conversionRate','ticketPrice','businessResult','purchases','revenue','purchaseCpa','roas','testBtn','testStatus','toast','liveRegion'];
  const el=Object.fromEntries(ids.map(id=>[id,$(id)]));
  let gender='women',last=null,raf=0;
  const nf=new Intl.NumberFormat('ru-RU',{maximumFractionDigits:0});
  const compact=new Intl.NumberFormat('ru-RU',{notation:'compact',maximumFractionDigits:1});
  const eur0=new Intl.NumberFormat('ru-RU',{style:'currency',currency:'EUR',maximumFractionDigits:0});
  const eur2=new Intl.NumberFormat('ru-RU',{style:'currency',currency:'EUR',minimumFractionDigits:2,maximumFractionDigits:4});
  const pct=new Intl.NumberFormat('ru-RU',{style:'percent',maximumFractionDigits:0});

  const translations={
    ru:{title:'Instagram Ad Forecast',subtitle:'Эмпирическая модель Barcelona · версия '+D.modelVersion,forecast:'Прогноз Instagram',audience:'Аудитория',impressions:'Показы',visits:'Посещения сайта',fee:'Комиссия сервиса',reset:'Сбросить',copy:'Скопировать сценарий',charts:'Графики',formulas:'Данные и формулы'},
    en:{title:'Instagram Ad Forecast',subtitle:'Barcelona empirical model · version '+D.modelVersion,forecast:'Instagram forecast',audience:'Audience',impressions:'Impressions',visits:'Website visits',fee:'Service fee',reset:'Reset',copy:'Copy scenario',charts:'Charts',formulas:'Data & formulas'},
    es:{title:'Previsión de anuncios de Instagram',subtitle:'Modelo empírico de Barcelona · versión '+D.modelVersion,forecast:'Previsión de Instagram',audience:'Audiencia',impressions:'Impresiones',visits:'Visitas web',fee:'Comisión del servicio',reset:'Restablecer',copy:'Copiar escenario',charts:'Gráficos',formulas:'Datos y fórmulas'}
  };

  function fillAges(){
    for(let a=18;a<=80;a++){el.ageMin.add(new Option(String(a),String(a)));el.ageMax.add(new Option(String(a),String(a)));}
    el.ageMax.add(new Option('65+','65plus'));
  }

  function defaultState(){return {language:'ru',radius:15,audienceCurve:'saturation',breadth:1,ageMin:18,ageMax:36,ageOpen:false,gender:'women',budget:25,duration:15,budgetMeaning:'media',mode:'robust',autoExclude:true,paymentRoute:'browser',taxProfile:'business',customTax:21,businessOutcomes:false,conversionRate:1.8,ticketPrice:100,exactNumbers:true};}
  function readState(){
    const ageOpen=el.ageMax.value==='65plus';
    return {language:el.language.value,radius:Number(el.radius.value),audienceCurve:el.audienceCurve.value,breadth:Number(el.breadth.value),ageMin:Number(el.ageMin.value),ageMax:ageOpen?80:Number(el.ageMax.value),ageOpen,gender,budget:Number(el.budget.value),duration:Number(el.duration.value),budgetMeaning:el.budgetMeaning.value,mode:el.modelMode.value,autoExclude:el.autoExclude.checked,paymentRoute:el.paymentRoute.value,taxProfile:el.taxProfile.value,customTax:Number(el.customTax.value),businessOutcomes:el.businessOutcomes.checked,conversionRate:Number(el.conversionRate.value),ticketPrice:Number(el.ticketPrice.value),exactNumbers:el.exactNumbers.checked};
  }
  function applyState(s){
    const d={...defaultState(),...s};
    el.language.value=d.language;el.radius.value=d.radius;el.audienceCurve.value=d.audienceCurve;el.breadth.value=d.breadth;el.ageMin.value=d.ageMin;el.ageMax.value=d.ageOpen?'65plus':d.ageMax;gender=d.gender;el.budget.value=d.budget;el.duration.value=d.duration;el.budgetMeaning.value=d.budgetMeaning;el.modelMode.value=d.mode;el.autoExclude.checked=d.autoExclude;el.paymentRoute.value=d.paymentRoute;el.taxProfile.value=d.taxProfile;el.customTax.value=d.customTax;el.businessOutcomes.checked=d.businessOutcomes;el.conversionRate.value=d.conversionRate;el.ticketPrice.value=d.ticketPrice;el.exactNumbers.checked=d.exactNumbers;
    [...el.genderControl.querySelectorAll('button')].forEach(b=>{const active=b.dataset.value===gender;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));});
  }
  function stateToParams(s){const p=new URLSearchParams();Object.entries(s).forEach(([k,v])=>p.set(k,String(v)));return p;}
  function paramsToState(){const p=new URLSearchParams(location.search);if(!p.size)return null;const d=defaultState();for(const [k,v] of p){if(!(k in d))continue;if(typeof d[k]==='boolean')d[k]=v==='true';else if(typeof d[k]==='number')d[k]=Number(v);else d[k]=v;}return d;}
  function persist(s){try{localStorage.setItem('meta-ad-calculator-state-v3',JSON.stringify(s));}catch(_){}try{history.replaceState(null,'',location.pathname+'?'+stateToParams(s).toString()+location.hash);}catch(_){} }

  function t(key){return translations[el.language.value]?.[key]||translations.ru[key]||key;}
  function applyLanguage(){document.documentElement.lang=el.language.value;document.title=t('title');$('[data-i18n]');document.querySelectorAll('[data-i18n]').forEach(n=>{const v=t(n.dataset.i18n);if(v)n.textContent=v;});}
  function fmt(v,exact=true){if(!Number.isFinite(v))return '—';return exact||Math.abs(v)<10000?nf.format(Math.round(v)):compact.format(v);}
  function moneyUp(v){return eur0.format(Math.ceil(Math.max(0,v)));}
  function statusText(x){return ({measured:'Измерено',interpolated:'Интерполяция','cleaned-anchor':'Очищенный anchor',extrapolated:'Экстраполяция'})[x]||x;}
  function showErrors(errors){document.querySelectorAll('.error').forEach(n=>{n.textContent='';n.hidden=true;});Object.entries(errors||{}).forEach(([k,v])=>{const n=$(`error-${k}`);if(n){n.textContent=v;n.hidden=false;}});}

  function update(){cancelAnimationFrame(raf);raf=requestAnimationFrame(()=>{
    const s=readState();applyLanguage();el.customTaxWrap.hidden=s.taxProfile!=='custom';el.businessFields.hidden=!s.businessOutcomes;const result=M.calculate(s);last=result;showErrors(result.errors);
    if(result.errors&&Object.keys(result.errors).length){el.warningBox.hidden=false;el.warningBox.textContent='Исправьте отмеченные поля. Расчёт остановлен, чтобы не подменять введённые значения.';return;}
    persist(s);renderResults(result);renderCharts(result);renderTables(s);el.warningBox.hidden=true;el.liveRegion.textContent=`Прогноз обновлён: ${fmt(result.planning.min,true)}–${fmt(result.planning.max,true)} показов.`;
  });}

  function renderResults(f){
    const s=f.settings,exact=s.exactNumbers;
    el.forecastTitle.textContent=`${s.duration} дней · Instagram`;
    el.forecastSub.textContent=`Barcelona · ${s.radius} км · ${s.gender} · ${s.ageMin}–${s.ageOpen?'65+':s.ageMax} · ${eur0.format(s.budget)}/${s.budgetMeaning==='media'?'день media':'день total'}`;
    el.audienceValue.textContent=`${fmt(f.audience.min,exact)}–${fmt(f.audience.max,exact)}`;
    el.audienceMeta.textContent=`raw ${fmt(f.audience.raw[0],false)}–${fmt(f.audience.raw[1],false)} · isotonic ${fmt(f.audience.isotonic[0],false)}–${fmt(f.audience.isotonic[1],false)}`;
    el.impressionsValue.textContent=`${fmt(f.planning.min,exact)}–${fmt(f.planning.max,exact)}`;
    el.impressionsMeta.textContent=`empirical ${fmt(f.empirical.min,false)}–${fmt(f.empirical.max,false)} · uncertainty ${pct.format(f.uncertainty)}`;
    el.visitsValue.textContent=fmt(f.planning.visits,exact);
    el.visitsMeta.textContent=`диапазон ${fmt(f.interval.visitsMin,false)}–${fmt(f.interval.visitsMax,false)} · empirical ${fmt(f.empirical.visits,false)}`;
    el.feeValue.textContent=moneyUp(f.payment.serviceFee);
    el.feeMeta.textContent=f.payment.feeRate?`30% от суммы до налога · округлено вверх`:'Оплата через browser / Ads Manager';
    el.mediaSpend.textContent=moneyUp(f.payment.mediaSpend);el.cashTax.textContent=moneyUp(f.payment.cashTax);el.accountingVat.textContent=f.payment.accountingRate?`${moneyUp(f.payment.accountingVat)} reverse charge`:'€0';el.totalPayment.textContent=moneyUp(f.payment.total);
    el.cpm.textContent=`${eur2.format(f.cpmLow)}–${eur2.format(f.cpmHigh)}`;el.cpv.textContent=eur2.format(f.cpv);el.reach.textContent=`${fmt(f.reachLow,exact)}–${fmt(f.reachHigh,exact)}`;el.repeatShare.textContent=pct.format(f.repeatShare);el.frequency.textContent=`${f.freqLow.toFixed(1)}×–${f.freqHigh.toFixed(1)}×`;el.saturation.textContent=pct.format(f.saturationFactor);
    renderBusiness(f);
    el.audienceBadge.textContent=`Audience: ${statusText(f.audienceStatus)}`;el.deliveryBadge.textContent=`Delivery: ${statusText(f.deliveryStatus)}`;el.uncertaintyBadge.textContent=`Uncertainty: ±${Math.round(f.uncertainty*100)}%`;
    el.audienceBadge.className='badge '+(f.audienceStatus==='measured'?'':'warn');el.deliveryBadge.className='badge '+(['measured','cleaned-anchor'].includes(f.deliveryStatus)?'':'warn');el.uncertaintyBadge.className='badge '+(f.uncertainty>0.3?'danger':f.uncertainty>0.2?'warn':'');
  }

  function renderBusiness(f){
    const s=f.settings;el.businessResult.hidden=!s.businessOutcomes;if(!s.businessOutcomes)return;
    const baseRate=s.conversionRate/100,lowRate=baseRate*0.60,highRate=baseRate*1.50;
    const low=f.interval.visitsMin*lowRate,base=f.planning.visits*baseRate,high=f.interval.visitsMax*highRate;
    el.purchases.textContent=`${fmt(low,s.exactNumbers)}–${fmt(high,s.exactNumbers)}`;
    el.revenue.textContent=`${moneyUp(low*s.ticketPrice)}–${moneyUp(high*s.ticketPrice)}`;
    el.purchaseCpa.textContent=base>0?eur2.format(f.payment.mediaSpend/base):'—';
    el.roas.textContent=f.payment.mediaSpend>0?`${(base*s.ticketPrice/f.payment.mediaSpend).toFixed(2)}×`:'—';
  }

  function modelAt(s,changes){return M.calculate({...s,...changes,budgetMeaning:'media',paymentRoute:'browser',taxProfile:'business',customTax:21});}
  function samples(max,count=160,min=0,log=false){const out=[];for(let i=0;i<count;i++){const t=i/(count-1);out.push(log?(Math.pow(max+1,t)-1):min+(max-min)*t);}return out;}
  function renderCharts(f){
    const s=f.settings;
    const days=Math.max(1,s.duration),dayXs=[...new Set(samples(days,Math.min(280,Math.max(2,Math.ceil(days))),1,false).map(x=>Math.max(1,Math.round(x))))];
    const dayRows=dayXs.map(d=>{const q=modelAt(s,{duration:d});return {x:d,planMin:q.planning.min,planMax:q.planning.max,low:q.interval.min,high:q.interval.max,visits:q.planning.visits,visitsLow:q.interval.visitsMin,visitsHigh:q.interval.visitsMax,emp:(q.empirical.min+q.empirical.max)/2};});
    C.render(el.forecastPlot,{height:320,rightAxis:true,ariaLabel:'Накопленная доставка по дням',description:'Planning min and max, empirical midpoint and website visits.',xDomain:[1,days],xTicks:[1,Math.max(1,Math.round(days/2)),days],xFormat:v=>`D${Math.round(v)}`,xLabel:'День кампании',yLabel:'Показы',y2Label:'Посещения',bands:[{low:dayRows.map(r=>({x:r.x,y:r.low})),high:dayRows.map(r=>({x:r.x,y:r.high})),fill:'rgba(124,77,255,.06)'},{low:dayRows.map(r=>({x:r.x,y:r.planMin})),high:dayRows.map(r=>({x:r.x,y:r.planMax})),fill:'rgba(55,88,249,.10)'}],series:[{data:dayRows.map(r=>({x:r.x,y:r.planMin})),color:'#3758f9'},{data:dayRows.map(r=>({x:r.x,y:r.planMax})),color:'#7c4dff'},{data:dayRows.map(r=>({x:r.x,y:r.emp})),color:'#8490a6',dash:'6 5',width:1.5},{data:dayRows.map(r=>({x:r.x,y:r.visits})),axis:'right',color:'#d946ef'}],refs:[{x:days,label:`D${days}`}],hoverData:dayRows.map(r=>({x:r.x,y:r.planMax})),tooltip:x=>{const r=nearest(dayRows,x);return [`День ${r.x}`,`Planning: ${fmt(r.planMin,true)}–${fmt(r.planMax,true)}`,`Empirical midpoint: ${fmt(r.emp,true)}`,`Visits: ${fmt(r.visits,true)}`];}});

    const maxBudget=Math.max(120,s.budget*1.3),logB=maxBudget>1000,bXs=samples(maxBudget,180,0,logB);const bRows=bXs.map(b=>{const q=modelAt(s,{budget:b,duration:30});return {x:b,min:q.planning.min/30,max:q.planning.max/30,low:q.interval.min/30,high:q.interval.max/30,visits:q.planning.visits/30,visitsLow:q.interval.visitsMin/30,visitsHigh:q.interval.visitsMax/30,empMin:q.empirical.min/30,empMax:q.empirical.max/30};});
    const anchors=D.budgets.map(b=>{const q=modelAt(s,{budget:b,duration:30});return {x:b,y:(q.empirical.min+q.empirical.max)/60};});
    const fitMin=M.weightedPowerFit(M.budgetAnchors(30,'min',s.mode,s));const fitMax=M.weightedPowerFit(M.budgetAnchors(30,'max',s.mode,s));
    const trends=bXs.filter(x=>x>=2).map(b=>({x:b,min:fitMin(b)/30,max:fitMax(b)/30}));
    C.render(el.budgetPlot,{height:300,logX:logB,ariaLabel:'Показы в день по бюджету',xDomain:[0,maxBudget],xTicks:[0,Math.min(100,maxBudget),maxBudget],xFormat:v=>`€${fmt(v,true)}`,xLabel:'Дневной media budget',yLabel:'Показы в день',zones:[{x0:0,x1:Math.min(100,maxBudget),fill:'rgba(20,134,92,.04)'},{x0:100,x1:maxBudget,fill:'rgba(178,93,7,.05)'}],bands:[{low:bRows.map(r=>({x:r.x,y:r.low})),high:bRows.map(r=>({x:r.x,y:r.high})),fill:'rgba(124,77,255,.06)'},{low:bRows.map(r=>({x:r.x,y:r.min})),high:bRows.map(r=>({x:r.x,y:r.max})),fill:'rgba(55,88,249,.10)'}],series:[{data:bRows.map(r=>({x:r.x,y:r.min})),color:'#3758f9'},{data:bRows.map(r=>({x:r.x,y:r.max})),color:'#7c4dff'},{data:trends.map(r=>({x:r.x,y:r.min})),color:'#8490a6',dash:'6 5',width:1.4},{data:trends.map(r=>({x:r.x,y:r.max})),color:'#8490a6',dash:'6 5',width:1.4}],points:anchors.map(p=>({...p,color:'#172033'})),refs:[{x:f.actualDailyMediaBudget,label:`€${fmt(f.actualDailyMediaBudget,true)}`}],hoverData:bRows.map(r=>({x:r.x,y:r.max})),tooltip:x=>{const r=nearest(bRows,x);return [`€${r.x.toFixed(r.x<10?1:0)}/день`,`Planning: ${fmt(r.min,true)}–${fmt(r.max,true)}/день`,`Empirical: ${fmt(r.empMin,true)}–${fmt(r.empMax,true)}/день`];}});

    const fitVisits=M.weightedPowerFit(M.budgetAnchors(30,'visits',s.mode,s));const vTrend=bXs.filter(x=>x>=2).map(b=>({x:b,y:fitVisits(b)/30}));
    C.render(el.visitsPlot,{height:300,logX:logB,ariaLabel:'Посещения сайта в день по бюджету',xDomain:[0,maxBudget],xTicks:[0,Math.min(100,maxBudget),maxBudget],xFormat:v=>`€${fmt(v,true)}`,xLabel:'Дневной media budget',yLabel:'Посещения в день',zones:[{x0:0,x1:Math.min(100,maxBudget),fill:'rgba(20,134,92,.04)'},{x0:100,x1:maxBudget,fill:'rgba(178,93,7,.05)'}],bands:[{low:bRows.map(r=>({x:r.x,y:r.visitsLow})),high:bRows.map(r=>({x:r.x,y:r.visitsHigh})),fill:'rgba(217,70,239,.08)'}],series:[{data:bRows.map(r=>({x:r.x,y:r.visits})),color:'#d946ef'},{data:vTrend,color:'#8490a6',dash:'6 5',width:1.4}],points:D.budgets.map(b=>{const q=modelAt(s,{budget:b,duration:30});return{x:b,y:q.empirical.visits/30,color:'#172033'};}),refs:[{x:f.actualDailyMediaBudget,label:`€${fmt(f.actualDailyMediaBudget,true)}`}],hoverData:bRows.map(r=>({x:r.x,y:r.visits})),tooltip:x=>{const r=nearest(bRows,x);return [`€${r.x.toFixed(r.x<10?1:0)}/день`,`Planning visits: ${fmt(r.visits,true)}/день`];}});

    const maxRadius=Math.max(35,s.radius*1.25),rXs=samples(maxRadius,160),factor=M.audienceFactor(s),rawPts=D.radiusMin.slice(1).map((v,i)=>({x:i+1,y:v*factor}));const rRows=rXs.map(r=>{const raw=M.rawAudience(r),iso=M.isotonicAudience(r),sat=M.saturationAudience(r);return{x:r,rawMin:raw[0]*factor,rawMax:raw[1]*factor,isoMin:iso[0]*factor,isoMax:iso[1]*factor,satMin:sat[0]*factor,satMax:sat[1]*factor};});
    C.render(el.audiencePlot,{height:310,ariaLabel:'Аудитория по радиусу',xDomain:[0,maxRadius],xTicks:[0,Math.min(30,maxRadius),maxRadius],xFormat:v=>`${fmt(v,true)} км`,xLabel:'Радиус',yLabel:'Размер аудитории',zones:[{x0:0,x1:Math.min(30,maxRadius),fill:'rgba(20,134,92,.05)'},{x0:30,x1:maxRadius,fill:'rgba(178,93,7,.06)'}],series:[{data:rRows.filter(r=>r.x<=30).map(r=>({x:r.x,y:r.rawMin})),color:'#3758f9',opacity:.45},{data:rRows.filter(r=>r.x<=30).map(r=>({x:r.x,y:r.rawMax})),color:'#7c4dff',opacity:.45},{data:rRows.map(r=>({x:r.x,y:r.isoMin})),color:'#14865c',dash:'4 4'},{data:rRows.map(r=>({x:r.x,y:r.isoMax})),color:'#14865c',dash:'4 4'},{data:rRows.map(r=>({x:r.x,y:r.satMin})),color:'#3758f9'},{data:rRows.map(r=>({x:r.x,y:r.satMax})),color:'#7c4dff'}],points:rawPts.map(p=>({...p,color:'#172033',r:2.6})),refs:[{x:s.radius,label:`${s.radius} км`}],hoverData:rRows.map(r=>({x:r.x,y:r.satMax})),tooltip:x=>{const r=nearest(rRows,x);return [`${r.x.toFixed(1)} км`,`Raw: ${fmt(r.rawMin,true)}–${fmt(r.rawMax,true)}`,`Isotonic: ${fmt(r.isoMin,true)}–${fmt(r.isoMax,true)}`,`Saturation: ${fmt(r.satMin,true)}–${fmt(r.satMax,true)}`];}});

    const currentRawFreq=((f.empirical.min+f.empirical.max)/2)/Math.max(1,(f.audience.min+f.audience.max)/2),freqMax=Math.max(20,currentRawFreq*1.3);const freqRows=samples(freqMax,150).map(x=>({x,y:M.saturationPenalty(x)}));
    C.render(el.frequencyPlot,{height:270,ariaLabel:'Штраф насыщения по частоте',xDomain:[0,freqMax],yDomain:[0,1],xTicks:[0,4,freqMax],xFormat:v=>`${v.toFixed(v<10?1:0)}×`,xLabel:'Сырая частота показов',yLabel:'Коэффициент сохранённой доставки',series:[{data:freqRows,color:'#b25d07'}],refs:[{x:4,label:'Порог 4×'},{x:currentRawFreq,label:`Сценарий ${currentRawFreq.toFixed(1)}×`}],hoverData:freqRows,tooltip:x=>{const r=nearest(freqRows,x);return [`Частота ${r.x.toFixed(1)}×`,`Сохраняется ${pct.format(r.y)} доставки`];}});

    renderChartData('forecastData',dayRows,[['Day','Plan min','Plan max','Empirical midpoint','Visits'],...dayRows.map(r=>[r.x,r.planMin,r.planMax,r.emp,r.visits])]);
    renderChartData('budgetData',bRows,[['Budget','Plan min/day','Plan max/day','Visits/day'],...bRows.map(r=>[r.x,r.min,r.max,r.visits])]);
    renderChartData('visitsData',bRows,[['Budget','Visits low/day','Visits plan/day','Visits high/day'],...bRows.map(r=>[r.x,r.visitsLow,r.visits,r.visitsHigh])]);
    renderChartData('frequencyData',freqRows,[['Raw frequency','Delivery retained'],...freqRows.map(r=>[r.x,r.y])]);
    renderChartData('audienceData',rRows,[['Radius','Raw min','Raw max','Isotonic min','Isotonic max','Saturation min','Saturation max'],...rRows.map(r=>[r.x,r.rawMin,r.rawMax,r.isoMin,r.isoMax,r.satMin,r.satMax])]);
  }
  function nearest(rows,x){let n=rows[0];for(const r of rows)if(Math.abs(r.x-x)<Math.abs(n.x-x))n=r;return n;}
  function renderChartData(id,_source,rows){const box=$(id);if(!box)return;const head=rows[0],body=rows.slice(1);box.innerHTML=`<table><thead><tr>${head.map(x=>`<th>${escapeHtml(x)}</th>`).join('')}</tr></thead><tbody>${body.map(r=>`<tr>${r.map(v=>`<td>${typeof v==='number'?nf.format(Math.round(v*100)/100):escapeHtml(v)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;}

  function renderTables(s){
    const anchors=D.budgets.map(b=>{const min=M.durationAtAnchor(b,30,'min',s.mode,s)/30,max=M.durationAtAnchor(b,30,'max',s.mode,s)/30,vis=M.durationAtAnchor(b,30,'visits',s.mode,s)/30;return[b,min,max,vis,b===50?0.45:1];});
    el.anchorTable.innerHTML=anchors.map(r=>`<tr><td>€${r[0]}</td><td>${fmt(r[1],true)}</td><td>${fmt(r[2],true)}</td><td>${r[3].toFixed(r[3]<100?1:0)}</td><td>${r[4]}</td></tr>`).join('');
    const rows=M.getRows();el.dataTable.innerHTML=rows.map((r,i)=>{const cells=['min','max','visits'].map(m=>{const k=M.key(r.radius,r.budget,r.duration,m),auto=M.autoOutliers.has(k),included=M.isIncluded(r,m,s.autoExclude);return `<label class="point-toggle ${auto?'auto-outlier':''}"><input type="checkbox" data-point="${k}" ${included?'checked':''}><span>${m}${auto?' ⚠':''}</span></label>`;}).join('');return `<tr><td>${i+1}</td><td>${r.radius}</td><td>€${r.budget}</td><td>${r.duration}</td><td>${nf.format(r.min)}</td><td>${nf.format(r.max)}</td><td>${nf.format(r.visits)}</td><td>${cells}</td></tr>`;}).join('');
  }

  function escapeHtml(v){return String(v).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}
  function toast(msg){el.toast.textContent=msg;el.toast.classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(()=>el.toast.classList.remove('show'),1800);}
  function download(blob,name){const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}
  function stamp(){return new Date().toISOString().replace(/[:.]/g,'-');}

  function summaryRows(){if(!last||last.errors&&Object.keys(last.errors).length)return[];const f=last,s=f.settings;return [['Model version',D.modelVersion],['Data version',D.dataVersion],['Timestamp',new Date().toISOString()],['Platform','Instagram'],['Barcelona radius km',s.radius],['Audience curve',s.audienceCurve],['Age',`${s.ageMin}-${s.ageOpen?'65+':s.ageMax}`],['Gender',s.gender],['Daily input EUR',s.budget],['Budget meaning',s.budgetMeaning],['Duration days',s.duration],['Planning impressions min',Math.round(f.planning.min)],['Planning impressions max',Math.round(f.planning.max)],['Empirical impressions min',Math.round(f.empirical.min)],['Empirical impressions max',Math.round(f.empirical.max)],['Planning visits',Math.round(f.planning.visits)],['Audience min',Math.round(f.audience.min)],['Audience max',Math.round(f.audience.max)],['Media spend EUR',f.payment.mediaSpend],['Service fee EUR',f.payment.serviceFee],['Cash IVA EUR',f.payment.cashTax],['Reverse-charge IVA EUR',f.payment.accountingVat],['Total cash EUR',f.payment.total],['CPM low',f.cpmLow],['CPM high',f.cpmHigh],['CPV',f.cpv],['Frequency low',f.freqLow],['Estimated reach low',f.reachLow],['Estimated reach high',f.reachHigh],['Repeat impression share',f.repeatShare],['Frequency high',f.freqHigh],['Saturation factor',f.saturationFactor],['Uncertainty',f.uncertainty]];}
  function exportCsv(){const rows=summaryRows();const csv='\ufeff'+rows.map(r=>r.map(v=>`"${String(v??'').replaceAll('"','""')}"`).join(';')).join('\r\n');download(new Blob([csv],{type:'text/csv;charset=utf-8'}),`instagram-forecast-${stamp()}.csv`);toast('CSV экспортирован');}

  function crc32(bytes){let c=0xffffffff;for(const b of bytes){c^=b;for(let k=0;k<8;k++)c=(c>>>1)^((c&1)?0xedb88320:0);}return(c^0xffffffff)>>>0;}
  function u16(n){return new Uint8Array([n&255,(n>>>8)&255]);}function u32(n){return new Uint8Array([n&255,(n>>>8)&255,(n>>>16)&255,(n>>>24)&255]);}
  function concat(parts){const len=parts.reduce((a,b)=>a+b.length,0),out=new Uint8Array(len);let o=0;parts.forEach(p=>{out.set(p,o);o+=p.length;});return out;}
  function zipStore(files){const enc=new TextEncoder(),locals=[],centrals=[];let offset=0;files.forEach(f=>{const name=enc.encode(f.name),data=typeof f.data==='string'?enc.encode(f.data):f.data,crc=crc32(data);const local=concat([u32(0x04034b50),u16(20),u16(0),u16(0),u16(0),u16(0),u32(crc),u32(data.length),u32(data.length),u16(name.length),u16(0),name,data]);locals.push(local);const central=concat([u32(0x02014b50),u16(20),u16(20),u16(0),u16(0),u16(0),u16(0),u32(crc),u32(data.length),u32(data.length),u16(name.length),u16(0),u16(0),u16(0),u16(0),u32(0),u32(offset),name]);centrals.push(central);offset+=local.length;});const central=concat(centrals),end=concat([u32(0x06054b50),u16(0),u16(0),u16(files.length),u16(files.length),u32(central.length),u32(offset),u16(0)]);return concat([...locals,central,end]);}
  function xml(v){return String(v).replace(/[<>&'\"]/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;',"'":'&apos;','"':'&quot;'}[c]));}
  function colName(n){let s='';while(n){n--;s=String.fromCharCode(65+n%26)+s;n=Math.floor(n/26);}return s;}
  function sheetXml(rows){let body='';rows.forEach((r,ri)=>{body+=`<row r="${ri+1}">`;r.forEach((v,ci)=>{const ref=colName(ci+1)+(ri+1);if(typeof v==='number'&&Number.isFinite(v))body+=`<c r="${ref}"><v>${v}</v></c>`;else body+=`<c r="${ref}" t="inlineStr"><is><t>${xml(v??'')}</t></is></c>`;});body+='</row>';});return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${body}</sheetData></worksheet>`;}
  function exportXlsx(){const summary=[['Instagram Ad Forecast'],...summaryRows()],data=[['Radius','Budget','Duration','Min','Max','Visits'],...M.getRows().map(r=>[r.radius,r.budget,r.duration,r.min,r.max,r.visits])];const files=[{name:'[Content_Types].xml',data:`<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`},{name:'_rels/.rels',data:`<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`},{name:'xl/workbook.xml',data:`<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Forecast" sheetId="1" r:id="rId1"/><sheet name="Data" sheetId="2" r:id="rId2"/></sheets></workbook>`},{name:'xl/_rels/workbook.xml.rels',data:`<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/></Relationships>`},{name:'xl/worksheets/sheet1.xml',data:sheetXml(summary)},{name:'xl/worksheets/sheet2.xml',data:sheetXml(data)}];download(new Blob([zipStore(files)],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}),`instagram-forecast-${stamp()}.xlsx`);toast('XLSX экспортирован');}

  function exportData(){download(new Blob([JSON.stringify({modelVersion:D.modelVersion,rows:M.getRows()},null,2)],{type:'application/json'}),`instagram-measurements-${stamp()}.json`);}
  function parseCsv(text){const lines=text.trim().split(/\r?\n/),sep=lines[0].includes(';')?';':',';const h=lines.shift().split(sep).map(x=>x.trim().toLowerCase().replace(/"/g,''));const req=['radius','budget','duration','min','max','visits'];return lines.filter(Boolean).map(line=>{const cells=line.split(sep).map(x=>x.trim().replace(/^"|"$/g,''));const o={};req.forEach(k=>o[k]=Number(cells[h.indexOf(k)]));return o;});}
  async function importData(file){const text=await file.text();let rows;if(file.name.toLowerCase().endsWith('.json')){const obj=JSON.parse(text);rows=Array.isArray(obj)?obj:obj.rows;}else rows=parseCsv(text);M.replaceRows(rows);renderTables(readState());update();toast(`Импортировано строк: ${rows.length}`);}

  function copyScenario(){const url=location.href;const done=()=>toast('Ссылка сценария скопирована');if(navigator.clipboard?.writeText)navigator.clipboard.writeText(url).then(done).catch(()=>fallbackCopy(url));else fallbackCopy(url);}
  function fallbackCopy(text){const ta=document.createElement('textarea');ta.value=text;document.body.appendChild(ta);ta.select();document.execCommand('copy');ta.remove();toast('Ссылка сценария скопирована');}
  function reset(){applyState(defaultState());M.clearManual();update();toast('Настройки сброшены');}

  function bind(){
    document.querySelectorAll('[data-tab]').forEach(b=>b.addEventListener('click',()=>{document.querySelectorAll('[data-tab]').forEach(x=>x.classList.toggle('active',x===b));document.querySelectorAll('.tab-pane').forEach(p=>p.hidden=p.id!==b.dataset.tab);}));
    document.querySelectorAll('input,select').forEach(n=>{if(n.id==='dataFile')return;n.addEventListener(n.type==='number'?'input':'change',update);});
    el.genderControl.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;gender=b.dataset.value;[...el.genderControl.querySelectorAll('button')].forEach(x=>{const a=x===b;x.classList.toggle('active',a);x.setAttribute('aria-pressed',String(a));});update();});
    el.dataTable.addEventListener('change',e=>{const x=e.target.closest('[data-point]');if(!x)return;M.setManual(x.dataset.point,x.checked);update();});
    el.resetBtn.addEventListener('click',reset);el.copyBtn.addEventListener('click',copyScenario);el.csvBtn.addEventListener('click',exportCsv);el.xlsxBtn.addEventListener('click',exportXlsx);el.importBtn.addEventListener('click',()=>el.dataFile.click());el.dataFile.addEventListener('change',()=>el.dataFile.files[0]&&importData(el.dataFile.files[0]).catch(e=>toast('Ошибка импорта: '+e.message)));el.exportDataBtn.addEventListener('click',exportData);
    document.addEventListener('click',e=>{const b=e.target.closest('[data-chart-export]');if(!b)return;const target=$(b.dataset.target);b.dataset.chartExport==='png'?C.exportPng(target,b.dataset.target):C.exportSvg(target,b.dataset.target);});
    el.testBtn.addEventListener('click',()=>{const r=window.MetaAdTests?.run()||{passed:0,failed:1,errors:['tests unavailable']};el.testStatus.textContent=`${r.passed} passed, ${r.failed} failed`;el.testStatus.className=r.failed?'test-fail':'test-pass';if(r.failed)console.error(r.errors);});
    let resizeTimer;window.addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>last&&!last.errors&&renderCharts(last),150);});
  }

  fillAges();const saved=paramsToState()||(()=>{try{return JSON.parse(localStorage.getItem('meta-ad-calculator-state-v3'))}catch(_){return null}})()||defaultState();applyState(saved);bind();update();
})();
