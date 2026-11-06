#!/usr/bin/env python3
"""Reproduce UTF-8, offline HTML and EPUB from the preserved website JSON."""
from pathlib import Path
from lxml import etree, html
import base64, copy, hashlib, json, re, shutil, zipfile
from html import escape

ROOT = Path(__file__).resolve().parents[1]
WEB = ROOT / 'docs'
OUT = WEB / 'downloads'
NS = 'http://www.w3.org/1999/xhtml'
EPUB = 'http://www.idpf.org/2007/ops'
XML = 'http://www.w3.org/XML/1998/namespace'

CSS = '''@font-face{font-family:Myanmar;src:url(../fonts/NotoSerifMyanmar-Regular.ttf)}
body{font-family:Georgia,"Times New Roman",Myanmar,serif;line-height:1.75;color:#273d34;background:#faf8f1;margin:5%}
h1,h2,h3,h4{line-height:1.4;break-after:avoid}p{margin:.8em 0}a{color:#386451}
table{border-collapse:collapse;max-width:100%;font-size:.85em}td,th{border:1px solid #cdd5c1;padding:.4em;vertical-align:top;overflow-wrap:anywhere}img{max-width:100%;height:auto}
.source-line,.metadata,.meta{font-size:.75em;color:#687264}.book-page{margin-bottom:2em;border-bottom:1px solid #dadfcf;padding-bottom:1em}
.pid,.tools,code,.paragraph-anchor{display:none}.paragraph-anchor{display:block;height:0}.notes{font-size:.88em}.notes h3{font-size:1.1em}
.noteref,sup{font-size:.7em}pre{white-space:pre-wrap;overflow-wrap:anywhere}'''

def fragment(value):
    return html.fragment_fromstring(value or '<div></div>', create_parent='div')

def text(value):
    """Preserve blocks, line breaks and table cells in plain Unicode export."""
    node=fragment(value)
    for e in node.xpath('.//script|.//style|.//*[@class="pid"]|.//*[@class="tools"]'):
        e.drop_tree()
    for e in node.iter():
        if e.tag == 'br': e.tail='\n'+(e.tail or '')
        if e.tag in ('p','div','section','article','h1','h2','h3','h4','h5','h6','li','tr','blockquote','pre','details','summary'):
            e.tail='\n\n'+(e.tail or '')
        if e.tag in ('th','td'): e.tail='\t'+(e.tail or '')
    return re.sub(r'\n[ \t]*\n(?:[ \t]*\n)+','\n\n',node.text_content()).strip()

def chunks(book):
    result=[]
    for start in range(0,len(book['pages']),20):
        pages=book['pages'][start:start+20]
        body=''.join('<div class="book-page"><p class="source-line">Tập '+book['roman']+' — Miến '+escape(str(p['printed']))+' — PDF nguồn '+str(p['pdf'])+'</p>'+p['html']+'</div>' for p in pages)
        result.append((f'part-{start//20+1:03}.xhtml',body))
    result.append(('notes.xhtml','<section class="notes" id="export-notes"><h1>Chú thích và hồ sơ</h1>'+book['notesHtml']+'</section>'))
    return result

def xhtml(title, body):
    root=etree.Element('{'+NS+'}html',nsmap={None:NS,'epub':EPUB})
    root.set('lang','vi');root.set('{'+XML+'}lang','vi')
    head=etree.SubElement(root,'{'+NS+'}head')
    etree.SubElement(head,'{'+NS+'}title').text=title
    etree.SubElement(head,'{'+NS+'}link',rel='stylesheet',type='text/css',href='style.css')
    target=etree.SubElement(root,'{'+NS+'}body')
    frag=fragment(body)
    target.text=frag.text
    for e in list(frag):
        frag.remove(e); target.append(e)
    for e in root.iter():
        if not isinstance(e.tag,str):continue
        if not e.tag.startswith('{'):e.tag='{'+NS+'}'+e.tag.lower()
        # HTML-only interaction attributes are not relevant to EPUB reading.
        for attr in list(e.attrib):
            if attr.startswith('on') or attr in ('hidden','open') or attr.startswith('data-'):
                del e.attrib[attr]
        if e.get('id') and not re.match(r'^[A-Za-z_]',e.get('id')):
            raise ValueError(('invalid id',e.get('id')))
    return root

def xmlbytes(root):
    return etree.tostring(root,encoding='utf-8',xml_declaration=True)

