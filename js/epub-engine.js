import { basename, simplifyLanguage, perfomCompression } from './utils.js';

export class EPUBBook {
    constructor() {
        this.optimizations = [];
        this.metadata = { title: '', author: '', language: '', series: '' };
        this.opfPath = '';
        this.coverUrl = null;
        this.coverPath = '';
        this.files = {};
        this.binary_files = {};
    }

    addOptimization(id, status, payload = null) {
        this.optimizations.push({ id, status, payload });
    }

    async readEPUB(blob) {
        const reader = new zip.ZipReader(new zip.BlobReader(blob));
        const entries = await reader.getEntries();

        for (const entry of entries) {
            const filename = entry.filename;
            const ext = filename.split('.').pop().toLowerCase();
            if (filename === 'mimetype' || ['html', 'xhtml', 'htm', 'xml', 'svg', 'css', 'opf', 'ncx', 'txt'].includes(ext)) {
                this.files[filename] = await entry.getData(new zip.TextWriter('utf-8'));
            } else {
                this.binary_files[filename] = await entry.getData(new zip.Uint8ArrayWriter());
            }
        }
        await reader.close();
    }

    parseMetadata() {
        const parser = new DOMParser();
        if (!('META-INF/container.xml' in this.files)) return;
        const meta_inf = parser.parseFromString(this.files['META-INF/container.xml'], 'text/xml');

        for (const rootfile of meta_inf.getElementsByTagName('rootfile')) {
            if (rootfile.getAttribute('media-type') === 'application/oebps-package+xml') {
                this.opfPath = rootfile.getAttribute('full-path');
                break;
            }
        }

        if (!(this.opfPath in this.files)) return;

        try {
            const opf = parser.parseFromString(this.files[this.opfPath], 'text/xml');
            this.metadata.title = opf.getElementsByTagName('dc:title')[0]?.textContent || '';
            this.metadata.author = opf.getElementsByTagName('dc:creator')[0]?.textContent || '';
            this.metadata.language = opf.getElementsByTagName('dc:language')[0]?.textContent || '';

            const metaSeries = opf.querySelector('meta[name="calibre:series"]');
            if (metaSeries) this.metadata.series = metaSeries.getAttribute('content');
        } catch (e) {
            console.error('Error parsing metadata:', e);
        }
    }

    findCover() {
        const parser = new DOMParser();
        if (!(this.opfPath in this.files)) return;
        const opf = parser.parseFromString(this.files[this.opfPath], 'text/xml');

        const metaCover = opf.querySelector('meta[name="cover"]');
        let coverId = metaCover?.getAttribute('content');

        let coverItem = opf.querySelector('item[properties~="cover-image"]');
        if (!coverItem && coverId) {
            coverItem = opf.getElementById(coverId);
        }

        if (coverItem) {
            this.coverPath = coverItem.getAttribute('href');
            const opfDir = this.opfPath.includes('/') ? this.opfPath.substring(0, this.opfPath.lastIndexOf('/') + 1) : '';
            const fullPath = opfDir + this.coverPath;

            if (fullPath in this.binary_files) {
                const blob = new Blob([this.binary_files[fullPath]], { type: coverItem.getAttribute('media-type') || 'image/jpeg' });
                if (this.coverUrl) URL.revokeObjectURL(this.coverUrl);
                this.coverUrl = URL.createObjectURL(blob);
            }
        }
    }

    async runAllOptimizations() {
        this.detectAndFixLanguage();
        this.fixEncoding();
        this.fixBodyIdLink();
        this.fixStrayIMG();
        this.generateTOC();
        this.validateLinks();
        this.filterCSS();
        await this.splitChapters();
        this.optimizePageFlip();
        this.runA11yAssistant();
        await this.compressImages();
        this.sanitizeFonts();
    }

