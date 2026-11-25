/* 설치한 웹앱의 창 머리 없애기 (2026-10-29 사용자: 맥북 에어 크롬 앱 창의 '맨 윗줄'을 없애 달라) — tools/build_web.py 가 web/wco.js 로 옮긴다.
   ① 앱 설명서(manifest.webmanifest)를 붙인다 — 크롬이 '진짜 앱'으로 설치하고, display_override 의 window-controls-overlay 로
      크롬의 제목 줄(← ⟳ 제목 ⋮)이 사라진다. 아이폰 · 아이패드에는 붙이지 않는다 (홈 화면 아이콘이 지금처럼 열리도록 — 로그인 창 때문).
   ② 그 모드(창 머리 없음)에서는 화면이 창 맨 위까지 올라오고, 맥의 신호등 단추(●●●)가 그 위에 뜬다.
      → 맨 윗줄(첫 <header>)이 신호등 자리에 걸리면 그만큼 비켜 놓고(왼쪽 · 오른쪽 여백), 그 줄의 빈 곳을 잡아 창을 옮길 수 있게(app-region: drag).
        맨 윗줄이 아래에 있으면(무대를 줄여 위에 빈 띠가 생긴 화면) 그 빈 띠를 창 옮기는 자리로.
   크롬 창 머리가 있을 때 · 휴대폰 · PC 프로그램 창에서는 아무것도 하지 않는다.
   시험: localhost 에서 ?wco=x,y,w,h (제목 줄 자리를 흉내, 예: ?wco=78,0,1300,32) */
(function(){
  var ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (!ios){
    var l = document.createElement('link'); l.rel = 'manifest'; l.href = 'manifest.webmanifest';
    document.head.appendChild(l);
  }
  var o = navigator.windowControlsOverlay, fake = null;
  var m = location.hostname === 'localhost' && /[?&]wco=(\d+),(\d+),(\d+),(\d+)/.exec(location.search);
  if (m) fake = {x: +m[1], y: +m[2], width: +m[3], height: +m[4]};
  if ((!o || ios) && !fake) return;
  var NODRAG = 'button,input,select,textarea,a,label,summary,[onclick],[contenteditable],[tabindex],[role=button]';
  var css = document.createElement('style');
  css.textContent = 'html.wco .wco-bar{-webkit-app-region:drag;app-region:drag}' +
    'html.wco .wco-bar :is(' + NODRAG + '){-webkit-app-region:no-drag;app-region:no-drag}' +
    '#wco-drag{position:fixed;left:0;right:0;top:0;z-index:2147483646;-webkit-app-region:drag;app-region:drag;display:none}' +
    'html.wco #wco-drag.on{display:block}';
  document.head.appendChild(css);
  function rect(){ return fake || (o.visible ? o.getTitlebarAreaRect() : null); }
  function apply(){
    var r = rect(), root = document.documentElement, h = document.querySelector('body header');
    root.classList.toggle('wco', !!r);
    var strip = document.getElementById('wco-drag');
    if (!strip && document.body){ strip = document.createElement('div'); strip.id = 'wco-drag'; document.body.appendChild(strip); }
    if (h && h.dataset.wcoPl == null){ var cs = getComputedStyle(h); h.dataset.wcoPl = cs.paddingLeft; h.dataset.wcoPr = cs.paddingRight; }
    if (h) h.style.paddingLeft = h.style.paddingRight = h.style.zoom = '';   // 원래 자리에서 다시 잰다
    if (!r){ if (h) h.classList.remove('wco-bar'); return; }
    var b = h && h.getBoundingClientRect();
    if (b && b.height && b.top < r.y + r.height){   // 맨 윗줄이 제목 줄 자리에 걸림 → 비켜 놓고 그 줄로 창 옮기기
      var k = h.offsetWidth ? b.width / h.offsetWidth : 1;   // 무대를 줄여 그린 화면이면 그 배율
      var L = Math.max(0, r.x - b.left), R = Math.max(0, b.right - (r.x + r.width));
      var z = 1;
      for (var i = 0; i < 3; i++){   // 비켜 놓아 버튼이 넘치면(원래 줄이 꽉 찬 화면) 그 줄만 조금 작게 — 70% 까지
        h.style.paddingLeft = 'calc(' + h.dataset.wcoPl + ' + ' + (L / k / z).toFixed(1) + 'px)';
        h.style.paddingRight = 'calc(' + h.dataset.wcoPr + ' + ' + (R / k / z).toFixed(1) + 'px)';
        var lo = Infinity, hi = -Infinity;   // 줄 안 단추들이 실제로 차지한 자리 (넘친 것은 scrollWidth 로 안 잡힌다)
        for (var c = h.firstElementChild; c; c = c.nextElementSibling){ var q = c.getBoundingClientRect(); if (q.width){ lo = Math.min(lo, q.left); hi = Math.max(hi, q.right); } }
        var end = Math.min(b.right, r.x + r.width) - parseFloat(h.dataset.wcoPr) * k * z;
        if (!(hi > end + 1) || z <= .7) break;
        z = Math.max(.7, z * (end - lo) / (hi - lo)); h.style.zoom = z;
      }
      h.classList.add('wco-bar');
      if (strip) strip.classList.remove('on');
    } else {   // 맨 윗줄이 아래에 있음 → 위의 빈 띠로 창 옮기기
      if (h) h.classList.remove('wco-bar');
      if (strip){ strip.style.height = Math.min(r.y + r.height, b && b.height ? b.top : r.y + r.height) + 'px'; strip.classList.add('on'); }
    }
  }
  var t = null;
  function later(){ clearTimeout(t); t = setTimeout(apply, 60); }   // 화면이 먼저 제 크기를 맞춘 뒤 (fit)
  if (o) o.addEventListener('geometrychange', later);
  addEventListener('resize', later);
  addEventListener('load', later);
  function watch(){   // 맨 윗줄이 나중에 보이거나 크기가 바뀔 때 (책장: 로그인 뒤에 머리글이 나타남)
    later();
    var h = document.querySelector('body header');
    if (h && window.ResizeObserver) new ResizeObserver(later).observe(h);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', watch); else watch();
})();