def make_epub(book, parts):
    title='Đường Đến Niết-bàn — Bộ Đại — Tập '+book['roman']
    idmap={}
    for name,body in parts:
        for ident in fragment(body).xpath('.//*[@id]/@id'):
            assert ident not in idmap,(book['vol'],'duplicate',ident)
            idmap[ident]=name
    payload={}
    for name,body in parts:
        dom=xhtml(title,body)
        for a in dom.xpath('//*[local-name()="a"][@href]'):
            href=a.get('href')
            if href.startswith('#'):
                assert href[1:] in idmap,(book['vol'],href)
                a.set('href',idmap[href[1:]]+href)
        for img in dom.xpath('//*[local-name()="img"][@src]'):
            if img.get('src')=='original/pdf-4.png':img.set('src','images/pdf-4.png')
        payload['OEBPS/'+name]=xmlbytes(dom)

    nav=xhtml(title,'<h1>'+escape(title)+'</h1>')
    navbody=nav.find('{'+NS+'}body')
    n=etree.SubElement(navbody,'{'+NS+'}nav');n.set('{'+EPUB+'}type','toc');n.set('id','toc')
    ol=etree.SubElement(n,'{'+NS+'}ol')
    rows=[{'title':'Đọc từ đầu','target':book['pages'][0]['id'],'depth':0}]+book['toc']+[{'title':'Chú thích và hồ sơ','target':'export-notes','depth':0}]
    stack=[(-1,ol)]
    ncx=etree.Element('ncx',nsmap={None:'http://www.daisy.org/z3986/2005/ncx/'},version='2005-1')
    head=etree.SubElement(ncx,'head');etree.SubElement(head,'meta',name='dtb:uid',content='urn:nibbana:bigvolume:'+str(book['vol']))
    etree.SubElement(etree.SubElement(ncx,'docTitle'),'text').text=title
    navmap=etree.SubElement(ncx,'navMap')
    for ix,row in enumerate(rows):
        target=row['target'];assert target in idmap
        link=idmap[target]+'#'+target;depth=max(0,int(row.get('depth',0)))
        while len(stack)>1 and stack[-1][0]>=depth:stack.pop()
        parent=stack[-1][1]
        li=etree.SubElement(parent,'{'+NS+'}li')
        anchor = etree.SubElement(li,'{'+NS+'}a',href=link)
        label_parts = row['title'].split('(như trên)')
        anchor.text = label_parts[0]
        for tail in label_parts[1:]:
            marker = etree.SubElement(anchor,'{'+NS+'}em')
            marker.text = '(như trên)'
            marker.tail = tail
        sub=etree.SubElement(li,'{'+NS+'}ol');stack.append((depth,sub))
        np=etree.SubElement(navmap,'navPoint',id=f'nav-{ix}',playOrder=str(ix+1))
        etree.SubElement(etree.SubElement(np,'navLabel'),'text').text=row['title']
        etree.SubElement(np,'content',src=link)
    for empty in list(nav.xpath('//*[local-name()="ol" and not(*)]')):empty.getparent().remove(empty)
    payload['OEBPS/nav.xhtml']=xmlbytes(nav);payload['OEBPS/toc.ncx']=xmlbytes(ncx)
    payload['OEBPS/style.css']=CSS.replace('../fonts/','fonts/').encode()
    payload['OEBPS/fonts/NotoSerifMyanmar-Regular.ttf']=(WEB/'fonts/NotoSerifMyanmar-Regular.ttf').read_bytes()
    payload['OEBPS/fonts/OFL-Noto.txt']=(WEB/'fonts/OFL-Noto.txt').read_bytes()
    if book['vol']==1:payload['OEBPS/images/pdf-4.png']=(WEB/'original/pdf-4.png').read_bytes()
    opfns='http://www.idpf.org/2007/opf';dc='http://purl.org/dc/elements/1.1/'
    package=etree.Element('{'+opfns+'}package',nsmap={None:opfns,'dc':dc},version='3.0',attrib={'unique-identifier':'book-id'})
    meta=etree.SubElement(package,'{'+opfns+'}metadata')
    for tag,val in [('identifier','urn:nibbana:bigvolume:'+str(book['vol'])),('title',title),('language','vi'),('creator','Pa-Auk Tawya Sayadaw'),('description','Bản dịch Việt ngữ; chuyển định dạng từ bản website đã lưu. Các ghi chú và nghi vấn được giữ nguyên.')]:
        e=etree.SubElement(meta,'{'+dc+'}'+tag);e.text=val
        if tag=='identifier':e.set('id','book-id')
    etree.SubElement(meta,'{'+opfns+'}meta',property='dcterms:modified').text='2026-11-01T00:00:00Z'
    manifest=etree.SubElement(package,'{'+opfns+'}manifest');spine=etree.SubElement(package,'{'+opfns+'}spine',toc='ncx')
    for ix,(name,body) in enumerate(parts):
        iid=f'part-{ix}';etree.SubElement(manifest,'{'+opfns+'}item',id=iid,href=name,attrib={'media-type':'application/xhtml+xml'})
        etree.SubElement(spine,'{'+opfns+'}itemref',idref=iid)
    for iid,href,mime in [('nav','nav.xhtml','application/xhtml+xml'),('ncx','toc.ncx','application/x-dtbncx+xml'),('css','style.css','text/css'),('font','fonts/NotoSerifMyanmar-Regular.ttf','font/ttf'),('license','fonts/OFL-Noto.txt','text/plain')]:
        attrs={'id':iid,'href':href,'media-type':mime}
        if iid=='nav':attrs['properties']='nav'
        etree.SubElement(manifest,'{'+opfns+'}item',attrib=attrs)
    if book['vol']==1:etree.SubElement(manifest,'{'+opfns+'}item',id='image-source4',href='images/pdf-4.png',attrib={'media-type':'image/png'})
    payload['OEBPS/package.opf']=xmlbytes(package)
    container=b'''<?xml version="1.0" encoding="utf-8"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/package.opf" media-type="application/oebps-package+xml"/></rootfiles></container>'''
    path=OUT/'epub'/f'tap-{book["vol"]}.epub'
    with zipfile.ZipFile(path,'w',zipfile.ZIP_DEFLATED) as z:
        z.writestr('mimetype','application/epub+zip',compress_type=zipfile.ZIP_STORED)
        z.writestr('META-INF/container.xml',container)
        for name,value in payload.items():z.writestr(name,value)
    return path

