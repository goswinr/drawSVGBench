import{_ as e,a as t,c as n,f as r,h as i,i as a,l as o,n as s,r as c,s as l,u,v as d}from"./measure-BaOO9YUp.js";var f=`drawsvgbench:settings`,p=`https://github.com/goswinr/drawSVGBench`,m=()=>({lines:5e3,dataMode:`random`,style:{...o},iterations:20,warmup:5});function h(){let e=m();try{let t=localStorage.getItem(f);if(!t)return e;let n=JSON.parse(t);return{...e,...n,style:{...e.style,...n.style}}}catch{return e}}function g(e){try{localStorage.setItem(f,JSON.stringify(e))}catch{}}var _=e=>Number.isFinite(e)?e<10?e.toFixed(2):e<100?e.toFixed(1):e.toFixed(0):`–`,v=e=>e.toLocaleString(`en-US`);function y(e){let n=d(e.id),o=new URLSearchParams(location.search),f=o.has(`embed`),p=f?m():h(),y=Number(o.get(`lines`));y>0&&(p.lines=Math.min(2e5,Math.round(y))),document.title=`${n.name} · drawSVGBench`,document.documentElement.dataset.framework=e.id;let x=document.createElement(`div`);x.id=`stage-root`,x.className=`hb-stage`,document.body.append(x);let S=u,C={...p.style},w=!1;e.mount(x,C);let T=t=>{S=t,e.setData(t)},E=t=>{C=t,e.setStyle(t)};if(window.__bench={ready:!0,id:e.id,name:n.name,version:n.version,async run(r,i){w=!0;try{let a=await t(e,x,r,i);return S=a.data,C={...r.style},{framework:e.id,name:n.name,version:n.version,config:r,results:a.results,env:c()}}finally{w=!1}},check:()=>l(x,S,C)},f){document.documentElement.classList.add(`hb-embed`);return}let D=document.createElement(`aside`);D.className=`hb-panel`,D.innerHTML=b(e.id),document.body.append(D);let O=e=>D.querySelector(e),k=e=>O(`[name="${e}"]`),A=e=>O(`[data-out="${e}"]`);if(k(`lines`).value=String(p.lines),k(`lines`).value!==String(p.lines)){let e=new Option(v(p.lines),String(p.lines));k(`lines`).add(e),k(`lines`).value=String(p.lines)}k(`dataMode`).value=p.dataMode,k(`iterations`).value=String(p.iterations),k(`warmup`).value=String(p.warmup);let j=()=>{k(`colorMode`).value=C.colorMode,k(`color`).value=C.color,k(`widthMode`).value=C.widthMode,k(`width`).value=String(C.width),k(`opacity`).value=String(C.opacity),k(`linecap`).value=C.linecap,k(`dash`).value=C.dash,k(`background`).value=C.background,A(`width`).textContent=String(C.width),A(`opacity`).textContent=C.opacity.toFixed(2),k(`color`).disabled=C.colorMode!==`uniform`,k(`width`).disabled=C.widthMode!==`uniform`};j();let M=()=>{p.style={...C},g(p)},N=(e,t,n)=>{A(`op`).textContent=e,A(`lines`).textContent=v(S.length/4),A(`gen`).textContent=n===void 0?`–`:_(n),A(`script`).textContent=_(t.script),A(`render`).textContent=_(t.render),A(`total`).textContent=_(t.total),A(`pill`).textContent=`${_(t.total)} ms`},P=e=>p.dataMode===`drift`?r(S,e,innerWidth,innerHeight):i(e,innerWidth,innerHeight),F=async(e,t)=>{let n=performance.now(),r=t(),i=performance.now()-n;N(e,await a(()=>T(r)),i)},I=async(e,t)=>{let n=await a(()=>E(t));N(e,n),j(),M()},L=!1,R=0,z=0,B=0,V=e=>{if(!L)return;let t=P(p.lines),n=performance.now();if(T(t),B+=performance.now()-n,R++,e-z>=500){let t=R*1e3/(e-z);A(`fps`).textContent=t.toFixed(0),A(`ascript`).textContent=_(B/R),A(`pill`).textContent=`${t.toFixed(0)} fps`,R=0,B=0,z=e}requestAnimationFrame(V)},H=e=>{w||(L=e,O(`[data-act="animate"]`).textContent=e?`Stop`:`Animate`,O(`[data-act="animate"]`).setAttribute(`aria-pressed`,String(e)),D.classList.toggle(`hb-animating`,e),e?(R=0,B=0,z=performance.now(),requestAnimationFrame(V)):(A(`fps`).textContent=`–`,A(`ascript`).textContent=`–`))},U=e=>{if(!w)switch(e){case`update`:L||F(`update`,()=>P(p.lines));break;case`animate`:H(!L);break;case`clear`:H(!1),F(`clear`,()=>u);break;case`collapse`:D.classList.toggle(`hb-collapsed`);break;case`suite`:K();break;case`copy`:J()}};D.addEventListener(`click`,e=>{let t=e.target.closest(`[data-act]`);t&&U(t.getAttribute(`data-act`))}),D.addEventListener(`input`,e=>{let t=e.target;if(!w)switch(t.name){case`lines`:p.lines=Number(t.value),M(),L||F(`resize → ${v(p.lines)}`,()=>i(p.lines,innerWidth,innerHeight));break;case`dataMode`:p.dataMode=t.value,M();break;case`iterations`:case`warmup`:p[t.name]=Math.max(+(t.name===`iterations`),Math.round(Number(t.value)||0)),M();break;case`width`:case`opacity`:I(`style: ${t.name}`,{...C,[t.name]:Number(t.value)});break;case`colorMode`:case`color`:case`widthMode`:case`linecap`:case`dash`:case`background`:I(`style: ${t.name}`,{...C,[t.name]:t.value})}}),addEventListener(`keydown`,e=>{let t=e.target;if(e.ctrlKey||e.metaKey||e.altKey||t.closest(`input, select, textarea`))return;let n=e.key.toLowerCase();n===` `?(e.preventDefault(),U(`update`)):n===`a`?U(`animate`):n===`c`?U(`clear`):n===`h`&&U(`collapse`)});let W=0;addEventListener(`resize`,()=>{clearTimeout(W),W=window.setTimeout(()=>{!L&&!w&&S.length&&F(`viewport resize`,()=>i(S.length/4,innerWidth,innerHeight))},250)});let G=null;async function K(){H(!1);let e={counts:[p.lines],iterations:p.iterations,warmup:p.warmup,ops:s.map(e=>e.id),style:{...C}},t=O(`[data-act="suite"]`);t.disabled=!0,D.classList.add(`hb-running`),A(`progress`).hidden=!1;try{G=await window.__bench.run(e,e=>{A(`progress`).textContent=`${e.op} · ${v(e.count)} lines · ${e.iteration}/${e.iterations}`,O(`.hb-bar > i`).style.width=`${(e.fraction*100).toFixed(1)}%`}),q(G.results),A(`lines`).textContent=v(S.length/4),j()}finally{t.disabled=!1,D.classList.remove(`hb-running`),A(`progress`).hidden=!0,O(`.hb-bar > i`).style.width=`0`}}function q(e){let t=e.map(e=>`<tr>
					<th scope="row" title="${s.find(t=>t.id===e.op).help}">${e.op}${e.truncated?` <span class="hb-warn" title="Hit the time budget: ${e.samples.length} samples">${e.samples.length}×</span>`:``}</th>
					<td><strong>${_(e.total.median)}</strong></td>
					<td>${_(e.script.median)}</td>
					<td>${_(e.render.median)}</td>
					<td>${_(e.total.p95)}</td>
					<td title="${e.verifyMessage}">${e.verified?`✓`:`✗`}</td>
				</tr>`).join(``);O(`[data-out="results"]`).innerHTML=`
			<table class="hb-table">
				<caption>${v(e[0]?.count??0)} lines · median ms of ${p.iterations} runs</caption>
				<thead><tr><th scope="col">op</th><th scope="col">total</th><th scope="col">script</th><th scope="col">render</th><th scope="col">p95</th><th scope="col"><span class="hb-sr">verified</span></th></tr></thead>
				<tbody>${t}</tbody>
			</table>
			<button type="button" data-act="copy" class="hb-link">Copy JSON</button>`}async function J(){if(G)try{await navigator.clipboard.writeText(JSON.stringify(G,null,2)),O(`[data-act="copy"]`).textContent=`Copied`}catch{O(`[data-act="copy"]`).textContent=`Clipboard blocked`}}F(`create`,()=>i(p.lines,innerWidth,innerHeight)).then(()=>{let e=l(x,S,C);e.ok||console.error(`[drawSVGBench] ${n.name} rendered the wrong DOM: ${e.message}`)})}function b(t){let r=d(t),i=e.map(e=>`<a href="../${e.path}"${e.id===t?` aria-current="page"`:``}><i class="hb-swatch" data-fw="${e.id}"></i>${e.name}</a>`).join(``),a=n.map(e=>`<option value="${e}">${v(e)}</option>`).join(``);return`
	<header class="hb-head">
		<div class="hb-title">
			<i class="hb-swatch" data-fw="${r.id}"></i>
			<strong>${r.name}</strong>
			<span class="hb-ver" title="${r.version}">${r.version}</span>
		</div>
		<output class="hb-pill" data-out="pill" aria-live="off"></output>
		<button type="button" class="hb-icon" data-act="collapse" title="Show / hide panel (H)" aria-label="Show or hide panel">
			<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M3 10l5-5 5 5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
		</button>
	</header>
	<div class="hb-body">
		<nav class="hb-nav" aria-label="Frameworks">${i}</nav>
		<p class="hb-links"><a href="../">← Main page: compare all</a><a href="${p}">Source on GitHub</a></p>

		<section>
			<h2>Data</h2>
			<div class="hb-grid">
				<label>Lines <select name="lines">${a}</select></label>
				<label>New array <select name="dataMode">
					<option value="random">Fresh random</option>
					<option value="drift">Drift from previous</option>
				</select></label>
			</div>
			<div class="hb-actions">
				<button type="button" class="hb-primary" data-act="update">New array <kbd>Space</kbd></button>
				<button type="button" data-act="animate" aria-pressed="false">Animate</button>
				<button type="button" data-act="clear">Clear</button>
			</div>
		</section>

		<section>
			<h2>Style</h2>
			<div class="hb-grid">
				<label>Colour <select name="colorMode">
					<option value="uniform">Uniform</option>
					<option value="angle">Hue by angle</option>
					<option value="length">Hue by length</option>
					<option value="index">Hue by index</option>
				</select></label>
				<label>Uniform colour <input type="color" name="color"></label>
				<label>Width <select name="widthMode">
					<option value="varied">Varied, 1.5–5 px</option>
					<option value="uniform">Uniform</option>
				</select></label>
				<label>Uniform width <output data-out="width"></output><input type="range" name="width" min="0.25" max="8" step="0.25"></label>
				<label>Opacity <output data-out="opacity"></output><input type="range" name="opacity" min="0.05" max="1" step="0.05"></label>
				<label>Line cap <select name="linecap">
					<option value="butt">Butt</option>
					<option value="round">Round</option>
					<option value="square">Square</option>
				</select></label>
				<label>Dash <select name="dash">
					<option value="solid">Solid</option>
					<option value="dashed">Dashed</option>
					<option value="dotted">Dotted</option>
				</select></label>
				<label class="hb-wide">Background <select name="background">
					<option value="#0d1117">Night</option>
					<option value="#000000">Black</option>
					<option value="#f6f5f0">Paper</option>
					<option value="#ffffff">White</option>
				</select></label>
			</div>
		</section>

		<section>
			<h2>Last change</h2>
			<dl class="hb-metrics">
				<div class="hb-wide"><dt>Operation</dt><dd data-out="op">–</dd></div>
				<div><dt>Lines in DOM</dt><dd data-out="lines">–</dd></div>
				<div><dt>Generate</dt><dd><span data-out="gen">–</span> ms</dd></div>
				<div><dt>Script</dt><dd><span data-out="script">–</span> ms</dd></div>
				<div><dt>Render</dt><dd><span data-out="render">–</span> ms</dd></div>
				<div class="hb-total"><dt>Total</dt><dd><span data-out="total">–</span> ms</dd></div>
				<div><dt>Animate</dt><dd><span data-out="fps">–</span> fps · <span data-out="ascript">–</span> ms</dd></div>
			</dl>
		</section>

		<section>
			<h2>Benchmark</h2>
			<div class="hb-grid">
				<label>Iterations <input type="number" name="iterations" min="1" max="500"></label>
				<label>Warmup <input type="number" name="warmup" min="0" max="100"></label>
			</div>
			<div class="hb-actions">
				<button type="button" class="hb-primary" data-act="suite">Run suite</button>
			</div>
			<div class="hb-bar" aria-hidden="true"><i></i></div>
			<p class="hb-progress" data-out="progress" hidden></p>
			<div data-out="results"></div>
		</section>

		<p class="hb-hint"><kbd>Space</kbd> new array · <kbd>A</kbd> animate · <kbd>C</kbd> clear · <kbd>H</kbd> hide</p>
	</div>`}export{y as t};