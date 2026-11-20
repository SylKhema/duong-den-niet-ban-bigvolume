#!/usr/bin/env python3
"""
Generate Google SEO optimized sitemap.xml for Đường Đến Niết-bàn.
Defaults to GitHub Pages (/docs) canonical URLs preserving .html extensions
to match static files and internal links; pass --clean-urls to strip .html.
"""
from pathlib import Path
from xml.dom import minidom
import argparse, datetime, json, subprocess
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
WEB = ROOT / 'docs'
DEFAULT_DOMAIN = 'https://nibbanagamini.org'
MINI_EDITION_ORDER = ('VI', 'EN', 'BI')

def get_git_lastmod(path: Path) -> str:
    """Get ISO 8601 YYYY-MM-DD date from git log for clean files, or file mtime if modified."""
    try:
        status = subprocess.run(
            ['git', 'status', '--porcelain', '--', str(path)],
            cwd=ROOT,
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            text=True,
            check=True
        )
        if not status.stdout.strip():
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

def generate_sitemap(base_url: str = DEFAULT_DOMAIN, clean_urls: bool = False) -> str:
    base = base_url.rstrip('/')
    big_catalog = json.loads((WEB / 'big' / 'catalog.json').read_text(encoding='utf-8'))
    mini_manifest = json.loads((WEB / 'mini' / 'downloads' / 'manifest.json').read_text(encoding='utf-8'))

    # Root XML element
    urlset = ET.Element('urlset', xmlns='http://www.sitemaps.org/schemas/sitemap/0.9')

    def add_url(path: str, file_path: Path, priority: str, changefreq: str):
        if not file_path.exists():
            raise FileNotFoundError(f"Sitemap target missing in docs/: {file_path}")
        url_path = path.lstrip('/')
        if clean_urls and url_path.endswith('.html'):
            url_path = url_path[:-5]

        url_elem = ET.SubElement(urlset, 'url')
        loc = ET.SubElement(url_elem, 'loc')
        loc.text = f"{base}/{url_path}" if url_path else f"{base}/"

        lastmod = ET.SubElement(url_elem, 'lastmod')
        lastmod.text = get_git_lastmod(file_path)

        cf = ET.SubElement(url_elem, 'changefreq')
        cf.text = changefreq

        pri = ET.SubElement(url_elem, 'priority')
        pri.text = priority

    # 1. Homepage, Web Readers & Downloads Hub (Highest Priority)
    add_url('', WEB / 'index.html', priority='1.0', changefreq='weekly')
    add_url('big/', WEB / 'big' / 'index.html', priority='0.9', changefreq='weekly')
    add_url('mini/', WEB / 'mini' / 'index.html', priority='0.9', changefreq='weekly')
    add_url('mini/downloads/', WEB / 'mini' / 'downloads' / 'index.html', priority='0.8', changefreq='weekly')

    # 2. Complete Edition (Bộ Đại) Standalone HTML Editions (tap-1.html .. tap-5.html)
    for b in big_catalog:
        vol = b['vol']
        html_file = WEB / 'big' / 'downloads' / 'html' / f'tap-{vol}.html'
        add_url(f'big/downloads/html/tap-{vol}.html', html_file, priority='0.9', changefreq='monthly')

    # 3. Complete Edition (Bộ Đại) Preserved PDF Editions
    for b in big_catalog:
        vol = b['vol']
        pdf_file = WEB / 'big' / 'downloads' / f'tap-{vol}.pdf'
        add_url(f'big/downloads/tap-{vol}.pdf', pdf_file, priority='0.8', changefreq='monthly')

    # 4. Abridged Edition (Bộ Tóm Lược / Mini) Standalone HTML Editions (9 volumes x VI/EN/BI)
    for entry in mini_manifest['volumes']:
        vol_num = entry['volume']
        for edition in MINI_EDITION_ORDER:
            fname = f'Mini-Cuon-{vol_num:02d}-{edition}.html'
            if fname in entry['files']:
                html_file = WEB / 'mini' / 'downloads' / 'files' / fname
                add_url(f'mini/downloads/files/{fname}', html_file, priority='0.8', changefreq='monthly')

    # 5. Abridged Edition (Bộ Tóm Lược / Mini) PDF Editions (9 volumes x VI/EN/BI)
    for entry in mini_manifest['volumes']:
        vol_num = entry['volume']
        for edition in MINI_EDITION_ORDER:
            fname = f'Mini-Cuon-{vol_num:02d}-{edition}.pdf'
            if fname in entry['files']:
                pdf_file = WEB / 'mini' / 'downloads' / 'files' / fname
                add_url(f'mini/downloads/files/{fname}', pdf_file, priority='0.7', changefreq='monthly')

    # 6. Public Revision Errata & Feedback Lookup
    add_url('hieu-dinh.html', WEB / 'hieu-dinh.html', priority='0.7', changefreq='weekly')
    add_url('gop-y.html', WEB / 'gop-y.html', priority='0.6', changefreq='weekly')

    rough_string = ET.tostring(urlset, encoding='utf-8')
    reparsed = minidom.parseString(rough_string)
    return reparsed.toprettyxml(indent='  ', encoding='utf-8').decode('utf-8')

def main():
    parser = argparse.ArgumentParser(description='Generate Google SEO sitemap.xml for GitHub Pages (/docs)')
    parser.add_argument('--base-url', default=DEFAULT_DOMAIN, help=f'Base canonical URL (default: {DEFAULT_DOMAIN})')
    parser.add_argument('--output', default=str(WEB / 'sitemap.xml'), help='Output sitemap.xml path')
    parser.add_argument('--clean-urls', action='store_true', help='Strip .html extensions (e.g., for Cloudflare Pages Pretty URLs)')
    parser.add_argument('--no-clean-urls', action='store_true', help='Deprecated no-op; keeping .html is now the default for GitHub Pages')
    args = parser.parse_args()

    clean = bool(args.clean_urls) and not bool(args.no_clean_urls)
    sitemap_xml = generate_sitemap(args.base_url, clean_urls=clean)
    out_path = Path(args.output)
    out_path.write_text(sitemap_xml, encoding='utf-8')
    print(f"Generated GitHub Pages sitemap at {out_path} ({len(sitemap_xml)} bytes, clean_urls={clean})")

if __name__ == '__main__':
    main()