def make_html(book):
    title='Đường Đến Niết-bàn — Bộ Đại — Tập '+book['roman']
    font=base64.b64encode((WEB/'fonts/NotoSerifMyanmar-Regular.ttf').read_bytes()).decode()
    css=CSS.replace('url(../fonts/NotoSerifMyanmar-Regular.ttf)','url(data:font/ttf;base64,'+font+')')
    css+='''html{scroll-behavior:auto;scroll-padding-top:1em}body{margin:0}aside{position:fixed;inset:0 auto 0 0;width:300px;overflow:auto;padding:22px;background:#f0f0e5;border-right:1px solid #dadfcf;font:14px/1.6 system-ui}main{margin-left:300px;padding:30px 5%;max-width:1400px}.toc-row{margin:.6em 0}.toc-children{margin-left:12px;border-left:1px solid #cdd5c1;padding-left:9px}button{padding:7px;cursor:pointer}.mobile-menu{display:none}.jump{outline:2px solid #987240}#filter{width:100%;padding:9px;margin:15px 0}.book-page{overflow-wrap:anywhere}table{display:block;overflow:auto;max-width:100%}small{color:#687264}header{padding:10px 0 25px}pre{max-width:100%;overflow:auto}@media(max-width:800px){aside{z-index:10;width:min(300px,85vw)}body:not(.nav-open) aside{display:none}main{margin:0;padding:22px}.mobile-menu{display:block;position:sticky;top:0;z-index:11}}@media print{aside,.mobile-menu{display:none!important}main{margin:0;padding:0}body{background:white;color:black}p{font-size:11pt}.notes{font-size:9pt}}'''
    # Render the same hierarchy as the online table of contents.
    def tree(rows):
        root=[];stack=[(-1,root)]
        for row in rows:
            dep=max(0,int(row.get('depth',0)))
            while len(stack)>1 and stack[-1][0]>=dep:stack.pop()
            n={**row,'children':[]};stack[-1][1].append(n);stack.append((dep,n['children']))
        return root
    def render(nodes):
        result=[]
        for n in nodes:
            a='<a href="#'+escape(n['target'],quote=True)+'">'+escape(n['title']).replace('(như trên)', '<em>(như trên)</em>')+' <small>'+escape(str(n.get('printed','')))+'</small></a>'
            result.append('<div class="toc-row">'+('<details><summary>'+a+'</summary><div class="toc-children">'+render(n['children'])+'</div></details>' if n['children'] else a)+'</div>')
        return ''.join(result)
    content=''.join('<div class="book-page"><p class="source-line">Tập '+book['roman']+' — Miến '+escape(str(p['printed']))+' — PDF nguồn '+str(p['pdf'])+'</p>'+p['html']+'</div>' for p in book['pages'])
    content+='<section class="notes" id="offline-notes"><h2>Chú thích và hồ sơ</h2>'+book['notesHtml']+'</section>'
    if book['vol']==1:
        data=base64.b64encode((WEB/'original/pdf-4.png').read_bytes()).decode()
        content=content.replace('src="original/pdf-4.png"','src="data:image/png;base64,'+data+'"')
    js='''document.querySelector('.mobile-menu').onclick=()=>document.body.classList.toggle('nav-open');document.querySelector('#expand').onclick=()=>document.querySelectorAll('aside details').forEach(x=>x.open=true);document.querySelector('#collapse').onclick=()=>document.querySelectorAll('aside details').forEach(x=>x.open=false);document.querySelector('#filter').oninput=e=>{const q=e.target.value.toLocaleLowerCase('vi');document.querySelectorAll('aside .toc-row').forEach(x=>{x.style.display=x.textContent.toLocaleLowerCase('vi').includes(q)?'':'none';if(q)x.querySelectorAll('details').forEach(d=>d.open=true)})};document.addEventListener('click',e=>{const a=e.target.closest('a[href^="#"]');if(!a)return;const id=decodeURIComponent(a.getAttribute('href').slice(1)),t=document.getElementById(id);if(!t)return;e.preventDefault();for(let p=t.parentElement;p;p=p.parentElement)if(p.tagName==='DETAILS')p.open=true;t.scrollIntoView({behavior:'instant',block:'start'});history.replaceState(null,'','#'+encodeURIComponent(id));if(innerWidth<801)document.body.classList.remove('nav-open')});'''
    output='<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+escape(title)+'</title><style>'+css+'</style></head><body><button class="mobile-menu">☰ Mục lục</button><aside><h2>Tập '+book['roman']+'</h2><p>'+escape(book['title'])+'</p><input id="filter" aria-label="Lọc mục lục" placeholder="Lọc mục lục…"><button id="expand">Mở mục lục</button> <button id="collapse">Thu gọn</button><nav>'+render(tree(book['toc']))+'<p><a href="#offline-notes">Chú thích và hồ sơ</a></p></nav></aside><main><header><h1>'+escape(title)+'</h1><p>Pa-Auk Tawya Sayadaw · Bản dịch Việt ngữ</p><p>HTML ngoại tuyến: mở trực tiếp trên trình duyệt. Dùng Ctrl+F hoặc ⌘F để tìm trong toàn tập.</p></header>'+content+'</main><script>'+js+'</script></body></html>'
    path=OUT/'html'/f'tap-{book["vol"]}.html';path.write_text(output,encoding='utf-8');return path

