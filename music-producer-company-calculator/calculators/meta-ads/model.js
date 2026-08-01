(function (global) {
  'use strict';

  const D = global.MetaAdData;
  const EPS = 1e-9;
  const clamp = (v,a,b) => Math.min(b,Math.max(a,v));
  const mix = (a,b,t) => a+(b-a)*t;
  const safe = v => Number.isFinite(v) ? v : 0;
  const key = (r,b,d,m) => `${r}|${b}|${d}|${m}`;

  function interval(xs,x) {
    if (x <= xs[0]) return [0,0,0];
    if (x >= xs[xs.length-1]) return [xs.length-1,xs.length-1,0];
    for (let i=1;i<xs.length;i++) if (x <= xs[i]) return [i-1,i,(x-xs[i-1])/(xs[i]-xs[i-1])];
    return [xs.length-1,xs.length-1,0];
  }

  function pava(values, weights) {
    const blocks = values.map((v,i)=>({sum:v*(weights?.[i]??1),weight:weights?.[i]??1,start:i,end:i}));
    for (let i=0;i<blocks.length-1;) {
      const a=blocks[i], b=blocks[i+1];
      if (a.sum/a.weight <= b.sum/b.weight) { i++; continue; }
      a.sum += b.sum; a.weight += b.weight; a.end=b.end; blocks.splice(i+1,1); if(i>0)i--;
    }
    const out=new Array(values.length);
    blocks.forEach(b=>{const v=b.sum/b.weight;for(let i=b.start;i<=b.end;i++)out[i]=v;});
    return out;
  }

  function detectOutliers(rows) {
    const flags = new Set();
    const metrics=['min','max','visits'];
    const byRD = new Map();
    rows.forEach(row=>{
      const k=`${row.radius}|${row.duration}`;
      if(!byRD.has(k))byRD.set(k,[]);
      byRD.get(k).push(row);
    });
    // First pass: budget monotonicity. This identifies the sharply lower €100 rows at 1 and 15 km.
    byRD.forEach(group=>{
      group.sort((a,b)=>a.budget-b.budget);
      metrics.forEach(m=>{
        for(let i=1;i<group.length;i++) {
          if(group[i][m] < group[i-1][m]*0.95) flags.add(key(group[i].radius,group[i].budget,group[i].duration,m));
        }
      });
    });
    // Second pass: cross-radius disagreement, using only points that survived monotonicity.
    // This catches the isolated €2 / 15-day / 30-km maximum without overriding stronger trend evidence.
    const byBD = new Map();
    rows.forEach(row=>{
      const k=`${row.budget}|${row.duration}`;
      if(!byBD.has(k))byBD.set(k,[]);
      byBD.get(k).push(row);
    });
    byBD.forEach(group=>{
      metrics.forEach(m=>{
        const candidates=group.filter(row=>!flags.has(key(row.radius,row.budget,row.duration,m)));
        if(candidates.length<3)return;
        const vals=candidates.map(x=>x[m]).sort((a,b)=>a-b);
        const med=vals[Math.floor(vals.length/2)]||1;
        candidates.forEach(row=>{ if(Math.abs(row[m]-med)/Math.max(med,1)>0.04) flags.add(key(row.radius,row.budget,row.duration,m)); });
      });
    });
    return flags;
  }

  const autoOutliers = detectOutliers(D.rows);
  const manual = {};
  let customRows = D.rows.map(x=>({...x}));

  function setManual(pointKey,value) { manual[pointKey]=value; }
  function clearManual() { Object.keys(manual).forEach(k=>delete manual[k]); }
  function isIncluded(row,metric,autoExclude=true) {
    const k=key(row.radius,row.budget,row.duration,metric);
    if(Object.prototype.hasOwnProperty.call(manual,k)) return manual[k];
    return autoExclude ? !autoOutliers.has(k) : true;
  }

  function weightedMedian(values,weights) {
    const arr=values.map((v,i)=>[v,weights[i]]).sort((a,b)=>a[0]-b[0]);
    const total=weights.reduce((a,b)=>a+b,0);let acc=0;
    for(const [v,w] of arr){acc+=w;if(acc>=total/2)return v;}
    return arr.at(-1)?.[0]||0;
  }

  function robustAnchor(budget,duration,metric,autoExclude=true) {
    const rows=customRows.filter(r=>r.budget===budget&&r.duration===duration&&isIncluded(r,metric,autoExclude));
    if(!rows.length) return 0;
    const vals=rows.map(r=>r[metric]);
    return weightedMedian(vals, vals.map(()=>1));
  }

  function rawAtRadius(radius,budget,duration,metric) {
    const rs=D.measuredDeliveryRadii;
    const [i,j,t]=interval(rs,radius);
    const get=r=>customRows.find(x=>x.radius===r&&x.budget===budget&&x.duration===duration)?.[metric]??0;
    return i===j?get(rs[i]):mix(get(rs[i]),get(rs[j]),t);
  }

  function durationAtAnchor(budget,duration,metric,mode,settings) {
    const get = d => mode==='raw'
      ? rawAtRadius(clamp(settings.radius,1,30),budget,d,metric)
      : robustAnchor(budget,d,metric,settings.autoExclude);
    if(duration<=1) return get(1)*Math.max(0,duration);
    if(duration<=15) return mix(get(1),get(15),(duration-1)/14);
    if(duration<=30) return mix(get(15),get(30),(duration-15)/15);
    const total30=get(30);
    const daily30=Math.max(0,(get(30)-get(15))/15);
    const x=duration-30;
    const fatigue=metric==='visits'?0.72:0.55;
    const effectiveExtra=30/fatigue*Math.log1p(fatigue*x/30);
    return total30+daily30*effectiveExtra;
  }

  function budgetAnchors(duration,metric,mode,settings) {
    return D.budgets.map(b=>({budget:b,value:durationAtAnchor(b,duration,metric,mode,settings)}));
  }

  function piecewiseBudget(budget,anchors) {
    if(budget<=0)return 0;
    if(budget<anchors[0].budget)return anchors[0].value*(budget/anchors[0].budget);
    const xs=anchors.map(x=>x.budget),[i,j,t]=interval(xs,budget);
    if(i!==j)return mix(anchors[i].value,anchors[j].value,t);
    const last=anchors.at(-1), prev=anchors.at(-2);
    if(budget<=last.budget)return last.value;
    const metricElasticity=0.52;
    const localElasticity=clamp(Math.log(Math.max(last.value,EPS)/Math.max(prev.value,EPS))/Math.log(last.budget/prev.budget),0.22,0.72);
    const elasticity=mix(metricElasticity,localElasticity,0.35);
    return last.value*Math.pow(budget/last.budget,elasticity);
  }

  function weightedPowerFit(anchors) {
    const pts=anchors.filter(x=>x.value>0);
    const weights=pts.map(x=>x.budget===50?0.45:1);
    let sw=0,sx=0,sy=0,sxx=0,sxy=0;
    pts.forEach((p,i)=>{const w=weights[i],x=Math.log(p.budget),y=Math.log(p.value);sw+=w;sx+=w*x;sy+=w*y;sxx+=w*x*x;sxy+=w*x*y;});
    const slope=clamp((sw*sxy-sx*sy)/Math.max(EPS,sw*sxx-sx*sx),0.22,1.15);
    const intercept=(sy-slope*sx)/Math.max(sw,EPS);
    return b=>b<=0?0:Math.exp(intercept)*Math.pow(b,slope);
  }

  function empiricalMetric(settings,metric) {
    const anchors=budgetAnchors(settings.budgetDuration??settings.duration,metric,settings.mode,settings);
    return piecewiseBudget(settings.budget,anchors);
  }

  function planningMetric(settings,metric) {
    const anchors=budgetAnchors(settings.duration,metric,settings.mode,settings);
    const empirical=piecewiseBudget(settings.budget,anchors);
    const fit=weightedPowerFit(anchors)(settings.budget);
    const blendWeight=settings.budget===50?0.05:0.08;
    return empirical*(1-blendWeight)+fit*blendWeight;
  }

  function ageMass(minAge,maxAge,openEnded) {
    const top=openEnded?80:maxAge;
    let sum=0;
    D.ageWeights.forEach(([a,b,w])=>{const lo=Math.max(minAge,a),hi=Math.min(top,b);if(hi>=lo)sum+=(hi-lo+1)*w;});
    return sum;
  }
  const baseAgeMass=ageMass(18,36,false);

  function audienceFactor(settings) {
    return (ageMass(settings.ageMin,settings.ageMax,settings.ageOpen)/baseAgeMass)
      * D.genderFactors[settings.gender]
      * settings.breadth;
  }

  function rawAudience(radius) {
    if(radius<=0)return [0,0];
    if(radius>=30)return [D.radiusMin[30],D.radiusMax[30]];
    const lo=Math.floor(radius),hi=Math.ceil(radius),t=radius-lo;
    return [mix(D.radiusMin[lo],D.radiusMin[hi],t),mix(D.radiusMax[lo],D.radiusMax[hi],t)];
  }

  const isoMin=pava(D.radiusMin.slice(1),D.radiusMin.slice(1).map(()=>1));
  const isoMax=pava(D.radiusMax.slice(1),D.radiusMax.slice(1).map(()=>1));
  function isotonicAudience(radius) {
    if(radius<=0)return [0,0];
    if(radius>=30)return [isoMin[29],isoMax[29]];
    const lo=Math.max(1,Math.floor(radius)),hi=Math.min(30,Math.ceil(radius)),t=radius-lo;
    return [mix(isoMin[lo-1],isoMin[hi-1],t),mix(isoMax[lo-1],isoMax[hi-1],t)];
  }
  function satValue(radius,p) { return p.A*(1-Math.exp(-Math.pow(Math.max(0,radius)/p.s,p.k))); }
  function saturationAudience(radius) {
    return [satValue(radius,D.audienceSaturation.min),satValue(radius,D.audienceSaturation.max)];
  }

  function audience(settings) {
    const base=settings.audienceCurve==='raw'?rawAudience(settings.radius):settings.audienceCurve==='isotonic'?isotonicAudience(settings.radius):saturationAudience(settings.radius);
    const f=audienceFactor(settings);
    return {min:base[0]*f,max:base[1]*f,raw:rawAudience(settings.radius).map(v=>v*f),isotonic:isotonicAudience(settings.radius).map(v=>v*f),saturation:saturationAudience(settings.radius).map(v=>v*f)};
  }

  function saturationPenalty(rawFrequency) {
    if(rawFrequency<=4)return 1;
    return 1/(1+Math.pow((rawFrequency-4)/11,0.55));
  }

  function taxes(settings,mediaSpend) {
    const feeRate=settings.paymentRoute==='ios'?0.30:0;
    const cashTaxRate=settings.taxProfile==='consumer'?0.21:settings.taxProfile==='custom'?settings.customTax/100:0;
    const accountingRate=settings.taxProfile==='business'?0.21:0;
    let preTax,media,serviceFee,cashTax,total;
    if(settings.budgetMeaning==='media') {
      media=mediaSpend;
      preTax=feeRate?media/(1-feeRate):media;
      serviceFee=preTax-media;
      cashTax=preTax*cashTaxRate;
      total=preTax+cashTax;
    } else {
      total=mediaSpend;
      preTax=total/(1+cashTaxRate);
      serviceFee=preTax*feeRate;
      media=preTax-serviceFee;
      cashTax=total-preTax;
    }
    return {feeRate,cashTaxRate,accountingRate,mediaSpend:media,serviceFee,cashTax,total,accountingVat:preTax*accountingRate,preTax};
  }

  function uncertainty(settings,frequency,mode) {
    let u=0.14;
    if(settings.budget<2)u+=0.08;
    if(settings.budget>100)u+=Math.min(0.35,0.08*Math.log10(settings.budget/100+1));
    if(settings.duration>30)u+=Math.min(0.30,0.07*Math.log10(settings.duration/30+1));
    if(settings.radius>30)u+=Math.min(0.25,0.06*Math.log10(settings.radius/30+1));
    if(mode==='raw')u+=0.08;
    if(frequency>8)u+=Math.min(0.18,(frequency-8)*0.008);
    return clamp(u,0.12,0.65);
  }

  function validate(s) {
    const errors={};
    const finite=(v)=>Number.isFinite(v);
    if(!finite(s.radius)||s.radius<0)errors.radius='Радиус должен быть числом от 0 км.';
    if(!finite(s.budget)||s.budget<0)errors.budget='Бюджет не может быть отрицательным.';
    if(!Number.isInteger(s.duration)||s.duration<1)errors.duration='Продолжительность — целое число от 1 дня.';
    if(!Number.isInteger(s.ageMin)||s.ageMin<18||s.ageMin>80)errors.ageMin='Минимальный возраст: 18–80.';
    if(!s.ageOpen&&(!Number.isInteger(s.ageMax)||s.ageMax<18||s.ageMax>80))errors.ageMax='Максимальный возраст: 18–80.';
    if(!s.ageOpen&&s.ageMin>s.ageMax)errors.ageMax='Максимальный возраст не может быть меньше минимального.';
    if(s.ageOpen&&s.ageMin>65)errors.ageMax='Для режима 65+ минимальный возраст должен быть не выше 65.';
    if(!finite(s.customTax)||s.customTax<0)errors.customTax='Ставка налога не может быть отрицательной.';
    if(s.businessOutcomes&&(!finite(s.conversionRate)||s.conversionRate<0))errors.conversionRate='Конверсия не может быть отрицательной.';
    if(s.businessOutcomes&&(!finite(s.ticketPrice)||s.ticketPrice<0))errors.ticketPrice='Цена не может быть отрицательной.';
    return errors;
  }

  function calculate(settings) {
    const errors=validate(settings);
    if(Object.keys(errors).length)return {errors,settings};
    const spendInput=settings.budget*settings.duration;
    const payment=taxes(settings,spendInput);
    const actualBudget=settings.budgetMeaning==='media'?settings.budget:payment.mediaSpend/settings.duration;
    const modelSettings={...settings,budget:actualBudget,budgetMeaning:'media',paymentRoute:'browser',taxProfile:'business'};
    const aud=audience(settings),audMid=Math.max(1,(aud.min+aud.max)/2);
    const empMin=empiricalMetric(modelSettings,'min'),empMax=empiricalMetric(modelSettings,'max'),empVisits=empiricalMetric(modelSettings,'visits');
    const planRawMin=planningMetric(modelSettings,'min'),planRawMax=planningMetric(modelSettings,'max'),planRawVisits=planningMetric(modelSettings,'visits');
    const rawFreq=((planRawMin+planRawMax)/2)/audMid;
    const sat=saturationPenalty(rawFreq);
    const planMin=planRawMin*sat, planMax=planRawMax*sat, planVisits=planRawVisits*Math.pow(sat,0.72);
    const spend=payment.mediaSpend;
    const midpoint=(planMin+planMax)/2;
    const cpmLow=spend/Math.max(planMax,1)*1000,cpmHigh=spend/Math.max(planMin,1)*1000;
    const cpv=spend/Math.max(planVisits,1);
    const freqLow=planMin/Math.max(aud.max,1),freqHigh=planMax/Math.max(aud.min,1);
    const reachLow=aud.min*(1-Math.exp(-planMin/Math.max(aud.min,1)));
    const reachHigh=aud.max*(1-Math.exp(-planMax/Math.max(aud.max,1)));
    const reachMid=(reachLow+reachHigh)/2;
    const repeatShare=clamp(1-reachMid/Math.max(midpoint,1),0,1);
    const u=uncertainty(modelSettings,(freqLow+freqHigh)/2,settings.mode);
    const exactDemo=settings.ageMin===18&&!settings.ageOpen&&settings.ageMax===36&&settings.gender==='women'&&settings.breadth===1;
    const audienceStatus=exactDemo&&Number.isInteger(settings.radius)&&settings.radius>=1&&settings.radius<=30?'measured':settings.radius<=30?'interpolated':'extrapolated';
    const deliveryStatus=D.budgets.includes(actualBudget)&&D.durations.includes(settings.duration)
      ? (settings.mode==='raw'&&D.measuredDeliveryRadii.includes(settings.radius)?'measured':'cleaned-anchor')
      : (actualBudget>100||settings.duration>30||actualBudget<2?'extrapolated':'interpolated');
    return {
      errors,settings,audience:aud,audienceStatus,deliveryStatus,actualDailyMediaBudget:actualBudget,
      empirical:{min:empMin,max:empMax,visits:empVisits},
      planning:{min:planMin,max:planMax,visits:planVisits,midpoint},
      payment,cpmLow,cpmHigh,cpv,freqLow,freqHigh,reachLow,reachHigh,repeatShare,saturationFactor:sat,uncertainty:u,
      interval:{min:planMin*(1-u),max:planMax*(1+u),visitsMin:planVisits*(1-u),visitsMax:planVisits*(1+u)}
    };
  }

  function replaceRows(rows) {
    customRows=rows.map(r=>({radius:+r.radius,budget:+r.budget,duration:+r.duration,min:+r.min,max:+r.max,visits:+r.visits}));
    if(customRows.some(r=>Object.values(r).some(v=>!Number.isFinite(v))))throw new Error('Invalid numeric data');
    clearManual();
  }

  global.MetaAdModel = {
    calculate, validate, key, autoOutliers, manual, setManual, clearManual, isIncluded,
    getRows:()=>customRows.map(x=>({...x})), replaceRows, detectOutliers,
    rawAudience,isotonicAudience,saturationAudience,audienceFactor,
    durationAtAnchor,budgetAnchors,piecewiseBudget,weightedPowerFit,saturationPenalty,
    pava, clamp
  };
})(window);
