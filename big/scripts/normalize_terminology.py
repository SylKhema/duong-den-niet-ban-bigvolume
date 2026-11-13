#!/usr/bin/env python3
"""Apply the editor-approved Vietnamese terminology without changing Pāli or IDs."""
import json,re,sys,collections,bisect
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
SPLIT=re.compile(r'(<[^>]+>)')
CHI=re.compile(r'\bchỉ\b',re.I)
PREFIX=re.compile(r'\b(?:tu tập|tu|thực hành|pháp hành|cỗ xe|tướng của|tướng|phần|sức|lực|đề mục|nghiệp xứ|thuần|phương diện)\s+$',re.I)
ORDINARY=re.compile(r'\s*(?:có|là|được|một|khi|cần|dẫn|dạy|bày|rõ|mục|định|đến|nói|riêng|nhờ|vì|ở|cho|trong|thấy|biết|với|đối|những|các|sinh|theo|thuyết|còn|sau|trước|bằng|tác|trên|đặt|lấy|duyên|muốn|giữ|phân|gọi|mang|gồm|chừng|khoảng|nương|chấp|phải|tìm|huy|dừng|đọc|đem|quen|khác|nhằm|lìa|cùng|rơi|đạt|an tịnh|khéo)\b',re.I)

def decide(left,right,where=''):
    if where=='1:279' and left.endswith('sự tu tập ') and right.startswith(' thành tựu'):return False
    if re.search(r'(?:thiền|an|y)\s+$',left,re.I):return False
    if re.search(r'\b(?:hữu phần|đổng lực)\s+$',left,re.I):return False
    if re.match(r'\s+để\b',right,re.I):return False
    if where=='2:454' and left.endswith('đề mục ') and right.startswith(' quán riêng'):return False
    if re.search(r'\b(?:tâm tu tập|cỗ xe|nghiệp xứ|tướng của)\s+$',left,re.I):return True
    if re.search(r'\btướng\s+$',left,re.I) and not right.startswith(' huy'):return True
    if re.search(r'\bđề mục\s+$',left,re.I) and not re.match(r'\s+đọc\b',right):return True
    if re.search(r'\bcảnh\s+$',left,re.I) and re.match(r'\s*(?:[,.;]|hoặc cảnh|như hơi thở|như tợ tướng|tương ứng|và cảnh minh sát)',right):return True
    if re.match(r'\s+đi trước\b',right):return True
    if where in ('3:127','3:360') and re.search(r'\b(?:định|tu tập)\s+$',left):return True
    if where in ('5:369','5:370') and (left.endswith('tu ') or left.endswith('Đạo định này là ')):return True
    if where=='5:535' and (left.endswith('có ') or left.endswith('ở ')):return True
    if where in ('1:404','1:405','1:406') and re.search(r'\b(?:chính|cho|của)\s+$',left):return True
    if where=='1:413' and left.endswith('tu tập '):return True
    if where=='2:463' and left.endswith('tác ý '):return True
    if where=='4:578' and left.endswith('là '):return True
    if where=='5:58' and left.endswith('phần '):return True
    if where=='5:102' and left.endswith('phần '):return True
    if where=='1:notes' and left.endswith('samatha '):return True
    if re.match(r'\s+tịnh\b',right,re.I):return True
    if re.match(r'\s*(?:[–—-]\s*quán|(?:và|,)\s*(?:quán|minh sát|tuệ quán|tu tập minh sát|tâm tu tập minh sát|tu tập quán|tâm tu tập quán))\b',right,re.I):return True
    if re.match(r'\s*\(\s*samatha',right,re.I):return True
    if re.match(r'\s+làm cỗ xe\b',right,re.I):return True
    if PREFIX.search(left) and not ORDINARY.match(right):return True
    return False

def change(value,events,where):
    edits=[]
    tags=[m.span() for m in re.finditer(r'<[^>]+>',value)]
    ends=[b for a,b in tags];starts=[a for a,b in tags];removed=[0]
    for a,b in tags:removed.append(removed[-1]+b-a)
    plain=re.sub(r'<[^>]+>','',value)
    for m in CHI.finditer(value):
        k=bisect.bisect_right(starts,m.start())-1
        if k>=0 and m.start()<tags[k][1]:continue
        pos=m.start()-removed[bisect.bisect_right(ends,m.start())]
        left=plain[max(0,pos-200):pos];right=plain[pos+len(m[0]):pos+len(m[0])+200]
        if not decide(left,right,where):continue
        new='Thiền chỉ' if m[0][0].isupper() else 'thiền chỉ'
        end=m.end();tinh=re.match(r'\s+tịnh\b',value[end:],re.I)
        if tinh:end+=tinh.end()
        edits.append((m.start(),end,new))
        events.append({'where':where,'term':'samatha','before':left[-50:]+m[0]+right[:65]})
    for a,b,new in reversed(edits):value=value[:a]+new+value[b:]
    def kam(m):
        events.append({'where':where,'term':'kammaṭṭhāna','before':value[max(0,m.start()-30):m.end()+50]})
        return 'ĐỀ MỤC' if m[0].isupper() else 'Đề mục' if m[0][0].isupper() else 'đề mục'
    return re.sub(r'\bnghiệp\s+xứ\b',kam,value,flags=re.I)

def main():
    apply='--apply' in sys.argv;events=[]
    for i in range(1,6):
        p=ROOT/f'docs/big/books/{i}.json';b=json.loads(p.read_text())
        b['title']=change(b['title'],events,f'{i}:title')
        for page in b['pages']:
            page['html']=change(page['html'],events,f'{i}:{page["printed"]}')
            if 'title' in page:page['title']=change(page['title'],events,f'{i}:{page["printed"]}')
        for row in b['toc']:row['title']=change(row['title'],events,f'{i}:toc:{row.get("printed","")}')
        b['notesHtml']=change(b['notesHtml'],events,f'{i}:notes')
        if apply:p.write_text(json.dumps(b,ensure_ascii=False,separators=(',',':'))+'\n')
    (ROOT/'big/records/terminology-changes-2026-11-01.json').write_text(json.dumps({'date':'2026-11-01','rules':{'kammaṭṭhāna':'đề mục','samatha':'thiền chỉ'},'changes':events},ensure_ascii=False,indent=2)+'\n')
    print(dict(collections.Counter((x['where'].split(':')[0]+':'+x['term']) for x in events)))
if __name__=='__main__':main()
