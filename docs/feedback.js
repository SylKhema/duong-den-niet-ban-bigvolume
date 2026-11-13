'use strict';
(()=>{
const qs=s=>document.querySelector(s),rom=['I','II','III','IV','V'];
const statusNames={new:'Mới nhận',reviewing:'Đang đối chiếu',approved:'Đã duyệt bản sửa','needs-info':'Cần thêm căn cứ',resolved:'Đã sửa',unchanged:'Giữ nguyên và giải thích',duplicate:'Góp ý trùng'};
const categoryNames={typo:'Lỗi chữ hoặc trình bày',translation:'Nghi dịch sai hoặc thiếu',terminology:'Thuật ngữ khó hiểu',question:'Câu hỏi về nội dung',other:'Góp ý khác'};
let context=null,requestId=null;
function receiptId(){const b=new Uint8Array(16);crypto.getRandomValues(b);b[6]=(b[6]&15)|64;b[8]=(b[8]&63)|128;const h=Array.from(b,x=>x.toString(16).padStart(2,'0')).join('');return [h.slice(0,8),h.slice(8,12),h.slice(12,16),h.slice(16,20),h.slice(20)].join('-');}
const safe=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
document.body.insertAdjacentHTML('beforeend',`<button id="feedback-paragraph-button" class="feedback-floating" hidden>Góp ý đoạn vừa chọn</button>
<dialog id="feedback-dialog" aria-labelledby="feedback-title"><div class="feedback-dialog-head"><h2 id="feedback-title">Góp ý bản dịch</h2><button type="button" id="feedback-close">Đóng ✕</button></div>
<p>Ý kiến được lưu riêng để đối chiếu nguyên tác; không tự thay đổi nội dung sách.</p><form id="feedback-form">
<label>Tập sách<select id="feedback-volume" required>${rom.map((r,i)=>`<option value="${i+1}">Tập ${r}</option>`).join('')}</select></label>
<p id="feedback-location"></p><details><summary>Đoạn đang góp ý</summary><blockquote id="feedback-excerpt"></blockquote></details>
<label>Loại góp ý<select id="feedback-category">${Object.entries(categoryNames).map(([k,v])=>`<option value="${k}">${v}</option>`).join('')}</select></label>
<label>Ý kiến của bạn <span aria-hidden="true">*</span><textarea id="feedback-message" required minlength="5" maxlength="4000" rows="5" placeholder="Chỗ nào sai, còn nghi vấn hoặc chưa dễ hiểu?"></textarea></label>
<label>Đề nghị sửa (nếu có)<textarea id="feedback-suggestion" maxlength="4000" rows="3"></textarea></label>
<label>Nguồn đối chiếu (nếu có)<textarea id="feedback-reference" maxlength="1500" rows="2" placeholder="Tên sách, trang hoặc đường dẫn…"></textarea></label>
<div class="feedback-contact"><label>Tên (tùy chọn)<input id="feedback-name" maxlength="100" autocomplete="name"></label><label>Email (tùy chọn)<input id="feedback-email" type="email" maxlength="254" autocomplete="email"></label></div>
<label class="feedback-honeypot" aria-hidden="true">Website<input id="feedback-website" tabindex="-1" autocomplete="off"></label>
<label class="feedback-consent"><input type="checkbox" id="feedback-consent" required> Tôi đồng ý lưu ý kiến và thông tin tự cung cấp để nhóm biên tập xử lý. Có thể gửi ẩn danh; email và nội dung gửi không tự công khai.</label>
<p><a href="/gop-y.html" target="_blank" rel="noopener">Cách góp ý và quyền riêng tư</a></p><button id="feedback-submit" type="submit">Gửi góp ý</button></form>
<div id="feedback-result" role="status" aria-live="polite"></div></dialog>`);
function locationText(){qs('#feedback-location').textContent=context?`Tập ${rom[context.volume-1]} — Miến ${context.printed} — PDF nguồn ${context.pdfPage}`:'';qs('#feedback-excerpt').textContent=context?.excerpt||'Góp ý chung về tập sách.';}
async function general(v){const b=await getBook(v),p=b.pages[0];return {volume:v,anchor:p.id,printed:p.printed,pdfPage:p.pdf,excerpt:'Góp ý chung về Tập '+rom[v-1]+'. Vui lòng ghi thêm vị trí trong ý kiến nếu có.'};}
async function openForm(value){
 try{context=value||await general(typeof activeVol==='number'&&activeVol?activeVol:1);qs('#feedback-volume').value=String(context.volume);locationText();qs('#feedback-result').textContent='';qs('#feedback-form').hidden=false;requestId='GY-'+receiptId();qs('#feedback-dialog').showModal();qs('#feedback-message').focus();}catch{alert('Chưa mở được biểu mẫu. Vui lòng tải lại trang.');}
}
qs('#feedback-close').onclick=()=>qs('#feedback-dialog').close();
qs('#feedback-volume').onchange=async e=>{context=await general(Number(e.target.value));requestId='GY-'+receiptId();locationText();};
qs('#feedback-paragraph-button').onclick=()=>openForm(context);
document.addEventListener('click',e=>{
 if(e.target.closest('[data-open-feedback]')){openForm();return;}
 if(e.target.closest('a,button,input,textarea,select,summary,dialog'))return;
 const p=e.target.closest('.book-page p,.book-page li,.book-page td,.book-page th,.book-page h2,.book-page h3');
 if(!p||!activeVol||p.closest('.source-line'))return;
 const excerpt=p.textContent.trim();if(excerpt.length<3)return;
 const page=p.closest('.book-page'),pageId=page.dataset.pageId;
 let anchor=p.id||p.closest('article[id]')?.id||p.querySelector('.paragraph-anchor[id]')?.id;
 if(!anchor){let prev=p.previousElementSibling;for(let i=0;prev&&i<3;i++,prev=prev.previousElementSibling){const a=prev.matches('.paragraph-anchor[id]')?prev:prev.querySelector('.paragraph-anchor[id]');if(a){anchor=a.id;break;}}}
 const marker=page.querySelector('.source-line span')?.textContent||'',m=marker.match(/PDF nguồn\s+(\d+)/);
 context={volume:activeVol,anchor:anchor||pageId,printed:page.dataset.printed,pdfPage:Number(m?.[1]||1),excerpt:excerpt.slice(0,2400)};
 qs('#feedback-paragraph-button').hidden=false;
});
window.addEventListener('hashchange',()=>{qs('#feedback-paragraph-button').hidden=true;context=null;});
qs('#feedback-form').onsubmit=async e=>{
 e.preventDefault();const button=qs('#feedback-submit');button.disabled=true;qs('#feedback-result').textContent='Đang gửi…';
 const payload={...context,id:requestId,category:qs('#feedback-category').value,message:qs('#feedback-message').value,suggestion:qs('#feedback-suggestion').value,reference:qs('#feedback-reference').value,name:qs('#feedback-name').value,email:qs('#feedback-email').value,website:qs('#feedback-website').value,consent:qs('#feedback-consent').checked};
 try{const res=await fetch('/api/feedback',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});const data=await res.json();if(!res.ok||!data.received)throw Error(data.error||'Chưa nhận được xác nhận lưu.');
 qs('#feedback-form').hidden=true;qs('#feedback-result').innerHTML=`<h3>Đã lưu góp ý</h3><p>Mã tiếp nhận: <strong>${safe(data.id)}</strong></p><p>Xin lưu mã này để tra cứu. Trạng thái: ${statusNames[data.status]||'Mới nhận'}.</p><p><a href="/gop-y.html?id=${encodeURIComponent(data.id)}">Tra cứu trạng thái góp ý</a></p><p>Cảm ơn quý độc giả. Nội dung sẽ được đối chiếu trước khi cập nhật bản chính thức.</p>`;
 try{const history=JSON.parse(localStorage.getItem('nibbana-feedback-receipts')||'[]');history.unshift({id:data.id,at:new Date().toISOString()});localStorage.setItem('nibbana-feedback-receipts',JSON.stringify(history.slice(0,30)));}catch{}
 for(const id of ['message','suggestion','reference','name','email'])qs('#feedback-'+id).value='';qs('#feedback-consent').checked=false;
 }catch(err){qs('#feedback-result').textContent=err.message+' Nội dung vẫn được giữ trong biểu mẫu để cô/bạn thử lại.';}finally{button.disabled=false;}
};
})();
