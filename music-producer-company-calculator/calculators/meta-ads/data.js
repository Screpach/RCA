(function (global) {
  'use strict';

  const radiusMin = [0,17300,27100,79300,97400,115400,120600,130200,133800,136100,141200,150600,154900,158000,159600,164000,171500,171800,175500,180900,186400,187500,192600,196900,196500,198200,198200,199600,198300,202900,202900];
  const radiusMax = [0,20300,31900,93300,114600,135800,141800,153200,157400,160200,166100,177200,182200,185900,187800,193000,201800,202100,206400,212900,219300,220600,226500,231600,231200,233200,233100,234800,233300,238700,238700];

  const raw = {
    1: {
      2:{1:[787,2268,28],15:[20673,38394,417],30:[41347,76788,833]},
      25:{1:[15287,28391,274],15:[229316,425873,4110],30:[458632,851746,8220]},
      50:{1:[159203,295663,1953],15:[2388050,4434951,29298],30:[4776101,8869902,58597]},
      75:{1:[234063,434688,2809],15:[3510945,6520327,42131],30:[7021890,13040654,84262]},
      100:{1:[57262,106344,978],15:[858936,1595167,14664],30:[1717872,3190335,29329]}
    },
    15: {
      2:{1:[787,2268,28],15:[20673,38394,417],30:[41347,76788,833]},
      25:{1:[15287,28391,274],15:[229316,425873,4110],30:[458632,851746,8220]},
      50:{1:[159203,295663,1953],15:[2388050,4434951,29298],30:[4776101,8869902,58597]},
      75:{1:[234063,434688,2809],15:[3510945,6520327,42131],30:[7021890,13040653,84262]},
      100:{1:[57262,106344,978],15:[858936,1595167,14664],30:[1717872,3190335,29329]}
    },
    30: {
      2:{1:[767,2268,28],15:[20673,36394,417],30:[41347,76768,833]},
      25:{1:[15287,28391,274],15:[229316,425873,4110],30:[456632,851746,8220]},
      50:{1:[159203,295663,1953],15:[2388050,4434951,29298],30:[4776101,8869902,58597]},
      75:{1:[234063,434688,2809],15:[3510945,6520327,42131],30:[7021890,13040654,84262]},
      100:{1:[307580,571220,3634],15:[4613706,8568311,54506],30:[9227412,17136623,109012]}
    }
  };

  function flattenRaw(source) {
    const rows = [];
    Object.keys(source).map(Number).sort((a,b)=>a-b).forEach(radius => {
      Object.keys(source[radius]).map(Number).sort((a,b)=>a-b).forEach(budget => {
        Object.keys(source[radius][budget]).map(Number).sort((a,b)=>a-b).forEach(duration => {
          const [min,max,visits] = source[radius][budget][duration];
          rows.push({radius,budget,duration,min,max,visits});
        });
      });
    });
    return rows;
  }

  global.MetaAdData = {
    modelVersion: '3.0.0',
    dataVersion: '2026-08-01-user-measurements',
    budgets: [2,25,50,75,100],
    durations: [1,15,30],
    measuredDeliveryRadii: [1,15,30],
    radiusMin,
    radiusMax,
    raw,
    rows: flattenRaw(raw),
    ageWeights: [[18,24,1.00],[25,34,1.15],[35,44,0.72],[45,54,0.50],[55,64,0.34],[65,80,0.22]],
    genderFactors: {women:1, men:45.7/54.3, all:100/54.3},
    audienceSaturation: {
      min: {A:211402.743,s:8.378526,k:0.862818},
      max: {A:248646.342,s:8.372927,k:0.863133}
    },
    sources: [
      {name:'Agencia Tributaria — prestaciones de servicios', url:'https://sede.agenciatributaria.gob.es/Sede/iva/iva-operaciones-comercio-exterior/prestaciones-servicios.html'},
      {name:'Meta — VAT', url:'https://www.facebook.com/business/help/155641834501332'},
      {name:'Meta — Apple service fee for Instagram boosts', url:'https://www.facebook.com/help/instagram/898715828241123?locale=en_GB'},
      {name:'Meta Marketing API — estimated outcomes', url:'https://developers.facebook.com/docs/marketing-api/reference/ad-account/delivery_estimate/'}
    ]
  };
})(window);
