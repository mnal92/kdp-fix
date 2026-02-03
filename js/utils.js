export function basename(path) {
    return path.split('/').pop();
}

export function simplifyLanguage(lang) {
    return lang.split('-').shift().toLowerCase();
}

export function sanitizeHtml(html) {
    // Basic sanitization or regex cleanup
    return html.trim();
}

export async function perfomCompression(blob) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            let width = img.width;
            let height = img.height;

            if (width > 2000 || height > 2000) {
                const ratio = Math.min(2000 / width, 2000 / height);
                width *= ratio;
                height *= ratio;
            }

            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);

            canvas.toBlob((result) => {
                const reader = new FileReader();
                reader.onload = () => resolve(new Uint8Array(reader.result));
                reader.readAsArrayBuffer(result);
            }, 'image/jpeg', 0.8);

            URL.revokeObjectURL(img.src);
        };
        img.onerror = reject;
        img.src = URL.createObjectURL(blob);
    });
}