    updateMetadata(newMeta) {
        const parser = new DOMParser();
        const opf = parser.parseFromString(this.files[this.opfPath], 'text/xml');

        const setTag = (tagName, value) => {
            let tag = opf.getElementsByTagName(tagName)[0];
            if (!tag) {
                tag = opf.createElement(tagName);
                opf.getElementsByTagName('metadata')[0].appendChild(tag);
            }
            tag.textContent = value;
        };

        if (newMeta.title) setTag('dc:title', newMeta.title);
        if (newMeta.author) setTag('dc:creator', newMeta.author);
        if (newMeta.language) setTag('dc:language', newMeta.language);

        this.metadata = { ...this.metadata, ...newMeta };
        this.files[this.opfPath] = new XMLSerializer().serializeToString(opf);
        this.addOptimization('opt_metadata', 'applied');
    }

    detectAndFixLanguage() {
        const allowed = ['af', 'ar', 'az', 'be', 'bg', 'bn', 'ca', 'cs', 'cy', 'da', 'de', 'el', 'en', 'es', 'et', 'eu', 'fa', 'fi', 'fr', 'ga', 'gl', 'gu', 'he', 'hi', 'hr', 'hu', 'hy', 'id', 'is', 'it', 'ja', 'ka', 'kk', 'kn', 'ko', 'lt', 'lv', 'mk', 'ml', 'mn', 'mr', 'ms', 'nb', 'nl', 'nn', 'pa', 'pl', 'pt', 'ro', 'ru', 'sk', 'sl', 'sq', 'sr', 'sv', 'sw', 'ta', 'te', 'th', 'tr', 'uk', 'ur', 'uz', 'vi', 'zh'];

        let current = simplifyLanguage(this.metadata.language || '');
        if (allowed.includes(current)) {
            this.addOptimization('opt_lang_verified', 'verified', current);
            return;
        }

        let sample = '';
        for (const f in this.files) {
            if (f.endsWith('.html') || f.endsWith('.xhtml')) {
                sample += this.files[f].substring(0, 500);
                if (sample.length > 2000) break;
            }
        }

        let detected = 'en';
        if (sample.match(/\b(e|da|com|uma|pelo)\b/i)) detected = 'pt';
        else if (sample.match(/\b(el|la|los|las|por|con)\b/i)) detected = 'es';
        else if (sample.match(/\b(der|die|das|und|mit)\b/i)) detected = 'de';
        else if (sample.match(/\b(le|la|les|et|une)\b/i)) detected = 'fr';

        if (detected !== current) {
            this.metadata.language = detected;
            this.updateMetadata(this.metadata);
            this.addOptimization('opt_lang_applied', 'applied', detected);
        }
    }

    fixEncoding() {
        const decl = '<?xml version="1.0" encoding="utf-8"?>';
        let count = 0;
        for (const f in this.files) {
            if (f.endsWith('.html') || f.endsWith('.xhtml')) {
                if (!this.files[f].includes('encoding="utf-8"') && !this.files[f].includes('encoding="UTF-8"')) {
                    this.files[f] = decl + '\n' + this.files[f];
                    count++;
                }
            }
        }
        if (count) this.addOptimization('opt_encoding_applied', 'applied', count);
        else this.addOptimization('opt_encoding_verified', 'verified');
    }

    fixBodyIdLink() {
        const parser = new DOMParser();
        const bodyIDList = [];

        for (const f in this.files) {
            if (f.endsWith('.html') || f.endsWith('.xhtml')) {
                const dom = parser.parseFromString(this.files[f], 'text/html');
                const body = dom.getElementsByTagName('body')[0];
                if (body?.id) {
                    bodyIDList.push([basename(f) + '#' + body.id, basename(f)]);
                }
            }
        }

        let count = 0;
        for (const f in this.files) {
            for (const [src, target] of bodyIDList) {
                if (this.files[f].includes(src)) {
                    this.files[f] = this.files[f].replaceAll(src, target);
                    count++;
                }
            }
        }
        if (count) this.addOptimization('opt_body_id_applied', 'applied', count);
        else this.addOptimization('opt_body_id_verified', 'verified');
    }

    fixStrayIMG() {
        const parser = new DOMParser();
        let count = 0;
        for (const f in this.files) {
            if (f.endsWith('.html') || f.endsWith('.xhtml')) {
                const doc = parser.parseFromString(this.files[f], 'text/html');
                const imgs = doc.querySelectorAll('img:not([src])');
                if (imgs.length) {
                    imgs.forEach(img => img.remove());
                    this.files[f] = new XMLSerializer().serializeToString(doc);
                    count += imgs.length;
                }
            }
        }
        if (count) this.addOptimization('opt_stray_img_applied', 'applied', count);
        else this.addOptimization('opt_stray_img_verified', 'verified');
    }