def main():
    for fmt in ['unicode','epub','html']:(OUT/fmt).mkdir(parents=True,exist_ok=True)
    reports=[]
    for i in range(1,6):
        source=WEB/'books'/f'{i}.json';book=json.loads(source.read_text(encoding='utf-8'))
        title='Đường Đến Niết-bàn — Bộ Đại — Tập '+book['roman']
        sections=[title,'Pa-Auk Tawya Sayadaw','MỤC LỤC']
        sections += [('  '*max(0,int(row.get('depth',0))))+row['title']+' — '+str(row.get('printed','')) for row in book['toc']]
        sections+=['NỘI DUNG']
        for p in book['pages']:
            sections.extend(['Tập '+book['roman']+' — Miến '+str(p['printed'])+' — PDF nguồn '+str(p['pdf']),text(p['html'])])
        sections+=['CHÚ THÍCH VÀ HỒ SƠ',text(book['notesHtml'])]
        plain='\n\n'.join(sections)+'\n'
        txt=OUT/'unicode'/f'tap-{i}.txt';txt.write_text(plain,encoding='utf-8')
        markdown = [section.replace('(như trên)', '*(như trên)*') for section in sections]
        md=OUT/'unicode'/f'tap-{i}.md'
        md.write_text('# '+title+'\n\n> Bản Unicode UTF-8. JSON trong docs/books giữ cấu trúc, mã đoạn và liên kết đầy đủ.\n\n'+'\n\n'.join(markdown[1:])+'\n',encoding='utf-8')
        epub=make_epub(book,chunks(book));offline=make_html(book)
        reports.append({'vol':i,'source_json_sha256':hashlib.sha256(source.read_bytes()).hexdigest(),'source_page_markers':len(book['pages']),'toc_entries':len(book['toc']),'unicode_characters':len(plain),'epub_bytes':epub.stat().st_size,'offline_html_bytes':offline.stat().st_size})
        print('Exported',i,flush=True)
    (ROOT/'records/export-summary.json').write_text(json.dumps(reports,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')

if __name__=='__main__':main()
