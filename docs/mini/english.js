const languageParam=new URLSearchParams(location.search).get('lang');
const readingLanguage=['vi','en','bi'].includes(languageParam)?languageParam:
 (localStorage.getItem('mini-language')==='en'?'en':'vi');
localStorage.setItem('mini-language',readingLanguage);
const englishOnly=readingLanguage==='en';
const volumeThreeLastPage='#cuon-3/M03-body-P180';
function changeReadingLanguage(value){
 if(/^#cuon-[123456789]\/(toc|appendix(?:-pali)?)$/.test(location.hash)){location.href='?lang='+value+location.hash;return;}
 const previous=location.hash.match(/^#cuon-\d+\/(M\d+-\w+-P\d+(?:-S\d+)?)(?:-en)?$/);
 const anchor=previous?.[1];
 const next=
  /^M0[123456789]-/.test(anchor||'')||value==='vi'&&anchor?'#cuon-'+Number(anchor.slice(1,3))+'/'+anchor:
  '#cuon-1/M01-cover-P001';
 location.href='?lang='+value+next;
}
function configureReadingLanguage(){
 document.querySelectorAll('#reading-language button').forEach(button=>{
  const value=button.dataset.language;
  button.setAttribute('aria-pressed',String(value===readingLanguage));
  button.onclick=()=>{if(value!==readingLanguage)changeReadingLanguage(value);};
 });
 if(!englishOnly)return;
 document.documentElement.lang='en';
 document.title='The Way to Nibbāna — Mini Edition';
 document.querySelector('.brand').innerHTML='The Way to Nibbāna <small>MINI EDITION · 9 VOLUMES</small>';
 const labels={resume:'Continue reading',records:'About this edition',collapse:'Collapse contents',expand:'Expand contents',closeSource:'Close ✕'};
 Object.entries(labels).forEach(([id,label])=>document.getElementById(id).textContent=label);
 document.querySelector('#menu').ariaLabel='Toggle table of contents';
 document.querySelector('#tree').ariaLabel='English table of contents';
 document.querySelector('.search').firstChild.textContent='Search English / Pāli';
 document.querySelector('#search').placeholder='Search the English translation…';
 document.querySelector('#scope').hidden=true;
}
const englishVolumeData={};
function loadEnglishVolume(number){return englishVolumeData[number]??=get('data/english-M0'+number+'.json');}
function loadVolumeOneEnglish(){return loadEnglishVolume(1);}
function englishParagraphContent(paragraph, text){
 if(!paragraph.table || !text.includes(' | '))return '<p>'+esc(text)+'</p>';
 const [caption, heading, ...lines]=text.split('\n');
 const cells=line=>line.split('|').map(cell=>cell.trim());
 return materialTable({caption,headers:cells(heading),rows:lines.map(cells)});
}
function translatedParagraphs(page,translation){
 return page.paragraphs.map(p=>{
  const english='<div id="'+p.id+'-en" class="feedback-paragraph" lang="en"><div class="feedback-text">'+englishParagraphContent(p,translation.paragraphs[p.id])+'</div></div>';
  return englishOnly?english:'<div class="language-pair">'+paragraphHtml(p)+english+'</div>';
 }).join('');
}
configureReadingLanguage();

const englishCover='#cuon-1/M01-cover-P001';
function englishHasTarget(data,id){
 const page=data.pages[id.replace(/-S\d+$/u,'')];
 return Boolean(page&&(page.paragraphs[id]||data.pages[id]));
}
function englishBookNav(data){
 const n=current;
 const links=data.toc.filter(entry=>englishHasTarget(data,entry.target)).map(entry=>'<a class="level'+entry.level+'" href="#cuon-'+n+'/'+entry.target+'">'+esc(entry.printed+' · '+entry.title)+'</a>').join('');
 const indexId='M0'+n+'-index-P001';
 const active='<details open><summary>Volume '+n+' · '+esc(data.title)+'</summary><a href="#cuon-'+n+'/M0'+n+(n===4?'-front-P001':'-cover-P001')+'">Cover and front matter</a><a href="#cuon-'+n+'/toc">Table of contents</a>'+appendixLink(n)+links+(data.pages[indexId]?'<a href="#cuon-'+n+'/'+indexId+'">Alphabetical index</a>':'')+'</details>';
 const titles=['Subjects of Tranquillity Meditation — A','Subjects of Tranquillity Meditation — B','Meditation on Materiality','Meditation on Mentality','Dependent Origination — A','Dependent Origination — B','Conditional Relations According to the Paṭṭhāna','The Fourfold Characterization (Lakkhaṇādicatukka)','Insight Meditation Subjects (Vipassanākammaṭṭhāna)'];
 $('#tree').innerHTML=titles.map((title,i)=>{
  const volume=i+1;
  const sample=volume===3?'<a href="'+volumeThreeLastPage+'">Page 180 · Four postures</a>':'';
  if(volume===n)return sample?active.replace('</details>',sample+'</details>'):active;
  const hash='#cuon-'+volume;
  return '<details><summary>Volume '+volume+' · '+title+'</summary><a href="'+hash+'/M0'+volume+(volume===4?'-front-P001':'-cover-P001')+'">Cover and front matter</a><a href="'+hash+'/toc">Table of contents</a>'+appendixLink(volume)+sample+'</details>';
 }).join('');
}
function englishArticle(page,translation){
 const title=esc(translation.title);
 const locationText=page.kind==='body'?'Burmese page '+page.printed:'Volume '+current+' · '+title;
 return '<article id="'+page.id+'" data-page="'+page.id+'" data-kind="'+page.kind+'" data-printed="'+esc(page.printed)+'" data-pdf="'+page.pdf+'"><div class="sourcebar"><span>'+locationText+'</span><button data-source="'+page.kind+'" data-pdf="'+page.pdf+'">View Burmese original</button></div><h2>'+title+'</h2>'+translatedParagraphs(page,translation)+'</article>';
}
async function englishRoute(serial){
 const number=Number(location.hash.match(/^#cuon-([123456789])(?:\/|$)/)?.[1]||1);
 current=number;
 const bookCode='M0'+number;
 const data=await loadEnglishVolume(number);
 const source=book?.pages[0].id.startsWith(bookCode+'-')?book:await get('data/'+bookCode+'.json');
 if(serial!==loading)return;
 book=source;
 englishBookNav(data);
 const main=$('#main');
 const id=location.hash.split('/')[1];
 const coverage='English edition available through Burmese page '+data.bodyLast+' of Volume '+number+'.'+(data.blankSourcePages?.includes(data.bodyLast+1)?' Burmese page '+(data.bodyLast+1)+' contains only a running header.':'')+(number===9&&progresses[9].volume_complete?' The cover, front matter, complete table of contents and alphabetical index are available.':number>=8?' The cover, front matter and complete table of contents are available.':number===7?(progresses[7].toc_complete?' The complete table of contents is available.':' The cover, title page, opening verse and first page of the table of contents are available.'):number===6?' The title page and complete table of contents are available.':number===5?(data.pages['M05-index-P010']?' The front matter, complete table of contents, main text and alphabetical index are available.':' The cover, title page and first page of the contents are available.'):number===4?' The title page and complete table of contents are available.':number===1?' Main text and all seven index pages are available.':' Cover and the complete table of contents are available.')+(number===2&&data.pages['M02-index-P006']?' All six index pages are available, through Burmese page 142.':'')+(number===3&&data.pages['M03-index-P009']?' All nine index pages are available, through Burmese page 197.':'')+(number===3?' Pages 76–180 are an editorial draft. The structure of the six tables on pages 84–89 has been checked against the Burmese scans. Pages 90–180 still await a full source check.':'');
 if(number>=5&&id&&id!=='toc'&&!englishHasTarget(data,id.replace(/-en$/,''))){
  const match=id.match(/^M0[56789]-(body|front|index)-P(\d+)(?:-S\d+)?$/);
  const kind=match?.[1]||'index', page=Number(match?.[2]||1);
  main.innerHTML='<h1>Volume '+number+' · Translation pending</h1><p><a href="'+sourceUrl(kind,page,number)+'">View Burmese original</a></p>';
  window.scrollTo(0,0);
  return;
 }
 if(id==='toc'){
  main.innerHTML='<h1>Volume '+number+' · Table of contents</h1><p class="notice">'+coverage+'</p><table><thead><tr><th>Section</th><th>Page</th></tr></thead><tbody>'+data.toc.map(t=>'<tr><td>'+ (englishHasTarget(data,t.target)?'<a href="#cuon-'+number+'/'+t.target+'">'+esc(t.title)+'</a>':esc(t.title)+(number>=4?' <button type="button" data-source="body" data-pdf="'+t.pdf+'">View Burmese original</button>':' <small>· Not yet available in English</small>'))+'</td><td>'+esc(t.printed)+'</td></tr>').join('')+'</tbody></table>';
  bindSources();
  window.scrollTo(0,0);
  return;
 }
 if(location.hash==='#records'){
  main.innerHTML='<h1>About the English edition</h1><p>'+coverage+' Page numbers follow the Burmese original. The translations are editorial drafts.</p><a href="'+englishCover+'">Start reading Volume 1</a>';
  window.scrollTo(0,0);
  return;
 }
 main.innerHTML='<div class="eyebrow">Pa-Auk Tawya Sayadaw · Nibbānagāminipaṭipadā</div><h1>Volume '+number+' · '+esc(data.title)+'</h1><p class="notice">'+coverage+' <a href="#cuon-'+number+'/toc">Table of contents</a></p>'+(number===3?'<p><a href="'+volumeThreeLastPage+'">Page 180 · Four postures</a></p>':'')+source.pages.filter(p=>data.pages[p.id]).map(p=>englishArticle(p,data.pages[p.id])).join('')+'<p class="notice">You’ve reached the end of the English translation currently available for this volume.</p>'+(number<4?'<p><a href="#cuon-'+(number+1)+'/M0'+(number+1)+(number===3?'-front-P001':'-cover-P001')+'">Continue to Volume '+(number+1)+' →</a></p>':'');
 bindSources();
 const element=id&&(document.getElementById(id+'-en')||document.getElementById(id));
 if(element)element.scrollIntoView({behavior:'instant',block:'start'});
 else window.scrollTo(0,0);
 if(element)localStorage.setItem('mini-position-en',location.hash);
 const readerObserver=new IntersectionObserver(entries=>{
  for(const entry of entries)if(entry.isIntersecting)localStorage.setItem('mini-position-en','#cuon-'+number+'/'+entry.target.id);
 },{rootMargin:'-85px 0px -60% 0px'});
 main.querySelectorAll('[data-page]').forEach(page=>readerObserver.observe(page));
 obs=readerObserver;
}
async function englishSearch(){
 const query=norm($('#search').value.trim());
 if(!query){$('#results').textContent='';return;}
 const number=current;
 const data=await loadEnglishVolume(number);
 if(query!==norm($('#search').value.trim())||current!==number)return;
 const results=Object.values(data.pages).flatMap(page=>Object.entries(page.paragraphs)
  .filter(([,text])=>norm(page.title+' '+text).includes(query))
  .map(([id,text])=>'<a href="#cuon-'+number+'/'+id+'-en">'+esc(page.title)+'<small>'+esc(text.slice(0,150))+'</small></a>'));
 $('#results').innerHTML=results.slice(0,70).join('')||'No results in the English edition.';
}