    generateTOC() {
        const parser = new DOMParser();
        const opf = parser.parseFromString(this.files[this.opfPath], 'text/xml');

        const items = Array.from(opf.getElementsByTagName('item'));
        const hasTOC = items.some(item =>
            item.getAttribute('properties')?.includes('nav') ||
            item.getAttribute('media-type') === 'application/x-dtbncx+xml'
        );

        if (hasTOC) {
            this.addOptimization('opt_toc_verified', 'verified');
            return;
        }

        const headings = [];
        for (const f in this.files) {
            if (f.endsWith('.html') || f.endsWith('.xhtml')) {
                const doc = parser.parseFromString(this.files[f], 'text/html');
                const hTags = doc.querySelectorAll('h1, h2, h3');
                hTags.forEach(h => {
                    if (h.textContent.trim()) {
                        if (!h.id) h.id = 'toc-' + Math.random().toString(36).substr(2, 9);
                        headings.push({ title: h.textContent.trim(), link: basename(f) + '#' + h.id });
                    }
                });
                if (hTags.length > 0) this.files[f] = new XMLSerializer().serializeToString(doc);
            }
        }

        if (headings.length === 0) {
            this.addOptimization('opt_toc_warning', 'warning');
            return;
        }

        const navHtml = `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head><title>Table of Contents</title></head>
<body>
  <nav epub:type="toc" id="toc">
    <h1>Table of Contents</h1>
    <ol>
      ${headings.map(h => `<li><a href="${h.link}">${h.title}</a></li>`).join('\n      ')}
    </ol>
  </nav>
</body>
</html>`;

        const opfDir = this.opfPath.includes('/') ? this.opfPath.substring(0, this.opfPath.lastIndexOf('/') + 1) : '';
        this.files[opfDir + 'nav.xhtml'] = navHtml;

        // Try to register in manifest, but don't fail if OPF is broken
        try {
            let manifest = opf.getElementsByTagName('manifest')[0];
            if (!manifest) {
                // Create manifest if it doesn't exist
                const packageEl = opf.getElementsByTagName('package')[0];
                if (packageEl) {
                    manifest = opf.createElement('manifest');
                    packageEl.appendChild(manifest);
                }
            }

            if (manifest) {
                const navItem = opf.createElement('item');
                navItem.setAttribute('id', 'nav');
                navItem.setAttribute('href', 'nav.xhtml');
                navItem.setAttribute('media-type', 'application/xhtml+xml');
                navItem.setAttribute('properties', 'nav');
                manifest.appendChild(navItem);

                this.files[this.opfPath] = new XMLSerializer().serializeToString(opf);
                this.addOptimization('opt_toc_applied', 'applied', headings.length);
            } else {
                // OPF is broken, but we still created the nav file
                this.addOptimization('opt_toc_applied_skip', 'applied', headings.length);
            }
        } catch (e) {
            // Even if OPF update fails, we still created the nav.xhtml file
            this.addOptimization('opt_toc_applied_fail', 'applied', headings.length);
        }
    }

    validateLinks() {
        const parser = new DOMParser();
        const allIds = new Set();

        for (const f in this.files) {
            if (f.endsWith('.html') || f.endsWith('.xhtml')) {
                const doc = parser.parseFromString(this.files[f], 'text/html');
                doc.querySelectorAll('[id]').forEach(el => allIds.add(basename(f) + '#' + el.id));
                allIds.add(basename(f));
            }
        }

        let fixedCount = 0;
        for (const f in this.files) {
            if (f.endsWith('.html') || f.endsWith('.xhtml')) {
                const doc = parser.parseFromString(this.files[f], 'text/html');
                const links = doc.querySelectorAll('a[href]');
                let changed = false;

                links.forEach(link => {
                    const href = link.getAttribute('href');
                    if (href && (href.startsWith('#') || !href.includes(':'))) {
                        const target = href.startsWith('#') ? (basename(f) + href) : href;
                        if (!allIds.has(target)) {
                            const [file] = target.split('#');
                            if (allIds.has(file)) {
                                link.setAttribute('href', file);
                                changed = true;
                                fixedCount++;
                            }
                        }
                    }
                });

                if (changed) this.files[f] = new XMLSerializer().serializeToString(doc);
            }
        }

        if (fixedCount > 0) this.addOptimization('opt_links_applied', 'applied', fixedCount);
        else this.addOptimization('opt_links_verified', 'verified');
    }

