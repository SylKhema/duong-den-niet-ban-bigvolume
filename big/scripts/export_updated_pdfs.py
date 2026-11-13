from pathlib import Path
import json,re,html,sys,fitz
from lxml import html as LH
from reportlab.platypus import SimpleDocTemplate,Paragraph,Spacer,Flowable
from reportlab.lib.styles import getSampleStyleSheet,ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.enums import TA_LEFT
ROOT=Path(__file__).resolve().parents[2];WEB=ROOT/'docs/big'
for name,file in [('Book','DejaVuSerif.ttf'),('Book-Bold','DejaVuSerif-Bold.ttf'),('Book-Italic','DejaVuSerif-Italic.ttf'),('Book-BoldItalic','DejaVuSerif-BoldItalic.ttf')]:pdfmetrics.registerFont(TTFont(name,'/usr/share/fonts/truetype/dejavu/'+file))
pdfmetrics.registerFontFamily('Book',normal='Book',bold='Book-Bold',italic='Book-Italic',boldItalic='Book-BoldItalic')
pdfmetrics.registerFont(TTFont('Myanmar',str(WEB/'fonts/NotoSerifMyanmar-Regular.ttf')))
styles={k:ParagraphStyle(k,fontName='Book',fontSize=size,leading=size*1.5,spaceAfter=6,keepWithNext=k.startswith('h'),textColor='#263d33') for k,size in [('p',10),('h1',20),('h2',14),('h3',12),('small',8)]}
class Anchor(Flowable):
 def __init__(self,ids,toc):super().__init__();self.ids=ids;self.toc=toc;self.width=self.height=0;self.keepWithNext=True
 def draw(self):
  for k in self.ids:
   self.canv.bookmarkPage(k)
   if k in self.toc:self.canv.addOutlineEntry(self.toc[k],k,level=0,closed=False)
def escape(s):
 s=html.escape(s or '')
 return re.sub(r'[\u1000-\u109f\uaa60-\uaa7f\ua9e0-\ua9ff]+',lambda m:'<font name="Myanmar">'+m[0]+'</font>',s)
def inline(e):
 s=escape(e.text)
 for c in e:
  inner=inline(c);tag=c.tag
  if tag in ('em','i'):inner='<i>'+inner+'</i>'
  elif tag in ('b','strong'):inner='<b>'+inner+'</b>'
  elif tag=='br':inner='<br/>'
  elif tag=='sup':inner='<super>'+inner+'</super>'
  elif tag=='a' and c.get('href','').startswith('#'):inner='<link href="'+html.escape(c.get('href'),quote=True)+'" color="#386451">'+inner+'</link>'
  s+=inner+escape(c.tail)
 return s
for i in ([int(sys.argv[1])] if len(sys.argv)>1 else range(1,6)):
 b=json.loads((WEB/f'books/{i}.json').read_text());title='Đường Đến Niết-bàn — Bộ Đại — Tập '+b['roman'];toc={r['target']:r['title'] for r in b['toc']};story=[];seen=set()
 def addids(ids):
  ids=[k for k in ids if k not in seen];seen.update(ids)
  if ids:story.append(Anchor(ids,toc))
 def walk(e,notes=False):
  addids([e.get('id')] if e.get('id') else [])
  if not isinstance(e.tag,str):return
  if e.tag in ('script','style') or e.get('class') in ('pid','tools'):return
  if e.tag in ('p','h1','h2','h3','h4','h5','h6','li','tr','pre'):
   addids(e.xpath('.//*[@id]/@id'))
   content=inline(e)
   if e.tag=='tr':content=' | '.join(inline(x) for x in e if x.tag in ('td','th'))
   if content.strip():story.append(Paragraph(content,styles['small' if notes else e.tag if e.tag in styles else 'p']))
  else:
   if (e.text or '').strip():story.append(Paragraph(escape(e.text),styles['small' if notes else 'p']))
   for child in e:
    walk(child,notes)
    if (child.tail or '').strip():story.append(Paragraph(escape(child.tail),styles['small' if notes else 'p']))
 story += [Paragraph(title,styles['h1']),Paragraph('Pa-Auk Tawya Sayadaw · Bản dịch Việt ngữ',styles['p']),Paragraph('Hiệu đính thuật ngữ: kammaṭṭhāna — đề mục; samatha — thiền chỉ.',styles['small']),Paragraph('Mục lục',styles['h2'])]
 for r in b['toc']:story.append(Paragraph('<link href="#'+r['target']+'">'+escape(r['title']).replace('(như trên)','<i>(như trên)</i>')+' — '+escape(str(r.get('printed','')))+'</link>',styles['small']))
 for p in b['pages']:
  story.append(Paragraph('Tập '+b['roman']+' — Miến '+escape(str(p['printed']))+' — PDF nguồn '+str(p['pdf']),styles['small']))
  walk(LH.fragment_fromstring(p['html'],create_parent='div'))
 story.append(Paragraph('Chú thích và hồ sơ',styles['h2']));walk(LH.fragment_fromstring(b['notesHtml'],create_parent='div'),True)
 out=WEB/f'downloads/tap-{i}.pdf'
 def footer(c,d):c.setFont('Book',8);c.drawRightString(553,24,str(d.page))
 SimpleDocTemplate(str(out),pagesize=(595.28,841.89),leftMargin=42,rightMargin=42,topMargin=40,bottomMargin=40,title=title,author='Pa-Auk Tawya Sayadaw').build(story,onFirstPage=footer,onLaterPages=footer)
 d=fitz.open(out);existing={r[1]:r[2] for r in d.get_toc()};targets={r['target']:existing[r['title']] for r in b['toc'] if r['title'] in existing}
 d.set_toc([[1,r['title'],targets[r['target']]] for r in b['toc']]);d.save(str(out)+'.new',garbage=4,deflate=True);d.close();Path(str(out)+'.new').replace(out)
 print('PDF',i,'complete',flush=True)
