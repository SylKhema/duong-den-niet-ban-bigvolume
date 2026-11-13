#!/usr/bin/env python3
from pathlib import Path, PurePosixPath
from lxml import etree, html
from urllib.parse import unquote, urlsplit
import argparse, hashlib, json, posixpath, re, zipfile

ROOT=Path(__file__).resolve().parents[2];WEB=ROOT/'docs/big'
norm=lambda s: re.sub(r'\s+','',s)

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--pdf',action='store_true');args=parser.parse_args()
    provenance=json.loads((WEB/'provenance.json').read_text());reports=[]
    for i in range(1,6):
        bookfile=WEB/'books'/f'{i}.json';b=json.loads(bookfile.read_text(encoding='utf-8'))
        assert hashlib.sha256(bookfile.read_bytes()).hexdigest()==provenance['volumes'][i-1]['content_sha256']
        canonical=html.fragment_fromstring(''.join(p['html'] for p in b['pages'])+b['notesHtml'],create_parent='div')
        ids=canonical.xpath('.//*[@id]/@id');assert len(ids)==len(set(ids))
        assert all(row['target'] in ids for row in b['toc'])
        offline=html.parse(str(WEB/'downloads/html'/f'tap-{i}.html'))
        off_ids=offline.xpath('//*[@id]/@id');assert len(off_ids)==len(set(off_ids))
        assert set(ids)<=set(off_ids)
        assert all(unquote(a[1:]) in off_ids for a in offline.xpath('//a[starts-with(@href,"#")]/@href'))
        assert not offline.xpath('//script[@src]|//link[@href]|//img[not(starts-with(@src,"data:"))]')
        offindex={n.get('id'):n for n in offline.xpath('//*[@id]')}
        originalindex={n.get('id'):n for n in canonical.xpath('.//*[@id]')}
        for ident,node in originalindex.items():assert norm(node.text_content())==norm(offindex[ident].text_content()),(i,ident,'offline text')
        txt=(WEB/'downloads/unicode'/f'tap-{i}.txt').read_text(encoding='utf-8')
        compact=norm(txt)
        for p in b['pages']:
            value=norm(html.fragment_fromstring(p['html'],create_parent='div').text_content())
            assert value in compact,(i,p['id'],'plain text missing')
        with zipfile.ZipFile(WEB/'downloads/epub'/f'tap-{i}.epub') as z:
            assert z.namelist()[0]=='mimetype';assert z.getinfo('mimetype').compress_type==zipfile.ZIP_STORED
            assert z.read('mimetype')==b'application/epub+zip'
            assert z.testzip() is None
            parsed={n:etree.fromstring(z.read(n)) for n in z.namelist() if n.endswith(('.xml','.opf','.xhtml','.ncx'))}
            epubindex={}
            for name,dom in parsed.items():
                if not name.endswith('.xhtml') or name.endswith('nav.xhtml'):continue
                for node in dom.xpath('//*[@id]'):
                    ident=node.get('id');assert ident not in epubindex,(i,ident,'epub duplicate')
                    epubindex[ident]=node
            assert set(ids)<=set(epubindex)
            for ident,node in originalindex.items():assert norm(node.text_content())==norm(''.join(epubindex[ident].itertext())),(i,ident,'epub text')
            checked=0
            for name,dom in parsed.items():
                for el in dom.xpath('//*[@href or @src]'):
                    link=el.get('href') or el.get('src');u=urlsplit(link)
                    if u.scheme or u.netloc:continue
                    target=posixpath.normpath(posixpath.join(posixpath.dirname(name),unquote(u.path))) if u.path else name
                    assert target in z.namelist(),(i,name,link,'missing file')
                    if u.fragment:
                        assert target in parsed
                        assert unquote(u.fragment) in parsed[target].xpath('//*[@id]/@id'),(i,name,link,'missing ID')
                    checked+=1
            opf=parsed['OEBPS/package.opf'];ns={'o':'http://www.idpf.org/2007/opf'}
            manifest={x.get('id'):x for x in opf.xpath('//o:manifest/o:item',namespaces=ns)}
            assert all(x.get('idref') in manifest for x in opf.xpath('//o:spine/o:itemref',namespaces=ns))
        expected=provenance['pdfs'][i-1]['pdfSha256'];pdf=WEB/'downloads'/f'tap-{i}.pdf'
        assert hashlib.sha256(pdf.read_bytes()).hexdigest()==expected,(i,'PDF changed')
        report={'vol':i,'source_pages':len(b['pages']),'toc_entries':len(b['toc']),'preserved_ids':len(ids),'epub_internal_links_checked':checked,'html_and_epub_text_preserved':True,'pdf_hash_matches_provenance':True}
        if args.pdf:
            import fitz
            doc=fitz.open(pdf);source=fitz.open(WEB/'sources'/f'tap-{i}-mien.pdf')
            assert len(doc)==provenance['pdfs'][i-1]['pdfPages']
            assert b['pages'][-1]['pdf']<=len(source)
            report.update(pdf_pages=len(doc),pdf_bookmarks=len(doc.get_toc()),source_pdf_pages=len(source))
        reports.append(report);print('Validated',i,flush=True)
    for fmt in ['txt','md']:
        assert len(list((WEB/'downloads/unicode').glob('*.'+fmt)))==5
    allfiles=[]
    for p in sorted([*WEB.rglob('*'), *(ROOT/'big').rglob('*')]):
        if not p.is_file() or any(x in p.parts for x in ['.git','__pycache__']):continue
        rel=p.relative_to(ROOT).as_posix()
        if rel in ('big/records/validation-exports.json','big/records/file-manifest.json'):continue
        assert p.stat().st_size<100*1024*1024,(rel,'GitHub file limit')
        allfiles.append({'path':rel,'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'git_blob_sha':hashlib.sha1(b'blob '+str(p.stat().st_size).encode()+b'\0'+p.read_bytes()).hexdigest()})
    (ROOT/'big/records/validation-exports.json').write_text(json.dumps({'volumes':reports,'all_checks_passed':True,'epubcheck_run':False,'reader_app_visual_review_performed':False,'independent_semantic_review':False},ensure_ascii=False,indent=2)+'\n')
    (ROOT/'big/records/file-manifest.json').write_text(json.dumps(allfiles,ensure_ascii=False,indent=2)+'\n')
    print('Files:',len(allfiles),'Bytes:',sum(x['bytes'] for x in allfiles),flush=True)

if __name__=='__main__':main()
