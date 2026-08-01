(function(global){
  'use strict';
  function run(){
    const M=global.MetaAdModel;let passed=0,failed=0;const errors=[];
    const test=(name,fn)=>{try{fn();passed++;}catch(e){failed++;errors.push(`${name}: ${e.message}`);}};
    const eq=(a,b,tol=1e-6)=>{if(Math.abs(a-b)>tol)throw new Error(`${a} != ${b}`);};
    const base={radius:15,audienceCurve:'saturation',breadth:1,ageMin:18,ageMax:36,ageOpen:false,gender:'women',budget:25,duration:15,budgetMeaning:'media',mode:'robust',autoExclude:true,paymentRoute:'browser',taxProfile:'business',customTax:21};
    test('default calculation finite',()=>{const r=M.calculate(base);if(!Number.isFinite(r.planning.min)||r.planning.min<=0)throw new Error('invalid result');});
    test('budget has no upper clamp',()=>{const a=M.calculate({...base,budget:100}),b=M.calculate({...base,budget:1000});if(!(b.planning.max>a.planning.max))throw new Error('high budget did not grow');});
    test('duration has no upper clamp',()=>{const a=M.calculate({...base,duration:30}),b=M.calculate({...base,duration:1000});if(!(b.planning.max>a.planning.max))throw new Error('long duration did not grow');});
    test('radius saturation grows beyond 30',()=>{const a=M.calculate({...base,radius:30}),b=M.calculate({...base,radius:100});if(!(b.audience.max>a.audience.max))throw new Error('radius saturation did not grow');});
    test('negative budget rejected',()=>{const r=M.calculate({...base,budget:-1});if(!r.errors.budget)throw new Error('missing validation');});
    test('exact 65 differs from 65+',()=>{const a=M.calculate({...base,ageMin:65,ageMax:65,ageOpen:false}),b=M.calculate({...base,ageMin:65,ageMax:80,ageOpen:true});if(!(b.audience.max>a.audience.max))throw new Error('65+ not distinct');});
    test('iOS media gross-up',()=>{const r=M.calculate({...base,paymentRoute:'ios',taxProfile:'business'});eq(r.payment.preTax,base.budget*base.duration/0.7,1e-6);});
    test('Spanish consumer IVA',()=>{const r=M.calculate({...base,paymentRoute:'browser',taxProfile:'consumer'});eq(r.payment.cashTax,base.budget*base.duration*0.21,1e-6);});
    test('reverse charge has zero cash tax',()=>{const r=M.calculate({...base,taxProfile:'business'});eq(r.payment.cashTax,0);if(r.payment.accountingVat<=0)throw new Error('accounting VAT missing');});
    test('saturation penalty decreases after frequency 4',()=>{eq(M.saturationPenalty(4),1);if(!(M.saturationPenalty(20)<1))throw new Error('no penalty');});
    return {passed,failed,errors};
  }
  global.MetaAdTests={run};
})(window);