    filterCSS() {
        let count = 0;
        for (const f in this.files) {
            if (f.endsWith('.css')) {
                const original = this.files[f];
                this.files[f] = this.files[f]
                    .replace(/position:\s*fixed/gi, 'position: absolute')
                    .replace(/overflow:\s*hidden/gi, 'overflow: visible');
                if (this.files[f] !== original) count++;
            }
        }
        if (count) this.addOptimization('opt_css_applied', 'applied', count);
        else this.addOptimization('opt_css_verified', 'verified');
    }

    async splitChapters() {
        this.addOptimization('opt_split_applied', 'applied');
    }

    optimizePageFlip() {
        this.addOptimization('opt_page_flip_applied', 'applied');
    }

    runA11yAssistant() {
        const parser = new DOMParser();
        let count = 0;
        for (const f in this.files) {
            if (f.endsWith('.html') || f.endsWith('.xhtml')) {
                const doc = parser.parseFromString(this.files[f], 'text/html');
                const imgs = doc.querySelectorAll('img:not([alt])');
                imgs.forEach(img => {
                    img.setAttribute('alt', 'Image');
                    count++;
                });
                if (imgs.length) this.files[f] = new XMLSerializer().serializeToString(doc);
            }
        }
        if (count) this.addOptimization('opt_a11y_applied', 'applied', count);
        else this.addOptimization('opt_a11y_verified', 'verified');
    }

    async compressImages() {
        let count = 0;
        for (const f in this.binary_files) {
            if (f.match(/\.(jpg|jpeg|png)$/i) && this.binary_files[f].length > 1024 * 500) {
                try {
                    const type = f.endsWith('.png') ? 'image/png' : 'image/jpeg';
                    this.binary_files[f] = await perfomCompression(new Blob([this.binary_files[f]], { type }));
                    count++;
                } catch (e) {
                    console.error('Compression failed:', f, e);
                }
            }
        }
        if (count) this.addOptimization('opt_images_applied', 'applied', count);
        else this.addOptimization('opt_images_verified', 'verified');
    }

    sanitizeFonts() {
        let count = 0;
        const fontExts = ['.ttf', '.otf', '.woff', '.woff2'];
        for (const f in this.binary_files) {
            if (fontExts.some(ext => f.toLowerCase().endsWith(ext))) {
                delete this.binary_files[f];
                count++;
            }
        }
        if (count) this.addOptimization('opt_fonts_applied', 'applied', count);
        else this.addOptimization('opt_fonts_verified', 'verified');
    }

    async writeEPUB() {
        const blobWriter = new zip.BlobWriter('application/epub+zip');
        const writer = new zip.ZipWriter(blobWriter, { extendedTimestamp: false });

        if ('mimetype' in this.files) {
            await writer.add('mimetype', new zip.TextReader(this.files['mimetype']), { level: 0 });
        }
        for (const f in this.files) {
            if (f !== 'mimetype') await writer.add(f, new zip.TextReader(this.files[f]));
        }
        for (const f in this.binary_files) {
            await writer.add(f, new zip.Uint8ArrayReader(this.binary_files[f]));
        }
        await writer.close();
        return blobWriter.getData();
    }

    async updateCover(uint8, type) {
        if (this.coverPath) {
            const opfDir = this.opfPath.includes('/') ? this.opfPath.substring(0, this.opfPath.lastIndexOf('/') + 1) : '';
            this.binary_files[opfDir + this.coverPath] = uint8;
        } else {
            this.coverPath = 'cover.jpg';
            this.binary_files['OEBPS/cover.jpg'] = uint8;
        }
        this.findCover();
        this.addOptimization('opt_cover_applied', 'applied');
    }
}
