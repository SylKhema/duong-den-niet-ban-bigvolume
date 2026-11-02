#!/usr/bin/env python3
"""Generate Google SEO optimized sitemap.xml for Đường Đến Niết-bàn."""
from pathlib import Path
from xml.dom import minidom
import argparse, datetime, json, subprocess, sys
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
WEB = ROOT / 'docs'
DEFAULT_DOMAIN = 'https://nibbanagamini.org'

def get_git_lastmod(path: Path) -> str:
    """Get ISO 8601 YYYY-MM-DD date from git log, or fallback to file mtime."""
    try:
        res = subprocess.run(
            ['git', 'log', '-n', '1', '--pretty=format:%cs', '--', str(path)],
            cwd=ROOT,
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            text=True,
            check=True
        )
        date_str = res.stdout.strip()
        if date_str:
            return date_str
    except Exception:
        pass
    mtime = datetime.datetime.fromtimestamp(path.stat().st_mtime, tz=datetime.timezone.utc)
    return mtime.strftime('%Y-%m-%d')

def generate_sitemap(base_url: str = DEFAULT_DOMAIN) -> str:
    base = base_url.rstrip('/')
    catalog_file = WEB / 'catalog.json'
    catalog = json.loads(catalog_file.read_text(encoding='utf-8'))

    # Root XML element
    urlset = ET.Element('urlset', xmlns='http://www.sitemaps.org/schemas/sitemap/0.9')

    def add_url(path: str, file_path: Path, priority: str, changefreq: str):
        url_elem = ET.SubElement(urlset, 'url')
        loc = ET.SubElement(url_elem, 'loc')
        loc.text = f"{base}/{path.lstrip('/')}"
        
        lastmod = ET.SubElement(url_elem, 'lastmod')
        lastmod.text = get_git_lastmod(file_path) if file_path.exists() else datetime.date.today().isoformat()
        
        cf = ET.SubElement(url_elem, 'changefreq')
        cf.text = changefreq
        
        pri = ET.SubElement(url_elem, 'priority')
        pri.text = priority

    # 1. Homepage & Web Reader Hub (Highest Priority)
    add_url('', WEB / 'index.html', priority='1.0', changefreq='weekly')

    # 2. Complete Offline HTML Book Editions (Full Content for Crawlers)
    for b in catalog:
        vol = b['vol']
        html_file = WEB / 'downloads' / 'html' / f'tap-{vol}.html'
        add_url(f'downloads/html/tap-{vol}.html', html_file, priority='0.9', changefreq='monthly')

    # 3. Preserved PDF Editions
    for b in catalog:
        vol = b['vol']
        pdf_file = WEB / 'downloads' / f'tap-{vol}.pdf'
        add_url(f'downloads/tap-{vol}.pdf', pdf_file, priority='0.8', changefreq='monthly')

    # 4. Public Revision Errata & Feedback Lookup
    add_url('hieu-dinh.html', WEB / 'hieu-dinh.html', priority='0.7', changefreq='weekly')
    add_url('gop-y.html', WEB / 'gop-y.html', priority='0.6', changefreq='weekly')

    rough_string = ET.tostring(urlset, encoding='utf-8')
    reparsed = minidom.parseString(rough_string)
    # Return formatted XML with declaration
    return reparsed.toprettyxml(indent='  ', encoding='utf-8').decode('utf-8')

def main():
    parser = argparse.ArgumentParser(description='Generate Google SEO sitemap.xml')
    parser.add_argument('--base-url', default=DEFAULT_DOMAIN, help=f'Base canonical URL (default: {DEFAULT_DOMAIN})')
    parser.add_argument('--output', default=str(WEB / 'sitemap.xml'), help='Output sitemap.xml path')
    args = parser.parse_args()

    sitemap_xml = generate_sitemap(args.base_url)
    out_path = Path(args.output)
    out_path.write_text(sitemap_xml, encoding='utf-8')
    print(f"Generated Google SEO sitemap at {out_path} ({len(sitemap_xml)} bytes)")

if __name__ == '__main__':
    main()
